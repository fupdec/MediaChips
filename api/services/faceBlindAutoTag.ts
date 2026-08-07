import type {ApiDb} from '../types/db'
import {createFacesRepository} from '../db/repositories/faces'
import {createTagsRepository} from '../db/repositories/tags'
import {createTagsInMediaRepository} from '../db/repositories/tagsInMedia'
import {createFaceEnrollmentsRepository} from '../db/repositories/faceEnrollments'
import {nextBlindPersonName} from '../../shared/faceSettings'
import {clusterFacesInMedia} from './faceCluster'
import {embeddingFromJson} from './faceMatchScoring'

export {BLIND_PERSON_NAME_RE, isBlindPersonTagName, nextBlindPersonName} from '../../shared/faceSettings'

export type BlindClusterCandidate = {
  clusterId: number
  faceIds: number[]
  representativeFaceId: number
  size: number
}

/** Prefer stored embeddings with a real vector; empty/zero JSON is skipped. */
export function parseUsableFaceEmbedding(value: unknown): Float32Array | null {
  if (value == null || value === '') return null
  const embedding = embeddingFromJson(String(value))
  let sum = 0
  for (let i = 0; i < embedding.length; i++) sum += embedding[i] * embedding[i]
  if (sum < 1e-6) return null
  return embedding
}

/** Pick unlabeled clusters large enough to become Person N tags. */
export function selectBlindClustersForAutoTag(
  clustered: Array<{
    id: number
    tagId: number | null
    matchScore?: number | null
    score?: number | null
    clusterId: number
    clusterFaceIds: number[]
    clusterSize: number
    clusterRepresentative: boolean
  }>,
  options: {minClusterSize?: number; maxClusters?: number} = {},
): BlindClusterCandidate[] {
  const minSize = Math.max(2, Number(options.minClusterSize) || 2)
  const maxClusters = Math.max(1, Math.min(Number(options.maxClusters) || 5, 20))

  const byCluster = new Map<number, typeof clustered>()
  for (const face of clustered) {
    const list = byCluster.get(face.clusterId) || []
    list.push(face)
    byCluster.set(face.clusterId, list)
  }

  const candidates: BlindClusterCandidate[] = []
  for (const [clusterId, members] of byCluster) {
    if (members.some((face) => face.tagId != null && Number(face.tagId) > 0)) continue
    const size = Math.max(
      members[0]?.clusterSize || 0,
      members.length,
      ...members.map((face) => face.clusterFaceIds?.length || 0),
    )
    if (size < minSize) continue
    const representative = members.find((face) => face.clusterRepresentative)
      || [...members].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0]
    if (!representative) continue
    candidates.push({
      clusterId,
      faceIds: [...new Set(members.flatMap((face) => (
        face.clusterFaceIds?.length ? face.clusterFaceIds : [face.id]
      )))],
      representativeFaceId: representative.id,
      size,
    })
  }

  return candidates
    .sort((a, b) => b.size - a.size || a.clusterId - b.clusterId)
    .slice(0, maxClusters)
}

/**
 * Create Person N tags for large unlabeled face clusters and apply them to media.
 * Requires a configured performer meta category.
 */
export function applyBlindPersonTagsForMedia(
  db: ApiDb,
  mediaId: number,
  options: {
    metaId: number
    minClusterSize?: number
    maxClusters?: number
  },
): {createdTags: number; appliedFaces: number; clusters: number} {
  const metaId = Number(options.metaId)
  const id = Number(mediaId)
  if (!Number.isFinite(metaId) || metaId <= 0 || !Number.isFinite(id) || id <= 0) {
    return {createdTags: 0, appliedFaces: 0, clusters: 0}
  }

  const facesRepo = createFacesRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)

  const faces = facesRepo.findByMediaId(id)
  const prepared = faces.map((face) => {
    const embedding = parseUsableFaceEmbedding(face.embedding)
    return {
      id: Number(face.id),
      tagId: face.tagId != null ? Number(face.tagId) : null,
      matchScore: face.matchScore != null ? Number(face.matchScore) : null,
      score: Number(face.score) || 0,
      timestamp: face.timestamp,
      embedding,
      cropPath: face.cropPath,
      embeddingJson: face.embedding ? String(face.embedding) : null,
    }
  }).filter((face) => Number.isFinite(face.id) && face.id > 0 && face.embedding)

  const clustered = clusterFacesInMedia(prepared)
  const candidates = selectBlindClustersForAutoTag(clustered, options)
  if (!candidates.length) {
    return {createdTags: 0, appliedFaces: 0, clusters: 0}
  }

  const existingNames = tagsRepo.findByMetaIds([metaId]).map((tag) => String(tag.name || ''))
  let createdTags = 0
  let appliedFaces = 0

  for (const candidate of candidates) {
    const name = nextBlindPersonName(existingNames)
    existingNames.push(name)
    const created = tagsRepo.bulkCreate([{name, metaId}])
    const tag = created[0]
    if (!tag?.id) continue
    createdTags += 1

    const faceById = new Map(prepared.map((face) => [face.id, face]))
    for (const faceId of candidate.faceIds) {
      const face = faceById.get(faceId)
      if (!face) continue
      facesRepo.updateMatch(faceId, {
        tagId: Number(tag.id),
        matchScore: 1,
        matchStatus: 'manual',
      })
      appliedFaces += 1

      if (faceId === candidate.representativeFaceId && face.embeddingJson) {
        try {
          enrollmentsRepo.create({
            tagId: Number(tag.id),
            metaId,
            source: 'faceCrop',
            sourcePath: face.cropPath || `face:${faceId}`,
            embedding: face.embeddingJson,
          })
        } catch {
          // Enrollment is best-effort for blind tags.
        }
      }
    }

    tagsInMediaRepo.bulkCreate([{
      mediaId: id,
      tagId: Number(tag.id),
      metaId,
    }])
  }

  return {createdTags, appliedFaces, clusters: candidates.length}
}
