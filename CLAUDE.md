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
| `data/katalog.js` | Fler typer/åtgärder, `DP.byggnadstyper` (standardplanering), `DP.omraden`, `DP.genereraOvriga()` |
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
| `app/balansering.js` | `DP.Balansering`: balanseringens uträkningar utan DOM. Belastning per utförare och vecka, och `balansera()` som väljer förskjutningar och formulerar förklaringen i klartext |
| `app/vyer.js` | `DP.Vyer`: processlinjen Byggnad → Planering → Balansering, Balanseringens frågor, knappen Balansera, förklaringen, tidsaxeln och ordlistan |

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

**Byggnadsdata:** `plan` (nedifrån och upp, `elev`), `rum` (`nr`, `namn`, `plan`, `typ`, `rect [x0,z0,x1,z1]`,
valfri `hojd`), `installationer` (signifikanta med id/beteckning m.m. samt ej signifikanta), `stil`
(tak platt/sadel, färger, fönster, dekor), `omrade` (id i `DP.omraden` – beslut 28) och `farg`
(brickornas färg i Balanseringens tidsaxel, beslut 47). 3D-modellen räknas fram ur detta – en ny
byggnad kräver bara en datafil.

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
(`ready-for-human`); nästa steg är att skiva den med `to-tickets`. Mediaspelaren på en fast plats för alla
huvudsteg (beslut 82) kan bli första biljetten.

Kända begränsningar:
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
