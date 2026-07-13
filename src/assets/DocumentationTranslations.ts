const playerHotkeys = {
  en: `
    <h2>Player hotkeys</h2>
    <table><thead><tr><th>Hotkey</th><th>Action</th><th>Description</th></tr></thead><tbody>
      <tr><td>Space</td><td>Play/Pause</td><td>Toggle playback.</td></tr>
      <tr><td>X</td><td>Stop</td><td>Stop playback.</td></tr>
      <tr><td>Z or Alt+Left</td><td>Previous video</td><td>Switch to the previous playlist item.</td></tr>
      <tr><td>C or Alt+Right</td><td>Next video</td><td>Switch to the next playlist item.</td></tr>
      <tr><td>Left / Right</td><td>Seek</td><td>Jump backward or forward. Hold Shift for a larger step.</td></tr>
      <tr><td>Up / Down</td><td>Volume</td><td>Increase or decrease volume.</td></tr>
      <tr><td>1 / 2</td><td>Create marks</td><td>Create favorite or bookmark marks at the current time.</td></tr>
      <tr><td>, / .</td><td>Navigate marks</td><td>Jump to previous or next mark.</td></tr>
      <tr><td>F / M</td><td>Display and sound</td><td>Toggle fullscreen or mute.</td></tr>
      <tr><td>P / I</td><td>Panels</td><td>Show or hide the playlist and marks panels.</td></tr>
      <tr><td>E</td><td>Edit video</td><td>Open the video editing dialog.</td></tr>
      <tr><td>Esc</td><td>Close player</td><td>Close the player when no dialog is open.</td></tr>
      <tr><td>Ctrl+Del or Alt+Del</td><td>Delete video</td><td>Delete the current video from the app.</td></tr>
      <tr><td>Ctrl+Shift+Del or Alt+Shift+Del</td><td>Delete with file</td><td>Delete the current video and its file from disk.</td></tr>
    </tbody></table>
    <h2>Mouse controls</h2>
    <table><thead><tr><th>Mouse action</th><th>Behavior</th></tr></thead><tbody>
      <tr><td>Left click</td><td>Toggle play or pause.</td></tr>
      <tr><td>Double click / middle click</td><td>Toggle fullscreen.</td></tr>
      <tr><td>Back / forward mouse buttons</td><td>Previous or next video.</td></tr>
      <tr><td>Wheel scroll</td><td>Control volume on video or timeline.</td></tr>
      <tr><td>Alt + wheel</td><td>Navigate marks.</td></tr>
      <tr><td>Ctrl + wheel</td><td>Fine seek adjustment.</td></tr>
      <tr><td>Shift + wheel</td><td>Coarse seek adjustment.</td></tr>
    </tbody></table>`,
  ru: `
    <h2>Горячие клавиши плеера</h2>
    <table><thead><tr><th>Клавиша</th><th>Действие</th><th>Описание</th></tr></thead><tbody>
      <tr><td>Space</td><td>Воспроизведение / пауза</td><td>Переключает воспроизведение.</td></tr>
      <tr><td>X</td><td>Стоп</td><td>Останавливает воспроизведение.</td></tr>
      <tr><td>Z или Alt+Left</td><td>Предыдущее видео</td><td>Переходит к предыдущему элементу плейлиста.</td></tr>
      <tr><td>C или Alt+Right</td><td>Следующее видео</td><td>Переходит к следующему элементу плейлиста.</td></tr>
      <tr><td>Left / Right</td><td>Перемотка</td><td>Перематывает назад или вперед. С Shift шаг больше.</td></tr>
      <tr><td>Up / Down</td><td>Громкость</td><td>Увеличивает или уменьшает громкость.</td></tr>
      <tr><td>1 / 2</td><td>Создать метки</td><td>Создает метку избранного или закладку в текущей позиции.</td></tr>
      <tr><td>, / .</td><td>Переход по меткам</td><td>Переходит к предыдущей или следующей метке.</td></tr>
      <tr><td>F / M</td><td>Экран и звук</td><td>Переключает полный экран или звук.</td></tr>
      <tr><td>P / I</td><td>Панели</td><td>Показывает или скрывает плейлист и список меток.</td></tr>
      <tr><td>E</td><td>Редактировать видео</td><td>Открывает диалог редактирования видео.</td></tr>
      <tr><td>Esc</td><td>Закрыть плеер</td><td>Закрывает плеер, если не открыт диалог.</td></tr>
      <tr><td>Ctrl+Del или Alt+Del</td><td>Удалить видео</td><td>Удаляет текущее видео из приложения.</td></tr>
      <tr><td>Ctrl+Shift+Del или Alt+Shift+Del</td><td>Удалить с файлом</td><td>Удаляет текущее видео и файл с диска.</td></tr>
    </tbody></table>
    <h2>Управление мышью</h2>
    <table><thead><tr><th>Действие мышью</th><th>Поведение</th></tr></thead><tbody>
      <tr><td>Левый клик</td><td>Воспроизведение или пауза.</td></tr>
      <tr><td>Двойной клик / средняя кнопка</td><td>Полноэкранный режим.</td></tr>
      <tr><td>Кнопки назад / вперед</td><td>Предыдущее или следующее видео.</td></tr>
      <tr><td>Колесо мыши</td><td>Управление громкостью на видео или таймлайне.</td></tr>
      <tr><td>Alt + колесо</td><td>Переход по меткам.</td></tr>
      <tr><td>Ctrl + колесо</td><td>Точная перемотка.</td></tr>
      <tr><td>Shift + колесо</td><td>Быстрая перемотка.</td></tr>
    </tbody></table>`,
  es: `
    <h2>Atajos del reproductor</h2>
    <table><thead><tr><th>Atajo</th><th>Acción</th><th>Descripción</th></tr></thead><tbody>
      <tr><td>Space</td><td>Reproducir / pausa</td><td>Alterna la reproducción.</td></tr>
      <tr><td>X</td><td>Detener</td><td>Detiene la reproducción.</td></tr>
      <tr><td>Z o Alt+Left</td><td>Video anterior</td><td>Cambia al elemento anterior de la lista.</td></tr>
      <tr><td>C o Alt+Right</td><td>Video siguiente</td><td>Cambia al siguiente elemento de la lista.</td></tr>
      <tr><td>Left / Right</td><td>Buscar</td><td>Salta hacia atrás o adelante. Con Shift el paso es mayor.</td></tr>
      <tr><td>Up / Down</td><td>Volumen</td><td>Sube o baja el volumen.</td></tr>
      <tr><td>1 / 2</td><td>Crear marcas</td><td>Crea una marca favorita o marcador en el tiempo actual.</td></tr>
      <tr><td>, / .</td><td>Navegar marcas</td><td>Salta a la marca anterior o siguiente.</td></tr>
      <tr><td>F / M</td><td>Pantalla y sonido</td><td>Alterna pantalla completa o silencio.</td></tr>
      <tr><td>P / I</td><td>Paneles</td><td>Muestra u oculta la lista y el panel de marcas.</td></tr>
      <tr><td>E</td><td>Editar video</td><td>Abre el diálogo de edición de video.</td></tr>
      <tr><td>Esc</td><td>Cerrar reproductor</td><td>Cierra el reproductor si no hay un diálogo abierto.</td></tr>
      <tr><td>Ctrl+Del o Alt+Del</td><td>Eliminar video</td><td>Elimina el video actual de la aplicación.</td></tr>
      <tr><td>Ctrl+Shift+Del o Alt+Shift+Del</td><td>Eliminar con archivo</td><td>Elimina el video y su archivo del disco.</td></tr>
    </tbody></table>
    <h2>Controles del mouse</h2>
    <table><thead><tr><th>Acción del mouse</th><th>Comportamiento</th></tr></thead><tbody>
      <tr><td>Clic izquierdo</td><td>Reproducir o pausar.</td></tr>
      <tr><td>Doble clic / clic central</td><td>Alternar pantalla completa.</td></tr>
      <tr><td>Botones atrás / adelante</td><td>Video anterior o siguiente.</td></tr>
      <tr><td>Rueda del mouse</td><td>Control de volumen en el video o la línea de tiempo.</td></tr>
      <tr><td>Alt + rueda</td><td>Navegar marcas.</td></tr>
      <tr><td>Ctrl + rueda</td><td>Búsqueda precisa.</td></tr>
      <tr><td>Shift + rueda</td><td>Búsqueda rápida.</td></tr>
    </tbody></table>`,
  cn: `
    <h2>播放器快捷键</h2>
    <table><thead><tr><th>快捷键</th><th>操作</th><th>说明</th></tr></thead><tbody>
      <tr><td>Space</td><td>播放 / 暂停</td><td>切换播放状态。</td></tr>
      <tr><td>X</td><td>停止</td><td>停止播放。</td></tr>
      <tr><td>Z 或 Alt+Left</td><td>上一个视频</td><td>切换到播放列表中的上一个项目。</td></tr>
      <tr><td>C 或 Alt+Right</td><td>下一个视频</td><td>切换到播放列表中的下一个项目。</td></tr>
      <tr><td>Left / Right</td><td>跳转</td><td>向后或向前跳转。按住 Shift 步长更大。</td></tr>
      <tr><td>Up / Down</td><td>音量</td><td>增大或减小音量。</td></tr>
      <tr><td>1 / 2</td><td>创建标记</td><td>在当前时间创建收藏标记或书签标记。</td></tr>
      <tr><td>, / .</td><td>导航标记</td><td>跳转到上一个或下一个标记。</td></tr>
      <tr><td>F / M</td><td>显示和声音</td><td>切换全屏或静音。</td></tr>
      <tr><td>P / I</td><td>面板</td><td>显示或隐藏播放列表和标记面板。</td></tr>
      <tr><td>E</td><td>编辑视频</td><td>打开视频编辑对话框。</td></tr>
      <tr><td>Esc</td><td>关闭播放器</td><td>在没有打开对话框时关闭播放器。</td></tr>
      <tr><td>Ctrl+Del 或 Alt+Del</td><td>删除视频</td><td>从应用中删除当前视频。</td></tr>
      <tr><td>Ctrl+Shift+Del 或 Alt+Shift+Del</td><td>连同文件删除</td><td>删除当前视频和磁盘上的文件。</td></tr>
    </tbody></table>
    <h2>鼠标控制</h2>
    <table><thead><tr><th>鼠标操作</th><th>行为</th></tr></thead><tbody>
      <tr><td>左键单击</td><td>播放或暂停。</td></tr>
      <tr><td>双击 / 中键单击</td><td>切换全屏。</td></tr>
      <tr><td>后退 / 前进按钮</td><td>上一个或下一个视频。</td></tr>
      <tr><td>滚轮</td><td>在视频或时间轴上控制音量。</td></tr>
      <tr><td>Alt + 滚轮</td><td>导航标记。</td></tr>
      <tr><td>Ctrl + 滚轮</td><td>精细跳转。</td></tr>
      <tr><td>Shift + 滚轮</td><td>快速跳转。</td></tr>
    </tbody></table>`,
}

