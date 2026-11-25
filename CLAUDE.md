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
- SheetJS 0.20.3 (Apache 2.0) ligger som `vendor/xlsx.mini.min.js` och läser och skriver
  inläsningsfilens .xlsx från `file://` utan server. **Mini-bygget**, inte det fulla: det läser
  och skriver .xlsx – formatet både Excel och Numbers exporterar till – och är en tredjedel så
  stort. En .numbers-fil går alltså inte att läsa direkt; planeraren exporterar till .xlsx
  först, som hon gör mot fastighetssystemet ändå. Biblioteket distribueras bara från
  `cdn.sheetjs.com` (SheetJS slutade publicera på npm efter 0.18.5).
- Kodstil: ES5 (`var`, `function`), svenska namn på variabler och funktioner, ett IIFE per fil som
  exporterar till namnrymden `window.DP`.
- All planering lever bara i minnet och nollställs vid omladdning (medvetet beslut).

## Arkitektur

Skriptens ordning i `index.html` spelar roll:

| Fil | Ansvar |
|---|---|
| `data/hangar.js` | Hangaren + grundkatalogen: `DP.installationstyper`, `DP.ronder`, `DP.atgarder` (bruttolistan), och `DP.rumNyckel`/`DP.rumBeteckning` (plan + rumsnummer, beslut 76). Byggnaden är källa till starttillståndet, som Garage och Kasern |
| `data/katalog.js` | Fler typer/åtgärder, `DP.byggnadstyper` (standardplanering, stil, konstanter och **planlösningens regel** `planlosning: { regel, djup, korrBredd, langd }` – beslut 99), `DP.omraden`, `DP.genereraOvriga()` |
| `data/rumstyper.js` | `DP.rumstyper`: rumstyperna med namn, kategori (modellens sort), standard-NTA och igenkänningsmönster, plus `DP.rumstypFor(benämning)` och `DP.rumstypAv(kolumnvärde)` (beslut 80, 99 och 108). Tabellens ordning *är* regeln: det mest utpekande mönstret prövas först |
| `data/installationstyper.js` | `DP.installationstypMonster`: igenkänningen av en installationstyp ur benämningen (Handbrandsläckare 3, Handbr.släckare 3, HC01), plus `DP.installationstypFor(benämning)`, `DP.installationstypAv(kolumnvärde)` och `DP.signifikantaTyper()` (beslut 81 och 109). Tabellens ordning *är* regeln, som i `rumstyper.js`. En **okänd** typ får inget förslag: typen avgör vilka åtgärder som går att koppla |
| `data/tidsschablon.js` | `DP.tidsschablon`: tyngd per installationstyp, minuter per tyngd, de generella åtgärdernas tid och dagsdelarnas gränser |
| `data/ordlista.js` | `DP.ordlista`: begreppen i fyra grupper, det som ordlistedialogen visar |
| `data/garage.js`, `data/kasern.js` | Garage, Kasern 1 och 2 i `DP.byggnader` – **källa till starttillståndet**, läses bara av `planering.js` (beslut 71) |
| `app/planering.js` | `DP.Plan`: tillstånd per byggnad, frekvenser i veckor, rutintillfällen, åtgärdstexter i tre nivåer, planerad tid per rond, historik |
| `app/flyg.js` | Animering: brickor som flyger till tidsaxel/modell |
| `app/dialog.js` | `DP.Dialog`: dialogruta, jämförelse av texter (`onValj` förberett), textredigerare |
| `app/viewer.js` | `DP.Viewer`: generisk 3D-vy, `sattByggnad()`, lager, kamera, val, `blinka()`, gröna/avvikande installationer |
| `app/ui.js` | Byggnadsträd, verktygsfält, byggnadsval, informationskort (`DP.ui`) |
| `app/texter.js` | `DP.Texter`: flöden för att ändra åtgärdstext med konfliktfrågor |
| `app/tidsaxel.js` | `DP.Tidsaxel`: tidsaxel för året (Planering) |
| `app/spelare.js` | Mediaspelaren (ångra/gör om/gå till steg) på en fast plats i toppraden, gemensam för alla tre huvudsteg, med Ctrl+Z och Ctrl+Y. Ritar sig själv ur historiken via `prenumerera`, så den exporterar inget till `DP` (beslut 82) |
| `app/telefon.js` | `DP.Telefon`: telefonvyer för rutintillfällen, högerklicksmeny |
| `app/flode.js` | `DP.Flode`: snabbstart, frågeflödet i fem steg, bruttolistan, **reaktionen på alla ändringar** |
| `app/byggnadsflode.js` | `DP.Byggnadsflode`: huvudsteget Byggnad som vägledd process – byggnadslistan med status, *Skapa ny byggnad* och de fyra stegen Byggnadstyp och namn → Plan → Rum → Installationer (beslut 69 och 107). Inläsningens tre grupper ritas av **samma** kod för alla tre flikarna: det som skiljer raderna är vilka frågor de bär, och det svarar `DP.Inlasning` på. I steg 4 är **rummet** droppmålet i sin helhet och inte en plats mellan två rader – ordningen inom ett rum betyder ingenting, eftersom platsen räknas fram – så där märks rummet i stället för att en linje ritas |
| `app/inlasning.js` | `DP.Inlasning`: inläsningsfilens tolkning utan DOM. `lasArk(ark)` delar ett ark i flikarna Plan, Rum och Installationer (igenkänning på **kolumnrubrikerna**, rubrikraden hittad under tabellrubriker och tomma rader), okända kolumner blir **egna fält** (beslut 89), och `tolkaPlan(rader, befintliga)` och `tolkaRum(rader, byggnad)` ger radmodellen `{ key, rad, egna, falt, fragor }` där statusen är **härledd**: inga frågor → *klar*, alla frågor har förslag → *förslag*, annars → *oplacerad* (beslut 83). Rumsraden matchas förlåtande på plan (`planMatchning`) och rumsnummer (`nrMatchning`), rumstypen läses ur benämningen och NTA föreslås ur rumstypen (beslut 76, 77, 79 och 80). `tolkaInst(rader, byggnad, blivandeRum)` matchar en installation på **plan + rumsnummer** (`rumMatchning`): saknas planet och numret finns på ett enda plan blir det ett förslag, på flera plan oplacerat (beslut 86), installationstypen läses ur benämningen och en **okänd typ får inget förslag** (beslut 81), och ett tomt Id får ett id från systemet (`nyttInstId`). `blivandeRum` är de nycklar inläsningens egna rumsförslag ger, så en installation i ett rum som själv är ett förslag är klar och syns när rummet gör det (beslut 110). `godta`/`besvara` för in svaren, `nastaLedigaNr` svarar vid en nummerkrock (beslut 110), `tillArk(byggnad)` är filen på väg ut – där rummets nyckel delas upp i kolumnerna Plan och Rum. Mot en **befintlig** byggnad visar tolkningen skillnaden (beslut 86): en rad vars identitet finns får `andring: { fore, efter, delar }` och en fråga av slaget `andring`, `skillnad(flik, befintlig, falt)` skiljer **motsägelser** (frågas om) från **luckor** (fält byggnaden saknar – fylls i tyst), och `bortForslag(flik, byggnad, kom, barFliken)` ger raderna för det som finns i byggnaden men saknas i filen (`bort: true`, fråga av slaget `bort`) |
| `app/inlasningsfil.js` | `DP.Inlasningsfil`: sömmen mot .xlsx (SheetJS i `vendor/`). `las(blob, nar, fel)` ger ett ark, `taUt(ark, filnamn)` laddar ner en .xlsx. Allt annat arbetar med ark, så tolkningen går att pröva utan att en fil finns |
| `app/planlosning.js` | `DP.Planlosning`: byggnadens form utan DOM. `foreslagenOrdning(plan)` ger planens ordning nedifrån och upp ur beteckning och benämning (beslut 84), `planTal` tolkar P1/1/Plan 1 → 1 och källare negativt, `benamningsforslag(id)` namnet ett plan utan benämning får, `laggUtRum(byggnad, rum)` **rummens rektanglar** ur byggnadstypens regel (beslut 78), `kategoriFor(rumstyp)` modellens sort, `laggUtInstallationer` **installationernas plats i rummet** jämnt längs väggen mot korridoren (beslut 78), och `form(byggnad)` byggnaden med `elev` per plan, räknade rektanglar, **skal** för de plan som saknar rum (beslut 85) och de **övriga** installationerna genererade ur rumstyperna (berättelse 57). Handritade byggnader lämnas orörda och får inga genererade övriga ovanpå sina egna (beslut 101). `areor(byggnad)` ger **BRA och BTA per plan och byggnad** ur rummens egna tal eller ur modellens rektangel, märkta `beraknad` (beslut 79) – och `VAGG_TJ`, väggtjockleken både uträkningen och viewern ritar med |
| `app/balansering.js` | `DP.Balansering`: balanseringens uträkningar utan DOM. Belastning per utförare och vecka, och `balansera()` som väljer förskjutningar och formulerar förklaringen i klartext |
| `app/vyer.js` | `DP.Vyer`: processlinjen Byggnad → Planering → Balansering, Balanseringens frågor, knappen Balansera, förklaringen, tidsaxeln och ordlistan |

