const { console, core, event, http, mpv, preferences } = iina;

function trimSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function asBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  const normalized = String(value).toLowerCase();
  if (normalized === "yes" || normalized === "true" || normalized === "1") return true;
  if (normalized === "no" || normalized === "false" || normalized === "0") return false;
  return fallback;
}

function readOptions() {
  return {
    baseUrl: trimSlash(preferences.get("base_url") || "http://127.0.0.1:12321"),
    token: String(preferences.get("token") || ""),
    osd: asBool(preferences.get("osd"), true),
    merge: asBool(preferences.get("merge"), false),
  };
}

function notify(text, opts) {
  console.log(text);
  if (opts.osd) {
    core.osd(text);
  }
}

function isNonFileUrl(path) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path) && !/^file:/i.test(path);
}

function normalizeChapters(chapters) {
  const list = [];
  for (const chapter of chapters || []) {
    const time = Number(chapter && chapter.time);
    if (!Number.isFinite(time) || time < 0) continue;
    list.push({
      title: String((chapter && chapter.title) || "Mark"),
      time,
    });
  }
  list.sort((a, b) => a.time - b.time || a.title.localeCompare(b.title));
  return list;
}

function applyChapters(incoming, opts) {
  let list = [];

  if (opts.merge) {
    const existing = mpv.getNative("chapter-list") || [];
    for (const chapter of existing) {
      list.push({
        title: String((chapter && chapter.title) || ""),
        time: Number(chapter && chapter.time) || 0,
      });
    }
  }

  list = list.concat(normalizeChapters(incoming));
  list.sort((a, b) => a.time - b.time || a.title.localeCompare(b.title));
  mpv.set("chapter-list", list);
  return list.length;
}

async function fetchChapters(path, opts) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.token) {
    headers.Authorization = "Bearer " + opts.token;
  }

  const response = await http.post(opts.baseUrl + "/api/mark/by-path", {
    headers,
    data: { path },
  });

  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    const status = response ? response.statusCode : "no response";
    throw new Error("HTTP " + status);
  }

  if (response.data && typeof response.data === "object") {
    return response.data;
  }

  if (response.text) {
    return JSON.parse(response.text);
  }

  throw new Error("empty response");
}

async function onFileLoaded() {
  const path = mpv.getString("path");
  if (!path) return;

  if (isNonFileUrl(path)) {
    console.log("mediachips-marks: skip non-file URL");
    return;
  }

  const opts = readOptions();

  try {
    const data = await fetchChapters(path, opts);
    if (!data || !data.found) {
      console.log("mediachips-marks: media not in library");
      return;
    }

    const chapters = data.chapters || [];
    if (!chapters.length) {
      console.log("mediachips-marks: no marks for media");
      return;
    }

    const count = applyChapters(chapters, opts);
    notify("MediaChips: " + count + " mark(s)", opts);
  } catch (err) {
    console.log("mediachips-marks: " + (err && err.message ? err.message : String(err)));
  }
}

event.on("mpv.file-loaded", () => {
  onFileLoaded();
});
