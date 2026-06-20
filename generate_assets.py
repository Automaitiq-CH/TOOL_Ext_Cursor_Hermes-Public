#!/usr/bin/env python3
"""Generate Hermes extension logo assets with no third-party dependencies."""
import os
import struct
import zlib

workspace = os.path.dirname(os.path.abspath(__file__))
assets_dir = os.path.join(workspace, 'assets')
os.makedirs(assets_dir, exist_ok=True)

INDIGO_LIGHT = (165, 180, 252)
INDIGO = (99, 102, 241)
INDIGO_DARK = (79, 70, 229)
BG_TOP = (30, 30, 46)
BG_BOTTOM = (16, 16, 34)
TEXT = (241, 245, 249)
MONO_LIGHT = (226, 232, 240)
MONO = (148, 163, 184)
MONO_DARK = (71, 85, 105)


def blend(px, width, x, y, color, alpha=255):
    if x < 0 or y < 0 or x >= width:
        return
    idx = (y * width + x) * 4
    if idx < 0 or idx + 3 >= len(px):
        return
    src_a = alpha / 255
    dst_a = px[idx + 3] / 255
    out_a = src_a + dst_a * (1 - src_a)
    if out_a <= 0:
        return
    for i in range(3):
        px[idx + i] = int((color[i] * src_a + px[idx + i] * dst_a * (1 - src_a)) / out_a)
    px[idx + 3] = int(out_a * 255)


def fill_rect(px, width, x0, y0, x1, y1, color, alpha=255):
    for y in range(max(0, y0), min(width, y1)):
        for x in range(max(0, x0), min(width, x1)):
            blend(px, width, x, y, color, alpha)


def fill_circle(px, width, cx, cy, r, color, alpha=255):
    r2 = r * r
    for y in range(max(0, cy - r), min(width, cy + r + 1)):
        dy = y - cy
        dx_max = int((r2 - dy * dy) ** 0.5)
        for x in range(max(0, cx - dx_max), min(width, cx + dx_max + 1)):
            blend(px, width, x, y, color, alpha)


def fill_polygon(px, width, points, color, alpha=255):
    if not points:
        return
    min_y = max(0, min(y for _, y in points))
    max_y = min(width - 1, max(y for _, y in points))
    n = len(points)
    for y in range(min_y, max_y + 1):
        intersections = []
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            if y1 == y2:
                continue
            if (y >= min(y1, y2)) and (y < max(y1, y2)):
                x = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                intersections.append(int(x))
        intersections.sort()
        for i in range(0, len(intersections) - 1, 2):
            x_start = max(0, intersections[i])
            x_end = min(width - 1, intersections[i + 1])
            for x in range(x_start, x_end + 1):
                blend(px, width, x, y, color, alpha)


def draw_h(px, width, cx, cy, scale, color):
    # Geometric H, chosen so the icon is not dependent on system fonts.
    h = int(37 * scale)
    w = int(29 * scale)
    stroke = max(2, int(7 * scale))
    x0 = cx - w // 2
    y0 = cy - h // 2
    fill_rect(px, width, x0, y0, x0 + stroke, y0 + h, color)
    fill_rect(px, width, x0 + w - stroke, y0, x0 + w, y0 + h, color)
    fill_rect(px, width, x0, cy - stroke // 2, x0 + w, cy + stroke // 2 + 1, color)


def downsample(px, src_size, dst_size, factor):
    out = bytearray(dst_size * dst_size * 4)
    for y in range(dst_size):
        for x in range(dst_size):
            sums = [0, 0, 0, 0]
            for yy in range(factor):
                for xx in range(factor):
                    idx = ((y * factor + yy) * src_size + (x * factor + xx)) * 4
                    for c in range(4):
                        sums[c] += px[idx + c]
            dst = (y * dst_size + x) * 4
            count = factor * factor
            for c in range(4):
                out[dst + c] = sums[c] // count
    return out


def draw_logo(size, mono=False, transparent=False):
    factor = 4
    w = size * factor
    px = bytearray(w * w * 4)

    if not transparent:
        for y in range(w):
            t = y / max(w - 1, 1)
            bg = tuple(int(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3))
            for x in range(w):
                idx = (y * w + x) * 4
                px[idx:idx + 4] = bytes((*bg, 255))

    s = w / 256
    cx = cy = w // 2
    wing_a = MONO_LIGHT if mono else INDIGO_LIGHT
    wing_b = MONO if mono else INDIGO
    core = MONO_DARK if mono else INDIGO
    core_hi = MONO_LIGHT if mono else INDIGO_LIGHT

    def p(points):
        return [(int(x * s), int(y * s)) for x, y in points]

    if not mono and not transparent:
        for r, alpha in ((66, 18), (50, 24), (38, 30)):
            fill_circle(px, w, cx, cy - int(8 * s), int(r * s), INDIGO_DARK, alpha)

    layers = [
        ([(118, 118), (78, 70), (18, 28), (36, 70), (70, 104), (112, 132)], wing_a, 235),
        ([(114, 128), (72, 94), (16, 64), (36, 92), (76, 122), (112, 140)], wing_b, 210),
        ([(110, 138), (72, 118), (28, 96), (48, 122), (80, 144), (112, 148)], wing_b, 150),
        ([(138, 118), (178, 70), (238, 28), (220, 70), (186, 104), (144, 132)], wing_a, 235),
        ([(142, 128), (184, 94), (240, 64), (220, 92), (180, 122), (144, 140)], wing_b, 210),
        ([(146, 138), (184, 118), (228, 96), (208, 122), (176, 144), (144, 148)], wing_b, 150),
    ]
    for points, color, alpha in layers:
        fill_polygon(px, w, p(points), color, alpha)

    core_y = cy - int(8 * s)
    fill_circle(px, w, cx, core_y, int(35 * s), core, 255)
    fill_circle(px, w, cx, core_y, int(28 * s), core_hi if not mono else MONO, 42)
    draw_h(px, w, cx, core_y + int(1 * s), s, TEXT)

    if size >= 24:
        dot_y = cy + int(50 * s)
        for offset, radius, alpha in ((-12, 3.5, 220), (0, 4, 255), (12, 3.5, 220)):
            fill_circle(px, w, cx + int(offset * s), dot_y, max(1, int(radius * s)), core_hi, alpha)

    return downsample(px, w, size, factor)


def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def save_png(name, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    data = (
        b'\x89PNG\r\n\x1a\n' +
        png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
        png_chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
        png_chunk(b'IEND', b'')
    )
    with open(os.path.join(assets_dir, name), 'wb') as f:
        f.write(data)
    print(f'{name} {width}x{height} done')


for filename, size in (
    ('logo.png', 256),
    ('logo-128.png', 128),
    ('logo-256.png', 256),
    ('logo-512.png', 512),
    ('icon.png', 128),
):
    save_png(filename, size, size, draw_logo(size))

save_png('logo-mono.png', 256, 256, draw_logo(256, mono=True))
save_png('activitybar-icon.png', 24, 24, draw_logo(24, mono=True, transparent=True))
save_png('tab-icon.png', 48, 48, draw_logo(48))

print('All assets generated!')
