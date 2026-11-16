export const CLIP_REQUIRED_FILES = [
  'config.json', 'tokenizer.json', 'tokenizer_config.json', 'preprocessor_config.json',
  'onnx/text_model_quantized.onnx', 'onnx/vision_model_quantized.onnx',
] as const
const faceUrl = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/'
export const MANUAL_MODELS = {
  localAi: {section: 'local_ai', directory: 'qwen25-1_5b-instruct', files: ['qwen2.5-1.5b-instruct-q4_k_m.gguf'], url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'},
  clip: {section: 'clip_embedding_backfill', directory: 'Xenova/clip-vit-base-patch32', files: [...CLIP_REQUIRED_FILES], url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/tree/main'},
  faceDetect: {section: 'detect_faces', directory: 'scrfd-10g', files: ['det_10g.onnx'], url: faceUrl + 'det_10g.onnx'},
  faceEmbed: {section: 'detect_faces', directory: 'insightface-r50', files: ['w600k_r50.onnx'], url: faceUrl + 'w600k_r50.onnx'},
  faceAlign: {section: 'detect_faces', directory: 'insightface-2d106', files: ['2d106det.onnx'], url: faceUrl + '2d106det.onnx'},
  faceGender: {section: 'detect_faces', directory: 'insightface-genderage', files: ['genderage.onnx'], url: faceUrl + 'genderage.onnx'},
} as const
export type ManualModelKind = keyof typeof MANUAL_MODELS
