# Driftplanering

Begreppen för planering av tillsyn och skötsel: från byggnaden och dess installationer, via åtgärder och ronder,
till rutintillfällen som fördelas över året och balanseras för utförarna. Beslut och etapper finns i
`docs/koncept-och-beslut.md`.

## Byggnaden

**Byggnad**:
Ett hus som ska ha tillsyn och skötsel. Har plan, rum och installationer, och en byggnadstyp.

**Byggnadstyp**:
Den sortens byggnad det är (Garage, Kasern, Hangar …). Ger standardplaneringen och avgör vilka byggnader planering kan kopieras mellan.

**Plan, rum**:
Byggnadens våningar och rum. Egna objekt med id och benämning; rumsnummer är plansiffra plus löpnummer.

**Område**:
En grupp byggnader som ligger så nära varandra att avståndet inte spelar någon roll för veckoplaneringen.
_Undvik_: Kluster, zon

**Område man åker till**:
Ett område som ligger så långt bort att man vill samla besöken där till samma vecka.

## Installationer och åtgärder

**Signifikant installation**:
En installation som registreras som individ (id med 8 siffror) och ska ha minst en kopplad åtgärd.

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

**Provisorisk flytt**:
Ett enskilt rutintillfälle flyttas till en annan vecka utan att planeringen ändras.

**Stryka**:
Att ta bort ett enskilt rutintillfälle som annars skulle hamna nära nästa ordinarie tillfälle.
