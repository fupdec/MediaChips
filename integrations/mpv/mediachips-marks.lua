--[[
  mediachips-marks.lua
  Load MediaChips timeline marks into mpv as chapters.

  Install:
    Copy this file to your mpv scripts directory, e.g.:
      ~/.config/mpv/scripts/mediachips-marks.lua
      %APPDATA%/mpv/scripts/mediachips-marks.lua

  Configure (mpv.conf or CLI):
    script-opts-append=mediachips-marks-base_url=http://127.0.0.1:12321
    script-opts-append=mediachips-marks-token=
    script-opts-append=mediachips-marks-osd=yes
    script-opts-append=mediachips-marks-merge=no

  Requires: MediaChips running, curl available on PATH.
]]

local mp = require "mp"
local msg = require "mp.msg"
local utils = require "mp.utils"
local options = require "mp.options"

local opts = {
  base_url = "http://127.0.0.1:12321",
  token = "",
  osd = true,
  merge = false,
  timeout = 3,
}

options.read_options(opts, "mediachips-marks")

local function trim_slash(url)
  return (url:gsub("/+$", ""))
end

local function notify(text)
  msg.info(text)
  if opts.osd then
    mp.osd_message(text, 2)
  end
end

local function fetch_chapters(path)
  local endpoint = trim_slash(opts.base_url) .. "/api/mark/by-path"
  local payload = utils.format_json({ path = path })
  if not payload then
    return nil, "failed to encode request JSON"
  end

  local args = {
    "curl",
    "-sS",
    "-m", tostring(opts.timeout),
    "-X", "POST",
    "-H", "Content-Type: application/json",
    "-H", "Accept: application/json",
  }

  if opts.token and opts.token ~= "" then
    args[#args + 1] = "-H"
    args[#args + 1] = "Authorization: Bearer " .. opts.token
  end

  args[#args + 1] = "--data-binary"
  args[#args + 1] = payload
  args[#args + 1] = endpoint

  local result = mp.command_native({
    name = "subprocess",
    args = args,
    capture_stdout = true,
    capture_stderr = true,
    playback_only = false,
  })

  if not result or result.error or result.status ~= 0 then
    local err = (result and (result.stderr or result.error)) or "curl failed"
    return nil, err
  end

  local body = result.stdout or ""
  if body == "" then
    return nil, "empty response"
  end

  local data = utils.parse_json(body)
  if not data then
    return nil, "invalid JSON response"
  end

  return data
end

local function apply_chapters(chapters)
  local list = {}

  if opts.merge then
    local existing = mp.get_property_native("chapter-list") or {}
    for _, chapter in ipairs(existing) do
      table.insert(list, {
        title = chapter.title or "",
        time = chapter.time or 0,
      })
    end
  end

  for _, chapter in ipairs(chapters) do
    local time = tonumber(chapter.time)
    if time and time >= 0 then
      table.insert(list, {
        title = tostring(chapter.title or "Mark"),
        time = time,
      })
    end
  end

  table.sort(list, function(a, b)
    if a.time == b.time then
      return tostring(a.title) < tostring(b.title)
    end
    return a.time < b.time
  end)

  mp.set_property_native("chapter-list", list)
  return #list
end

local function on_file_loaded()
  local path = mp.get_property("path")
  if not path or path == "" then
    return
  end

  -- Skip network streams; MediaChips matches local library paths.
  if path:match("^[a-zA-Z][a-zA-Z0-9+.-]*://") and not path:match("^file:") then
    msg.verbose("mediachips-marks: skip non-file URL")
    return
  end

  local data, err = fetch_chapters(path)
  if not data then
    msg.verbose("mediachips-marks: " .. tostring(err))
    return
  end

  if not data.found then
    msg.verbose("mediachips-marks: media not in library")
    return
  end

  local chapters = data.chapters or {}
  if #chapters == 0 then
    msg.verbose("mediachips-marks: no marks for media")
    return
  end

  local count = apply_chapters(chapters)
  notify(string.format("MediaChips: %d mark(s)", count))
end

mp.register_event("file-loaded", on_file_loaded)
