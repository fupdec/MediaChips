#!/usr/bin/env node
/**
 * Repeatable grid performance benchmark.
 *
 * Opens a page of the RUNNING app in a clean Chromium (no extensions, fresh
 * profile), scrolls it with a fixed script, records a Chrome trace and prints
 * the style/layout/paint/network numbers. Several runs are aggregated to
 * medians so two code versions can be compared fairly.
 *
 *   node scripts/perf-grid.mjs --label before
 *   node scripts/perf-grid.mjs --label after
 *   node scripts/perf-grid.mjs --compare output/perf/before.json output/perf/after.json
 *
 * Options:
 *   --url <url>       page to measure (default http://127.0.0.1:12322/media?mediaTypeId=1)
 *   --runs <n>        runs per label (default 5, first one is a warm-up and dropped unless --keep-first)
 *   --steps <n>       wheel scroll steps (default 14)
 *   --step-px <n>     pixels per step (default 600)
 *   --step-ms <n>     pause between steps (default 250)
 *   --settle-ms <n>   wait after the grid appears, before scrolling (default 1500)
 *   --cpu <n>         CPU throttling rate, 1 = none (default 1; 4 emulates a slower machine)
 *   --warm            warm the HTTP cache with an untraced load first (default: cold cache)
 *   --token <t>       session token, if the server requires auth
 *   --label <name>    summary file name under --out (default: timestamp)
 *   --out <dir>       output dir (default output/perf)
 *   --keep-trace      also save each run's trace (.json.gz) to open in DevTools
 *   --headed          show the browser window
 *   --scroll-js       scroll the page container from script with the pointer parked away from the grid (no hover effects)
 *   --cls             report which DOM elements cause layout shifts (top selectors by CLS)
 *   --static <dir>    serve the frontend from another build (vite build --outDir <dir>); API stays on the running server
 *   --setting k=v     override a setting in the test browser only, e.g. --setting virtualImageGrid=1
 */
import {chromium} from '@playwright/test'
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import {extname, join, resolve} from 'node:path'

const argv = process.argv.slice(2)
const has = (name) => argv.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}

const config = {
  url: opt('url', 'http://127.0.0.1:12322/media?mediaTypeId=1'),
  runs: Number(opt('runs', 5)),
  steps: Number(opt('steps', 14)),
  stepPx: Number(opt('step-px', 600)),
  stepMs: Number(opt('step-ms', 250)),
  settleMs: Number(opt('settle-ms', 1500)),
  cpu: Number(opt('cpu', 1)),
  warm: has('warm'),
  token: opt('token', ''),
  label: opt('label', new Date().toISOString().replace(/[:.]/g, '-')),
  out: opt('out', 'output/perf'),
  keepTrace: has('keep-trace'),
  headed: has('headed'),
  clsReport: has('cls'),
  scrollJs: has('scroll-js'),
  staticDir: opt('static', '') ? resolve(opt('static', '')) : '',
  // --setting virtualImageGrid=1 (repeatable): overrides a setting in the test
  // browser only, by rewriting the GET /api/setting response. The server and
  // the user's real settings are never touched.
  settings: argv.flatMap((a, i) => (a === '--setting' && argv[i + 1] ? [argv[i + 1]] : []))
    .map((pair) => pair.split('='))
    .filter(([key, value]) => key && value !== undefined),
}

const GRID_SELECTOR = '.item'
const TRACE_CATEGORIES = [
  '-*',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.stack',
  'loading',
  'blink.user_timing',
]

