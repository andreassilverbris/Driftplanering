# Driftplanering – instruktioner för Claude

Interaktivt utbildningsverktyg (webbsida) där en driftplanerare lär sig planera tillsyn och skötsel:
byggnad → installationer → åtgärder → ronder → rutintillfällen. Byggt i en lång session med användaren;
den här filen och `docs/` innehåller allt som behövs för att fortsätta utan den konversationen.

**Läs först:** `GLOSSARY.md` (begrepp), `docs/koncept-och-beslut.md` (beslut, etapper, öppna frågor) och
`docs/ideer-och-resonemang.md` (idéer som inte är byggda än).

## Användaren och arbetssättet

- Skriv på **svenska**. Användaren är driftplanerare med djup domänkunskap, inte utvecklare.
  Förklara tekniska val kort och i klartext.
- **Pedagogiken är det viktigaste.** Varje funktion ska göra begreppen begripliga (vad, var, när, vem).
  Små och enkla byggnader ska vara lika lätta att förstå som stora.
- Användaren skriver ofta långa meddelanden med många idéer. Skriv ner idéer som inte byggs direkt i
  `docs/ideer-och-resonemang.md` och beslut i `docs/koncept-och-beslut.md` (numrerad lista).
- Gör rimliga antaganden och redovisa dem tydligt i svaret, i stället för att fråga om allt.
  Fråga bara om verkliga vägval.
- Användaren planerar att använda Matt Pococks skills för att skiva biljetter utifrån dokumentationen.
  De är installerade globalt på användarens Mac (`~/.agents/skills`, länkade från `~/.claude/skills`,
  uppdateras med `npx skills update -g`), inte i repot. `/setup-matt-pocock-skills` är körd,
  se avsnittet "Agent skills" längst ner.
  Om en session ändå körs i Claude Code i molnet finns varken skillsen eller kommandot `gh` där.
  Biljetter hanteras då med GitHubs MCP-verktyg (se `docs/agents/issue-tracker.md`).

## Utvecklingsmiljö

- **Utvecklingen sker lokalt på användarens Mac** i `~/Driftplanering`, med Claude Code i terminalen,
  och pushas till `andreassilverbris/Driftplanering` på GitHub (samma upplägg som användarens andra projekt).
- Engångsinstallation efter kloning: `npm install` och `npx playwright install chromium`.
- `npm test` kör webbläsartesterna, `npm run bygg` bygger den fristående filen.

## Gren, leverans och hur användaren tittar

- **`main` innehåller den senaste godkända versionen.** Arbete görs på en arbetsgren och förs in i `main`
  via pull request när användaren ber om det. Pusha aldrig direkt till `main`.
- **Användarens jobbdator blockerar claude.ai och github.io** (ERR_CONNECTION_RESET). Användaren tittar via
  `https://raw.githack.com/andreassilverbris/Driftplanering/main/index.html`
  (läser direkt från `main`, kräver att repot är publikt) eller via den fristående filen
  `dist/driftplanering.html`. Byt `main` mot arbetsgrenens namn i länken för att visa ändringar före sammanslagning.
- Användarens skärm är 1920×1200 i Edge. Huvudvyn ska få plats utan att sidan scrollar.
- Efter varje ändring, i den här ordningen:
  1. `npm test` (= `node verktyg/test/kor-tester.js`) – webbläsartester (Playwright/Chromium). Utöka testerna för ny funktionalitet.
  2. `npm run bygg` (= `node verktyg/bygg-enfil.js`) – bygger om `dist/driftplanering.html` (allt inbäddat i en fil).
  3. Committa och pusha. Uppdatera `docs/` och den här filen när något ändras.
- Ta gärna skärmdumpar med Playwright och titta på dem för att kontrollera utseendet.

## Teknik

- **Statisk webbsida utan server, byggsteg eller databas.** Öppnas direkt från disk (`file://`).
  Därför används vanliga `<script>`-taggar (inga ES-moduler, ingen `fetch` av lokala filer).
- three.js r147 med OrbitControls ligger i `vendor/` (klassiska globala skript, inte moduler).
- Kodstil: ES5 (`var`, `function`), svenska namn på variabler och funktioner, ett IIFE per fil som
  exporterar till namnrymden `window.DP`.
- All planering lever bara i minnet och nollställs vid omladdning (medvetet beslut).

## Arkitektur

Skriptens ordning i `index.html` spelar roll:

