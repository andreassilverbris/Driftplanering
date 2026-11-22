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

## Ralph-loopen

`ralph/` tar `ready-for-agent`-biljetter inom ett spår obevakat, en biljett per varv, på en arbetsgren
(beslut 50). Användaren startar den själv i en egen terminal: `caffeinate -is ./ralph/afk.sh 1 etapp-5`.
Arbetsordningen per biljett står i `.claude/commands/biljett.md` (kan också köras för hand som `/biljett <nr>`),
och hur loopen fungerar i `ralph/DESIGN.md`. Loopens egna tester körs med `npm run test:ralph` (pytest).
Biljetter som loopen ska ta behöver en spåretikett, till exempel `etapp-5`, utöver `ready-for-agent`.

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
| `data/tidsschablon.js` | `DP.tidsschablon`: tyngd per installationstyp, minuter per tyngd, de generella åtgärdernas tid och dagsdelarnas gränser |
| `data/ordlista.js` | `DP.ordlista`: begreppen i fyra grupper, det som ordlistedialogen visar |
| `data/garage.js`, `data/kasern.js` | Garage, Kasern 1 och 2 i `DP.byggnader` |
| `app/planering.js` | `DP.Plan`: tillstånd per byggnad, frekvenser i veckor, rutintillfällen, åtgärdstexter i tre nivåer, planerad tid per rond, historik |
| `app/flyg.js` | Animering: brickor som flyger till tidsaxel/modell |
| `app/dialog.js` | `DP.Dialog`: dialogruta, jämförelse av texter (`onValj` förberett), textredigerare |
| `app/viewer.js` | `DP.Viewer`: generisk 3D-vy, `sattByggnad()`, lager, kamera, val, `blinka()`, gröna/avvikande installationer |
| `app/ui.js` | Byggnadsträd, verktygsfält, byggnadsval, informationskort (`DP.ui`) |
| `app/texter.js` | `DP.Texter`: flöden för att ändra åtgärdstext med konfliktfrågor |
| `app/tidsaxel.js` | `DP.Tidsaxel`: tidsaxel för året + mediaspelaren (ångra/gör om) |
| `app/telefon.js` | `DP.Telefon`: telefonvyer för rutintillfällen, högerklicksmeny |
| `app/flode.js` | `DP.Flode`: snabbstart, frågeflödet i fem steg, bruttolistan, **reaktionen på alla ändringar** |
| `app/vyer.js` | `DP.Vyer`: processlinjen Byggnad → Planering → Balansering, Balanseringens skal och ordlistan |
| `flerbyggnad.html` | Fristående skiss för flera byggnader med påhittade data (ska ersättas i etapp 5) |

**Dataflödet:**
- All ändring av planeringen går genom `DP.Plan.andra(text, fn, info)`. `fn` muterar en kopia av den aktiva
  byggnadens tillstånd, och ändringen blir ett steg i historiken.
- `DP.Plan.andraFlera(text, fn, info)` ändrar flera byggnader och det gemensamma tillståndet i **ett** steg
  (Balansering). `fn` får `{ tillstand: fn(id), gemensamt }` – `tillstand(id)` lämnar byggnadens planering
  att mutera och markerar byggnaden som rörd av steget.
  Steget hör inte till någon byggnad, så ångra och gör om byter inte aktiv byggnad.
- Historiken sparar ögonblicksbilder av *alla* byggnaders tillstånd, det **gemensamma tillståndet**
  (`DP.Plan.gemensamt()`, inte per byggnad – Balanseringens svar ska ligga där) plus vilken byggnad steget
  gällde. `angra`/`gorOm`/`gaTill` växlar byggnad vid behov.
- `DP.Plan.prenumerera(fn(fore, efter, info))` – lyssnaren i `flode.js` ritar om allt och räknar ut skillnaden
  (tillagda/borttagna kopplingar, ändrade texter) för att animera. Animeringar fungerar därför även vid ångra.
  `info.byggnader` säger vilka byggnader steget ändrade (sparat i historiksteget, så ångra och gör om ger
  samma lista); rörde det inte den aktiva byggnaden finns inget att animera.
- De härledda uppgifterna i `DP.Plan` gäller den aktiva byggnaden om inget byggnads-id anges, och svarar för en
  valfri byggnad när det gör det: `rutintillfallen(s, bid)`, `rutintillfalleNamn(rond, vecka, bid)`,
  `besoksveckor(s, bid)`, `signifikanta(bid)`, `kopplingsStatus(s, bid)` och `stegStatus(s, bid)`
  (stegstatusen är flödets, så Balansering kan se vilka byggnader som är klara).
  `kopplingsStatus` svarar på vad som fattas i steg 5: `saknas` (signifikanta installationer utan åtgärd),
  `saknarGenerella` (Kontroll byggnad invändigt/utvändigt som inte är kopplade), `klar` och `saknasText`
  i klartext. Steg 5 är klart när `klar` är sant (beslut 23).
