"""Render the project's code-native shield mark into launcher assets. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parent.parent
BG = '#f6f3ee'
RED = '#e76b62'

def mark(size, background=True, inset=.18):
    scale = 4
    n = size * scale
    im = Image.new('RGBA', (n, n), BG if background else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # All points are derived from the original SVG mark, no external imagery.
    factor = (1 - 2 * inset) / .64
    def p(x, y):
        return ((.5 + (x / 512 - .5) * factor) * n, (.5 + (y / 512 - .5) * factor) * n)
    pts = [(256, 90), (389, 141), (389, 246)]
    def curve(a, b, c, e):
        for i in range(1, 33):
            t = i / 32
            pts.append(tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*e[k] for k in (0, 1)))
    curve((389,246),(389,327),(328,386),(256,425))
    curve((256,425),(184,386),(123,327),(123,246))
    pts.append((123, 141))
    d.polygon([p(x,y) for x,y in pts], fill=RED)
    points = [p(191,251),p(234,294),p(323,189)]
    width = round(n * 25 / 512 * factor)
    d.line(points, fill='#fff6ef', width=width, joint='curve')
    for x,y in points:
        r = width / 2
        d.ellipse((x-r,y-r,x+r,y+r), fill='#fff6ef')
    return im.resize((size,size), Image.Resampling.LANCZOS)

for size in (192,512): mark(size).convert('RGB').save(ROOT / 'icons' / f'icon-{size}.png')
res = ROOT / 'android/app/src/main/res'
for density, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    folder = res / f'mipmap-{density}'
    for name in ['ic_launcher.png', 'ic_launcher_round.png']:
        mark(size).save(folder / name)
    mark(round(size*108/48), background=False, inset=.30).save(folder / 'ic_launcher_foreground.png')
mark(1024).convert('RGB').save(ROOT / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
splashes = list(res.glob('drawable*/splash.png')) + list((ROOT / 'ios/App/App/Assets.xcassets/Splash.imageset').glob('*.png'))
for target in splashes:
    with Image.open(target) as previous:
        width, height = previous.size
    im = Image.new('RGB',(width,height), '#f6f7f9')
    size = max(64, round(min(width,height)*.22))
    shield = mark(size, background=False)
    im.paste(shield, ((width-size)//2, (height-size)//2), shield)
    im.save(target, optimize=True)
print('PeSafe icons and splash screens generated.')
