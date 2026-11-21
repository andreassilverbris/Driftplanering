# Driftplanering

Interaktivt utbildningsverktyg för att förstå driftplanering av tillsyn och skötsel:
byggnad → installationer → åtgärder → ronder → rutintillfällen.

## Kom igång

Öppna `index.html` i en webbläsare. Ingen server och ingen installation behövs, och allt ligger lokalt.

- `index.html`: 3D-modeller av Garage, Kasern 1, Kasern 2 och Hangar, planeringsflödet, åtgärdstexter, standardplanering och kopiering av planering (etapp 1–4)
- `flerbyggnad.html`: skiss på planering för flera byggnader med provisoriska flyttar

## Struktur

| Sökväg | Innehåll |
|---|---|
| `data/hangar.js` | Hangaren samt grundkatalogen: installationstyper, ronder och åtgärder (bruttolista) |
| `data/katalog.js` | Fler installationstyper och åtgärder, byggnadstyper med standardplanering, generering av ej signifikanta installationer |
| `data/kasern.js` | Kasern 1 och Kasern 2 (samma ritning, små skillnader) |
| `data/garage.js` | Garaget – den enklaste byggnaden |
| `app/viewer.js` | 3D-vyn (three.js): bygger modellen, navigering, lager, val och blinkning |
| `app/ui.js` | Byggnadsträd, verktygsfält och informationskort |
| `app/planering.js` | Planeringens logik: tillstånd, frekvenser i veckor, rutintillfällen, historik |
| `app/flode.js` | Frågeflödet i fem steg, bruttolistan och animeringar vid ändringar |
| `app/tidsaxel.js` | Tidsaxeln med rutintillfällen och mediaspelaren (ångra/gör om) |
| `app/telefon.js` | Telefonvyer för rutintillfällen och högerklicksmeny |
| `app/dialog.js` | Dialogruta, jämförelse av åtgärdstexter och textredigerare |
| `app/texter.js` | Flöden för att ändra åtgärdstexter på tre nivåer, med konfliktfrågor |
| `app/flyg.js` | Animering av brickor som flyger till tidsaxel och modell |
| `app/style.css`, `app/planering.css` | Stil |
| `vendor/` | three.js r147 och OrbitControls (MIT-licens) |
| `docs/koncept-och-beslut.md` | Begrepp, beslut, förslag och etapper |
| `docs/ideer-och-resonemang.md` | Idéer: kopiera planering, standardplanering, import från Excel/IFC och genererad 3D-modell |
| `verktyg/bygg-enfil.js` | Bygger den fristående filen `dist/driftplanering.html` |
| `verktyg/test/kor-tester.js` | Webbläsartester: `node verktyg/test/kor-tester.js` |
| `CLAUDE.md` | Instruktioner för Claude: arbetssätt, arkitektur och status – läses automatiskt i nya sessioner |

All data är påhittad.
