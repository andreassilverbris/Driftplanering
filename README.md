# Driftplanering

Interaktivt utbildningsverktyg för att förstå driftplanering av tillsyn och skötsel:
byggnad → installationer → åtgärder → ronder → rutintillfällen.

## Kom igång

Öppna `index.html` i en webbläsare. Ingen server och ingen installation behövs, och allt ligger lokalt.

- `index.html`: 3D-modell av typbyggnaden Hangar och planeringsflödet (etapp 1–2)
- `flerbyggnad.html`: skiss på planering för flera byggnader med provisoriska flyttar

## Struktur

| Sökväg | Innehåll |
|---|---|
| `data/hangar.js` | Plan, rum, installationer, ronder och åtgärdskatalog (bruttolista) |
| `app/viewer.js` | 3D-vyn (three.js): bygger modellen, navigering, lager, val och blinkning |
| `app/ui.js` | Byggnadsträd, verktygsfält och informationskort |
| `app/planering.js` | Planeringens logik: tillstånd, frekvenser i veckor, rutintillfällen, historik |
| `app/flode.js` | Frågeflödet i fem steg, bruttolistan och animeringar vid ändringar |
| `app/tidsaxel.js` | Tidsaxeln med rutintillfällen och mediaspelaren (ångra/gör om) |
| `app/telefon.js` | Telefonvyer för rutintillfällen och högerklicksmeny |
| `app/flyg.js` | Animering av brickor som flyger till tidsaxel och modell |
| `app/style.css`, `app/planering.css` | Stil |
| `vendor/` | three.js r147 och OrbitControls (MIT-licens) |
| `docs/koncept-och-beslut.md` | Begrepp, beslut, förslag och etapper |

All data är påhittad.