| Fil | Ansvar |
|---|---|
| `data/hangar.js` | Hangaren + grundkatalogen: `DP.installationstyper`, `DP.ronder`, `DP.atgarder` (bruttolistan) |
| `data/katalog.js` | Fler typer/åtgärder, `DP.byggnadstyper` (standardplanering), `DP.genereraOvriga()` |
| `data/garage.js`, `data/kasern.js` | Garage, Kasern 1 och 2 i `DP.byggnader` |
| `app/planering.js` | `DP.Plan`: tillstånd per byggnad, frekvenser i veckor, rutintillfällen, åtgärdstexter i tre nivåer, historik |
| `app/flyg.js` | Animering: brickor som flyger till tidsaxel/modell |
| `app/dialog.js` | `DP.Dialog`: dialogruta, jämförelse av texter (`onValj` förberett), textredigerare |
| `app/viewer.js` | `DP.Viewer`: generisk 3D-vy, `sattByggnad()`, lager, kamera, val, `blinka()`, gröna/avvikande installationer |
| `app/ui.js` | Byggnadsträd, verktygsfält, byggnadsval, informationskort (`DP.ui`) |
| `app/texter.js` | `DP.Texter`: flöden för att ändra åtgärdstext med konfliktfrågor |
| `app/tidsaxel.js` | `DP.Tidsaxel`: tidsaxel för året + mediaspelaren (ångra/gör om) |
| `app/telefon.js` | `DP.Telefon`: telefonvyer för rutintillfällen, högerklicksmeny |
| `app/flode.js` | `DP.Flode`: snabbstart, frågeflödet i fem steg, bruttolistan, **reaktionen på alla ändringar** |
| `flerbyggnad.html` | Fristående skiss för flera byggnader med påhittade data (ska ersättas i etapp 5) |

**Dataflödet:**
- All ändring av planeringen går genom `DP.Plan.andra(text, fn, info)`. `fn` muterar en kopia av den aktiva
  byggnadens tillstånd, och ändringen blir ett steg i historiken.
- Historiken sparar ögonblicksbilder av *alla* byggnaders tillstånd plus vilken byggnad steget gällde.
  `angra`/`gorOm`/`gaTill` växlar byggnad vid behov.
- `DP.Plan.prenumerera(fn(fore, efter, info))` – lyssnaren i `flode.js` ritar om allt och räknar ut skillnaden
  (tillagda/borttagna kopplingar, ändrade texter) för att animera. Animeringar fungerar därför även vid ångra.
- `DP.Plan.prenumereraByte(fn(id))` – byte av byggnad: 3D-vyn byggs om, träd, flöde, tidsaxel och telefoner ritas om.

**Tillstånd per byggnad** (`planering.js`, `tomtTillstand`): `bas` (besöksfrekvens), `ronder`
(`id, freq, foljerBas, besvarad, utforare`), `kopplingar` (`atgard, inst, rond`; `inst` kan vara `'BYGGNAD'`
för generella åtgärder), `standardTexter`, `instTexter`, `tillfalleTexter`.

**Byggnadsdata:** `plan` (nedifrån och upp, `elev`), `rum` (`nr`, `namn`, `plan`, `typ`, `rect [x0,z0,x1,z1]`,
valfri `hojd`), `installationer` (signifikanta med id/beteckning m.m. samt ej signifikanta), `stil`
(tak platt/sadel, färger, fönster, dekor). 3D-modellen räknas fram ur detta – en ny byggnad kräver bara en datafil.

## Status

Etapp 1–4 är klara som första utkast (se `docs/koncept-och-beslut.md`). **Nästa: etapp 5 – Balansering**
av flera byggnader med riktig planering från de fyra byggnaderna. Utformningen är bestämd i beslut 23–49 i
beslutsdokumentet, och begreppen står i `GLOSSARY.md`.

Kända begränsningar:
- `flerbyggnad.html` använder påhittade data och påverkas inte av planeringen på huvudsidan.
- Den fristående filen saknar länken till skissen.
- `byggAtgarder()` i `app/ui.js` är oanvänd kod från etapp 1.

## Agent skills

### Issue tracker

Biljetter ligger som GitHub Issues i `andreassilverbris/Driftplanering` (MCP-verktyg i molnet, `gh` lokalt). See `docs/agents/issue-tracker.md`.

### Triage labels

Standardetiketterna: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` i roten. ADR:er finns inte; de numrerade besluten i `docs/koncept-och-beslut.md` används i stället. See `docs/agents/domain.md`.
