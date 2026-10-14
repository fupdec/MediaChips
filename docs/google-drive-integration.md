# Google Drive

Google Drive is available in **Add media → Google Drive** and **Settings → Connections**. SFTP / NAS connections are managed in the same settings section. Sign-in opens a separate window (the system browser in Electron); the existing import selection stays open. The application polls the server for the authorization result, including rejection and expiry.

Files stay on Drive. Import stores a stable `gdrive://<fileId>` library identity and metadata, without downloading a local copy. Playback and image viewing use the authenticated MediaChips API proxy. Range requests are forwarded to Google for seeking. Reimporting the same file skips the duplicate; trashed entries must be restored first. Folders are expanded recursively with paginated listing. Failed and unprocessed selections remain available for retry. Stop finishes the current file before stopping.

The play button beside a file opens a live preview without importing it. Videos and audio use a temporary player item; images open directly in the viewer. Preview does not save playback position, views, metadata or markers, including for files already indexed in the library. The same action is available for local files in Add media and for new files in the Folders browser. Local text files also support direct preview. Preview playback depends on browser codecs; adding the file remains a separate action.

The Drive browser remembers the last successfully opened folder and its breadcrumb names for each library and server in browser storage. Reopening the app restores that folder; if it was deleted or access was revoked, browsing starts at the Drive root. This preference does not create a library record.

Recognized video formats include MP4, M4V, WebM, MOV, MKV, AVI, WMV, ASF, MPEG/MPG, FLV, MTS/M2TS/TS, VOB, 3GP/3GPP/3G2, OGV, MXF and RealMedia. Generic binary MIME types are normalized using the video extension for import and streaming. Audio: MP3, M4A, AAC, WAV, OGG, FLAC; images: JPEG, PNG, GIF, WebP, AVIF, BMP. Recognition permits import and preview; built-in decoding depends on browser codecs. If playback fails, **Open in Google Drive** opens the original file in Google's player in the browser, where the user must have access to the file. Remote files do not enter local FFmpeg/transcoding or filesystem maintenance. Video posters and marker images can be saved from the player’s current frame. Images are loaded directly through the proxy.

## Configure Google OAuth

1. Enable Google Drive API in a Google Cloud project.
2. Configure the consent screen and add your Google account as a test user if the app is in testing.
3. Create an OAuth client of type **Web application**.
4. Register the exact callback URL displayed in MediaChips (normally `http://localhost:12321/api/drive/oauth/callback`). For a server, use its accessible origin and the same callback path.
5. Enter Client ID, Client Secret and Redirect URI in **Settings → Connections → Google OAuth setup**, save, then connect.

Configuration can also come from `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI`. Settings saved in the UI take precedence. Read-only Drive access is requested. The Client Secret is stored in the host-local encrypted vault and never returned to the renderer. Access/refresh tokens stay in a private host-local file with mode 0600, outside static assets and library backups. The server uses one connected Google account; connecting another account changes which Drive files that server can access.

Mock mode requires explicit `MEDIA_CHIPS_DRIVE_MOCK=1`. Missing credentials show setup instructions instead of a pretend connection. The mock stream contains zero bytes and is useful for API tests, not video decoding.

OAuth callbacks require a random, expiring, single-use state. Pending authorization is invalidated on disconnect and configuration changes. Codes and state values are redacted from request logs. Streaming responses are private and not cached.

Google references: [Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive downloads and Range requests](https://developers.google.com/workspace/drive/api/guides/manage-downloads).


Pasted spaces and line breaks are removed from Client Secret values, including `.env`. The server checks the client credentials against Google's token endpoint before saving settings or opening consent, using a deliberately invalid refresh token that cannot grant account access. `invalid_grant` confirms client authentication; `invalid_client` is reported as a key mismatch. OAuth client errors, network failures and token-storage failures have separate messages.
