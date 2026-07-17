import type { AnyRecord } from '../types/db'

const tags = [
  {
    key: 'person',
    labels: {en: 'person', de: 'Person', ru: 'человек', es: 'persona', cn: '人物'},
    prompts: ['a person', 'people', 'human face', 'human body'],
  },
  {
    key: 'animal',
    labels: {en: 'animal', de: 'Tier', ru: 'животное', es: 'animal', cn: '动物'},
    prompts: ['animal', 'wild animal', 'pet animal'],
  },
  {
    key: 'dog',
    labels: {en: 'dog', de: 'Hund', ru: 'собака', es: 'perro', cn: '狗'},
    prompts: ['dog', 'pet dog'],
  },
  {
    key: 'cat',
    labels: {en: 'cat', de: 'Katze', ru: 'кот', es: 'gato', cn: '猫'},
    prompts: ['cat', 'pet cat'],
  },
  {
    key: 'bird',
    labels: {en: 'bird', de: 'Vogel', ru: 'птица', es: 'pájaro', cn: '鸟'},
    prompts: ['bird', 'flying bird'],
  },
  {
    key: 'horse',
    labels: {en: 'horse', de: 'Pferd', ru: 'лошадь', es: 'caballo', cn: '马'},
    prompts: ['horse'],
  },
  {
    key: 'car',
    labels: {en: 'car', de: 'Auto', ru: 'машина', es: 'coche', cn: '汽车'},
    prompts: ['car', 'automobile'],
  },
  {
    key: 'bicycle',
    labels: {en: 'bicycle', de: 'Fahrrad', ru: 'велосипед', es: 'bicicleta', cn: '自行车'},
    prompts: ['bicycle', 'bike'],
  },
  {
    key: 'motorcycle',
    labels: {en: 'motorcycle', de: 'Motorrad', ru: 'мотоцикл', es: 'motocicleta', cn: '摩托车'},
    prompts: ['motorcycle', 'motorbike'],
  },
  {
    key: 'train',
    labels: {en: 'train', de: 'Zug', ru: 'поезд', es: 'tren', cn: '火车'},
    prompts: ['train', 'railway train'],
  },
  {
    key: 'airplane',
    labels: {en: 'airplane', de: 'Flugzeug', ru: 'самолёт', es: 'avión', cn: '飞机'},
    prompts: ['airplane', 'aircraft'],
  },
  {
    key: 'boat',
    labels: {en: 'boat', de: 'Boot', ru: 'лодка', es: 'barco', cn: '船'},
    prompts: ['boat', 'ship'],
  },
  {
    key: 'nature',
    labels: {en: 'nature', de: 'Natur', ru: 'природа', es: 'naturaleza', cn: '自然'},
    prompts: ['nature', 'natural landscape', 'outdoors'],
  },
  {
    key: 'forest',
    labels: {en: 'forest', de: 'Wald', ru: 'лес', es: 'bosque', cn: '森林'},
    prompts: ['forest', 'woods', 'trees'],
  },
  {
    key: 'tree',
    labels: {en: 'tree', de: 'Baum', ru: 'дерево', es: 'árbol', cn: '树'},
    prompts: ['tree', 'trees'],
  },
  {
    key: 'flower',
    labels: {en: 'flower', de: 'Blume', ru: 'цветок', es: 'flor', cn: '花'},
    prompts: ['flower', 'flowers'],
  },
  {
    key: 'mountain',
    labels: {en: 'mountain', de: 'Berg', ru: 'гора', es: 'montaña', cn: '山'},
    prompts: ['mountain', 'mountains'],
  },
  {
    key: 'waterfall',
    labels: {en: 'waterfall', de: 'Wasserfall', ru: 'водопад', es: 'cascada', cn: '瀑布'},
    prompts: ['waterfall'],
  },
  {
    key: 'ocean',
    labels: {en: 'ocean', de: 'Ozean', ru: 'океан', es: 'océano', cn: '海洋'},
    prompts: ['ocean', 'sea', 'waves'],
  },
  {
    key: 'beach',
    labels: {en: 'beach', de: 'Strand', ru: 'пляж', es: 'playa', cn: '海滩'},
    prompts: ['beach', 'sand beach'],
  },
  {
    key: 'river',
    labels: {en: 'river', de: 'Fluss', ru: 'река', es: 'río', cn: '河流'},
    prompts: ['river', 'stream'],
  },
  {
    key: 'snow',
    labels: {en: 'snow', de: 'Schnee', ru: 'снег', es: 'nieve', cn: '雪'},
    prompts: ['snow', 'snowy scene'],
  },
  {
    key: 'city',
    labels: {en: 'city', de: 'Stadt', ru: 'город', es: 'ciudad', cn: '城市'},
    prompts: ['city', 'urban scene', 'city street'],
  },
  {
    key: 'street',
    labels: {en: 'street', de: 'Straße', ru: 'улица', es: 'calle', cn: '街道'},
    prompts: ['street', 'road'],
  },
  {
    key: 'building',
    labels: {en: 'building', de: 'Gebäude', ru: 'здание', es: 'edificio', cn: '建筑'},
    prompts: ['building', 'architecture'],
  },
  {
    key: 'office',
    labels: {en: 'office', de: 'Büro', ru: 'офис', es: 'oficina', cn: '办公室'},
    prompts: ['office', 'workplace'],
  },
  {
    key: 'home',
    labels: {en: 'home', de: 'Zuhause', ru: 'дом', es: 'casa', cn: '家'},
    prompts: ['home interior', 'house interior'],
  },
  {
    key: 'kitchen',
    labels: {en: 'kitchen', de: 'Küche', ru: 'кухня', es: 'cocina', cn: '厨房'},
    prompts: ['kitchen'],
  },
  {
    key: 'food',
    labels: {en: 'food', de: 'Essen', ru: 'еда', es: 'comida', cn: '食物'},
    prompts: ['food', 'meal'],
  },
  {
    key: 'coffee',
    labels: {en: 'coffee', de: 'Kaffee', ru: 'кофе', es: 'café', cn: '咖啡'},
    prompts: ['coffee', 'cup of coffee'],
  },
  {
    key: 'drink',
    labels: {en: 'drink', de: 'Getränk', ru: 'напиток', es: 'bebida', cn: '饮料'},
    prompts: ['drink', 'beverage'],
  },
  {
    key: 'computer',
    labels: {en: 'computer', de: 'Computer', ru: 'компьютер', es: 'ordenador', cn: '电脑'},
    prompts: ['computer', 'desktop computer'],
  },
  {
    key: 'laptop',
    labels: {en: 'laptop', de: 'Laptop', ru: 'ноутбук', es: 'portátil', cn: '笔记本电脑'},
    prompts: ['laptop', 'notebook computer'],
  },
  {
    key: 'phone',
    labels: {en: 'phone', de: 'Telefon', ru: 'телефон', es: 'teléfono', cn: '手机'},
    prompts: ['phone', 'smartphone'],
  },
  {
    key: 'screen',
    labels: {en: 'screen', de: 'Bildschirm', ru: 'экран', es: 'pantalla', cn: '屏幕'},
    prompts: ['screen', 'monitor display'],
  },
  {
    key: 'sport',
    labels: {en: 'sport', de: 'Sport', ru: 'спорт', es: 'deporte', cn: '运动'},
    prompts: ['sport', 'sports activity'],
  },
  {
    key: 'running',
    labels: {en: 'running', de: 'Laufen', ru: 'бег', es: 'correr', cn: '跑步'},
    prompts: ['running', 'person running'],
  },
  {
    key: 'yoga',
    labels: {en: 'yoga', de: 'Yoga', ru: 'йога', es: 'yoga', cn: '瑜伽'},
    prompts: ['yoga', 'person doing yoga'],
  },
  {
    key: 'dance',
    labels: {en: 'dance', de: 'Tanz', ru: 'танец', es: 'baile', cn: '舞蹈'},
    prompts: ['dance', 'dancing'],
  },
  {
    key: 'music',
    labels: {en: 'music', de: 'Musik', ru: 'музыка', es: 'música', cn: '音乐'},
    prompts: ['music', 'musical instrument', 'concert'],
  },
  {
    key: 'book',
    labels: {en: 'book', de: 'Buch', ru: 'книга', es: 'libro', cn: '书'},
    prompts: ['book', 'books'],
  },
  {
    key: 'art',
    labels: {en: 'art', de: 'Kunst', ru: 'искусство', es: 'arte', cn: '艺术'},
    prompts: ['art', 'painting', 'artwork'],
  },
  {
    key: 'night',
    labels: {en: 'night', de: 'Nacht', ru: 'ночь', es: 'noche', cn: '夜晚'},
    prompts: ['night', 'night scene'],
  },
  {
    key: 'sunset',
    labels: {en: 'sunset', de: 'Sonnenuntergang', ru: 'закат', es: 'atardecer', cn: '日落'},
    prompts: ['sunset'],
  },
  {
    key: 'morning',
    labels: {en: 'morning', de: 'Morgen', ru: 'утро', es: 'mañana', cn: '早晨'},
    prompts: ['morning', 'morning light'],
  },
  {
    key: 'rain',
    labels: {en: 'rain', de: 'Regen', ru: 'дождь', es: 'lluvia', cn: '雨'},
    prompts: ['rain', 'rainy scene'],
  },
  {
    key: 'fire',
    labels: {en: 'fire', de: 'Feuer', ru: 'огонь', es: 'fuego', cn: '火'},
    prompts: ['fire', 'flames'],
  },
  {
    key: 'smoke',
    labels: {en: 'smoke', de: 'Rauch', ru: 'дым', es: 'humo', cn: '烟'},
    prompts: ['smoke'],
  },
  {
    key: 'weapon',
    labels: {en: 'weapon', de: 'Waffe', ru: 'оружие', es: 'arma', cn: '武器'},
    prompts: ['weapon', 'gun', 'knife'],
  },
  {
    key: 'blood',
    labels: {en: 'blood', de: 'Blut', ru: 'кровь', es: 'sangre', cn: '血'},
    prompts: ['blood'],
  },
  {
    key: 'nudity',
    labels: {en: 'nudity', de: 'Nacktheit', ru: 'нагота', es: 'desnudez', cn: '裸体'},
    prompts: ['nudity', 'nude body'],
  },
  {
    key: 'underwear',
    labels: {en: 'underwear', de: 'Unterwäsche', ru: 'нижнее бельё', es: 'ropa interior', cn: '内衣'},
    prompts: ['underwear', 'lingerie'],
  },
]

function getLocalizedLabel(tag: AnyRecord, locale = 'en'): string {
  const labels = tag.labels as Record<string, string> | undefined
  return String(labels?.[locale] || labels?.en || tag.key || '')
}

function getPromptEntries() {
  return tags.flatMap(tag => tag.prompts.map(prompt => ({
    key: tag.key,
    prompt,
  })))
}

export { getLocalizedLabel, getPromptEntries, tags }
