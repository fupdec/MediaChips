{
  "targets": [
    {
      "target_name": "mpvview",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["src/mpv_view.mm"],
          "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")", "include"],
          "defines": ["NAPI_VERSION=8", "GL_SILENCE_DEPRECATION"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "12.0",
            "OTHER_LDFLAGS": ["-framework Cocoa", "-framework OpenGL", "-framework QuartzCore"]
          }
        }],
        ["OS=='win'", {
          "sources": ["src/mpv_view_win.cc"],
          "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")", "include"],
          "defines": ["NAPI_VERSION=8", "WIN32_LEAN_AND_MEAN", "NOMINMAX", "_UNICODE", "UNICODE"],
          "libraries": ["user32.lib"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
