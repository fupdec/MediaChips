# Installing MediaChips

Pre-built installers are published on [GitHub Releases](https://github.com/fupdec/mediaChips/releases/latest).

| Platform | File |
|----------|------|
| macOS | `MediaChips.v<version>.Mac.arm64.dmg` / `MediaChips.v<version>.Mac.x64.dmg` — signed builds auto-update via ZIP; unsigned builds use DMG manually |
| Windows | `MediaChips.v<version>.Windows.Installer.exe` (NSIS installer) |
| Linux | `MediaChips.v<version>.Linux.AppImage` |

### In-app auto-update (desktop)

NSIS (Windows), ZIP (macOS), and AppImage (Linux) builds support automatic updates inside the app:

1. Open **Settings → About**.
2. Enable **Check for updates at startup** (enabled by default).
3. When a new release is published on GitHub, the app offers to download and install it.

**macOS (unsigned builds):** the app can detect new versions, but Apple blocks in-place install without a Developer ID signature. Use **Download DMG** in the update notification and install manually (see macOS section below).

Portable Windows builds and development builds do not support in-app auto-update — download a new installer from [Releases](https://github.com/fupdec/MediaChips/releases/latest) instead.

To build from source, see [README.md](./README.md).

---

## macOS

> **First launch without an Apple certificate:** macOS will warn that the developer is unknown. That is expected for open-source builds. After installing, use **right-click → Open** once — later launches work normally with a double-click.

### Quick start (recommended)

1. Download the DMG for your Mac:
   - Apple Silicon (M1/M2/M3/M4): `MediaChips.v<version>.Mac.arm64.dmg`
   - Intel: `MediaChips.v<version>.Mac.x64.dmg`
2. Open the DMG and drag **MediaChips** to **Applications**.
3. Open **Finder → Applications**.
4. **Right-click** (or Control-click) **MediaChips** and choose **Open**.
5. In the dialog, click **Open** again.

Do **not** double-click the app the first time — macOS only shows the **Open** button in the security dialog after a right-click open.

### Method 2: Terminal (if the app still won't open)

After copying the app to Applications:

```bash
xattr -rd com.apple.quarantine /Applications/MediaChips.app
open /Applications/MediaChips.app
```

`sudo` is usually not required. Use it only if you get a permission error.

### Two different macOS warnings

| What you see | Cause | Comfortable fix |
|--------------|-------|-----------------|
| **"cannot be opened because the developer cannot be verified"** | No Apple Developer ID (expected) | Right-click → **Open**, or **System Settings → Privacy & Security → Open Anyway** |
| **"is damaged and can't be opened"** / **Move to Trash** | Download quarantine + missing code signature on Apple Silicon | Remove quarantine (`xattr` above) or use a build with ad-hoc signing |

Community releases are **ad-hoc signed** (not notarized). That removes the harsh "damaged" / trash dialog on Apple Silicon, but macOS still asks you to confirm the first launch.

### Why isn't the app notarized?

MediaChips is free and open source. Apple charges a yearly fee for notarized distribution, so community builds stay ad-hoc signed instead of passing that cost on to users.

### Security

You can verify the application yourself:

- Source code: [github.com/fupdec/mediaChips](https://github.com/fupdec/mediaChips)
- All code is publicly auditable
- No telemetry or data collection

---

## Windows

1. Download the installer or portable build from [Releases](https://github.com/fupdec/mediaChips/releases/latest).
2. Run the installer and follow the setup wizard, **or** extract/run the portable executable.
3. If SmartScreen warns about an unknown publisher, choose **More info** → **Run anyway** (the build is not code-signed with a commercial certificate).

---

## Linux

1. Download the `.AppImage` from [Releases](https://github.com/fupdec/mediaChips/releases/latest).
2. Make it executable:

```bash
chmod +x MediaChips-*.AppImage
./MediaChips-*.AppImage
```

### Linux: the window is blank, black or the app closes right after start

Try these in order and note which one helps; then attach the log (see below) to your report.

```bash
# 1. Software rendering (graphics driver problems, e.g. Nvidia)
MEDIA_CHIPS_DISABLE_GPU=1 ./MediaChips-*.AppImage

# 2. Force X11 instead of Wayland
./MediaChips-*.AppImage --ozone-platform=x11

# 3. AppImage sandbox errors ("chrome-sandbox", "SUID sandbox helper")
./MediaChips-*.AppImage --no-sandbox
```

`--no-sandbox` turns off a Chromium security feature, so use it only if option 3 is the one that fixes the start.

### Where the logs are

Open **Settings → About → Diagnostic logs** to read, copy or download them. If the app does not start far enough to open Settings, the files are in the data folder (on Linux usually `~/.config/MediaChips/logs/`): `server.log` for the background server and `main.log` for the desktop shell. Please include `XDG_SESSION_TYPE` (`echo $XDG_SESSION_TYPE`) and your graphics driver (`nvidia-smi` or `glxinfo -B`) when reporting a Linux problem.

---

## Troubleshooting (macOS)

### "MediaChips is damaged and can't be opened"

This usually means the downloaded file is still quarantined, or you are using an older unsigned build:

```bash
xattr -rd com.apple.quarantine /Applications/MediaChips.app
codesign --force --deep --sign - /Applications/MediaChips.app
open /Applications/MediaChips.app
```

If that does not help, download the latest release — newer builds are ad-hoc signed in CI.

### App won't open

1. Open **System Settings** → **Privacy & Security**.
2. Scroll to **Security**.
3. Click **Open Anyway** next to MediaChips.

### Still not working

Remove the app and install again:

```bash
sudo rm -rf /Applications/MediaChips.app
```

Then redownload from [GitHub Releases](https://github.com/fupdec/mediaChips/releases/latest) and follow the installation steps above.

---

## Need help?

- [GitHub Issues](https://github.com/fupdec/mediaChips/issues)
- [GitHub Discussions](https://github.com/fupdec/mediaChips/discussions)
- [Discord](https://discord.gg/dEQPper2yu)
- [Reddit](https://reddit.com/r/mediachips/)
