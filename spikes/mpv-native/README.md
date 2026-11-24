# mpv native embedding spike (macOS)

libmpv renders into an `NSView` inside the Electron window. The view sits **below** Chromium's web view,
so a transparent region of the page shows the video and all HTML draws on top of it.

```bash
brew install mpv                 # provides libmpv.2.dylib (or set MPV_LIB=/path/to/libmpv.dylib)
npm run spike:mpv-native:build   # compiles native/mpv-view/build/Release/mpvview.node
npm run spike:mpv-native -- /path/to/video.mkv          # layer below the web view (default)
npm run spike:mpv-native -- /path/to/video.mkv --above  # layer above, for comparison
```

Window-option experiments (embedded window only):

```bash
npm run spike:mpv-native -- /path/to/video.mkv --like-main   # frame + hidden title bar + traffic lights + transparent
npm run spike:mpv-native -- /path/to/video.mkv --opaque      # same but not transparent (control: video should NOT show)
```

What to check:

1. The video fills the player block, with the HTML bar and info on top of it.
2. Scroll the page: the video moves with its block, is hidden under the header, never covers the sidebar.
3. Resize the window: the video follows without a visible lag.
4. Menu button: the HTML menu draws over the video.
5. "Open in window": a second window plays the same file filling the whole window.
6. The `hwdec` line shows `videotoolbox` for H.264/HEVC.

The mpv public headers in `include/mpv` are ISC licensed (copied from mpv v0.40.0).
Delete the folder to remove the spike.
