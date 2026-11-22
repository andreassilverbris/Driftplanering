# Driftplanering – koncept och beslut

Underlag för att skiva biljetter. Uppdateras när beslut fattas.

## Syfte

Ett interaktivt utbildningsverktyg där en driftplanerare förstår hur tillsyn och skötsel planeras:
byggnad → installationer → åtgärder → ronder → rutintillfällen. Tre vyer hänger ihop:
**byggnaden** (var), **tidsaxeln** (när) och **telefonen** (vad teknikern ser).

Avgränsning tills vidare: myndighetsbesiktningar, radon och planerat underhåll ingår inte.
En installation som besiktigas har ändå tillsyn och skötsel. Citrix, API och kommersiella
frågor parkeras.

## Begrepp

Begreppen står i [`GLOSSARY.md`](../GLOSSARY.md) i roten av repot.

## Beslut

1. **Rumsnumrering:** plansiffra + löpnummer (`2010` = plan 02, rum 010). Plan och rum är separata objekt.
2. **Installations-id:** 8 siffror (`00000089`). Externt id har formatet `L123456` och kan saknas.
3. **Jordfelsbrytare** i central eller apparatskåp är inte signifikanta (lätta att hitta) men visas som innehåll i centralen. Enskilt placerade jordfelsbrytare är signifikanta.
4. **Navigering:** orbit runt byggnadens mitt med låst vertikal vinkel (aldrig upp och ner). Tre lägen: översikt, uppifrån, inne i rum (stå i ögonhöjd och se dig om).
5. **Leverans:** statisk webbsida utan server och utan externa beroenden (three.js ligger i `vendor/`). Fungerar direkt från filsystemet.
6. **Ångra och gör om:** alla handlingar sparas som kommandon, så att man kan stega bakåt och framåt.
7. **Skärm:** 1920×1200 utan scroll i huvudvyn.

8. **Frekvens i veckor** (förslag A nedan) – bekräftat.
9. **Utföraren sätts på ronden** (förslag B nedan) – bekräftat. Det ska vara lätt att byta utförare,
   t.ex. när någon slutar eller är långtidssjuk: steg 4 har ett verktyg som flyttar alla ronder från en
   utförare till en annan i ett steg.
10. **Industriportar, utrymningsstegar och huvud-/gruppcentraler är signifikanta** – bekräftat.
11. **Åtgärder kopplas till ronden**, inte till ett enskilt rutintillfälle. Att tömma ett rutintillfälle
    (högerklick i telefonvyn) tömmer därför ronden, alltså alla dess rutintillfällen.
12. **Samma åtgärd delas inte upp på flera ronder.** Om man svarar Nej på "samma tillfälle" visas en förklaring
    i stället för att det går att genomföra.
13. **Åtgärdstexter i tre nivåer** (förslag C) – byggt. En text sparas bara på en nivå om den faktiskt
    skiljer sig från nivån ovanför. Avvikelser tas bort när kopplingen tas bort. Ändringar gäller sessionen
    och nollställs när sidan laddas om.
14. **Ändring i telefonen → "I alla rutintillfällen"** betyder alla rutintillfällen för just den installationen
    (installationsnivån). Ändring av standardtexten görs i bruttolistan.
15. **Typbyggnader:** Garage, Kasern 1, Kasern 2 och Hangar. Skola och bostadshus är strukna.
    Garaget är startbyggnad (man ska börja lära sig på något enkelt).
16. **Garageportarna är signifikanta** – det är avgörande att de går att öppna. Åtgärd: *Kontroll garageport*
    (föreslagen rond Byggnad utvändigt). Signifikant i garaget: HB01, PORT01, PORT02.
17. **Kasern 2 skiljer sig med flit från Kasern 1** (inbyggd hiss HISS01, en tvättmaskin mindre) så att det
    syns vad som behöver justeras efter kopiering.
18. **Planering per byggnad, gemensam historik.** Varje byggnad har egen planering. Ångra/gör om fungerar över
    byggnaderna och växlar automatiskt till den byggnad steget gällde.
19. **Kopiering av planering** erbjuds bara mellan byggnader av samma typ. Installationer matchas på typ och
    beteckning.