- **Planerad tid (steg 6):** `tidForslag(rond, s, bid)` tillämpar `DP.tidsschablon` på rondens kopplingar och
  ger dagsdel, minuter, uträkningen i klartext och `foreslaDelning` när ronden inte ryms på en dag.
  `tidStatus(s, bid)` ger en rad per rond med den godkända tiden, förslaget och flaggan `andrad`
  (förutsättningarna har ändrats sedan tiden godkändes). Steg 6 är klart när varje rond har en godkänd tid;
  en ändrad förutsättning gör det inte ogrönt, eftersom den godkända tiden gäller tills planeraren tar
  ställning (beslut 27 och 35). `tidTimmar(rond, s, bid)` ger timmarna Balanseringen räknar belastning med.
  `andrad` jämför både dagsdel och minuter (`tidAndrad`): kasernernas Byggnad invändigt är heldag i båda men
  skiljer en halvtimme, så en jämförelse bara på dagsdel hade gått tyst förbi. Tröskeln är 30 min för tider
  planeraren själv satt, men **varje** avvikelse för en ärvd tid (`arvd`, satt av `arvTid` vid kopiering) –
  ingen har räknat på målbyggnaden, så skillnaden är osedd oavsett storlek (beslut 51).
  Planeraren kommer ur markeringen på två vägar, båda steg i historiken: `sattTid` (använd det nya förslaget
  eller välj en annan dagsdel) och `behallTid` (behåll min tid – dagsdelen rörs inte, men ställningstagandet
  är nytt). Båda skriver över `arvd`: en ärvd tid planeraren tagit ställning till är hens egen.
  Standardplaneringen fyller i steg 6 med godkända förslag, och kopieringen tar med tiderna inklusive
  källans förslag.
- **Förskjutningar (beslut 26 och 56):** `s.forskjutning` flyttar byggnadens hela besöksrytm i veckor
  (nivå 1), och `rond.forskjutning` en enskild rondserie ovanpå den (nivå 2). `rondForskjutning(rond, s)`
  lägger ihop dem och `veckorForRond(rond, s)` ger rondens veckor – all veckoberäkning går den vägen.
  `veckorFor(freq, forskjutning)` räknar förskjutningen **modulo intervallet**, så frekvensen och
  mellanrummet står still: bara *när i året* rytmen ligger ändras. Halvårsronder med vald startmånad
  flyttas bara inom sin egen månad (beslut 41). Förskjutningen sätts inuti `andra()`/`andraFlera()` med
  `sattForskjutning(st, veckor)` och `sattRondForskjutning(st, rondId, veckor)`; de flyttar samtidigt
  de avvikande texterna på rutintillfällesnivå lika många veckor som tillfällena, eftersom texterna är
  nycklade på veckan och efteråt inte går att para ihop med sitt tillfälle.
  `veckoSkillnad(fore, efter)` ger de tillfällen som bytt vecka – flödet animerar dem i tidsaxeln (även
  vid ångra) och telefonen låter en öppen vy följa med till den nya veckan. Båda parar ihop före och
  efter med `parihop`: tillfälle nummer *n* före svarar mot nummer *n* efter. Listorna kan vara olika
  långa (varannan månad ger 6 eller 7 tillfällen beroende på fas), och det sista tillfället saknar då
  motsvarighet – men de övriga har flyttat som vanligt.
- `DP.Plan.prenumereraByte(fn(id))` – byte av byggnad: 3D-vyn byggs om, träd, flöde, tidsaxel och telefoner ritas om.

**Tillstånd per byggnad** (`planering.js`, `tomtTillstand`): `bas` (besöksfrekvens),
`forskjutning` (besöksrytmens förskjutning i veckor), `ronder`
(`id, freq, foljerBas, besvarad, utforare, forskjutning`), `kopplingar` (`atgard, inst, rond`; `inst` kan vara `'BYGGNAD'`
för generella åtgärder), `standardTexter`, `instTexter`, `tillfalleTexter`, `tider`
(rond → `{ dagsdel, godkand, forslagVidGodkandet, minuterVidGodkandet, arvd }` – de två mittersta är
förslaget som gällde när planeraren tog ställning, `arvd` att tiden kom med en kopiering).

**Byggnadsdata:** `plan` (nedifrån och upp, `elev`), `rum` (`nr`, `namn`, `plan`, `typ`, `rect [x0,z0,x1,z1]`,
valfri `hojd`), `installationer` (signifikanta med id/beteckning m.m. samt ej signifikanta), `stil`
(tak platt/sadel, färger, fönster, dekor). 3D-modellen räknas fram ur detta – en ny byggnad kräver bara en datafil.

## Status

Etapp 1–4 är klara som första utkast (se `docs/koncept-och-beslut.md`). Av etapp 5 är steg 5 (beslut 23),
steg 6, planerad tid med förslag, uträkning och ändrade förutsättningar (beslut 27, 35, 43 och 51–53),
processlinjen och ordlistan (beslut 54–55) samt förskjutningarna i planeringen (beslut 26, 41 och 56) byggda.
Standardplaneringen ger alla fyra byggnaderna grön bock i alla sex stegen, så de är klara för Balansering.
**Nästa: etapp 5 – Balansering** av flera byggnader med riktig planering från de fyra byggnaderna.
Utformningen är bestämd i beslut 23–49 i beslutsdokumentet, och begreppen står i `GLOSSARY.md`.

Kända begränsningar:
- Huvudsteget Balansering är ännu bara ett skal som förklarar vad som kommer; uträkningen byggs i senare biljetter.
- Förskjutningarna finns i planeringen men har inget gränssnitt: de sätts av `DP.Balansering` och av flytt
  för hand, som byggs i senare biljetter. Provisoriska flyttar och strykningar (nivå 3) finns inte än.
- `flerbyggnad.html` använder påhittade data och påverkas inte av planeringen på huvudsidan.
- Den fristående filen saknar länken till skissen.

## Agent skills

### Issue tracker

Biljetter ligger som GitHub Issues i `andreassilverbris/Driftplanering` (MCP-verktyg i molnet, `gh` lokalt). See `docs/agents/issue-tracker.md`.

### Triage labels

Standardetiketterna: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, plus en spåretikett per serie för Ralph-loopen (t.ex. `etapp-5`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` i roten. ADR:er finns inte; de numrerade besluten i `docs/koncept-och-beslut.md` används i stället. See `docs/agents/domain.md`.
