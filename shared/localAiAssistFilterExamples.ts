/**
 * Built-in filter AI example chips (all UI locales).
 * Used to avoid showing another locale's preset from recent-goals storage.
 */
export const LOCAL_AI_FILTER_EXAMPLE_PRESETS = [
  // en
  'not watched month',
  'favorite, rating > 4',
  '1080p',
  '10-20 min',
  'in progress',
  'added this week',
  'views > 5',
  'hevc, 60 fps',
  // ru
  'не смотрел месяц',
  'избранное, рейтинг > 4',
  'от 10 до 20 минут',
  'недосмотренные',
  'добавлен на этой неделе',
  'просмотры > 5',
  // de
  'seit einem Monat nicht gesehen',
  'Favoriten, Bewertung > 4',
  '10–20 Min.',
  'angefangen',
  'diese Woche hinzugefügt',
  'Aufrufe > 5',
  // es
  'no visto en un mes',
  'favoritos, valoración > 4',
  'a medias',
  'añadido esta semana',
  'vistas > 5',
  // fr
  'pas vu depuis un mois',
  'favoris, note > 4',
  'en cours',
  'ajouté cette semaine',
  'vues > 5',
  // pt
  'não assistido há um mês',
  'favoritos, avaliação > 4',
  'em progresso',
  'adicionado esta semana',
  'visualizações > 5',
  // ja
  '1か月見ていない',
  'お気に入り、評価 > 4',
  '10〜20分',
  '視聴途中',
  '今週追加',
  '再生回数 > 5',
  // cn
  '一个月未观看',
  '收藏，评分 > 4',
  '10-20 分钟',
  '未看完',
  '本周添加',
  '观看次数 > 5',
] as const

const EMPTY_META_TEMPLATES = [
  'empty {field}',
  'без {field}',
  'ohne {field}',
  'sin {field}',
  'sans {field}',
  'sem {field}',
  '{field} なし',
  '无 {field}',
] as const

const presetExact = new Set(
  LOCAL_AI_FILTER_EXAMPLE_PRESETS.map((item) => item.trim().toLowerCase()),
)

const emptyMetaPatterns = EMPTY_META_TEMPLATES.map((tmpl) => {
  const escaped = tmpl
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{field\\}', '.+')
  return new RegExp(`^${escaped}$`, 'i')
})

export function isLocalAiFilterExamplePreset (text: string): boolean {
  const normalized = String(text || '').trim().toLowerCase()
  if (!normalized) return false
  if (presetExact.has(normalized)) return true
  return emptyMetaPatterns.some((pattern) => pattern.test(normalized))
}
