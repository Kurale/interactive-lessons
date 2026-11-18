# Математика для малышей — Telegram Mini App

Вертикальный (9:16) видеоплеер с интерактивными quiz-вопросами для Telegram Mini App.
Чистые HTML/CSS/JS, без билд-стека. Открывается в Telegram как Web App; в обычном
браузере тоже работает (Telegram API отключается автоматически).

## Структура

```
index.html      — единственная страница (экран тем + экран плеера)
styles.css      — вёрстка 9:16, safe-area, тема из themeParams, анимации
content.js      — МАНИФЕСТ КОНТЕНТА (контракт ниже) — демо-данные
app.js          — Telegram SDK, плеер, quiz, прогресс
assets/         — демо-видео 540x960 (9:16) и постеры (для продакшена
                  заменяются видео 1080x1920 из Manim-пайплайна, имена topicNN.mp4)
make_demo_assets.sh — генератор демо-видео (ffmpeg)
```

Локальный запуск: `python3 -m http.server 8137` в этой папке → `http://127.0.0.1:8137/`
(HTTP обязателен: `file://` не даёт перемотку/Range для `<video>`).

⚠️ `python3 -m http.server` НЕ отдаёт HTTP Range (206): программная перемотка
(`video.currentTime = …`) на нём вызывает рестарт потока с нуля — это артефакт
сервера, не приложения. Для локальной отладки перемотки используйте
`npx http-server` или nginx; в проде хостинг обязан поддерживать 206 (см. ниже).

## Контракт манифеста контента (`content.js` → `window.CONTENT`)

```js
[
  {
    topicId:  "topic01",              // string, уникальный ключ (в прогрессе)
    title:    "Счёт до 10",           // string
    videoUrl: "assets/topic01.mp4",   // string, вертикальный mp4 (h264, yuv420p, 9:16)
    poster:   "assets/poster01.jpg",  // string?, опционально — превью в списке
    duration: 16,                     // number?, опционально, секунды
    checkpoints: [
      {
        t: 5,                         // number, секунда паузы
        question: "Сколько будет 3 + 2?",
        options: ["4", "5", "6", "7"],// 2–4 варианта (крупные кнопки)
        correctIndex: 1,              // индекс правильного в options
        hint: "Посчитай на пальцах…"  // подсказка после ответа
      }
    ]
  }
]
```

Манифест валидируется на старте (`validateContent` в app.js): обязательные поля,
2–4 варианта, корректный `correctIndex`, сортировка по `t`. Ошибки видны в баннере.
Опциональные поля добавлять можно, ломающих изменений избегать.

## Как это работает

- **Telegram SDK**: `telegram-web-app.js` подключён в `<head>`; при старте —
  `ready()`, `expand()`, `disableVerticalSwipes()`, `requestFullscreen()` (если
  поддерживается), `setHeaderColor('secondary_bg_color')`. Цвета темы берутся из
  CSS-переменных `--tg-theme-*`, которые SDK выставляет сам; есть fallback для браузера.
- **Viewport/safe-area**: высота — `viewportStableHeight` из события `viewportChanged`
  (fallback: `visualViewport`/`innerHeight`); отступы — `env(safe-area-inset-*)` плюс
  `contentSafeAreaInset` из Telegram, если отдаётся.
- **Плеер**: `<video>` c `object-fit: cover` на всю высоту 9:16-колонки. Контрольные
  точки ловятся в rAF-цикле + `timeupdate` (двойная страховка), с допуском 50 мс:
  видео ставится на паузу и открывается quiz-карточка снизу.
- **Quiz**: 2–4 кнопки ≥58 px высотой. После выбора: зелёный/красный ответ, вспышка-
  «гало» на весь экран, тряска/пульс, подсказка, `HapticFeedback`
  (`success`/`error`/`selectionChanged`). Кнопка «Продолжить ▶» возобновляет видео.
- **Прогресс**: звёзды = контрольные точки, отвеченные верно с первой попытки
  (лучший результат на тему сохраняется). Хранилище: `localStorage`
  (`tma_mathquiz_progress_v1`) + `CloudStorage` тем же ключом при доступности;
  при старте значения объединяются по максимуму.
- **BackButton**: в плеере включается кнопка «назад» Telegram; закрывает плеер.

## Публикация (для интеграции)

1. Хостинг: любой статический **HTTPS** (GitHub Pages, Netlify, nginx + LE).
   Требования сервера: `video/mp4` MIME, CORS не нужен при same-origin, HTTP Range
   обязателен (для перемотки; по умолчанию включён почти везде).
2. BotFather: `/newapp` → выбрать бота → указать URL, либо `/setmenubutton`.
3. Прогресс тем хранится у пользователя (localStorage/CloudStorage), сервер не нужен.

Замена контента: положить `topicNN.mp4` (1080x1920 из Manim) в `assets/`,
обновить `content.js` — больше ничего менять не нужно.
