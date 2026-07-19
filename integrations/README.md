# External player integrations

Load MediaChips timeline marks into external players as chapters.

| Player | Path | Platforms |
|--------|------|-----------|
| **mpv** | [`mpv/`](./mpv/) | macOS, Windows, Linux |
| **IINA** | [`iina/`](./iina/) | macOS only |

Both use the same API when installed as player plugins. Prefer opening from MediaChips context menu (**Play video in → mpv / IINA**), which injects marks without installing plugins.

```http
POST /api/mark/by-path
Content-Type: application/json

{ "path": "/absolute/path/to/video.mp4" }
```

MediaChips must be running while you play the file.
