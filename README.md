# Compound — site

**"Your next 365 days, in one scroll."** A single-page cinematic site for Compound,
the AI-native growth firm. The entire page is one year of compounding: the scrollbar
is the exponent, a hand-written WebGL particle field plays the market (strangers leak →
ignite → convert → book → compound into a revenue sun), and a playable replica of the
real WhatsApp funnel is docked at Day 60.

Zero dependencies. No frameworks, no three.js, no trackers. Four files.

## Run it

```
python -m http.server 5195 --directory .
```

…or any static host. A preview config named `compound` exists in `.claude/launch.json`.

## Before launch — replace the placeholders

Contact details live at the top of `main.js`:

| Constant | Currently | Replace with |
|---|---|---|
| `WHATSAPP_NUMBER` | `919999999999` | Real number, country code, no `+` |
| `WHATSAPP_TEXT` | generic opener | Whatever you want pre-filled |
| `EMAIL` | `hello@compound.in` | Real address (also shown as button label) |

Invented copy decisions to confirm or veto:

- **"One per market"** exclusivity (Terms §III, finale, tape) — keep only if you'll honor it.
- **"Atelier Dhara" / "Mira" / "Ananya"** — fictional stand-ins for the real Delhi client.
- **"died in 2026 … ten thousand retainers"** eulogy beat in THE LEAK chapter.
- Demo budget tiers (`₹8–15L / ₹15–30L / ₹30L+`) — match the client's real bands.

## Architecture

| File | Role |
|---|---|
| `index.html` | Nine `.ch` chapter sections with `data-days="a,b"`, `data-beh`, `data-tag`; HUD; boot; demo phone |
| `styles.css` | Tokens, sticky chapter pins, scrims, kinetic titles, HUD, chat UI |
| `engine.js` | WebGL1 particle engine: CPU flow-field sim, point sprites, glow shader. 8 behaviors keyed to chapters |
| `main.js` | One conductor loop: scroll → day (piecewise per-section mapping) → HUD + field. Plus boot, cursor, kinetic reveals, the demo state machine |

Mechanics worth knowing:

- **Day mapping** is piecewise per section, so "Day 30" in copy always coincides with
  the counter — edit `data-days` if you reorder chapters.
- **The conductor races rAF against a 60 ms setTimeout** — in-app webviews
  (Instagram/WhatsApp browsers) that throttle rAF still get a living page.
- The demo conversation lives in `runDemo()` in `main.js` — edit messages/chips there.
- `prefers-reduced-motion`: field freezes to a constellation, reveals are instant, boot skips.
- No WebGL → canvas hides, everything else works. No JS → full copy still reads.
