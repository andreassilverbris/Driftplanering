# Idéer och resonemang

Tankar som kommit upp under arbetet, nedskrivna så att vi kan återkomma till dem. Status anges per idé.
Se även `koncept-och-beslut.md` för fattade beslut och etapper.

---

## 1. Fler typbyggnader – Kaserner och Garage

**Status:** byggs i etapp 4.

Skola och bostadshus är struken. I stället:

- **Två kaserner i klassisk stil** (Kasern 1 och Kasern 2). Två av samma typ förbereder för planering av
  flera byggnader i en gemensam vy och för att kunna kopiera planering mellan byggnader.
- **Ett garage för två bilar.** En enkel byggnad med ett utrymme, två portar, självdragsventilation, lite
  belysning och en handbrandsläckare. Syftet är pedagogiskt: man börjar lära sig på något enkelt i stället för
  på hangaren, som har hög installationstäthet. Troligen räcker två ronder (Byggnad invändigt och Byggnad
  utvändigt) och ett eller två besök per år.

**Signifikant i garaget:** handbrandsläckaren och de två garageportarna. Portarna är signifikanta eftersom det
är avgörande att de går att öppna (beslut av beställaren). De har åtgärden *Kontroll garageport*, som föreslås i
ronden Byggnad utvändigt. Självdragsventilationen (galler), belysning, brytare och uttag är inte signifikanta.

### Hur en klassisk kasern är byggd (underlag för modellen)

- Lång, smal byggnad i tegel med sadeltak, tre våningar ovan mark, källare och vind.
- Lång mittkorridor med logement (sovsalar) på båda sidor. Två trapphus.
- Entréplan med expedition, vaktrum, dagrum, lektionssal, entré.
- Källare med undercentral (fjärrvärme), tvättstuga, torkrum, förråd, elcentral och skyddsrum.
- Vinden har fläktrum (ventilationen har byggts in i efterhand) och kallvind.
- Typiska signifikanta installationer: brandlarmscentral, brandposter, handbrandsläckare, nödbelysning,
  brandgasluckor i trapphusen, undercentral, luftbehandlingsaggregat, apparatskåp, elcentraler, tvättmaskiner,
  torkskåp, skyddsrumsaggregat och dörrautomatik vid entrén.

---

## 2. Kopiera planering mellan byggnader

**Status:** första version byggs i etapp 4.

Två likadana byggnader har oftast samma planering. I stället för att bygga upp den andra byggnaden från
grunden kopierar man allt från den första och justerar sedan det som skiljer.

### Så fungerar det

1. Man står i den byggnad som ska få planeringen (målbyggnaden) och väljer **Kopiera planering från …**.
2. Verktyget matchar installationerna mellan byggnaderna på **beteckning** (HB01 ↔ HB01) och typ.
   Allt annat följer med: besöksfrekvens, ronder, frekvens per rond, utförare, kopplade åtgärder och
   avvikande åtgärdstexter.
3. Innan kopieringen visas en sammanfattning:
   - hur många kopplingar som får en motsvarighet
   - vilka kopplingar som **saknar motsvarighet** (installationen finns inte i målbyggnaden)
   - vilka installationer i målbyggnaden som **saknar åtgärd** efter kopieringen
4. Efter kopieringen syns skillnaderna direkt. Installationer utan åtgärd kan blinka orange med
   *Visa de som saknar åtgärd*, så att man ser vad som återstår att justera.

### Varför matchning på beteckning

- Beteckningar (HB01, LB01 …) är det som är "samma" i två likadana byggnader. Id och externt id är alltid unika.
- Fungerar även när byggnaderna skiljer sig lite: det som inte matchar redovisas i stället för att gissas.

### Pedagogiken

- Kopiering är en enda åtgärd i historiken och kan ångras som allt annat.
- Kasern 2 har med flit några skillnader mot Kasern 1 (en hiss har byggts in i efterhand och tvättstugan
  har en tvättmaskin mindre). Då syns det tydligt vad man behöver justera efter en kopiering.

### Att utforska vidare

- Välja vid kopieringen om utförarna ska följa med eller bytas (t.ex. en annan tekniker för den andra byggnaden).
- **Förskjuta veckor** vid kopiering, så att två grannbyggnader inte får besök samma vecka. Det knyter an till
  flerbyggnadsvyn och belastningsbalansering.
