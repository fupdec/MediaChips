import type { AnyRecord } from '../types/db'

const tags = [
  {
    key: 'person',
    labels: {en: 'person', de: 'Person', fr: 'personne', ja: '人物', pt: 'pessoa', ru: 'человек', es: 'persona', cn: '人物'},
    prompts: ['a person', 'people', 'human face', 'human body'],
  },
  {
    key: 'animal',
    labels: {en: 'animal', de: 'Tier', fr: 'animal', ja: '動物', pt: 'animal', ru: 'животное', es: 'animal', cn: '动物'},
    prompts: ['animal', 'wild animal', 'pet animal'],
  },
  {
    key: 'dog',
    labels: {en: 'dog', de: 'Hund', fr: 'chien', ja: '犬', pt: 'cão', ru: 'собака', es: 'perro', cn: '狗'},
    prompts: ['dog', 'pet dog'],
  },
  {
    key: 'cat',
    labels: {en: 'cat', de: 'Katze', fr: 'chat', ja: '猫', pt: 'gato', ru: 'кот', es: 'gato', cn: '猫'},
    prompts: ['cat', 'pet cat'],
  },
  {
    key: 'bird',
    labels: {en: 'bird', de: 'Vogel', fr: 'oiseau', ja: '鳥', pt: 'pássaro', ru: 'птица', es: 'pájaro', cn: '鸟'},
    prompts: ['bird', 'flying bird'],
  },
  {
    key: 'horse',
    labels: {en: 'horse', de: 'Pferd', fr: 'cheval', ja: '馬', pt: 'cavalo', ru: 'лошадь', es: 'caballo', cn: '马'},
    prompts: ['horse'],
  },
  {
    key: 'car',
    labels: {en: 'car', de: 'Auto', fr: 'voiture', ja: '車', pt: 'carro', ru: 'машина', es: 'coche', cn: '汽车'},
    prompts: ['car', 'automobile'],
  },
  {
    key: 'bicycle',
    labels: {en: 'bicycle', de: 'Fahrrad', fr: 'vélo', ja: '自転車', pt: 'bicicleta', ru: 'велосипед', es: 'bicicleta', cn: '自行车'},
    prompts: ['bicycle', 'bike'],
  },
  {
    key: 'motorcycle',
    labels: {en: 'motorcycle', de: 'Motorrad', fr: 'moto', ja: 'バイク', pt: 'motocicleta', ru: 'мотоцикл', es: 'motocicleta', cn: '摩托车'},
    prompts: ['motorcycle', 'motorbike'],
  },
  {
    key: 'train',
    labels: {en: 'train', de: 'Zug', fr: 'train', ja: '電車', pt: 'trem', ru: 'поезд', es: 'tren', cn: '火车'},
    prompts: ['train', 'railway train'],
  },
  {
    key: 'airplane',
    labels: {en: 'airplane', de: 'Flugzeug', fr: 'avion', ja: '飛行機', pt: 'avião', ru: 'самолёт', es: 'avión', cn: '飞机'},
    prompts: ['airplane', 'aircraft'],
  },
  {
    key: 'boat',
    labels: {en: 'boat', de: 'Boot', fr: 'bateau', ja: '船', pt: 'barco', ru: 'лодка', es: 'barco', cn: '船'},
    prompts: ['boat', 'ship'],
  },
  {
    key: 'nature',
    labels: {en: 'nature', de: 'Natur', fr: 'nature', ja: '自然', pt: 'natureza', ru: 'природа', es: 'naturaleza', cn: '自然'},
    prompts: ['nature', 'natural landscape', 'outdoors'],
  },
  {
    key: 'forest',
    labels: {en: 'forest', de: 'Wald', fr: 'forêt', ja: '森', pt: 'floresta', ru: 'лес', es: 'bosque', cn: '森林'},
    prompts: ['forest', 'woods', 'trees'],
  },
  {
    key: 'tree',
    labels: {en: 'tree', de: 'Baum', fr: 'arbre', ja: '木', pt: 'árvore', ru: 'дерево', es: 'árbol', cn: '树'},
    prompts: ['tree', 'trees'],
  },
  {
    key: 'flower',
    labels: {en: 'flower', de: 'Blume', fr: 'fleur', ja: '花', pt: 'flor', ru: 'цветок', es: 'flor', cn: '花'},
    prompts: ['flower', 'flowers'],
  },
  {
    key: 'mountain',
    labels: {en: 'mountain', de: 'Berg', fr: 'montagne', ja: '山', pt: 'montanha', ru: 'гора', es: 'montaña', cn: '山'},
    prompts: ['mountain', 'mountains'],
  },
  {
    key: 'waterfall',
    labels: {en: 'waterfall', de: 'Wasserfall', fr: 'cascade', ja: '滝', pt: 'cachoeira', ru: 'водопад', es: 'cascada', cn: '瀑布'},
    prompts: ['waterfall'],
  },
  {
    key: 'ocean',
    labels: {en: 'ocean', de: 'Ozean', fr: 'océan', ja: '海', pt: 'oceano', ru: 'океан', es: 'océano', cn: '海洋'},
    prompts: ['ocean', 'sea', 'waves'],
  },
  {
    key: 'beach',
    labels: {en: 'beach', de: 'Strand', fr: 'plage', ja: 'ビーチ', pt: 'praia', ru: 'пляж', es: 'playa', cn: '海滩'},
    prompts: ['beach', 'sand beach'],
  },
  {
    key: 'river',
    labels: {en: 'river', de: 'Fluss', fr: 'rivière', ja: '川', pt: 'rio', ru: 'река', es: 'río', cn: '河流'},
    prompts: ['river', 'stream'],
  },
  {
    key: 'snow',
    labels: {en: 'snow', de: 'Schnee', fr: 'neige', ja: '雪', pt: 'neve', ru: 'снег', es: 'nieve', cn: '雪'},
    prompts: ['snow', 'snowy scene'],
  },
  {
    key: 'city',
    labels: {en: 'city', de: 'Stadt', fr: 'ville', ja: '街', pt: 'cidade', ru: 'город', es: 'ciudad', cn: '城市'},
    prompts: ['city', 'urban scene', 'city street'],
  },
  {
    key: 'street',
    labels: {en: 'street', de: 'Straße', fr: 'rue', ja: '通り', pt: 'rua', ru: 'улица', es: 'calle', cn: '街道'},
    prompts: ['street', 'road'],
  },
  {
    key: 'building',
    labels: {en: 'building', de: 'Gebäude', fr: 'bâtiment', ja: '建物', pt: 'prédio', ru: 'здание', es: 'edificio', cn: '建筑'},
    prompts: ['building', 'architecture'],
  },
  {
    key: 'office',
    labels: {en: 'office', de: 'Büro', fr: 'bureau', ja: 'オフィス', pt: 'escritório', ru: 'офис', es: 'oficina', cn: '办公室'},
    prompts: ['office', 'workplace'],
  },
  {
    key: 'home',
    labels: {en: 'home', de: 'Zuhause', fr: 'maison', ja: '家', pt: 'casa', ru: 'дом', es: 'casa', cn: '家'},
    prompts: ['home interior', 'house interior'],
  },
  {
    key: 'kitchen',
    labels: {en: 'kitchen', de: 'Küche', fr: 'cuisine', ja: 'キッチン', pt: 'cozinha', ru: 'кухня', es: 'cocina', cn: '厨房'},
    prompts: ['kitchen'],
  },
  {
    key: 'food',
    labels: {en: 'food', de: 'Essen', fr: 'nourriture', ja: '食べ物', pt: 'comida', ru: 'еда', es: 'comida', cn: '食物'},
    prompts: ['food', 'meal'],
  },
  {
    key: 'coffee',
    labels: {en: 'coffee', de: 'Kaffee', fr: 'café', ja: 'コーヒー', pt: 'café', ru: 'кофе', es: 'café', cn: '咖啡'},
    prompts: ['coffee', 'cup of coffee'],
  },
  {
    key: 'drink',
    labels: {en: 'drink', de: 'Getränk', fr: 'boisson', ja: '飲み物', pt: 'bebida', ru: 'напиток', es: 'bebida', cn: '饮料'},
    prompts: ['drink', 'beverage'],
  },
  {
    key: 'computer',
    labels: {en: 'computer', de: 'Computer', fr: 'ordinateur', ja: 'パソコン', pt: 'computador', ru: 'компьютер', es: 'ordenador', cn: '电脑'},
    prompts: ['computer', 'desktop computer'],
  },
  {
    key: 'laptop',
    labels: {en: 'laptop', de: 'Laptop', fr: 'ordinateur portable', ja: 'ノートPC', pt: 'notebook', ru: 'ноутбук', es: 'portátil', cn: '笔记本电脑'},
    prompts: ['laptop', 'notebook computer'],
  },
  {
    key: 'phone',
    labels: {en: 'phone', de: 'Telefon', fr: 'téléphone', ja: 'スマホ', pt: 'telefone', ru: 'телефон', es: 'teléfono', cn: '手机'},
    prompts: ['phone', 'smartphone'],
  },
  {
    key: 'screen',
    labels: {en: 'screen', de: 'Bildschirm', fr: 'écran', ja: '画面', pt: 'tela', ru: 'экран', es: 'pantalla', cn: '屏幕'},
    prompts: ['screen', 'monitor display'],
  },
  {
    key: 'sport',
    labels: {en: 'sport', de: 'Sport', fr: 'sport', ja: 'スポーツ', pt: 'esporte', ru: 'спорт', es: 'deporte', cn: '运动'},
    prompts: ['sport', 'sports activity'],
  },
  {
    key: 'running',
    labels: {en: 'running', de: 'Laufen', fr: 'course', ja: 'ランニング', pt: 'corrida', ru: 'бег', es: 'correr', cn: '跑步'},
    prompts: ['running', 'person running'],
  },
  {
    key: 'yoga',
    labels: {en: 'yoga', de: 'Yoga', fr: 'yoga', ja: 'ヨガ', pt: 'ioga', ru: 'йога', es: 'yoga', cn: '瑜伽'},
    prompts: ['yoga', 'person doing yoga'],
  },
  {
    key: 'dance',
    labels: {en: 'dance', de: 'Tanz', fr: 'danse', ja: 'ダンス', pt: 'dança', ru: 'танец', es: 'baile', cn: '舞蹈'},
    prompts: ['dance', 'dancing'],
  },
  {
    key: 'music',
    labels: {en: 'music', de: 'Musik', fr: 'musique', ja: '音楽', pt: 'música', ru: 'музыка', es: 'música', cn: '音乐'},
    prompts: ['music', 'musical instrument', 'concert'],
  },
  {
    key: 'book',
    labels: {en: 'book', de: 'Buch', fr: 'livre', ja: '本', pt: 'livro', ru: 'книга', es: 'libro', cn: '书'},
    prompts: ['book', 'books'],
  },
  {
    key: 'art',
    labels: {en: 'art', de: 'Kunst', fr: 'art', ja: 'アート', pt: 'arte', ru: 'искусство', es: 'arte', cn: '艺术'},
    prompts: ['art', 'painting', 'artwork'],
  },
  {
    key: 'night',
    labels: {en: 'night', de: 'Nacht', fr: 'nuit', ja: '夜', pt: 'noite', ru: 'ночь', es: 'noche', cn: '夜晚'},
    prompts: ['night', 'night scene'],
  },
  {
    key: 'sunset',
    labels: {en: 'sunset', de: 'Sonnenuntergang', fr: 'coucher de soleil', ja: '夕日', pt: 'pôr do sol', ru: 'закат', es: 'atardecer', cn: '日落'},
    prompts: ['sunset'],
  },
  {
    key: 'morning',
    labels: {en: 'morning', de: 'Morgen', fr: 'matin', ja: '朝', pt: 'manhã', ru: 'утро', es: 'mañana', cn: '早晨'},
    prompts: ['morning', 'morning light'],
  },
  {
    key: 'rain',
    labels: {en: 'rain', de: 'Regen', fr: 'pluie', ja: '雨', pt: 'chuva', ru: 'дождь', es: 'lluvia', cn: '雨'},
    prompts: ['rain', 'rainy scene'],
  },
  {
    key: 'fire',
    labels: {en: 'fire', de: 'Feuer', fr: 'feu', ja: '火', pt: 'fogo', ru: 'огонь', es: 'fuego', cn: '火'},
    prompts: ['fire', 'flames'],
  },
  {
    key: 'smoke',
    labels: {en: 'smoke', de: 'Rauch', fr: 'fumée', ja: '煙', pt: 'fumaça', ru: 'дым', es: 'humo', cn: '烟'},
    prompts: ['smoke'],
  },
  {
    key: 'weapon',
    labels: {en: 'weapon', de: 'Waffe', fr: 'arme', ja: '武器', pt: 'arma', ru: 'оружие', es: 'arma', cn: '武器'},
    prompts: ['weapon', 'gun', 'knife'],
  },
  {
    key: 'blood',
    labels: {en: 'blood', de: 'Blut', fr: 'sang', ja: '血', pt: 'sangue', ru: 'кровь', es: 'sangre', cn: '血'},
    prompts: ['blood'],
  },
  {
    key: 'nudity',
    labels: {en: 'nudity', de: 'Nacktheit', fr: 'nudité', ja: '裸体', pt: 'nudez', ru: 'нагота', es: 'desnudez', cn: '裸体'},
    prompts: ['nudity', 'nude body'],
  },
  {
    key: 'underwear',
    labels: {en: 'underwear', de: 'Unterwäsche', fr: 'sous-vêtements', ja: '下着', pt: 'roupa íntima', ru: 'нижнее бельё', es: 'ropa interior', cn: '内衣'},
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
