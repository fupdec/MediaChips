# mpv-view (macOS native addon)

libmpv renders into an `NSView` placed inside an Electron window, below Chromium's web view.
The page stays transparent over the video, so HTML controls draw on top of it.

```bash
brew install mpv                 # provides libmpv.2.dylib for development
npm run spike:mpv-native:build   # builds build/Release/mpvview.node
```

libmpv is loaded with `dlopen`, so the addon builds from the headers in `include/mpv` only
(ISC licensed, copied from mpv v0.40.0). N-API keeps the binary independent of the Electron version.
The app loads it through `electron/mpvNative.ts` when `MC_NATIVE_PLAYER=1` is set.

## Windows (work in progress)

`src/mpv_view_win.cc` is the Windows counterpart. Chromium on Windows cannot show a child window
below its own surface, so mpv plays into a separate top-level host window (`wid` embedding) and the
transparent Electron window is made an *owned* window of it, which keeps it above the video. The
main process (`electron/mpvNative.ts`) re-applies the video rectangle when the window moves,
resizes, minimizes or restores.

```bat
:: Visual Studio Build Tools (Desktop development with C++) + Python are required by node-gyp
npm run spike:mpv-native:build
set MPV_LIB=C:\path\to\libmpv-2.dll
set MC_NATIVE_PLAYER=1
npm run electron
```

`libmpv-2.dll` must match the architecture of the running Electron (x64 build for x64 Electron,
aarch64 for Windows on ARM). It is also looked up in `native/mpv-view/lib/` and in
`resources/mpv/` of a packaged app. Packaging (electron-builder `extraResources`) is not wired up
for Windows yet.

## Packaging (macOS)

`npm run dist` (or `npm run pack`) builds the addon, then runs `scripts/bundle-libmpv.mjs` for each
architecture. It copies libmpv and its ~50 dependencies from Homebrew into `.mpv-build/<arch>`,
rewrites every install name to `@loader_path`, re-signs each file ad-hoc (required on Apple
Silicon after relinking) and verifies that nothing still points into Homebrew. electron-builder then
copies the folder to `Resources/mpv` (`build.mac.extraResources`).

- Needs `brew install mpv` on the build machine, once per architecture: Apple Silicon Homebrew
  lives in `/opt/homebrew`, Intel Homebrew in `/usr/local`. A missing architecture is skipped with a
  warning and that build simply ships without the native player.
- The player is opt-in (Settings → Video player → Native player) and needs a restart.
- Without the bundle the app falls back to the regular `<video>` player.

## Licenses

libmpv and the bundled libraries (FFmpeg, libass, libplacebo and others) are GPL/LGPL software copied
from Homebrew. The app is GPL-3.0 and its source is public; corresponding sources of the bundled
libraries: https://github.com/mpv-player/mpv and https://ffmpeg.org. The headers in `include/mpv`
are ISC licensed.
