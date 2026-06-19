#!/usr/bin/env python3
"""Create a demo video from screenshots with transitions and text overlays."""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio.v3 as iio

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(BASE_DIR, "screenshots")
OUTPUT_PATH = os.path.join(SCREENSHOTS_DIR, "demo_video.mp4")

# Video settings
FPS = 30
WIDTH = 1920
HEIGHT = 1080
BG_COLOR = (14, 14, 16)  # Dark background matching the theme

# Slide definitions: (image_file, title, subtitle, duration_seconds)
SLIDES = [
    (None, "Hermes Agent", "Your AI agent, inside your editor.", 6),
    ("chat_welcome.png", "Chat Tab", "Talk to Hermes Agent directly from the sidebar", 8),
    ("chat_conversation.png", "Streaming Responses", "Real-time AI responses with session persistence", 8),
    ("terminal.png", "CLI Integration", "Run hermes commands with live output streaming", 8),
    ("files.png", "File Navigation", "Browse and search your project files", 8),
    ("kanban.png", "Kanban Board", "Manage tasks with status grouping and auto-refresh", 8),
    ("settings.png", "Settings", "Configure API endpoint, model, and preferences", 8),
    ("demo_board.png", "Full Dashboard", "Everything you need, in one sidebar", 8),
    (None, "Install Now", "Available for Cursor & VS Code", 6),
]

FADE_DURATION = 0.8  # seconds for fade transition


def get_font(size, bold=False):
    """Try to get a good font, fall back to default."""
    font_paths = [
        "/System/Library/Fonts/SF-Pro-Display-Bold.otf" if bold else "/System/Library/Fonts/SF-Pro-Display-Regular.otf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    return ImageFont.load_default()


def create_title_slide(title, subtitle):
    """Create a title/CTA slide with centered text."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Logo/icon area
    logo_path = os.path.join(BASE_DIR, "assets", "logo-256.png")
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA")
        logo_size = 128
        logo = logo.resize((logo_size, logo_size), Image.LANCZOS)
        logo_x = (WIDTH - logo_size) // 2
        logo_y = HEIGHT // 2 - 140
        img.paste(logo, (logo_x, logo_y), logo)

    # Title
    font_title = get_font(56, bold=True)
    bbox = draw.textbbox((0, 0), title, font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((WIDTH - tw) // 2, HEIGHT // 2 + 20), title, fill=(205, 214, 244), font=font_title)

    # Subtitle
    font_sub = get_font(28)
    bbox = draw.textbbox((0, 0), subtitle, font=font_sub)
    sw = bbox[2] - bbox[0]
    draw.text(((WIDTH - sw) // 2, HEIGHT // 2 + 90), subtitle, fill=(166, 173, 200), font=font_sub)

    return np.array(img)


def create_feature_slide(image_path, title, subtitle):
    """Create a slide with screenshot + text overlay."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)

    # Load and scale screenshot
    screenshot = Image.open(image_path).convert("RGB")
    # Scale to fit in the right portion, leaving room for text on the left
    max_h = HEIGHT - 80
    max_w = WIDTH * 0.45

    ratio = min(max_w / screenshot.width, max_h / screenshot.height)
    new_w = int(screenshot.width * ratio)
    new_h = int(screenshot.height * ratio)
    screenshot = screenshot.resize((new_w, new_h), Image.LANCZOS)

    # Add rounded border effect
    border = Image.new("RGB", (new_w + 4, new_h + 4), (69, 71, 90))
    sx = WIDTH - new_w - 80
    sy = (HEIGHT - new_h) // 2
    img.paste(border, (sx - 2, sy - 2))
    img.paste(screenshot, (sx, sy))

    # Text on the left side
    draw = ImageDraw.Draw(img)
    text_x = 80
    text_y = HEIGHT // 2 - 60

    # Title
    font_title = get_font(44, bold=True)
    draw.text((text_x, text_y), title, fill=(137, 180, 250), font=font_title)

    # Subtitle
    font_sub = get_font(22)
    # Word wrap subtitle
    words = subtitle.split()
    lines = []
    current_line = ""
    for word in words:
        test = current_line + " " + word if current_line else word
        bbox = draw.textbbox((0, 0), test, font=font_sub)
        if bbox[2] - bbox[0] > WIDTH * 0.4:
            lines.append(current_line)
            current_line = word
        else:
            current_line = test
    if current_line:
        lines.append(current_line)

    for i, line in enumerate(lines):
        draw.text((text_x, text_y + 70 + i * 32), line, fill=(166, 173, 200), font=font_sub)

    # Accent line
    draw.rectangle([(text_x, text_y - 20), (text_x + 60, text_y - 16)], fill=(137, 180, 250))

    return np.array(img)


def crossfade(frame_a, frame_b, alpha):
    """Blend two frames with alpha (0=frame_a, 1=frame_b)."""
    return (frame_a * (1 - alpha) + frame_b * alpha).astype(np.uint8)


def main():
    print("Generating demo video frames...")
    frames = []
    fade_frames = int(FADE_DURATION * FPS)

    # Pre-render all slides
    slide_frames = []
    for i, (img_file, title, subtitle, duration) in enumerate(SLIDES):
        print(f"  Rendering slide {i+1}/{len(SLIDES)}: {title}")
        if img_file is None:
            slide_img = create_title_slide(title, subtitle)
        else:
            path = os.path.join(SCREENSHOTS_DIR, img_file)
            if not os.path.exists(path):
                print(f"    WARNING: {img_file} not found, skipping")
                continue
            slide_img = create_feature_slide(path, title, subtitle)
        hold_frames = int(duration * FPS) - fade_frames
        slide_frames.append((slide_img, max(hold_frames, FPS)))

    # Build video with crossfade transitions
    total_slides = len(slide_frames)
    for idx, (slide_img, hold_frames) in enumerate(slide_frames):
        # Hold the slide
        for _ in range(hold_frames):
            frames.append(slide_img)

        # Crossfade to next slide
        if idx < total_slides - 1:
            next_img = slide_frames[idx + 1][0]
            for f in range(fade_frames):
                alpha = f / fade_frames
                frames.append(crossfade(slide_img, next_img, alpha))

    print(f"Total frames: {len(frames)} ({len(frames)/FPS:.1f}s at {FPS}fps)")
    print(f"Writing MP4 to {OUTPUT_PATH}...")

    # Write MP4 using imageio-ffmpeg backend
    writer = iio.imopen(OUTPUT_PATH, "w", plugin="FFMPEG")
    writer.write(frames, fps=FPS, codec="libx264", quality=8, pixelformat="yuv420p")
    writer.close()

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"Done! Video: {OUTPUT_PATH} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
