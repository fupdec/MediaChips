// Prototype addon (Windows): play a file with libmpv in one of two ways, to compare smoothness.
//
//   native  - mpv draws into its own child window of the Electron window (its own D3D11 swapchain),
//             like the app's player does today.
//   texture - mpv renders through its OpenGL renderer on ANGLE (D3D11 backend) into shared D3D11
//             textures; JS hands each one to Chromium with Electron's sharedTexture API and the page
//             draws it into a <canvas>, i.e. the video becomes part of the web page.
//
// libmpv and ANGLE (libEGL.dll / libGLESv2.dll, shipped next to electron.exe) are loaded at runtime,
// so this builds from the mpv headers alone.
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdio>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <napi.h>
#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_gl.h>

// ---------------------------------------------------------------------------------------------
// libmpv, loaded at runtime

#define MPV_FUNCS(X)                                                                                  \
  X(mpv_create) X(mpv_initialize) X(mpv_set_option_string) X(mpv_set_property_string)                 \
  X(mpv_command) X(mpv_observe_property) X(mpv_wait_event) X(mpv_wakeup) X(mpv_terminate_destroy)    \
  X(mpv_error_string) X(mpv_get_property_string) X(mpv_free) X(mpv_render_context_create)             \
  X(mpv_render_context_set_update_callback) X(mpv_render_context_update)                              \
  X(mpv_render_context_render) X(mpv_render_context_report_swap) X(mpv_render_context_free)

struct MpvApi {
#define DECLARE(name) decltype(&name) name = nullptr;
  MPV_FUNCS(DECLARE)
#undef DECLARE

  bool load(const std::string& path, std::string& error) {
    HMODULE lib = LoadLibraryExA(path.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!lib) {
      error = "LoadLibrary failed (" + std::to_string(GetLastError()) + "): " + path;
      return false;
    }
#define RESOLVE(fn)                                                       \
  fn = reinterpret_cast<decltype(&::fn)>(GetProcAddress(lib, #fn));       \
  if (!fn) {                                                              \
    error = "missing symbol " #fn;                                        \
    return false;                                                         \
  }
    MPV_FUNCS(RESOLVE)
#undef RESOLVE
    return true;
  }
};

// ---------------------------------------------------------------------------------------------
// The small part of EGL (+ ANGLE extensions) this file needs, declared here instead of headers.

typedef void* EGLDisplay;
typedef void* EGLConfig;
typedef void* EGLSurface;
typedef void* EGLContext;
typedef void* EGLClientBuffer;
typedef void* EGLDeviceEXT;
typedef int32_t EGLint;
typedef unsigned int EGLBoolean;
typedef unsigned int EGLenum;
typedef intptr_t EGLAttrib;

#define EGLAPI_PTR __stdcall
typedef void*(EGLAPI_PTR* PFN_eglGetProcAddress)(const char*);
typedef EGLDisplay(EGLAPI_PTR* PFN_eglGetPlatformDisplayEXT)(EGLenum, void*, const EGLint*);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglInitialize)(EGLDisplay, EGLint*, EGLint*);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglTerminate)(EGLDisplay);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglBindAPI)(EGLenum);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglChooseConfig)(EGLDisplay, const EGLint*, EGLConfig*, EGLint, EGLint*);
typedef EGLContext(EGLAPI_PTR* PFN_eglCreateContext)(EGLDisplay, EGLConfig, EGLContext, const EGLint*);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglDestroyContext)(EGLDisplay, EGLContext);
typedef EGLSurface(EGLAPI_PTR* PFN_eglCreatePbufferFromClientBuffer)(EGLDisplay, EGLenum, EGLClientBuffer, EGLConfig, const EGLint*);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglDestroySurface)(EGLDisplay, EGLSurface);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglMakeCurrent)(EGLDisplay, EGLSurface, EGLSurface, EGLContext);
typedef EGLint(EGLAPI_PTR* PFN_eglGetError)();
typedef EGLBoolean(EGLAPI_PTR* PFN_eglQueryDisplayAttribEXT)(EGLDisplay, EGLint, EGLAttrib*);
typedef EGLBoolean(EGLAPI_PTR* PFN_eglQueryDeviceAttribEXT)(EGLDeviceEXT, EGLint, EGLAttrib*);
typedef void(EGLAPI_PTR* PFN_glFinish)();

