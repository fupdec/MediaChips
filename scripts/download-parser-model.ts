const fs = require('fs')
const path = require('path')

const PARSER_MODEL = 'Xenova/all-MiniLM-L6-v2'
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
  'onnx/model_quantized.onnx',
]
const HF_BASE = `https://huggingface.co/${PARSER_MODEL}/resolve/main`
const cacheDir = path.join(__dirname, '..', 'models')
const modelDir = path.join(cacheDir, ...PARSER_MODEL.split('/'))

function hasDownloadedModel() {
  if (!fs.existsSync(modelDir)) return false
  return MODEL_FILES.every((file) => fs.existsSync(path.join(modelDir, file)))
}

async function downloadFile(url: string, dest: string) {
  const response = await fetch(url, {
    headers: {
      // Hugging Face often returns 403 to bare Node fetches without a UA.
      'User-Agent': 'mediachips-dist/1.0 (+https://github.com/fupdec/MediaChips)',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  fs.mkdirSync(path.dirname(dest), {recursive: true})
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(dest, buffer)
}

async function main() {
  if (hasDownloadedModel()) {
    console.log(`Parser model ${PARSER_MODEL} is already cached at ${modelDir}`)
    return
  }

  fs.mkdirSync(cacheDir, {recursive: true})
  console.log(`Downloading parser model ${PARSER_MODEL} to ${cacheDir}`)

  for (const file of MODEL_FILES) {
    const dest = path.join(modelDir, file)
    if (fs.existsSync(dest)) {
      console.log(`  ${file} (cached)`)
      continue
    }
    console.log(`  ${file}`)
    await downloadFile(`${HF_BASE}/${file}`, dest)
  }

  if (!hasDownloadedModel()) {
    throw new Error(
      `Parser model incomplete at ${modelDir}. Missing files must be downloaded when Hugging Face is reachable.`,
    )
  }

  console.log('Parser model is ready')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
