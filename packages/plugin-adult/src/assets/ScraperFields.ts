const ScraperFields = [
  { name: 'Birthday', type: 'date', key: 'birthday' },
  { name: 'Deathday', type: 'date', key: 'deathday' },
  {
    name: 'Year of career start',
    type: 'number',
    key: 'career_start_year',
  },
  {
    name: 'Year of career end',
    type: 'number',
    key: 'career_end_year',
  },
  {
    name: 'Gender',
    type: 'array',
    key: 'gender',
  },
  {
    name: 'Ethnicity',
    type: 'array',
    key: 'ethnicity',
  },
  {
    name: 'Eye color',
    type: 'array',
    key: 'eye_colour',
  },
  {
    name: 'Hair colors',
    type: 'array',
    key: 'hair_colour',
  },
  { name: 'Height', type: 'number', key: 'height' },
  { name: 'Weight', type: 'number', key: 'weight' },
  { name: 'Bra cups', type: 'array', key: 'cupsize' },
  { name: 'Bra size', type: 'number', key: 'bra' },
  { name: 'Waist size', type: 'number', key: 'waist' },
  { name: 'Hip size', type: 'number', key: 'hips' },
  {
    name: 'Natural breasts',
    type: 'array',
    key: 'fake_boobs',
  },
  { name: 'Tattoos', type: 'string', key: 'tattoos' },
]

export default ScraperFields
