#!/usr/bin/env python3
"""Optimize screenshots for web and create hero image."""

import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SD = os.path.join(BASE_DIR, "screenshots")

print("=== Current screenshots ===")
for f in sorted(os.listdir(SD)):
    if f.endswith(".png"):
        img = Image.open(os.path.join(SD, f))
        sz = os.path.getsize(os.path.join(SD, f)) / 1024
        print(f"  {f}: {img.size[0]}x{img.size[1]}, {sz:.0f}KB")

print()
print("=== Optimizing for web ===")
web_dir = os.path.join(SD, "web")
os.makedirs(web_dir, exist_ok=True)

for f in sorted(os.listdir(SD)):
    if not f.endswith(".png"):
        continue
    img = Image.open(os.path.join(SD, f)).convert("RGB")
    out_path = os.path.join(web_dir, f)
    img.save(out_path, "PNG", optimize=True)
    orig = os.path.getsize(os.path.join(SD, f)) / 1024
    new = os.path.getsize(out_path) / 1024
    print(f"  {f}: {orig:.0f}KB -> {new:.0f}KB ({100*new/orig:.0f}%)")

# Create hero image for OpenGraph/social sharing (1200x630)
print()
print("=== Creating hero image ===")
hero_src = os.path.join(SD, "demo_board.png")
if os.path.exists(hero_src):
    hero = Image.open(hero_src).convert("RGB")
    hero_ratio = max(1200 / hero.width, 630 / hero.height)
    hero = hero.resize(
        (int(hero.width * hero_ratio), int(hero.height * hero_ratio)),
        Image.LANCZOS,
    )
    left = (hero.width - 1200) // 2
    top = (hero.height - 630) // 2
    hero = hero.crop((left, top, left + 1200, top + 630))
    hero_path = os.path.join(SD, "hero_og.png")
    hero.save(hero_path, "PNG", optimize=True)
    print(f"  hero_og.png: {os.path.getsize(hero_path)/1024:.0f}KB (1200x630)")

print("Done!")
