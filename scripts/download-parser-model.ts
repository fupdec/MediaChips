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
  const response = await fetch(url)
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
    console.log(`  ${file}`)
    await downloadFile(`${HF_BASE}/${file}`, dest)
  }

  console.log('Parser model is ready')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
