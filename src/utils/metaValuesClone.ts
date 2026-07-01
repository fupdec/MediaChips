import isEqual from 'lodash/isEqual'

export type MetaFieldValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | null
  | undefined

export interface MetaValuesMap {
  [key: string]: MetaFieldValue
}

export function cloneMetaFieldValue(val: MetaFieldValue | undefined): MetaFieldValue {
  if (Array.isArray(val)) return [...val] as MetaFieldValue
  return val
}

export function cloneMetaValues(values: MetaValuesMap): MetaValuesMap {
  const result: MetaValuesMap = {}
  for (const key in values) {
    result[key] = cloneMetaFieldValue(values[key])
  }
  return result
}

export function metaArrayValuesEqual(
  left: MetaFieldValue | undefined,
  right: MetaFieldValue | undefined,
): boolean {
  const leftArr = Array.isArray(left) ? [...left].sort() : []
  const rightArr = Array.isArray(right) ? [...right].sort() : []
  return isEqual(leftArr, rightArr)
}