- Kopiera **delar** av planeringen, t.ex. bara ronden Brandskydd.
- En "jämför byggnader"-vy som visar skillnaderna mellan två planeringar sida vid sida.

---

## 3. Standardplanering per byggnadstyp

**Status:** första version byggs i etapp 4.

### Idén

I stället för att bygga planeringen manuellt från grunden föreslår systemet en **standardplanering**
som utgångspunkt. Driftplaneraren justerar sedan det som behövs. Om justeringarna är snabba och intuitiva
är det troligen effektivare – och ofta också mer pedagogiskt – än att börja från noll.

### Vad som redan finns som grund

Verktyget vet redan vilka åtgärder som matchar vilka installationer, och varje åtgärd har en föreslagen rond.
Det som saknas är **vilka ronder** och **hur ofta**. Det kan definieras per byggnadstyp:

| Byggnadstyp | Besök | Ronder (frekvens) |
|---|---|---|
| Garage | Varje halvår | Byggnad invändigt, Byggnad utvändigt (samma som besöken) |
| Kasern | Varje månad | Byggnad invändigt (månad), Brandskydd (månad), Byggnad utvändigt (kvartal), Ventilation (kvartal), El (halvår) |
| Hangar | Varje månad | Byggnad invändigt (månad), Brandskydd (månad), Hiss (månad), Byggnad utvändigt (kvartal), Ventilation (kvartal), El (halvår) |

### Regler för att skapa standardplaneringen

1. Ta byggnadstypens ronder, frekvenser och utförare.
2. Koppla **alla** åtgärder som matchar installationer i byggnaden, plus de generella åtgärderna
   (Kontroll byggnad invändigt och utvändigt).
3. Varje åtgärd läggs i sin **föreslagna rond**. Finns inte den ronden i byggnadstypens standard läggs åtgärden
   i *Byggnad invändigt*. Det syns i garaget: handbrandsläckaren hamnar i Byggnad invändigt eftersom garaget
   inte har någon brandskyddsrond.
4. Allt görs som **ett steg i historiken**, med samma animering som när man lägger till åtgärder för hand.

### Pedagogiskt upplägg

- Knappen sitter överst i planeringen: *Använd standardplanering för Kasern*.
- Efteråt är alla fem stegen besvarade och visar vad som valts. Man kan öppna varje steg och ändra.
- Tanken är "utgå från en grund och justera", inte "acceptera blint".

### Frågor att utforska

- Var bor standardplaneringen i ett riktigt system? Troligen som en mall per byggnadstyp som förvaltas centralt.
- Ska standarden kunna bero på storlek eller installationstäthet, t.ex. fler ronder om byggnaden har många
  installationer?
- Ska man kunna spara sin egen justerade planering som ny mall?

---

## 4. Inläsning av plan, rum och installationer – och en genererad 3D-modell

**Status:** grillad 2026-11-24. Besluten står som 69–102 i `koncept-och-beslut.md` och går före det som
står här, där de skiljer sig (t.ex. en fil med tre flikar, rum identifierade av plan + rumsnummer, NTV för
rumshöjden och ett vägledande flöde i stället för en importvy). Texten nedan är kvar som bakgrund.

### Hur det fungerar i dag (i fastighetssystemet)

Plan, rum och signifikanta installationer registreras manuellt eller läses in med tre Excel-filer:
en för plan, en för rum och en för installationer. På sikt ska uppgifterna hämtas från Revit-modeller.

### Idé A: Läs in de tre Excel-filerna och generera en enkel 3D-modell

Man väljer byggnadstyp och läser sedan in plan, rum och installationer. Verktyget bygger en schematisk
3D-modell, ungefär som hangaren. Den behöver inte se ut som verkligheten. Det viktiga är att rummen finns,
hur stora de är och vilka signifikanta installationer som finns var.

**Vad filerna ger:**

| Fil | Innehåll som behövs |
|---|---|
| Plan | Planid, benämning, ordning (ger våningshöjd och ordning) |
| Rum | Rumsnummer, benämning, plan, area (BRA, BTA, NTA) |
| Installationer | Id, benämning, typ, fabrikat, modell, beteckning, externt id, rum |

**Det som saknas är rummens placering.** Rumsfilen har area men inte position eller form. Det måste
uppskattas. Förslag på en lokal, regelbaserad metod som klarar sig utan AI:

