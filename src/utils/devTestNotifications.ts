import { setNotification } from '@/services/notificationService'

/**
 * DEV only: `__testToasts()` in the browser console fires a set of toasts
 * with different heights (title only, long text, actions, progress, ...)
 * to check the layout of the close / hide buttons.
 */
export function fireTestNotifications(): void {
  const long = 'Очень длинный текст уведомления, который переносится на несколько строк и проверяет, что кнопки управления остаются на месте. '.repeat(3)
  const items = [
    {type: 'success', title: 'Merged 7 group(s)'},
    {type: 'info', title: 'Только заголовок', timeout: 0},
    {type: 'warning', title: 'Заголовок и короткий текст', text: 'Одна строка'},
    {type: 'error', title: 'Ошибка', text: 'Две строки текста.\nВторая строка', timeout: 0},
    {type: 'info', title: 'Длинный текст', text: long, timeout: 0},
    {
      type: 'success',
      title: 'С кнопками действий',
      text: 'Текст уведомления',
      timeout: 0,
      actions: [
        {text: 'Открыть', icon: 'open-in-new', close: true},
        {text: 'Скрыть', hide: true},
      ],
    },
    {type: 'info', title: 'Прогресс загрузки', text: 'Загрузка модели', timeout: 0, progressPercent: 42},
    {type: 'warning', title: 'Файл', text: 'Путь к файлу', filePath: '/Users/vit/Downloads/stream 22.mp4', timeout: 0},
  ] as const
  items.forEach((item, i) => {
    setTimeout(() => setNotification({...item} as never), i * 150)
  })
}
