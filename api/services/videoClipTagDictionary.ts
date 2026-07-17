import type { AnyRecord } from '../types/db'

const tags = [
  {
    key: 'person',
    labels: {en: 'person', de: 'Person', fr: 'personne', ru: 'человек', es: 'persona', cn: '人物'},
    prompts: ['a person', 'people', 'human face', 'human body'],
  },
  {
    key: 'animal',
    labels: {en: 'animal', de: 'Tier', fr: 'animal', ru: 'животное', es: 'animal', cn: '动物'},
    prompts: ['animal', 'wild animal', 'pet animal'],
  },
  {
    key: 'dog',
    labels: {en: 'dog', de: 'Hund', fr: 'chien', ru: 'собака', es: 'perro', cn: '狗'},
    prompts: ['dog', 'pet dog'],
  },
  {
    key: 'cat',
    labels: {en: 'cat', de: 'Katze', fr: 'chat', ru: 'кот', es: 'gato', cn: '猫'},
    prompts: ['cat', 'pet cat'],
  },
  {
    key: 'bird',
    labels: {en: 'bird', de: 'Vogel', fr: 'oiseau', ru: 'птица', es: 'pájaro', cn: '鸟'},
    prompts: ['bird', 'flying bird'],
  },
  {
    key: 'horse',
    labels: {en: 'horse', de: 'Pferd', fr: 'cheval', ru: 'лошадь', es: 'caballo', cn: '马'},
    prompts: ['horse'],
  },
  {
    key: 'car',
    labels: {en: 'car', de: 'Auto', fr: 'voiture', ru: 'машина', es: 'coche', cn: '汽车'},
    prompts: ['car', 'automobile'],
  },
  {
    key: 'bicycle',
    labels: {en: 'bicycle', de: 'Fahrrad', fr: 'vélo', ru: 'велосипед', es: 'bicicleta', cn: '自行车'},
    prompts: ['bicycle', 'bike'],
  },
  {
    key: 'motorcycle',
    labels: {en: 'motorcycle', de: 'Motorrad', fr: 'moto', ru: 'мотоцикл', es: 'motocicleta', cn: '摩托车'},
    prompts: ['motorcycle', 'motorbike'],
  },
  {
    key: 'train',
    labels: {en: 'train', de: 'Zug', fr: 'train', ru: 'поезд', es: 'tren', cn: '火车'},
    prompts: ['train', 'railway train'],
  },
  {
    key: 'airplane',
    labels: {en: 'airplane', de: 'Flugzeug', fr: 'avion', ru: 'самолёт', es: 'avión', cn: '飞机'},
    prompts: ['airplane', 'aircraft'],
  },
  {
    key: 'boat',
    labels: {en: 'boat', de: 'Boot', fr: 'bateau', ru: 'лодка', es: 'barco', cn: '船'},
    prompts: ['boat', 'ship'],
  },
  {
    key: 'nature',
    labels: {en: 'nature', de: 'Natur', fr: 'nature', ru: 'природа', es: 'naturaleza', cn: '自然'},
    prompts: ['nature', 'natural landscape', 'outdoors'],
  },
  {
    key: 'forest',
    labels: {en: 'forest', de: 'Wald', fr: 'forêt', ru: 'лес', es: 'bosque', cn: '森林'},
    prompts: ['forest', 'woods', 'trees'],
  },
  {
    key: 'tree',
    labels: {en: 'tree', de: 'Baum', fr: 'arbre', ru: 'дерево', es: 'árbol', cn: '树'},
    prompts: ['tree', 'trees'],
  },
  {
    key: 'flower',
    labels: {en: 'flower', de: 'Blume', fr: 'fleur', ru: 'цветок', es: 'flor', cn: '花'},
    prompts: ['flower', 'flowers'],
  },
  {
    key: 'mountain',
    labels: {en: 'mountain', de: 'Berg', fr: 'montagne', ru: 'гора', es: 'montaña', cn: '山'},
    prompts: ['mountain', 'mountains'],
  },
  {
    key: 'waterfall',
    labels: {en: 'waterfall', de: 'Wasserfall', fr: 'cascade', ru: 'водопад', es: 'cascada', cn: '瀑布'},
    prompts: ['waterfall'],
  },
  {
    key: 'ocean',
    labels: {en: 'ocean', de: 'Ozean', fr: 'océan', ru: 'океан', es: 'océano', cn: '海洋'},
    prompts: ['ocean', 'sea', 'waves'],
  },
  {
    key: 'beach',
    labels: {en: 'beach', de: 'Strand', fr: 'plage', ru: 'пляж', es: 'playa', cn: '海滩'},
    prompts: ['beach', 'sand beach'],
  },
  {
    key: 'river',
    labels: {en: 'river', de: 'Fluss', fr: 'rivière', ru: 'река', es: 'río', cn: '河流'},
    prompts: ['river', 'stream'],
  },
  {
    key: 'snow',
    labels: {en: 'snow', de: 'Schnee', fr: 'neige', ru: 'снег', es: 'nieve', cn: '雪'},
    prompts: ['snow', 'snowy scene'],
  },
  {
    key: 'city',
    labels: {en: 'city', de: 'Stadt', fr: 'ville', ru: 'город', es: 'ciudad', cn: '城市'},
    prompts: ['city', 'urban scene', 'city street'],
  },
  {
    key: 'street',
    labels: {en: 'street', de: 'Straße', fr: 'rue', ru: 'улица', es: 'calle', cn: '街道'},
    prompts: ['street', 'road'],
  },
  {
    key: 'building',
    labels: {en: 'building', de: 'Gebäude', fr: 'bâtiment', ru: 'здание', es: 'edificio', cn: '建筑'},
    prompts: ['building', 'architecture'],
  },
  {
    key: 'office',
    labels: {en: 'office', de: 'Büro', fr: 'bureau', ru: 'офис', es: 'oficina', cn: '办公室'},
    prompts: ['office', 'workplace'],
  },
  {
    key: 'home',
    labels: {en: 'home', de: 'Zuhause', fr: 'maison', ru: 'дом', es: 'casa', cn: '家'},
    prompts: ['home interior', 'house interior'],
  },
  {
    key: 'kitchen',
    labels: {en: 'kitchen', de: 'Küche', fr: 'cuisine', ru: 'кухня', es: 'cocina', cn: '厨房'},
    prompts: ['kitchen'],
  },
  {
    key: 'food',
    labels: {en: 'food', de: 'Essen', fr: 'nourriture', ru: 'еда', es: 'comida', cn: '食物'},
    prompts: ['food', 'meal'],
  },
  {
    key: 'coffee',
    labels: {en: 'coffee', de: 'Kaffee', fr: 'café', ru: 'кофе', es: 'café', cn: '咖啡'},
    prompts: ['coffee', 'cup of coffee'],
  },
  {
    key: 'drink',
    labels: {en: 'drink', de: 'Getränk', fr: 'boisson', ru: 'напиток', es: 'bebida', cn: '饮料'},
    prompts: ['drink', 'beverage'],
  },
  {
    key: 'computer',
    labels: {en: 'computer', de: 'Computer', fr: 'ordinateur', ru: 'компьютер', es: 'ordenador', cn: '电脑'},
    prompts: ['computer', 'desktop computer'],
  },
  {
    key: 'laptop',
    labels: {en: 'laptop', de: 'Laptop', fr: 'ordinateur portable', ru: 'ноутбук', es: 'portátil', cn: '笔记本电脑'},
    prompts: ['laptop', 'notebook computer'],
  },
  {
    key: 'phone',
    labels: {en: 'phone', de: 'Telefon', fr: 'téléphone', ru: 'телефон', es: 'teléfono', cn: '手机'},
    prompts: ['phone', 'smartphone'],
  },
  {
    key: 'screen',
    labels: {en: 'screen', de: 'Bildschirm', fr: 'écran', ru: 'экран', es: 'pantalla', cn: '屏幕'},
    prompts: ['screen', 'monitor display'],
  },
  {
    key: 'sport',
    labels: {en: 'sport', de: 'Sport', fr: 'sport', ru: 'спорт', es: 'deporte', cn: '运动'},
    prompts: ['sport', 'sports activity'],
  },
  {
    key: 'running',
    labels: {en: 'running', de: 'Laufen', fr: 'course', ru: 'бег', es: 'correr', cn: '跑步'},
    prompts: ['running', 'person running'],
  },
  {
    key: 'yoga',
    labels: {en: 'yoga', de: 'Yoga', fr: 'yoga', ru: 'йога', es: 'yoga', cn: '瑜伽'},
    prompts: ['yoga', 'person doing yoga'],
  },
  {
    key: 'dance',
    labels: {en: 'dance', de: 'Tanz', fr: 'danse', ru: 'танец', es: 'baile', cn: '舞蹈'},
    prompts: ['dance', 'dancing'],
  },
  {
    key: 'music',
    labels: {en: 'music', de: 'Musik', fr: 'musique', ru: 'музыка', es: 'música', cn: '音乐'},
    prompts: ['music', 'musical instrument', 'concert'],
  },
  {
    key: 'book',
    labels: {en: 'book', de: 'Buch', fr: 'livre', ru: 'книга', es: 'libro', cn: '书'},
    prompts: ['book', 'books'],
  },
  {
    key: 'art',
    labels: {en: 'art', de: 'Kunst', fr: 'art', ru: 'искусство', es: 'arte', cn: '艺术'},
    prompts: ['art', 'painting', 'artwork'],
  },
  {
    key: 'night',
    labels: {en: 'night', de: 'Nacht', fr: 'nuit', ru: 'ночь', es: 'noche', cn: '夜晚'},
    prompts: ['night', 'night scene'],
  },
  {
    key: 'sunset',
    labels: {en: 'sunset', de: 'Sonnenuntergang', fr: 'coucher de soleil', ru: 'закат', es: 'atardecer', cn: '日落'},
    prompts: ['sunset'],
  },
  {
    key: 'morning',
    labels: {en: 'morning', de: 'Morgen', fr: 'matin', ru: 'утро', es: 'mañana', cn: '早晨'},
    prompts: ['morning', 'morning light'],
  },
  {
    key: 'rain',
    labels: {en: 'rain', de: 'Regen', fr: 'pluie', ru: 'дождь', es: 'lluvia', cn: '雨'},
    prompts: ['rain', 'rainy scene'],
  },
  {
    key: 'fire',
    labels: {en: 'fire', de: 'Feuer', fr: 'feu', ru: 'огонь', es: 'fuego', cn: '火'},
    prompts: ['fire', 'flames'],
  },
  {
    key: 'smoke',
    labels: {en: 'smoke', de: 'Rauch', fr: 'fumée', ru: 'дым', es: 'humo', cn: '烟'},
    prompts: ['smoke'],
  },
  {
    key: 'weapon',
    labels: {en: 'weapon', de: 'Waffe', fr: 'arme', ru: 'оружие', es: 'arma', cn: '武器'},
    prompts: ['weapon', 'gun', 'knife'],
  },
  {
    key: 'blood',
    labels: {en: 'blood', de: 'Blut', fr: 'sang', ru: 'кровь', es: 'sangre', cn: '血'},
    prompts: ['blood'],
  },
  {
    key: 'nudity',
    labels: {en: 'nudity', de: 'Nacktheit', fr: 'nudité', ru: 'нагота', es: 'desnudez', cn: '裸体'},
    prompts: ['nudity', 'nude body'],
  },
  {
    key: 'underwear',
    labels: {en: 'underwear', de: 'Unterwäsche', fr: 'sous-vêtements', ru: 'нижнее бельё', es: 'ropa interior', cn: '内衣'},
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