1. **Byggnadstypen ger en mall för planlösningen.** En kasern är en korridor med rum på båda sidor. En hangar
   är en stor hall med en kontorsdel. Ett garage är ett enda rum.
2. **Rum sorteras efter typ** (utifrån benämningen: Korridor, Trapphus, WC, Logement …) och placeras enligt mallen:
   korridoren i mitten, trapphusen jämnt fördelade, övriga rum längs korridoren.
3. **Arean ger rummets storlek.** Med ett standarddjup (t.ex. 6 m) blir bredden = area / djup.
   Korridorens längd blir summan av rumsbredderna.
4. **Installationer placeras i sitt rum** enligt typens normala montage (handbrandsläckare på vägg nära dörren,
   aggregat på golvet, belysning i taket).
5. **Standardutrustning läggs till som ej signifikant:** belysning, brytare, uttag och fönster i ytterväggar,
   på samma sätt som `genereraOvriga()` i `data/hangar.js` gör redan i dag.

Datamodellen och 3D-vyn är redan generiska nog: vyn bygger väggar, golv, fönster och tak från rummens
rektanglar. Det som behövs är en **layoutmotor** som räknar fram rektanglarna från rumslistan.

**Var behövs AI?** Troligen inte för grundmodellen, eftersom regler räcker för en schematisk bild. AI kan vara
värdefullt för att:

- tolka fria rumsbenämningar ("Logem. 3", "Sovsal 12") till rumstyper
- välja eller anpassa layoutmall när byggnaden inte passar en standardtyp
- placera installationer när rumsuppgiften saknas eller är otydlig

AI-anrop kräver nätverk och godkännande i en enterprise-miljö, så regelbaserad layout bör vara grunden
och AI ett tillval.

### Idé B: Läs in Revit-filer direkt

Det vore häftigt men är komplicerat:

- Revit-filer (.rvt) är ett slutet format och kan inte läsas direkt i webbläsaren. Vägen går via export,
  t.ex. **IFC** (öppet BIM-format) eller via Autodesks molntjänster.
- **IFC går att läsa i webbläsaren** med öppna bibliotek (t.ex. web-ifc / That Open Engine) som bygger på
  three.js, samma bibliotek som verktyget redan använder.
- IFC innehåller plan (IfcBuildingStorey), rum (IfcSpace), installationer (IfcFlowTerminal m.fl.) och
  geometrin. Då behövs ingen gissad layout.

Förslag på ordning: Excel och genererad modell först (idé A), IFC-import senare.

### Gemensamt för båda

- En **importvy** där man ser vad som lästs in och vad som saknas: rum utan plan, installationer utan rum,
  okända installationstyper.
- Inlästa byggnader får standardplaneringen (idé 3) som utgångspunkt.

### Huvudsteget Byggnad som vägledd process

I etapp 5 är huvudsteget Byggnad bara till för att orientera sig (beslut 42). Användaren ser framför sig att det
senare får egna processer med frågor, på samma sätt som Planering och Balansering: *ändra något i en befintlig
byggnad* eller *läsa in en ny byggnad*.

---

## 5. Verktyget som riktigt gränssnitt

**Status:** idé, parkerad (se även tidigare resonemang om adapterlager mot API).

Standardplanering, kopiering mellan byggnader och import gör att verktyget närmar sig något som kan användas
för riktig planering och inte bara för utbildning. Arkitekturen förbereder för det:

- Planeringen är rena data (`app/planering.js`), skilda från visningen.
- Alla ändringar går genom `Plan.andra()`, vilket gör det enkelt att senare skicka dem till ett API.
- Byggnader beskrivs i ett generiskt format (`data/*.js`) som kan fyllas från Excel, IFC eller ett API.

Användaren har bekräftat (2026-11-22) att verktyget får gå vidare mot en prototyp för hur ett
fastighetsstödsystem kan fungera ur ett driftperspektiv, och inte bara spegla dagens system. Exempel på sådant
som dagens system inte kan: kopiera en byggnads planering, koppla åtgärder automatiskt, ändra åtgärdstexter
per installation eller rutintillfälle. Om verktyget senare ska användas för att utbilda i exakt dagens system
behöver de delarna kunna stängas av.

---

## 6. Nedlagd tid och öppna rutintillfällen

**Status:** idé, ingår inte i etapp 5 (beslut 29). Hör till etapp 6, Utförande (beslut 30).

### Problemet i dag