20. **Planeringsåret är fast satt till 2027** (öppen fråga om det ska vara rullande).
21. **Biljetter som GitHub Issues** i `andreassilverbris/Driftplanering`, med standardetiketterna för triage
    (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Biljetterna skrivs på svenska.
    Inställningarna för Matt Pococks skills finns i `docs/agents/`.
22. **Matt Pococks skills installeras globalt på användarens Mac**, inte i repot, så att varje skill bara
    finns en gång. Uppdateras med `npx skills update -g`. Molnsessioner har därför inga skills.

Beslut 23–29 togs i grillningen inför etapp 5 (2026-11-22):

23. **Steg 5 är klart** när alla signifikanta installationer har minst en kopplad åtgärd och båda de generella
    åtgärderna (Kontroll byggnad invändigt och utvändigt) är kopplade – byggt. Tidigare kunde steget aldrig bli
    klart. Statusen räknar upp luckorna i klartext ("2 installationer och Kontroll byggnad utvändigt saknas"),
    och bocken följer planeringen även vid ångra och gör om.
24. **Tre huvudsteg i en processlinje, inga flikar:** 1 Byggnad (förstå byggnaden, senare läsa in den) →
    2 Planering (en byggnad i taget, stegen i frågeflödet) → 3 Balansering (alla byggnader för utförarnas skull).
    Begrepp är inget steg utan en ordlista som alltid går att öppna. I Balansering tar tidsaxeln över ytan där
    3D-modellen ligger.
25. **Rutintillfället är fortfarande byggnad × rond × utförare × vecka.** Rutintillfällen som spänner över flera
    byggnader byggs inte. Balanseringen kan i stället lägga samma rond i flera byggnader samma vecka, och
    telefonen kan visa dem grupperade.
26. **Balanseringen ändrar aldrig frekvenser, bara när tillfällena ligger**, i tre nivåer:
    (1) förskjuta en byggnads besöksrytm, (2) förskjuta en rondserie (båda permanenta) och
    (3) flytta ett enskilt rutintillfälle provisoriskt eller stryka det. Den automatiska balanseringen
    arbetar på nivå 1 och vid behov nivå 2.
27. **Planerad tid sätts per rond och byggnad (= per rutintillfälle) i dagsdelar**: kort (≈1 h), kvartsdag,
    halvdag, heldag. Systemet föreslår ett startvärde från antalet kopplade installationer och åtgärdernas
    tyngd (lätt/normal/tung) och visar uträkningen. Ändras åtgärderna i ronden markeras tiden med ett nytt
    förslag. Över en heldag föreslås att ronden delas. Tiden justeras aldrig automatiskt; planeraren tar ett
    aktivt beslut.
28. **Närhet anges med områden.** Varje byggnad tillhör ett område. Balanseringen frågar vilka områden man
    måste åka till och samlar besöken där i samma vecka. Garage, Kasern 1 och Kasern 2 ligger på Kasernområdet;
    Hangaren ligger på Flygfältet, dit man åker.
29. **Nedlagd tid och öppna rutintillfällen ingår inte i etapp 5** (se idé 6 i `ideer-och-resonemang.md`).
30. **Bara planerad tid byggs i etapp 5.** Utfallet och jämförelsen med planerad tid byggs i etapp 6 (Utförande),
    så att prototypen till slut visar hela kretsloppet.
31. **Kapacitet räknas i tid.** Varje utförare har ett antal dagar per vecka för tillsyn och skötsel (standard 3 av 5).
    En vecka är full när dagsdelarna når kapaciteten. En mjuk varning visas när en utförare har fler än
    6 rutintillfällen en vecka (två per dag), även om tiden räcker.
32. **Veckor utan tillsyn och skötsel** (förvalt v. 28–31 och v. 52): tillfällen som hamnar där flyttas automatiskt
    provisoriskt till veckan före. Ligger flytten nära nästa ordinarie tillfälle föreslås att tillfället stryks.
33. **Tidsaxeln i Balansering har en rad per utförare** och en kolumn per vecka för hela året. Cellen visar hur
    full veckan är mot kapaciteten, och brickorna har byggnadens färg. En utförare kan fällas ut till en rad per
    byggnad. Utseendet prövas och justeras vid behov.
34. **Flytt för hand: dra och släpp och svara på en fråga** – bara denna gång (provisoriskt), hela rondserien
    eller hela byggnadens besöksrytm. Senaste valet är förvalt. Målveckans fyllnad syns medan man drar. Varje flytt
    är ett steg i historiken.
35. **Planerad tid sätts i ett nytt steg 6 i Planering** ("Hur lång tid tar ronderna?"), förifyllt med systemets
    förslag och uträkning. Steget blir klart när förslagen är godkända eller ändrade. Standardplaneringen fyller i det.
36. **Den automatiska balanseringen är ett steg i historiken** och följs av en förklaring i klartext om vad som
    flyttades och varför. Brickorna animeras till sina nya veckor.
37. **Balansering ställer tre frågor, alla med förval:** (1) vilka områden man måste åka till (Flygfältet),
    (2) hur många dagar i veckan varje utförare har för tillsyn och skötsel (3), (3) vilka veckor som saknar
    tillsyn och skötsel (v. 28–31, v. 52). Sedan kommer knappen Balansera. Stegen får grön bock som i Planering.
38. **Inom ett område sprids byggnaderna** för jämn belastning. **I ett område man åker till samlas byggnaderna**
    i samma vecka så långt kapaciteten räcker, annars i veckorna efter varandra. Att samla inom ett område görs för hand.
39. **Bara byggnader med klar planering** (alla sex stegen) ingår i balanseringen. Övriga visas gråade med en länk
    till Planering. Det finns en snabbknapp för att ge standardplanering åt alla byggnader som saknar planering.
40. **Förskjutningarna från balanseringen ligger kvar när planeringen ändras.** Steget Balansering markeras då med
    "Planeringen har ändrats sedan du balanserade – balansera om?" och en lista över ändringarna. Inget räknas om
    automatiskt. Provisoriska flyttar för tillfällen som inte längre finns tas bort och redovisas.
41. **Halvårsronder med vald startmånad** får flyttas inom månaden men inte till en annan månad.
42. **Steg 1 Byggnad får ingen grön bock** i etapp 5; det är till för att orientera sig. Senare kan det få egna
    vägledande processer (ändra en byggnad, läsa in en ny), se idé 4.
43. **Tidsschablonen ligger som data, inte i koden:** tyngd per åtgärd, minuter per tyngd, minuter för de generella
    åtgärderna och gränserna för dagsdelarna ligger i en egen datafil. Senare kan en åtgärd få ett eget
    erfarenhetsvärde från verklig statistik som ersätter tyngden (idé 7), utan att koden ändras.
    Startvärden: lätt 3 min/st, normal 15 min/st, tung 45 min/st, Kontroll byggnad invändigt 2 min per rum,
    utvändigt 30 min. Avrundning: ≤ 1 h kort, ≤ 2 h kvartsdag, ≤ 4 h halvdag, ≤ 8 h heldag.
44. **Schablonens resultat godtas för konceptet.** Med standardplaneringen blir Byggnad invändigt en heldag i
    kasernerna (65 rum) och en halvdag i hangaren (31 rum). Anna får 8 tillfällen i vecka 1 och över 3 dagar varje
    kvartal, och det är övningsexemplet för balanseringen.
45. **Ett tillfälle föreslås strykas** när det efter en provisorisk flytt hamnar högst en vecka från ett annat
    tillfälle i samma rondserie. Balanseringens förklaring visar hur många som föreslås strykas, med knappen
    *Stryk alla* och möjlighet att behålla enskilda.
46. **Balanseringen byter aldrig utförare och ändrar aldrig kapacitet.** Räcker kapaciteten inte säger den vilka
    utförare och veckor som är överbelastade och länkar till kapacitetsfrågan och till Planering steg 4.
47. **Färg:** Planeringens tidsaxel visar rutintillfällen i utförarens färg, Balansering i byggnadens färg
    (raderna är redan utförare).
48. **Telefonen ändras inte i etapp 5.** Gruppering av veckans rutintillfällen hör till idé 8 och etapp 6.
49. **`flerbyggnad.html` tas bort** när Balansering är byggd. Det i skissen som inte byggs skrivs ner först.
50. **Ralph-loopen (`ralph/`) tar `ready-for-agent`-biljetter obevakat**, en per varv med en färsk agent, portad
    från photo_manager (2026-11-22). Den arbetar **på en arbetsgren och vägrar starta på `main`**. Den pushar bara
    till grenen, och Andreas för in grenen i `main` via pull request när han har tittat. Varje pass kräver ett
    **spår**, en etikett utöver `ready-for-agent` (till exempel `etapp-5`), och inom spåret bestämmer blockerarna
    ordningen. Loopen **stänger biljetten** när granskningen är gjord, hela sviten är grön, den fristående filen är
    byggd och committen är pushad. Fynd utanför biljetten blir egna `needs-triage`-biljetter, aldrig
    `ready-for-agent`. Arbetsordningen står i `.claude/commands/biljett.md` och hur loopen körs i `ralph/DESIGN.md`.
51. **Ändrade förutsättningar mäts i minuter, inte bara i dagsdel** (biljett #11). Dagsdelen är det planeraren
    beslutat, men den är grov: Kasern 1 och Kasern 2 har båda heldag för Byggnad invändigt trots 310 mot 340
    minuter. Gick jämförelsen bara på dagsdelen skulle en kopiering mellan kasernerna aldrig märkas, och
    Kasern 2 ärva en tid som inte stämmer. Markeringen sätts därför när dagsdelen ändras **eller** minuterna
    flyttat sig tillräckligt. Hur mycket som krävs beror på var tiden kommer ifrån:
    - **Planeraren har själv tagit ställning till byggnaden:** tröskeln är **30 minuter**, fast och lika för
      alla ronder, eftersom det är den absoluta tiden planeraren känner igen. En enstaka lätt installation
      (3 min) är ingen ändrad förutsättning, och en markering som kommer för ofta lär planeraren att
      strunta i den.
    - **Tiden är ärvd genom kopiering:** **varje** avvikelse märks. Ingen har räknat på den här byggnaden,
      så skillnaden är osedd oavsett storlek. Kasern 2:s Byggnad invändigt blir 295 min mot Kasern 1:s
      ärvda 310 direkt efter kopieringen, och det ska synas. Tar planeraren ställning blir tiden hens egen
      och mäts därefter med 30-minuterströskeln.
52. **Planeraren kommer ur markeringen på två vägar** (biljett #11): *använd det nya förslaget* eller
    *behåll min tid*. Den senare rör inte dagsdelen men räknas som ett nytt ställningstagande, så markeringen
    försvinner. Båda är steg i historiken och går att ångra. Står dagsdelen still och bara minuterna har
    ändrats erbjuds bara *behåll*, eftersom det inte finns någon annan dagsdel att byta till.
53. **Standardplaneringen och kopieringen fyller i steg 6** (biljett #11, berättelse 22 och 23). Standard-
    planeringen godkänner sina egna förslag, så alla sex stegen är besvarade direkt för var och en av de fyra
    byggnaderna, och ingen standardrond blir mer än en heldag. Kopieringen tar med tiderna och källans förslag,
    märkta som ärvda, så att målbyggnadens egna förutsättningar ger markeringen enligt beslut 51 i stället för
    en tyst ärvd tid. Markeringen säger då varifrån tiden kommer ("där tog ronden 5,2 h, här tar den 5,7 h"),
    eftersom en oförändrad dagsdel annars inte förklarar varför ett ställningstagande behövs.

## Förslag (bekräftade)

### A. Planera alltid i veckor (fråga 2.1)

Frekvens = **rullande intervall i veckor + startvecka**. Tidsaxeln kan sedan visa resultatet per vecka,
månad eller år. Intervallet räknas löpande över årsskiften, så det spelar ingen roll om ett år har 52
eller 53 veckor eller om en månad har 4 eller 5 veckor.

| Val i gränssnittet | Intervall | Ca per år |
|---|---|---|
| Varje vecka | 1 v | 52 |
| Varannan vecka | 2 v | 26 |
| Varje månad | 4 v | 13 |
| Varannan månad | 8 v | 6–7 |
| Varje kvartal | 13 v | 4 |
| Varje halvår | 26 v | 2 |
| Varje år | 52 v | 1 |

Det pris man betalar är att "varje månad" blir 13 gånger per år och glider i förhållande till kalendermånaden.
Pedagogiskt kan det visas öppet: *"Varje månad = var 4:e vecka (13 ggr/år)"*.
Alternativet "N gånger per år, jämnt fördelat" ger 12 tillfällen men ojämna intervall på 4 eller 5 veckor,
vilket är just det som skapar buggarna i dag.

### B. Utföraren sätts på ronden (fråga 2.2)

I gränssnittet besvarar man **en** fråga per byggnad och rond: *"Vem går ronden Brandskydd i Hangaren?"*.
Alla åtgärder i ronden ärver utföraren, och under huven skrivs den till varje åtgärd så att det motsvarar
fastighetssystemets datamodell. Varje utförare har en färg och en avatar, och rutintillfällen visas i
utförarens färg i planeringens tidsaxel. I Balansering, där raderna redan är utförare, används byggnadens färg
(beslut 47). Om en enskild åtgärd har en annan utförare än ronden
markeras den med samma typ av symbol som en avvikande åtgärdstext.

### C. Åtgärdstext i tre nivåer

1. Standard (bruttolistan)
2. Avvikande för en installation
3. Avvikande i ett enskilt rutintillfälle

Den mest specifika nivån vinner. Avvikelser markeras med en symbol. Jämförelsen visar versionerna sida vid sida
och byggs så att man senare kan välja version.

## Etapper

1. **Byggnaden** *(första utkast klart)*: data för hangaren, 3D-vy, lager, plan, gå in i rum, klick på signifikanta installationer, bruttolista med åtgärdstexter, grön blinkning genom väggar.
2. **Planeringsflödet** *(första utkast klart)*: fem steg (besöksfrekvens → ronder → frekvens per rond → utförare → koppla åtgärder), tidsaxel för 2027, Lägg till/Ta bort med guide (alla/vissa, rond, samma tillfälle), animering till tidsaxel och modell, telefonvyer med lista och detalj, högerklick för att tömma, gröna installationer, ångra/gör om för allt.
3. **Åtgärdstexter** *(första utkast klart)*: redigering i tre nivåer (bruttolistan, informationskortet i modellen, telefonens detaljvy), symbolen ✎ för avvikelser i modell, tidsaxel, telefon och bruttolista, konfliktfrågor med kryssruta för att skriva över, jämförelse sida vid sida (förberedd för att välja version via `onValj`), animering som vid Lägg till, ångra/gör om.
4. **Fler typbyggnader** *(första utkast klart)*: skola och bostadshus ströks. I stället finns **Garage**
   (enklaste byggnaden, startbyggnad), **Kasern 1 och 2** (klassisk stil, nästan likadana) och **Hangar**.
   Varje byggnad har sin egen planering, och historiken är gemensam (ångra byter till rätt byggnad).
   Nytt: **standardplanering per byggnadstyp** och **kopiera planering** mellan byggnader av samma typ.
   Se `ideer-och-resonemang.md`.
5. **Flera byggnader:** belastning per utförare, provisoriska flyttar, stryka tillfällen *(skiss finns i `flerbyggnad.html`)*.
   Krav från användaren:
   - I fastighetssystemet väljer man en eller flera byggnader och ser en tidsaxel med en rad per rond och byggnad.
     Det blir svåröverskådligt när man vill se hur många byggnader ska besökas i förhållande till varandra.
     Målet är ett **okomplicerat** gränssnitt där det är **lätt att ändra** planeringen.
   - Att planera en byggnad är enkelt; det svåra är att **balansera** många byggnader.
   - Systemet har både **permanenta** ändringar (planen) och **provisoriska** flyttar (t.ex. när en vecka blir för
     full eller en resurs inte är tillgänglig). Provisoriska flyttar måste vara enkla att göra.
   - Flyttas ett rutintillfälle nära nästa ordinarie tillfälle ska man kunna **stryka** det i stället
     (efter en förenklad riskanalys) och slippa två ronder i följd.
   - Etapp 5 ska använda den riktiga planeringen från Garage, Kasern 1, Kasern 2 och Hangar (inte påhittade data).
     Två kaserner finns just för att kunna öva på detta.
   - **Utformningen är bestämd i beslut 23–49** (grillning 2026-11-22): huvudsteget Balansering, planerad tid i
     ett nytt steg 6 i Planering, områden, kapacitet och veckor utan tillsyn och skötsel.
6. **Utförande:** markera ett rutintillfälle som utfört, registrera tid (på sikt flera arbetspass, idé 6) och jämför
   med planerad tid, så att planeraren kan ta ett aktivt beslut om att justera.
7. **(Senare)** adapterlager mot riktigt API.

## Öppna frågor

- Ska en rond kunna ha en annan utförare för en enskild åtgärd? (Inte byggt – utföraren gäller hela ronden.)
- Ska planeringsåret vara fast (2027) eller rullande från dagens vecka?