export const documentationTranslations = {
  en: {
    app: { name: 'Application', content: `<p>MediaChips is a local media catalog. It stores your database locally, works through a browser interface, and can stream media from the local server address shown on the home page.</p><p>The app is built around media files, custom metadata fields, tag values, filters, playlists and the built-in video player.</p>` },
    'app.first_launch': { name: 'First launch', content: `<p>A good first setup is:</p><ol><li>Open <b>Settings → Library</b> and create the metadata fields you need.</li><li>Create at least one field of the <b>Tags</b> type if you want tag categories.</li><li>In the same tab, open <b>Media types</b> and pin fields to the Video media type.</li><li>Open a media page and add files or folders.</li><li>Use filters, view settings and saved tabs to organize the library.</li></ol>` },
    'app.core_concepts': { name: 'Core concepts', content: `<p><b>Media</b> are files in the library. <b>Media types</b> define which extensions belong together.</p><p><b>Custom metadata</b> defines the data model. A <b>metadata field</b> is the definition, and a <b>metadata value</b> is what you fill for a specific media file or tag.</p><p>A field of the <b>Tags</b> type creates a tag category. Its tags can be assigned to media and to other tags.</p>` },
    ui: { name: 'User interface', content: `<p>The interface is organized around the navigation menu, app bar, page toolbar, filters drawer and optional tabs. Most actions are available from the app bar or from item context menus.</p>` },
    'ui.menu': { name: 'Menu', content: `<p>The navigation menu contains Home, media types, tag categories, Playlists, Markers and Settings.</p><p>Media type links open media pages. Tag category links open pages with tag values from fields of the Tags type. Hidden links are grouped under a spoiler.</p>` },
    'ui.useToolbarStore': { name: 'Toolbar', content: `<p>The app bar changes depending on the current page. On media and tag pages it contains add, filter, select, tab and random actions.</p><p>The page header also has sort and appearance controls. The appearance panel changes card size, gap and view mode for the current page.</p>` },
    'ui.tabs': { name: 'Tabs', content: `<p>Tabs let you keep important media, tag and filtered pages open. Use the tab button on the toolbar to save the current page state and return to it later.</p>` },
    'ui.filters': { name: 'Filters', content: `<p>The filter drawer lets you combine conditions for file data, built-in fields, pinned metadata fields and tag values. Filters can be enabled, disabled, removed, saved and loaded.</p><p>On media pages the duplicate finder can temporarily replace regular filters and show likely duplicate files.</p>` },
    'ui.selection': { name: 'Selection mode', content: `<p>Selection mode is used for bulk actions. Select multiple media files or tags, then use the app bar actions to edit metadata values, organize by tag, or perform other batch operations.</p>` },
    media: { name: 'Media library', content: `<p>Media pages show files of the selected media type. The page supports pagination or infinite scroll, filters, sorting, card customization, drag-and-drop adding and quick actions.</p>` },
    'media.adding': { name: 'Adding media', content: `<p>Add media from the app bar on a media page. In Electron you can choose folders directly; in the browser you can paste paths.</p><p>The add dialog supports duplicate checking, excluded paths and optional tag parsing from file paths. Adding starts a background task, visible in the task list.</p>` },
    'media.parser': { name: 'Path tag parser', content: `<p>When tag parsing is enabled, the app splits folder and file names by spaces, commas, underscores, dashes, dots, and parentheses, then compares phrases with tag names and synonyms.</p><p>If a match is found, the tag is assigned to the media file. Longer tag names are preferred over shorter prefixes in the same category.</p><p>The optional local neural parser is used only to suggest new tags from paths, not to assign existing tags automatically.</p><p>Parser options are configured in the settings of the metadata field used as the tag category.</p>` },
    'media.video_object_recognition': { name: 'Video object recognition', content: `<p>After videos are added, the import result dialog can recognize objects in video frames and suggest tag words. Click <b>Recognize objects</b> to run the local CLIP model on several extracted frames.</p><p>The feature works locally and does not require Python. It compares frames with the built-in tag dictionary, translates suggestions to the current app language, and adds them to the suggested tags list for user review.</p><p>Recognition is optional because it can take time and use CPU. The app does not automatically create or assign tags; confirm the suggested words with <b>Add suggested tags</b>.</p>` },
    'media.view': { name: 'View and sorting', content: `<p>Use sorting to order media by name, file path, date, rating, built-in fields or pinned metadata fields.</p><p>The appearance panel controls card size, gap and display mode. Video pages can use card, line or wide-image views depending on settings.</p>` },
    'media.file_paths': { name: 'File paths', content: `<p>Each media file stores a path, extension, file name and generated preview data. If files are moved on disk, use file path editing tools instead of re-importing the library.</p><p>The bulk path editing tool can search for a path segment and replace it in many media records at once.</p>` },
    tags: { name: 'Tags', content: `<p>Tags are values inside metadata fields of the Tags type. Tags can be assigned to media files and to other tags, which makes it possible to build relationships such as performer → country or movie → actor.</p>` },
    'tags.categories': { name: 'Tag categories', content: `<p>A tag category is created by a metadata field of the Tags type. Category settings control whether it is visible in navigation, whether it has built-in fields such as rating or favorite, and which child fields are pinned to its tag pages.</p>` },
    'tags.tag_page': { name: 'Tag page', content: `<p>A tag page shows one tag value and the media linked to it. If child metadata fields are pinned, the tag can also have its own images, color, rating, notes or other values.</p>` },
    meta: { name: 'Custom metadata', content: `<p>Custom metadata is the app data model. Create fields for the information you want to store: text, numbers, dates, ratings, checkboxes or selectable tag values.</p><p>Fields are definitions. Values are filled later on media cards, edit dialogs or tag pages.</p>` },
    'meta.assign': { name: 'Pin metadata fields', content: `<p>Pinning (attaching) metadata fields decides where a field definition becomes available for filling values.</p><p>The main place to manage pinning is <b>Settings → Library → Field pinning</b>. Switch between <b>Media types</b> and <b>Tag categories</b>, select an item in the list and drag fields to pin or unpin them.</p><h3>Pin to media types</h3><p>Attach a field to one or more media types, for example Video. After pinning, the field appears on media cards, in the media edit dialog, filters and sorting.</p><p>Configure this in the metadata field edit dialog under <b>Pinned</b>, or in <b>Settings → Media types</b> when editing a media type.</p><h3>Pin to tag categories</h3><p>Only fields of the <b>Tags</b> type can have child fields pinned to their tag category. A child field such as Country or Birthday pinned to the Performer category appears on every performer tag page and in the tag edit dialog.</p><p>Open the Tags-type field for editing and use the <b>Child fields</b> tab in the <b>Pinned</b> section, or use <b>Settings → Library → Field pinning</b> with the <b>Tag categories</b> view.</p><p><b>Important:</b> removing a pin from a media type or tag category also deletes all stored values for that field on affected media files or tags.</p>` },
    meta_types: { name: 'Field types', content: `<p>The field type controls how values are edited, displayed, filtered and sorted. Choose the smallest type that matches the data you need.</p>` },
    'meta_types.tags': { name: 'Tags', content: `<p>The Tags type stores selectable tag values and creates a tag category page. It is the right type for genres, people, countries, studios, colors or any reusable classification.</p>` },
    'meta_types.string': { name: 'Text', content: `<p>Text fields store descriptions, notes and free-form values. They are useful when the value is not reused as a tag.</p>` },
    'meta_types.number': { name: 'Number', content: `<p>Number fields store counts, sizes, scores or any numeric data. They can be used in filters and sorting.</p>` },
    'meta_types.boolean': { name: 'Checkbox', content: `<p>Checkbox fields store yes/no values. Use them for flags that are independent from favorites or bookmarks.</p>` },
    'meta_types.rating': { name: 'Rating', content: `<p>Rating is a numeric field displayed as stars or another icon. Configure max value, color, icon and half steps in field settings.</p>` },
    'meta_types.date': { name: 'Date', content: `<p>Date fields store dates such as release date, birthday, last watched date or archive date. They work well with date filters.</p>` },
    playlists: { name: 'Playlists', content: `<p>MediaChips supports two playlist types on the Playlists page:</p><ul><li><b>Smart playlists</b> follow saved filter rules and update automatically when your library changes.</li><li><b>My playlists</b> store a fixed, manually ordered list of videos you choose yourself.</li></ul>` },
    'playlists.smart': { name: 'Smart playlists', content: `<p>Smart playlists are dynamic playback queues based on saved filter criteria. They are not fixed lists: every video that matches the saved filters is included, and the count updates as you add, edit or remove media.</p><h3>How to create a smart playlist</h3><ol><li>Open a <b>video</b> media page.</li><li>Open the filter drawer and add the conditions you need: tags, rating, favorites, file data, pinned metadata fields and more.</li><li>Apply the filters and make sure the result looks correct.</li><li>Click <b>Save</b> in the filter drawer, enter a name and confirm.</li><li>The saved filter appears on the Playlists page under <b>Smart playlists</b>.</li></ol><h3>Playback</h3><p>Click a smart playlist card or the play button in the list row. Playback starts with the first matching video and then loads the full filtered queue into the player. Use the player playlist panel for previous/next navigation.</p><h3>Updating criteria</h3><p>To change which videos are included, open the video media page, load the saved filter from the filter chips, adjust conditions and save again. Saved filters with the same name on the video media type continue to appear as smart playlists.</p>` },
    'playlists.manual': { name: 'Manual playlists', content: `<p>Manual playlists are saved playback queues you build yourself. Use <b>Add New Playlist</b> to create one, then add videos from context menus on media cards.</p><p>A playlist card shows thumbnails from its first videos. Click the thumbnails to start playback from the first item, or click the playlist name to edit the list, rename it or export it. The player uses the playlist for previous/next navigation.</p>` },
    markers: { name: 'Markers', content: `<p>Markers are moments saved from videos. The Markers page collects them across the library and shows them as cards with pagination.</p><p>Create marks in the player as favorites or bookmarks, then return to them later from this page or from the player marks panel.</p>` },
    player: { name: 'Video Player', content: `<p>The built-in player supports playback controls, playlists, marks, thumbnails, metadata editing and deletion actions. It is optimized for working with video files inside the catalog, not just watching them.</p>` },
    'player.formats': { name: 'Supported formats', content: `<p>The player uses the browser engine for direct playback of compatible files such as MP4 (H.264 + AAC) and WebM (VP8/VP9 + Opus).</p><p>When <strong>Transcode unsupported formats</strong> is enabled, MKV, AVI, WMV, HEVC and other browser-incompatible formats are converted on the fly via FFmpeg in short chunks while you watch. Playback usually starts within a few seconds.</p><p><strong>Important:</strong> live transcoding uses significant CPU. Card hover previews do not use transcoding — open the built-in player for those files.</p><h3>Recommended direct formats</h3><ul><li>MP4 with H.264 video and AAC audio.</li><li>WebM with VP8/VP9 video and Opus audio.</li></ul>` },
    'player.hotkeys': { name: 'Player hotkeys', content: playerHotkeys.en },
    'player.marks_playlists': { name: 'Marks and playlists', content: `<p>The player can show the current playlist and the marks panel. Use marks to save important moments and playlists to control playback sequence.</p><p>Current frame can be saved as a thumbnail, and metadata values can be edited without leaving the player.</p>` },
    sets: { name: 'Settings', content: `<p>Settings contain general behavior, appearance, files, library structure, video playback, database management and registration/about information.</p>` },
    'settings.general': { name: 'General', content: `<p>General settings control language, browser access hints, default filter behavior, view counting and password protection. The local server address shown on the home page can be copied for access from another device.</p>` },
    'settings.appearance': { name: 'Appearance', content: `<p>Appearance settings control dark mode, theme colors, cards, page layout and SFW mode. Page-level appearance can also be changed from the toolbar on media and tag pages.</p>` },
    'settings.video': { name: 'Video', content: `<p>Video settings control the built-in player and preview behavior on cards: system player, separate window, playback position restore, static thumbnails, hover playback and related options.</p>` },
    'settings.library': { name: 'Library', content: `<p>Library settings define how the catalog is structured: custom metadata fields, media types, field pinning, quick tags from paths and optional data scraping.</p>` },
    'media.types': { name: 'Media types', content: `<p>Media types group files by extension and decide which metadata fields are available on their media pages. The Video type is the main supported type.</p><p>Open a media type to change pinned metadata fields and navigation visibility.</p>` },
    'settings.files': { name: 'Files', content: `<p>File settings manage watched folders, path repair tools, content hashes and generated preview files on disk.</p>` },
    'sets.tools.quick_tags': { name: 'Quick tags', content: `<p>Quick tags analyzes common words from file paths and helps create tag values faster. It is useful after importing a library with meaningful folder or file names.</p>` },
    'sets.tools.bulk_paths': { name: 'Bulk path editing', content: `<p>Bulk path editing searches media records by a path fragment and previews the replacement before applying it. Use it after moving a folder or changing a drive path.</p>` },
    'sets.tools.watched_folders': { name: 'Watched folders', content: `<p>Watched folders automatically scan configured folders and add new files. Scanning can be slow on large folders, so configure only the folders you really want to watch.</p>` },
    'settings.files.content_hash': { name: 'Content hash backfill', content: `<p>Content hash backfill computes SHA-256 hashes for media added before duplicate detection was enabled. Run it to improve content-based deduplication and moved-file detection.</p>` },
    'settings.files.find_missing': { name: 'Find missing files', content: `<p>Scans folders on connected drives to find files that match media with broken paths in the database. Strong matches use content hash; size matches require the filename to match as well.</p>` },
    'settings.files.generated_previews': { name: 'Generated previews', content: `<p>Generate or clear preview thumbnails, grids and marker images stored on disk for videos in the database. Generation runs as background tasks.</p>` },
    'sets.tools.video_preview': { name: 'Video preview', content: `<p>Video previews include static thumbnails, preview grids, hover timeline frames from the grid sprite, and hover playback. Generation runs as background tasks and cards update when previews are ready.</p><p>With big preview enabled, right-click the enlarged preview to set the current frame as the video thumbnail.</p><p>Clearing generated images can reduce backup size, but previews will need to be generated again.</p>` },
    data_scraper: { name: 'Data scraper', content: `<p>The scraper can fetch performer information from the Internet, including photos and physical parameters.</p><p>To use it, create a performer metadata field of the Tags type, pin fields that should receive scraper values, then configure field mapping in scraper settings. Open a performer tag and click <b>Scrape info</b> to transfer values.</p>` },
    database: { name: 'Database', content: `<p>The database settings manage local databases, backups and the application data folder. A database contains your catalog data; generated previews may also be included in backups.</p>` },
    'database.add': { name: 'Adding a database', content: `<p>You can create several databases and switch between them. This is useful for separate libraries or testing a new structure without changing the main catalog.</p>` },
    'database.backups': { name: 'Manage backups', content: `<p>Backups protect the current database state. Create backups before large imports, bulk edits, restores or experiments with metadata structure.</p>` },
    'database.backups.create': { name: 'Creating backups', content: `<p>Backup creation saves database data and, depending on settings, generated images. Remove generated previews first if you need a smaller archive.</p>` },
    'database.backups.restore': { name: 'Restoring backups', content: `<p>Restoring replaces the current database. Create a backup of the current state first if you may need to return to it.</p>` },
    'settings.about': { name: 'About and registration', content: `<p>The About tab contains app information and registration state. When the app is not registered, some limits can apply, such as the number of items shown per page.</p>` },
  },
  ru: {
    app: { name: 'Приложение', content: `<p>MediaChips — локальный каталог медиа. Он хранит базу данных локально, работает через браузерный интерфейс и может отдавать медиа по адресу локального сервера, который показан на главной странице.</p><p>Главные сущности приложения: медиафайлы, пользовательские метаданные, значения тегов, фильтры, плейлисты и встроенный видеоплеер.</p>` },
    'app.first_launch': { name: 'Первый запуск', content: `<p>Хороший порядок первой настройки:</p><ol><li>Откройте <b>Настройки → Библиотека</b> и создайте нужные поля метаданных.</li><li>Создайте хотя бы одно поле типа <b>Теги</b>, если нужны категории тегов.</li><li>На той же вкладке откройте <b>Типы медиа</b> и закрепите поля к типу Видео.</li><li>Откройте страницу медиа и добавьте файлы или папки.</li><li>Используйте фильтры, настройки вида и вкладки для организации библиотеки.</li></ol>` },
    'app.core_concepts': { name: 'Основные понятия', content: `<p><b>Медиа</b> — это файлы в библиотеке. <b>Типы медиа</b> определяют, какие расширения относятся к одной группе.</p><p><b>Пользовательские метаданные</b> задают модель данных. <b>Поле метаданных</b> — это определение, а <b>значение метаданных</b> — заполненное значение у конкретного медиа или тега.</p><p>Поле типа <b>Теги</b> создаёт категорию тегов. Её теги можно назначать медиа и другим тегам.</p>` },
    ui: { name: 'Интерфейс', content: `<p>Интерфейс строится вокруг меню навигации, верхней панели, панели страницы, фильтров и вкладок. Большинство действий доступны на верхней панели или в контекстном меню элементов.</p>` },
    'ui.menu': { name: 'Меню', content: `<p>В меню навигации находятся главная страница, типы медиа, категории тегов, плейлисты, маркеры и настройки.</p><p>Ссылки типов медиа открывают страницы файлов. Ссылки категорий тегов открывают значения тегов из полей типа Теги. Скрытые ссылки группируются под спойлером.</p>` },
    'ui.useToolbarStore': { name: 'Панель инструментов', content: `<p>Верхняя панель меняется в зависимости от страницы. На страницах медиа и тегов она содержит добавление, фильтры, выделение, вкладки и случайное открытие.</p><p>В заголовке страницы есть сортировка и настройка вида. Панель вида меняет размер карточек, отступы и режим отображения текущей страницы.</p>` },
    'ui.tabs': { name: 'Вкладки', content: `<p>Вкладки позволяют держать важные страницы медиа, тегов и фильтров открытыми. Используйте кнопку вкладки на панели, чтобы сохранить текущее состояние страницы и вернуться к нему позже.</p>` },
    'ui.filters': { name: 'Фильтры', content: `<p>Панель фильтров позволяет комбинировать условия по данным файла, встроенным полям, закрепленным полям метаданных и значениям тегов. Фильтры можно включать, отключать, удалять, сохранять и загружать.</p><p>На страницах медиа поиск дубликатов может временно заменить обычные фильтры и показать похожие файлы.</p>` },
    'ui.selection': { name: 'Режим выделения', content: `<p>Режим выделения нужен для массовых действий. Выберите несколько медиафайлов или тегов, затем используйте действия верхней панели для редактирования значений метаданных, организации по тегу и других операций.</p>` },
    media: { name: 'Медиатека', content: `<p>Страницы медиа показывают файлы выбранного типа. Доступны пагинация или бесконечная прокрутка, фильтры, сортировка, настройка карточек, drag-and-drop добавление и быстрые действия.</p>` },
    'media.adding': { name: 'Добавление медиа', content: `<p>Добавляйте медиа с верхней панели на странице медиа. В Electron можно выбирать папки напрямую, в браузере можно вставлять пути.</p><p>Диалог добавления поддерживает проверку дубликатов, исключаемые пути и парсинг тегов из путей. Добавление запускает фоновую задачу, видимую в списке задач.</p>` },
    'media.parser': { name: 'Парсер тегов по пути', content: `<p>Когда парсинг тегов включён, приложение делит имена папок и файлов по пробелам, запятым, подчёркиваниям, дефисам, точкам и скобкам, затем сравнивает фразы с именами тегов и синонимами.</p><p>Если найдено совпадение, тег назначается медиафайлу. Более длинные имена тегов имеют приоритет над короткими префиксами в той же категории.</p><p>Опциональный локальный нейропарсер используется только для предложения новых тегов по путям, а не для автоматического назначения существующих тегов.</p><p>Параметры парсера настраиваются в настройках поля метаданных, которое используется как категория тегов.</p>` },
    'media.video_object_recognition': { name: 'Распознавание объектов в видео', content: `<p>После добавления видео в диалоге результата импорта можно распознать объекты на кадрах и получить предложения тегов. Нажмите <b>Распознать объекты</b>, чтобы запустить локальную модель CLIP по нескольким извлечённым кадрам.</p><p>Функция работает локально и не требует Python. Она сравнивает кадры со встроенным словарём тегов, переводит предложения на текущий язык приложения и добавляет их в список предложенных тегов для проверки пользователем.</p><p>Распознавание запускается вручную, потому что может занять время и использовать CPU. Приложение не создаёт и не назначает теги автоматически; подтвердите нужные слова через <b>Добавить предложенные теги</b>.</p>` },
    'media.view': { name: 'Вид и сортировка', content: `<p>Сортировка упорядочивает медиа по имени, пути, дате, рейтингу, встроенным полям или закрепленным полям метаданных.</p><p>Панель вида управляет размером карточек, отступами и режимом отображения. Для видео доступны карточки, строки или широкий вид с изображением.</p>` },
    'media.file_paths': { name: 'Пути файлов', content: `<p>Каждый медиафайл хранит путь, расширение, имя файла и данные превью. Если файлы перемещены на диске, используйте инструменты редактирования путей вместо повторного импорта.</p><p>Массовое редактирование путей может найти часть пути и заменить её сразу во многих записях.</p>` },
    tags: { name: 'Теги', content: `<p>Теги — это значения внутри полей метаданных типа Теги. Их можно назначать медиафайлам и другим тегам, создавая связи вроде исполнитель → страна или фильм → актёр.</p>` },
    'tags.categories': { name: 'Категории тегов', content: `<p>Категория тегов создаётся полем метаданных типа Теги. Настройки категории определяют видимость в меню, встроенные поля вроде рейтинга или избранного и дочерние поля на страницах тегов.</p>` },
    'tags.tag_page': { name: 'Страница тега', content: `<p>Страница тега показывает одно значение тега и связанные с ним медиа. Если закреплены дочерние поля, тег может иметь изображения, цвет, рейтинг, заметки и другие значения.</p>` },
    meta: { name: 'Пользовательские метаданные', content: `<p>Пользовательские метаданные — это модель данных приложения. Создавайте поля для информации, которую хотите хранить: текст, числа, даты, рейтинги, чекбоксы или выбираемые значения тегов.</p><p>Поля — это определения. Значения заполняются позже на карточках медиа, в диалогах редактирования или на страницах тегов.</p>` },
    'meta.assign': { name: 'Закрепление полей', content: `<p>Закрепление (прикрепление) полей метаданных определяет, где определение поля становится доступным для заполнения значений.</p><p>Основной экран для закрепления — <b>Настройки → Библиотека → Закрепление полей</b>. Переключайтесь между <b>Типами медиа</b> и <b>Категориями тегов</b>, выберите элемент в списке и перетаскивайте поля для закрепления или открепления.</p><h3>Закрепление к типам медиа</h3><p>Прикрепите поле к одному или нескольким типам медиа, например к Видео. После закрепления поле появится на карточках медиа, в диалоге редактирования медиа, в фильтрах и сортировке.</p><p>Настроить это можно в диалоге редактирования поля метаданных в разделе <b>Закреплено</b> или в <b>Настройки → Типы медиа</b> при редактировании типа.</p><h3>Закрепление к категориям тегов</h3><p>Только поля типа <b>Теги</b> могут иметь дочерние поля, закреплённые к их категории. Дочернее поле, например Страна или День рождения, закреплённое к категории Исполнители, появится на странице каждого тега-исполнителя и в диалоге редактирования тега.</p><p>Откройте поле типа Теги для редактирования и используйте вкладку <b>Дочерние поля</b> в разделе <b>Закреплено</b> или экран <b>Настройки → Библиотека → Закрепление полей</b> с переключателем <b>Категории тегов</b>.</p><p><b>Важно:</b> снятие закрепления с типа медиа или категории тегов также удаляет все сохранённые значения этого поля у затронутых медиафайлов или тегов.</p>` },
    meta_types: { name: 'Типы полей', content: `<p>Тип поля определяет, как значения редактируются, отображаются, фильтруются и сортируются. Выбирайте самый простой тип, который подходит данным.</p>` },
    'meta_types.tags': { name: 'Теги', content: `<p>Тип Теги хранит выбираемые значения и создаёт страницу категории тегов. Он подходит для жанров, людей, стран, студий, цветов и любых повторно используемых классификаций.</p>` },
    'meta_types.string': { name: 'Текст', content: `<p>Текстовые поля хранят описания, заметки и произвольные значения. Используйте их, когда значение не нужно переиспользовать как тег.</p>` },
    'meta_types.number': { name: 'Число', content: `<p>Числовые поля хранят счетчики, размеры, баллы и другие числа. Их можно использовать в фильтрах и сортировке.</p>` },
    'meta_types.boolean': { name: 'Чекбокс', content: `<p>Чекбоксы хранят значения да/нет. Используйте их для флагов, не связанных с избранным или закладками.</p>` },
    'meta_types.rating': { name: 'Рейтинг', content: `<p>Рейтинг — числовое поле, отображаемое звёздами или другой иконкой. В настройках поля можно менять максимум, цвет, иконку и половинные шаги.</p>` },
    'meta_types.date': { name: 'Дата', content: `<p>Поля даты подходят для даты релиза, дня рождения, последнего просмотра или архивирования. Они хорошо работают с фильтрами по датам.</p>` },
    playlists: { name: 'Плейлисты', content: `<p>На странице плейлистов в MediaChips есть два типа:</p><ul><li><b>Умные плейлисты</b> следуют сохранённым правилам фильтрации и обновляются автоматически при изменении библиотеки.</li><li><b>Мои плейлисты</b> хранят фиксированный список видео в заданном порядке, который вы собираете вручную.</li></ul>` },
    'playlists.smart': { name: 'Умные плейлисты', content: `<p>Умные плейлисты — это динамические очереди воспроизведения на основе сохранённых фильтров. Это не фиксированный список: в плейлист попадают все видео, подходящие под условия, а количество обновляется при добавлении, редактировании или удалении медиа.</p><h3>Как создать умный плейлист</h3><ol><li>Откройте страницу медиа типа <b>Видео</b>.</li><li>Откройте панель фильтров и задайте нужные условия: теги, рейтинг, избранное, данные файла, закреплённые поля метаданных и другие.</li><li>Примените фильтры и убедитесь, что результат верный.</li><li>Нажмите <b>Сохранить</b> в панели фильтров, введите имя и подтвердите.</li><li>Сохранённый фильтр появится на странице плейлистов в разделе <b>Умные плейлисты</b>.</li></ol><h3>Воспроизведение</h3><p>Нажмите на карточку умного плейлиста или кнопку воспроизведения в строке списка. Воспроизведение начнётся с первого подходящего видео, затем в плеер загрузится полная отфильтрованная очередь. Для перехода между видео используйте панель плейлиста в плеере.</p><h3>Изменение условий</h3><p>Чтобы изменить состав видео, откройте страницу видео, загрузите сохранённый фильтр из чипов над списком, измените условия и сохраните снова. Сохранённые фильтры с именем для типа Видео продолжают отображаться как умные плейлисты.</p>` },
    'playlists.manual': { name: 'Ручные плейлисты', content: `<p>Ручные плейлисты — это сохранённые очереди воспроизведения, которые вы собираете сами. Нажмите <b>Добавить плейлист</b>, чтобы создать новый, затем добавляйте видео через контекстное меню на карточках медиа.</p><p>Карточка плейлиста показывает превью первых видео. Нажмите на превью, чтобы начать воспроизведение с первого элемента, или на название, чтобы редактировать список, переименовать или экспортировать плейлист. Плеер использует плейлист для перехода к предыдущему и следующему видео.</p>` },
    markers: { name: 'Маркеры', content: `<p>Маркеры — это сохранённые моменты видео. Страница маркеров собирает их по всей библиотеке и показывает карточками с пагинацией.</p><p>Создавайте метки в плеере как избранное или закладки, затем возвращайтесь к ним с этой страницы или из панели меток плеера.</p>` },
    player: { name: 'Видеоплеер', content: `<p>Встроенный плеер поддерживает управление воспроизведением, плейлисты, метки, превью, редактирование метаданных и действия удаления. Он предназначен не только для просмотра, но и для работы с видео внутри каталога.</p>` },
    'player.formats': { name: 'Поддерживаемые форматы', content: `<p>Плеер использует движок браузера для прямого воспроизведения совместимых файлов: MP4 (H.264 + AAC), WebM (VP8/VP9 + Opus).</p><p>Если включено <strong>Транскодировать неподдерживаемые форматы</strong>, MKV, AVI, WMV, HEVC и другие форматы, которые браузер не поддерживает напрямую, конвертируются через FFmpeg короткими фрагментами во время просмотра. Воспроизведение обычно начинается через несколько секунд.</p><p><strong>Важно:</strong> потоковое транскодирование создаёт высокую нагрузку на CPU. Превью при наведении на карточку транскодирование не использует — для таких файлов откройте встроенный плеер.</p><h3>Рекомендуемые форматы для прямого воспроизведения</h3><ul><li>MP4 с видео H.264 и аудио AAC.</li><li>WebM с видео VP8/VP9 и аудио Opus.</li></ul>` },
    'player.hotkeys': { name: 'Горячие клавиши плеера', content: playerHotkeys.ru },
    'player.marks_playlists': { name: 'Метки и плейлисты', content: `<p>Плеер может показывать текущий плейлист и панель меток. Метки сохраняют важные моменты, а плейлисты управляют порядком воспроизведения.</p><p>Текущий кадр можно сохранить как превью, а значения метаданных можно редактировать прямо из плеера.</p>` },
    sets: { name: 'Настройки', content: `<p>В настройках находятся общее поведение, внешний вид, файлы, структура библиотеки, воспроизведение видео, управление базой данных и информация о регистрации.</p>` },
    'settings.general': { name: 'Общие', content: `<p>Общие настройки управляют языком, подсказками доступа из браузера, поведением фильтров, счётчиком просмотров и защитой паролем. Адрес локального сервера на главной странице можно скопировать для доступа с другого устройства.</p>` },
    'settings.appearance': { name: 'Внешний вид', content: `<p>Настройки внешнего вида управляют тёмным режимом, цветами темы, карточками, макетом страниц и SFW-режимом. Вид конкретной страницы также можно менять с панели на страницах медиа и тегов.</p>` },
    'settings.video': { name: 'Видео', content: `<p>Настройки видео управляют встроенным плеером и превью на карточках: системный плеер, отдельное окно, восстановление позиции, статичные миниатюры, воспроизведение при наведении и связанные опции.</p>` },
    'settings.library': { name: 'Библиотека', content: `<p>Настройки библиотеки задают структуру каталога: поля метаданных, типы медиа, закрепление полей, быстрые теги из путей и опциональный скрапер данных.</p>` },
    'media.types': { name: 'Типы медиа', content: `<p>Типы медиа группируют файлы по расширениям и определяют, какие поля метаданных доступны на страницах этих файлов. Основной поддерживаемый тип — Видео.</p><p>Откройте тип медиа, чтобы изменить закреплённые поля и видимость в навигации.</p>` },
    'settings.files': { name: 'Файлы', content: `<p>Настройки файлов управляют отслеживаемыми папками, инструментами восстановления путей, хэшами содержимого и сгенерированными превью на диске.</p>` },
    'sets.tools.quick_tags': { name: 'Быстрые теги', content: `<p>Быстрые теги анализируют популярные слова из путей файлов и помогают быстрее создавать значения тегов. Это полезно после импорта библиотеки с осмысленными именами папок и файлов.</p>` },
    'sets.tools.bulk_paths': { name: 'Массовое редактирование путей', content: `<p>Массовое редактирование путей ищет записи по фрагменту пути и показывает замену перед применением. Используйте его после переноса папки или изменения диска.</p>` },
    'sets.tools.watched_folders': { name: 'Отслеживаемые папки', content: `<p>Отслеживаемые папки автоматически сканируют выбранные директории и добавляют новые файлы. На больших папках сканирование может быть медленным, поэтому выбирайте только нужные папки.</p>` },
    'settings.files.content_hash': { name: 'Заполнение хэшей содержимого', content: `<p>Заполнение хэшей вычисляет SHA-256 для медиа, добавленных до включения проверки дубликатов. Запустите его для улучшения дедупликации по содержимому и поиска перемещённых файлов.</p>` },
    'settings.files.find_missing': { name: 'Поиск потерянных файлов', content: `<p>Сканирует папки на подключённых дисках и ищет файлы, соответствующие медиа с битым путём в базе. Точные совпадения — по хэшу содержимого; по размеру — только если совпадает имя файла.</p>` },
    'settings.files.generated_previews': { name: 'Сгенерированные превью', content: `<p>Создание и очистка превью, сеток, таймлайнов и изображений меток, хранящихся на диске для видео из базы. Генерация выполняется фоновыми задачами.</p>` },
    'sets.tools.video_preview': { name: 'Превью видео', content: `<p>Превью видео включают статичные миниатюры, сетки кадров, кадры таймлайна и воспроизведение при наведении. Генерация идёт фоновыми задачами, карточки обновляются по готовности.</p><p>При включённом большом превью щёлкните по нему правой кнопкой, чтобы установить текущий кадр как превью видео.</p><p>Очистка сгенерированных изображений уменьшает размер резервной копии, но превью придётся создавать заново.</p>` },
    data_scraper: { name: 'Скрапер данных', content: `<p>Скрапер может получать информацию об исполнителях из интернета: фотографии, физические параметры и другие данные.</p><p>Для работы создайте поле исполнителей типа Теги, закрепите поля, которые будут принимать значения скрапера, затем настройте соответствие в настройках скрапера. Откройте тег исполнителя и нажмите <b>Спарсить информацию</b>, чтобы перенести значения.</p>` },
    database: { name: 'База данных', content: `<p>Настройки базы данных управляют локальными базами, резервными копиями и папкой данных приложения. База содержит данные каталога; сгенерированные превью тоже могут включаться в копии.</p>` },
    'database.add': { name: 'Добавление базы данных', content: `<p>Можно создать несколько баз данных и переключаться между ними. Это удобно для разных библиотек или проверки новой структуры без изменения основного каталога.</p>` },
    'database.backups': { name: 'Резервные копии', content: `<p>Резервные копии защищают текущее состояние базы. Создавайте их перед большим импортом, массовыми изменениями, восстановлением или экспериментами со структурой метаданных.</p>` },
    'database.backups.create': { name: 'Создание копий', content: `<p>Создание копии сохраняет данные базы и, в зависимости от настроек, сгенерированные изображения. Очистите превью заранее, если нужен меньший архив.</p>` },
    'database.backups.restore': { name: 'Восстановление копий', content: `<p>Восстановление заменяет текущую базу данных. Сначала создайте копию текущего состояния, если может понадобиться откат.</p>` },
    'settings.about': { name: 'О приложении и регистрация', content: `<p>Вкладка содержит информацию о приложении и состоянии регистрации. Если приложение не зарегистрировано, могут действовать ограничения, например на количество элементов на странице.</p>` },
  },
  es: {
    app: { name: 'Aplicación', content: `<p>MediaChips es un catálogo local de medios. Guarda la base de datos localmente, funciona desde una interfaz de navegador y puede transmitir medios desde la dirección del servidor local que aparece en la página de inicio.</p><p>La aplicación se basa en archivos multimedia, metadatos personalizados, valores de etiqueta, filtros, listas de reproducción y el reproductor integrado.</p>` },
    'app.first_launch': { name: 'Primer inicio', content: `<p>Una buena configuración inicial es:</p><ol><li>Abra <b>Configuración → Biblioteca</b> y cree los campos de metadatos necesarios.</li><li>Cree al menos un campo de tipo <b>Etiquetas</b> si necesita categorías de etiquetas.</li><li>En la misma pestaña, abra <b>Tipos de medio</b> y fije campos al tipo Video.</li><li>Abra una página de medios y agregue archivos o carpetas.</li><li>Use filtros, vista y pestañas guardadas para organizar la biblioteca.</li></ol>` },
    'app.core_concepts': { name: 'Conceptos básicos', content: `<p><b>Medios</b> son archivos en la biblioteca. <b>Tipos de medio</b> definen qué extensiones pertenecen al mismo grupo.</p><p><b>Metadatos personalizados</b> definen el modelo de datos. Un <b>campo de metadatos</b> es la definición, y un <b>valor de metadatos</b> es lo que se rellena para un medio o etiqueta concretos.</p><p>Un campo de tipo <b>Etiquetas</b> crea una categoría de etiquetas. Sus etiquetas se pueden asignar a medios y a otras etiquetas.</p>` },
    ui: { name: 'Interfaz de usuario', content: `<p>La interfaz se organiza alrededor del menú de navegación, la barra superior, la barra de página, el panel de filtros y las pestañas opcionales. La mayoría de acciones están en la barra superior o en menús contextuales.</p>` },
    'ui.menu': { name: 'Menú', content: `<p>El menú contiene Inicio, tipos de medio, categorías de etiquetas, listas de reproducción, marcadores y configuración.</p><p>Los enlaces de tipo de medio abren páginas de archivos. Las categorías de etiquetas abren valores de campos de tipo Etiquetas. Los enlaces ocultos se agrupan bajo un desplegable.</p>` },
    'ui.useToolbarStore': { name: 'Barra de herramientas', content: `<p>La barra superior cambia según la página. En páginas de medios y etiquetas contiene agregar, filtros, selección, pestañas y apertura aleatoria.</p><p>El encabezado de página también incluye ordenación y apariencia. El panel de apariencia cambia tamaño de tarjetas, espacios y modo de vista.</p>` },
    'ui.tabs': { name: 'Pestañas', content: `<p>Las pestañas mantienen abiertas páginas importantes de medios, etiquetas y filtros. Use el botón de pestaña para guardar el estado actual y volver más tarde.</p>` },
    'ui.filters': { name: 'Filtros', content: `<p>El panel de filtros combina condiciones de datos de archivo, campos integrados, campos fijados y valores de etiqueta. Los filtros se pueden activar, desactivar, eliminar, guardar y cargar.</p><p>En páginas de medios, el buscador de duplicados puede sustituir temporalmente los filtros normales y mostrar archivos similares.</p>` },
    'ui.selection': { name: 'Modo de selección', content: `<p>El modo de selección se usa para acciones masivas. Seleccione varios medios o etiquetas y use la barra superior para editar valores de metadatos, organizar por etiqueta u otras operaciones.</p>` },
    media: { name: 'Biblioteca de medios', content: `<p>Las páginas de medios muestran archivos del tipo elegido. Admiten paginación o desplazamiento infinito, filtros, ordenación, personalización de tarjetas, agregar por arrastrar y soltar y acciones rápidas.</p>` },
    'media.adding': { name: 'Agregar medios', content: `<p>Agregue medios desde la barra superior en una página de medios. En Electron puede elegir carpetas directamente; en el navegador puede pegar rutas.</p><p>El diálogo admite comprobación de duplicados, rutas excluidas y análisis de etiquetas desde rutas. El agregado inicia una tarea de fondo visible en la lista de tareas.</p>` },
    'media.parser': { name: 'Analizador de etiquetas de ruta', content: `<p>Cuando el análisis está activado, la aplicación divide nombres de carpetas y archivos por espacios, guiones bajos, guiones y puntos, y compara las palabras con nombres de etiquetas y sinónimos.</p><p>Si hay coincidencia, la etiqueta se asigna al medio. Con el analizador neuronal local, palabras similares también pueden coincidir por similitud semántica.</p><p>Las opciones se configuran en el campo de metadatos usado como categoría de etiquetas.</p>` },
    'media.video_object_recognition': { name: 'Reconocimiento de objetos en video', content: `<p>Después de agregar videos, el diálogo de resultado de importación puede reconocer objetos en fotogramas y sugerir palabras de etiqueta. Haga clic en <b>Reconocer objetos</b> para ejecutar el modelo local CLIP sobre varios fotogramas extraídos.</p><p>La función funciona localmente y no requiere Python. Compara fotogramas con el diccionario integrado de etiquetas, traduce las sugerencias al idioma actual de la aplicación y las agrega a la lista de etiquetas sugeridas para revisión.</p><p>El reconocimiento es opcional porque puede tardar y usar CPU. La aplicación no crea ni asigna etiquetas automáticamente; confirme las palabras sugeridas con <b>Agregar etiquetas sugeridas</b>.</p>` },
    'media.view': { name: 'Vista y ordenación', content: `<p>La ordenación organiza medios por nombre, ruta, fecha, calificación, campos integrados o campos de metadatos fijados.</p><p>El panel de apariencia controla tamaño de tarjetas, espacios y modo de vista. Las páginas de video pueden usar vista de tarjetas, líneas o imagen ancha.</p>` },
    'media.file_paths': { name: 'Rutas de archivos', content: `<p>Cada archivo guarda ruta, extensión, nombre y datos de vista previa. Si los archivos se mueven en disco, use herramientas de edición de rutas en lugar de reimportar.</p><p>La edición masiva puede encontrar un segmento de ruta y reemplazarlo en muchos registros.</p>` },
    tags: { name: 'Etiquetas', content: `<p>Las etiquetas son valores dentro de campos de tipo Etiquetas. Se pueden asignar a medios y a otras etiquetas, creando relaciones como intérprete → país o película → actor.</p>` },
    'tags.categories': { name: 'Categorías de etiquetas', content: `<p>Una categoría se crea con un campo de tipo Etiquetas. Sus ajustes controlan visibilidad en navegación, campos integrados como calificación o favorito, y campos secundarios fijados a páginas de etiquetas.</p>` },
    'tags.tag_page': { name: 'Página de etiqueta', content: `<p>Una página de etiqueta muestra un valor de etiqueta y los medios relacionados. Si hay campos secundarios fijados, la etiqueta puede tener imágenes, color, calificación, notas y otros valores.</p>` },
    meta: { name: 'Metadatos personalizados', content: `<p>Los metadatos personalizados son el modelo de datos de la app. Cree campos para información que quiera almacenar: texto, números, fechas, calificaciones, casillas o valores de etiqueta seleccionables.</p><p>Los campos son definiciones. Los valores se rellenan después en tarjetas, diálogos de edición o páginas de etiquetas.</p>` },
    'meta.assign': { name: 'Fijar campos', content: `<p>Fijar (adjuntar) campos de metadatos decide dónde la definición de un campo queda disponible para rellenar valores.</p><p>La pantalla principal para fijar campos es <b>Configuración → Biblioteca → Fijación de campos</b>. Cambie entre <b>Tipos de medio</b> y <b>Categorías de etiquetas</b>, seleccione un elemento de la lista y arrastre campos para fijar o desfijar.</p><h3>Fijar a tipos de medio</h3><p>Adjunte un campo a uno o varios tipos de medio, por ejemplo Video. Tras fijarlo, el campo aparece en tarjetas de medios, en el diálogo de edición, filtros y ordenación.</p><p>Configúrelo en el diálogo de edición del campo, en la sección <b>Fijado</b>, o en <b>Configuración → Tipos de medio</b> al editar un tipo.</p><h3>Fijar a categorías de etiquetas</h3><p>Solo los campos de tipo <b>Etiquetas</b> pueden tener campos secundarios fijados a su categoría. Un campo secundario como País o Cumpleaños fijado a la categoría Intérpretes aparece en cada página de etiqueta de intérprete y en el diálogo de edición de etiqueta.</p><p>Abra el campo de tipo Etiquetas para editarlo y use la pestaña <b>Campos secundarios</b> en la sección <b>Fijado</b>, o use <b>Configuración → Biblioteca → Fijación de campos</b> con la vista <b>Categorías de etiquetas</b>.</p><p><b>Importante:</b> quitar un fijado de un tipo de medio o categoría de etiquetas también elimina todos los valores guardados de ese campo en los medios o etiquetas afectados.</p>` },
    meta_types: { name: 'Tipos de campo', content: `<p>El tipo controla cómo se editan, muestran, filtran y ordenan los valores. Elija el tipo más simple que coincida con los datos.</p>` },
    'meta_types.tags': { name: 'Etiquetas', content: `<p>El tipo Etiquetas guarda valores reutilizables y crea una página de categoría de etiquetas. Es adecuado para géneros, personas, países, estudios, colores o cualquier clasificación reutilizable.</p>` },
    'meta_types.string': { name: 'Texto', content: `<p>Los campos de texto guardan descripciones, notas y valores libres. Úselos cuando el valor no necesite reutilizarse como etiqueta.</p>` },
    'meta_types.number': { name: 'Número', content: `<p>Los campos numéricos guardan contadores, tamaños, puntuaciones y otros datos numéricos. Sirven para filtros y ordenación.</p>` },
    'meta_types.boolean': { name: 'Casilla', content: `<p>Las casillas guardan valores sí/no. Úselas para indicadores independientes de favoritos o marcadores.</p>` },
    'meta_types.rating': { name: 'Calificación', content: `<p>La calificación es un campo numérico mostrado con estrellas u otro icono. Puede configurar máximo, color, icono y medios pasos.</p>` },
    'meta_types.date': { name: 'Fecha', content: `<p>Los campos de fecha sirven para estreno, cumpleaños, última vista o archivado. Funcionan bien con filtros de fecha.</p>` },
    playlists: { name: 'Listas de reproducción', content: `<p>En la página de listas hay dos tipos:</p><ul><li><b>Listas inteligentes</b> siguen reglas de filtros guardados y se actualizan automáticamente cuando cambia la biblioteca.</li><li><b>Mis listas</b> almacenan una lista fija y ordenada manualmente de videos que usted elige.</li></ul>` },
    'playlists.smart': { name: 'Listas inteligentes', content: `<p>Las listas inteligentes son colas de reproducción dinámicas basadas en filtros guardados. No son listas fijas: se incluyen todos los videos que cumplen los filtros y el recuento se actualiza al añadir, editar o eliminar medios.</p><h3>Cómo crear una lista inteligente</h3><ol><li>Abra una página de medios de <b>video</b>.</li><li>Abra el panel de filtros y añada las condiciones necesarias: etiquetas, valoración, favoritos, datos del archivo, campos de metadatos fijados y más.</li><li>Aplique los filtros y compruebe que el resultado es correcto.</li><li>Haga clic en <b>Guardar</b> en el panel de filtros, introduzca un nombre y confirme.</li><li>El filtro guardado aparecerá en la página de listas en <b>Listas inteligentes</b>.</li></ol><h3>Reproducción</h3><p>Haga clic en la tarjeta de la lista inteligente o en el botón de reproducción de la fila. La reproducción comienza con el primer video coincidente y luego carga la cola filtrada completa en el reproductor. Use el panel de lista del reproductor para anterior/siguiente.</p><h3>Actualizar criterios</h3><p>Para cambiar qué videos se incluyen, abra la página de video, cargue el filtro guardado desde los chips de filtros, ajuste las condiciones y guarde de nuevo. Los filtros guardados con nombre para el tipo Video siguen apareciendo como listas inteligentes.</p>` },
    'playlists.manual': { name: 'Listas manuales', content: `<p>Las listas manuales son colas de reproducción guardadas que usted crea. Use <b>Añadir nueva lista</b> para crear una y añada videos desde el menú contextual de las tarjetas de medios.</p><p>La tarjeta muestra miniaturas de los primeros videos. Haga clic en miniaturas para reproducir desde el primer elemento o en el nombre para editar la lista, renombrarla o exportarla. El reproductor usa la lista para anterior/siguiente.</p>` },
    markers: { name: 'Marcadores', content: `<p>Los marcadores son momentos guardados de videos. La página los reúne de toda la biblioteca y los muestra como tarjetas con paginación.</p><p>Cree marcas en el reproductor como favoritos o marcadores y vuelva a ellas desde esta página o desde el panel de marcas.</p>` },
    player: { name: 'Reproductor de video', content: `<p>El reproductor integrado admite controles, listas, marcas, miniaturas, edición de metadatos y eliminación. Está pensado para trabajar con videos dentro del catálogo, no solo verlos.</p>` },
    'player.formats': { name: 'Formatos compatibles', content: `<p>El reproductor usa el motor del navegador para reproducir directamente archivos compatibles como MP4 (H.264 + AAC) y WebM (VP8/VP9 + Opus).</p><p>Con <strong>Transcodificar formatos no compatibles</strong> activado, MKV, AVI, WMV, HEVC y otros formatos incompatibles se convierten en vivo con FFmpeg en fragmentos cortos mientras ves el video. La reproducción suele empezar en pocos segundos.</p><p><strong>Importante:</strong> la transcodificación en vivo usa mucha CPU. Las vistas previas al pasar el cursor no usan transcodificación; abre el reproductor integrado para esos archivos.</p><h3>Formatos recomendados</h3><ul><li>MP4 con video H.264 y audio AAC.</li><li>WebM con video VP8/VP9 y audio Opus.</li></ul>` },
    'player.hotkeys': { name: 'Atajos del reproductor', content: playerHotkeys.es },
    'player.marks_playlists': { name: 'Marcas y listas', content: `<p>El reproductor puede mostrar la lista actual y el panel de marcas. Las marcas guardan momentos importantes y las listas controlan el orden de reproducción.</p><p>El fotograma actual puede guardarse como miniatura y los valores de metadatos pueden editarse desde el reproductor.</p>` },
    sets: { name: 'Configuración', content: `<p>La configuración incluye comportamiento general, apariencia, archivos, estructura de biblioteca, reproducción de video, base de datos e información de registro.</p>` },
    'settings.general': { name: 'General', content: `<p>La configuración general controla idioma, avisos de acceso desde navegador, comportamiento de filtros, recuento de vistas y protección por contraseña. La dirección local de la página de inicio se puede copiar para usar otro dispositivo.</p>` },
    'settings.appearance': { name: 'Apariencia', content: `<p>La apariencia controla modo oscuro, colores, tarjetas, diseño de páginas y modo SFW. La apariencia de una página concreta también puede cambiarse desde la barra en páginas de medios y etiquetas.</p>` },
    'settings.video': { name: 'Video', content: `<p>La configuración de video controla el reproductor integrado y las vistas previas en tarjetas: reproductor del sistema, ventana separada, restauración de posición, miniaturas estáticas, reproducción al pasar el cursor y opciones relacionadas.</p>` },
    'settings.library': { name: 'Biblioteca', content: `<p>La configuración de biblioteca define la estructura del catálogo: campos de metadatos, tipos de medio, fijación de campos, etiquetas rápidas desde rutas y extracción de datos opcional.</p>` },
    'media.types': { name: 'Tipos de medio', content: `<p>Los tipos de medio agrupan archivos por extensión y deciden qué campos están disponibles en sus páginas. Video es el tipo principal compatible.</p><p>Abra un tipo para cambiar campos fijados y visibilidad en navegación.</p>` },
    'settings.files': { name: 'Archivos', content: `<p>La configuración de archivos gestiona carpetas vigiladas, herramientas de reparación de rutas, hashes de contenido y vistas previas generadas en disco.</p>` },
    'sets.tools.quick_tags': { name: 'Etiquetas rápidas', content: `<p>Etiquetas rápidas analiza palabras comunes de rutas y ayuda a crear valores de etiqueta más rápido. Es útil tras importar una biblioteca con nombres significativos.</p>` },
    'sets.tools.bulk_paths': { name: 'Edición masiva de rutas', content: `<p>La edición masiva busca registros por fragmento de ruta y muestra el reemplazo antes de aplicarlo. Úsela después de mover una carpeta o cambiar unidad.</p>` },
    'sets.tools.watched_folders': { name: 'Carpetas vigiladas', content: `<p>Las carpetas vigiladas escanean directorios configurados y agregan archivos nuevos automáticamente. El escaneo puede ser lento en carpetas grandes, así que elija solo las necesarias.</p>` },
    'settings.files.content_hash': { name: 'Relleno de hash de contenido', content: `<p>El relleno de hash calcula SHA-256 para medios añadidos antes de activar la detección de duplicados. Ejecútelo para mejorar la deduplicación por contenido y la detección de archivos movidos.</p>` },
    'settings.files.find_missing': { name: 'Buscar archivos perdidos', content: `<p>Escanea carpetas en unidades conectadas para encontrar archivos que coincidan con medios cuya ruta en la base de datos está rota. Las coincidencias fuertes usan hash de contenido; las de tamaño solo si el nombre también coincide.</p>` },
    'settings.files.generated_previews': { name: 'Vistas previas generadas', content: `<p>Generar o borrar miniaturas, cuadrículas, líneas de tiempo e imágenes de marcadores almacenadas en disco para videos de la base de datos. La generación se ejecuta en tareas de fondo.</p>` },
    'sets.tools.video_preview': { name: 'Vista previa de video', content: `<p>Las vistas previas incluyen miniaturas, cuadrículas, fotogramas de línea de tiempo y reproducción al pasar el cursor. La generación se ejecuta en tareas de fondo y las tarjetas se actualizan al finalizar.</p><p>Con la vista previa grande activada, haga clic derecho sobre ella para usar el fotograma actual como miniatura del video.</p><p>Borrar imágenes generadas reduce el tamaño de copias, pero las vistas deberán generarse otra vez.</p>` },
    data_scraper: { name: 'Extractor de datos', content: `<p>El extractor puede obtener información de intérpretes desde Internet, como fotos y parámetros físicos.</p><p>Para usarlo, cree un campo de intérpretes de tipo Etiquetas, fije los campos que recibirán valores y configure la correspondencia. Abra una etiqueta de intérprete y use <b>Extraer información</b>.</p>` },
    database: { name: 'Base de datos', content: `<p>La configuración de base de datos administra bases locales, copias y la carpeta de datos de la aplicación. Una base contiene datos del catálogo; las vistas previas generadas también pueden incluirse en copias.</p>` },
    'database.add': { name: 'Agregar base de datos', content: `<p>Puede crear varias bases y cambiar entre ellas. Es útil para bibliotecas separadas o para probar una estructura nueva sin tocar el catálogo principal.</p>` },
    'database.backups': { name: 'Copias de seguridad', content: `<p>Las copias protegen el estado actual. Cree copias antes de grandes importaciones, ediciones masivas, restauraciones o experimentos con metadatos.</p>` },
    'database.backups.create': { name: 'Crear copias', content: `<p>Crear una copia guarda datos y, según configuración, imágenes generadas. Elimine vistas previas antes si necesita un archivo más pequeño.</p>` },
    'database.backups.restore': { name: 'Restaurar copias', content: `<p>Restaurar reemplaza la base actual. Cree antes una copia del estado actual si puede necesitar volver a él.</p>` },
    'settings.about': { name: 'Acerca de y registro', content: `<p>La pestaña contiene información de la app y estado de registro. Si la app no está registrada, pueden aplicarse límites, como cantidad de elementos por página.</p>` },
  },
  cn: {
    app: { name: '应用', content: `<p>MediaChips 是本地媒体目录。它在本地保存数据库，通过浏览器界面工作，并可从首页显示的本地服务器地址传输媒体。</p><p>应用围绕媒体文件、自定义元数据、标签值、筛选器、播放列表和内置视频播放器组织。</p>` },
    'app.first_launch': { name: '首次启动', content: `<p>建议的初始设置流程：</p><ol><li>打开 <b>设置 → 库</b> 并创建需要的元数据字段。</li><li>如果需要标签分类，至少创建一个 <b>标签</b> 类型字段。</li><li>在同一标签页中打开 <b>媒体类型</b>，将字段固定到视频类型。</li><li>打开媒体页面并添加文件或文件夹。</li><li>使用筛选器、视图设置和标签页组织媒体库。</li></ol>` },
    'app.core_concepts': { name: '核心概念', content: `<p><b>媒体</b>是库中的文件。<b>媒体类型</b>定义哪些扩展名属于同一组。</p><p><b>自定义元数据</b>定义数据模型。<b>元数据字段</b>是定义，<b>元数据值</b>是某个媒体或标签中填写的值。</p><p><b>标签</b>类型字段会创建标签分类，其中的标签可分配给媒体和其他标签。</p>` },
    ui: { name: '用户界面', content: `<p>界面由导航菜单、顶部栏、页面工具栏、筛选器抽屉和可选标签页组成。大多数操作位于顶部栏或项目上下文菜单中。</p>` },
    'ui.menu': { name: '菜单', content: `<p>导航菜单包含首页、媒体类型、标签分类、播放列表、标记和设置。</p><p>媒体类型链接打开文件页面。标签分类链接打开“标签”类型字段中的标签值。隐藏链接会放在折叠分组中。</p>` },
    'ui.useToolbarStore': { name: '工具栏', content: `<p>顶部栏会根据当前页面变化。在媒体和标签页面中，它包含添加、筛选、选择、标签页和随机打开操作。</p><p>页面标题区域还有排序和外观控制。外观面板可更改当前页面的卡片大小、间距和显示模式。</p>` },
    'ui.tabs': { name: '标签页', content: `<p>标签页可保持重要媒体页、标签页和筛选页打开。使用工具栏上的标签页按钮保存当前页面状态，稍后返回。</p>` },
    'ui.filters': { name: '筛选器', content: `<p>筛选器抽屉可组合文件数据、内置字段、固定元数据字段和标签值条件。筛选器可启用、停用、删除、保存和加载。</p><p>在媒体页面中，重复项查找会临时替代常规筛选器并显示可能重复的文件。</p>` },
    'ui.selection': { name: '选择模式', content: `<p>选择模式用于批量操作。选择多个媒体或标签后，可使用顶部栏编辑元数据值、按标签整理或执行其他批量操作。</p>` },
    media: { name: '媒体库', content: `<p>媒体页面显示所选媒体类型的文件。支持分页或无限滚动、筛选、排序、卡片自定义、拖放添加和快速操作。</p>` },
    'media.adding': { name: '添加媒体', content: `<p>在媒体页面的顶部栏添加媒体。在 Electron 中可直接选择文件夹；在浏览器中可粘贴路径。</p><p>添加对话框支持重复检查、排除路径和从路径解析标签。添加会启动后台任务，可在任务列表中查看。</p>` },
    'media.parser': { name: '路径标签解析器', content: `<p>启用标签解析后，应用会按空格、下划线、短横线和点号拆分文件夹名和文件名，并与标签名称和同义词比较。</p><p>如果找到匹配，标签会分配给媒体文件。启用本地神经解析器后，相似词也可按语义相似度匹配。</p><p>解析器选项在用作标签分类的元数据字段设置中配置。</p>` },
    'media.video_object_recognition': { name: '视频对象识别', content: `<p>添加视频后，导入结果对话框可以识别视频帧中的对象并建议标签词。点击 <b>识别对象</b>，即可对多个提取帧运行本地 CLIP 模型。</p><p>此功能在本地运行，不需要 Python。它会将帧与内置标签词典进行比较，根据当前应用语言翻译建议，并将其添加到建议标签列表供用户确认。</p><p>识别是可选的，因为它可能耗时并使用 CPU。应用不会自动创建或分配标签；请通过 <b>添加建议标签</b> 确认需要的词。</p>` },
    'media.view': { name: '视图和排序', content: `<p>排序可按名称、文件路径、日期、评分、内置字段或固定元数据字段排列媒体。</p><p>外观面板控制卡片大小、间距和显示模式。视频页面可使用卡片、行或宽图视图。</p>` },
    'media.file_paths': { name: '文件路径', content: `<p>每个媒体文件保存路径、扩展名、文件名和生成的预览数据。如果磁盘上的文件移动了，请使用路径编辑工具，而不是重新导入。</p><p>批量路径编辑可查找路径片段并在多条媒体记录中替换。</p>` },
    tags: { name: '标签', content: `<p>标签是“标签”类型字段中的值。标签可分配给媒体文件和其他标签，从而建立例如表演者 → 国家、电影 → 演员这样的关系。</p>` },
    'tags.categories': { name: '标签分类', content: `<p>标签分类由“标签”类型元数据字段创建。分类设置控制导航可见性、评分或收藏等内置字段，以及标签页面上的子字段。</p>` },
    'tags.tag_page': { name: '标签页面', content: `<p>标签页面显示一个标签值及其关联媒体。如果固定了子字段，标签也可以拥有图片、颜色、评分、备注和其他值。</p>` },
    meta: { name: '自定义元数据', content: `<p>自定义元数据是应用的数据模型。创建字段来保存文本、数字、日期、评分、复选框或可选择标签值。</p><p>字段是定义。具体值之后在媒体卡片、编辑对话框或标签页面中填写。</p>` },
    'meta.assign': { name: '固定元数据字段', content: `<p>固定（附加）元数据字段决定字段定义在何处可用于填写值。</p><p>管理固定的主要界面是 <b>设置 → 库 → 字段固定</b>。在 <b>媒体类型</b> 和 <b>标签分类</b> 之间切换，从列表中选择项目并拖放字段进行固定或取消固定。</p><h3>固定到媒体类型</h3><p>将字段附加到一个或多个媒体类型，例如视频。固定后，该字段会出现在媒体卡片、媒体编辑对话框、筛选器和排序中。</p><p>可在元数据字段编辑对话框的 <b>已固定</b> 部分配置，或在编辑媒体类型时通过 <b>设置 → 媒体类型</b> 配置。</p><h3>固定到标签分类</h3><p>只有 <b>标签</b> 类型字段可以将其子字段固定到对应分类。例如将国家或生日固定到表演者分类后，该分类下每个标签页面和标签编辑对话框中都会显示这些字段。</p><p>打开标签类型字段进行编辑，并在 <b>已固定</b> 部分使用 <b>子字段</b> 标签页，或使用 <b>设置 → 库 → 字段固定</b> 中的 <b>标签分类</b> 视图。</p><p><b>重要：</b>从媒体类型或标签分类取消固定时，也会删除受影响媒体或标签中该字段的所有已保存值。</p>` },
    meta_types: { name: '字段类型', content: `<p>字段类型控制值如何编辑、显示、筛选和排序。请选择最符合数据的简单类型。</p>` },
    'meta_types.tags': { name: '标签', content: `<p>“标签”类型保存可复用的标签值并创建标签分类页面。适合流派、人物、国家、工作室、颜色或任何可复用分类。</p>` },
    'meta_types.string': { name: '文本', content: `<p>文本字段保存描述、备注和自由值。当值不需要作为标签复用时使用。</p>` },
    'meta_types.number': { name: '数字', content: `<p>数字字段保存计数、大小、分数或其他数值，可用于筛选和排序。</p>` },
    'meta_types.boolean': { name: '复选框', content: `<p>复选框保存是/否值。适合与收藏或书签无关的标志。</p>` },
    'meta_types.rating': { name: '评分', content: `<p>评分是以星星或其他图标显示的数字字段。可配置最大值、颜色、图标和半步。</p>` },
    'meta_types.date': { name: '日期', content: `<p>日期字段适合发布日期、生日、最后观看日期或归档日期，也适合日期筛选。</p>` },
    playlists: { name: '播放列表', content: `<p>播放列表页面有两种类型：</p><ul><li><b>智能播放列表</b>遵循已保存的筛选规则，并会在媒体库变化时自动更新。</li><li><b>我的播放列表</b>存储您自行选择、手动排序的固定视频列表。</li></ul>` },
    'playlists.smart': { name: '智能播放列表', content: `<p>智能播放列表是基于已保存筛选条件的动态播放队列。它不是固定列表：所有符合筛选条件的视频都会包含在内，数量会随媒体的添加、编辑或删除而更新。</p><h3>如何创建智能播放列表</h3><ol><li>打开<b>视频</b>媒体页面。</li><li>打开筛选面板并添加所需条件：标签、评分、收藏、文件数据、固定的元数据字段等。</li><li>应用筛选并确认结果正确。</li><li>在筛选面板中点击<b>保存</b>，输入名称并确认。</li><li>已保存的筛选会出现在播放列表页面的<b>智能播放列表</b>部分。</li></ol><h3>播放</h3><p>点击智能播放列表卡片或列表行中的播放按钮。播放会从第一个匹配的视频开始，然后将完整筛选队列加载到播放器。使用播放器中的播放列表面板进行上一个/下一个导航。</p><h3>更新条件</h3><p>要更改包含的视频，请打开视频页面，从筛选芯片加载已保存的筛选，调整条件后再次保存。为视频类型保存的命名筛选会继续显示为智能播放列表。</p>` },
    'playlists.manual': { name: '手动播放列表', content: `<p>手动播放列表是您自行创建的已保存播放队列。点击<b>添加新播放列表</b>创建，然后通过媒体卡片上的上下文菜单添加视频。</p><p>播放列表卡片显示前几个视频的缩略图。点击缩略图从第一个项目开始播放，点击名称可编辑列表、重命名或导出。播放器使用播放列表进行上一个/下一个导航。</p>` },
    markers: { name: '标记', content: `<p>标记是从视频中保存的时间点。标记页面会汇总整个媒体库中的标记，并以分页卡片显示。</p><p>在播放器中创建收藏标记或书签标记，然后从此页面或播放器标记面板返回。</p>` },
    player: { name: '视频播放器', content: `<p>内置播放器支持播放控制、播放列表、标记、缩略图、元数据编辑和删除操作。它用于在目录中处理视频，而不仅是观看。</p>` },
    'player.formats': { name: '支持的格式', content: `<p>播放器使用浏览器引擎直接播放兼容文件，例如 MP4（H.264 + AAC）和 WebM（VP8/VP9 + Opus）。</p><p>启用<strong>转码不支持的格式</strong>后，MKV、AVI、WMV、HEVC 等浏览器不兼容的格式会在观看时通过 FFmpeg 分片实时转码。通常几秒内即可开始播放。</p><p><strong>注意：</strong>实时转码会显著占用 CPU。卡片悬停预览不会转码——此类文件请打开内置播放器。</p><h3>推荐格式</h3><ul><li>H.264 视频和 AAC 音频的 MP4。</li><li>VP8/VP9 视频和 Opus 音频的 WebM。</li></ul>` },
    'player.hotkeys': { name: '播放器快捷键', content: playerHotkeys.cn },
    'player.marks_playlists': { name: '标记和播放列表', content: `<p>播放器可以显示当前播放列表和标记面板。标记保存重要时刻，播放列表控制播放顺序。</p><p>当前帧可保存为缩略图，元数据值也可直接从播放器编辑。</p>` },
    sets: { name: '设置', content: `<p>设置包含常规行为、外观、文件、库结构、视频播放、数据库管理以及注册/关于信息。</p>` },
    'settings.general': { name: '常规', content: `<p>常规设置控制语言、浏览器访问提示、筛选行为、浏览计数和密码保护。首页显示的本地服务器地址可复制到其他设备访问。</p>` },
    'settings.appearance': { name: '外观', content: `<p>外观设置控制深色模式、主题颜色、卡片、页面布局和 SFW 模式。媒体和标签页面上的工具栏也可更改单页外观。</p>` },
    'settings.video': { name: '视频', content: `<p>视频设置控制内置播放器和卡片上的预览行为：系统播放器、独立窗口、恢复播放位置、静态缩略图、悬停播放及相关选项。</p>` },
    'settings.library': { name: '库', content: `<p>库设置定义目录结构：自定义元数据字段、媒体类型、字段固定、从路径快速创建标签以及可选的数据抓取。</p>` },
    'media.types': { name: '媒体类型', content: `<p>媒体类型按扩展名分组文件，并决定哪些元数据字段可用于对应媒体页面。视频是主要支持的类型。</p><p>打开媒体类型可更改固定字段和导航可见性。</p>` },
    'settings.files': { name: '文件', content: `<p>文件设置管理监听文件夹、路径修复工具、内容哈希以及磁盘上的生成预览文件。</p>` },
    'sets.tools.quick_tags': { name: '快速标签', content: `<p>快速标签会分析文件路径中的常见词，帮助更快创建标签值。导入带有有意义文件夹或文件名的库后很有用。</p>` },
    'sets.tools.bulk_paths': { name: '批量路径编辑', content: `<p>批量路径编辑按路径片段查找媒体记录，并在应用前预览替换结果。移动文件夹或更改磁盘路径后可使用。</p>` },
    'sets.tools.watched_folders': { name: '监听文件夹', content: `<p>监听文件夹会自动扫描配置的文件夹并添加新文件。大型文件夹扫描可能较慢，因此只配置真正需要监听的文件夹。</p>` },
    'settings.files.content_hash': { name: '内容哈希回填', content: `<p>内容哈希回填为在启用重复检测之前添加的媒体计算 SHA-256 哈希。运行它可改善基于内容的去重和移动文件检测。</p>` },
    'settings.files.find_missing': { name: '查找丢失文件', content: `<p>扫描已连接驱动器上的文件夹，查找与数据库中路径失效的媒体匹配的文件。强匹配使用内容哈希；大小匹配仅在文件名也一致时显示。</p>` },
    'settings.files.generated_previews': { name: '生成的预览', content: `<p>为数据库中的视频生成或清除存储在磁盘上的预览缩略图、网格、时间线和标记图像。生成会作为后台任务运行。</p>` },
    'sets.tools.video_preview': { name: '视频预览', content: `<p>视频预览包括静态缩略图、预览网格、时间线帧和悬停播放。生成会作为后台任务运行，完成后卡片会更新。</p><p>启用大预览后，在大预览上右键单击可将当前帧设为视频缩略图。</p><p>清除生成图片可减小备份大小，但之后需要重新生成预览。</p>` },
    data_scraper: { name: '数据抓取器', content: `<p>抓取器可从互联网获取表演者信息，包括照片和身体参数。</p><p>使用前请创建“标签”类型的表演者字段，固定用于接收抓取值的字段，然后在抓取器设置中配置映射。打开表演者标签并点击 <b>抓取信息</b> 以传输值。</p>` },
    database: { name: '数据库', content: `<p>数据库设置管理本地数据库、备份和应用程序数据文件夹。数据库包含目录数据；生成的预览也可包含在备份中。</p>` },
    'database.add': { name: '添加数据库', content: `<p>您可以创建多个数据库并在它们之间切换。适合分离媒体库，或在不影响主目录的情况下测试新结构。</p>` },
    'database.backups': { name: '管理备份', content: `<p>备份用于保护当前数据库状态。在大型导入、批量编辑、恢复或元数据结构实验前请创建备份。</p>` },
    'database.backups.create': { name: '创建备份', content: `<p>创建备份会保存数据库数据，并根据设置保存生成图片。如果需要较小的归档，可先删除生成预览。</p>` },
    'database.backups.restore': { name: '恢复备份', content: `<p>恢复会替换当前数据库。如果可能需要回到当前状态，请先创建备份。</p>` },
    'settings.about': { name: '关于和注册', content: `<p>关于标签页包含应用信息和注册状态。如果应用未注册，可能会有一些限制，例如每页显示的项目数量。</p>` },
  },
}

const fallbackLocale = 'en'

type DocumentationLocale = keyof typeof documentationTranslations

interface DocumentationItem {
  id: string
  children?: DocumentationItem[]
  [key: string]: unknown
}

const getTranslation = (locale: DocumentationLocale | string, id: string): Record<string, unknown> => {
  const catalogs = documentationTranslations as Record<string, Record<string, Record<string, unknown>>>
  return catalogs[locale]?.[id] || catalogs[fallbackLocale]?.[id] || {}
}

export const localizeDocumentation = (items: DocumentationItem[], locale: DocumentationLocale | string): DocumentationItem[] => (
  items.map((item) => {
    const translation = getTranslation(locale, item.id)

    return {
      ...item,
      ...translation,
      children: item.children ? localizeDocumentation(item.children, locale) : undefined,
    }
  })
)

export default documentationTranslations