Principen är att ett rutintillfälle påbörjas och avslutas samma dag, så att man vet hur lång tid det tog som
helhet. I praktiken avbryts ronden: kunden vill ha något fixat, man hittar ett fel och lagar det direkt eller åker
och hämtar verktyg och reservdelar. Då hinner man inte klart, rutintillfället måste vara öppet och man återkommer
dagen efter eller ännu senare. Då vet ingen längre hur lång tid själva tillfället tog.

I dagens system går det bara att registrera en tidpost per rutintillfälle. Alternativet är tid per åtgärd, men
det är orimligt i praktiken: 50 handbrandsläckare med en halv minut var går inte att registrera var för sig.

### Idén

- Ett rutintillfälle kan vara **öppet** och ha **flera arbetspass**. Vid varje pass registreras tiden för
  rutintillfället som helhet, aldrig per åtgärd.
- Summan av passen blir utfallet, som sedan jämförs med den planerade tiden (beslut 27). Planeraren tar ett
  aktivt beslut om den planerade tiden ska justeras.
- Avbrott för felavhjälpning bör registreras på det nya ärendet och inte på rutintillfället, så att utfallet
  inte blir missvisande.

---

## 7. Erfarenhetsvärden för planerad tid

**Status:** idé, senare än etapp 5.

Två fastighetssystem har försökt räkna om planerad tid automatiskt utifrån nedlagd tid, och användarens
erfarenhet är att det kan slå fel. Därför blir det inte automatiskt (beslut 27). Det som kan vara värt att
pröva senare: tid samlas från många byggnader och rutintillfällen och används för att förfina **tyngderna** per
åtgärd i bruttolistan, så att startförslaget blir bättre. Det påverkar bara förslaget, aldrig en tid som
planeraren redan har satt.

Förberett i etapp 5 (beslut 43): schablonen ligger som data, så att verklig statistik senare kan läggas in som ett
erfarenhetsvärde per åtgärd, och då gäller det i stället för tyngden.

---

## 8. Rutintillfällen som spänner över flera byggnader

**Status:** idé, ingår inte i etapp 5 (beslut 25).

Vissa drifttekniker vill ha åtgärder av samma typ i flera byggnader i ett och samma rutintillfälle
(rond × utförare × vecka i stället för byggnad × rond × utförare × vecka). Dagens fastighetssystem har stöd för
det, men bara en modell åt gången för hela planeringen. Här behöver den begränsningen inte finnas, men det gör
modellen mer komplex. Första steget är i stället att balanseringen lägger samma rond i närliggande byggnader i
samma vecka, och att telefonen grupperar dem ("Brandskydd v. 12: Kasern 1, Kasern 2").

---

## 9. Fler byggnadstyper och avlägsna områden

**Status:** idé, senare än etapp 5.

För att öva på balansering med områden (beslut 28) kan fler byggnadstyper läggas till: militärrestaurang,
avlägset förråd, mindre logement, skjutbana, skjuthall, brandövningsplats. Även avlägsna områden med några av
byggnadstyperna, så att det finns flera områden man måste åka till.

---

## 10. Det i skissen `flerbyggnad.html` som inte byggdes

