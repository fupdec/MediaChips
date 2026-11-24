// Prototype: libmpv rendering into a native NSView that lives inside an Electron window.
//
// The view is added to the window's content view, normally BELOW Chromium's web view, so a
// transparent region of the page shows the video and every HTML element (menus, dialogs,
// controls) draws on top of it. JS keeps the view's rectangle in sync with a DOM element.
//
// libmpv is loaded with dlopen so the addon builds from headers only. macOS only.
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <OpenGL/gl3.h>
#import <OpenGL/OpenGL.h>

#include <dlfcn.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <napi.h>
#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_gl.h>

#define MPV_FUNCS(X) \
  X(mpv_create) X(mpv_initialize) X(mpv_set_option_string) X(mpv_set_property_string) \
  X(mpv_command) X(mpv_observe_property) X(mpv_wait_event) X(mpv_set_wakeup_callback) \
  X(mpv_terminate_destroy) X(mpv_error_string) X(mpv_render_context_create) \
  X(mpv_render_context_set_update_callback) X(mpv_render_context_update) \
  X(mpv_render_context_render) X(mpv_render_context_free) \
  X(mpv_get_property_string) X(mpv_free)

struct MpvApi {
#define DECLARE(name) decltype(&name) name = nullptr;
  MPV_FUNCS(DECLARE)
#undef DECLARE

