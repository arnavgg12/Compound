"""Generate og.png — the WhatsApp/social link card. Run once, commit the PNG."""
import io, math, re, urllib.request
from PIL import Image, ImageDraw, ImageFont

UA = {"User-Agent": "Mozilla/4.0"}  # old UA -> Google serves TTF, not woff2

def fetch_font(css_url):
    css = urllib.request.urlopen(urllib.request.Request(css_url, headers=UA)).read().decode()
    url = re.search(r"url\((https://[^)]+\.ttf)\)", css).group(1)
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

def F(font_bytes, size):
    return ImageFont.truetype(io.BytesIO(font_bytes), size)

fraunces = fetch_font("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@144,500")
fraunces_it = fetch_font("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,144,500")
plex = fetch_font("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400")

INK = (16, 14, 11)
BONE = (236, 230, 216)
BRASS = (220, 171, 96)
MUTE = (168, 157, 135)
GOLD = (255, 217, 160)

W, H = 1200, 630
img = Image.new("RGB", (W, H), INK)
d = ImageDraw.Draw(img, "RGBA")

# sunrise glow, top center — matches the site's finale
cx, cy = W // 2, -40
for r in range(520, 0, -4):
    a = int(34 * math.exp(-r / 200.0))
    if a <= 0:
        continue
    d.ellipse([cx - r, cy - r * 0.66, cx + r, cy + r * 0.66], fill=GOLD + (a,))
# scattered field dots
import random
random.seed(7)
for _ in range(420):
    x, y = random.uniform(0, W), random.uniform(0, H)
    dist = math.hypot(x - cx, y - cy)
    a = int(max(12, 110 * math.exp(-dist / 480.0)))
    s = random.uniform(0.7, 1.9)
    col = GOLD if random.random() < 0.35 else BONE
    d.ellipse([x - s, y - s, x + s, y + s], fill=col + (a,))

f_mark = F(fraunces, 40)
f_mark_sup = F(plex, 22)
f_h1 = F(fraunces, 78)
f_h1i = F(fraunces_it, 78)
f_eq = F(fraunces, 46)
f_eq_sup = F(plex, 24)
f_foot = F(plex, 22)

# wordmark
d.text((70, 56), "compound", font=f_mark, fill=BONE)
w = d.textlength("compound", font=f_mark)
d.text((70 + w + 4, 52), "n", font=f_mark_sup, fill=BRASS)

# headline
d.text((70, 236), "Most agencies show you a deck.", font=f_h1, fill=BONE)
d.text((70, 332), "We’d rather show you the year.", font=f_h1i, fill=BRASS)

# equation
y_eq = 472
d.text((70, y_eq), "1.01", font=f_eq, fill=BONE)
w1 = d.textlength("1.01", font=f_eq)
d.text((70 + w1 + 4, y_eq - 8), "365", font=f_eq_sup, fill=BRASS)
w2 = d.textlength("365", font=f_eq_sup)
d.text((70 + w1 + w2 + 18, y_eq), "= 37.78×", font=f_eq, fill=GOLD)

# footer line
d.text((70, 556), "an AI-native growth firm · New Delhi → everywhere", font=f_foot, fill=MUTE)

img.save("og.png", optimize=True)
print("og.png", img.size)