static const EGLint EGL_NONE_ = 0x3038;
static const EGLint EGL_RED_SIZE_ = 0x3024, EGL_GREEN_SIZE_ = 0x3023, EGL_BLUE_SIZE_ = 0x3022, EGL_ALPHA_SIZE_ = 0x3021;
static const EGLint EGL_SURFACE_TYPE_ = 0x3033, EGL_PBUFFER_BIT_ = 0x0001;
static const EGLint EGL_RENDERABLE_TYPE_ = 0x3040, EGL_OPENGL_ES2_BIT_ = 0x0004;
static const EGLint EGL_CONTEXT_CLIENT_VERSION_ = 0x3098;
static const EGLint EGL_WIDTH_ = 0x3057, EGL_HEIGHT_ = 0x3056;
static const EGLenum EGL_OPENGL_ES_API_ = 0x30A0;
static const EGLenum EGL_PLATFORM_ANGLE_ANGLE_ = 0x3202;
static const EGLint EGL_PLATFORM_ANGLE_TYPE_ANGLE_ = 0x3203;
static const EGLint EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE_ = 0x3208;
static const EGLenum EGL_D3D_TEXTURE_ANGLE_ = 0x33A3;
static const EGLint EGL_DEVICE_EXT_ = 0x322C;
static const EGLint EGL_D3D11_DEVICE_ANGLE_ = 0x33A1;

struct Angle {
  HMODULE gles = nullptr, egl = nullptr;
  PFN_eglGetProcAddress GetProcAddress_ = nullptr;
  PFN_eglGetPlatformDisplayEXT GetPlatformDisplayEXT = nullptr;
  PFN_eglInitialize Initialize = nullptr;
  PFN_eglTerminate Terminate = nullptr;
  PFN_eglBindAPI BindAPI = nullptr;
  PFN_eglChooseConfig ChooseConfig = nullptr;
  PFN_eglCreateContext CreateContext = nullptr;
  PFN_eglDestroyContext DestroyContext = nullptr;
  PFN_eglCreatePbufferFromClientBuffer CreatePbufferFromClientBuffer = nullptr;
  PFN_eglDestroySurface DestroySurface = nullptr;
  PFN_eglMakeCurrent MakeCurrent = nullptr;
  PFN_eglGetError GetError = nullptr;
  PFN_eglQueryDisplayAttribEXT QueryDisplayAttribEXT = nullptr;
  PFN_eglQueryDeviceAttribEXT QueryDeviceAttribEXT = nullptr;
  PFN_glFinish Finish = nullptr;

