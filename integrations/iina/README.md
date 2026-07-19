# MediaChips marks → IINA chapters

Loads timeline marks from a running MediaChips instance into IINA as chapters.

Requires **IINA 1.4+** (plugin system).

## Install

1. Copy the `integrations/iina` folder somewhere stable, e.g.:

   ```bash
   cp -R integrations/iina ~/Library/Application\ Support/MediaChips/iina-mediachips-marks.iinaplugin
   ```

   The folder name should end with `.iinaplugin`.

2. Open **IINA → Settings → Plugins → Install from local package…** and choose that folder  
   (or drag it into the plugins list, depending on your IINA version).

3. Allow **network-request** / **show-osd** when prompted.

4. Open the plugin **Preferences** tab and set Base URL if needed.

## Configure

| Preference | Default | Meaning |
|------------|---------|---------|
| `base_url` | `http://127.0.0.1:12321` | MediaChips server |
| `token` | _(empty)_ | Session token if password protection is on |
| `osd` | on | Show OSD after loading marks |
| `merge` | off | Keep existing chapters and append marks |

### Auth token

If MediaChips has password protection:

1. Log in via the UI or `POST /api/auth/login` with `{ "password": "..." }`
2. Put the returned session token into the plugin preference `token`

## Usage

1. Start MediaChips
2. Open a library video in IINA
3. Marks appear as chapters (Chapters menu / chapter keys)

Unmatched paths and empty mark lists leave the chapter list unchanged.

## API

Same endpoint as the mpv script: `POST /api/mark/by-path` — see [`../mpv/README.md`](../mpv/README.md).