**Dataflödet:**
- **Byggnaden själv är data i tillståndet (beslut 71 och 73, biljett #32).** Namn, typ, område, färg, plan,
  rum och installationer ligger i historikens ögonblicksbilder tillsammans med planeringen, och läses med
  `DP.Plan.byggnad(bid)` (den aktiva när `bid` saknas), `DP.Plan.byggnadsNamn(bid)` och `DP.Plan.inst(instId)`
  för en signifikan installation i vilken byggnad som helst. **Ingen kod utanför `planering.js` läser
  `DP.byggnader`** – datafilerna i `data/` är källan till *starttillståndet* och inget annat. Det är den
  enda sömmen där ett adapterlager mot en databas senare kopplas in: då byts starttillståndet, inte läsarna.
  Ändras byggnadens data går det genom `DP.Plan.andraByggnad(text, bid, fn, info)` (`fn` får byggnadens data
  att mutera; `bid` tomt betyder den aktiva) eller `andraFlera`:s `byggnad(id)`, och blir ett steg i
  historiken som allt annat – så ett ångra av en ändring av byggnaden återställer den.
- **Vilka byggnader som finns ligger också i historiken (beslut 73, biljett #34).** Varje historiksteg bär
  sin egen `ordning` – listan över byggnads-id – och `DP.Plan.byggnadsordning` läser den ur det aktuella
  steget (en kopia, så ingen läsare kan ändra ordningen förbi historiken). `DP.Plan.skapaByggnad({ namn,
  typ, omrade })` lägger till en tom byggnad som ett steg och gör den aktiv; ångrar planeraren förbi
  steget försvinner byggnaden, och `ga()` byter då till den sista som finns. `namnHinder(namn, utom)` och
  `namnTaget(namn, utom)` svarar på om namnet går att använda (beslut 103), `byggnadsSteg(bid)` på vilka
  av byggnadsflödets fyra steg som är klara och `byggnadStatus(bid)` på var byggnaden står i klartext
  ("Väntar på inläsningsfil", "Inläsning pågår", "Klar för Planering"). Reglerna bor i planeringen och
  inte i vyn, av samma skäl som balanseringens förklaring (beslut 61).
- **Planen ligger i byggnadsdatan i ordning nedifrån och upp (beslut 84, biljett #35).** Listans ordning
  *är* byggnadens ordning – samma ordning viewern, plan-knapparna och byggnadsträdet läser – så ett drag i
  steg 2:s lista är ett drag i modellen. `DP.Plan.laggTillPlan({ id, namn })` lägger till ett plan **på den
  plats förslaget ger** (så en källare som läggs till sist ändå hamnar underst) och `flyttaPlan(planId,
  fore)` flyttar det, där `fore` är planet det ska hamna under (tomt = överst). `taBortPlan` tar med sig
  planets rum och deras installationer, `sattPlanNamn` byter benämning utan att röra beteckningen, och
  `ordnaPlanEfterForslag()` lägger tillbaka ordningen som systemet föreslår. Omdöpningen sker **på
  planets egen rad** i listan och inte i en ruta ovanpå sidan, som resten av flödet frågar i panelen;
  raden går inte att dra medan den redigeras. `planHinder(beteckning)` ger
  skälet i klartext när beteckningen inte går att använda (den pekar ut planet, så två plan kan inte dela
  den) och `planStatus()` raderna, förslaget och `avvikerFranForslag`. Allt är steg i historiken.
- **Det inlästa ligger i byggnadsdatan under `inlasning`, och klara rader *är* byggnaden
  (beslut 83, biljett #36).** `DP.Plan.lasInArk(ark, filnamn)` tolkar fliken Plan och för in de
  rader som är **klara** direkt i `b.plan` (i föreslagen ordning); det som ligger kvar i
  `b.inlasning.plan` är bara förslag och oplacerat. Två skäl: modellen visar aldrig en
  gissning (berättelse 55), och allt som redan läser byggnaden – modellen, trädet,
  plan-knapparna, `planStatus`, bocken – fortsätter svara rätt utan att känna till
  inläsningen. `infordaPlan` håller reda på vilka plan som kom ur filen, så att gruppen *klart*
  går att visa. `godtaPlan(key)`, `godtaAllaPlan()` (**ett** steg) och `svaraPlan(key, slag,
  varde)` är egna historiksteg, och en rad som blir klar förs in i byggnaden i **samma** steg:
  att godta ett förslag *är* att lägga till planet. `inlasningStatus(flik)` ger `grupper`
  (det som **återstår**: `forslag` och `oplacerad`), `inforda` (gruppen *klart*, slagen upp i
  byggnaden så ett borttaget plan faller ur av sig självt), antalen och `klar`. Gruppen *klart*
  heter `inforda` och inte `grupper.klar`: de klara raderna lämnar `inlasning.plan` i samma steg
  som de blir klara, så en `grupper.klar` hade alltid varit tom. `filArk()` ger arket som skrivs
  när filen tas ut. Läses samma fil in igen räknas de plan som **redan finns** också som klara –
  annars hade planeraren fått "0 plan klara" om en byggnad full av plan (berättelse 17).
  **Steg 2 får grön bock först när bara klart återstår** (`byggnadsSteg`, beslut 83).
- **Rummen kommer samma väg, och rummens ordning *är* deras plats i modellen (beslut 76–80 och
  110, biljett #37).** `lasInArk` tolkar nu **både** Plan och Rum i **ett** historiksteg, och
  rummen matchas mot planen **som de blir av inläsningen** – filen bär ofta plan och rum på en
  gång, och ett rum på plan 01 ska inte bli oplacerat bara för att plan 01 kom i samma fil.
  `godtaRum(key)`, `godtaAllaRum()` (**ett** steg) och `svaraRum(key, slag, varde)` är egna
  historiksteg, `sattRumstyp(nyckel, rumstyp)` byter typ och `taBortRum(nyckel)` tar med sig
  rummets installationer. `rumStatus(bid)` ger rummen per plan i den ordning modellen ritar dem,
  med NTA, NTV, höjden (NTV ÷ NTA), BRA, BTA och summorna. NTA är rummens och räknas aldrig ur
  modellen; **BRA och BTA är rummens när alla rum har dem och annars räknade ur modellen**, med
  `braBeraknad`/`btaBeraknad` per plan och för byggnaden (beslut 79, se nedan). `inlasningStatus('rum')` svarar som för Plan, med `infordaRum` nycklat på
  plan + rumsnummer. En nummerkrock prövas **när raden blir klar** och inte vid inläsningen:
  planet kan självt vara ett förslag, och raden står då kvar som ett förslag med nästa lediga
  nummer (beslut 110). Tas ett plan bort blir de inlästa rumsrader som pekade på det
  **oplacerade** i stället för att tyst försvinna.
- **Rummen rättas för hand, och ordningen *är* placeringen (beslut 78, 106 och 110,
  biljett #38).** `laggTillRum({ plan, nr, namn, nta, ntv, bra, bta, temp })` lägger till ett rum
  sist på sitt plan med **samma förslag som inläsningen**: rumstypen läses ur benämningen och NTA
  föreslås ur rumstypen, så ett rum planeraren skriver in blir detsamma som ett rum ur filen.
  Numret fylls ut till tre siffror och tomt nummer blir nästa lediga. `rumHinder(plan, nr)` ger
  skälet i klartext när numret inte går att använda (den pekar ut rummet, så två rum kan inte dela
  plan + nummer) och `nastaRumsnummer(plan)` svarar vad som är ledigt.
  `flyttaRum(nyckel, malPlan, foreNyckel)` drar om ordningen på ett plan eller flyttar rummet till
  ett annat – `foreNyckel` är rummet det ska hamna **före**, tomt betyder sist på planet. Byter
  rummet plan och numret är upptaget där får det **nästa lediga nummer** (beslut 110), och eftersom
  installationerna pekar på nyckeln (beslut 76) skrivs de om i **samma** steg; ett **innerrum** följer
  med både i `iRum` och i sitt eget `plan`, som är det viewern ritar det på. Funktionen svarar med
  den nya nyckeln. Allt är steg i historiken med text i klartext ("flytta Dagrum före Entré på
  plan 01"). `rumStatus()` bär också `handritad`: Garage, Kasern 1 och 2 och Hangar är ritade rum för
  rum och lämnas orörda av planlösningen (beslut 101), så ett rum som läggs till eller dras om där
  får sin plats ur regeln medan grannarna behåller sina ritade mått – och `blandade`, de plan där
  det faktiskt skett. Steg 3 varnar då och erbjuder `ritaOmPlan` (se *Ändra byggnad* nedan).
- **BRA och BTA räknas ur modellen när rummen saknar dem, och märks *beräknad* (beslut 79,
  biljett #40).** Uträkningen bor i `DP.Planlosning.areor(byggnad)` – den är geometri, och hör
  därför där formen räknas och inte i `planering.js`. NTA är alltid rummens summa. BRA och BTA
  är rummens när **alla** rum på planet har dem, och räknas annars fram ur planets omslutande
  rektangel: **BRA** är rektangeln själv – ett rums rektangel har NTA som yta och rummen ligger
  kant i kant, så den rymmer nettoarean plus innerväggarna – och **BTA** samma rektangel utökad en
  halv väggtjocklek runt om, eftersom ytterväggen ritas centrerad på rummets kant. `VAGG_TJ` bor i
  planlösningen och läses därifrån av viewern, eftersom två tal som ska vara samma glider isär
  om de ligger på två ställen. Märkningen (`braBeraknad`, `btaBeraknad`) är **per plan** och inte
  bara i botten: planeraren ska se vilket plan som är systemets tal. Byggnadens summa är planens
  och faller när något plan med rum saknar ett tal; ett plan som bara är **skal** räknas inte.
  Uträkningen **avstår** när rektangeln inte täcker planets NTA – ett BRA under NTA är
  geometriskt omöjligt, och det är modellens brist (biljett #48) och inte ett mått.
- **Installationerna kommer samma väg, och platsen i rummet är räknad (beslut 81, 86, 87 och
  109, biljett #39).** `lasInArk` tolkar nu **alla tre** flikarna i **ett** historiksteg, och
  installationerna matchas mot rummen **som de blir av inläsningen** – också mot dem som ännu
  bara är förslag, så en installation i 01-003 är klar när rum 003 är ett förslag i samma fil
  (beslut 110). `godtaInst(key)`, `godtaAllaInst()` (**ett** steg) och `svaraInst(key, slag,
  varde)` är egna historiksteg, där slagen är `rum` och `typ`. `instStatus(bid)` ger
  installationerna per **plan → rum**, i samma ordning som byggnadsträdet och modellen, och
  tar med **alla** rum – också de utan installationer, eftersom ett rum är den plats en
  installation dras till. Den skiljer på två sorters rum-som-saknas: en installation vars
  rum är ett **rumsförslag i steg 3** står i `vantande` och syns så fort rummet godtas
  (beslut 110) – det är inget fel och **håller steg 4 ogrönt** tills rummet är på plats, för
  ett grönt steg 4 ovanför ett rött steg 3 hade sagt att installationerna sitter någonstans.
  En vars rum varken finns eller är på väg står i `hemlosa` och är ett fel att rätta. `laggTillInst({ rum, benamning, typ, … })` ger samma förslag som
  inläsningen (typen ur benämningen, id:t ur systemet) och `instHinder()` skälet i klartext;
  `sattInstTyp(id, typ)` byter typ utan att röra kopplingarna – att de syns som saknade i
  steg 5 är hela poängen (beslut 94). `flyttaInst(id, malRum)` är **samma** installation:
  id:t består och kopplingarna följer med, så flytten är en ändring av byggnadens data och
  inget mer. `taBortInst(id)` går däremot genom `andraFlera`, eftersom kopplingarna och de
  avvikande texterna ska försvinna i **samma** steg (beslut 87); `taBortPlan` och `taBortRum`
  gör nu detsamma för de installationer de tar med sig, och delar `rensaKopplingar`.
  **Steg 4 får grön bock** när byggnaden har signifikanta installationer och det inlästa är
  avgjort – en okänd installationstyp är ett sådant ogjort ställningstagande (beslut 81).
  De **övriga** installationerna ligger aldrig i tillståndet: `DP.Planlosning.form()`
  genererar dem ur rumstyperna, och både modellen och byggnadsträdet räknar dem därifrån
  (berättelse 57).
- **Ändra byggnad: namnet, borttagningen och det omritade planet (beslut 100, 101 och 103,
  biljett #41).** Samma fyra steg öppnar en **befintlig** byggnad, och steg 1 är där byggnaden
  som helhet ändras. `sattByggnadsNamn(namn, bid)` byter namn med samma kontroll som när
  byggnaden skapades (`namnHinder(namn, bid)`, byggnaden själv undantagen). **Rutintillfällena
  byter namn av sig själva**: `rutintillfalleNamn()` bygger namnet ur byggnadens namn vid
  uppslagningen, och de avvikande texterna är nycklade på rond och vecka – hade de burit
  tillfällets namn hade ett namnbyte tappat dem.
  `taBortByggnad(bid)` tar bort byggnaden, dess planering och dess plats i ordningen som
  **ett** steg; ångra tar tillbaka alla tre, eftersom listan över byggnader ligger i steget
  (beslut 73). Steget skrivs för hand och inte genom `andraByggnad`, som kräver att byggnaden
  finns. Den **sista** byggnaden går inte att ta bort: vyerna ritar ur en aktiv byggnad.
  Var byggnaden med i en balansering markeras Balansering som ändrad av sig självt –
  `planeringAndringar()` skiljer då `borttagen` från `ej-klar`, eftersom en borttagen byggnad
  inte går att göra klar igen. Därför bär `balanseringSammandrag` också byggnadens **namn**:
  en byggnad som inte finns går inte att slå upp, och raden hade annars burit id:t.
  `ritaOmPlan(planId, bid)` lägger om ett **handritat** plan enligt byggnadstypens regel
  (beslut 101) genom att ta bort planets ritade `rect` – formen är räknad och ska inte ligga i
  tillståndet (beslut 71), så utan rektangel lägger `form()` ut hela planet i ett och samma
  koordinatsystem. Installationernas ritade plats i rummet faller med, som vid en flytt.
  Bara det plan planeraren pekar på: de byggnader hon lärt sig på ska inte förändras i onödan.
  `DP.Planlosning.blandadePlan(b)` svarar på **vilka** plan som blandar ritade och räknade rum,
  alltså där bristen uppstått, och `rumStatus().blandade` bär listan till steg 3.
- **Ändra byggnad via fil: skillnaden mot det som finns (beslut 86, biljett #42).** En ombyggnad
  förs in som en ny byggnad: filen tas ut, ändras och läses in igen. `lasInArk` matchar då plan på
  beteckningen, rum på plan + rumsnummer och installationer på **Id**, och svaret är tre sorters
  förslag i stället för ett. *Nytt* är ett vanligt förslag som förut. *Ändrat* är en rad vars
  identitet finns men vars uppgifter skiljer sig: den bär `andring: { fore, efter, delar }` och en
  fråga av slaget `andring`, och godtas den skrivs **bara de fält skillnaden pekade ut** om –
  en tom cell i filen är inget svar, och en flytt till ett annat rum är samma installation med sina
  kopplingar i behåll (beslut 87). *Saknas i filen* är raden som finns i byggnaden men inte i filen:
  den byggs av `DP.Inlasning.bortForslag`, bär `bort: true`, och **ingenting tas bort förrän den
  godtas** (berättelse 74). `avvisaBort(flik, key)` och `avvisaAllaBort(flik)` är det andra svaret –
  *låt stå* – och de måste finnas: ett steg blir grönt när bara klart återstår (beslut 83), så ett
  förslag planeraren inte vill godta hade annars hållit steget ogrönt för alltid.
  Ett godtagande kan alltså riva kopplingar, så `godtaPlan`/`godtaRum`/`godtaInst` och deras
  *Godta alla* går genom `andraByggnadOchPlanering` – `andraFlera`:s form med `andraByggnad`:s text
  och byggnad, så att ett ◀ tar tillbaka både installationen och dess tillsyn i ett steg.
  Borttagningens inre är utbrutet till `planBort`, `rumBort` och `instBort`, delat med knapparna
  *Ta bort*: ett plan som försvinner ur filen och ett plan planeraren tar bort för hand är samma
  borttagning. `inlasningStatus().grupper` har därför `forslag`, `andrade`, `bort` och `oplacerad`.
  **Luckor skiljs från motsägelser**: ett fält byggnaden *saknar* är ingen ändring utan något filen
  fyller i, och det förs in tyst i samma steg som inläsningen (`fyllLuckor`). Utan den hade en fil
  ur Kasern 1 gett ett förslag per rum, eftersom de handritade byggnaderna varken har rumstyp eller
  NTA i `data/` (beslut 101) – och med den är filen vägen att ge dem talen. Ett handritat rum
  behåller dock sin ritade modellsort: dess golvfärg är ritad.
- All ändring av planeringen går genom `DP.Plan.andra(text, fn, info)`. `fn` muterar en kopia av den aktiva
  byggnadens tillstånd, och ändringen blir ett steg i historiken.
- `DP.Plan.andraFlera(text, fn, info)` ändrar flera byggnader och det gemensamma tillståndet i **ett** steg
  (Balansering). `fn` får `{ tillstand: fn(id), las: fn(id), byggnad: fn(id), lasByggnad: fn(id), gemensamt }` –
  `tillstand(id)` lämnar byggnadens planering och `byggnad(id)` dess data att mutera, och markerar byggnaden
  som rörd av steget.
  Steget hör inte till någon byggnad, så ångra och gör om byter inte aktiv byggnad.
- Historiken sparar ögonblicksbilder av *alla* byggnaders tillstånd, det **gemensamma tillståndet**
  (`DP.Plan.gemensamt()`, inte per byggnad – Balanseringens svar ska ligga där) plus vilken byggnad steget
  gällde. `angra`/`gorOm`/`gaTill` växlar byggnad vid behov.
- `info.byggnadsdata` (lista med byggnader vars **data** skiljer sig i steget) räknas i `utokaInfo()` på
  samma sätt som `info.flyttade`, så den gäller även ångra och gör om. `DP.Plan.aktivFickNyData(info)` är
  frågan varje vy ställer i sin lyssnare – den bor i planeringen och inte i vyerna, eftersom den vy som
  glömmer formen ritar tyst gammal data. `ui.js` bygger då om modellen, plan-knapparna, byggnadsträdet,
  väljaren och det öppna informationskortet (`byggOm`), och `flode.js` och `telefon.js` indexerar om sina
  kopior av byggnaden innan de ritar.
- **Modellen byggs om utan att planeraren flyttas.** `viewer.sattByggnad()` nollställer kamera,
  plansynlighet, rumsläge och markering med flit – rätt när planeraren *byter* byggnad. Ändras samma
  byggnads data används `viewer.byggOmByggnad()` i stället: den bevarar kameran, de släckta planen,
  rumsläget och den markerade installationen (slagen upp på sitt id, eftersom objektet är nytt).
  Döper planeraren om ett rum ska hon se namnet ändras, inte kastas ut till översiktsvyn.
  Byter byggnaden **storlek** under ombyggnaden – i steget Plan växer den ett plan i taget – skalas
  kamerans avstånd till centrum om med byggnaden. Riktningen och det hon tittar mot är hennes vy;
  avståndet är bara en följd av hur stort huset är, och oförändrat hade hon hamnat inuti en vägg.
- **Viewern får den räknade formen, inte byggnadsdatan.** `ui.js` håller två saker isär: `b` är byggnaden
  som den ligger i tillståndet – det trädet, listorna och informationskortet visar – och `modell =
  DP.Planlosning.form(b)` är samma byggnad med elevationer och **skal** uträknade (beslut 85). Bara viewern
  får formen, så att ett skal aldrig kan dyka upp i trädet som ett rum planeraren tror finns. Ett skal är
  heller inget rum i viewern: det ligger inte i `rumIndex`, går inte att välja eller gå in i, och planet
  får inga fönster så länge det bara är skal.
- **Verktygsfältets knappar är utgråade, inte borttagna, när de inte har något att visa (beslut 111).**
  `uppdateraVerktyg()` i `ui.js` sätter `.utgraad` och `disabled` på Innerväggar och Rumsnamn utan rum,
  Röntgen utan signifikanta installationer, och Ytterväggar, Tak, Översikt och Uppifrån utan plan –
  och lägger skälet i knappens titel. Plan-gruppen får ett streck i stället för att stå tom. Ett fält
  som ändrar form flyttar knapparna, och då måste planeraren leta varje gång.
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
  vid ångra) och telefonen låter en öppen vy följa med till den nya veckan. Den parar ihop på
  **ordinarie** vecka men svarar med de **faktiska**, så en provisorisk flytt animeras likadant. Båda parar ihop före och
  efter med `parihop`: tillfälle nummer *n* före svarar mot nummer *n* efter. Listorna kan vara olika
  långa (varannan månad ger 6 eller 7 tillfällen beroende på fas), och det sista tillfället saknar då
  motsvarighet – men de övriga har flyttat som vanligt.
- **Nivå 3: provisoriska flyttar och strykningar (beslut 26, 32, 45 och 64–66):** ett rutintillfälle har
  två veckor. Den **ordinarie** är den rytmen ger, den **faktiska** är där det ligger efter en provisorisk
  flytt. `s.flyttade` (`'rond:ordinarieVecka'` → faktisk vecka) och `s.strukna` (samma nyckel →
  `'struken'` | `'foreslagen'`) är båda nycklade på den **ordinarie** veckan, som står still när tillfället
  flyttas. `rutintillfallen()` svarar med `vecka` (faktisk), `ordinarieVecka`, `provisorisk` och
  `foreslagen`, och utelämnar de strukna; `tillfallenMedStrukna()` tar med dem. **Nyckeln
  (`rond:ordinarieVecka`) bygger på den ordinarie veckan**, inte på den faktiska: flera
  tillfällen i samma rondserie kan flyttas till samma vecka, och hade nyckeln följt den
  faktiska hade de delat nyckel. Avvikande åtgärdstexter
  nycklas på den **ordinarie** veckan – `DP.Plan.textVecka(t)` är vägen dit – så de följer med flytten
  av sig själva. `DP.Balansering.niva3(underlag)` räknar ut flyttar och strykförslag: flytt till närmaste
  tillåtna vecka **före** (vidare bakåt om också den saknar tillsyn, framåt bara när ingen vecka finns
  före), och förslag när ett flyttat tillfälle hamnar högst en vecka från ett annat i samma rondserie. `strykAllaForeslagna()`, `behallTillfalle()`,
  `strykTillfalle()` och `aterstallStruket()` är egna historiksteg; balanseringens flyttar ingår i dess enda steg.
- **Flytt för hand (beslut 34, 67 och 68):** planeraren drar en bricka i Balanseringens tidsaxel och
  svarar på vad flytten ska gälla. Dragningen är ett **avstånd**, och svaret säger vilken nivå det
  läggs på: `flyttaTillfalle` (nivå 3, provisorisk), `flyttaRondserie` (nivå 2) och `flyttaBesoksrytm`
  (nivå 1) – vart sitt historiksteg. De två permanenta räknas från **ordinarie** vecka, inte från den
  faktiska: en förskjutning flyttar rytmen, och rytmen är de ordinarie veckorna.
  `flyttAlternativ(bid, rond, ordinarieVecka, malVecka)` svarar med vad de tre valen skulle ge, som rena
  data – avstånd, ny förskjutning, rytmens veckor, `nyVecka`, `traffar` (om det dragna tillfället självt
  hamnar i målveckan – det gör det inte när draget är längre än intervallet, beslut 56) och `tillaten`
  (falskt för de permanenta när en halvårsrond med startmånad dras ut ur sin månad, beslut 41, med
  skälet i `sparr`). Dialogen i `vyer.js` läser bara den strukturen och räknar inget själv.
  `forskjutningStatus(bid)` ger beskedet om de permanenta flyttarna i klartext och
  `forskjutningMarke(veckor)` märket "⇥ +2 v." – båda bor i planeringen, så att de två tidsaxlarna
  säger samma sak om samma flytt (⇥ för permanent, skilt från ⤺ för provisoriskt).
  Släppet begränsas till utförarens egen rad: balanseringen byter aldrig utförare (beslut 46).
- **Balanseringens underlag:** `DP.Plan.balanseringsUnderlag()` samlar ihop de byggnader där alla sex stegen
  är klara (`byggnadKlar(bid)`, `klaraByggnader()` – beslut 39) till en ren datastruktur: per byggnad id, namn,
  färg, område och ronder med utförare, planerad tid i timmar, dagsdel och **de veckor tillfällena ligger i**.
  Veckorna räknas där, med båda förskjutningarna, så att `DP.Balansering` själv inte behöver veta något om
  frekvenser eller tillstånd. Veckorna i underlaget är de **ordinarie**; nivå 3 följer med som `flyttade`
  och `strukna` per rond, och belastningen räknar fram de faktiska ur de två. Underlaget bär också svaren
  ur det gemensamma tillståndet (`kapacitet` i dagar, `veckorUtan`, `akerTill`) med förval när de inte är
  besvarade.
- **`DP.Balansering.belastning(underlag)`** ger en rad per utförare och en cell per vecka: planerad tid i
  timmar och dagar, antal rutintillfällen och vilka de är, om veckan är över kapaciteten (`over`) och om den
  har fler än 6 tillfällen (`manga`, den mjuka varningen i beslut 31). En dag är 8 h och kapaciteten är
  dagarna × 8 h. Modulen är fristående från DOM och testas med ett underlag som byggs i testet.
- **`DP.Balansering.balansera(underlag)`** väljer förskjutningar och rör inget annat (beslut 26 och 46).
  Underlaget bär därför två tillägg: `veckoraknare(freq, forskjutning)` (= `DP.Plan.veckorFor`) och `freq`
  per rond, så att modulen kan *pröva* ett annat läge utan att veta något om frekvenser – reglerna, bland
  dem beslut 41 om halvårsronder med startmånad, bor kvar i planeringen. Sökningen är greedy och
  deterministisk: byggnaderna placeras i byggnadsordning, varje val mäts mot **de redan placerade**
  (annars hade den första byggnaden flyttat för att komma undan byggnader som ännu inte valt plats), och
  måtten jämförs i ordningen lägsta topp → färst veckor över kapaciteten → färst veckor med fler än 6
  tillfällen → jämnast spridning. Vid lika utfall vinner den minsta förskjutningen. Varje prövat läge mäts
  **med nivå 3 tillämpad** (beslut 66), så att en fas som klumpar ihop arbetet före semestern inte ser jämn ut. I ett område man åker
  till prövas områdets vecka först och sedan veckorna efter den: första som ryms vinner (beslut 38).
  Räcker nivå 1 inte prövas enskilda rondserier (nivå 2). Svaret är rena data – `forskjutningar`,
  `rondForskjutningar`, `fore`/`efter`, `kvarstaende` och `forklaring` – och skrivs till planeringen av
  `DP.Plan.tillampaBalansering(resultat)` som **ett** historiksteg (beslut 36). Förklaringens `text`
  formuleras i modulen och inte i vyn: varför en byggnad hamnade där den hamnade vet bara den som
  valde, och raderna ska kunna läsas i ett test utan DOM (beslut 61).
- **Balanseringens tre frågor** ligger i det gemensamma tillståndet: `akerTill`, `kapacitet` (dagar per
  utförare) och `veckorUtan` (förval v. 28–31 och 52). Tomt betyder "inte besvarad", och
  `svarAkerTill()`/`svarKapacitet()`/`svarVeckorUtan()` ger förvalen – för veckorna går förvalet inte att
  läsa av listan, eftersom ett riktigt svar kan vara tomt, så `veckorUtanBesvarad` avgör.
  `omradenBesvarad`, `kapacitetBesvarad` och `veckorUtanBesvarad` är själva ställningstagandet – att bekräfta
  förvalet är ett svar, inte ett tomrum (beslut 37). `balanseringStatus()` svarar på vad som är besvarat,
  om balanseringen är gjord och vad den gav; `klar` kräver att den är gjord **och fortfarande stämmer**, och
  styr grön bock i processlinjen.
- **Planeringen har ändrats sedan balanseringen (beslut 40):** balanseringen sparar ett **sammandrag** av
  underlaget i `gem.balanserad.sammandrag` – per klar byggnad rondens frekvens, utförare och planerade tid,
  plus Balanseringens tre svar (`kapacitet`, `veckorUtan`, `akerTill`), alltså de **förutsättningar** den
  räknade på. Svaren hör dit lika mycket som ronderna: halveras en kapacitet räckte den balansering som
  gjordes inte längre, även om ingen rond rörts. Svaren tas som de *gäller* (`svarKapacitet()` m.fl.), så att
  bekräfta ett förval är ingen ändring (beslut 37). Veckorna är **inte** med: dem ändrar balanseringen själv,
  så en jämförelse mot dem hade sagt "ändrat" direkt efteråt. `planeringAndringar()` jämför sammandraget mot
  nuläget och svarar med en rad per ändring i klartext (`typ` `frekvens`, `utforare`, `tid`, `rond-ny`,
  `rond-bort`, `ej-klar`, `ny-klar`, `kapacitet`, `veckor-utan`, `omraden`, `bortstadad`) – texterna
  formuleras i planeringen och inte i vyn, av samma skäl som balanseringens egen förklaring (beslut 61).
  **Inget räknas om av sig själv**: förskjutningarna och det sparade resultatet ligger orörda tills planeraren
  trycker på *Balansera om*. `balanseringSammandrag(las, gem)` tar en tillståndsläsare och ett gemensamt
  tillstånd, eftersom sammandraget vid balanseringen måste tas av det som just skrivits – inuti `andraFlera()`
  ligger det i kopiorna och inte i historiken. Därför har ändringsobjektet `las(id)` vid sidan av
  `tillstand(id)`: att *läsa* en byggnad ska inte märka den som rörd av steget.
- **Bortstädat nivå 3-arbete redovisas för sig:** `rensaNiva3()` tar bort provisoriska flyttar och
  strykningar för tillfällen som inte längre finns, och **svarar nu med vad den tog bort**.
  `andra()`/`andraFlera()` bokför det i `gem.bortstadade` (bara när en balansering finns att redovisa mot).
  Att det ligger i det gemensamma tillståndet gör att det följer historiken: ångras frekvensändringen är
  flytten tillbaka, och beskedet med den. `balanseringStatus()` håller isär de två: `andringar` och `andrad`
  bär **förutsättningarna** och styr "balansera om?" och grön bock, medan `bortstadade` är ett eget besked i
  en egen ruta. En provisorisk flytt var aldrig något balanseringen räknade på, så den gör den inte
  inaktuell – ändras en frekvens fram och tillbaka igen är bocken tillbaka, men beskedet om att flytten
  försvann står kvar, för flytten är fortfarande borta.
- `info.flyttade` (byggnad → tillfällen som bytt vecka) räknas i `utokaInfo()` ur tillstånden före och
  efter, för **varje** rörd byggnad. Lyssnaren får bara den aktiva byggnadens tillstånd, och Balanseringens
  tidsaxel visar alla på en gång. Eftersom `ga()` går samma väg gäller det även ångra och gör om:
  brickorna animeras tillbaka av sig själva.
- `DP.Plan.prenumereraByte(fn(id))` – byte av byggnad: 3D-vyn byggs om, träd, flöde, tidsaxel och telefoner ritas om.

**Tillstånd per byggnad** (`planering.js`, `tomtTillstand`): `bas` (besöksfrekvens),
`forskjutning` (besöksrytmens förskjutning i veckor), `ronder`
(`id, freq, foljerBas, besvarad, utforare, forskjutning`), `kopplingar` (`atgard, inst, rond`; `inst` kan vara `'BYGGNAD'`
för generella åtgärder), `standardTexter`, `instTexter`, `tillfalleTexter`, `tider`
(rond → `{ dagsdel, godkand, forslagVidGodkandet, minuterVidGodkandet, arvd }` – de två mittersta är
förslaget som gällde när planeraren tog ställning, `arvd` att tiden kom med en kopiering),
`flyttade` (`'rond:ordinarieVecka'` → faktisk vecka) och `strukna` (samma nyckel → `'struken'` |
`'foreslagen'`).

**Byggnadsdata** (i tillståndet, se Dataflödet): `namn`, `typ`, `plan` (nedifrån och upp, `elev`), `rum`
(`nr`, `namn`, `plan`, `typ`, valfria `rumstyp`, `nta`, `ntv`, `bra`, `bta`, `temp`, `egna`, `hojd` och
`rect [x0,z0,x1,z1]`), `installationer` (signifikanta med
id/beteckning m.m. samt ej signifikanta), `stil` (tak platt/sadel, färger, fönster, dekor), `omrade`
(id i `DP.omraden` – beslut 28), `farg` (brickornas färg i Balanseringens tidsaxel, beslut 47)
och `inlasning` (det inlästa som ännu inte är avgjort, se Dataflödet: `plan`, `infordaPlan`,
`rum`, `infordaRum` och `fil`).
**Ett handritat rum bär `rect`, ett inläst inte**: dess plats räknas fram av
`DP.Planlosning.form()` ur byggnadstypens regel och rummens ordning (beslut 78), och skrivs aldrig
till tillståndet – formen är räknad och ska inte ligga där (beslut 71). Ett rum som läses in bär
`rumstyp` (id i `DP.rumstyper`) och `typ` är den kategori modellen färgar golvet efter.
3D-modellen räknas fram ur detta – en ny byggnad kräver bara en datafil. En byggnad planeraren skapar
själv får `stil` och `konstanter` ur `DP.byggnadstyper[typ]` (beslut 72) och tomma `plan`, `rum` och
`installationer`; modellen ritar då en tom tomt, och vyn säger att byggnaden inte har några plan ännu.

**Ett rum pekas ut med plan + rumsnummer** (beslut 76, biljett #33). Rumsnumret `nr` löper per plan
(`'001'`, `'002'` …) som i verkligheten, så det är **inte** unikt i byggnaden: rum 001 finns på varje
plan. Nyckeln är `DP.rumNyckel(planId, nr)` = `DP.rumBeteckning(r)` → `'01-001'`, och samma sträng är
det planeraren ser – det som pekar ut rummet och det som står i modellen är en och samma sak.
Installationernas `rum` och ett innerrums `iRum` bär **nyckeln**, inte numret, och alla rumsindex
(`viewer.rumIndex`, `ui.js`, `telefon.js`) är nycklade på den. `viewer.visaRum()` och `viewer.gaIn()`
tar nyckeln. Nycklas något om på numret ensamt pekar det tyst på det första rummet med det numret.
Sömmen bor i `data/hangar.js`, som laddas först och skapar `window.DP`.

Identiteten är **id:t och inte objektreferensen** (beslut 2). Tillståndet klonas vid varje historiksteg,
så samma installation är ett nytt objekt efter varje ändring och efter varje ångra: `viewer.objFor` är
nycklad på installations-id, och `DP.Plan.inst()` bygger om sitt index när byggnadsdatan bytts.

## Status

Etapp 1–5 är klara som första utkast (se `docs/koncept-och-beslut.md`). I etapp 5 är steg 5 (beslut 23),
steg 6, planerad tid med förslag, uträkning och ändrade förutsättningar (beslut 27, 35, 43 och 51–53),
processlinjen och ordlistan (beslut 54–55), förskjutningarna i planeringen (beslut 26, 41 och 56),
Balanseringens tidsaxel med belastning per utförare (beslut 28, 31, 33, 39 och 47) samt **Balansera** med
de två första frågorna, uträkningen, förklaringen i klartext och den kvarstående överbelastningen
(beslut 36, 37, 38 och 46), **veckor utan tillsyn och skötsel** med provisoriska flyttar, förslag att
stryka, *Stryk alla* och *behåll* (beslut 32, 45 och 64–66), **flytt för hand** med dra och släpp, frågan
om de tre nivåerna, beskedet om målveckans fyllnad, strykning för hand och de egna markeringarna för
permanent och provisoriskt (beslut 34, 67 och 68) samt **markeringen när planeringen ändrats sedan
balanseringen** med listan över ändringarna, redovisningen av bortstädat nivå 3-arbete och bocken som
följer om balanseringen fortfarande stämmer (beslut 40) byggda.
Standardplaneringen ger alla fyra byggnaderna grön bock i alla sex stegen, så de är klara för Balansering.
Skissen `flerbyggnad.html` är borttagen och **etapp 5 är avslutad** (beslut 49, biljett #19); det i skissen
som inte byggdes står som idé 10 i `docs/ideer-och-resonemang.md`. Utformningen är bestämd i beslut 23–49 i
beslutsdokumentet, och begreppen står i `GLOSSARY.md`.
**Nästa: etapp 6** – Utförande: markera ett rutintillfälle som utfört, registrera tid och jämföra med den
planerade tiden (beslut 30, idé 6 och 8).

**Grillat 2026-11-24: Byggnad som vägledd process** – skapa ny byggnad, läsa in plan, rum och installationer
från en inläsningsfil med tre flikar, ändra byggnad och utbyte av installationer (beslut 69–112). Prototypen
ligger på grenen `prototyp-inlasning` och är utvärderad (beslut 105–112). Specen är biljett #30
(`ready-for-human`); nästa steg är att skiva den med `to-tickets`. Första biljetten, **mediaspelaren på en
fast plats för alla huvudsteg** (beslut 82, biljett #31), är byggd: spelaren bor i `app/spelare.js` och
ritas högst upp i toppraden, så den syns i Byggnad, Planering och Balansering. Den egna knappen *Ångra
balanseringen* (beslut 63) är borttagen. Andra biljetten, **byggnaden som data i tillståndet** (beslut 71
och 73, biljett #32), är byggd: byggnadens namn, typ, område, färg, plan, rum och installationer ligger i
historikens ögonblicksbilder, ändras genom `DP.Plan.andraByggnad`, och ingen kod utanför `planering.js`
läser `DP.byggnader`. För planeraren ser allt ut som förut; sömmen är förberedelsen för hela
byggnadsflödet. Tredje biljetten, **den nya numreringen** (beslut 76, biljett #33), är byggd: alla fyra
byggnaderna har plan 01 … och rumsnummer 001 … som löper per plan, rummet visas som **01-001** i modellen,
trädet, informationskortet och telefonen, och rummet pekas ut med plan + rumsnummer i stället för med
numret ensamt (se Byggnadsdata ovan). Fjärde biljetten, **byggnadsflödet och steg 1** (beslut 69, 103 och
104, biljett #34), är byggd: huvudsteget Byggnad har en lodrät lista med fyra steg – *Byggnadstyp och namn
→ Plan → Rum → Installationer* – med samma form som Planeringens, en byggnadslista med status per byggnad
och **Skapa ny byggnad**. Steg 1 väljer typ (de tre som har tabeller), namn (unikt, med besked medan man
skriver), område och en färg systemet tar; typen är låst efteråt. Skapandet är ett steg i historiken, och
ångra förbi det tar bort byggnaden. Femte biljetten, **steget Plan för hand och skalet i modellen**
(beslut 84, 85, 105, 106 och 111, biljett #35), är byggd: planeraren lägger till plan med beteckning och
benämning, ordningen nedifrån och upp föreslås ur dem (källare underst, vind överst) och går att dra om
med en **linje** som visar var planet hamnar innan hon släpper. Ett plan utan benämning får ett förslag,
och varje tillägg, drag, omdöpning och borttagning är ett steg i historiken. Den nya modulen
`app/planlosning.js` räknar byggnadens form utan DOM: ett plan utan rum blir ett **skal** i
byggnadstypens standardstorlek, entréplanet ligger på marken och planen under nedåt – så med fel ordning
ligger källaren överst i skalet, vilket gör förslaget självklart. Verktygsfältets knappar som inte har
något att visa är utgråade i stället för borttagna.
Sjätte biljetten, **inläsningsfilen med fliken Plan** (beslut 70, 83, 89, 105, 109 och 112, biljett #36),
är byggd: planeraren tar ut en Excel-fil med flikarna Plan, Rum och Installationer – tom eller ifylld med
det som redan är inläst – fyller i den i Excel eller Numbers och läser in den igen. Den nya modulen
`app/inlasning.js` tolkar filen utan DOM: flikarna känns igen på **kolumnrubrikerna** (inte på bladets
namn), rubrikraden hittas under tabellrubriker och tomma rader som Numbers lämnar, okända kolumner blir
**egna fält** som följer med ut igen, och varje rad blir *klar*, *förslag* eller *oplacerad* med skälet i
klartext ("Planet P1 saknar benämning – föreslås bli Plan P1."). `app/inlasningsfil.js` är sömmen mot
.xlsx (SheetJS i `vendor/`). Steget Plan visar de tre grupperna med förslag och oplacerat **fast överst**
medan planlistan rullas, *Godta alla* är ett steg i historiken, och steget blir grönt först när bara
klart återstår. Filen går tur och retur utan skillnad.
Sjunde biljetten, **steget Rum och rummen i modellen** (beslut 76–80, 99, 108, 110 och 111,
biljett #37), är byggd: planeraren fyller i fliken Rum med plan, rumsnummer, benämning, NTA, NTV,
BRA, BTA och Temperaturreglerad, och läser in den. Plan och rumsnummer matchas **förlåtande** ("P2"
→ plan 02, "1" → 001), **rumstypen läses ur benämningen** ur den nya tabellen `data/rumstyper.js`
(Korridor, Korr., Trapphus, WC/D, Logement, Sovsal, Kök, Fikarum …) och en okänd benämning blir
förslaget *Övrigt rum* som byts med ett klick på rummets rad. **NTA krävs** och en saknad NTA
föreslås bli rumstypens standardvärde; **NTV ger rumshöjden** NTV ÷ NTA, så ett fläktrum blir högt
utan att någon mäter det. Rummen läggs ut i modellen enligt byggnadstypens regel
(`DP.Planlosning.laggUtRum`): i en kasern en korridor längs byggnaden med rummen på båda sidor i
nummerordning **medurs**, bredden ur NTA. Steget visar rummen per plan med areasummor, och ett plan
blir skal igen om dess rum tas bort. Steg 4 syns med sitt läge men är tomt tills det byggs.
Åttonde biljetten, **rummen dras på plats, ordnas om och läggs till för hand** (beslut 78, 106 och
110, biljett #38), är byggd: planeraren drar en rumsrad för att ändra ordningen på ett plan – och
ordningen *är* placeringen, så rummet byter grannar i modellen – eller drar rummet till ett annat
plan, där det får nästa lediga nummer om numret är upptaget och tar sina installationer med sig.
En **linje** visar var rummet hamnar innan hon släpper, som i steg 2, och ett plan utan rum märks i
stället som mål: där finns ingen rad att lägga en linje på. Ett **oplacerat** inläst rum dras till
ett plan vid sidan av knapparna på raden – båda vägarna går genom `svaraRum`, så nummerkrocken prövas
likadant. *Lägg till rum* ger ett rum med samma förslag som inläsningen: rumstypen läst ur
benämningen och NTA ur rumstypen, med nyckeln och typen visade innan rummet finns.
Nionde biljetten, **steget Installationer och vägen vidare till Planering** (beslut 81,
86, 87, 88, 94 och 109, biljett #39), är byggd: planeraren fyller i fliken Installationer med
plan, rumsnummer, benämning, beteckning, fabrikat, modell, Id, externt id och
installationsdatum, och läser in den. **En installation behöver bara plan och rumsnummer**
för att hamna i rätt rum; saknas planet och numret finns på ett enda plan blir det ett
förslag, och på flera plan oplacerat. **Installationstypen läses ur benämningen** ur den nya
tabellen `data/installationstyper.js` (Handbrandsläckare 3, Handbr.släckare 3, BLC 1, HC01) –
och en okänd typ får **inget förslag** utan måste väljas ur listan innan steget blir grönt:
typen avgör vilka åtgärder som går att koppla, så en gissning hade gett en installation som
ingen tillsyn hittar. Ett tomt Id får ett id från systemet. Installationerna går att dra
mellan rum (kopplingarna följer med – det är samma installation), byta typ på och ta bort
(kopplingarna försvinner i samma steg), och att lägga till för hand med samma förslag som
inläsningen. **Övriga installationer** – belysning, brytare, uttag, rökdetektor och sanitet i
ett WC – genereras ur rumstyperna av planlösningen och ligger aldrig i tillståndet. Platsen i
rummet räknas fram ur rummets rektangel: jämnt fördelade längs väggen mot korridoren, de
golvstående en bit in. Med alla fyra stegen gröna står byggnaden som **Klar för Planering**,
och där möter den befintliga snabbstarten med byggnadstypens standardplanering – ingen
planering skapas av sig själv.
Tionde biljetten, **areorna per plan och byggnad** (beslut 79, biljett #40), är byggd: steg 3
visar NTA, BRA och BTA både per plan och för hela byggnaden. NTA är alltid rummens summa. BRA
och BTA summeras ur rummen när alla rum har dem – då är talet fastighetssystemets och står
omärkt – och räknas annars fram ur modellen och märks ***beräknad***, med en rad under talen
som säger vad ordet betyder. Uträkningen ligger i `DP.Planlosning.areor()` och går att pröva
utan DOM: BRA är planets omslutande rektangel – rummens rektanglar har NTA som yta och ligger
kant i kant – och BTA samma rektangel utökad en halv väggtjocklek runt om, eftersom ytterväggen
ritas centrerad på rummets kant. Märkningen är per plan, så planeraren ser vilket plan som är
systemets tal.
Elfte biljetten, **Ändra byggnad: flytta, ta bort och byta namn** (beslut 100, 101 och 103,
biljett #41), är byggd: samma fyra steg öppnar en befintlig byggnad. En installation går att
**flytta** mellan rum med kopplingar och avvikande texter i behåll – det är samma installation,
så tillsynen är densamma – och att **ta bort**, varvid kopplingarna försvinner i samma steg och
steg 6 får ett nytt tidsförslag som markeras som ändrad förutsättning utan att räknas om.
Byggnadens **namn** byts i steg 1 med samma unikhetskontroll som när den skapades, och
rutintillfällena byter namn med den i tidsaxeln och i telefonen. **Ta bort byggnad** tar
planeringen med sig som ett steg i historiken; var byggnaden med i en balansering säger
Balansering att planeringen har ändrats, och ett ångra tar tillbaka byggnaden, planeringen och
bocken. Den sista byggnaden går inte att ta bort. Ett **handritat** plan där rummen ändrats
varnar nu i klartext i stället för att bara upplysa, och *Rita om planet* lägger om hela planet
enligt byggnadstypens regel efter en fråga som säger vad den gör – bara det planet, grannarna
står kvar som de är ritade.
Tolfte biljetten, **läsa in filen mot en befintlig byggnad** (beslut 86, biljett #42), är byggd:
en ombyggnad förs in på samma sätt som en ny byggnad. Planeraren tar ut filen för en byggnad som
finns, ändrar den och läser in den igen – och inläsningen visar **skillnaden** i tre grupper:
*Nytt* som förut, *Ändrat* med före och efter per fält ("Benämning ~~Korridor~~ → Dagrum,
NTA ~~42~~ → 49"), och *Saknas i filen* för det som finns i byggnaden men inte i filen. Plan och
rum matchas på beteckningen, installationer på Id, så en installation som flyttat till ett annat
rum i filen är samma installation med sin tillsyn i behåll. **Ingenting tas bort förrän förslaget
godtas** – en rad som fattas kan vara glömd lika väl som borttagen – och *Låt stå* är det andra
svaret, också det ett steg i historiken. Ett godtaget förslag att ta bort river kopplingarna i
samma steg, precis som knappen *Ta bort*. En fil som tas ut och läses in oförändrad ger inga
förslag alls, och ett fält byggnaden *saknar* räknas som en lucka filen fyller i och inte som en
ändring: det är så de handritade byggnaderna kan få sina rumstyper och areor. Utbytet via fil
(beslut 93) hör till nästa biljett i spåret.

Kända begränsningar:
- Installationernas plats **i** rummet är schematisk: de fördelas jämnt längs väggen mot korridoren,
  eftersom filen inte säger var i rummet apparaten sitter. Planeraren ska kunna se *att* rummet har
  tre handbrandsläckare och klicka på dem, inte var de hänger.
- Draget av ett **oplacerat** rum rullar inte listan av sig självt: ligger målplanet utanför den
  synliga ytan måste planeraren rulla dit först, eller använda knapparna på raden – de gör samma sak
  och går oavsett var i listan planet står.
- Ett rum som läggs till eller dras om i en **handritad** byggnad (Garage, Kasern 1 och 2, Hangar)
  får sin plats ur byggnadstypens regel medan grannarna behåller sina ritade rektanglar (beslut 101),
  så rummen kan hamna över varandra i modellen. Steg 3 varnar då och erbjuder *Rita om planet*
  (biljett #41), som lägger om hela planet enligt regeln. Varningen är ett besked och ingen spärr:
  planeraren kan låta planet stå blandat, och modellen är då fel på det sätt varningen beskriver.
- Den **beräknade** arean uteblir på ett plan där modellens rektangel inte täcker rummens NTA
  (beslut 79). Korridorsregeln ger korridoren remsan mellan rumsraderna, och den är sällan lika
  stor som korridorens NTA – ett BRA under NTA är geometriskt omöjligt, så uträkningen avstår och
  visar ett streck. Det slår på just kasernens korridorsplan. Modellens egen brist är biljett #48.
- Byggnadstypernas planlösningsregel finns för de tre typer som har tabeller (Garage, Kasern,
  Hangar). De fyra nya typerna i beslut 72 är inte inlagda ännu.
- Ett **utbyte via fil** – samma Id med senare installationsdatum (beslut 93) – känns inte igen ännu:
  raden blir ett vanligt förslag om *ändring* av samma version. Det byggs i biljetten om Utbyte.
- Ett förslag att ta bort uppstår bara när filens flik bär **minst en** av byggnadens egna rader
  (beslut 86). En fil som bara har nya rader är ett tillägg, och en fil som bara har Plan-fliken säger
  ingenting om rummen. Regeln gissar mot att något tas bort, så en fil där planeraren råkat byta ut
  *alla* rumsnummer ger inget förslag om de gamla – de står kvar och tas bort för hand.
- **Utbytta versioner finns inte ännu** (beslut 91–97): en installations apparat går att ta bort och
  lägga till på nytt, men inte att *ersätta* så att den gamla blir en version med id:t och tillägget :1.
  Det byggs i sin egen biljett, och filen tas redan ut med bara nuvarande versioner (beslut 96).
- En .numbers-fil går inte att läsa direkt – mini-bygget av SheetJS läser .xlsx. Planeraren exporterar
  till .xlsx i Numbers först.
- Byggnadens **område och färg** går bara att sätta när byggnaden skapas. Namnet går att byta i
  steg 1 (biljett #41), men området och färgen är inte byggda där ännu.
- Flytt för hand går bara att göra i **Balanseringens** tidsaxel. Planeringens tidsaxel visar
  resultatet – de förskjutna veckorna och de provisoriska flyttarna – men går inte att dra i.
- Balanseringens sökning är greedy per byggnad i byggnadsordning, inte uttömmande: den hittar ett bra läge,
  inte bevisat det bästa. Valet är deterministiskt, så samma underlag ger alltid samma resultat.
- Planeringen lever bara i minnet och nollställs vid omladdning. Det är ett medvetet beslut, men det betyder
  att ett balanserat år inte går att spara eller skicka vidare.
- Planeringsåret är fast (2027) och inte rullande från dagens vecka. Det är fortfarande en öppen fråga
  i `docs/koncept-och-beslut.md`, och skissens svar står som idé 10 E.

## Agent skills

### Issue tracker

Biljetter ligger som GitHub Issues i `andreassilverbris/Driftplanering` (MCP-verktyg i molnet, `gh` lokalt). See `docs/agents/issue-tracker.md`.

### Triage labels

Standardetiketterna: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, plus en spåretikett per serie för Ralph-loopen (t.ex. `etapp-5`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` i roten. ADR:er finns inte; de numrerade besluten i `docs/koncept-och-beslut.md` används i stället. See `docs/agents/domain.md`.
