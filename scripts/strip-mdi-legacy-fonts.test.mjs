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

const MINIFIED = `@font-face{font-family:"Material Design Icons";src:url("../fonts/materialdesignicons-webfont.eot?v=7.4.47");src:url("../fonts/materialdesignicons-webfont.eot?#iefix&v=7.4.47") format("embedded-opentype"),url("../fonts/materialdesignicons-webfont.woff2?v=7.4.47") format("woff2"),url("../fonts/materialdesignicons-webfont.woff?v=7.4.47") format("woff"),url("../fonts/materialdesignicons-webfont.ttf?v=7.4.47") format("truetype");}`

describe('stripMdiLegacyFontUrls', () => {
  it('keeps woff2 only and drops eot/woff/ttf', () => {
    const next = stripMdiLegacyFontUrls(SAMPLE)
    expect(next).toContain('.woff2')
    expect(next).toContain('format("woff2")')
    expect(next).not.toContain('.eot')
    expect(next).not.toContain('format("woff")')
    expect(next).not.toContain('.ttf')
    expect(next).not.toContain('embedded-opentype')
    expect(next).not.toContain('truetype')
    // Avoid matching the "woff" inside "woff2"
    expect(next).not.toMatch(/\.woff\?/)
  })

  it('strips minified @font-face the same way', () => {
    const next = stripMdiLegacyFontUrls(MINIFIED)
    expect(next).toContain('.woff2')
    expect(next).not.toMatch(/\.woff\?/)
    expect(next).not.toContain('.eot')
    expect(next).not.toContain('.ttf')
  })
})
