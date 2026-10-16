# Original playback and transcoding

The built-in player tries the original file first. The server's codec list is advisory: it does not reject HEVC, MKV, MOV or another container before the playback browser has a chance to open it. Native support depends on the browser, OS and installed decoders. Disabling **Settings → General → Video Player → Transcode unsupported formats** keeps this original playback attempt and disables automatic conversion.

With transcoding enabled, the player falls back to FFmpeg after a decoding/unsupported-source error. A file flagged as potentially incompatible also has a 12-second startup/seek watchdog; it only falls back if playback has made no progress. Ordinary buffering in a compatible file does not start transcoding. Network errors alone do not start it either.

Audio is checked separately with the playback browser's `canPlayType()`. An unsupported audio track can otherwise leave working video playing silently, without a media error. If the browser reports that it cannot decode a known audio codec, the player uses FFmpeg when enabled. Unknown codec information does not block an original playback attempt. This fallback currently converts both video and audio; it does not add native support for codecs missing from the browser. The player controls still allow switching transcoding off or enabling it manually for a file that needs it.

## Seeking

Original playback uses byte-range requests and the source file's timeline. A live transcoded stream cannot seek by byte range: a seek outside its buffer opens a new short FFmpeg stream at the requested time. It still requires encoder startup, but it does not decode a fixed 20-second preroll. Standard transcoding uses FFmpeg's accurate input seek to the nearest preceding seek point and discards only the frames needed to reach the target. See the [FFmpeg seeking options](https://ffmpeg.org/ffmpeg.html#Main-options).

Replacing a stream cancels the previous playback wait and retries. An older request cannot clear the new source or restart playback at the previous position. The first playback attempt reuses the stream URL already assigned to the element instead of immediately starting a duplicate request. Failed stream startup has one retry, with a 15-second timeout per attempt.

## Disk cache

Live transcoding pipes fragmented MP4 directly to the player and does not save a full transcoded video on disk. The library's `transcode_cache` directory can contain older converted files and seekable container-remux copies. A layout warning alone no longer creates a remux copy of an otherwise playable original. A layout fallback can still prepare one for subsequent playback.

**Transcode cache size (GB)** defaults to **5 GB per library**. Oldest cache groups are removed automatically when playback is planned, cache usage is requested, and remux jobs are scheduled or completed. This includes orphan files and partial output left by a previous process. Active writers are excluded from eviction, so the configured size is a cleanup budget rather than an instantaneous hard filesystem quota. Files larger than the budget are not scheduled for full-file remuxing. **Clear transcode cache** remains available to reclaim the cache immediately.

Regression coverage includes native-first planning with transcoding on/off, separate audio capability checks, decode-error and stalled-container fallbacks, stream cancellation, cache cleanup without starting a new remux, and real FFmpeg seeks verifying the first video frame and the presence/timestamps of both audio and video.
