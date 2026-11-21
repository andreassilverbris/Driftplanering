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

**Status:** idé, inte påbörjad.

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

---

## 5. Verktyget som riktigt gränssnitt

**Status:** idé, parkerad (se även tidigare resonemang om adapterlager mot API).

Standardplanering, kopiering mellan byggnader och import gör att verktyget närmar sig något som kan användas
för riktig planering och inte bara för utbildning. Arkitekturen förbereder för det:

- Planeringen är rena data (`app/planering.js`), skilda från visningen.
- Alla ändringar går genom `Plan.andra()`, vilket gör det enkelt att senare skicka dem till ett API.
- Byggnader beskrivs i ett generiskt format (`data/*.js`) som kan fyllas från Excel, IFC eller ett API.