const median = (values) => {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const sum = (values) => values.reduce((a, b) => a + b, 0)
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d

function analyze(events) {
  const complete = (name) => events.filter((e) => e.name === name && e.ph === 'X')
  const recalc = complete('UpdateLayoutTree')
  const layout = complete('Layout')
  const paintLike = events.filter((e) => ['Paint', 'PrePaint', 'Layerize', 'Commit'].includes(e.name) && e.ph === 'X')
  const tasks = complete('RunTask').filter((e) => e.dur > 50_000)
  const requests = events
    .filter((e) => e.name === 'ResourceSendRequest')
    .map((e) => e.args?.data?.url ?? '')
  const thumbs = requests.filter((u) => u.includes('get-file')).map((u) => u.replace(/token=[^&]*&?/, ''))
  const shifts = events.filter((e) => e.name === 'LayoutShift' && e.args?.data && !e.args.data.had_recent_input)
  const counts = events
    .filter((e) => e.name === 'UpdateCounters' && e.args?.data?.nodes)
    .map((e) => e.args.data.nodes)

  return {
    recalcCount: recalc.length,
    recalcMs: round(sum(recalc.map((e) => e.dur)) / 1000),
    recalcAvgElements: round(sum(recalc.map((e) => e.args?.elementCount ?? 0)) / Math.max(1, recalc.length)),
    recalcMaxElements: Math.max(0, ...recalc.map((e) => e.args?.elementCount ?? 0)),
    layoutCount: layout.length,
    layoutMs: round(sum(layout.map((e) => e.dur)) / 1000),
    paintMs: round(sum(paintLike.map((e) => e.dur)) / 1000),
    longTasks: tasks.length,
    longTasksMs: round(sum(tasks.map((e) => e.dur)) / 1000),
    cls: round(sum(shifts.map((e) => e.args.data.score ?? 0)), 3),
    shifts: shifts.length,
    requests: requests.length,
    thumbRequests: thumbs.length,
    thumbUnique: new Set(thumbs).size,
    maxDomNodes: counts.length ? Math.max(...counts) : 0,
  }
}

const clsLogs = []

async function runOnce(browser, index) {
  const context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    deviceScaleFactor: 1,
    serviceWorkers: 'allow',
  })
  if (config.token) {
    await context.addInitScript((token) => {
      try { sessionStorage.setItem('mediachips_auth_token', token) } catch { /* ignore */ }
    }, config.token)
  }
  if (config.settings.length) {
    await context.route(/\/api\/setting(\?.*)?$/i, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const rows = await response.json()
      for (const [key, value] of config.settings) {
        const row = rows.find((r) => r.option === key)
        if (row) row.value = value
        else rows.push({id: -1, option: key, value})
      }
      await route.fulfill({response, json: rows})
    })
  }
  if (config.staticDir) {
    // Serve the frontend from a separate build (vite build --outDir <dir>) while
    // the API still comes from the running server; the real dist is untouched.
    const types = {
      '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
      '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
    }
    await context.route((url) => url.origin === new URL(config.url).origin, async (route) => {
      const {pathname} = new URL(route.request().url())
      if (pathname.startsWith('/api') || route.request().method() !== 'GET') return route.fallback()
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
      let file = join(config.staticDir, rel)
      if (!rel || (!extname(rel) && !existsSync(file))) file = join(config.staticDir, 'index.html')
      if (!file.startsWith(config.staticDir) || !existsSync(file) || !statSync(file).isFile()) return route.fallback()
      await route.fulfill({
        status: 200,
        contentType: types[extname(file).toLowerCase()] ?? 'application/octet-stream',
        body: readFileSync(file),
      })
    })
  }
  if (config.clsReport) {
    await context.addInitScript(() => {
      const describe = (node) => {
        if (!node || node.nodeType !== 1) return node ? '#text' : '?'
        const part = (el) => el.tagName.toLowerCase()
          + [...el.classList].filter((c) => !/^v-(ripple|theme)/.test(c)).slice(0, 3).map((c) => `.${c}`).join('')
        const parent = node.parentElement
        return (parent ? `${part(parent)} > ` : '') + part(node)
      }
      window.__shifts = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue
          window.__shifts.push({
            value: entry.value,
            at: Math.round(entry.startTime),
            sources: entry.sources.map((src) => ({
              node: describe(src.node),
              prev: [src.previousRect.x, src.previousRect.y, src.previousRect.width, src.previousRect.height].map(Math.round),
              cur: [src.currentRect.x, src.currentRect.y, src.currentRect.width, src.currentRect.height].map(Math.round),
            })),
          })
        }
      }).observe({type: 'layout-shift', buffered: true})
    })
  }
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  if (config.warm) {
    await page.goto(config.url, {waitUntil: 'load'})
    await page.waitForSelector(GRID_SELECTOR, {timeout: 60_000})
    await page.waitForTimeout(config.settleMs)
    await page.goto('about:blank')
  }

  if (config.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: config.cpu})

  await browser.startTracing(page, {categories: TRACE_CATEGORIES})
  const started = Date.now()
  await page.goto(config.url, {waitUntil: 'commit'})
  try {
    await page.waitForSelector(GRID_SELECTOR, {timeout: 60_000})
  } catch {
    await browser.stopTracing()
    await context.close()
    throw new Error(`Grid did not appear at ${config.url}. Is the app running, and is auth required (--token)?`)
  }
  await page.waitForTimeout(config.settleMs)

  if (config.scrollJs) {
    // Pointer over the left rail, scroll by script: isolates hover-driven work.
    await page.mouse.move(8, 450)
    const handle = await page.evaluateHandle(() => {
      let best = null
      for (const el of document.querySelectorAll('*')) {
        const overflowY = getComputedStyle(el).overflowY
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 500
          && el.clientWidth > 600 && (!best || el.scrollHeight > best.scrollHeight)) best = el
      }
      return best
    })
    for (let i = 0; i < config.steps; i++) {
      await handle.evaluate((el, px) => el.scrollBy({top: px, behavior: 'instant'}), config.stepPx)
      await page.waitForTimeout(config.stepMs)
    }
  } else {
    await page.mouse.move(720, 450)
    for (let i = 0; i < config.steps; i++) {
      await page.mouse.wheel(0, config.stepPx)
      await page.waitForTimeout(config.stepMs)
    }
  }
  await page.waitForTimeout(800)
  const wallMs = Date.now() - started

  const shiftLog = config.clsReport ? await page.evaluate(() => window.__shifts || []) : []
  const traceBuffer = await browser.stopTracing()
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    rows: document.querySelectorAll('.virtual-grid-row').length,
    items: document.querySelectorAll('.item').length,
  }))
  await context.close()

  const parsed = JSON.parse(traceBuffer.toString('utf8'))
  const events = Array.isArray(parsed) ? parsed : parsed.traceEvents
  if (config.keepTrace) {
    mkdirSync(config.out, {recursive: true})
    writeFileSync(join(config.out, `${config.label}-run${index + 1}.trace.json.gz`), gzipSync(traceBuffer))
  }
  if (config.clsReport) clsLogs.push(shiftLog)
  return {...analyze(events), wallMs, domNodesEnd: dom.nodes, rowsEnd: dom.rows, itemsEnd: dom.items}
}

