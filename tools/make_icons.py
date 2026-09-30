"""Draws the Liftbook app icons (a loaded barbell on plate blue) as PNGs with no dependencies.

Run from the project root:  python3 tools/make_icons.py
"""
import struct
import zlib

BLUE = (27, 79, 214)
WHITE = (244, 246, 248)
RED = (210, 38, 58)
YELLOW = (233, 185, 12)


def draw(size):
    px = [[BLUE] * size for _ in range(size)]

    def rect(x0, y0, x1, y1, color):
        # coordinates are fractions of the icon size
        for y in range(int(y0 * size), int(y1 * size)):
            for x in range(int(x0 * size), int(x1 * size)):
                px[y][x] = color

    rect(0.12, 0.47, 0.88, 0.53, WHITE)          # shaft
    # plates, outer to inner, mirrored on both sides
    for x0, x1, h, color in [(0.20, 0.27, 0.40, RED), (0.27, 0.32, 0.30, YELLOW), (0.32, 0.35, 0.18, WHITE)]:
        rect(x0, 0.5 - h / 2, x1, 0.5 + h / 2, color)
        rect(1 - x1, 0.5 - h / 2, 1 - x0, 0.5 + h / 2, color)
    return px


def write_png(path, px):
    h, w = len(px), len(px[0])
    raw = b''.join(b'\x00' + bytes(c for p in row for c in p) for row in px)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    write_png(f'icons/{name}', draw(size))
    print('wrote icons/' + name)
