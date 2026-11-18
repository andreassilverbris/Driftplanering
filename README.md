# Driftplanering

Interaktivt utbildningsverktyg för att förstå driftplanering av tillsyn och skötsel:
byggnad → installationer → åtgärder → ronder → rutintillfällen.

## Kom igång

Öppna `index.html` i en webbläsare. Ingen server och ingen installation behövs, och allt ligger lokalt.

- `index.html`: 3D-modell av typbyggnaden Hangar (etapp 1)
- `flerbyggnad.html`: skiss på planering för flera byggnader med provisoriska flyttar

## Struktur

| Sökväg | Innehåll |
|---|---|
| `data/hangar.js` | Plan, rum, installationer, ronder och åtgärdskatalog (bruttolista) |
| `app/viewer.js` | 3D-vyn (three.js): bygger modellen, navigering, lager, val och blinkning |
| `app/ui.js` | Sidopanel, verktygsfält och informationskort |
| `app/style.css` | Gemensam stil |
| `vendor/` | three.js r147 och OrbitControls (MIT-licens) |
| `docs/koncept-och-beslut.md` | Begrepp, beslut, förslag och etapper |

All data är påhittad.
