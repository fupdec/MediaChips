# Is MediaChips safe? Security and privacy

Short answer: MediaChips is open source (GPL-3.0), keeps your library on your computer, and contains no analytics, advertising or crash-reporting code. This page lists what it does on the network, why the installers are not code-signed, and how to check all of it yourself. It describes version 2.1.0.

## Your files and metadata stay local

- The library database, thumbnails, previews and settings live in the data folder on your computer (or on your NAS when you run the Docker image).
- Your files are not uploaded anywhere. Remote sources (Google Drive, OneDrive, Dropbox, SFTP, FTP, WebDAV, Jellyfin, Plex, Emby) are read only when **you** connect them, and only from the server you chose.
- There is no account and no sign-in with us. A purchased key is optional (see below).

## Why Windows and macOS show a warning

Windows SmartScreen and macOS Gatekeeper warn about apps that are not signed with a paid developer certificate. The MediaChips installers are **not** signed with one, so the warning is expected. It does not mean the file is malicious, and it does not mean the file is verified either. That is why the project gives you ways to check the download yourself:

- Every release is built by GitHub Actions from the tagged commit of this repository, not on a personal computer.
- Each release includes `SHA256SUMS.txt`, and newer releases carry a GitHub build attestation. How to verify both: [Verify your download](../INSTALLATION.md#verify-your-download).
- First-launch steps for each system: [INSTALLATION.md](../INSTALLATION.md).
- If you prefer, build from source: see the README.

## What MediaChips sends over the network

Nothing below sends your file names, tags, paths or library contents.

| What | When | Where | What leaves your computer |
|---|---|---|---|
| **Update check** (desktop) | At startup, if **Check for updates at startup** is on (default). Turn it off in Settings → About. | GitHub Releases (`github.com/fupdec/MediaChips`) | An ordinary web request, so GitHub sees your IP address. Updates are only downloaded after you agree. |
| **License check** | Only if you entered an activation key. On activation, deactivation and at every start while a key is stored. | `mediachips.app` | The key and a fingerprint of your device (a hash produced by the `node-machine-id` package from the system machine ID). If the server cannot be reached, the app keeps trusting the local registration. |
| **Chip recipe catalog** | When you open the recipe catalog in Settings. | `raw.githubusercontent.com` | An ordinary web request. |
| **AI model downloads** | Only when you use face recognition, semantic search (CLIP) or the local assistant model for the first time. You can also install the models manually. | Hugging Face; Real-ESRGAN from GitHub | An ordinary download request. Recognition and search then run on your computer. |
| **Web video import** | Only when you add a web video link. | The site you entered. `yt-dlp` is downloaded and updated from its GitHub releases. | The request for that page or video. |
| **Cloud accounts** | Only if you connect Google Drive, OneDrive or Dropbox. You use your own OAuth client. | Google, Microsoft and Dropbox APIs | Sign-in and file requests to that provider. Tokens are stored on the machine that runs the MediaChips server. The main Google Drive connection asks for the `drive` scope because moving originals needs write access; extra Google accounts ask for `drive.readonly`. |
| **Metadata plugins** | Only after you enable them and, where needed, enter your own key. | For example TMDB or the sites a scraper plugin targets | The search terms you trigger. |
| **Network sources** | Only after you add them. | Your own NAS, FTP/SFTP/WebDAV or media server | Your credentials go to that server only. |

Opening links such as the buy page, Discord or GitHub just opens your browser.

## What is not in the app

- No analytics, tracking, advertising or crash-reporting libraries. A search of the source and `package.json` for common ones (Sentry, PostHog, Mixpanel, Google Analytics, Amplitude and similar) finds none.
- Diagnostic logs (`logs/server.log`, `logs/main.log`) stay in your data folder. Access tokens, passwords and your home folder name are masked before writing. You decide whether to attach them to a bug report.

## Running on your network

If you enable LAN access or run the Docker image, other devices on your network can open the library in a browser. Use the password protection option in the settings, and do not expose the port to the internet without a reverse proxy and your own authentication. See [DOCKER.md](../DOCKER.md).

## Check it yourself

- **Block it:** run MediaChips offline or with a firewall rule. Everything except the items in the table above keeps working.
- **Watch it:** use a firewall log or a tool such as Wireshark and compare with the table.
- **Read it:** the code is public. The addresses above come from `electron/autoUpdater.ts`, `src/stores/registration.ts`, `api/services/chipRecipe.ts` and the face, CLIP and web-video services under `api/services`.
- **Build it:** see "Build from source" in the README.

If you find something here that does not match what the app does, please open an issue on [GitHub](https://github.com/fupdec/mediaChips/issues) or write on [Discord](https://discord.gg/dEQPper2yu).
