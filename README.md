# Интерактивные уроки (3–5 класс)

Статический сайт-каталог интерактивных уроков по математике. Каждый урок —
один самодостаточный HTML-файл (course-builder): анимации, задания с
подсказками, озвучка, звёзды за верные ответы с первой попытки. Прогресс
сохраняется на устройстве (localStorage).

Главная страница (`index.html`) — каталог с фильтрами по классам (3–5) и
темам, карточками с превью. Адаптирована для Telegram Web App: поддержка
темы, `openLink` для запуска уроков.

## Структура

```
index.html          — стартовая страница-каталог (LESSONS — список уроков)
lessons/*.html      — собранные уроки (один файл = один урок, офлайн-ready)
previews/*.jpg      — превью для карточек
previews/og-cover.png — обложка для Telegram/OG-шаринга
tools/build-previews.py — генерация превью из исходников уроков
tools/deploy.sh     — коммит + пуш (деплой GitHub Pages)
```

## Как добавить урок

1. Соберите урок в RedactorVideoInteractiv: `node lessons/<урок>/build-lesson.mjs`.
2. Скопируйте `build/<урок>.html` в `lessons/`.
3. Сгенерируйте превью: `python tools/build-previews.py` (или положите своё
   изображение 560px шириной в `previews/<slug>.jpg`).
4. Добавьте запись в массив `LESSONS` в `index.html` (slug, название,
   описание, классы, число слайдов).
5. `bash tools/deploy.sh "новый урок <название>"` — сайт обновится через
   минуту-две.

## Публикация в Telegram

Канал → кнопка Web App (`BotFather` → `/newapp` или Menu Button) → URL:
`https://kurale.github.io/interactive-lessons/`. Уроки открываются
поверх Telegram через `openLink` и работают в встроенном браузере.
