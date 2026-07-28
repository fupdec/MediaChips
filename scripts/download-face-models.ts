const fs = require('fs')
const path = require('path')

const USER_AGENT = 'mediachips-dist/1.0 (+https://github.com/fupdec/MediaChips)'
const cacheDir = path.join(__dirname, '..', 'models')

const FACE_MODELS = [
  {
    id: 'ultraface-rfb-320',
    filename: 'version-RFB-320.onnx',
    url: 'https://media.githubusercontent.com/media/onnx/models/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx',
  },
  {
    id: 'insightface-mbf',
    filename: 'w600k_mbf.onnx',
    url: 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_s/w600k_mbf.onnx',
  },
] as const

function modelPath(model: (typeof FACE_MODELS)[number]) {
  return path.join(cacheDir, model.id, model.filename)
}

function hasDownloadedModel(model: (typeof FACE_MODELS)[number]) {
  return fs.existsSync(modelPath(model))
}

function hasAllModels() {
  return FACE_MODELS.every(hasDownloadedModel)
}

async function downloadFile(url: string, dest: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  fs.mkdirSync(path.dirname(dest), {recursive: true})
  const buffer = Buffer.from(await response.arrayBuffer())
  const tmpPath = `${dest}.download`
  fs.writeFileSync(tmpPath, buffer)
  fs.renameSync(tmpPath, dest)
}

async function main() {
  if (hasAllModels()) {
    console.log(`Face models are already cached at ${cacheDir}`)
    return
  }

  fs.mkdirSync(cacheDir, {recursive: true})
  console.log(`Downloading face models to ${cacheDir}`)

  for (const model of FACE_MODELS) {
    const dest = modelPath(model)
    if (hasDownloadedModel(model)) {
      console.log(`  ${model.id}/${model.filename} (cached)`)
      continue
    }
    console.log(`  ${model.id}/${model.filename}`)
    await downloadFile(model.url, dest)
  }

  if (!hasAllModels()) {
    throw new Error(`Face models incomplete at ${cacheDir}. Missing files must be downloaded when the network is reachable.`)
  }

  console.log('Face models are ready')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
