// Windows counterpart of mpv_view.mm: libmpv plays into a native window that sits UNDER the
// (transparent) Electron window, so every HTML element draws on top of the video.
//
// Chromium on Windows cannot show a child window below its own surface, so the video lives in a
// separate top-level host window instead. The Electron window is made an OWNED window of the host
// (SetWindowLongPtr(GWLP_HWNDPARENT)): Windows keeps an owned window above its owner, and the two
// are raised / lowered together. JS keeps the host's rectangle in sync with a DOM block, and the main
// process re-applies it when the Electron window moves, resizes, minimizes or restores.
//
// mpv draws into the host through its own `wid` embedding (no render API / OpenGL context needed).
// libmpv is loaded with LoadLibrary so the addon builds from the headers in include/mpv only.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <dwmapi.h>

#include <atomic>
#include <cmath>
#include <cstdio>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <napi.h>
#include <mpv/client.h>

#define MPV_FUNCS(X) \
  X(mpv_create) X(mpv_initialize) X(mpv_set_option_string) X(mpv_set_property_string) \
  X(mpv_command) X(mpv_observe_property) X(mpv_wait_event) X(mpv_wakeup) \
  X(mpv_terminate_destroy) X(mpv_error_string) X(mpv_get_property_string) X(mpv_free)

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
#define RESOLVE(fn) \
  fn = reinterpret_cast<decltype(&::fn)>(GetProcAddress(lib, #fn)); \
  if (!fn) { error = "missing symbol " #fn; return false; }
    MPV_FUNCS(RESOLVE)
#undef RESOLVE
    return true;
  }
};

static const wchar_t* kHostClass = L"MediaChipsMpvHost";

static LRESULT CALLBACK HostProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_MOUSEACTIVATE:
      return MA_NOACTIVATE;  // the Electron window above keeps the focus
    case WM_ERASEBKGND:
      return 1;
    case WM_SIZE: {
      // mpv creates its own child window inside the host; keep it covering the whole client area.
      HWND child = GetWindow(hwnd, GW_CHILD);
      if (child) MoveWindow(child, 0, 0, LOWORD(lParam), HIWORD(lParam), TRUE);
      return 0;
    }
    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

static void RegisterHostClass() {
  static bool registered = false;
  if (registered) return;
  WNDCLASSEXW wc = {};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = HostProc;
  wc.hInstance = GetModuleHandleW(nullptr);
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  wc.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
  wc.lpszClassName = kHostClass;
  RegisterClassExW(&wc);
  registered = true;
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

class MpvView : public Napi::ObjectWrap<MpvView> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "MpvView", {
      InstanceMethod("setRect", &MpvView::SetRect),
      InstanceMethod("command", &MpvView::Command),
      InstanceMethod("setProperty", &MpvView::SetProperty),
      InstanceMethod("observe", &MpvView::Observe),
      InstanceMethod("getProperty", &MpvView::GetProperty),
      InstanceMethod("onEvent", &MpvView::OnEvent),
      InstanceMethod("destroy", &MpvView::Destroy),
    });
    exports.Set("MpvView", ctor);
    return exports;
  }

  // new MpvView(windowHandle: Buffer, libPath: string, options?: {above?: boolean})
  MpvView(const Napi::CallbackInfo& info) : Napi::ObjectWrap<MpvView>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsString()) {
      Napi::TypeError::New(env, "MpvView(handle: Buffer, libPath: string)").ThrowAsJavaScriptException();
      return;
    }
    auto handleBuffer = info[0].As<Napi::Buffer<uint8_t>>();
    if (handleBuffer.Length() < sizeof(HWND)) {
      Napi::Error::New(env, "invalid window handle").ThrowAsJavaScriptException();
      return;
    }
    electron_ = *reinterpret_cast<HWND*>(handleBuffer.Data());
    if (!IsWindow(electron_)) {
      Napi::Error::New(env, "window handle is not a window").ThrowAsJavaScriptException();
      return;
    }

    std::string error;
    if (!api_.load(info[1].As<Napi::String>().Utf8Value(), error)) {
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return;
    }

    RegisterHostClass();
    host_ = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW, kHostClass, L"MediaChips video",
                            WS_POPUP | WS_CLIPCHILDREN, 0, 0, 16, 16, nullptr, nullptr,
                            GetModuleHandleW(nullptr), nullptr);
    if (!host_) {
      Napi::Error::New(env, "CreateWindowEx failed (" + std::to_string(GetLastError()) + ")").ThrowAsJavaScriptException();
      return;
    }

    // The Electron window becomes an owned window of the host: it stays above it. An owned window
    // loses its taskbar button unless it asks for one, so WS_EX_APPWINDOW keeps it.
    SetWindowLongPtrW(electron_, GWLP_HWNDPARENT, reinterpret_cast<LONG_PTR>(host_));
    LONG_PTR ex = GetWindowLongPtrW(electron_, GWL_EXSTYLE);
    SetWindowLongPtrW(electron_, GWL_EXSTYLE, ex | WS_EX_APPWINDOW);
    SetWindowPos(electron_, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    owned_ = true;

    // Windows 11 rounds the corners of ordinary top-level windows; ask for it explicitly (a no-op
    // on Windows 10 and on windows the system treats as layered).
    const DWORD roundCorners = 2;  // DWMWCP_ROUND
    DwmSetWindowAttribute(electron_, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &roundCorners, sizeof(roundCorners));

    handle_ = api_.mpv_create();
    if (!handle_) {
      Napi::Error::New(env, "mpv_create failed").ThrowAsJavaScriptException();
      return;
    }
    api_.mpv_set_option_string(handle_, "wid", std::to_string(reinterpret_cast<intptr_t>(host_)).c_str());
    api_.mpv_set_option_string(handle_, "hwdec", "auto-safe");
    api_.mpv_set_option_string(handle_, "keep-open", "yes");
    api_.mpv_set_option_string(handle_, "idle", "yes");
    api_.mpv_set_option_string(handle_, "input-default-bindings", "no");
    api_.mpv_set_option_string(handle_, "input-vo-keyboard", "no");
    api_.mpv_set_option_string(handle_, "osc", "no");
    api_.mpv_set_option_string(handle_, "cursor-autohide", "no");
    int status = api_.mpv_initialize(handle_);
    if (status < 0) {
      Napi::Error::New(env, std::string("mpv_initialize: ") + api_.mpv_error_string(status)).ThrowAsJavaScriptException();
      return;
    }

    alive_ = std::make_shared<std::atomic<bool>>(true);
    worker_ = std::thread([this, alive = alive_]() { EventLoop(alive); });
  }

  ~MpvView() { Teardown(); }

 private:
  double Scale() const {
    UINT dpi = GetDpiForWindow(electron_);
    return dpi > 0 ? dpi / 96.0 : 1.0;
  }

  // setRect(x, y, w, h, clipX, clipY, clipW, clipH, radius?) - DIPs, origin top-left of the window's
  // client area. A rectangle without area hides the host. `radius` rounds the video's corners.
  Napi::Value SetRect(const Napi::CallbackInfo& info) {
    if (!host_ || info.Length() < 8) return info.Env().Undefined();
    double v[4];
    for (int i = 0; i < 4; i++) v[i] = info[i].ToNumber().DoubleValue();
    if (v[2] <= 0 || v[3] <= 0 || !IsWindow(electron_)) {
      ShowWindow(host_, SW_HIDE);
      return info.Env().Undefined();
    }
    double scale = Scale();
    POINT origin = {0, 0};
    ClientToScreen(electron_, &origin);
    int x = origin.x + static_cast<int>(std::lround(v[0] * scale));
    int y = origin.y + static_cast<int>(std::lround(v[1] * scale));
    int w = static_cast<int>(std::lround(v[2] * scale));
    int h = static_cast<int>(std::lround(v[3] * scale));
    // Insert the host right behind the Electron window: changing the owner does not reorder
    // existing windows, so without this the host can end up covering the web UI.
    SetWindowPos(host_, electron_, x, y, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);

    int radius = info.Length() > 8 ? static_cast<int>(std::lround(info[8].ToNumber().DoubleValue() * scale)) : 0;
    if (radius != appliedRadius_ || w != appliedW_ || h != appliedH_) {
      appliedRadius_ = radius;
      appliedW_ = w;
      appliedH_ = h;
      // The region is in window coordinates; the extra pixel keeps the right/bottom edge inside it.
      HRGN region = radius > 0 ? CreateRoundRectRgn(0, 0, w + 1, h + 1, radius * 2, radius * 2) : nullptr;
      SetWindowRgn(host_, region, TRUE);  // the system owns the region from here on
    }
    return info.Env().Undefined();
  }

  // command(["loadfile", path]) - array of strings.
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

  // observe(name, "double" | "flag" | "string")
  Napi::Value Observe(const Napi::CallbackInfo& info) {
    if (!handle_ || info.Length() < 2) return info.Env().Undefined();
    std::string kind = info[1].ToString().Utf8Value();
    mpv_format format = kind == "double" ? MPV_FORMAT_DOUBLE : kind == "flag" ? MPV_FORMAT_FLAG : MPV_FORMAT_STRING;
    api_.mpv_observe_property(handle_, 0, info[0].ToString().Utf8Value().c_str(), format);
    return info.Env().Undefined();
  }

  // getProperty(name) -> string | null (mpv's string form; flags are "yes" / "no")
  Napi::Value GetProperty(const Napi::CallbackInfo& info) {
    if (!handle_ || info.Length() < 1) return info.Env().Null();
    char* value = api_.mpv_get_property_string(handle_, info[0].ToString().Utf8Value().c_str());
    if (!value) return info.Env().Null();
    Napi::String result = Napi::String::New(info.Env(), value);
    api_.mpv_free(value);
    return result;
  }

  // onEvent((json: string) => void)
  Napi::Value OnEvent(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsFunction()) return info.Env().Undefined();
    std::lock_guard<std::mutex> lock(tsfnMutex_);
    if (tsfnReady_) tsfn_.Release();
    tsfn_ = Napi::ThreadSafeFunction::New(info.Env(), info[0].As<Napi::Function>(), "mpvview-events", 0, 1);
    tsfnReady_ = true;
    return info.Env().Undefined();
  }

  Napi::Value Destroy(const Napi::CallbackInfo& info) {
    Teardown();
    return info.Env().Undefined();
  }

  void Emit(const std::string& json) {
    std::lock_guard<std::mutex> lock(tsfnMutex_);
    if (!tsfnReady_) return;
    auto* text = new std::string(json);
    if (tsfn_.NonBlockingCall(text, [](Napi::Env env, Napi::Function cb, std::string* data) {
          cb.Call({Napi::String::New(env, *data)});
          delete data;
        }) != napi_ok) {
      delete text;
    }
  }

  // Runs on its own thread: mpv_wait_event blocks until mpv has something to report.
  void EventLoop(std::shared_ptr<std::atomic<bool>> alive) {
    while (alive->load()) {
      mpv_event* event = api_.mpv_wait_event(handle_, 1.0);
      if (!event || event->event_id == MPV_EVENT_NONE) continue;
      std::string json;
      switch (event->event_id) {
        case MPV_EVENT_PROPERTY_CHANGE: {
          auto* prop = static_cast<mpv_event_property*>(event->data);
          json = std::string("{\"event\":\"property-change\",\"name\":\"") + JsonEscape(prop->name) + "\",\"data\":";
          if (prop->format == MPV_FORMAT_DOUBLE) {
            double value = *static_cast<double*>(prop->data);
            if (std::isfinite(value)) {
              char buf[40];
              std::snprintf(buf, sizeof(buf), "%.17g", value);
              json += buf;
            } else {
              json += "null";
            }
          } else if (prop->format == MPV_FORMAT_FLAG) {
            json += *static_cast<int*>(prop->data) != 0 ? "true" : "false";
          } else if (prop->format == MPV_FORMAT_STRING && prop->data && *static_cast<char**>(prop->data)) {
            json += "\"" + JsonEscape(*static_cast<char**>(prop->data)) + "\"";
          } else {
            json += "null";
          }
          json += "}";
          break;
        }
        case MPV_EVENT_FILE_LOADED: json = "{\"event\":\"file-loaded\"}"; break;
        case MPV_EVENT_PLAYBACK_RESTART: json = "{\"event\":\"playback-restart\"}"; break;
        case MPV_EVENT_SEEK: json = "{\"event\":\"seek\"}"; break;
        case MPV_EVENT_END_FILE: {
          auto* end = static_cast<mpv_event_end_file*>(event->data);
          json = "{\"event\":\"end-file\",\"reason\":" + std::to_string(static_cast<int>(end->reason));
          if (end->error < 0) json += std::string(",\"error\":\"") + JsonEscape(api_.mpv_error_string(end->error)) + "\"";
          json += "}";
          break;
        }
        case MPV_EVENT_SHUTDOWN: json = "{\"event\":\"shutdown\"}"; break;
        default: continue;
      }
      Emit(json);
    }
  }

  void Teardown() {
    if (alive_) alive_->store(false);
    if (handle_ && worker_.joinable()) {
      api_.mpv_wakeup(handle_);  // unblock mpv_wait_event so the thread can exit
      worker_.join();
    }
    if (handle_) {
      api_.mpv_terminate_destroy(handle_);
      handle_ = nullptr;
    }
    if (owned_ && IsWindow(electron_)) {
      SetWindowLongPtrW(electron_, GWLP_HWNDPARENT, 0);
      owned_ = false;
    }
    if (host_) {
      DestroyWindow(host_);
      host_ = nullptr;
    }
    {
      std::lock_guard<std::mutex> lock(tsfnMutex_);
      if (tsfnReady_) {
        tsfn_.Release();
        tsfnReady_ = false;
      }
    }
  }

  MpvApi api_;
  mpv_handle* handle_ = nullptr;
  HWND electron_ = nullptr;
  HWND host_ = nullptr;
  bool owned_ = false;
  int appliedRadius_ = -1, appliedW_ = 0, appliedH_ = 0;
  std::shared_ptr<std::atomic<bool>> alive_;
  std::thread worker_;
  Napi::ThreadSafeFunction tsfn_;
  bool tsfnReady_ = false;
  std::mutex tsfnMutex_;
};

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  return MpvView::Init(env, exports);
}

NODE_API_MODULE(mpvview, InitModule)