  bool load(const std::string& dir, std::string& error) {
    // libEGL.dll forwards to libGLESv2.dll from the same folder; load both by full path.
    gles = LoadLibraryExA((dir + "\\libGLESv2.dll").c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
    egl = LoadLibraryExA((dir + "\\libEGL.dll").c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!gles || !egl) {
      error = "could not load ANGLE (libEGL.dll / libGLESv2.dll) from " + dir;
      return false;
    }
    GetProcAddress_ = reinterpret_cast<PFN_eglGetProcAddress>(::GetProcAddress(egl, "eglGetProcAddress"));
    if (!GetProcAddress_) {
      error = "eglGetProcAddress missing";
      return false;
    }
#define EGL_FN(field, name)                                                         \
  field = reinterpret_cast<decltype(field)>(Proc(name));                            \
  if (!field) {                                                                     \
    error = std::string("missing ") + name;                                         \
    return false;                                                                   \
  }
    EGL_FN(GetPlatformDisplayEXT, "eglGetPlatformDisplayEXT")
    EGL_FN(Initialize, "eglInitialize")
    EGL_FN(Terminate, "eglTerminate")
    EGL_FN(BindAPI, "eglBindAPI")
    EGL_FN(ChooseConfig, "eglChooseConfig")
    EGL_FN(CreateContext, "eglCreateContext")
    EGL_FN(DestroyContext, "eglDestroyContext")
    EGL_FN(CreatePbufferFromClientBuffer, "eglCreatePbufferFromClientBuffer")
    EGL_FN(DestroySurface, "eglDestroySurface")
    EGL_FN(MakeCurrent, "eglMakeCurrent")
    EGL_FN(GetError, "eglGetError")
    EGL_FN(QueryDisplayAttribEXT, "eglQueryDisplayAttribEXT")
    EGL_FN(QueryDeviceAttribEXT, "eglQueryDeviceAttribEXT")
    EGL_FN(Finish, "glFinish")
#undef EGL_FN
    return true;
  }

  // EGL entry points come from libEGL, GL ones from eglGetProcAddress or libGLESv2's exports.
  void* Proc(const char* name) const {
    if (void* p = reinterpret_cast<void*>(::GetProcAddress(egl, name))) return p;
    if (void* p = GetProcAddress_(name)) return p;
    return reinterpret_cast<void*>(::GetProcAddress(gles, name));
  }
};

static void* GetGlProc(void* ctx, const char* name) { return static_cast<Angle*>(ctx)->Proc(name); }

// ---------------------------------------------------------------------------------------------

static const wchar_t* kHostClass = L"MediaChipsMpvCompareHost";

static LRESULT CALLBACK HostProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_ERASEBKGND:
      return 1;
    case WM_SIZE: {
      HWND child = GetWindow(hwnd, GW_CHILD);  // mpv's own window inside the host
      if (child) MoveWindow(child, 0, 0, LOWORD(lParam), HIWORD(lParam), TRUE);
      return 0;
    }
    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

static std::string JsonEscape(const char* text) {
  std::string out;
  for (const char* p = text; *p; ++p) {
    unsigned char c = static_cast<unsigned char>(*p);
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out;
}

static double NowMs() {
  using namespace std::chrono;
  return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

struct SharedTex {
  int id = 0;
  int w = 0, h = 0;
  ID3D11Texture2D* texture = nullptr;
  HANDLE handle = nullptr;  // NT handle, handed to JS for every frame rendered into it
  EGLSurface surface = nullptr;
};

struct FrameInfo {
  int id, w, h;
  HANDLE handle;
  double renderMs;  // mpv_render_context_render: includes mpv waiting for the frame's display time
  double gpuMs;     // glFinish: the GPU work of the frame
  uint64_t frame;
};

class MpvCompare : public Napi::ObjectWrap<MpvCompare> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "MpvCompare", {
      InstanceMethod("setRect", &MpvCompare::SetRect),
      InstanceMethod("setSize", &MpvCompare::SetSize),
      InstanceMethod("releaseTexture", &MpvCompare::ReleaseTexture),
      InstanceMethod("command", &MpvCompare::Command),
      InstanceMethod("setProperty", &MpvCompare::SetProperty),
      InstanceMethod("getProperty", &MpvCompare::GetProperty),
      InstanceMethod("observe", &MpvCompare::Observe),
      InstanceMethod("destroy", &MpvCompare::Destroy),
    });
    exports.Set("MpvCompare", ctor);
    return exports;
  }

