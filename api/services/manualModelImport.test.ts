/** @vitest-environment node */
import fs from 'fs'
import os from 'os'
import path from 'path'
import archiver from 'archiver'
import {afterEach, describe, expect, it, vi} from 'vitest'
vi.mock('./faceOrtRuntime', () => ({getOrt: () => ({InferenceSession: {create: vi.fn(async () => ({}))}})}))
import {installManualModel, resolveModelEntries, validateModelFile} from './manualModelImport'
import {CLIP_REQUIRED_FILES} from '../../shared/manualModels'

const dirs: string[] = []
function temporary() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-import-test-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true}) })
async function zip(file: string, entries: Record<string, Buffer | string>) {
  const archive = archiver('zip')
  const output = fs.createWriteStream(file)
  const finished = new Promise<void>((resolve, reject) => { output.on('close', resolve); output.on('error', reject); archive.on('error', reject) })
  archive.pipe(output)
  for (const [name, contents] of Object.entries(entries)) archive.append(contents, {name})
  await archive.finalize()
  await finished
}
describe('manual model installation', () => {
  it('accepts a ZIP wrapper folder and preserves the CLIP onnx directory', () => {
    const entries = resolveModelEntries('clip', CLIP_REQUIRED_FILES.map(file => 'model/' + file))
    expect(entries.get('onnx/text_model_quantized.onnx')).toBe('model/onnx/text_model_quantized.onnx')
  })
  it('rejects incomplete, duplicate, and traversal entries', () => {
    expect(() => resolveModelEntries('clip', ['config.json'])).toThrow('ZIP must contain')
    expect(() => resolveModelEntries('faceDetect', ['det_10g.onnx', 'other/det_10g.onnx'])).toThrow()
    expect(() => resolveModelEntries('faceDetect', ['../det_10g.onnx'])).toThrow()
  })
  it('installs the selected model from a ZIP without extracting unrelated files', async () => {
    const root = temporary()
    const upload = path.join(root, 'model.zip')
    await zip(upload, {'bundle/det_10g.onnx': Buffer.alloc(1024 * 1024), 'unrelated.txt': 'ignored'})
    await installManualModel(upload, true, 'faceDetect', root)
    expect(fs.readdirSync(path.join(root, 'scrfd-10g'))).toEqual(['det_10g.onnx'])
  })
  it('leaves the previous model intact if validation fails and cleans staging', async () => {
    const root = temporary()
    fs.mkdirSync(path.join(root, 'scrfd-10g'))
    fs.writeFileSync(path.join(root, 'scrfd-10g/det_10g.onnx'), 'previous model')
    const upload = path.join(root, 'invalid.onnx')
    fs.writeFileSync(upload, '<html>download failed</html>')
    await expect(installManualModel(upload, false, 'faceDetect', root)).rejects.toThrow('incomplete')
    expect(fs.readFileSync(path.join(root, 'scrfd-10g/det_10g.onnx'), 'utf8')).toBe('previous model')
    expect(fs.readdirSync(root).some(name => name.startsWith('.import-'))).toBe(false)
  })
  it('rejects a file that is not GGUF', async () => {
    const file = path.join(temporary(), 'model.gguf')
    fs.writeFileSync(file, Buffer.alloc(1024 * 1024))
    await expect(validateModelFile(file)).rejects.toThrow('GGUF')
  })
  it('rejects a truncated GGUF even if its header is valid', async () => {
    const file = path.join(temporary(), 'model.gguf')
    const contents = Buffer.alloc(1024 * 1024)
    contents.write('GGUF')
    fs.writeFileSync(file, contents)
    await expect(validateModelFile(file)).rejects.toThrow('incomplete')
  })

})