  bool load(const std::string& path, std::string& error) {
    void* lib = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (!lib) {
      error = std::string("dlopen failed: ") + dlerror();
      return false;
    }
#define RESOLVE(fn) \
  fn = reinterpret_cast<decltype(&::fn)>(dlsym(lib, #fn)); \
  if (!fn) { error = "missing symbol " #fn; return false; }
    MPV_FUNCS(RESOLVE)
#undef RESOLVE
    return true;
  }
};

static void* GLProcAddress(void*, const char* name) {
  static CFBundleRef bundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.opengl"));
  CFStringRef symbol = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingASCII);
  void* address = CFBundleGetFunctionPointerForName(bundle, symbol);
  CFRelease(symbol);
  return address;
}

@interface MPVGLView : NSOpenGLView
@property(nonatomic, assign) mpv_render_context* render;
@property(nonatomic, assign) MpvApi* api;
- (void)drawVideo;
@end

@implementation MPVGLView
- (instancetype)initWithFrame:(NSRect)frame {
  NSOpenGLPixelFormatAttribute attrs[] = {
    NSOpenGLPFAOpenGLProfile, NSOpenGLProfileVersion3_2Core,
    NSOpenGLPFADoubleBuffer, NSOpenGLPFAAccelerated, 0};
  NSOpenGLPixelFormat* format = [[NSOpenGLPixelFormat alloc] initWithAttributes:attrs];
  self = [super initWithFrame:frame pixelFormat:format];
  if (self) {
    self.wantsBestResolutionOpenGLSurface = YES;
    GLint swap = 1;
    [self.openGLContext setValues:&swap forParameter:NSOpenGLContextParameterSwapInterval];
  }
  return self;
}

- (BOOL)isOpaque { return YES; }

// The picture is display-only: mouse events must reach Chromium's own view hierarchy (page buttons,
// timeline, click-to-pause), not stop at this sibling view that covers the same rectangle.
- (NSView*)hitTest:(NSPoint)point { return nil; }

- (void)drawRect:(NSRect)dirty { [self drawVideo]; }

- (void)drawVideo {
  [self.openGLContext makeCurrentContext];
  NSSize size = [self convertSizeToBacking:self.bounds.size];
  if (!self.render) {
    glViewport(0, 0, (GLsizei)size.width, (GLsizei)size.height);
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
  } else {
    self.api->mpv_render_context_update(self.render);
    mpv_opengl_fbo fbo = {0, (int)size.width, (int)size.height, 0};
    int flipY = 1;
    mpv_render_param params[] = {
      {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
      {MPV_RENDER_PARAM_FLIP_Y, &flipY},
      {MPV_RENDER_PARAM_INVALID, nullptr}};
    self.api->mpv_render_context_render(self.render, params);
  }
  [self.openGLContext flushBuffer];
}
@end

@interface MPVClipView : NSView
@end

@implementation MPVClipView
- (NSView*)hitTest:(NSPoint)point { return nil; }
@end

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
    bool above = false;
    if (info.Length() > 2 && info[2].IsObject()) {
      above = info[2].As<Napi::Object>().Get("above").ToBoolean().Value();
    }

    std::string error;
    if (!api_.load(info[1].As<Napi::String>().Utf8Value(), error)) {
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return;
    }

    NSView* host = *reinterpret_cast<NSView* __unsafe_unretained*>(info[0].As<Napi::Buffer<uint8_t>>().Data());

    clip_ = [[MPVClipView alloc] initWithFrame:NSMakeRect(0, 0, 10, 10)];
    clip_.wantsLayer = YES;
    clip_.layer.masksToBounds = YES;
    clip_.autoresizesSubviews = NO;
    glView_ = [[MPVGLView alloc] initWithFrame:NSMakeRect(0, 0, 10, 10)];
    glView_.api = &api_;
    [clip_ addSubview:glView_];
    [host addSubview:clip_
          positioned:above ? NSWindowAbove : NSWindowBelow
          relativeTo:nil];
    host_ = host;

    handle_ = api_.mpv_create();
    if (!handle_) {
      Napi::Error::New(env, "mpv_create failed").ThrowAsJavaScriptException();
      return;
    }
    api_.mpv_set_option_string(handle_, "vo", "libmpv");
    api_.mpv_set_option_string(handle_, "hwdec", "auto-safe");
    api_.mpv_set_option_string(handle_, "keep-open", "yes");
    api_.mpv_set_option_string(handle_, "idle", "yes");
    api_.mpv_set_option_string(handle_, "input-default-bindings", "no");
    api_.mpv_set_option_string(handle_, "input-vo-keyboard", "no");
    int status = api_.mpv_initialize(handle_);
    if (status < 0) {
      Napi::Error::New(env, std::string("mpv_initialize: ") + api_.mpv_error_string(status)).ThrowAsJavaScriptException();
      return;
    }

    [glView_.openGLContext makeCurrentContext];
    mpv_opengl_init_params glInit = {GLProcAddress, nullptr};
    const char* apiType = MPV_RENDER_API_TYPE_OPENGL;
    mpv_render_param params[] = {
      {MPV_RENDER_PARAM_API_TYPE, const_cast<char*>(apiType)},
      {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &glInit},
      {MPV_RENDER_PARAM_INVALID, nullptr}};
    status = api_.mpv_render_context_create(&render_, handle_, params);
    if (status < 0) {
      Napi::Error::New(env, std::string("render context: ") + api_.mpv_error_string(status)).ThrowAsJavaScriptException();
      return;
    }
    glView_.render = render_;

    alive_ = std::make_shared<std::atomic<bool>>(true);
    eventQueue_ = dispatch_queue_create("mpvview.events", DISPATCH_QUEUE_SERIAL);
    api_.mpv_render_context_set_update_callback(render_, [](void* ctx) {
      auto* self = static_cast<MpvView*>(ctx);
      auto alive = self->alive_;
      dispatch_async(dispatch_get_main_queue(), ^{
        if (alive && alive->load()) [self->glView_ setNeedsDisplay:YES];
      });
    }, this);
    api_.mpv_set_wakeup_callback(handle_, [](void* ctx) {
      auto* self = static_cast<MpvView*>(ctx);
      auto alive = self->alive_;
      dispatch_async(self->eventQueue_, ^{
        if (alive && alive->load()) self->DrainEvents();
      });
    }, this);
  }

  ~MpvView() { Teardown(); }

 private:
  // setRect(x, y, w, h, clipX, clipY, clipW, clipH) — CSS pixels, origin top-left of the window.
  Napi::Value SetRect(const Napi::CallbackInfo& info) {
    if (!clip_ || info.Length() < 8) return info.Env().Undefined();
    double v[8];
    for (int i = 0; i < 8; i++) v[i] = info[i].ToNumber().DoubleValue();
    CGFloat hostHeight = host_.bounds.size.height;
    NSRect full = NSMakeRect(v[0], hostHeight - (v[1] + v[3]), v[2], v[3]);
    NSRect clip = NSMakeRect(v[4], hostHeight - (v[5] + v[7]), v[6], v[7]);
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    clip_.hidden = (clip.size.width <= 0 || clip.size.height <= 0 || full.size.width <= 0);
    if (!clip_.hidden) {
      clip_.frame = clip;
      glView_.frame = NSMakeRect(full.origin.x - clip.origin.x, full.origin.y - clip.origin.y,
                                 full.size.width, full.size.height);
    }
    [CATransaction commit];
    return info.Env().Undefined();
  }

  // command(["loadfile", path]) — array of strings.
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

  void DrainEvents() {
    while (handle_ && alive_ && alive_->load()) {
      mpv_event* event = api_.mpv_wait_event(handle_, 0);
      if (!event || event->event_id == MPV_EVENT_NONE) break;
      NSMutableDictionary* out = [NSMutableDictionary dictionary];
      switch (event->event_id) {
        case MPV_EVENT_PROPERTY_CHANGE: {
          auto* prop = static_cast<mpv_event_property*>(event->data);
          out[@"event"] = @"property-change";
          out[@"name"] = [NSString stringWithUTF8String:prop->name];
          if (prop->format == MPV_FORMAT_DOUBLE) out[@"data"] = @(*static_cast<double*>(prop->data));
          else if (prop->format == MPV_FORMAT_FLAG) out[@"data"] = @(*static_cast<int*>(prop->data) != 0);
          else if (prop->format == MPV_FORMAT_STRING && prop->data) {
            const char* text = *static_cast<char**>(prop->data);
            out[@"data"] = text ? [NSString stringWithUTF8String:text] : [NSNull null];
          } else out[@"data"] = [NSNull null];
          break;
        }
        case MPV_EVENT_FILE_LOADED: out[@"event"] = @"file-loaded"; break;
        case MPV_EVENT_PLAYBACK_RESTART: out[@"event"] = @"playback-restart"; break;
        case MPV_EVENT_SEEK: out[@"event"] = @"seek"; break;
        case MPV_EVENT_END_FILE: {
          auto* end = static_cast<mpv_event_end_file*>(event->data);
          out[@"event"] = @"end-file";
          out[@"reason"] = @(end->reason);
          if (end->error < 0) out[@"error"] = [NSString stringWithUTF8String:api_.mpv_error_string(end->error)];
          break;
        }
        case MPV_EVENT_SHUTDOWN: out[@"event"] = @"shutdown"; break;
        default: continue;
      }
      NSData* json = [NSJSONSerialization dataWithJSONObject:out options:0 error:nil];
      if (!json) continue;
      auto* text = new std::string(static_cast<const char*>(json.bytes), json.length);
      std::lock_guard<std::mutex> lock(tsfnMutex_);
      if (!tsfnReady_ || tsfn_.NonBlockingCall(text, [](Napi::Env env, Napi::Function cb, std::string* data) {
            cb.Call({Napi::String::New(env, *data)});
            delete data;
          }) != napi_ok) {
        delete text;
      }
    }
  }

  void Teardown() {
    if (alive_) alive_->store(false);
    // Wait for an in-flight DrainEvents() so it cannot touch mpv or the JS callback below.
    if (eventQueue_) dispatch_sync(eventQueue_, ^{});
    if (render_) {
      api_.mpv_render_context_set_update_callback(render_, nullptr, nullptr);
      [glView_.openGLContext makeCurrentContext];
      glView_.render = nullptr;
      api_.mpv_render_context_free(render_);
      render_ = nullptr;
    }
    if (handle_) {
      api_.mpv_set_wakeup_callback(handle_, nullptr, nullptr);
      api_.mpv_terminate_destroy(handle_);
      handle_ = nullptr;
    }
    if (clip_) {
      [clip_ removeFromSuperview];
      clip_ = nil;
      glView_ = nil;
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
  mpv_render_context* render_ = nullptr;
  NSView* host_ = nil;
  NSView* clip_ = nil;
  MPVGLView* glView_ = nil;
  std::shared_ptr<std::atomic<bool>> alive_;
  dispatch_queue_t eventQueue_ = nullptr;
  Napi::ThreadSafeFunction tsfn_;
  bool tsfnReady_ = false;
  std::mutex tsfnMutex_;
};

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  return MpvView::Init(env, exports);
}

NODE_API_MODULE(mpvview, InitModule)
