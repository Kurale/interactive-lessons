#!/bin/sh
# Деплой: коммит всех изменений и пуш в main (GitHub Pages обновится сам).
set -e
cd "$(dirname "$0")/.."
if [ -z "$(git status --porcelain)" ]; then
  echo "Нет изменений для деплоя."
  exit 0
fi
git add -A
git commit -m "${1:-Обновление уроков}"
git push origin main
echo "Запушено. GitHub Pages обновится через 1–2 минуты."
