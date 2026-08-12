import {describe, expect, it} from 'vitest'
import {
  buildLibrarySetupPhases,
  isLibrarySetupPhaseId,
  nextLibrarySetupPhase,
  openLibrarySetupWizardQuery,
  phaseIdFromStage,
  primaryPrepareLibraryLabelKey,
} from './useLibrarySetupWizard'
import {emptyHomeHealthUi} from '@/types/widgets'

describe('useLibrarySetupWizard', () => {
  it('groups health tasks into visuals / reliability / search / optional', () => {
    const health = emptyHomeHealthUi()
    health.generatedImages = {
      byType: {preview: {total: 2, pending: 2}},
      totalPending: 2,
    }
    health.fingerprint = {total: 5, pending: 2, hashed: 3}
    health.videoCodec = {total: 5, pending: 1, filled: 4}
    health.clip = {
      total: 3,
      pending: 3,
      hashed: 0,
      modelStatus: 'downloaded',
      model: 'clip',
    }
    health.faces = {total: 4, pending: 4, generated: 0}
    health.queue = [
      {id: 'visuals', severity: 'info', count: 2, autoFixable: true},
      {id: 'fingerprint', severity: 'info', count: 2, autoFixable: true},
      {id: 'codec', severity: 'info', count: 1, autoFixable: true},
      {id: 'clip', severity: 'info', count: 3, autoFixable: true},
    ]

    const phases = buildLibrarySetupPhases(health)
    expect(phases.map((phase) => phase.id)).toEqual([
      'visuals',
      'reliability',
      'search',
      'optional',
    ])
    expect(phases[0].stages).toEqual(['preview'])
    expect(phases[1].stages).toEqual(['fingerprint', 'codec'])
    expect(phases[2].stages).toEqual(['clip'])
    expect(phases[0].done).toBe(false)
    expect(phases[0].etaSeconds).toBeGreaterThan(0)
    expect(phases[1].etaSeconds).toBeGreaterThan(0)
    expect(nextLibrarySetupPhase(phases)?.id).toBe('visuals')
  })

  it('maps fix stages to wizard phases', () => {
    expect(phaseIdFromStage('preview')).toBe('visuals')
    expect(phaseIdFromStage('fingerprint')).toBe('reliability')
    expect(phaseIdFromStage('clip')).toBe('search')
    expect(phaseIdFromStage(null)).toBe(null)
  })

  it('picks continue label when some essential phases are done', () => {
    const health = emptyHomeHealthUi()
    health.fingerprint = {total: 5, pending: 2, hashed: 3}
    health.queue = [
      {id: 'fingerprint', severity: 'info', count: 2, autoFixable: true},
    ]
    const phases = buildLibrarySetupPhases(health)
    expect(primaryPrepareLibraryLabelKey(['fingerprint'], phases))
      .toBe('home.widgets.health_prepare_library_continue')
  })

  it('builds wizard deep-link query', () => {
    expect(openLibrarySetupWizardQuery('search')).toEqual({
      tab: 'database',
      section: 'library_health_guide',
      wizardStep: 'search',
    })
    expect(isLibrarySetupPhaseId('search')).toBe(true)
    expect(isLibrarySetupPhaseId('nope')).toBe(false)
  })
})
