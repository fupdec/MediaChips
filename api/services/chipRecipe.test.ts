import {describe, expect, it, vi} from 'vitest'
import axios from 'axios'
import {
  chipRecipeDiscordInfo,
  fetchChipRecipeCatalog,
  fetchChipRecipeFromCatalog,
  getChipRecipeCatalogUrl,
  DEFAULT_CHIP_RECIPE_CATALOG_URL,
} from './chipRecipe'
import {parseChipRecipe} from '../../shared/schemas/chipRecipe'
import moviesBasic from '../../chip-recipes/recipes/movies-basic.chiprecipe.json'
import photosBasic from '../../chip-recipes/recipes/photos-basic.chiprecipe.json'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('chipRecipe service helpers', () => {
  it('defaults catalog url and discord info', () => {
    expect(getChipRecipeCatalogUrl()).toBe(DEFAULT_CHIP_RECIPE_CATALOG_URL)
    expect(chipRecipeDiscordInfo().discordUrl).toContain('discord.gg')
    expect(chipRecipeDiscordInfo().filenameExample).toBe('movies-basic.chiprecipe.json')
  })

  it('starter recipes validate against schema', () => {
    expect(parseChipRecipe(moviesBasic).id).toBe('movies-basic')
    expect(parseChipRecipe(photosBasic).id).toBe('photos-basic')
  })

  it('falls back to bundled chip-recipes catalog when remote fails', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network down'))
    const catalog = await fetchChipRecipeCatalog()
    expect(catalog.recipes.length).toBeGreaterThan(0)
    expect(catalog.recipes.some((entry) => entry.id === 'movies-basic')).toBe(true)

    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network down'))
    const recipe = await fetchChipRecipeFromCatalog('recipes/movies-basic.chiprecipe.json')
    expect(recipe.id).toBe('movies-basic')
  })
})
