# Driftplanering – koncept och beslut

Underlag för att skiva biljetter. Uppdateras när beslut fattas.

## Syfte

Ett interaktivt utbildningsverktyg där en driftplanerare förstår hur tillsyn och skötsel planeras:
byggnad → installationer → åtgärder → ronder → rutintillfällen. Tre vyer hänger ihop:
**byggnaden** (var), **tidsaxeln** (när) och **telefonen** (vad teknikern ser).

Avgränsning tills vidare: myndighetsbesiktningar, radon och planerat underhåll ingår inte.
En installation som besiktigas har ändå tillsyn och skötsel. Citrix, API och kommersiella
frågor parkeras.

**Grundhållning: enkelt från början, så att ingen vill specialanpassa det.** Fastighetssystem blir ofta
specialanpassade efter varje kunds önskemål, eftersom de är svåra att förstå. Systemet ska vara så enkelt och
intuitivt från första början att det inte behövs. Att klä på med fler funktioner är en sak, att anpassa
systemet efter unika behov en annan. Det första gör vi, det andra ska inte behövas. Varje ny funktion prövas
mot det: blir den lika lätt att förstå för en liten byggnad som för en stor, och känner man igen sig från
andra delar av systemet?

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
    *(Gjort 2026-11-23, biljett #19: skissen och dess test är borta, och de fem delar som inte byggdes –
    motivering vid strykning, ändringsloggen, växeln "Visa ordinarie plan", spöket på den ordinarie
    platsen och det rullande veckofönstret – står som idé 10 i `ideer-och-resonemang.md`.)*
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
54. **Processlinjen ersätter flikarna** (biljett #12, berättelse 1–3 och 5–8). Flikarna Planering, Byggnad och
    Begrepp sa inte i vilken ordning arbetet görs. I stället står huvudstegen **Byggnad → Planering →
    Balansering** överst i sidopanelen: förstå byggnaden, planera en byggnad i taget, balansera alla byggnader
    för utförarnas skull. **Byggnad** går alltid att öppna och har ingen bock – orienteringen i en byggnad är
    inget steg som blir klart. **Planering** visar hur långt arbetet kommit ("3 av 4 byggnader klara"), och en
    byggnad räknas som klar när alla sex stegen är klara. **Begrepp** blir en **ordlista** (`data/ordlista.js`)
    som öppnas i dialogrutan från vilket huvudsteg som helst, så att man kan slå upp ett ord mitt i arbetet
    utan att tappa platsen.
55. **3D-vyn döljs i Balansering, men byggs inte om** (biljett #12, berättelse 7–8). Balanseringen behöver hela
    ytan till den årsbreda tidsaxeln, så `#vy` och planeringens tidsaxel döljs med CSS (`body.i-balansering`).
    Döljningen är avsiktligt bara visuell: scenen, kameran, det valda planet och den valda installationen lever
    kvar, så planeraren kommer tillbaka till byggnaden precis där hen lämnade den. Telefonvyerna ligger inuti
    `#vy` och försvinner därför med den – de hör till en enskild byggnad och har inget att säga i Balansering.

56. **Förskjutningen räknas modulo intervallet** (biljett #13, berättelse 35, 40 och 69–71). En förskjutning
    flyttar *när i året* en rytm ligger, aldrig hur ofta (beslut 26). Hade den bara lagts på startveckan
    hade en stor förskjutning tryckt ut det sista tillfället ur året, och balanseringen hade ändrat
    frekvensen i smyg – just det den aldrig får göra. Därför räknas den modulo intervallet: en månadsrond
    förskjuten 5 veckor ligger likadant som förskjuten 1, och mellanrummet mellan tillfällena är alltid
    intervallet. Rytmen rullar löpande över årsskiftet (förslag A), och året visar de tillfällen som
    faller inom det. För intervall som delar året jämnt (vecka, månad, kvartal, år) är antalet tillfällen
    därför detsamma vid varje förskjutning; varannan månad ger 6 eller 7 beroende på fas, vilket är vad
    frekvensen själv säger ("6–7 ggr/år").

    De två nivåerna läggs ihop innan veckorna räknas: byggnadens besöksrytm (nivå 1) plus rondseriens egen
    (nivå 2). En rondserie kan därför ligga ur fas med resten av byggnaden utan att byggnadens förskjutning
    tappas. **Halvårsronder med vald startmånad** klampas i *sin egen* månad, inte i startmånaden: en rond
    som börjar i april har tillfällen i april och oktober, och oktobertillfället hör hemma i oktober (beslut 41).

    **Avvikande texter på rutintillfällesnivå flyttas av den som ändrar förskjutningen**, inte av städningen.
    Texterna är nycklade på veckan, och efter ändringen finns ingen uppgift kvar om var tillfället låg –
    städningen hade bara sett en text på en vecka utan tillfälle och kastat den. Tillfällena paras ihop på
    ordningsnummer: rytmen är densamma, bara förskjuten, så det n:te tillfället före svarar mot det n:te efter.
    Av samma skäl **följer en öppen telefonvy med** till tillfällets nya vecka i stället för att stängas –
    det är samma rutintillfälle teknikern tittar på, med ett nytt namn (berättelse 71).

    Att listorna är olika långa är inget skäl att ge upp parningen. Varannan månad ger 6 eller 7
    tillfällen beroende på fas, och då saknar det sista motsvarighet – men de övriga har flyttat precis
    som vanligt och ska bära sina texter med sig och animeras. Just den frekvensen hade annars varit den
    enda som tyst tappade både texter och animering.

57. **Balanseringens underlag bär färdiga veckor** (biljett #14, berättelse 25–27 och 50–55).
    `DP.Balansering` är en ren uträkning utan DOM, och den vet därför ingenting om frekvenser,
    startmånader eller förskjutningar: `DP.Plan.balanseringsUnderlag()` räknar fram **vilka veckor**
    varje rondserie ligger i och skickar listan med. Det gör att modulen går att pröva med ett
    underlag som byggs direkt i ett test – tre rader data i stället för en hopklickad planering
    som råkar ge rätt siffror – och att veckoberäkningen bara finns på ett ställe (beslut 56).
    Underlaget bär också planerad tid i **timmar**, inte i dagsdel, eftersom belastningen räknas
    i tid: kort 1 h, kvartsdag 2 h, halvdag 4 h, heldag 8 h och en dag 8 h (beslut 31).

58. **Tidsaxeln i Balansering har fast radhöjd och en slutsats under sig** (biljett #14, beslut 33).
    Fyra utförarrader som delar på hela ytan blev 250 px höga celler där fyllnaden mot kapaciteten
    inte gick att läsa – stapeln blev en pelare och brickorna låg och skvalpade i tomrum. Raderna
    har därför en fast höjd, och ytan som blir över tar frågorna och Balansera-panelen i nästa
    biljett. Under tidsaxeln står **slutsatsen i klartext**: vem som har mer än hen hinner, vilka
    veckor det gäller och att veckorna emellan står tomma. En tidsaxel full av färger säger inte
    av sig själv vad som är fel, och problemet ska synas *innan* något balanseras (berättelse 50–52).

59. **Byggnaden som inte är klar visas, den döljs inte** (biljett #14, berättelse 26). Balansering
    räknar bara med byggnader där alla sex stegen är klara (beslut 39), men de övriga står kvar i
    listan – gråade, med sitt område och en knapp som öppnar Planering för just den byggnaden.
    Att utelämna dem hade besvarat frågan "varför saknas Kasern 2?" med tystnad. Knappen
    *Standardplanering för alla* ger alla som saknar planering en standardplanering i **ett**
    historiksteg, så att ett enda ångra tar bort den igen.
60. **Balanseringens sökning är greedy i byggnadsordning, och mäter mot de redan placerade**
    (biljett #15, beslut 38). Byggnaderna får sin förskjutning en i taget, och varje val vägs bara
    mot de byggnader som redan valt plats. Att i stället mäta mot alla på en gång lät den första
    byggnaden flytta för att komma undan byggnader som ännu inte hade bestämt sig – planeraren såg
    en flytt utan att kunna se vad den var till för. Nu ligger en byggnad kvar om den inte krockar
    med något som redan ligger där. Måtten jämförs i ordningen lägsta topp → färst veckor över
    kapaciteten → färst veckor med fler än 6 tillfällen → jämnast spridning, och vid lika utfall
    vinner den minsta förskjutningen. Sökningen hittar ett bra läge, inte bevisat det bästa; den är
    deterministisk, så samma underlag ger alltid samma svar och samma förklaring.
61. **Förklaringen säger vilka veckor besöken hamnade i, inte bara hur många veckor det förskjöts**
    (biljett #15, beslut 36). Förskjutningen i veckor räcker inte som besked, eftersom varje rond
    räknar den modulo sitt eget intervall (beslut 26): en byggnad kan få "4 veckor" och ha sina
    månadsronder kvar på exakt samma veckor. Varje rad säger därför vilka veckor byggnaden besöks i
    nu, och hur många av dess rondserier som faktiskt bytte vecka.
62. **Frågorna i Balansering besvaras med ett klick, och förvalet är ett svar** (biljett #15,
    beslut 37). Varje fråga är ett kort som ser ut som Planeringens steg, med förval synligt i
    sammanfattningen och en knapp *Förvalet stämmer*. Grön bock på frågan betyder att planeraren
    tagit ställning, inte att något tal ändrats. Grön bock på huvudsteget Balansering kräver
    däremot att balanseringen är **gjord**: frågorna är förutsättningen, balanseringen är arbetet.
63. **Ångra balanseringen går att nå från Balansering** (biljett #15). Mediaspelaren hör till
    Planeringens tidsaxel och är dold i Balansering, så löftet att ett enda ångra tar tillbaka hela
    balanseringen hade varit osynligt där det gäller. En knapp bredvid *Balansera om* gör samma sak
    som Ctrl+Z.
    **Ersatt av beslut 82** (biljett #31): mediaspelaren syns numera i alla huvudsteg, och den egna
    knappen är borttagen.

64. **Ett rutintillfälle har två veckor: ordinarie och faktisk** (biljett #16, beslut 26 och 32).
    Den **ordinarie** veckan är den rytmen ger – frekvens plus de två förskjutningarna. Den
    **faktiska** är där tillfället ligger efter en provisorisk flytt. Provisoriska flyttar och
    strykningar är därför nycklade på den **ordinarie** veckan, och bara på den: den står still
    när tillfället flyttas, så nyckeln pekar på samma tillfälle hela tiden. Hade nyckeln följt
    den faktiska veckan hade en andra flytt inte kunnat hitta tillbaka till vad tillfället
    egentligen hette, och två tillfällen som flyttats till samma vecka hade kolliderat.

    Av samma skäl bygger **rutintillfällets nyckel** (`rond:ordinarieVecka`) på den ordinarie
    veckan. Flera tillfällen i en rondserie kan hamna i samma vecka – en veckorond får alla
    semesterveckornas tillfällen flyttade till veckan före – och hade nyckeln följt den
    faktiska veckan hade de delat nyckel. Tidsaxeln hade då visat ett av dem och telefonen
    alltid öppnat samma, och just det fallet är det som utlöser strykförslagen.

    `DP.Plan.rutintillfallen()` svarar med den **faktiska** veckan i `vecka` och bär den
    ordinarie i `ordinarieVecka`. Allt som visar tillfällen – planeringens tidsaxel, telefonen,
    informationskortet – läser `vecka` och får därmed flytten utan att veta något om nivå 3,
    och namnet bygger på den faktiska veckan. De **avvikande åtgärdstexterna** är däremot
    nycklade på den ordinarie: texten hör till planeringen och inte till den vecka tillfället
    råkar ligga i just nu, så den följer med flytten av sig själv. `DP.Plan.textVecka(t)` är
    den vägen, och `tillfallenMedStrukna()` listar även de strukna – ett struket tillfälle är
    inte borta, det är ett ställningstagande som går att ta tillbaka.

65. **Flytten går bakåt, och förslaget att stryka mäts på de faktiska veckorna** (biljett #16,
    beslut 32 och 45). Ett tillfälle i en vecka utan tillsyn och skötsel flyttas till närmaste
    **tillåtna vecka före** – arbetet ska vara gjort innan semestern, inte skjutas upp till
    efter den. Saknar också veckan direkt före tillsyn och skötsel går sökningen vidare bakåt
    vecka för vecka. Finns ingen tillåten vecka före i året – året börjar med utkorsade
    veckor – går flytten **framåt** i stället. Att flytta bakåt är regeln, men regeln finns
    för att inget tillfälle ska ligga i en vecka ingen arbetar; att lämna det kvar hade följt
    bokstaven och brutit mot syftet. Är hela året utkorsat ligger tillfället kvar: då har
    planeraren svarat att ingen tillsyn och skötsel görs alls, och det är inget uträkningen
    kan laga.

    Ett tillfälle som efter flytten hamnar högst **en vecka** från ett annat tillfälle i samma
    rondserie **föreslås** strykas. Avståndet mäts på de faktiska veckorna – det är där
    tillfällena ligger, och det är avståndet planeraren möter. Bara ett flyttat tillfälle kan
    föreslås strykas: ett som ligger kvar på sin ordinarie plats är planeringen, och den ändrar
    balanseringen inte. Ett **förslag är inte en strykning**: tillfället ligger kvar och räknas
    med i belastningen tills planeraren säger ja. *Stryk alla* är ett steg i historiken och
    *behåll* ett eget, så att ett ja till alla går att ta tillbaka i ett svep medan ett enskilt
    ställningstagande står för sig.

66. **Sökningen mäter på läget med nivå 3 tillämpad** (biljett #16, beslut 60). De provisoriska
    flyttarna följer av var rytmen hamnar: en fas som lägger fyra tillfällen i semesterveckorna
    ger fyra tillfällen i veckan före. Mättes lägena på de ordinarie veckorna hade balanseringen
    valt en fas som ser jämn ut i tabellen och i verkligheten klumpar ihop arbetet precis före
    semestern – och planeraren hade sett en tidsaxel som inte stämde med måttet som valde den.
    Nivå 3 räknas därför om i varje prövat läge, och en gång till på det slutliga.

    Av samma skäl räknas nivå 3 **om från grunden** varje gång Balansera körs. Flyttarna är
    balanseringens resultat och inte planerarens, och en strykning som en tidigare körning
    föreslog ska inte hänga kvar när den nya rytmen lagt tillfället någon annanstans. De
    provisoriska flyttar och strykningar som **planeraren** gjort följer däremot med när en
    förskjutning ändrar de ordinarie veckorna, parade på ordningsnummer precis som texterna
    (beslut 56): flytten är ett avstånd från den ordinarie veckan, inte en absolut vecka.

67. **Dragningen är ett avstånd, och frågan säger vad avståndet betyder på varje nivå**
    (biljett #17, beslut 26 och 34, berättelse 58–64). Planeraren drar en bricka och svarar
    på vad flytten ska gälla. Avståndet är detsamma vad svaret än blir, men innebörden skiljer:
    *bara denna gång* lägger det på tillfället (nivå 3), *hela rondserien* på rondens
    förskjutning (nivå 2) och *hela byggnadens besöksrytm* på byggnadens (nivå 1). Att samma
    gest når alla tre nivåerna är avsikten: skillnaden mellan provisoriskt och permanent är
    den svåraste i hela balanseringen, och den ska mötas som ett val – inte som tre skilda
    verktyg planeraren måste veta om i förväg.

    De två permanenta räknas från tillfällets **ordinarie** vecka och inte från den faktiska.
    En förskjutning flyttar rytmen, och rytmen är de ordinarie veckorna; drar planeraren ett
    redan provisoriskt flyttat tillfälle vidare är det rytmen som ska hamna i målveckan, inte
    rytmen plus den gamla flytten en gång till.

    Frågan säger för varje val vad det **landar i**, räknat innan valet görs
    (`DP.Plan.flyttAlternativ`). Det viktigaste beskedet gäller beslut 56: förskjutningen
    räknas modulo intervallet, så ett drag längre än intervallet ger en rytm som ligger
    likadant som ett kortare drag, och då hamnar det dragna tillfället inte i målveckan utan
    ett annat tillfälle i serien gör det. Det ska stå i dialogen och inte upptäckas i
    tidsaxeln efteråt. Är ronden en halvårsrond med vald startmånad och målveckan ligger i en
    annan månad är de permanenta valen avstängda, med skälet utskrivet (beslut 41) – den
    provisoriska flytten går fortfarande, eftersom den inte ändrar någon planering.

    Det senaste valet är förvalt nästa gång. Förvalet lever i vyn och inte i planeringen: det
    är en vana hos den som arbetar, inte en uppgift om byggnaden, och ska därför varken följa
    med i historiken eller gå att ångra.

68. **Permanent märks per rad, provisoriskt per bricka** (biljett #17, berättelse 64). En
    provisorisk flytt syns på det enskilda tillfället (⤺), men en permanent flytt *är* en
    förskjutning och syns bara som att hela rytmen ligger någon annanstans – det går inte att
    se på en bricka. Därför får raden ett eget märke, ⇥ med förskjutningen i veckor: i
    Balanseringens tidsaxel på byggnadsraden och i byggnadslistan, i planeringens tidsaxel på
    besöksraden (nivå 1) och på rondens rad (nivå 2). Markeringen ligger på den nivå flytten
    faktiskt rör, och de två symbolerna är medvetet olika.

    Både beskedet i klartext (`DP.Plan.forskjutningStatus`) och själva märket
    (`DP.Plan.forskjutningMarke`) formuleras i planeringen och inte i vyerna, så att de två
    tidsaxlarna säger samma sak om samma flytt – och så att ett byte av symbol är en
    redigering och inte tre. Byggnadens förskjutning upprepas inte på varje rondrad: den
    gäller alla rader, och en siffra på varje rond hade sagt att de är förskjutna var för sig.

    Släppet begränsas till **utförarens egen rad**. Balanseringen byter aldrig utförare
    (beslut 46), och ett släpp på en annan rad hade annars flyttat tillfället utan att vare
    sig sikte eller besked visats under dragningen – planeraren hade fått ett resultat hen
    inte sett komma.

### Byggnad: inläsning, ny byggnad och ändra byggnad (grillning 2026-11-24)

Ersätter och bygger vidare på idé 4 i `ideer-och-resonemang.md`.

69. **Ett vägledande flöde för byggnaden, inte tre processer.** Huvudsteget Byggnad får ett flöde med
    numrerade steg och grön bock, på samma sätt som Planering: *Byggnadstyp och namn → Plan → Rum →
    Installationer*. *Skapa ny byggnad* startar flödet med en tom byggnad, *Ändra byggnad* med en befintlig.
    Inläsningsfil och handpåläggning (lägga till, dra och släppa) är två sätt att fylla i **samma** steg,
    inte två spår, och de går att blanda. Det ersätter beslut 42:s "ingen grön bock" när flödet finns.

    **Steglistan och steg 1 byggda i biljett #34** (`app/byggnadsflode.js`): de fyra stegen ligger i
    `#hs-byggnad` ovanför byggnadsträdet, med samma `.steg-kort` som Planeringens flöde (beslut 107) och
    en byggnadslista med status per byggnad. *Skapa ny byggnad* ger en tom byggnad som ett steg i
    historiken (`DP.Plan.skapaByggnad`), och ångra förbi steget tar bort den (beslut 73). Vad som är
    klart svarar `DP.Plan.byggnadsSteg(bid)` på och var byggnaden står `byggnadStatus(bid)`, båda i
    planeringen och inte i vyn (beslut 61). Steg 2–4 syns med sitt läge men är tomma tills de byggs.
70. **En inläsningsfil med tre flikar: Plan, Rum och Installationer.** Ingenting upprepas: ett rum står en
    gång, en installation anger sitt rum. Man fyller i de flikar man har och kan läsa in en i taget. När
    filen tas ut innehåller den **det som redan är inläst**, så efter plan och rum återstår bara
    Installationer. *Ändra byggnad via fil* är samma sak: ta ut, ändra, läs in. Byggnadens namn och typ
    anges i flödets första steg, inte i filen. Excel-filen läses och skrivs med SheetJS i `vendor/`, som
    fungerar från `file://` utan server.

    *Byggt för fliken Plan i biljett #36.* Filen tas ut med **alla tre flikarna** från första dagen,
    även om bara Plan läses in än: den som fyller i filen ska se hela uppgiften, och flikigenkänningen
    måste ändå kunna skilja dem åt. SheetJS ligger som **mini-bygget** (`vendor/xlsx.mini.min.js`,
    280 kB mot 950 kB): det läser och skriver .xlsx, som är formatet både Excel och Numbers
    exporterar till. En .numbers-fil går alltså inte att läsa direkt – planeraren exporterar till
    .xlsx, som hon gör mot fastighetssystemet ändå. Sömmen mot filformatet bor i
    `app/inlasningsfil.js` och ingen annanstans; allt annat arbetar med ett **ark** (en lista med
    flikar som var och en är en lista med rader), så tolkningen går att pröva i ett test utan att en
    fil finns.
71. **Byggnaden lever i minnet som allt annat, men byggs för att kunna sparas.** I utbildningsversionen visas
    avbrottet (man väntar på en ifylld fil) som en status i byggnadslistan, men det överlever inte en
    omladdning. Filen bär plan, rum och installationer, så det som går förlorat är namn och typ. För att ett
    riktigt system med databas inte ska bli en överraskning ska byggnadens plan, rum och installationer bli
    **rena data i tillståndet** som ändras genom samma väg som planeringen (`DP.Plan.andra`), på samma sätt
    som idé 5 redan förutsätter för planeringen. Då finns det en enda söm där ett adapterlager mot en
    databas senare kopplas in.
72. **Byggnadstypen är mallen.** Den ger planlösningens regel, utseendet, de vanliga rumstyperna och
    standardplaneringen. Första omgången är sju typer: Garage, Kasern och Hangar (finns), samt Mindre
    logement (en mindre, enklare kasern med 10–20 rum på ett eller två plan, ofta toalett i varje rum),
    Militärrestaurang, Utbildningsbyggnad och Panncentral. Kategorier som "liten enkel / stor komplex"
    används inte.
73. **Inläsningen ligger i den gemensamma historiken.** Varje inläsning, varje accepterat förslag och varje
    drag är ett steg som går att ångra och göra om med samma mediaspelare som i Planering. Ångrar man förbi
    att byggnaden skapades försvinner den. Särskilda begränsningar kan läggas till senare.
74. **Begreppen:** *systemet* är det vi bygger, *fastighetssystemet* skrivs alltid ut, *modellen* är bara
    3D-modellen. *Inläsning*, *inläsningsfil* och *ta ut* i stället för import, importfil och exportera.
    Se `GLOSSARY.md`.
75. **Ordningen är grillning, prototyp och sedan spec.** Efter grillningen byggs en slit-och-släng-prototyp
    av inläsningsläget i en fristående sida, med en påhittad Kasern 3. Först när vi känt på den skrivs spec
    och biljetter.
76. **Ett rum identifieras av plan + rumsnummer.** I verkligheten är rumsnumret löpande per plan (001, 002 …)
    och planen har en egen beteckning (oftast 01, ibland P1 eller P01); de skrivs inte ihop. Därför har plan
    och rum var sin beteckning, och ett rum pekas ut med båda – i rumsfliken och i installationsfliken.
    Det visas kort som **01-001**. Garage, Kaserner och Hangar byter till samma numrering (de har i dag
    1001 = plan 1, rum 1), så att man lär sig på det man möter.
    *Byggt i biljett #33.* Nyckeln `plan + '-' + nr` är både det som pekar ut rummet i koden
    (`DP.rumNyckel`/`DP.rumBeteckning`, som installationernas `rum` bär) och det planeraren ser – samma
    sträng, så det finns ingen översättning att glömma. Kasernens källarplan behåller sin beteckning
    `00`: beslut 77 säger att planens beteckning behålls som den står, och det väger tyngre än att
    numrera om källaren till något negativt.
77. **Planens beteckning behålls som den står, och kopplingarna matchas förlåtande.** Fliken Plan är
    fastighetssystemets id och ska kunna gå tillbaka dit, så systemet döper inte om. När Rum eller
    Installationer pekar på ett plan eller rum: exakt träff är **klar**, träff efter att bokstäver och
    inledande nollor tagits bort ("P1", "1", "Plan 1" → 01; "1" → 001) är ett **förslag** som godtas med
    ett klick eller alla på en gång, och ingen träff är **oplacerad** och dras på plats för hand.
78. **Rumsnumrens ordning blir rummens placering.** Rummen placeras i nummerordning medurs runt planet
    enligt byggnadstypens regel (i en kasern längs korridoren, ena sidan och tillbaka längs den andra).
    Följer verklighetens numrering inte regeln blir modellen schematisk, inte fel. Ordningen på ett plan
    går att dra om; fri ritning finns inte.

    *Byggt i biljett #37* (`DP.Planlosning.laggUtRum`, utan DOM). Regelns **parametrar** ligger i
    byggnadstypen (`planlosning: { regel, djup, korrBredd, langd }`, beslut 99) och uträkningen i
    modulen – två regler finns: `korridor` (kasernens form) och `hall` (garagets och hangarens, ett
    stort utrymme med rummen längs ena långsidan). Rummen delas mellan korridorens sidor **mitt i
    nummerordningen** – första halvan ut längs ena sidan, andra halvan tillbaka längs den andra –
    och norra sidan läggs ut baklänges längs x, så att rundan faktiskt går medurs och inte fram
    och tillbaka. Att dela på halva NTA:n i stället hade sett jämnare ut i en byggnad med lika
    rum, men brutit rundan så fort ett rum dominerar: en hall på 500 m² hade legat ensam på sin
    sida och nästa rum i ordningen hamnat längst bort på den andra. Rundan är det planeraren
    läser i modellen; symmetrin är bara en följd av rummen. Varje rums rektangel speglar dess
    **egen NTA**, också hallens – planeraren jämför summan i steget mot modellen, och de två ska
    stämma. Ett rum vars rumstyp är **korridor** blir korridoren själv och ligger inte i ledet:
    en byggnad med två korridorer på tvären hade sett ut som ett fel. Rektangeln räknas i `form()`
    och skrivs **inte** till byggnadsdatan (beslut 71), så ett rum som dras om får sin nya plats
    utan att något behöver rensas.

    Sadeltakets bas följer nu byggnadens faktiska topp för **varje räknad** byggnad, inte bara
    när något plan är skal (preciserar beslut 85). Skiljelinjen går vid om byggnaden är **ritad
    eller räknad** – de handritade bär egna elevationer i datafilen (beslut 101) – eftersom ett hus
    som nyss blev färdigt annars plötsligt hade fått ett tak som svävar tre meter upp.

    *Ordningen går att dra om från biljett #38* (`DP.Plan.flyttaRum`). Listan i steg 3 är ordningen i
    byggnadsdatan, och den är det `laggUtRum` går igenom – så ett drag i listan är ett drag i modellen,
    utan att vyn behöver veta något om geometri. Ett rum som dras till ett **annat plan** tar sina
    installationer med sig: de pekar på rummets nyckel (beslut 76), och byter rummet plan eller nummer
    skrivs de om i samma steg. Ett rum som läggs till för hand får **samma förslag** som ett rum ur
    filen – rumstypen ur benämningen, NTA ur rumstypen – eftersom modellen annars hade sett olika ut
    beroende på hur uppgifterna kom in.
79. **Areor och volym per rum, summor uppåt** (SS 21054:2020). Per rum: **NTA** krävs och ger golvytan i
    modellen; **NTV** (nettovolym) är valfri och ger rumshöjden som NTV ÷ NTA – annars gäller byggnadstypens
    standardhöjd; **BRA** och **BTA** är valfria; *temperaturreglerad* lagras utan funktion. Per plan och
    byggnad är NTA summan av rummen. BRA och BTA summeras från rummen om alla rum har dem, annars räknas de
    fram ur modellen (BRA innanför ytterväggarna, BTA utanför) och märks *beräknad*. BTA per rum är
    tveksamt enligt standarden (den mäts till ytterväggens utsida), men fastighetssystemet aggregerar areor
    uppåt från rum, så fältet finns.

    *Byggt för rummen i biljett #37.* NTA-förslaget tas ur **rumstypens** standardvärde och inte ur
    ett gemensamt tal: en korridor är lång och ett WC litet, och ett gemensamt standardvärde hade
    gett en byggnad där allt är lika stort. Byter planeraren rumstyp på en rad som väntar på NTA
    byts förslaget med den. NTA summeras per plan och byggnad och räknas **aldrig** ur modellen –
    den är rummens tal, och modellens storlek är tvärtom en följd av den.

    *Beräknad area byggd i biljett #40* (`DP.Planlosning.areor`). BRA och BTA summeras ur rummen
    när **alla** rum på planet har dem – då är talet fastighetssystemets och står omärkt – och
    räknas annars fram ur modellen och märks ***beräknad***. Aldrig ur hälften av rummen: ett tal
    som är hälften av den verkliga arean är värre än inget tal, så hela planet räknas om i stället.
    Geometrin: ett rums rektangel är satt så att dess yta **är** rummets NTA, och rummen ligger
    kant i kant. **BRA** är därför planets omslutande rektangel själv – den rymmer nettoarean plus
    innerväggarna och det regeln lämnat mellan rummen – och **BTA** samma rektangel utökad en halv
    väggtjocklek runt om, eftersom viewern ritar ytterväggen centrerad på rummets kant: halva
    väggen ligger innanför BRA och halva utanför. Att krympa BRA med ytterväggen hade gett ett BRA
    **under** NTA på ett plan med ett enda rum, och det är geometriskt omöjligt. Väggtjockleken bor
    i planlösningen och läses därifrån av viewern – två tal som ska vara samma glider isär om de
    ligger på två ställen.

    Märkningen är **per plan** och inte bara i botten: i ett hus där källaren saknar BRA ska
    planeraren se vilket plan som är systemets tal och vilka som är fastighetssystemets.
    Byggnadens summa är planens, och beräknad så fort något plan räknades ur modellen; saknar
    något plan med rum ett tal faller summan, av samma skäl som att hälften av rummen inte
    summeras. Ett plan som bara är **skal** räknas inte alls: skalet är byggnadstypens
    standardstorlek och inte en uppgift om byggnaden.

    Uträkningen **avstår** när modellens rektangel inte täcker planets NTA. Korridorsregeln ger
    korridoren remsan mellan rumsraderna, och den är sällan lika stor som korridorens NTA – på
    ett sådant plan hade BRA blivit mindre än NTA, vilket är geometriskt omöjligt. Strecket
    pekar då på modellens egen brist, och den är skriven som biljett #48.
80. **Rumstypen läses ur benämningen.** Ingen kolumn för rumstyp: systemet känner igen korridor, trapphus,
    WC, logement osv. ur benämningen utifrån byggnadstypens vanliga rumstyper. Det okända blir ett förslag
    *Övrigt rum* som ändras med ett klick. Rumstypen styr bara placeringen i modellen.
    (Justerat av beslut 109: kolumnen finns, men är valfri.)

    *Byggt i biljett #37* (`data/rumstyper.js`). Tabellen är **data** (beslut 99): varje typ bär namn,
    kategori (den sort viewern färgar golvet efter), standard-NTA och igenkänningsmönster, och
    **tabellens ordning är regeln** – det mest utpekande mönstret prövas först. *Övrigt rum* står i
    tabellen som en riktig rumstyp och inte som ett felläge: modellen ska kunna ritas, och planeraren
    byter typen med ett klick på rummets egen rad. "Gillestuga" känns med flit **inte** igen – den är
    exemplet i beslut 109 på en benämning som ska mötas av förslaget och av kolumnen Rumstyp, inte av
    en gissning som råkar bli rätt.
81. **Fliken Installationer har bara signifikanta installationer.** Övriga installationer genereras ur
    byggnadstyp och rumstyp, som i dag. Kolumner: Plan, Rum, Benämning, Beteckning, Fabrikat, Modell, Id,
    Externt id. Tomt Id ger ett id från systemet. Installationstypen föreslås ur benämningen; en okänd typ
    måste väljas ur listan innan steget blir grönt, eftersom typen avgör vilka åtgärder som går att koppla.
    Systemet ska vara förberett för fler attribut (t.ex. kapacitet, beskrivning).

    *Byggt i biljett #39.* Igenkänningen ligger som en tabell i `data/installationstyper.js`, vid sidan av
    `DP.installationstyper` och inte inuti den: typerna bor i två filer, och mönstren hör ihop med
    varandra – tabellens **ordning är regeln**, och den går inte att läsa när den är utspridd. Det som
    skiljer en okänd installationstyp från en okänd rumstyp är att den **inte får något förslag**: ett rum
    med fel rumstyp blir felfärgat i modellen, men en installation med fel typ får fel tillsyn, eller
    ingen. Raden blir därför oplacerad och planeraren väljer typen ur listan – listan är de **signifikanta**
    typerna (`DP.signifikantaTyper()`), eftersom en övrig installation inte är en individ. Förkortningarna
    skrivs både med och utan blanksteg före numret ("HC01" och "HC 01"), så mönstret är förkortningen följd
    av slut, blanksteg eller siffra; `\b` räcker inte, eftersom det inte finns någon ordgräns mellan C
    och 0. Det **tomma Id:t** får ett id från systemet som räknas uppåt från 90000001, så att ett
    systemgivet går att skilja från fastighetssystemets åttasiffriga. De **övriga** installationerna
    genereras av `DP.Planlosning.form()` och ligger aldrig i tillståndet: de hör till hur byggnaden ritas
    och inte till vad planeraren bestämt om den (beslut 71). Byggnadsträdet räknar dem därför ur formen –
    läste det tillståndet hade det sagt "0 övriga" om en byggnad där modellen visar trettio.
    `DP.genereraOvriga` läser rummets **rumstyp** när det har en och benämningen när det inte har det:
    de handritade rummen heter "Korridor" och "WC", medan ett inläst rum bär `rumstyp` och en fri
    benämning som "Korr." eller "WC/D".
82. **En mediaspelare på en fast plats för alla huvudsteg.** Den flyttar högst upp och är gemensam för
    Byggnad, Planering och Balansering. Ångra-knappen i Balansering (beslut 63) tas bort: den fanns bara för
    att mediaspelaren var dold där, och två knappar för samma sak väcker frågan vad skillnaden är.
    Balanseringen är ett steg i historiken, så ◀ tar tillbaka hela. Egen biljett, oberoende av inläsningen,
    och kan göras först.
    **Byggt** (biljett #31): spelaren bor i `app/spelare.js` och ritas i toppraden (`#spelare`), som redan
    fanns och hade plats över – den kostar därför ingen höjd av huvudvyn. Tangentbordsgenvägarna Ctrl+Z och
    Ctrl+Y flyttade med dit: de hör till historiken och inte till någon vy. `app/tidsaxel.js` ritar bara
    tidsaxeln.
83. **Det inlästa är klart, förslag eller oplacerat.** Varje steg (Plan, Rum, Installationer) visar det
    inlästa i tre grupper: *klart* ligger på plats, *förslag* är det systemet tror – godtas ett i taget
    eller med *Godta alla* – och *oplacerat* är det systemet inte vet, som dras till rätt plan, rum eller
    typ. Steget får grön bock när bara klart återstår. Ordet *förslag* betyder samma sak som vid planerad
    tid och "föreslagen att strykas": systemet föreslår, planeraren bestämmer.

    *Byggt för fliken Plan i biljett #36* (`app/inlasning.js`). Två saker visade sig bära hela modellen.
    **Statusen är härledd ur frågorna och inget man sätter**: inga frågor → klar, alla frågor har
    förslag → förslag, annars oplacerad. Ett fält hade kunnat säga "klar" om en rad som fortfarande har
    en obesvarad fråga, och då hade modellen visat en gissning. Och **klara rader står inte kvar i
    inläsningen** – de förs in i byggnaden direkt, så att ett klart plan *är* ett plan. Allt som redan
    läser byggnaden fortsätter svara rätt utan att känna till inläsningen, och modellen kan inte visa
    något som inte är avgjort (berättelse 55). Ett *Godta alla* är **ett** steg i historiken, och en rad
    som blir klar förs in i byggnaden i **samma** steg som godtagandet: att godta ett förslag *är* att
    lägga till planet, och två steg för en handling hade betytt att planeraren backar en gång och ser
    ingenting hända. En **oplacerad** rad blir inte klar av *Godta alla*: det systemet inte vet kan
    planeraren inte godta sig förbi.
84. **Planens ordning föreslås och kan dras om.** Fliken Plan har bara Plan (beteckningen) och Benämning.
    Ordningen nedifrån och upp föreslås ur dem: siffror stigande, källare, "K" och negativa under 01, vind
    och teknikplan överst. I steget Plan dras ordningen om.

    *Byggt i biljett #35.* `DP.Planlosning.foreslagenOrdning(plan)` svarar med ordningen och
    `planRang` med var ett plan hör hemma. Benämningen väger **tyngre** än beteckningen när den säger
    något otvetydigt: ett plan som heter "Källarplan" ligger under 01 även om det är betecknat 00, och
    "Vindsplan" överst även med låg beteckning – den som skrev benämningen visste vad planet var.
    Ett plan vars beteckning inte bär någon siffra ("Souterräng") gissas inte in bland de numrerade utan
    hamnar ovanför dem, så att planeraren drar det på plats i stället för att en gissning ser rätt ut.
    Sorteringen är stabil: två plan med samma rang behåller sin inbördes ordning, så ett förslag kastar
    aldrig om något i onödan. Förslaget tillämpas när ett plan **läggs till** (en källare som läggs till
    sist hamnar ändå underst) och går att be om igen med *Ordna nedifrån och upp* när planeraren dragit
    fel; däremellan står hennes ordning kvar, eftersom förslaget bara är ett förslag.
85. **Modellen växer fram steg för steg.** Efter Plan visas byggnadstypens standardstorlek som ett skal med
    tomma bjälklag; när rummen kommer in växer skalet till rummens NTA, och sist dyker installationerna upp.
    Knappar utan något att visa är utgråade, inte borttagna.

    *Skalet byggt i biljett #35* (`app/planlosning.js`, utan DOM som `DP.Balansering`). `form(byggnad)`
    ger byggnaden med `elev` per plan och ett skal per plan som saknar rum. Tre saker visade sig höra
    till skalet och inte till det färdiga huset: det är **inget rum** (ligger inte i viewerns `rumIndex`,
    går inte att välja eller gå in i – det finns inget därinne att se), det får **inga fönster** (fönster
    hör till rummen, och ett skal med fasad ser ut som en färdig byggnad), och **sadeltakets bas följer
    byggnadens faktiska topp** så länge något plan är skal, eftersom byggnadstypens bas är måttsatt för
    ett färdigt hus och ett tak som svävade hade sett ut som ett fel.

    Löftet om kameran preciserades också: den står kvar, men **avståndet skalas om när byggnaden byter
    storlek**. I steget Plan växer huset ett plan i taget, och ett oförändrat avstånd hade satt
    planeraren inuti en vägg som växte förbi henne. Riktningen och det hon tittar mot är hennes vy;
    avståndet är bara en följd av hur stort huset är.
86. **Att läsa in igen visar skillnaden mot det som finns.** Plan och rum matchas på beteckningen,
    installationer på Id. Nytt läggs till som förslag, ändrat visas med före och efter, och det som
    **saknas i filen tas aldrig bort av sig självt** – det blir ett förslag att ta bort, eftersom en rad som
    fattas lika gärna kan vara glömd.
87. **Flytta och ta bort en installation.** Flytta till ett annat rum är samma installation: kopplade
    åtgärder och avvikande texter följer med. Ta bort tar bort kopplingarna. Ändrar det rondernas tid
    markeras steg 6 som ändrad förutsättning, och Balansering markeras som ändrad planering – inget annat i
    planeringen ändras av sig självt. Att **ersätta** en installation är en egen fråga (se nedan).

    *Flytta och ta bort byggt i biljett #39* (utbytet hör till sin egen biljett). Skillnaden mellan de två
    syns i hur de skrivs: en **flytt** är en ändring av byggnadens data och inget mer – det är samma
    installation, id:t består, och kopplingarna pekar på id:t och följer med av sig själva. En
    **borttagning** går genom `andraFlera`, eftersom den rör både byggnadens data och dess planering: en
    koppling som pekar på en installation som inte finns är ingen tillsyn, och steg 5 hade räknat den som
    gjord. Samma regel gäller när ett plan eller ett rum tas bort och tar installationer med sig –
    `rensaKopplingar` delas av de tre, så att de aldrig kan börja skilja sig på vad en borttagning betyder.
    Vid en flytt rensas installationens `x`, `z` och `h`: platsen i rummet räknas av planlösningen, och en
    ritad plats som följde med hade lagt installationen utanför det nya rummets väggar.
88. **Från Byggnad till Planering via den befintliga snabbstarten.** Ingen planering skapas av sig själv; i
    Planering möts man av snabbstarten med standardplaneringen eller kopiering. Planering går att öppna
    innan Byggnad är klar, men steg 5 blir inte grönt utan installationer.

    *Byggt i biljett #39*, och det krävde ingen ny kod: snabbstarten läser byggnadstypens standard och
    installationerna ur tillståndet, så en byggnad planeraren läst in möts av samma snabbstart som de
    fyra som alltid funnits. Det är vad beslut 71 var till för.
89. **Okända kolumner blir egna fält.** En kolumn systemet inte känner till sparas som ett *eget fält* på
    raden, visas i informationskortet och följer med ut när filen tas ut. Det är förberedelsen för fler
    attribut (kapacitet, beskrivning …): ett eget fält kan senare bli ett attribut systemet förstår.
90. **Inläsningsläget är standarden för alla inläsningar.** Mönstret *ta ut fil med flikar → läs in →
    klart, förslag och oplacerat → dra och släpp → grön bock, allt i historiken* gäller också kommande
    inläsningar (besiktningsplanering, besiktningsresultat, underhållsplanering, prislistor), så att man
    känner igen sig. Koden görs gemensam först när den andra inläsningen byggs – ett ramverk för
    inläsningar vi inte känner än brukar bli fel.
91. **Ett utbyte gör den gamla apparaten till en utbytt version; installationen och id:t består.** Som i
    fastighetssystemet: den nya apparaten får installationens id, och den gamla behålls som historik med
    tillägget **:1** (nästa utbyte :2). Installationen är platsen och uppgiften och bär planeringen;
    kopplingar och avvikande texter pekar på id:t och följer därför med utan att något flyttas. Den utbytta
    versionen syns när man klickar på installationen. Det gäller lika för en kylmaskin och en
    handbrandsläckare.
92. **Ersätta många på en gång.** I *Ändra byggnad* markeras installationer en och en eller som "alla av
    typen …" i byggnaden eller på ett plan, och *Ersätt* fyller i det gemensamma för de nya (fabrikat, modell,
    installationsdatum). Hela utbytet är **ett** steg i historiken.
93. **Utbyte och rättelse via fil.** Samma Id med **senare installationsdatum** är ett förslag om *utbyte*;
    samma Id med ändrade uppgifter men samma datum är ett förslag om *rättelse* av samma version. Båda går att
    vända. (Ersätter tanken på nytt Id för utbyte, eftersom id:t består enligt beslut 91.)
94. **När den nya apparaten är av en annan typ** följer kopplingar till åtgärder som också gäller den nya
    typen med; övriga följer inte med och syns som saknade i steg 5. Ändrad tid markeras i steg 6 och
    Balansering markeras, som vid all ändring. Samma typ ger inga följder. Hellre att det mesta blir rätt och
    resten är enkelt att justera än en massa om och men.
95. **Installationsdatum per version.** Valfri kolumn i fliken Installationer. Den utbytta versionen får
    utbytets datum som slutdatum. Datumet är upplysning och påverkar inte årets rutintillfällen.
96. **Inläsningsfilen har bara nuvarande versioner.** Historiken stannar i systemet; annars växer filen med
    varje utbyte och den som fyller i börjar ändra i historik.
97. **En fråga efter varje utbyte.** *"Du har ersatt 20 handbrandsläckare. Ska de nya ha samma tillsyn som
    förut?"* – **Ja, samma tillsyn** (förvalt) eller **Nej, visa dem i Planering**, som öppnar steg 5 med de
    ersatta markerade. Har kopplingar fallit bort säger frågan det ("3 åtgärder följde inte med"). Frågan
    är vägledning, inget lås. Besiktnings- och underhållsplanering får egna rader i samma fråga när de finns.
98. **Steg 1 frågar om byggnadstyp, namn och område.** Balanseringen behöver området (beslut 28). Färgen i
    tidsaxeln (beslut 47) väljer systemet ur en palett så att ingen annan byggnad har den; den går att ändra
    men frågas inte.
99. **De nya byggnadstyperna och deras standardplanering ligger i tabeller, inte i koden.** Planlösningens
    regel, rumstyperna och standardplaneringen per typ (se tabellerna i grillningen 2026-11-24, ett första
    utkast att justera) är data, liksom tidsschablonen redan är (beslut 43). Panncentralen får en ny rond,
    **Värme**. I dag justeras tabellerna i datafilerna; ett administrationsgränssnitt är idé 11.
100. **Ta bort byggnad** finns i *Ändra byggnad* och är ett steg i historiken. Planeringen försvinner med
     byggnaden, och har den varit med i en balansering markeras Balansering som ändrad.
101. **De fyra befintliga byggnaderna behåller sin handritade form.** Installationer kan flyttas, ersättas och
     läggas till utan att formen ändras. Ändras *rummen* på ett plan ritas det planet om enligt byggnadstypens
     regel, efter en varning som säger det.
102. **Prototypen** innehåller en påhittad, avsiktligt rörig Kasern 3 i en inläsningsfil som går att ta ut,
     ändra och läsa in; de fyra stegen med klart, förslag och oplacerat, *Godta alla* och dra och släpp;
     modellen som växer fram i den riktiga 3D-vyn med kaserns regel; ångra och gör om. Inte Ändra byggnad,
     utbyte, de nya typerna eller areasummorna. Filen ska gå att fylla i i **Numbers** på Mac och iPad,
     eftersom Andreas inte har Excel: flikarna känns igen på sina kolumnrubriker och inte bara på namnet,
     och tomma rader och tabellrubriker som Numbers lägger till hoppas över. Om biblioteket kan läsa
     `.numbers` direkt prövas i prototypen.
103. **Byggnadens namn är unikt.** Rutintillfällen namnges *Byggnad-Rond-ÅÅÅÅvVV*, så två byggnader med samma
     namn hade gett tillfällen med samma namn. Steg 1 säger till direkt om namnet finns. Namnet går att byta i
     *Ändra byggnad*, och tillfällena byter namn med det. Ett byggnads-id, med namnet som bara en benämning,
     kan införas senare men behövs inte nu.

     *Byggt i biljett #34.* `DP.Plan.namnHinder(namn, utom)` ger skälet i klartext och `namnTaget(namn,
     utom)` svaret; jämförelsen är på trimmad text utan skillnad på stora och små bokstäver, eftersom
     "Kasern 1" och "kasern 1" är samma namn för den som läser en lista. Beskedet kommer **medan
     planeraren skriver**, inte när hon trycker på knappen. Byggnaden får ändå ett eget id som står still
     (`byggnad1`, `byggnad2` …), så att ett senare namnbyte inte rör något som pekar på byggnaden – det
     är inte beslutets byggnads-id, bara nyckeln tillståndet redan behöver.
104. **Byggnadstypen är låst efter steg 1.** Typen avgör planlösningens regel, utseendet och vilka byggnader
     planering kan kopieras mellan. Vid fel typ skapar man en ny byggnad och läser in samma fil, som kan tas ut
     med allt ifyllt.

     *Byggt i biljett #34.* Steg 1 visar typen med märket *låst* och inga typval när byggnaden finns.
     Typerna som går att välja är de tre som har tabeller i dag – Garage, Kasern och Hangar; de fyra nya
     i beslut 72 kommer i en senare biljett i spåret. `DP.byggnadstyper` fick `stil` och `konstanter` per
     typ, så att en skapad byggnad har samma form av data som en handritad.

#### Det prototypen visade (2026-11-24)

Prototypen ligger på grenen `prototyp-inlasning` (`prototyp-inlasning.html`). Andreas tog ut en tom fil,
fyllde i den i Numbers och läste in den: **grundgreppet håller**. Det här kom ur provet:

105. **Listan hoppar aldrig.** När man godtar, drar eller väljer något står rullningen kvar där den var;
     man ska aldrig behöva leta sig tillbaka. Det är en regel för **hela systemet**, inte bara inläsningen –
     det är en av de saker användare stör sig mest på i andra system.
106. **Dra och släpp visar platsen innan man släpper.** En linje visar om det dragna hamnar före eller efter
     det man pekar på (för plan: ovanför eller nedanför). Att släppa på ett rum och hoppas räcker inte.

     *Byggt för plan i biljett #35.* Linjen är en **kant på raden** och inget eget element, så den kan
     aldrig hamna fel när listan rullas. Den flyttas på plats under draget i stället för att listan ritas
     om: byts DOM ut mitt i ett drag försvinner den nod webbläsaren drar över, och då slutar den skicka
     `dragover` – linjen hade fastnat där den först hamnade, och planeraren släppt på en plats hon inte
     såg. Att listan står still under draget är också vad beslut 105 kräver.

     *Byggt för rum i biljett #38*, med samma kanter och samma skäl. Det som är rummens eget: ett
     **plan** är också ett droppmål, och märks då i sin helhet i stället för med en linje. Ett plan utan
     rum har ingen rad att lägga en linje på, och det är just det plan ett oplacerat rum oftast ska till.
107. **Stegen ser likadana ut överallt.** Byggnad får samma lodräta lista med steg som Planering har i dag –
     uppifrån och ner, där avklarade steg fälls ihop – och inte prototypens rutor från vänster till höger.
     Planeringens form finns redan och är inlärd, och enhetligheten är viktigare än vilken form som är bäst.
108. **Kök och Fikarum är rumstyper** (kök, diskrum; fika, pentry, personalrum), utöver dem i beslut 80.
109. **Inläsningsfilen har kolumnerna Rumstyp och Installationstyp.** Utan dem följer de typer planeraren
     valt inte med när filen tas ut och läses in igen – "BLC 2" och "Gillestuga" frågades om. Kolumnerna är
     **ifyllda när filen tas ut** och **valfria när man fyller i själv**: är de tomma föreslås typen ur
     benämningen som förut. Justerar beslut 80 och 81.
110. **Ett rumsnummer som krockar ger ett förslag.** Dras ett rum till ett plan där numret redan finns
     (Vindsförråd 05-001 till plan 03, som redan har 03-001) föreslås nästa lediga nummer. Annars hade två
     rum haft samma plan + nummer, och ingen vet vilket installationerna sitter i.

     *Byggt i biljett #37.* Krocken prövas **när raden blir klar** och inte vid inläsningen: planet kan
     självt vara ett förslag, och vilket rum raden pekar på vet man först när plan och nummer är
     avgjorda. Raden **står då kvar** som ett förslag med det nya numret i stället för att försvinna
     ner i byggnaden – planeraren ska se vad systemet gjorde med hennes rum, inte hitta det på en plats
     hon inte valde. Nummer som tas av rader som godtas i **samma** steg räknas som upptagna, annars
     hade ett *Godta alla* kunnat ge två rum samma nummer.

     *Gäller också rum som dras och läggs till för hand, från biljett #38.* Dras ett rum som redan ligger
     i byggnaden till ett plan där numret är upptaget byter rummet nummer direkt – det är ingen inläst rad
     som kan stå kvar och vänta, och flyttens text i historiken säger vilket nummer det fick
     ("flytta Entré till Källarplan som 00-002"). Lägger planeraren till ett rum för hand är ett upptaget
     nummer i stället ett **hinder** med nästa lediga i beskedet: där står hon och skriver, och ett nummer
     som tyst byttes under henne hade varit värre än ett nej.
111. **Modellen växer med stegen även när allt kommer från en fil** (preciserar beslut 85). I steget Plan
     visas bara planen som skal – i fel ordning ligger källaren överst, vilket gör förslaget om ordningen
     självklart. Rummen syns från steget Rum eller när Plan är grönt, installationerna från steget
     Installationer eller när Rum är grönt.

     *Rummen byggda i biljett #37:* de visas så fort de är **klara**, och det kräver ingen regel om
     vilket steg planeraren står i. Klara rader ligger i byggnaden (beslut 83) och förslag gör det
     inte, så modellen kan aldrig visa en gissning – ett plan vars rum alla är förslag står kvar som
     skal tills de godtas.

     *Byggt i biljett #35 för plan och skal.* Verktygsfältets utgråning hör hit: `uppdateraVerktyg()` i
     `ui.js` stänger av Innerväggar och Rumsnamn utan rum, Röntgen utan signifikanta installationer, och
     Ytterväggar, Tak, Översikt och Uppifrån utan plan – och lägger **skälet i knappens titel**, eftersom
     en utgråad knapp som inte säger varför är en gåta. Plan-gruppen får ett streck i stället för att stå
     tom, så att gruppen behåller sin plats och sin bredd.
112. **Det öppna ligger kvar överst.** Förslag och oplacerat ligger fast högst upp i steget medan listan med
     plan och rum rullas, så att man kan dra något till ett rum längst ner.

     *Byggt i biljett #36* (`.bf-oppet`, `position: sticky`). Gruppen fick också en **egen höjdgräns
     och egen rullning**: en fil med trettio förslag hade annars fyllt hela panelen, och då finns
     ingen lista med plan kvar att dra till – löftet hade ätit upp det det skulle tjäna.

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
5. **Flera byggnader** *(första utkast klart)*: huvudsteget **Balansering** med en årsbred tidsaxel, en rad
   per utförare som fälls ut till en rad per byggnad, belastning i timmar och dagar per vecka, de tre
   frågorna (områden man åker till, kapacitet, veckor utan tillsyn och skötsel), knappen **Balansera** med
   förklaringen i klartext, provisoriska flyttar och strykningar, flytt för hand med dra och släpp på tre
   nivåer och markeringen när planeringen ändrats sedan balanseringen. Planering fick ett **steg 6**,
   planerad tid ur en tidsschablon. Skissen `flerbyggnad.html` är borttagen (beslut 49); det i den som
   inte byggdes står som idé 10 i `ideer-och-resonemang.md`.
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
