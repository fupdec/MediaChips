{
  "targets": [
    {
      "target_name": "mpvcompare",
      "conditions": [
        ["OS=='win'", {
          "sources": ["mpv_compare_win.cc"],
          "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")", "../../../native/mpv-view/include"],
          "defines": ["NAPI_VERSION=8", "WIN32_LEAN_AND_MEAN", "NOMINMAX", "_UNICODE", "UNICODE"],
          "libraries": ["user32.lib", "gdi32.lib"],
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
