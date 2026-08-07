/** Form-facing aliases for shared face setting clamps. */
export {
  clampFaceDetectFramesPerVideo as clampFaceDetectFramesPerVideoForm,
  clampFaceDetectMinScore as clampFaceDetectMinScoreForm,
  clampFaceCandidateLimit as clampFaceMatchCandidateLimitForm,
  clampFaceMatchConfidence as clampFaceMatchConfidenceForm,
  normalizeGenderFilter as normalizeFaceGenderFilterForm,
  parseFaceMatchMode as parseFaceMatchModeForm,
  parseFaceMatchAfterDetect as parseMatchAfterDetectForm,
  parseFaceMatchAutoBlindTags as parseMatchAutoBlindTagsForm,
  isBlindPersonTagName,
  nextBlindPersonName,
} from '@shared/faceSettings'
