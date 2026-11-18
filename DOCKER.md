# MediaChips on Docker / Synology / NAS

Self-host MediaChips as a single container. Browse from any device on your LAN.

## Quick start (desktop Docker)

```bash
cp .env.docker.example .env   # optional: MEDIA_CHIPS_PUBLIC_HOST / PUID / PGID
docker compose up -d
```

This pulls `vinsdoe/mediachips:latest` and publishes **http://localhost:12321** (port `12321`).

To rebuild from source instead of pulling:

```bash
# in docker-compose.yml: uncomment `build: .` and set image: mediachips:local
docker compose up -d --build
```

### Add media

Host folders must be mounted into the container (see `docker-compose.yml`):

| Host path | Path inside container (use this in UI) |
|-----------|----------------------------------------|
| `/Users/you/Movies` | `/media/movies` |
| `/volume1/video` | `/media/video` |
| `D:\Videos` (Windows Docker Desktop) | `/media/videos` |

In **Add media**, click a mounted folder chip or paste an in-container path such as:

```text
/media/movies/torrents/Some Folder
```

Do **not** paste Mac/Windows host paths (`/Users/...`, `D:\...`) — the container cannot see them.

## Synology DSM

1. Install **Container Manager**.
2. Create folders, for example:
   - `/volume1/docker/mediachips/data`
   - ensure your library exists under `/volume1/video` (or edit the compose file).
3. Copy [`docker-compose.synology.yml`](./docker-compose.synology.yml) into a Project, then edit:
   - volume host paths
   - `MEDIA_CHIPS_PUBLIC_HOST` → NAS IP from **Control Panel → Network**
   - `PUID` / `PGID` → DSM user that owns the media folders (`id youruser` over SSH)
   - `TZ`
4. Start the project, open `http://NAS-IP:12321`.

### Phone companion (PWA)

1. Enable LAN access (or set `MEDIA_CHIPS_ALLOW_LAN=1`).
2. On your phone, open the share URL from Home / Settings (same Wi‑Fi).
3. Use the browser menu **Add to Home Screen** for a standalone icon. Chrome’s Install banner usually needs **HTTPS** (put a reverse proxy in front if you want that).
4. Browse, play, favorite, and tag as usual. Password protection works with API Bearer headers and `?token=` on media streams.
5. Non-browser codecs rely on host **ffmpeg** live transcode — keep it enabled for phones.

Pre-built images (after a release/CI push):

```text
# Docker Hub (existing public repo)
vinsdoe/mediachips:latest
vinsdoe/mediachips:1.6.0

# GitHub Container Registry
ghcr.io/fupdec/mediachips:latest
ghcr.io/fupdec/mediachips:1.6.0
```

Image architectures: `linux/amd64`, `linux/arm64`.

## Important environment variables

| Variable | Purpose |
|----------|---------|
| `MEDIA_CHIPS_DATA_DIR` | Persistent data root (`config.json`, `app_storage/`) |
| `MEDIA_CHIPS_ALLOW_LAN` | Bind `0.0.0.0` and allow LAN browser origins |
| `MEDIA_CHIPS_PUBLIC_HOST` | LAN/NAS IP used in the “open on other devices” link |
| `MEDIA_CHIPS_MEDIA_ROOTS` | Optional comma-separated mount roots (default: directories under `/media`) |
| `PUID` / `PGID` | Run as this UID/GID (Synology permission match) |
| `TZ` | Container timezone |
| `FFMPEG_PATH` / `FFPROBE_PATH` | System ffmpeg binaries in the image |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Main Google Drive OAuth client (also reused by extra Google Drive accounts without their own) |
| `GOOGLE_OAUTH_REDIRECT_URI` | Optional Google Drive callback; a loopback address on a port other than the API port is ignored |
| `MEDIA_CHIPS_CLOUD_REDIRECT_URI` | Optional callback for server-side cloud OAuth clients, e.g. `https://host/api/cloud-accounts/oauth/callback` |
| `MEDIA_CHIPS_CLOUD_{GOOGLE,ONEDRIVE,DROPBOX}_CLIENT_{ID,SECRET}` | Optional OAuth client per provider; enables one-click **Connect** when id, secret and the redirect URI are all set |

## Cloud accounts on a NAS

Google Drive, OneDrive and Dropbox sign-in works on a NAS or in Docker without a public address, a reverse proxy or a relay service.

1. Create your own OAuth client with each provider and register the callback `http://127.0.0.1:12321/api/cloud-accounts/oauth/callback` (and `/api/drive/oauth/callback` for the main Google Drive). Use your container's published API port if it is not `12321`. Details per provider: [docs/cloud-oauth-release.md](./docs/cloud-oauth-release.md).
2. Open MediaChips from your computer or phone (`http://NAS-IP:12321`), add the account and press **Connect**.
3. Sign in at the provider. The browser then lands on a page that cannot be opened (`127.0.0.1` is your own device, not the NAS) — this is expected. Copy the full address from the address bar and paste it into the field MediaChips shows; the connection finishes automatically.

The server picks this mode itself: sign-in returns directly only when your browser runs on the same machine as the API or the callback is a public address. Pending sign-ins last 10 minutes and are lost on container restart; just start again. Tokens live in the data volume (`MEDIA_CHIPS_DATA_DIR`), so keep it mounted between updates.

To get a one-click **Connect** button for everyone who uses your server, set the optional `MEDIA_CHIPS_CLOUD_*` variables below. Without them each account takes its own client id and secret in its advanced settings, and extra Google Drive accounts can reuse the main Google Drive client.

## Backup

Back up the data volume (`/data` → `config.json` + `app_storage`). Media files are your mounted `/volume1/...` shares — back them up separately.

## Reverse proxy (optional)

Point DSM reverse proxy / HTTPS to `http://localhost:12321`. Keep WebSocket support enabled for live tasks.

## Forgot the password

The password lock belongs to the active library. To reset it, create an empty `RESET_PASSWORD` (or `RESET_PASSWORD.txt`) file in the data volume next to `app_storage`, for example:

```bash
docker exec mediachips touch /data/RESET_PASSWORD
```

(use your container name and `MEDIA_CHIPS_DATA_DIR`). Then press **Log in** on the lock screen: the password of the active library is removed, the lock turns off and the file is deleted. Set a new password in Settings. Other libraries are not affected.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `File not found` when adding | Path is not mounted; use `/media/...` from the dialog chips |
| Share link shows `172.x.x.x` | Set `MEDIA_CHIPS_PUBLIC_HOST` to the NAS LAN IP |
| Permission denied writing DB/thumbs | Align `PUID`/`PGID` with folder owner |
| Build on NAS is slow/fails | Pull `vinsdoe/mediachips` (or `ghcr.io/fupdec/mediachips`) instead of building |
