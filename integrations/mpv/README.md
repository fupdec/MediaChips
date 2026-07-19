# MediaChips marks → mpv chapters

Loads timeline marks from a running MediaChips instance into mpv as chapters.

## Requirements

- MediaChips app/server running (default `http://127.0.0.1:12321`)
- [mpv](https://mpv.io/)
- `curl` on `PATH` (included on macOS and recent Windows)

## Install

Copy `mediachips-marks.lua` into your mpv scripts folder:

| OS | Path |
|----|------|
| macOS / Linux | `~/.config/mpv/scripts/mediachips-marks.lua` |
| Windows | `%APPDATA%\mpv\scripts\mediachips-marks.lua` |

## Configure

In `mpv.conf` (optional):

```ini
script-opts-append=mediachips-marks-base_url=http://127.0.0.1:12321
# If password protection is enabled in MediaChips:
# script-opts-append=mediachips-marks-token=YOUR_SESSION_TOKEN
script-opts-append=mediachips-marks-osd=yes
# Keep existing chapters and append MediaChips marks:
# script-opts-append=mediachips-marks-merge=yes
script-opts-append=mediachips-marks-timeout=3
```

### Auth token

If MediaChips has password protection enabled:

1. Log in via the UI or `POST /api/auth/login` with `{ "password": "..." }`
2. Put the returned session token into `mediachips-marks-token`

## Usage

1. Start MediaChips
2. Open a library video in mpv
3. Marks appear as chapters (menu / chapter keys)

Unmatched paths and empty mark lists leave the chapter list unchanged.

See also the [IINA plugin](../iina/) for macOS.

## API

```http
POST /api/mark/by-path
Content-Type: application/json

{ "path": "/absolute/path/to/video.mp4" }
```

Response:

```json
{
  "found": true,
  "mediaId": 42,
  "path": "/absolute/path/to/video.mp4",
  "chapters": [
    { "title": "Favorite", "time": 12 },
    { "title": "Intro", "time": 40.5 }
  ]
}
```
