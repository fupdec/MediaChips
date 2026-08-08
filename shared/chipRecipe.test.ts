import {describe, expect, it} from 'vitest'
import {
  CHIP_RECIPE_FORMAT,
  CHIP_RECIPE_VERSION,
  buildChipRecipe,
  catalogEntryFromRecipe,
  chipRecipeFilename,
  fieldKeyFromName,
  isChipRecipeFormat,
  slugifyRecipeId,
} from './chipRecipe'
import {parseChipRecipe, parseChipRecipeCatalog} from './schemas/chipRecipe'

describe('chipRecipe', () => {
  it('slugifies recipe ids and filenames', () => {
    expect(slugifyRecipeId('Movies Basic!')).toBe('movies-basic')
    expect(chipRecipeFilename('Movies Basic')).toBe('movies-basic.chiprecipe.json')
    expect(fieldKeyFromName('Tags', 'array')).toBe('array-tags')
  })

  it('builds a self-describing recipe', () => {
    const recipe = buildChipRecipe({
      name: 'Movies basic',
      description: 'Starter movie fields',
      author: 'vit',
      category: 'movies',
      sfw: true,
      fields: [{
        key: 'array-tags',
        type: 'array',
        name: 'Tags',
        tags: [{name: 'Action'}],
      }],
      mediaTypePins: [{mediaTypeName: 'video', fieldKeys: ['array-tags']}],
    })

    expect(recipe.format).toBe(CHIP_RECIPE_FORMAT)
    expect(recipe.version).toBe(CHIP_RECIPE_VERSION)
    expect(recipe.id).toBe('movies-basic')
    expect(isChipRecipeFormat(recipe)).toBe(true)
    expect(parseChipRecipe(recipe).name).toBe('Movies basic')
  })

  it('rejects invalid format magic', () => {
    expect(() => parseChipRecipe({
      format: 'nope',
      version: 1,
      id: 'x',
      name: 'X',
      fields: [{key: 'a', type: 'array', name: 'Tags'}],
    })).toThrow()
  })

  it('builds catalog entries and parses catalog index', () => {
    const recipe = buildChipRecipe({
      name: 'Photos',
      category: 'photos',
      sfw: true,
      fields: [{key: 'array-tags', type: 'array', name: 'Tags'}],
    })
    const entry = catalogEntryFromRecipe(recipe, 'recipes/photos.chiprecipe.json')
    expect(entry.path).toBe('recipes/photos.chiprecipe.json')
    expect(entry.id).toBe('photos')

    const catalog = parseChipRecipeCatalog({
      updatedAt: '2026-08-08T00:00:00.000Z',
      recipes: [entry],
    })
    expect(catalog.recipes).toHaveLength(1)
  })
})
