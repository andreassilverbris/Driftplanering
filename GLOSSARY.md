# Driftplanering

Begreppen för planering av tillsyn och skötsel: från byggnaden och dess installationer, via åtgärder och ronder,
till rutintillfällen som fördelas över året och balanseras för utförarna. Beslut och etapper finns i
`docs/koncept-och-beslut.md`.

## Systemet

**Systemet**:
Det vi bygger: verktyget för att planera tillsyn och skötsel.
_Undvik_: Modellen (om verktyget)

**Fastighetssystemet**:
Det befintliga systemet där byggnader, plan, rum och installationer förvaltas i dag. Skrivs alltid ut, så att det inte blandas ihop med systemet.

**Modellen**:
3D-modellen av byggnaden, den som visas till höger.

## Byggnaden

**Byggnad**:
Ett hus som ska ha tillsyn och skötsel. Har plan, rum och installationer, och en byggnadstyp.

**Byggnadstyp**:
Den sortens byggnad det är (Garage, Kasern, Mindre logement, Hangar, Militärrestaurang, Utbildningsbyggnad, Panncentral). Ger planlösningens regel, utseendet, de vanliga rumstyperna och standardplaneringen, och avgör vilka byggnader planering kan kopieras mellan. En ny byggnad utgår alltid från en byggnadstyp.
_Undvik_: Mall, startbyggnad

**Mindre logement**:
En mindre och enklare byggd variant av kasern: 10–20 rum på ett eller två plan, ofta med toalett i varje rum.

**Militärrestaurang**:
Byggnad med storkök och matsal. Matsalen är det stora rummet och köket det som ger byggnaden dess tillsyn: storköksfläkt, fettavskiljare och kylrum.

**Utbildningsbyggnad**:
Byggnad med lektionssalar på båda sidor av en korridor, i ett eller flera plan. Många människor dagtid, som en kasern, men ingen bor där.

**Panncentral**:
Byggnad som finns för att producera värme. Ett stort pannrum med några birum, ingen som vistas där – och den enda byggnadstypen med ronden *Värme*.

**Plan, rum**:
Byggnadens våningar och rum. Planen har en beteckning (oftast 01) och benämning. Rummet har ett rumsnummer som löper per plan (001, 002 …) och pekas därför ut med plan + rumsnummer, skrivet 01-001.

**Rumstyp**:
Vad rummet är till (korridor, trapphus, WC, logement …). Avgör var rummet hamnar i modellen. Det som inte känns igen är *övrigt rum*.

**NTA, BRA, BTA**:
Nettoarea, bruksarea och bruttoarea enligt SS 21054. NTA är golvytan innanför väggarna och det mått ett rum alltid har. BRA och BTA mäts egentligen per plan, men kan anges per rum så att de går att summera uppåt.

**NTV**:
Nettovolym enligt SS 21054: rummets volym innanför väggarna. NTV ÷ NTA ger rumshöjden.

**Område**:
En grupp byggnader som ligger så nära varandra att avståndet inte spelar någon roll för veckoplaneringen.
_Undvik_: Kluster, zon

**Område man åker till**:
Ett område som ligger så långt bort att man vill samla besöken där till samma vecka.

## Inläsning

**Inläsning**:
Att föra in en byggnads plan, rum och installationer från en inläsningsfil. Det som är tydligt kommer in direkt, resten blir förslag eller hamnar som oplacerat tills planeraren tagit ställning.
_Undvik_: Import

**Inläsningsfil**:
En Excel-fil med tre flikar: Plan, Rum och Installationer. Man fyller i de flikar man har. När den tas ut innehåller den det som redan är inläst.
_Undvik_: Importfil, exportfil, mall

**Ta ut**:
Att få en inläsningsfil från systemet, tom för en ny byggnad eller ifylld för en befintlig.
_Undvik_: Exportera

**Förslag**:
Det systemet tror, visat så att planeraren kan godta eller ändra det. Gäller lika vid inläsning, planerad tid och strykning: systemet föreslår, planeraren bestämmer.

**Oplacerad**:
Något inläst som systemet inte kan avgöra var det hör hemma, och som planeraren drar på plats.

**Eget fält**:
En uppgift i inläsningsfilen som systemet inte känner till. Sparas, visas och följer med ut, men används inte till något.

## Installationer och åtgärder

**Signifikant installation**:
En installation som registreras som individ (id med 8 siffror) och ska ha minst en kopplad åtgärd.

**Installationstyp**:
Vad slags apparat en installation är: handbrandsläckare, brandlarmscentral, luftbehandlingsaggregat. Typen avgör vilka åtgärder som går att koppla, hur installationen ritas i modellen och vilken färg den får. Systemet läser den ur benämningen, och en typ det inte känner igen måste planeraren välja själv.
_Undvik_: Apparattyp, utrustningstyp

**Utbyte**:
Att en installations apparat byts mot en ny. Installationen, dess id och planering består; den gamla apparaten blir en utbytt version.

**Utbytt version**:
En apparat som suttit på en installations plats och bytts ut. Behålls som historik med installationens id och tillägget :1, :2 …
_Undvik_: Gammal installation, borttagen installation

**Rättelse**:
Att uppgifterna om en installations nuvarande apparat ändras för att de var fel. Ingen ny version uppstår.

