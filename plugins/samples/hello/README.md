# Hello sample plugin

Minimal **zip-installable** MediaChips plugin for catalog testing.

## Package layout

```
plugin.json   # required manifest
README.md     # this file (optional)
```

Zip so `plugin.json` is at the archive root (or inside a single top-level folder).

## Install

1. Settings → Plugins → **Install from zip**
2. Select `mediachips.sampleHello-0.1.0.zip`
3. Enable the plugin in the list

This sample has no Vue/`uiEntry` runtime yet — it only appears in the installed catalog.