**Status:** idé. Skrivet ner 2026-11-23 när skissen togs bort (beslut 49, biljett #19).

Skissen var en fristående sida med påhittade data som visade hur balansering av flera byggnader *kunde*
se ut, innan utformningen bestämdes i beslut 23–49. Det mesta av den är byggt i etapp 5, men i en annan
form: skissens tabell med en rad per byggnad och rond blev **en rad per utförare**, som fälls ut till en
rad per byggnad när man vill se vem arbetet hör till (beslut 47 – raderna är utförare, och brickorna bär
byggnadens färg). Belastningen är en egen rad per utförare med timmar, dagar och antal tillfällen per vecka
i stället för skissens färgnivåer.

Fem saker i skissen har ingen motsvarighet i det byggda. De är nedskrivna här för att inte försvinna
med skissen.

### A. Motivering som fritext när ett tillfälle stryks

Skissen frågade efter en **motivering (riskbedömning)** i fritext när ett tillfälle ströks, med
exempeltexten *"Brandlarmsprov utfört v50 i samband med service. Ingen risk att hoppa över."*
Motiveringen följde med i tillfällets etikett och i ändringsloggen.

Att stryka ett rutintillfälle är ett beslut om att något inte blir gjort i år, och i verkligheten
behöver det kunna försvaras i efterhand. Det byggda verktyget stryker utan att fråga varför
(beslut 45 och 64–66): strykningen är ett steg i historiken och går att ångra, men det finns ingen
plats att skriva *varför*.

Värt att pröva senare, men det hör egentligen till **etapp 6 Utförande**: en motivering är en uppgift om
verkligheten, inte om planen, och den hör ihop med att markera ett tillfälle som utfört. Då finns också
någon att visa motiveringen för.

### B. Ändringslogg över de provisoriska ändringarna

Skissen hade en lista i sidopanelen över varje provisorisk flytt och strykning, med en **Ångra-länk per
rad**. Listan sa vad som var provisoriskt i planen just nu, på ett ställe.

Det byggda verktyget visar i stället varje provisorisk flytt och strykning *där den ligger*, i tidsaxeln
och i veckolistan, med egna markeringar (⤺ för provisoriskt, ✂ för struket) och *Återställ* i veckolistan.
Historiken med ångra och gör om täcker att gå tillbaka, men bara i den ordning ändringarna gjordes –
skissens lista lät en ta tillbaka den tredje flytten utan att röra de två efter.

En samlad lista vore ändå värd att pröva: "det här är vad som avviker från planen i år" är en fråga en
driftplanerare ställer, och svaret finns i dag bara utspritt i tidsaxeln.

### C. Växeln "Visa ordinarie plan"

Skissen hade en knapp som växlade hela vyn till planen **utan** de provisoriska flyttarna, så att man
kunde jämföra avvikelsen med rytmen.

Det byggda verktyget visar båda på en gång i stället: en provisoriskt flyttad bricka ligger i sin faktiska
vecka med en ⤺-pil och säger i sin etikett vilken vecka den kom från. Det är färre klick, men det visar
inte hur **belastningen** hade sett ut utan flyttarna – och det var skissens poäng med växeln: att se om
flyttarna verkligen jämnade ut något.

### D. Spöket på den ordinarie platsen

I skissen lämnade en provisorisk flytt ett **spöke** (en streckad ruta) i den vecka tillfället kom ifrån,
och en etikett som sa vart det flyttat. Det byggda verktyget lämnar den ordinarie veckan tom; pilen på
brickan i den nya veckan är det som bär upplysningen.

En årsbred tidsaxel med fyra utförare har ont om plats, och ett spöke per flytt dubblar antalet brickor.
Men det går fortare att se *att* en vecka blivit tömd än att läsa sig till det ur en etikett. Värt att
pröva som ett tillval, kanske tillsammans med växeln i C.

### E. Rullande veckofönster från dagens vecka

Skissen visade **13 veckor framåt från dagens vecka**, över årsskiftet, med den första veckan märkt "nu".
Det byggda verktyget visar ett fast planeringsår (2027), vilket är enklare att undervisa på: alla ser
samma bild, och veckonumren betyder samma sak för alla.

Det här är redan en **öppen fråga** i `koncept-och-beslut.md` ("Ska planeringsåret vara fast eller rullande
från dagens vecka?"). Skissen svarade rullande, och det är vad en driftplanerare faktiskt arbetar i: man
planerar inte om januari i oktober. Ett rullande fönster tvingar också fram att ISO-år har 52 eller 53
veckor, vilket det fasta året slipper.

---

## 11. Administrationsgränssnitt för tabellerna

**Status:** idé, inte påbörjad (från grillningen 2026-11-24, beslut 99).

Byggnadstypernas planlösningsregler och rumstyper, standardplaneringen per typ och tidsschablonen
(hur lång tid det tar att kontrollera olika installationer) ligger som tabeller i datafilerna. I dag
justeras de där, i bakgrunden. Senare kan de få ett administrationsgränssnitt där en förvaltare ändrar
dem utan att röra filerna – samma tanke som att standardplaneringen i ett riktigt system förvaltas
centralt (idé 3).

## 12. Flytta rondserier och rutintillfällen till en annan utförare

**Status:** biljett #29 (`needs-triage`), ska grillas för sig.

I Balansering ska man kunna flytta en rond eller ett rutintillfälle till en annan utförare, inte bara till
en annan vecka. Det krockar med beslut 46 (balanseringen byter aldrig utförare) och med ordlistans
definition av rutintillfälle, så det behöver en egen grillning.