**Övrig installation**:
En installation som inte registreras som individ. Kontrolleras översiktligt genom *Kontroll byggnad invändigt*.
_Undvik_: Ej signifikant (går bra i löptext, men begreppet heter övrig installation)

**Åtgärd**:
En post i bruttolistan, t.ex. *Kontroll handbrandsläckare*. Kopplas till installationer och läggs i en rond.

**Generell åtgärd**:
En åtgärd som gäller byggnaden som helhet i stället för en installation: *Kontroll byggnad invändigt* och *Kontroll byggnad utvändigt*.

**Bruttolista**:
Listan över alla åtgärder som finns att välja bland.

**Åtgärdstext**:
En åtgärds lista med kontrollpunkter. Finns i tre nivåer: standard, avvikande för en installation och avvikande i ett enskilt rutintillfälle.

**Tyngd**:
En grov bedömning av hur mycket arbete en åtgärd är per installation: lätt, normal eller tung. Används bara för att föreslå planerad tid.

## Planering

**Planering**:
Det man bestämmer för en byggnad i taget: besöksfrekvens, ronder, frekvens per rond, utförare och kopplade åtgärder.

**Besöksfrekvens**:
Hur ofta någon behöver vara i byggnaden.

**Rond**:
En grupp åtgärder som görs vid samma tillfälle och har samma frekvens och utförare (Byggnad invändigt, Brandskydd …).

**Värme**:
Ronden för värmeproduktionens egna installationer: värmepanna, expansionskärl och cirkulationspump. Finns i panncentralens standardplanering. Skild från *Ventilation*, eftersom en panna inte är ett luftbehandlingsaggregat och den som går ronden är värmetekniker.

**Frekvens**:
Ett rullande intervall i veckor och en startvecka. Visas som t.ex. "Varje månad = var 4:e vecka".

**Utförare**:
Den person som går en rond. Sätts på ronden och ärvs av alla dess åtgärder.
_Undvik_: Tekniker, resurs (i löptext går "tekniker" bra)

**Rutintillfälle**:
Ett konkret tillfälle då en rond ska utföras: en byggnad × en rond × en utförare × en vecka. Namnges `Byggnad-Rond-ÅÅÅÅvVV`.
_Undvik_: Arbetsorder, besök

**Planerad tid**:
Hur lång tid ett rutintillfälle förväntas ta, angivet i dagsdelar. Sätts per rond och byggnad, inte per åtgärd.

**Dagsdel**:
Den grova skalan för planerad tid: kort (≈1 h), kvartsdag, halvdag, heldag. Ett rutintillfälle ska rymmas på en dag.

**Ändrad förutsättning**:
Att en rond tar en annan tid än när dess planerade tid godkändes, för att åtgärderna i ronden ändrats eller
för att tiden är kopierad från en annan byggnad. Ronden markeras med det nya förslaget, men den godkända
tiden ändras aldrig av sig själv: den gäller tills planeraren använder förslaget eller behåller sin tid.
_Undvik_: Föråldrad tid, inaktuell tid

**Standardplanering**:
En färdig planering per byggnadstyp som man utgår från och justerar.

## Balansering

**Balansering**:
Att fördela alla byggnaders rutintillfällen över årets veckor så att varje utförare får en jämn belastning. Ändrar aldrig frekvenser, bara när tillfällena ligger.
_Undvik_: Driftbalansering, schemaläggning

**Kapacitet**:
Hur många dagar per vecka en utförare har för tillsyn och skötsel. Resten av veckan går till felavhjälpning och beställningar.

**Vecka utan tillsyn och skötsel**:
En vecka då inga rutintillfällen ska ligga, t.ex. under semestern.

**Besöksrytm**:
De veckor då en byggnad besöks. Förskjuts besöksrytmen följer byggnadens alla ronder med.

**Rondserie**:
Alla rutintillfällen för en rond i en byggnad under året.

**Permanent ändring**:
En ändring av planeringen som gäller alla kommande tillfällen, t.ex. att förskjuta en besöksrytm eller en rondserie.

**Ordinarie vecka**:
Den vecka ett rutintillfälle hör hemma i enligt planeringen: frekvensen plus byggnadens och rondseriens förskjutningar. Står still när tillfället flyttas provisoriskt.

**Faktisk vecka**:
Den vecka ett rutintillfälle ligger i. Samma som den ordinarie om tillfället inte är provisoriskt flyttat. Namnet bygger på den faktiska veckan.

**Provisorisk flytt**:
Ett enskilt rutintillfälle flyttas till en annan vecka utan att planeringen ändras. Frekvensen, förskjutningarna och den ordinarie veckan rörs inte – flytten gäller bara i år.

**Stryka**:
Att ta bort ett enskilt rutintillfälle som annars skulle hamna nära nästa ordinarie tillfälle.
_Föreslaget att strykas_ är inte struket: tillfället ligger kvar och räknas med tills planeraren säger ja.

**Ändrad planering**:
Att planeringen i en byggnad ändrats sedan balanseringen gjordes, så att balanseringen vilar på ett
underlag som inte längre stämmer. Förskjutningarna ligger kvar och ingenting räknas om av sig själv:
Balansering markeras, ändringarna listas, och planeraren balanserar om när hen vill.
_Undvik_: Ogiltig balansering, föråldrad balansering
