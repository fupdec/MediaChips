export const recommendedThemePalettes = [
  {
    id: 'default',
    light: { header: '#E4E3F7', headerEnd: '#F4EBD7', primary: '#3B368C', secondary: '#9A5B00' },
    dark: { header: '#29274F', headerEnd: '#413825', primary: '#BBB8FF', secondary: '#FFC24D' },
  },
  {
    id: 'ocean',
    light: { header: '#DCEBFA', headerEnd: '#D9F3EF', primary: '#174B8D', secondary: '#115E59' },
    dark: { header: '#172F4D', headerEnd: '#214347', primary: '#9AC9FF', secondary: '#88E2D2' },
  },
  {
    id: 'forest',
    light: { header: '#E0EFE3', headerEnd: '#F4ECD8', primary: '#245838', secondary: '#72501A' },
    dark: { header: '#20382B', headerEnd: '#3C3823', primary: '#A5DBB4', secondary: '#F4CC8A' },
  },
  {
    id: 'iris',
    light: { header: '#EAE3F7', headerEnd: '#F5E3EE', primary: '#533587', secondary: '#833656' },
    dark: { header: '#33264D', headerEnd: '#492D43', primary: '#D2B9FF', secondary: '#F5ADCD' },
  },
  {
    id: 'slate',
    light: { header: '#E4EAF0', headerEnd: '#DDECF0', primary: '#34465B', secondary: '#35576A' },
    dark: { header: '#293643', headerEnd: '#233E48', primary: '#BCCFE5', secondary: '#9ED7E9' },
  },
  {
    id: 'amber',
    light: { header: '#F9E9CE', headerEnd: '#F7DFD4', primary: '#874608', secondary: '#81382B' },
    dark: { header: '#432D18', headerEnd: '#462B2A', primary: '#FFD295', secondary: '#FFB9AA' },
  },
  {
    id: 'berry',
    light: { header: '#F8E3E9', headerEnd: '#EEE4F8', primary: '#8C3154', secondary: '#584087' },
    dark: { header: '#482439', headerEnd: '#37284C', primary: '#FFB5D2', secondary: '#D8C1FF' },
  },
  {
    id: 'lagoon',
    light: { header: '#D9F0EB', headerEnd: '#DFEDF9', primary: '#135C5C', secondary: '#254E85' },
    dark: { header: '#183C3C', headerEnd: '#223250', primary: '#85E2D5', secondary: '#AAC9FF' },
  },
  {
    id: 'clay',
    light: { header: '#F5E3D9', headerEnd: '#F4EBD6', primary: '#883E28', secondary: '#6C501B' },
    dark: { header: '#492B24', headerEnd: '#403420', primary: '#FFBBA5', secondary: '#F6D48D' },
  },
  {
    id: 'olive',
    light: { header: '#EAEFD7', headerEnd: '#DBEEE0', primary: '#49571A', secondary: '#225945' },
    dark: { header: '#323C20', headerEnd: '#203B30', primary: '#D1DE92', secondary: '#A1DDBF' },
  },
  {
    id: 'indigo',
    light: { header: '#E3E7FD', headerEnd: '#DDECF8', primary: '#353E92', secondary: '#235578' },
    dark: { header: '#282D55', headerEnd: '#223A50', primary: '#B7C0FF', secondary: '#A3D3F5' },
  },
  {
    id: 'cocoa',
    light: { header: '#F0E6DE', headerEnd: '#F4E5EC', primary: '#654534', secondary: '#793B63' },
    dark: { header: '#3C2D27', headerEnd: '#432C3B', primary: '#EBC8AF', secondary: '#F2B6DA' },
  },
  {
    id: 'glacier',
    light: { header: '#E4F0F8', headerEnd: '#E3F2F4', primary: '#284E69', secondary: '#23616A' },
    dark: { header: '#233747', headerEnd: '#244047', primary: '#AFD9F6', secondary: '#A2E2E9' },
  },
  {
    id: 'plum',
    light: { header: '#F0E3F0', headerEnd: '#EEE7DD', primary: '#6A3A70', secondary: '#66502D' },
    dark: { header: '#3C2940', headerEnd: '#3D3327', primary: '#EDBCEF', secondary: '#EBD1A7' },
  },
  {
    id: 'moss',
    light: { header: '#E4EFE1', headerEnd: '#E1EEF1', primary: '#355632', secondary: '#285660' },
    dark: { header: '#283C29', headerEnd: '#24383F', primary: '#B9DCAC', secondary: '#A9D9E2' },
  },
] as const

export type RecommendedPaletteId = typeof recommendedThemePalettes[number]['id']

/** Theme used for new databases; also selectable as the first recommended palette. */
export const defaultThemePalette = recommendedThemePalettes[0]
