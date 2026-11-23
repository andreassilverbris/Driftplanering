# Driftplanering

Interaktivt utbildningsverktyg för att förstå driftplanering av tillsyn och skötsel:
byggnad → installationer → åtgärder → ronder → rutintillfällen.

## Kom igång

Öppna `index.html` i en webbläsare. Ingen server och ingen installation behövs, och allt ligger lokalt.

- `index.html`: allt i ett – 3D-modeller av Garage, Kasern 1, Kasern 2 och Hangar, planeringsflödet i sex steg,
  åtgärdstexter, standardplanering, kopiering av planering och Balansering av alla byggnader (etapp 1–5)

## Struktur

| Sökväg | Innehåll |
|---|---|
| `data/hangar.js` | Hangaren samt grundkatalogen: installationstyper, ronder och åtgärder (bruttolista) |
| `data/katalog.js` | Fler installationstyper och åtgärder, byggnadstyper med standardplanering, generering av ej signifikanta installationer |
| `data/kasern.js` | Kasern 1 och Kasern 2 (samma ritning, små skillnader) |
| `data/garage.js` | Garaget – den enklaste byggnaden |
| `data/tidsschablon.js` | Tidsschablonen: tyngd per installationstyp, minuter per tyngd och dagsdelarnas gränser |
| `data/ordlista.js` | Ordlistan: begreppen i fyra grupper, som dialogrutan visar |
| `app/viewer.js` | 3D-vyn (three.js): bygger modellen, navigering, lager, val och blinkning |
| `app/ui.js` | Byggnadsträd, verktygsfält och informationskort |
| `app/planering.js` | Planeringens logik: tillstånd, frekvenser i veckor, rutintillfällen, planerad tid, förskjutningar, historik |
| `app/balansering.js` | Balanseringens uträkningar utan DOM: belastning per utförare och vecka, och valet av förskjutningar |
| `app/vyer.js` | Processlinjen Byggnad → Planering → Balansering, Balanseringens frågor och tidsaxel, ordlistan |
| `app/flode.js` | Frågeflödet i sex steg, bruttolistan och animeringar vid ändringar |
| `app/tidsaxel.js` | Planeringens tidsaxel med rutintillfällen och mediaspelaren (ångra/gör om) |
| `app/telefon.js` | Telefonvyer för rutintillfällen och högerklicksmeny |
| `app/dialog.js` | Dialogruta, jämförelse av åtgärdstexter och textredigerare |
| `app/texter.js` | Flöden för att ändra åtgärdstexter på tre nivåer, med konfliktfrågor |
| `app/flyg.js` | Animering av brickor som flyger till tidsaxel och modell |
| `app/style.css`, `app/planering.css` | Stil |
| `vendor/` | three.js r147 och OrbitControls (MIT-licens) |
| `docs/koncept-och-beslut.md` | Begrepp, beslut, förslag och etapper |
| `docs/ideer-och-resonemang.md` | Idéer: standardplanering, import från Excel/IFC, genererad 3D-modell och det som skissen för flera byggnader inte tog med |
| `verktyg/bygg-enfil.js` | Bygger den fristående filen `dist/driftplanering.html` |
| `verktyg/test/kor-tester.js` | Webbläsartester: `node verktyg/test/kor-tester.js` |
| `verktyg/test/ralph/` | Tester för Ralph-loopens skript (pytest) |
| `ralph/` | Ralph-loopen: tar biljetter obevakat, en per varv (se `ralph/DESIGN.md`) |
| `.claude/commands/biljett.md` | Arbetsordningen per biljett, som loopen och `/biljett <nr>` följer |
| `CLAUDE.md` | Instruktioner för Claude: arbetssätt, arkitektur och status – läses automatiskt i nya sessioner |

## Tester

- `npm test` kör webbläsartesterna (Playwright/Chromium). Engångsinstallation: `npm install` och
  `npx playwright install chromium`.
- `npm run test:ralph` kör Ralph-loopens egna tester, som prövar skripten i `ralph/`. De kräver pytest
  (`python3 -m pytest`) och ingår inte i `npm test`.
- `npm run bygg` bygger om den fristående filen `dist/driftplanering.html`.

## Ralph-loopen

Ralph-loopen tar `ready-for-agent`-biljetter inom ett spår obevakat, en biljett per varv. Ett pass startas i en
egen terminal, stående på en arbetsgren och aldrig på `main`:

```bash
caffeinate -is ./ralph/afk.sh 1 etapp-5
```

Första argumentet är antalet varv och det andra spåret, alltså etiketten som avgör vilka biljetter passet
får ta. Arbetsordningen per biljett står i `.claude/commands/biljett.md`, och resten – utfallen, notiserna
och körningsfilerna – i `ralph/DESIGN.md`.

All data är påhittad.
