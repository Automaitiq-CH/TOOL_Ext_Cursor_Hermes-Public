#!/usr/bin/env python3
"""Generate Hermes extension logo assets using Pillow only."""
from PIL import Image, ImageDraw, ImageFont
import os

workspace = '/Users/mmserver/.hermes-automaitiq/kanban/boards/cursor-hermes-ext/workspaces/t_35bdc007'
assets_dir = os.path.join(workspace, 'assets')

INDIGO_LIGHT = (129, 140, 248)   # #818CF8
INDIGO = (99, 102, 241)          # #6366F1
INDIGO_DARK = (79, 70, 229)      # #4F46E5
BG = (30, 30, 46)                 # #1E1E2E
TEXT = (226, 232, 240)            # #E2E8F0

def draw_logo(size):
    """Draw the Hermes logo at the given size."""
    img = Image.new('RGBA', (size, size), (*BG, 255))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    scale = size / 256

    # Background circle
    r = int(124 * scale)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*BG, 255))

    # Wings - simplified feather shapes
    wing_alpha = 230
    for side in [-1, 1]:  # left, right
        # Main wing ellipse
        wing_cx = cx + side * int(55 * scale)
        wing_w = int(65 * scale)
        wing_h = int(30 * scale)
        if side == -1:
            # Left wing - tilted up-left
            points = [
                (cx - int(10 * scale), cy - int(10 * scale)),
                (cx - int(90 * scale), cy - int(70 * scale)),
                (cx - int(100 * scale), cy - int(50 * scale)),
                (cx - int(80 * scale), cy - int(30 * scale)),
                (cx - int(70 * scale), cy - int(10 * scale)),
                (cx - int(50 * scale), cy + int(5 * scale)),
            ]
            draw.polygon(points, fill=(*INDIGO_LIGHT, wing_alpha))

            points2 = [
                (cx - int(10 * scale), cy - int(5 * scale)),
                (cx - int(75 * scale), cy - int(50 * scale)),
                (cx - int(85 * scale), cy - int(35 * scale)),
                (cx - int(65 * scale), cy - int(10 * scale)),
                (cx - int(45 * scale), cy + int(10 * scale)),
            ]
            draw.polygon(points2, fill=(*INDIGO, wing_alpha))
        else:
            # Right wing - tilted up-right
            points = [
                (cx + int(10 * scale), cy - int(10 * scale)),
                (cx + int(90 * scale), cy - int(70 * scale)),
                (cx + int(100 * scale), cy - int(50 * scale)),
                (cx + int(80 * scale), cy - int(30 * scale)),
                (cx + int(70 * scale), cy - int(10 * scale)),
                (cx + int(50 * scale), cy + int(5 * scale)),
            ]
            draw.polygon(points, fill=(*INDIGO_LIGHT, wing_alpha))

            points2 = [
                (cx + int(10 * scale), cy - int(5 * scale)),
                (cx + int(75 * scale), cy - int(50 * scale)),
                (cx + int(85 * scale), cy - int(35 * scale)),
                (cx + int(65 * scale), cy - int(10 * scale)),
                (cx + int(45 * scale), cy + int(10 * scale)),
            ]
            draw.polygon(points2, fill=(*INDIGO, wing_alpha))

    # Core circle
    core_r = int(32 * scale)
    draw.ellipse([cx - core_r, (cy - int(10 * scale)) - core_r,
                  cx + core_r, (cy - int(10 * scale)) + core_r],
                 fill=(*INDIGO, 255))

    # Inner ring accent
    draw.ellipse([cx - core_r + int(3 * scale), (cy - int(10 * scale)) - core_r + int(3 * scale),
                  cx + core_r - int(3 * scale), (cy - int(10 * scale)) + core_r - int(3 * scale)],
                 outline=(*INDIGO_LIGHT, 180), width=int(2 * scale))

    # H letter (skip for very small sizes where font fails)
    if scale >= 0.3:
        font_size = max(1, int(40 * scale))
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except (OSError, IOError):
            try:
                font = ImageFont.truetype("/Library/Fonts/Arial.ttf", font_size)
            except (OSError, IOError):
                font = ImageFont.load_default()

        h_bbox = draw.textbbox((0, 0), "H", font=font)
        h_w = h_bbox[2] - h_bbox[0]
        h_h = h_bbox[3] - h_bbox[1]
        text_x = cx - h_w // 2
        text_y = cy - int(15 * scale) - h_h // 2
        draw.text((text_x, text_y), "H", fill=(*TEXT, 255), font=font)

    # Bottom accent dots (skip for tiny sizes)
    if scale >= 0.5:
        dot_y = cy + int(50 * scale)
        dot_r = max(1, int(4 * scale))
        draw.ellipse([cx - dot_r, dot_y - dot_r,
                      cx + dot_r, dot_y + dot_r], fill=(*INDIGO_LIGHT, 255))
        for offset in [-12, 12]:
            dot_r2 = max(1, int(3 * scale))
            draw.ellipse([cx + int(offset * scale) - dot_r2, dot_y - dot_r2,
                          cx + int(offset * scale) + dot_r2, dot_y + dot_r2],
                         fill=(*INDIGO_LIGHT, 160))

    return img

# Generate 256x256 logo
logo = draw_logo(256)
logo.save(os.path.join(assets_dir, 'logo.png'))
print('logo.png 256x256 done')

# Generate 512x512 marketplace icon
icon = draw_logo(512)
icon.save(os.path.join(assets_dir, 'icon.png'))
print('icon.png 512x512 done')

# Generate 48x48 activity bar icon
small = draw_logo(48)
small.save(os.path.join(assets_dir, 'activitybar-icon.png'))
print('activitybar-icon.png 48x48 done')

# Generate 16x16 tab icon
tiny = draw_logo(16)
tiny.save(os.path.join(assets_dir, 'tab-icon.png'))
print('tab-icon.png 16x16 done')

print('All assets generated!')