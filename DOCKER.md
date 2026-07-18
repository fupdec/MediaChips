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

Pre-built images (after a release/CI push):

```text
# Docker Hub (existing public repo)
vinsdoe/mediachips:latest
vinsdoe/mediachips:1.3.0

# GitHub Container Registry
ghcr.io/fupdec/mediachips:latest
ghcr.io/fupdec/mediachips:1.3.0
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

## Backup

Back up the data volume (`/data` → `config.json` + `app_storage`). Media files are your mounted `/volume1/...` shares — back them up separately.

## Reverse proxy (optional)

Point DSM reverse proxy / HTTPS to `http://localhost:12321`. Keep WebSocket support enabled for live tasks.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `File not found` when adding | Path is not mounted; use `/media/...` from the dialog chips |
| Share link shows `172.x.x.x` | Set `MEDIA_CHIPS_PUBLIC_HOST` to the NAS LAN IP |
| Permission denied writing DB/thumbs | Align `PUID`/`PGID` with folder owner |
| Build on NAS is slow/fails | Pull `vinsdoe/mediachips` (or `ghcr.io/fupdec/mediachips`) instead of building |
