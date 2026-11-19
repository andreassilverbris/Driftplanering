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

| Begrepp | Betydelse |
|---|---|
| Byggnad, plan, rum | Fysisk struktur. Plan och rum är egna objekt med id och benämning. |
| Signifikant installation | Registreras som individ (id med 8 siffror). Ska ha kopplad åtgärd. Klickbar. |
| Övrig installation | Registreras inte. Syns i modellen men är inte klickbar. Kontrolleras översiktligt i *Kontroll byggnad invändigt*. |
| Åtgärd | Post i bruttolistan, t.ex. *Kontroll handbrandsläckare*. |
| Åtgärdstext | Lista med **kontrollpunkter**. |
| Rond | Det man planerar mot (Byggnad invändigt, Brandskydd …). |
| Rutintillfälle | Genereras per byggnad × utförare × rond × vecka, namn `Byggnad-Rond-ÅÅÅÅvVV`. |

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
13. **Åtgärdstexter i tre nivåer** (förslag C) – byggt. En text sparas bara på en nivå om den faktiskt
    skiljer sig från nivån ovanför. Avvikelser tas bort när kopplingen tas bort. Ändringar gäller sessionen
    och nollställs när sidan laddas om.
14. **Ändring i telefonen → "I alla rutintillfällen"** betyder alla rutintillfällen för just den installationen
    (installationsnivån). Ändring av standardtexten görs i bruttolistan.
12. **Samma åtgärd delas inte upp på flera ronder.** Om man svarar Nej på "samma tillfälle" visas en förklaring
    i stället för att det går att genomföra.

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
utförarens färg i tidsaxeln och i flerbyggnadsvyn. Om en enskild åtgärd har en annan utförare än ronden
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
4. **Fler typbyggnader:** skola och bostadshus.
5. **Flera byggnader:** belastning per utförare, provisoriska flyttar, stryka tillfällen *(skiss finns i `flerbyggnad.html`)*.
6. **(Senare)** adapterlager mot riktigt API.

## Öppna frågor

- Kapacitet i flerbyggnadsvyn: räkna i timmar (kräver tidsuppskattning per rond och byggnad) eller i antal rutintillfällen?
- Hur många veckor före nästa ordinarie tillfälle ska verktyget föreslå att ett tillfälle stryks? (Skissen använder 1 vecka.)
- Ska en rond kunna ha en annan utförare för en enskild åtgärd? (Inte byggt – utföraren gäller hela ronden.)
- Ska planeringsåret vara fast (2027) eller rullande från dagens vecka?
