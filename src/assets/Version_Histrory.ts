export const history = [
  {
    id: '1.0.2',
    version: 'v1.0.2',
    name: 'Media previews on import restored',
    content: `
      <p><strong>MediaChips v1.0.2</strong> restores immediate metadata and video preview generation when adding files, while keeping fast duplicate detection.</p>
      <h3>Highlights:</h3>
      <ul>
        <li><strong>Import previews</strong> — metadata and video thumbnails are generated during add again</li>
        <li><strong>Fast duplicates</strong> — basename/filesize checks with background content hashing</li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li><strong>From v1.0.1:</strong> in-app auto-update should deliver v1.0.2</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '1.0.1',
    version: 'v1.0.1',
    name: 'Stability fix for media imports',
    content: `
      <p><strong>MediaChips v1.0.1</strong> fixes a server hang that could make the app unusable after adding files, plus Windows UI polish.</p>
      <h3>Highlights:</h3>
      <ul>
        <li><strong>Media import stability</strong> — background thumbnail and metadata generation is now queued with concurrency limits</li>
        <li><strong>Windows sidebar</strong> — fixed phantom scrollbar in the navigation panel</li>
        <li><strong>Windows menu bar</strong> — simplified system menu order</li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li><strong>From v1.0.0:</strong> in-app auto-update should deliver v1.0.1</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '1.0.0',
    version: 'v1.0.0',
    name: 'First stable Vue 3 release',
    content: `
      <p><strong>MediaChips v1.0.0</strong> is the first stable release of the Vue 3 rewrite — migration support, onboarding, performance improvements, and production polish.</p>
      <h3>Highlights:</h3>
      <ul>
        <li><strong>LowDB migration</strong> — automatic detection and wizard for legacy databases</li>
        <li><strong>Onboarding wizard</strong> — first-launch setup with resumable progress</li>
        <li><strong>Tag page layouts</strong> — switchable designs per tag category</li>
        <li><strong>Field pinning</strong> — drag-and-drop boards for metadata assignment</li>
        <li><strong>Windows tray</strong> — optional minimize-to-tray on close</li>
        <li><strong>Performance</strong> — faster startup, duplicate finder SQL indexes, watched-folder imports</li>
        <li><strong>Quality</strong> — 485 unit tests and 16 E2E scenarios</li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li><strong>From v0.14.x-beta:</strong> in-app auto-update should deliver v1.0.0</li>
        <li><strong>macOS (unsigned):</strong> see INSTALLATION.md for Gatekeeper steps</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '0.14.2-beta',
    version: 'v0.14.2-beta',
    name: 'Windows drag-and-drop and database fixes',
    content: `
      <p><strong>MediaChips v0.14.2-beta</strong> fixes Windows folder drag-and-drop, confines the drop overlay to the main content area, and resolves media insert failures with <code>better-sqlite3</code>.</p>
      <h3>Fixed:</h3>
      <ul>
        <li><strong>Windows folder drag-and-drop</strong> — <code>webUtils.getPathForFile</code> in preload for correct folder paths</li>
        <li><strong>Drag-and-drop overlay</strong> — limited to the main content area below the app bar</li>
        <li><strong>Media insert failures</strong> — normalized SQLite bind values for <code>better-sqlite3</code></li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li><strong>From v0.14.1-beta:</strong> in-app auto-update should deliver this beta</li>
        <li><strong>From v0.14.0-beta or older:</strong> install the latest v0.14.x-beta manually once</li>
        <li><strong>macOS (unsigned):</strong> use <strong>Download DMG</strong> in the update notification</li>
        <li><strong>Portable</strong> Windows builds still require a manual download</li>
        <li>This is a <strong>beta</strong> — report issues on GitHub before stable v0.14.0</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '0.14.1-beta',
    version: 'v0.14.1-beta',
    name: 'Electron 42 and Windows build fixes',
    content: `
      <p><strong>MediaChips v0.14.1-beta</strong> upgrades to Electron 42 and Vite 8, replaces native dependencies for packaged Windows builds, and fixes Task API, license activation, and global search issues.</p>
      <h3>Added:</h3>
      <ul>
        <li><strong>Global search UX</strong> — virtual scrolling and keyboard navigation</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li><strong>Electron 42 and Vite 8</strong> with Rolldown-compatible build configuration</li>
        <li><strong>Database layer</strong> — <code>better-sqlite3</code> with Sequelize adapter and Node/Electron rebuild scripts</li>
        <li><strong>Image processing</strong> — Jimp instead of <code>sharp</code> for metadata, thumbnails, and batch generation</li>
        <li><strong>Video processing</strong> — spawn-based ffmpeg helpers; binaries unpacked from asar on Windows</li>
        <li><strong>Separate player window</strong> — synced title, stop on close, improved Windows chrome</li>
        <li>Dependency cleanup — removed unused <code>lodash-es</code>, <code>vue-drag-drop</code>, and <code>vuewordcloud</code></li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li><strong>Windows packaged builds</strong> — Task API routes, video image generation, timeline generation, and file resolution</li>
        <li><strong>Windows license registration</strong> — device ID lookup via Electron IPC and fallback HTTP endpoints</li>
        <li>Electron API calls using LAN IP instead of localhost; license fingerprint in dev mode</li>
        <li>Global search hover preview aspect ratio for video results</li>
        <li>Task API registration when native image processing fails to load on Windows Electron</li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li><strong>From v0.14.0-beta:</strong> in-app auto-update should deliver this beta</li>
        <li><strong>From v0.13.1 or older:</strong> install v0.14.0-beta or v0.14.1-beta manually once</li>
        <li><strong>macOS (unsigned):</strong> use <strong>Download DMG</strong> in the update notification</li>
        <li><strong>Portable</strong> Windows builds still require a manual download</li>
        <li>This is a <strong>beta</strong> — report issues on GitHub before stable v0.14.0</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '0.14.0-beta',
    version: 'v0.14.0-beta',
    name: 'Home widgets and settings overhaul',
    content: `
      <p><strong>MediaChips v0.14.0-beta</strong> redesigns the home page and settings, adds audio and text media types, and fixes a critical production-build bug where tags and media did not load from packaged installers.</p>
      <h3>Added:</h3>
      <ul>
        <li><strong>Redesigned home page</strong> with configurable widgets (stats, extended stats, continue watching, favorites, top views, markers, health alerts, top tags, quick actions)</li>
        <li><strong>Audio</strong> and <strong>text</strong> media types with full backend and UI support</li>
        <li><strong>SFW mode</strong> — optional blur for images in the main content area</li>
        <li><strong>Persistent interface zoom</strong> with keyboard shortcuts and settings</li>
        <li><strong>Markers page</strong> — filtering, sorting, infinite scroll, and thumbnail generation</li>
        <li><strong>Settings → Video</strong> tab; <strong>field pinning</strong> with drag-reorder</li>
        <li><strong>Database maintenance tools</strong> and batch video image generation</li>
        <li><strong>Mute toggle</strong> on fullscreen video hover preview</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li><strong>Settings</strong> reorganized into General, Appearance, Library, Files, Video, and About tabs</li>
        <li>Improved <strong>items pagination</strong>, infinite scroll, smart playlists, and saved filters UI</li>
        <li>Settings lists show <strong>database sizes</strong>; filters drawer readability improved</li>
        <li><strong>Item context menu</strong> labels localized across all locales</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li><strong>Production builds (DMG/installers)</strong> — tags and media lists empty because server code imported from excluded <code>src/</code></li>
        <li>API routing gaps; macOS auto-update for unsigned builds</li>
        <li>License activation, tag page tabs, player error layout, import duplicates</li>
        <li>System player on Windows 11; country flags with commas in names</li>
        <li>Image viewer, list pagination regressions, settings scroll layout</li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li><strong>From v0.13.1:</strong> in-app auto-update should deliver this beta</li>
        <li><strong>From v0.13.0 or older:</strong> install v0.13.1 or v0.14.0-beta manually once</li>
        <li><strong>macOS (unsigned):</strong> use <strong>Download DMG</strong> in the update notification</li>
        <li><strong>Portable</strong> Windows builds still require a manual download</li>
        <li>This is a <strong>beta</strong> — report issues on GitHub before stable v0.14.0</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '0.13.1',
    version: 'v0.13.1',
    name: 'In-app auto-update',
    content: `
      <p><strong>MediaChips v0.13.1</strong> adds in-app auto-update, automated GitHub releases, Images media type, server-side pagination, and Windows Electron UI fixes.</p>
      <h3>Added:</h3>
      <ul>
        <li><strong>In-app auto-update</strong> for Windows (NSIS) and Linux (AppImage); on macOS — check for updates and download DMG (unsigned build)</li>
        <li><strong>Settings → About</strong> — manual update check and “check at startup” option</li>
        <li><strong>GitHub Actions</strong> — CI and multi-platform release pipeline</li>
        <li><strong>Images media type</strong> across backend and UI</li>
        <li><strong>Server-side media pagination</strong> and virtual grid for infinite scroll</li>
        <li><strong>CLIP on demand</strong> — video recognition model downloaded from the import dialog (~150 MB)</li>
        <li>Localized <strong>About</strong> dialog with auto-parsed dependencies</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li>Smaller installers — CLIP no longer bundled</li>
        <li>macOS: separate arm64 and x64 DMG/ZIP builds</li>
        <li>Windows Electron header UI polish; SystemBar only on Windows</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li>Blank white Electron window on Windows 11</li>
        <li>About dialog on macOS; production build import error</li>
        <li>List page regressions after pagination</li>
      </ul>
      <h3>Notes:</h3>
      <ul>
        <li>Users on <strong>v0.13.0</strong> must install v0.13.1 manually once</li>
        <li><strong>macOS (unsigned):</strong> use <strong>Download DMG</strong> in the update notification — in-place install is blocked by Apple</li>
        <li><strong>Portable</strong> Windows builds still require a manual download</li>
        <li>Full changelog: <a href="https://github.com/fupdec/MediaChips/blob/master/CHANGELOG.md" target="_blank">CHANGELOG.md</a></li>
      </ul>
    `,
  },
  {
    id: '0.13.0',
    version: 'v0.13.0-beta',
    name: 'Vue 3 rewrite',
    content: `
      <p><strong>MediaChips v0.13.0</strong> is a major release: a full rewrite of the application on a modern stack while keeping the same core idea — organize local media, attach rich metadata, filter, and play files from your own library.</p>
      <p>
        🌐 <strong>Website:</strong> <a href="https://mediachips.app" target="_blank">mediachips.app</a><br>
        📖 <strong>Installation:</strong> <a href="https://github.com/fupdec/mediaChips/blob/master/INSTALLATION.md" target="_blank">INSTALLATION.md</a><br>
        🕰 <strong>Previous version (Vue 2):</strong> <a href="https://github.com/fupdec/mediaChips/releases/tag/v0.12.5-beta" target="_blank">v0.12.5-beta</a> · branch <a href="https://github.com/fupdec/mediaChips/tree/legacy/vue2" target="_blank">legacy/vue2</a>
      </p>
      <h3>Highlights</h3>
      <ul>
        <li><strong>Vue 3 rewrite</strong> — new UI on Vue 3, Vite, Vuetify 3, and Pinia</li>
        <li><strong>Modern desktop stack</strong> — Electron 39, Express 5, Sequelize + SQLite</li>
        <li><strong>Local AI tools</strong> — path tag parser and optional video frame recognition (runs locally, no Python)</li>
        <li><strong>Database migration</strong> — import from legacy LowDB databases (Vue 2 era)</li>
        <li><strong>LAN access</strong> — browse your library from other devices on the local network</li>
        <li><strong>Privacy unchanged</strong> — no telemetry, no data collection, fully open source (GPL-3.0)</li>
      </ul>
      <h3>Added:</h3>
      <ul>
        <li>Full <strong>Vue 3 + Vite + Vuetify 3</strong> frontend rewrite</li>
        <li><strong>Local path tag parser</strong> with optional ML-based semantic matching (<code>@xenova/transformers</code>)</li>
        <li><strong>Video object recognition</strong> — suggest tags from video frames using a bundled local CLIP model</li>
        <li><strong>Migration from LowDB</strong> — move data from older MediaChips databases (Vue 2)</li>
        <li><strong>In-app documentation</strong> with contextual help in settings and dialogs</li>
        <li><strong>Improved file moving</strong> — progress reporting, free disk space checks, cross-drive copy support</li>
        <li><strong>Navigation menu visibility</strong> settings</li>
        <li><strong>Metadata pinning</strong> improvements in media and tag edit dialogs</li>
        <li><strong>Docker</strong> support (<code>Dockerfile</code>, <code>docker-compose.yml</code>)</li>
        <li>Redesigned <strong>media and tag editing</strong> dialogs with a compact hero layout</li>
        <li><strong>Mobile-friendly</strong> navigation and stats cards on the home page</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li>Default branch <code>master</code> now contains the <strong>Vue 3 codebase</strong> (clean release history)</li>
        <li>Build system moved from <strong>Webpack → Vite</strong></li>
        <li>State management moved from <strong>Vuex → Pinia</strong></li>
        <li>Backend updated to <strong>Express 5</strong> with an improved task and WebSocket layer</li>
        <li>Player layout and fullscreen behavior refined</li>
        <li>README and installation docs rewritten in English</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li>Player video wrapper height constraints in fullscreen and normal mode</li>
        <li>Various UI issues in mobile navigation and home page widgets</li>
      </ul>
    `,
  },
  {
    id: '0.12.5',
    version: 'v0.12.5-beta',
    name: '',
    content: `
      <h3>Added:</h3>
      <ul>
        <li>Regular expression for filter with data type "string"</li>
        <li>Floating quick action button in bottom</li>
        <li>Big preview mode for videos</li>
        <li>Option for playing sound of video in preview</li>
        <li>Customizable delay before video preview</li>
        <li>Quick filter by tag from tag's menu in card view</li>
        <li>Editing pinned meta from customizing toolbar</li>
        <li>System dialog for select folder or file for watched folders and backups</li>
        <li>Text in mark with type "bookmark" in video player</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li>Notifications</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li>Selection design</li>
        <li>Header design on tag's page</li>
      </ul>
    `,
  },
  {
    id: '0.12.4',
    version: 'v0.12.4-beta',
    name: '',
    content: `
      Improved performance and stability
      <h3>Added:</h3>
      <ul>
        <li>Editing multiple items</li>
        <li>Duration in default meta</li>
        <li>Editing count of view</li>
        <li>Option for parsing tags when adding new files</li>
        <li>Editing watched folder when option is inactive</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li>Watched folders</li>
        <li>Default meta on tag's page</li>
        <li>Saving image which size more than 2 MB</li>
        <li>Showing string meta type in card</li>
        <li>Sort on tag page</li>
        <li>Opening random item</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li>Locked button "Create new tab" on tag's page</li>
        <li>File path editing</li>
        <li>More compacted view for inactive filters in panel</li>
      </ul>
    `,
  },
  {
    id: '0.12.3',
    version: 'v0.12.3-beta',
    name: '',
    content: `
      <h3>Fixed:</h3>
      <ul>
        <li>Activation key</li>
        <li>Updating config</li>
      </ul>
    `,
  },
  {
    id: '0.12.2',
    version: 'v0.12.2-beta',
    name: '',
    content: `
      <h3>Added:</h3>
      <ul>
        <li>Add new files directly from the watched folder dialog. And also delete lost files.</li>
        <li>Check and remove duplicates when adding new files.</li>
        <li>Saving window sizes.</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li>With an empty filter it was impossible to get items, the loading was endless.</li>
        <li>Watched folders have been restored.</li>
        <li>Activate the application for new databases. 
        Reactivate the key in the settings to activate the application once.</li>
        <li>Update file name when bulk editing paths.</li>
      </ul>
    `,
  },
  {
    id: '0.12.1',
    version: 'v0.12.1-beta',
    name: '',
    content: `
      <h3>Added:</h3>
      <ul>
        <li>Video player in separate window.</li>
        <li>Negative conditions in filters for tags.</li>
        <li>Hiding default metadata in cards.</li>
        <li>XXL card size.</li>
        <li>Sorting types for videos.</li>
        <li>Synonyms in global search and syntax highlighting.</li>
      </ul>
      <h3>Fixed:</h3>
      <ul>
        <li>Selecting filters.</li>
        <li>Sometimes the first page was not displayed when filtering.</li>
        <li>Update tag's info after editing on the tag's page.</li>
        <li>Sidebar overlay when displaying filters.</li>
      </ul>
      <h3>Changed:</h3>
      <ul>
        <li>Time in editing dialog.</li>
        <li>Dialog for adding new filters switched to autocomplete.</li>
        <li>Pinned tags in cards are sorted alphabetically.</li>
        <li>Ratings in cards for custom meta.</li>
      </ul>
    `,
  },
  {
    id: '0.12.0',
    version: 'v0.12.0-beta',
    name: '',
    content: `
    <h3>Added</h3>
    <ul>
        <li> 
            <b>Local server</b>
            <p>Running app on any device in local network</p>
        </li>
        <li> 
            <b>Video player:</b>
            <ul>
                <li>Video preview on timeline hover</li>
                <li>Infinite number of videos in playlist</li>
                <li>Playback speed</li>
                <li>Editing video from player</li>
                <li>End time for marks</li>
                <li>Mark duration on timeline</li>
                <li>Mark image preview on timeline</li>
                <li>Picture-in-picture mode</li>
            </ul>
        </li>
        <br>
        <li>Multiple databases</li>
        <li>Design for mobile devices</li>
        <li>Play and navigate video on hover</li>
        <li>Group chips in card</li>
        <li>Automatically generate a default video thumbnail if it is lost</li>
        <li>Preset video metadata: bitrate, framerate, codec</li>
        <li>Documentation inside app</li>
        <li>Tasks menu in appbar</li>
        <li>Global search for tags in appbar</li>
    </ul>
    <br>
    
    <h3>Updated</h3>
    <ul>
        <li>Design of Filtering system</li>
        <li>Design of items card</li>
        <li>Complex and simple meta united in meta</li>
        <li>Meta type "array" now is "tags"</li>
        <li>Selecting items</li>
        <li>Scraper for adult performers</li>
    </ul>
    <br>

    <h3>Deprecated</h3>
    <ul>
        <li>Separate window for internal video player</li>
        <li>Accent color</li>
        <li>Color scrollbar</li>
    </ul>
    <br>

    <h3>In progress</h3>
    <ul>
        <li>Tag's page</li>
        <li>Drag menu items to change their order</li>
        <li>Editing multiple items: media and tags</li>
        <li>Copy and paste meta</li>
    </ul>`,
  },
  {
    id: '0.11.3',
    version: 'v0.11.3-beta',
    date: 'Feb 24, 2023, 5:31 PM GMT+3',
    name: '',
    content: `
    <h3>Added</h3>
    <ul>
        <li>m2ts video format support.</li>
    </ul>
    <br>
    <h3>Fixed</h3>
    <ul>
        <li>Scraper</li>
    </ul>`,
  },
  {
    id: '0.11.2',
    version: 'v0.11.2-beta',
    date: 'Feb 9, 2022, 6:24 PM GMT+3',
    name: '',
    content: `
    <h3>Added:</h3>
    <ul>
    <li>Option for view counting.</li>
    <li>Shortkey for quit in macOS (Cmd + Q).</li>
    </ul>
    <h3>Fixed:</h3>
    <ul>
    <li>Checking for new versions.</li>
    <li>The generation of images was launched with the timeline preview option turned off. <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/138">#138</a></li>
    <li>Slightly optimized application performance during timeline image generation. This was achieved by adding a delay of half a second after the generation of each frame. When generating a frame, the CPU is still used at 100%, but the process of generating one frame is very fast.</li>
    <li>When you had already closed the player but it was still blocking access to the file being played.</li>
    <li>It was not possible to move the file to another drive.</li>
    <li>More accurate movement of files through the context menu. This function can no longer be run twice, which previously resulted in excessive resource usage. Also, during the move, an icon is displayed in the status bar.</li>
    </ul>
    <h3>Changed:</h3>
    <ul>
    <li>Jump to page was a dropdown list, and became an input field.</li>
    <li>App icon.</li>
    <li>Logo during application launch with animation.</li>
    <li>Default image for cards (it shows a ghost).</li>
    <li>The app's default colors are now purple and yellow hues.</li>
    <li>On macOS, when you close the application, it closes immediately (the error still occurs).</li>
    <li>Update to the latest version of Electron 17.</li>
    </ul>`,
  },
  {
    id: '0.11.1',
    version: 'v0.11.1-beta',
    name: '',
    date: 'Nov 11, 2021, 6:12 PM GMT+3',
    content: `
    <h3>Added:</h3>
    <ul>
    <li>In the context menu for video cards, the item "Play in the system player" has been added and the item for adding to the playlist has been changed.</li>
    </ul>
    <h3>Fixed:</h3>
    <ul>
    <li>Start generating images for storyboard.</li>
    <li>Filters dialog did not work due to incorrect migration.</li>
    </ul>
    <h3>Changed:</h3>
    <ul>
    <li>Removed "Select All Items" function due to incompatibility with the current version of the plugin.</li>
    <li>Reduced padding for fast filters.</li>
    </ul>`,
  },
  {
    id: '0.11.0',
    version: 'v0.11.0-beta',
    name: '',
    date: 'Oct 18, 2021, 1:19 AM GMT+3',
    content: `
    <h3>Added:</h3>
    <ul>
    <li>Support for movies. <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/41">#41</a> <a href="https://mediachips.app/docs/how-to-add-movies/" rel="nofollow">Guide in documentation.</a></li>
    <li>Sort videos by resolution (only by height).</li>
    <li>Storyboard view for videos and compact view for meta cards (switchable in the upper right corner).</li>
    <li>Filters by the number of views and the date of the last view (for videos), by the number of videos (for meta cards).</li>
    <li>The built-in player has buttons for fast rewinding 2 and 5 seconds back or forward.</li>
    </ul>
    <h3>Fixed:</h3>
    <ul>
    <li>Favorite button was overlapped with edit buttons.</li>
    <li>When I pressed the Escape button, the built-in player remained in full screen mode.</li>
    </ul>
    <h3>Changed:</h3>
    <ul>
    <li>Slightly reduced the size of some buttons in the built-in player.</li>
    <li>Checking for new versions of the application is now enabled by default.</li>
    </ul>`,
  },
  {
    id: '0.10.6',
    version: 'v0.10.6-beta',
    name: '',
    date: 'Oct 2, 2021, 6:41 PM GMT+3',
    content: `
    <h3>Fixed:</h3>
    <ul>
    <li>Migration, which prevented many functions of the application from working. <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/120">#120</a></li>
    <li>Opening card page <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/93">#93</a></li>
    </ul>`,
  },
  {
    id: '0.10.5',
    version: 'v0.10.5-beta',
    name: '',
    date: 'Oct 1, 2021, 3:49 PM GMT+3',
    content: `
    <h3>Added:</h3>
    <ul>
    <li>Dynamic playlists based on saved video filters.</li>
    <li>Saved filters under the heading with the option to turn off in the settings.</li>
    <li>Dropzone for adding videos. Drag a video or folder to the page to quickly jump into the video adding process (on the home page, the meta card page and the videos page).</li>
    <li>Color and country are now available when editing multiple meta cards.</li>
    <li>A page with files where you can view the files on your computer. Images can be opened in the built-in viewer.*</li>
    <li>Automatic creation of a backup (only databases, no pictures) every half hour.</li>
    <li>The number of views for the video and the date it was last viewed. You can sort videos by these parameters. The data can be viewed in the video editing dialog.</li>
    <li>Widget with 10 most viewed videos.</li>
    <li>The size of the generated images in the settings on the database tab.</li>
    <li>Added version of the database in the status bar.</li>
    <li>On the meta card page:
    <ul>
    <li>An option in the settings that allows you to display the header image either in front of the profile or behind the profile.</li>
    </ul>
    </li>
    </ul>
    <h3>Fixed:</h3>
    <ul>
    <li>Clears the search text in the text box after adding a value. <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/79">#79</a></li>
    <li>The zoom was not saved if it was changed from the system menu on macOS.</li>
    <li>After adding a marker in the built-in player, a new meta value was added to the end. It is now added in alphabetical order.</li>
    <li>If the tabs do not fit, then the tab navigation arrows did not appear.</li>
    <li>Data parser for freeones.com.</li>
    <li>The state of the widgets was saved incorrectly after customization.</li>
    </ul>
    <h3>Changed:</h3>
    <ul>
    <li>Removed sidebar position option - hidden.</li>
    <li>Reduced the font size and indents of the page headings to save space. It also shows the number of filtered items and how many items in total.</li>
    <li>For video cards, the tooltip above the meta icon has been replaced with pop-up text. This sped up performance a bit.</li>
    <li>Switching the sorting direction by clicking on the active sorting option.</li>
    <li>On the home page:
    <ul>
    <li>Removed second button "Customize Widgets".</li>
    <li>At the first launch, dialogs are combined with the creation of meta and the creation of the most popular cards.</li>
    </ul>
    </li>
    <li>On the meta card page:
    <ul>
    <li>If there are no images, then images from the video are shown, if any.</li>
    </ul>
    </li>
    </ul>
    <p>*experimental function, to see it you need to activate the option in the settings.</p>`,
  },
  {
    id: '0.10.2',
    version: 'v0.10.2-beta',
    name: 'Jade',
    date: 'Sep 9, 2021, 2:30 AM GMT+3',
    content: `<h3>Added:</h3>
    <ul>
    <li>In the meta settings, there is a dialog with a choice and a quick search by icon.</li>
    <li>Quick filter for meta cards by color.</li>
    <li>Ability to choose which folders to watch.</li>
    <li>Reassign the order of the meta in the navbar. Works only if the navbar is on the side.</li>
    <li>Option to display experimental functions.</li>
    </ul>
    <h3>Fixed:</h3>
    <ul>
    <li>Dynamically updating the size of meta cards when the application is first launched.</li>
    <li>Dynamically updating the meta list.</li>
    <li>Filter by bookmarks for meta cards.</li>
    <li>Initializing the sorting state on the video page.</li>
    <li>The scraper would sometimes show empty values ​​in fields that were already filled in.</li>
    <li>When adding a new playlist, sometimes videos from other playlists were added to it.</li>
    <li>When scraping the data, the image for the last card did not have time to be processed.</li>
    <li>Rating and favorites are displayed in the card description and for meta cards, if the corresponding option is selected.</li>
    </ul>
    <h3>Changed:</h3>
    <ul>
    <li>The quick filter by the first letter combines the "symbol" and "number" buttons.</li>
    <li>Added separators in navbar.</li>
    <li>Removed setting for meta cards that allowed images to be disabled.</li>
    <li>On meta cards, the meta title tooltip has been replaced with a system tooltip to improve performance.</li>
    </ul>`,
  },
  {
    id: '0.10.1',
    version: 'v0.10.1-beta',
    name: 'Ivy',
    date: 'Sep 4, 2021, 2:30 AM GMT+3',
    content: `<h3>Added:</h3>
    <ul>
    <li>Open duplicate videos in a new tab. So far, duplicates are recognized by the same file size.</li>
    <li>Rating and favorites in the meta card editing dialog.</li>
    <li>Option to disable data update from videos at the end of the process of adding new videos.</li>
    <li>Option to show icons instead of text for applied filters.</li>
    <li>System menu for MacOS and Linux.</li>
    <li>New items in system menu:
    <ul>
    <li>Check for Updates</li>
    <li>Documentation</li>
    <li>Toggle Developer Tools</li>
    <li>About</li>
    </ul>
    </li>
    </ul>
    <h3>Fixed:</h3>
    <ul>
    <li>Parsing of synonyms. <em>Be careful - now, when parsing, a lot of meta can be added. Read the documentation to understand how the documentation works, or read the tips inside the application.</em></li>
    <li>Updating ratings and favorites for meta cards and on the meta card page.</li>
    <li>Margin in pagination container for videos page. Now more compact.</li>
    <li>Header image on meta card page.</li>
    </ul>
    <h3>Changed:</h3>
    <ul>
    <li>Application Icon.</li>
    <li>Removed icons with a cross on applied filters. Added a hover hint about the ability to remove a filter.</li>
    <li>The meta list is split into two lists with complex and simple meta for convenience.</li>
    <li>For each meta, the assigned meta is shown. Removed service information about meta: id, date of adding and editing.</li>
    </ul>`,
  },
  {
    id: '0.10.0',
    version: 'v0.10.0-beta',
    name: 'Harmony',
    date: '11 Aug, 2021, 2:30 AM GMT+3',
    content: `
<h3>Added:</h3>
<ul>
<li>Actions by clicking on chips (filter, go to the page). Also an additional action by pressing the middle mouse button.</li>
<li>Filtering by clicking on the country flag, which is displayed on meta cards.</li>
<li>Refresh file information (size, resolution, duration) from the context menu.</li>
<li>Option to hide meta with blank values on cards.</li>
</ul>
<h3>Fixed:</h3>
<ul>
<li>Date the meta cards were created.</li>
<li>Multiple professions in scraper information.</li>
</ul>
<h3>Changed:</h3>
<ul>
<li>The names of the professions when collecting information from Freeones.com.</li>
</ul>
`,
  },
  {
    id: '0.9.3',
    version: 'v0.9.3-beta',
    name: 'Gia',
    date: 'Jul 22, 2021, 1:26 AM GMT+3',
    content: `
<h3>Added:</h3>
<ul>
<li>Data scraper for multiple performers.</li>
<li>Adding standard tags, websites, performers via settings.</li>
<li>Show/hide adult content.</li>
<li>Meta card image to header of editing dialog.</li>
</ul>
<h3>Fixed:</h3>
<ul>
<li>Filter by date.</li>
<li>Updating number of views on meta card page.</li>
<li>Automatic creating image when info scraped.</li>
</ul>
`,
  },
  {
    id: '0.9.2',
    version: 'v0.9.2-beta',
    name: 'Febby',
    date: 'Jul 14, 2021, 1:26 AM GMT+3',
    content: `
<h3>Added:</h3>
<ul>
<li>New type of simple meta: Rating <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/87">#87</a></li>
<li>Sorting list of meta cards in editing dialogs. To open a dialog with settings, click on the arrow on the right inside the text field.</li>
<li>Remove from arrays for multiple editing.</li>
<li>The ability to open meta with a string type in the browser (useful for specifying social networks or the official website).</li>
<li>A bar with the progress of filling in information in the meta card editing dialog.</li>
</ul>
<h3>Fixed:</h3>
<ul>
<li>Remove assigned meta from videos.</li>
<li>Lost Videos Tab Limited to 12 Items <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/107">#107</a></li>
<li>Better color picker <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/97">#97</a></li>
<li>Sorting when meta value is undefined.</li>
<li>Start generating images for video if filters have changed.</li>
<li>Save state of items per page for meta.</li>
<li>Export backup.</li>
<li>When you click "Move File..." the default folder will be the one in which this file is located, if this file exists.</li>
</ul>
`,
  },
  {
    id: '0.9.1',
    version: 'v0.9.1-beta',
    name: 'Eva',
    date: 'Jul 4, 2021, 1:26 AM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added:</h3>
<ul>
<li>Quick filters for videos on meta card page.</li>
<li>Country on meta card page.</li>
<li>Bookmark text on meta card page.</li>
</ul>
<h3>Fixed:</h3>
<ul>
<li>Data scraper <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/98">#98</a></li>
<li>Click on cards doesn't open page <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/93">#93</a></li>
<li>Bookmark text on video card.</li>
<li>When hovering over the meta card, the second image appeared with a blank background. The animation for the second image is now smoother.</li>
</ul>
<h3>Changed:</h3>
<ul>
<li>Meta card page only for meta assigned to videos.</li>
</ul></div>
`,
  },
  {
    id: '0.9.0',
    version: 'v0.9.0-beta',
    name: 'Dani',
    date: 'Jul 1, 2021, 1:26 AM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>New meta system.</h3>
<h4>A small part of features are not yet available. See the end of the list to find out which ones.</h4>
<p>Meta is data that you can add to videos and other meta cards.<br>
There are two types of meta: <b>complex</b> and <b>simple</b>.<br>
<b>Complex </b>meta have their own page. Which have meta cards. All this can be flexibly configured to suit your needs.<br>
<b>Simple </b>meta has neither page nor cards. But you can also customize them. For now, you can add: string, number, array, boolean, and date.</p>
<h4>New features with meta:</h4>
<ul>
<li>Editing multiple cards.</li>
<li>Customizing visiblity of all meta in card.</li>
<li>Any color for meta card.</li>
<li>Different types of visual for chips.</li>
<li>Markers in built-in player with any of complex meta.</li>
<li>Parsing data for videos by any of complex meta.</li>
<li>Custom name. icon, hint for textfield.</li>
<li>Transfering simple meta with type "array" to complex meta.</li>
<li>Show/hide in navigation menu.</li>
<li>Nested view (not completed yet).</li>
</ul>
<h1>Major changes</h1>
<h3>Added:</h3>
<ul>
<li>Timelines - new type of preview for videos.</li>
<li>Editing multiple meta cards (for performers, tags, websites and all other complex meta).</li>
<li>Panels to conveniently close or save a dialog box.</li>
<li>Condition "not empty" for filters.</li>
<li>Data scrapper values validation: If the found value is not in the database, then it will be added.</li>
<li>Different colors for video definition on card.</li>
<li>Search by text is now available for bookmarks (via filter).</li>
<li>Filter videos by meta from context menu.</li>
<li>Clear generated images in settings (for grids, timelines, markers).</li>
<li>List of running background processes in status bar.</li>
<li>Color picker for header gradient.</li>
</ul>
<h3>Fixed:</h3>
<ul>
<li>Context menu appearing.</li>
<li>Selection license key for copy in clipboard.</li>
<li>Initializes the colors of the header gradient when editing.</li>
</ul>
<h3>Changed:</h3>
<ul>
<li>System bar for Linux and Mac.</li>
<li>Dialogue title design.</li>
<li>Editing multiple videos with options replace or add new items.</li>
<li>When parsing videos from context menu new meta will add to old ones.</li>
<li>Backups management. Only existing archives are visible in the list of backups. A compatibility version is added to the backups.</li>
<li>Option "Update data from videos" now only updates number of videos for meta cards.</li>
</ul>
<h3>Removed:</h3>
<ul>
<li>Type of tags (performer or video).</li>
<li>Navigation menu in system bar.</li>
<li>List of tags from videos and list of websites on performer card.</li>
<li>List of tags and list of performers on website card.</li>
</ul>
<h1>Minor changes</h1>
<h3>Added:</h3>
<ul>
<li>Borders for tabs (option).</li>
<li>Color scroll (option).</li>
<li>Red icon "play" if file doesn't exist.</li>
<li>Text if page is empty.</li>
<li>Zoom change by 1% in settings.</li>
</ul>
<h3>Changed:</h3>
<ul>
<li>Title colors for editing video dialog.</li>
<li>Unlocked filters for favorite and search field in appbar.</li>
<li>Size of bookmark icon.</li>
<li>Style of card color.</li>
<li>Easily readable file size and duration values for filters. Visible as a hint below the field.</li>
<li>Default colors.</li>
<li>Forbidden image if file with card image not exists.</li>
</ul>
<h3>Removed:</h3>
<ul>
<li>Old settings in JSON file.</li>
<li>Directories "img", "temp", "previews" in "userfiles" directory.</li>
</ul>
<h1>Temporarily unavailable</h1>
<h4>Will be available in the next release:</h4>
<ul>
<li>The website page as it used to be. But you can also open the website page and see all the videos associated with it. Now it looks the same as the performer page did before.</li>
<li>Tag meter for performers. Needs rethinking.</li>
<li>Child websites. There will be a complete system of child and parent websites with an infinite number of levels.</li>
<li>Opening URL links of the website.</li>
<li>Copy name of card to clipboard from context menu.</li>
<li>Managing data for videos from context menu (copy/paste tags, performers, websites).</li>
<li>Sort list with items in editing dialog.</li>
<li>Disable chip colors for cards.</li>
<li>Compact view of cards.</li>
<li>Home page statistics.</li>
</ul></div>
`,
  },
  {
    id: '0.8.2',
    version: 'v0.8.2-beta',
    name: 'Carter',
    date: 'May 12, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>app registration with license key</li>
<li>settings for checking updates</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>items selection <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/64">#64</a></li>
</ul>
`,
  },
  {
    id: '0.8.1',
    version: 'v0.8.1-beta',
    name: 'Bobby',
    date: 'Apr 23, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>log in status bar <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/54">#54</a></li>
<li>filtering by missing value <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/67">#67</a></li>
</ul>
<h3>Fixed</h3>
<ul>
<li>Auto-update cards after editing <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/50">#50</a></li>
<li>Folder Tree for Linux and Mac <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/72">#72</a></li>
<li>position for "Favorite" markers <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/71">#71</a></li>
<li>Save Zoom on exit <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/43">#43</a></li>
</ul>
<h3>Changed</h3>
<ul>
<li>icon color and rounded corners</li>
</ul>
`,
  },
  {
    id: '0.8.0',
    version: 'v0.8.0-beta',
    name: 'Angela',
    date: 'Apr 9, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>port for Linux (tested on Ubuntu) <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/33">#33</a></li>
<li>port for Mac <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/32">#32</a></li>
<li>bottom sheet for single video editing with playing video on the background</li>
<li>fast filters on panel: search and favorite</li>
<li>compact view for tags and websites</li>
<li>inaccurate filter for items (tags, performers, websites) in editing dialogs <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/44">#44</a></li>
<li>filter videos by tag from context menu of video card</li>
<li>alternate name filter for websites</li>
<li>brackets and other characters to delimit filter names</li>
<li>tab for app settings</li>
<li>choice of application installation path (Windows)</li>
<li>recomended size for images <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/45">#45</a></li>
<li>check icons for current state of gap size and sidebar in system menu</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>tooltip position for card size</li>
<li>padding in dialogs</li>
<li>zoom state save <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/43">#43</a></li>
<li>value overlays masked input in performer editing dialog</li>
</ul>
<h3>Changed</h3>
<ul>
<li>the libraries ffmpeg and ffprobe are now built into the app <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/37">#37</a></li>
<li>icons of the app and logo</li>
<li>sort colors by rainbow</li>
<li>"open random item" now only passes among filtered items <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/51">#51</a></li>
<li>boolean filters cannot be duplicated</li>
<li>when adding a new tag, all types are added to it so that you can immediately use this tag</li>
<li>default stencil size for image cropping</li>
</ul>
`,
  },
  {
    id: '0.7.2',
    version: 'v0.7.2-beta',
    name: '',
    date: 'Mar 28, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>number of views for performers (you may need to restart the application after the first launch). the preview counts when you open the performer page.</li>
<li>sort performers by number of views.</li>
<li>manual check for updates in settings tab "about".</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>clearing videos, tags and etc. in settings tab "database".</li>
<li>selection of items.</li>
<li>added pause after scanning each files. Now you can see the progress bar, even if there are no new ones in the process of adding video. Also  it removed freezing, if there were a lot of duplicates.</li>
<li>Fixed regular expression that determined whether the video path contains. This concerns the process of adding new files. Prior to this, if the folder name contained one of the file extensions, then all the files inside the folder identify as video.</li>
</ul>
<h3>Changed</h3>
<ul>
<li>VLC player to HTML5 player. Some formats not supported for now. But new player supports 4k and big files. Support for other formats will come in the future. The decision to switch to a different player was made when I started porting app to Linux and Mac OS.</li>
</ul>
`,
  },
  {
    id: '0.7.1',
    version: 'v0.7.1-beta',
    name: '',
    date: 'Mar 7, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>chips with included filter above pagination</li>
<li>actions with markers in the delete tag dialog, if the tag is of the video type</li>
</ul>
<h3>Fixed</h3>
<ul>
<li><a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/26">#26</a> renaming a tag caused an error if markers with this tag were open in the player</li>
<li><a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/30">#30</a> files not added if file extension is all in caps</li>
</ul>
`,
  },
  {
    id: '0.7.0',
    version: 'v0.7.0-beta',
    name: '',
    date: 'Mar 3, 2021, 8:41 PM GMT+3',
    content: `readme, c. keyboard shortcuts`,
  },
  {
    id: '0.6.7',
    version: 'v0.6.7-beta',
    name: '',
    date: 'Mar 3, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>new playlist modes: autoplay, loop, shuffle <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/15">#15</a></li>
<li>keyboard shortcuts for player <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/9">#9</a>  (see <a href="https://github.com/mediachips/mediachips/wiki/Keyboard-Shortcuts-for-Player">wiki </a> for keys)</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>when adding a new marker, the time of the marker corresponds to the time in the title of the dialog</li>
</ul>
    `,
  },
  {
    id: '0.6.6',
    version: 'v0.6.6-alpha',
    name: '',
    date: 'Mar 2, 2021, 8:41 PM GMT+3',
    content: `
<h3>Added</h3>
<ul>
<li>multiple nationalities for performers <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/24">#24</a></li>
<li>tag categories <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/21">#21</a></li>
</ul>
<h3>Fixed</h3>
<ul>
<li>skip videos in playlist if name contains hash symbol (#)</li>
<li>center of title in video player</li>
</ul>
<h3>Changed</h3>
<ul>
<li>tag "category" renamed to "type" <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/21">#21</a></li>
</ul>
    `,
  },
  {
    id: '0.6.5',
    version: 'v0.6.5-alpha',
    name: '',
    date: 'Feb 28, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>folders monitoring for new videos and lost videos <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/14">#14</a></li>
<li>add new videos from folder dialog</li>
<li>manage watched folders in settings</li>
<li>tab with lost videos</li>
<li>option "move file" for videos from context menu</li>
</ul>
<h3>Changed</h3>
<ul>
<li>profile complete circular progress on performer page</li>
<li>settings design minor optimizations</li>
</ul></div>
    `,
  },
  {
    id: '0.6.4',
    version: 'v0.6.4-alpha',
    name: '',
    date: 'Feb 23, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>open a new tab by clicking mouse middle button on the link in the navbar</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>hide button performer and website link if tab open</li>
<li>save state of tabs</li>
<li>filter with name of playlist in filter dialog</li>
</ul>
<h3>Changed</h3>
<ul>
<li>increased icon size in tab name</li>
</ul></div>
    `,
  },
  {
    id: '0.6.3',
    version: 'v0.6.3-alpha',
    name: '',
    date: 'Feb 21, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>toggle dark mode in player from main window</li>
<li>button "remove all" for filters dialog. it visible if number of filters more then 5</li>
<li>copy video info to clipboard from context menu</li>
<li>filter performers by tag from context menu and when click on chips with tag in performer's card</li>
<li>filter videos and performers by tag from context menu</li>
<li>option to hide bottom profile of performer on performers page</li>
<li>option to run update data of videos at app start (it is recommended to enable it and set the auto-update interval to maximum)</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>in player fullscreen mode visible all dialogs <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/19">#19</a></li>
<li>websites operations for video from context menu</li>
<li>filter performers by nation when click on country flag in performer's card (also available new tab on middle click)</li>
<li>change date of editing when added marker to the video</li>
<li>change date of editing when changed rating and favorite</li>
<li>save state of performer profile on its page (collapsed or opened)</li>
<li>when videos scanning if the folder is not available, then it is skipped and an error is displayed in the dialog</li>
<li>disable drag on sidebar links and on settings tabs</li>
</ul></div>
    `,
  },
  {
    id: '0.6.2',
    version: 'v0.6.2-alpha',
    name: '',
    date: 'Feb 19, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>autoupdate data from videos  <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/12">#12</a></li>
<li>filters for all pages</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>saving state of all pages <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/20">#20</a></li>
</ul>
<h3>Changed</h3>
<ul>
<li>design of settings</li>
</ul></div>
    `,
  },
  {
    id: '0.6.1',
    version: 'v0.6.1-alpha',
    name: '',
    date: 'Feb 17, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h4>Since the application is still undergoing major changes in the database, it is recommended to create backups before and after updating the application.</h4>
<h3>Added</h3>
<ul>
<li>filter parameter for video: date of editing</li>
<li>toggle system player in app menu</li>
<li>multiple websites for video</li>
<li>adding new performer to the video when added marker</li>
<li>sort videos by date of editing</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>save state of sort, page, favorites and bookmarks for videos and performers <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/6">#6</a></li>
<li>datepicker in dialog filter</li>
</ul>
<h3>Changed</h3>
<ul>
<li>restyled text for filter dialog</li>
<li>favorite and bookmark moved to filters</li>
<li>reduced size of rating stars, added dark transparent background</li>
<li>chips styles for website</li>
<li>sort direction on button</li>
<li>badge with icon of current sort type instead text</li>
<li>restyled dates of added and last edit in edit dialog</li>
</ul></div>
    `,
  },
  {
    id: '0.6.0',
    version: 'v0.6.0-alpha',
    name: '',
    date: 'Feb 14, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>new fonts: Arimo, Nunito, Raleway, Ubuntu</li>
<li>custom parameters on performer detail page and in bottom profile on performers page</li>
<li>set current frame as thumb for video (from built-in video player)</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>remove tag if the category has been removed <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/11">#11</a></li>
<li>reduced application launch time</li>
</ul>
<h3>Changed</h3>
<ul>
<li>net fonts replaced with local fonts</li>
<li>removed all italic fonts</li>
</ul>
<p>*number 6 in the version only so that the update notification comes automatically</p></div>
    `,
  },
  {
    id: '0.5.10',
    version: 'v0.5.10-alpha',
    name: '',
    date: 'Feb 12, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>hint for a tag meter</li>
<li>validation for category of tag</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>writing video info to the database when videos filtered by performer or tag</li>
<li>update markers when video ended</li>
<li>close tab with deletable performer or website</li>
<li>searching info for performer</li>
<li>adding performer (before that custom parameters didn't add to the new performer)</li>
</ul>
<h3>Changed</h3>
<ul>
<li>disabled autoplay for playlist (will be added when the function is fixed)</li>
<li>removed filter performers by nation when click on country flag (will be added when the function is fixed)</li>
</ul></div>
    `,
  },
  {
    id: '0.5.9',
    version: 'v0.5.9-alpha',
    name: '',
    date: 'Feb 10, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Fixed</h3>
<ul>
<li>custom images of performer now hidden until you hover on main image</li>
<li>temporary removed bottom sheet with performer profile info because it overlaps the bottom navbar <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/16">#16</a></li>
<li>toggle navigation side from app menu</li>
<li>profile complete progress</li>
<li>added option to menu on performer page: tag meter. this option show/hide meter of tags value</li>
<li>adding performer to favorite <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/17">#17</a></li>
<li>markers position on the timeline</li>
</ul>
<h3>Changed</h3>
<ul>
<li>deactivated heart of favorite changed from filled to outlined</li>
</ul></div>
    `,
  },
  {
    id: '0.5.8',
    version: 'v0.5.8-alpha',
    name: '',
    date: 'Feb 9, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>new filtering system for performers</li>
<li>custom parameters for performers <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/13">#13</a></li>
<li>markers management list <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/8">#8</a> with thumbs and filtering by type</li>
<li>new type of marker: performer <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/10">#10</a></li>
</ul>
<h3>Changed</h3>
<ul>
<li>built-in video player changed to WebChimera (VLC player port). this is the most important feature of this version. see details on the main page or in the readme file in the "Built-in video player" section. HEVC codec is supported now <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/5">#5</a></li>
<li>redisigned settings to tab style</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>all settings are now saved in the backup (including theme, tabs, filters, custom parameters for performers and everything else)</li>
<li>buttons with data updates are hidden on the home page if the update was successful.</li>
<li>deleting markers <a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/3">#3</a></li>
</ul>
<h3>Deprecated</h3>
<ul>
<li>tag page. there were too many difficulties with the filters on the tag page</li>
<li>video page. now almost all the functionality is in the built-in player, so there is no point in a separate page when there is a separate window</li>
</ul></div>
    `,
  },
  {
    id: '0.5.7',
    version: 'v0.5.7-alpha',
    name: '',
    date: 'Jan 26, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Changed</h3>
<ul>
<li>filtering videos (experimental)</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>error on click enter in login dialog (<a class="issue-link js-issue-link" href="https://github.com/mediachips/mediachips/issues/4">#4</a>)</li>
</ul></div>
    `,
  },
  {
    id: '0.5.6',
    version: 'v0.5.6-alpha',
    name: '',
    date: 'Jan 24, 2021, 8:41 PM GMT+3',
    content: `
<div data-pjax="true" data-test-selector="body-content" data-view-component="true" class="markdown-body my-3"><h3>Added</h3>
<ul>
<li>video player! with adding markers to the timeline, keyboard shortcuts, playlist</li>
<li>playlists!</li>
<li>video preview with image grid 3x3</li>
<li>checking for updates on start</li>
<li>sort videos by path</li>
<li>opening video and performer in a new tab from home page</li>
</ul>
<h3>Changed</h3>
<ul>
<li>buttons for changing the appearance of cards are now combined in the menu</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>number of current page saved</li>
<li>label of video resolution</li>
<li>label sizes</li>
</ul></div>
    `,
  },
  {
    id: '0.5.5',
    version: 'v0.5.5-alpha',
    name: '',
    date: 'Jan 5, 2021, 8:41 PM GMT+3',
    content: `<h3>Added</h3>
<ul>
<li>password protection</li>
<li>folder tree for filter videos</li>
<li>dialog transfer info of performer</li>
<li>filter performers by tag from context menu</li>
<li>context menu for tabs</li>
<li>filter videos by phone resolution</li>
<li>edit date for tags and websites, sort by edit date</li>
<li>child websites on website page</li>
<li>brief information from the performer profile appears if you click on the card</li>
<li>customizable gap size for card grid</li>
<li>navigation shortcuts</li>
<li>rating and favorite in card description</li>
</ul>
<h3>Changed</h3>
<ul>
<li>the number of videos is now updated manually from the settings. becaues dynamic counting takes too long but now the application is much faster.</li>
<li>info about bitrate removed from videos, added resolution</li>
<li>editing dialogs have become more compact</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>update path in videos</li>
<li>after closing the tab, the adjacent one opens</li>
</ul>`,
  },
  {
    id: '0.5.4',
    version: 'v0.5.4-alpha',
    name: '',
    date: 'Dec 18, 2020, 11:36 PM GMT+3',
    content: `
    <h3>Added</h3>
    <ul>
    <li>main and alternate images in header on performer page</li>
    <li>navigation buttons</li>
    <li>gradient for header</li>
    <li>checking for ffmpeg.exe and ffprobe.exe files before scan videos</li>
    <li>loading animation on the pages with cards</li>
    <li>filter videos by tag on the performer page</li>
    <li>ability to delete videos for selected performers and delete files from system</li>
    </ul>
    <h3>Changed</h3>
    <ul>
    <li>increased image quality</li>
    <li>unique tab for each item</li>
    <li>temporarily removed number of videos from cards (due to performance issues)</li>
    </ul>
    <h3>Fixed</h3>
    <ul>
    <li>font smooting in main view</li>
    </ul>
    `,
  },
  {
    id: '0.5.3',
    version: 'v0.5.3-alpha',
    name: '',
    date: 'Dec 15, 2020, 11:36 PM GMT+3',
    content: `
    <h3>Added</h3>
<ul>
<li>video preview on hover video card (only if video format is supported)</li>
<li>performer date of editing, sort performers by date of editing</li>
<li>badge with text of current sort type for sort button</li>
</ul>
<h3>Changed</h3>
<ul>
<li>state of button "more filters" in performer filters stored in memory</li>
<li>video label text changed to icon</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>"None" was mistakenly added to the list of parameter items of performer (you can manually remove this item from the parameters in the settings)</li>
</ul>
    `,
  },
  {
    id: '0.5.2',
    version: 'v0.5.2-alpha',
    name: '',
    date: 'Dec 6, 2020, 11:36 PM GMT+3',
    content: `
    <h3>Added</h3>
    <ul>
    <li>portable version</li>
    <li>editing performer profile parameters</li>
    <li>parallax effect on performer page</li>
    <li>info about selected items in status bar</li>
    <li>paste text from clipboard to some fields (e.g. copy performer name and paste to field of videos filter)</li>
    <li>filter performers by missing parameter</li>
    <li>progress complete profile on performer page and in cards</li>
    <li>add to favorite for tags and websites</li>
    <li>open random item</li>
    <li>filter presets for videos and performers</li>
    <li>edit buttons for videos and performers</li>
    <li>flag icon of performer card</li>
    <li>splash screen before load app</li>
    </ul>
    <h3>Changed</h3>
    <ul>
    <li>tabs view</li>
    <li>statusbar view</li>
    <li>optimized info during scanning</li>
    <li>disabled smooth scroll on cards</li>
    </ul>
    `,
  },
  {
    id: '0.5.1',
    version: 'v0.5.1-alpha',
    name: '',
    date: 'Nov 11, 2020, 8:41 PM GMT+3',
    content: `
    <h3>Fixed:</h3>
    <ul>    
    <li>user folder creation.</li>
    </ul>`,
  },
]

export default history;