  // new MpvCompare({mode: 'native'|'texture', libmpv, hwnd?: Buffer, angleDir?, flipY?, onEvent, onFrame?})
  MpvCompare(const Napi::CallbackInfo& info) : Napi::ObjectWrap<MpvCompare>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
      Napi::TypeError::New(env, "MpvCompare(options)").ThrowAsJavaScriptException();
      return;
    }
    Napi::Object opts = info[0].As<Napi::Object>();
    texture_ = opts.Get("mode").ToString().Utf8Value() == "texture";
    flipY_ = opts.Has("flipY") && opts.Get("flipY").ToBoolean().Value();  // ANGLE pbuffers are already top-down

    std::string error;
    if (!api_.load(opts.Get("libmpv").ToString().Utf8Value(), error)) {
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return;
    }

    events_ = Napi::ThreadSafeFunction::New(env, opts.Get("onEvent").As<Napi::Function>(), "mpv-events", 0, 1);
    eventsReady_ = true;

    handle_ = api_.mpv_create();
    if (!handle_) {
      Napi::Error::New(env, "mpv_create failed").ThrowAsJavaScriptException();
      return;
    }
    api_.mpv_set_option_string(handle_, "hwdec", "auto-safe");
    api_.mpv_set_option_string(handle_, "keep-open", "yes");
    api_.mpv_set_option_string(handle_, "idle", "yes");
    api_.mpv_set_option_string(handle_, "input-default-bindings", "no");
    api_.mpv_set_option_string(handle_, "input-vo-keyboard", "no");
    api_.mpv_set_option_string(handle_, "osc", "no");
    if (opts.Has("logFile") && opts.Get("logFile").IsString()) {
      api_.mpv_set_option_string(handle_, "log-file", opts.Get("logFile").ToString().Utf8Value().c_str());
    }

    if (texture_) {
      api_.mpv_set_option_string(handle_, "vo", "libmpv");
      if (!angle_.load(opts.Get("angleDir").ToString().Utf8Value(), error)) {
        Napi::Error::New(env, error).ThrowAsJavaScriptException();
        return;
      }
      frames_ = Napi::ThreadSafeFunction::New(env, opts.Get("onFrame").As<Napi::Function>(), "mpv-frames", 0, 1);
      framesReady_ = true;
    } else {
      auto buffer = opts.Get("hwnd").As<Napi::Buffer<uint8_t>>();
      HWND parent = *reinterpret_cast<HWND*>(buffer.Data());
      WNDCLASSEXW wc = {};
      wc.cbSize = sizeof(wc);
      wc.lpfnWndProc = HostProc;
      wc.hInstance = GetModuleHandleW(nullptr);
      wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
      wc.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
      wc.lpszClassName = kHostClass;
      RegisterClassExW(&wc);  // fails harmlessly when already registered
      host_ = CreateWindowExW(0, kHostClass, L"mpv", WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS, 0, 0, 16, 16,
                              parent, nullptr, GetModuleHandleW(nullptr), nullptr);
      if (!host_) {
        Napi::Error::New(env, "CreateWindowEx failed").ThrowAsJavaScriptException();
        return;
      }
      api_.mpv_set_option_string(handle_, "wid", std::to_string(reinterpret_cast<intptr_t>(host_)).c_str());
    }

    int status = api_.mpv_initialize(handle_);
    if (status < 0) {
      Napi::Error::New(env, std::string("mpv_initialize: ") + api_.mpv_error_string(status)).ThrowAsJavaScriptException();
      return;
    }

    alive_ = std::make_shared<std::atomic<bool>>(true);
    eventThread_ = std::thread([this, alive = alive_]() { EventLoop(alive); });
    if (texture_) {
      renderThread_ = std::thread([this]() { RenderLoop(); });
      // The render context must exist before a file is loaded, or mpv's libmpv VO fails to open.
      std::unique_lock<std::mutex> lock(mutex_);
      if (!cv_.wait_for(lock, std::chrono::seconds(10), [this] { return initDone_; }) || !initOk_) {
        std::string reason = initError_.empty() ? "render thread did not start" : initError_;
        lock.unlock();
        Teardown();
        Napi::Error::New(env, "texture mode: " + reason).ThrowAsJavaScriptException();
        return;
      }
    }
  }

  ~MpvCompare() { Teardown(); }

 private:
  // ---- JS API -------------------------------------------------------------------------------

  // setRect(x, y, w, h) in physical pixels of the window's client area (native mode).
  Napi::Value SetRect(const Napi::CallbackInfo& info) {
    if (host_ && info.Length() >= 4) {
      int x = info[0].ToNumber().Int32Value(), y = info[1].ToNumber().Int32Value();
      int w = info[2].ToNumber().Int32Value(), h = info[3].ToNumber().Int32Value();
      SetWindowPos(host_, HWND_TOP, x, y, w, h, SWP_NOACTIVATE | (w > 0 && h > 0 ? SWP_SHOWWINDOW : SWP_HIDEWINDOW));
    }
    return info.Env().Undefined();
  }

  // setSize(w, h): size of the textures mpv renders into (texture mode), in device pixels.
  Napi::Value SetSize(const Napi::CallbackInfo& info) {
    if (info.Length() >= 2) {
      std::lock_guard<std::mutex> lock(mutex_);
      targetW_ = std::max(16, info[0].ToNumber().Int32Value());
      targetH_ = std::max(16, info[1].ToNumber().Int32Value());
      needRender_ = true;  // redraw the current frame at the new size
    }
    cv_.notify_all();
    return info.Env().Undefined();
  }

  // releaseTexture(id): Chromium no longer uses the texture; mpv may render into it again.
  Napi::Value ReleaseTexture(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1) {
      std::lock_guard<std::mutex> lock(mutex_);
      released_.push_back(info[0].ToNumber().Int32Value());
    }
    cv_.notify_all();
    return info.Env().Undefined();
  }

  Napi::Value Command(const Napi::CallbackInfo& info) {
    if (!handle_ || info.Length() < 1 || !info[0].IsArray()) return info.Env().Undefined();
    Napi::Array array = info[0].As<Napi::Array>();
    std::vector<std::string> storage;
    for (uint32_t i = 0; i < array.Length(); i++) storage.push_back(array.Get(i).ToString().Utf8Value());
    std::vector<const char*> args;
    for (auto& s : storage) args.push_back(s.c_str());
    args.push_back(nullptr);
    return Napi::Number::New(info.Env(), api_.mpv_command(handle_, args.data()));
  }

  Napi::Value SetProperty(const Napi::CallbackInfo& info) {
    if (!handle_ || info.Length() < 2) return info.Env().Undefined();
    return Napi::Number::New(info.Env(), api_.mpv_set_property_string(
        handle_, info[0].ToString().Utf8Value().c_str(), info[1].ToString().Utf8Value().c_str()));
  }

  Napi::Value GetProperty(const Napi::CallbackInfo& info) {
    if (!handle_ || info.Length() < 1) return info.Env().Null();
    char* value = api_.mpv_get_property_string(handle_, info[0].ToString().Utf8Value().c_str());
    if (!value) return info.Env().Null();
    Napi::String result = Napi::String::New(info.Env(), value);
    api_.mpv_free(value);
    return result;
  }

  Napi::Value Observe(const Napi::CallbackInfo& info) {
    if (!handle_ || info.Length() < 1) return info.Env().Undefined();
    api_.mpv_observe_property(handle_, 0, info[0].ToString().Utf8Value().c_str(), MPV_FORMAT_STRING);
    return info.Env().Undefined();
  }

  Napi::Value Destroy(const Napi::CallbackInfo& info) {
    Teardown();
    return info.Env().Undefined();
  }

  // ---- events -------------------------------------------------------------------------------

  void Emit(const std::string& json) {
    std::lock_guard<std::mutex> lock(tsfnMutex_);
    if (!eventsReady_) return;
    auto* text = new std::string(json);
    if (events_.NonBlockingCall(text, [](Napi::Env env, Napi::Function cb, std::string* data) {
          cb.Call({Napi::String::New(env, *data)});
          delete data;
        }) != napi_ok) {
      delete text;
    }
  }

  void EventLoop(std::shared_ptr<std::atomic<bool>> alive) {
    while (alive->load()) {
      mpv_event* event = api_.mpv_wait_event(handle_, 1.0);
      if (!event || event->event_id == MPV_EVENT_NONE) continue;
      std::string json;
      switch (event->event_id) {
        case MPV_EVENT_PROPERTY_CHANGE: {
          auto* prop = static_cast<mpv_event_property*>(event->data);
          json = std::string("{\"event\":\"property-change\",\"name\":\"") + JsonEscape(prop->name) + "\",\"data\":";
          if (prop->format == MPV_FORMAT_STRING && prop->data && *static_cast<char**>(prop->data)) {
            json += "\"" + JsonEscape(*static_cast<char**>(prop->data)) + "\"";
          } else {
            json += "null";
          }
          json += "}";
          break;
        }
        case MPV_EVENT_FILE_LOADED: json = "{\"event\":\"file-loaded\"}"; break;
        case MPV_EVENT_END_FILE: {
          auto* end = static_cast<mpv_event_end_file*>(event->data);
          json = "{\"event\":\"end-file\",\"reason\":" + std::to_string(static_cast<int>(end->reason));
          if (end->error < 0) json += std::string(",\"error\":\"") + JsonEscape(api_.mpv_error_string(end->error)) + "\"";
          json += "}";
          break;
        }
        default: continue;
      }
      Emit(json);
    }
  }

  // ---- texture mode: render thread ----------------------------------------------------------

  void Fail(const std::string& message) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (initError_.empty()) initError_ = message;
    }
    Emit("{\"event\":\"error\",\"message\":\"" + JsonEscape(message.c_str()) + "\"}");
  }

  void FinishInit(bool ok) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      initDone_ = true;
      initOk_ = ok;
    }
    cv_.notify_all();
  }

  bool InitGl() {
    const EGLint displayAttribs[] = {EGL_PLATFORM_ANGLE_TYPE_ANGLE_, EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE_, EGL_NONE_};
    display_ = angle_.GetPlatformDisplayEXT(EGL_PLATFORM_ANGLE_ANGLE_, nullptr, displayAttribs);
    EGLint major = 0, minor = 0;
    if (!display_ || !angle_.Initialize(display_, &major, &minor)) {
      Fail("eglInitialize failed: " + std::to_string(angle_.GetError()));
      return false;
    }
    angle_.BindAPI(EGL_OPENGL_ES_API_);
    const EGLint configAttribs[] = {EGL_RED_SIZE_, 8, EGL_GREEN_SIZE_, 8, EGL_BLUE_SIZE_, 8, EGL_ALPHA_SIZE_, 8,
                                    EGL_SURFACE_TYPE_, EGL_PBUFFER_BIT_, EGL_RENDERABLE_TYPE_, EGL_OPENGL_ES2_BIT_,
                                    EGL_NONE_};
    EGLint count = 0;
    if (!angle_.ChooseConfig(display_, configAttribs, &config_, 1, &count) || count < 1) {
      Fail("eglChooseConfig failed");
      return false;
    }
    for (EGLint version : {3, 2}) {
      const EGLint contextAttribs[] = {EGL_CONTEXT_CLIENT_VERSION_, version, EGL_NONE_};
      context_ = angle_.CreateContext(display_, config_, nullptr, contextAttribs);
      if (context_) break;
    }
    if (!context_) {
      Fail("eglCreateContext failed: " + std::to_string(angle_.GetError()));
      return false;
    }
    EGLAttrib device = 0, d3d = 0;
    if (!angle_.QueryDisplayAttribEXT(display_, EGL_DEVICE_EXT_, &device) ||
        !angle_.QueryDeviceAttribEXT(reinterpret_cast<EGLDeviceEXT>(device), EGL_D3D11_DEVICE_ANGLE_, &d3d) || !d3d) {
      Fail("could not get ANGLE's D3D11 device");
      return false;
    }
    device_ = reinterpret_cast<ID3D11Device*>(d3d);
    // mpv needs a current context while creating the renderer; any surface will do, so use a 16x16 texture.
    SharedTex* bootstrap = CreateTexture(16, 16);
    if (!bootstrap || !angle_.MakeCurrent(display_, bootstrap->surface, bootstrap->surface, context_)) {
      Fail("eglMakeCurrent failed: " + std::to_string(angle_.GetError()));
      return false;
    }

    mpv_opengl_init_params glInit = {GetGlProc, &angle_};
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, const_cast<char*>(MPV_RENDER_API_TYPE_OPENGL)},
        {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &glInit},
        {MPV_RENDER_PARAM_INVALID, nullptr},
    };
    int status = api_.mpv_render_context_create(&render_, handle_, params);
    if (status < 0) {
      Fail(std::string("mpv_render_context_create: ") + api_.mpv_error_string(status));
      return false;
    }
    api_.mpv_render_context_set_update_callback(render_, [](void* self) {
      auto* me = static_cast<MpvCompare*>(self);
      {
        std::lock_guard<std::mutex> lock(me->mutex_);
        me->updatePending_ = true;
      }
      me->cv_.notify_all();
    }, this);
    char text[96];
    std::snprintf(text, sizeof(text), "{\"event\":\"texture-ready\",\"egl\":\"%d.%d\"}", major, minor);
    Emit(text);
    return true;
  }

  SharedTex* CreateTexture(int w, int h) {
    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width = w;
    desc.Height = h;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED | D3D11_RESOURCE_MISC_SHARED_NTHANDLE;
    auto tex = std::make_unique<SharedTex>();
    tex->id = ++nextTextureId_;
    tex->w = w;
    tex->h = h;
    if (FAILED(device_->CreateTexture2D(&desc, nullptr, &tex->texture))) {
      Fail("CreateTexture2D failed");
      return nullptr;
    }
    IDXGIResource1* resource = nullptr;
    if (SUCCEEDED(tex->texture->QueryInterface(__uuidof(IDXGIResource1), reinterpret_cast<void**>(&resource)))) {
      resource->CreateSharedHandle(nullptr, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE, nullptr, &tex->handle);
      resource->Release();
    }
    const EGLint attribs[] = {EGL_WIDTH_, w, EGL_HEIGHT_, h, EGL_NONE_};
    tex->surface = angle_.CreatePbufferFromClientBuffer(display_, EGL_D3D_TEXTURE_ANGLE_, tex->texture, config_, attribs);
    if (!tex->handle || !tex->surface) {
      Fail("could not share the texture (handle or EGL surface): " + std::to_string(angle_.GetError()));
      DestroyTexture(tex.get());
      return nullptr;
    }
    SharedTex* raw = tex.get();
    textures_[raw->id] = std::move(tex);
    return raw;
  }

  void DestroyTexture(SharedTex* tex) {
    if (tex->surface) angle_.DestroySurface(display_, tex->surface);
    if (tex->handle) CloseHandle(tex->handle);
    if (tex->texture) tex->texture->Release();
    tex->surface = nullptr;
    tex->handle = nullptr;
    tex->texture = nullptr;
  }

  void RenderLoop() {
    bool ok = InitGl();
    FinishInit(ok);
    if (!ok) {
      ShutdownGl();
      return;
    }
    std::vector<int> freeIds;  // textures of the current size, not used by Chromium
    std::vector<int> retired;  // textures of an old size, destroyed when Chromium lets them go
    bool needRender = false;
    while (true) {
      int w, h;
      std::vector<int> released;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait(lock, [&] { return quit_ || updatePending_ || !released_.empty() || needRender_; });
        if (quit_) break;
        if (updatePending_) {
          updatePending_ = false;
          lock.unlock();
          if (api_.mpv_render_context_update(render_) & MPV_RENDER_UPDATE_FRAME) needRender = true;
          lock.lock();
        }
        if (needRender_) {
          needRender_ = false;
          needRender = true;
        }
        released.swap(released_);
        w = targetW_;
        h = targetH_;
      }
      for (int id : released) {
        auto it = textures_.find(id);
        if (it == textures_.end()) continue;
        if (it->second->w == w && it->second->h == h) {
          freeIds.push_back(id);
        } else {
          DestroyTexture(it->second.get());
          textures_.erase(it);
        }
      }
      if (!needRender) continue;

      SharedTex* target = nullptr;
      while (!freeIds.empty() && !target) {
        int id = freeIds.back();
        freeIds.pop_back();
        auto it = textures_.find(id);
        if (it == textures_.end()) continue;
        if (it->second->w == w && it->second->h == h) {
          target = it->second.get();
        } else {
          DestroyTexture(it->second.get());
          textures_.erase(it);
        }
      }
      if (!target) {
        int inFlightOfThisSize = 0;
        for (auto& entry : textures_) {
          if (entry.second->w == w && entry.second->h == h) inFlightOfThisSize++;
        }
        if (inFlightOfThisSize >= kPoolSize) {
          droppedNoTexture_++;
          continue;  // every texture is still on screen / in flight; render when one comes back
        }
        target = CreateTexture(w, h);
        if (!target) continue;
      }
      needRender = false;

      double start = NowMs();
      angle_.MakeCurrent(display_, target->surface, target->surface, context_);
      mpv_opengl_fbo fbo = {0, target->w, target->h, 0};
      int flip = flipY_ ? 1 : 0;
      mpv_render_param params[] = {
          {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
          {MPV_RENDER_PARAM_FLIP_Y, &flip},
          {MPV_RENDER_PARAM_INVALID, nullptr},
      };
      api_.mpv_render_context_render(render_, params);  // blocks until the frame's target time (mpv paces)
      double rendered = NowMs();
      angle_.Finish();  // Chromium reads the texture on another D3D11 device: the frame must be complete
      api_.mpv_render_context_report_swap(render_);
      double renderMs = rendered - start;
      double gpuMs = NowMs() - rendered;

      std::lock_guard<std::mutex> lock(tsfnMutex_);
      if (!framesReady_) continue;
      auto* frame = new FrameInfo{target->id, target->w, target->h, target->handle, renderMs, gpuMs, ++frameCount_};
      if (frames_.NonBlockingCall(frame, [](Napi::Env env, Napi::Function cb, FrameInfo* data) {
            Napi::Object info = Napi::Object::New(env);
            info.Set("id", data->id);
            info.Set("width", data->w);
            info.Set("height", data->h);
            info.Set("handle", Napi::Buffer<uint8_t>::Copy(env, reinterpret_cast<uint8_t*>(&data->handle), sizeof(HANDLE)));
            info.Set("renderMs", data->renderMs);
            info.Set("gpuMs", data->gpuMs);
            info.Set("frame", static_cast<double>(data->frame));
            delete data;
            cb.Call({info});
          }) != napi_ok) {
        delete frame;
        std::lock_guard<std::mutex> relock(mutex_);
        released_.push_back(target->id);
      }
    }
    ShutdownGl();
  }

  // Runs on the render thread: the render context and EGL objects belong to it.
  void ShutdownGl() {
    if (render_) {
      api_.mpv_render_context_free(render_);
      render_ = nullptr;
    }
    if (display_) {
      angle_.MakeCurrent(display_, nullptr, nullptr, nullptr);
      for (auto& entry : textures_) DestroyTexture(entry.second.get());
      textures_.clear();
      if (context_) angle_.DestroyContext(display_, context_);
      angle_.Terminate(display_);
      display_ = nullptr;
    }
  }

  void Teardown() {
    if (torn_) return;
    torn_ = true;
    if (renderThread_.joinable()) {
      {
        std::lock_guard<std::mutex> lock(mutex_);
        quit_ = true;
      }
      cv_.notify_all();
      renderThread_.join();  // frees the render context before the core goes away
    }
    if (alive_) alive_->store(false);
    if (handle_ && eventThread_.joinable()) {
      api_.mpv_wakeup(handle_);
      eventThread_.join();
    }
    if (handle_) {
      api_.mpv_terminate_destroy(handle_);
      handle_ = nullptr;
    }
    if (host_) {
      DestroyWindow(host_);
      host_ = nullptr;
    }
    std::lock_guard<std::mutex> lock(tsfnMutex_);
    if (eventsReady_) {
      events_.Release();
      eventsReady_ = false;
    }
    if (framesReady_) {
      frames_.Release();
      framesReady_ = false;
    }
  }

  static const int kPoolSize = 4;

  MpvApi api_;
  Angle angle_;
  mpv_handle* handle_ = nullptr;
  bool texture_ = false;
  bool flipY_ = false;
  bool torn_ = false;
  HWND host_ = nullptr;

  // texture mode (render thread unless noted)
  mpv_render_context* render_ = nullptr;
  EGLDisplay display_ = nullptr;
  EGLConfig config_ = nullptr;
  EGLContext context_ = nullptr;
  ID3D11Device* device_ = nullptr;
  std::map<int, std::unique_ptr<SharedTex>> textures_;
  int nextTextureId_ = 0;
  uint64_t frameCount_ = 0;
  uint64_t droppedNoTexture_ = 0;
  std::thread renderThread_;

  // shared with the JS thread / mpv's update callback
  std::mutex mutex_;
  std::condition_variable cv_;
  bool quit_ = false;
  bool initDone_ = false, initOk_ = false;
  std::string initError_;
  bool updatePending_ = false;
  bool needRender_ = false;
  std::vector<int> released_;
  int targetW_ = 1280, targetH_ = 720;

  std::shared_ptr<std::atomic<bool>> alive_;
  std::thread eventThread_;
  std::mutex tsfnMutex_;
  Napi::ThreadSafeFunction events_, frames_;
  bool eventsReady_ = false, framesReady_ = false;
};

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) { return MpvCompare::Init(env, exports); }

NODE_API_MODULE(mpvcompare, InitModule)