function aggregate(runs) {
  const keys = Object.keys(runs[0])
  return Object.fromEntries(keys.map((k) => [k, round(median(runs.map((r) => r[k])), 3)]))
}

function printTable(title, rows) {
  console.log(`\n${title}`)
  const keyWidth = Math.max(...Object.keys(rows).map((k) => k.length))
  for (const [k, v] of Object.entries(rows)) console.log(`  ${k.padEnd(keyWidth)}  ${v}`)
}

function printClsReport(logs) {
  const byNode = new Map()
  for (const log of logs) {
    for (const shift of log) {
      const share = shift.value / Math.max(1, shift.sources.length)
      for (const src of shift.sources) {
        const entry = byNode.get(src.node) ?? {total: 0, count: 0, first: shift.at, example: src}
        entry.total += share / logs.length
        entry.count += 1 / logs.length
        byNode.set(src.node, entry)
      }
    }
  }
  console.log('\nTop layout-shift sources (CLS per run, shifts per run, first at ms, example prev -> cur [x,y,w,h]):')
  for (const [node, e] of [...byNode].sort((a, b) => b[1].total - a[1].total).slice(0, 12)) {
    console.log(`  ${round(e.total, 3)}  x${round(e.count, 1)}  @${e.first}  ${node}\n        ${e.example.prev} -> ${e.example.cur}`)
  }
}

function compare(files) {
  if (files.length !== 2) {
    console.error('Usage: --compare <before.json> <after.json>')
    process.exit(1)
  }
  const [a, b] = files.map((f) => JSON.parse(readFileSync(f, 'utf8')))
  console.log(`\n${a.label} (${a.runs.length} runs)  ->  ${b.label} (${b.runs.length} runs)\n`)
  const keys = Object.keys(a.median)
  const w = Math.max(...keys.map((k) => k.length))
  for (const k of keys) {
    const x = a.median[k]
    const y = b.median[k]
    const spread = (s, key) => {
      const v = s.runs.map((r) => r[key])
      return Math.max(...v) - Math.min(...v)
    }
    const delta = x ? `${y >= x ? '+' : ''}${round(((y - x) / x) * 100)}%` : 'n/a'
    const noise = Math.max(spread(a, k), spread(b, k))
    const significant = Math.abs(y - x) > noise ? '' : '  (within run-to-run noise)'
    console.log(`  ${k.padEnd(w)}  ${String(x).padStart(9)}  ->  ${String(y).padStart(9)}   ${delta.padStart(7)}${significant}`)
  }
}

async function main() {
  console.log(`Measuring ${config.url}`)
  console.log(`${config.runs} runs, ${config.steps} x ${config.stepPx}px every ${config.stepMs}ms, cpu x${config.cpu}, ${config.warm ? 'warm' : 'cold'} cache`)
  const browser = await chromium.launch({headless: !config.headed})
  const results = []
  try {
    for (let i = 0; i < config.runs; i++) {
      const result = await runOnce(browser, i)
      results.push(result)
      console.log(`  run ${i + 1}/${config.runs}: recalc ${result.recalcCount}x ${result.recalcMs}ms, layout ${result.layoutMs}ms, thumbs ${result.thumbRequests} (${result.thumbUnique} unique), CLS ${result.cls}, long tasks ${result.longTasksMs}ms`)
    }
  } finally {
    await browser.close()
  }

  // The first run still pays one-off costs (JIT, disk cache of the server); drop it
  // when there are enough runs so medians reflect steady state.
  const used = results.length > 2 && !has('keep-first') ? results.slice(1) : results
  const summary = {label: config.label, config, runs: used, median: aggregate(used)}
  printTable(`Median of ${used.length} runs`, summary.median)

  if (config.clsReport) printClsReport(clsLogs.slice(clsLogs.length > 2 ? 1 : 0))

  mkdirSync(config.out, {recursive: true})
  const file = join(config.out, `${config.label}.json`)
  writeFileSync(file, JSON.stringify(summary, null, 2))
  console.log(`\nSaved ${file}`)
}

if (has('compare')) {
  compare(argv.slice(argv.indexOf('--compare') + 1).filter((a) => !a.startsWith('--')))
  process.exit(0)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
