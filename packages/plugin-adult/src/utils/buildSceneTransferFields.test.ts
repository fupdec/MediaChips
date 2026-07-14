import {describe, expect, it} from 'vitest'
import {getSceneScraperExtras} from './buildSceneTransferFields'
import type {SceneScraperScene} from '../types/sceneScraper'

const scene: SceneScraperScene = {
  id: '1',
  title: 'Demo',
  performers: [
    {performer: {id: '1', name: 'Alice', gender: 'Female'}},
    {performer: {id: '2', name: 'Bob', gender: 'Male'}},
    {performer: {id: '3', name: 'Casey', gender: 'TRANSGENDER_FEMALE'}},
    {performer: {id: '4', name: 'Unknown'}},
  ],
  tags: [{id: 't1', name: 'Outdoor'}],
}

describe('getSceneScraperExtras performer gender filter', () => {
  it('keeps all performers when no gender filter is set', () => {
    const extras = getSceneScraperExtras(scene)
    expect(extras.performers).toEqual(['Alice', 'Bob', 'Casey', 'Unknown'])
  })

  it('keeps only matching genders when a filter is set', () => {
    expect(getSceneScraperExtras(scene, {performerGender: 'Female'}).performers).toEqual(['Alice'])
    expect(getSceneScraperExtras(scene, {performerGender: 'Male'}).performers).toEqual(['Bob'])
    expect(
      getSceneScraperExtras(scene, {performerGender: 'Transgender Female'}).performers,
    ).toEqual(['Casey'])
  })
})
