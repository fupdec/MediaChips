import {describe, expect, it} from 'vitest'
import {stripMdiLegacyFontUrls} from './strip-mdi-legacy-fonts.mjs'

const SAMPLE = `@font-face {
  font-family: "Material Design Icons";
  src: url("../fonts/materialdesignicons-webfont.eot?v=7.4.47");
  src: url("../fonts/materialdesignicons-webfont.eot?#iefix&v=7.4.47") format("embedded-opentype"),
       url("../fonts/materialdesignicons-webfont.woff2?v=7.4.47") format("woff2"),
       url("../fonts/materialdesignicons-webfont.woff?v=7.4.47") format("woff"),
       url("../fonts/materialdesignicons-webfont.ttf?v=7.4.47") format("truetype");
}`

describe('stripMdiLegacyFontUrls', () => {
  it('keeps woff2/woff and drops eot/ttf', () => {
    const next = stripMdiLegacyFontUrls(SAMPLE)
    expect(next).toContain('.woff2')
    expect(next).toContain('.woff')
    expect(next).not.toContain('.eot')
    expect(next).not.toContain('.ttf')
    expect(next).not.toContain('embedded-opentype')
    expect(next).not.toContain('truetype')
  })
})
