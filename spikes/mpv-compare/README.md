# mpv playback comparison (Windows prototype)

Plays one file with libmpv in two ways and measures them side by side:

- **Native window**: mpv draws into its own child window with its own D3D11 swapchain. This is how
  the app's Windows player works today. Playback timing is mpv's own, but the HTML UI lives in a
  separate surface and lags behind it on resize.
- **Texture → canvas**: mpv renders with its OpenGL renderer on ANGLE (D3D11 backend, Electron's own
  `libEGL.dll` / `libGLESv2.dll`) into shared D3D11 textures. The main process hands each one to the
  page with Electron's experimental `sharedTexture` API and the page draws the `VideoFrame` into a
  `<canvas>`. The video is part of the page, so the UI cannot drift from it.

```bash
npm run spike:mpv-compare:build     # spikes/mpv-compare/native/build/Release/mpvcompare.node
npm run spike:mpv-compare           # libmpv from native/mpv-view/lib/libmpv-2.dll or MPV_LIB
npm run spike:mpv-compare -- --file C:\path\clip.mp4 --mode texture --autoplay
npm run spike:mpv-compare -- --file C:\path\clip.mp4 --compare 30 --report-out C:\tmp\report.json
npm run spike:mpv-compare:package   # out/MediaChips-mpv-compare-win-x64.zip for testers (see its README.txt)
```

"Compare both modes" plays the file for N seconds in each mode and records:

- mpv counters for both modes: dropped (VO / decoder), delayed and mistimed frames, hwdec, VO;
- texture mode only: frames rendered / drawn / superseded before paint, the GPU time of each frame
  (`glFinish`), transfer time to the page, and the interval between frames reaching the canvas
  (mean, deviation, p95, gaps of 1.5 frame periods or more);
- the tester's 1-5 ratings for smoothness and for the controls following the video on resize.

Notes:

- `mpv_render_context_render` waits for the frame's display time (mpv paces the video), so the
  "render+wait" figure is pacing, not cost.
- The paint intervals are measured with `requestAnimationFrame`; on a 120 Hz display a 60 fps video
  should show ~16.7 ms with little deviation.
- Virtual machines (no hardware decoder, virtual GPU) make both modes look worse; compare on real
  hardware.

Delete the folder (and the three `spike:mpv-compare*` scripts) to remove the prototype.
