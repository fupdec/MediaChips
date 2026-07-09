import {describe, expect, it} from 'vitest'
import {isLikelyExternalFileDrag} from '@shared/mediaFileDrag'

function createDragEvent(types: string[] = [], items: DataTransferItem[] = []) {
  return {
    dataTransfer: {
      types,
      files: [],
      items,
    },
  } as unknown as DragEvent
}

describe('isLikelyExternalFileDrag', () => {
  it('detects the Files type case-insensitively', () => {
    expect(isLikelyExternalFileDrag(createDragEvent(['Files']))).toBe(true)
    expect(isLikelyExternalFileDrag(createDragEvent(['files']))).toBe(true)
  })

  it('detects uri-list and moz file drags', () => {
    expect(isLikelyExternalFileDrag(createDragEvent(['text/uri-list']))).toBe(true)
    expect(isLikelyExternalFileDrag(createDragEvent(['application/x-moz-file']))).toBe(true)
  })

  it('treats empty drag types as external file drags in Electron', () => {
    expect(isLikelyExternalFileDrag(createDragEvent([]))).toBe(true)
  })

  it('ignores plain text-only internal drags', () => {
    expect(isLikelyExternalFileDrag(createDragEvent(['text/plain']))).toBe(false)
    expect(isLikelyExternalFileDrag(createDragEvent(['text/html']))).toBe(false)
  })

  it('detects file items when types are empty', () => {
    const items = [{kind: 'file'}] as DataTransferItem[]
    expect(isLikelyExternalFileDrag(createDragEvent([], items))).toBe(true)
  })
})
