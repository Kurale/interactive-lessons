#!/usr/bin/env python3
"""Генерирует превью-карточки (560px JPG) из титульных слайдов уроков
RedactorVideoInteractiv и og-cover для шаринга.

Запуск: python tools/build-previews.py
Пути по умолчанию соответствуют раскладке на машине автора; при другом
расположении передайте SRC первым аргументом.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC_DEFAULT = Path(r"C:\Users\User\Desktop\RedactorVideoInteractiv\lessons")
DST = Path(__file__).resolve().parent.parent / "previews"

LESSON_TITLES = {
    "tablitsa-ploshchadej.html": "previews/tablitsa-ploshchadej.jpg",
}


def make_previews(src: Path) -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for d in sorted(src.iterdir()):
        build = d / "build"
        if not d.is_dir() or not build.exists():
            continue
        for html in build.glob("*.html"):
            title = d / "content" / "images" / "01-title.png"
            if not title.exists():
                print(f"  нет 01-title.png для {html.name}, пропускаю")
                continue
            im = Image.open(title).convert("RGB")
            w = 560
            h = round(im.height * w / im.width)
            out = DST / (html.stem + ".jpg")
            im.resize((w, h), Image.LANCZOS).save(out, quality=85, optimize=True)
            print(f"  {out.name}  {out.stat().st_size // 1024} KB")


def make_cover() -> None:
    W, H = 1200, 630
    top, bot = (74, 144, 217), (31, 81, 143)
    cover = Image.new("RGB", (W, H))
    px = cover.load()
    for y in range(H):
        t = y / (H - 1)
        col = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = col
    d = ImageDraw.Draw(cover)
    fb = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 72)
    fs = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 40)
    fk = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 30)
    d.text((80, 180), "Интерактивные уроки", font=fb, fill=(255, 255, 255))
    d.text((80, 290), "Математика · 3–5 класс", font=fs, fill=(214, 232, 248))
    d.rounded_rectangle([80, 370, 640, 424], radius=12, outline=(255, 255, 255), width=3)
    d.text((100, 380), "Запускайте прямо в Telegram", font=fk, fill=(255, 255, 255))
    cover.save(DST / "og-cover.png", optimize=True)
    print("  og-cover.png обновлена")


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC_DEFAULT
    print(f"Превью из {src}:")
    make_previews(src)
    print("Обложка:")
    make_cover()
