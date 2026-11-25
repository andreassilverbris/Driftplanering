/*
 * Installationstypernas igenkänning: tabellen som gör en benämning till en installationstyp.
 *
 * Beslut 81 och 109, samma greppet som rumstyperna i `data/rumstyper.js`: typen föreslås ur
 * benämningen, så att den som fyller i inläsningsfilen inte behöver kunna systemets typer –
 * hon skriver "Handbrandsläckare 3" eller "Handbr.släckare 3" som i fastighetssystemet, och
 * systemet känner igen vad det är. Kolumnen Installationstyp finns ändå i filen (beslut 109):
 * den är ifylld när filen tas ut, så en typ planeraren själv valt följer med tur och retur i
 * stället för att gissas om igen.
 *
 * Skillnaden mot rumstyperna är vad som händer när **ingenting** känns igen. Ett rum får
 * förslaget *Övrigt rum* och kan godtas (beslut 80): modellen måste kunna ritas, och fel
 * rumstyp gör rummet felfärgat men inte oplacerat. En installation utan typ kan inte godtas
 * (beslut 81): **typen avgör vilka åtgärder som går att koppla**, så en gissning hade gett en
 * installation ingen tillsyn hittar. Därför är en okänd typ en fråga **utan förslag** – raden
 * blir oplacerad, och planeraren väljer typen ur listan.
 *
 * Tabellen är data och inte kod (beslut 99): mönstren ska gå att justera utan att tolkningen
 * rörs. Den ligger vid sidan av `DP.installationstyper` i stället för inuti den, eftersom
 * typerna bor i två filer (`data/hangar.js` och `data/katalog.js`) och mönstren hör ihop med
 * varandra: ordningen i tabellen *är* regeln, och den går inte att läsa när den är utspridd.
 *
 * Ordningen går från det mest utpekande till det minst: "Nödbelysningsarmatur" prövas före
 * "Luftbehandlingsaggregat" eftersom den senare bara behöver se ordet "aggregat", och
 * "Brandlarmscentral" före "Huvudcentral" så att den första inte blir en elcentral.
 */
(function () {
  'use strict';
  var DP = window.DP;

  // typ-id → mönster som benämningen känns igen på. Bara **signifikanta** typer står här:
  // fliken Installationer har bara signifikanta installationer (beslut 81), och de övriga
  // genereras ur rumstypen. Ett vägguttag i filen är ett misstag, inte en rad att tolka.
  DP.installationstypMonster = [
    // En förkortning skrivs både med och utan blanksteg före numret: "HC01" och "HC 01" är
    // samma huvudcentral i fastighetssystemet. `\b` räcker därför inte – mellan C och 0 finns
    // ingen ordgräns – så mönstret är `förkortningen följd av slut, blanksteg eller siffra`.
    ['brandlarmscentral',       [/^brandlarmscentral/i, /^brandlarmc/i, /^blc(\s|\d|$)/i]],
    ['nodbelysning',            [/^nödbelysning/i, /^nodbelysning/i, /^nödljus/i]],
    ['handbrandslackare',       [/^handbrandsläckare/i, /^handbr/i, /^brandsläckare/i, /^pulversläckare/i, /^skumsläckare/i]],
    ['brandpost',               [/^brandpost/i, /^inomhusbrandpost/i, /^slangrulle/i]],
    ['brandgaslucka',           [/^brandgaslucka/i, /^brandgasl/i, /^röklucka/i, /^roklucka/i]],
    ['utrymningsstege',         [/^utrymningsstege/i, /^utrymn/i, /^fasadstege/i]],
    ['skyddsrumsaggregat',      [/^skyddsrumsaggregat/i, /^skyddsrumsagg/i]],
    ['luftbehandlingsaggregat', [/^luftbehandlingsaggregat/i, /^luftbehandling/i, /^lb(\s|\d|$)/i, /^ftx/i, /^ventilationsaggregat/i]],
    ['flaktluftvarmare',        [/^fläktluftvärmare/i, /^flaktluftvarmare/i, /^fläktluftv/i, /^aerotemper/i]],
    // Panncentralens typer. "Värmepanna" står före undercentralen eftersom båda börjar på
    // "värme", och "Expansionskärl" före "Tryckkärl" eftersom båda slutar på "kärl" – det är
    // samma ordningsregel som brandlarmscentralen före huvudcentralen.
    ['varmepanna',              [/^värmepanna/i, /^varmepanna/i, /^panna(\s|\d|$)/i, /^pelletspanna/i, /^oljepanna/i, /^elpanna/i]],
    ['expansionskarl',          [/^expansionskärl/i, /^expansionskarl/i, /^exp\.?kärl/i]],
    ['cirkulationspump',        [/^cirkulationspump/i, /^cirk\.?pump/i, /^cp(\s|\d|$)/i]],
    ['skorsten',                [/^skorsten/i, /^rökkanal/i, /^rokkanal/i]],
    // Militärrestaurangens kök
    ['storkoksflakt',           [/^storköksfläkt/i, /^storkoksflakt/i, /^imkanalsfläkt/i, /^kökskåpa/i, /^imkåpa/i]],
    ['fettavskiljare',          [/^fettavskiljare/i, /^fettavskilj/i]],
    // Inte /^kylaggregat/: ordet ägs av A072 Kontroll kylaggregat, vars typ `kylaggregat`
    // ännu inte finns i katalogen. Att låta kylrummets aggregat svara på det hade gjort
    // A072 onåbar för alltid – en åtgärd ingen benämning längre kan nå.
    ['kylrumsaggregat',         [/^kylrumsaggregat/i, /^kylrumsagg/i, /^kylmaskin/i]],
    ['undercentral',            [/^undercentral/i, /^fjärrvärmecentral/i, /^värmeväxlare/i]],
    ['varmvattenberedare',      [/^varmvattenberedare/i, /^vvb(\s|\d|$)/i, /^beredare/i]],
    ['jordfelsbrytare',         [/^jordfelsbrytare/i, /^jfb(\s|\d|$)/i, /^jordfelsbr/i]],
    ['huvudcentral',            [/^huvudcentral/i, /^hc(\s|\d|$)/i, /^huvudelcentral/i]],
    ['gruppcentral',            [/^gruppcentral/i, /^gc(\s|\d|$)/i, /^elcentral/i]],
    ['apparatskap',             [/^apparatskåp/i, /^apparatskap/i, /^styrskåp/i, /^automatikskåp/i]],
    ['tvattmaskin',             [/^tvättmaskin/i, /^tvattmaskin/i]],
    ['torkskap',                [/^torkskåp/i, /^torkskap/i, /^torktumlare/i]],
    ['kompressor',              [/^tryckluftskompressor/i, /^kompressor/i]],
    ['tryckkarl',               [/^tryckkärl/i, /^tryckkarl/i, /^tryckluftstank/i]],
    ['personhiss',              [/^personhiss/i, /^hiss(\s|\d|$)/i, /^varuhiss/i]],
    ['travers',                 [/^travers/i, /^telfer/i, /^lyftkran/i]],
    ['pelarlyft',               [/^pelarlyft/i, /^fordonslyft/i, /^billyft/i]],
    ['garageport',              [/^garageport/i, /^vikport/i]],
    ['industriport',            [/^industriport/i, /^port(\s|\d|$)/i, /^skjutport/i, /^takskjutport/i]],
    ['dorrautomatik',           [/^dörrautomatik/i, /^dorrautomatik/i, /^dörrstängare/i, /^automatisk dörr/i]]
  ];

  // Installationstypen ur benämningen, eller null när ingen känns igen. Tabellens ordning är
  // regeln: det mest utpekande mönstret prövas först.
  //
  // Den bor här och inte i inläsningen, av samma skäl som `DP.rumstypFor`: samma fråga ställs
  // på två håll – inläsningen föreslår typen ur benämningen, och en installation planeraren
  // lägger till för hand behöver samma svar.
  DP.installationstypFor = function (benamning) {
    var t = benamning == null ? '' : String(benamning).trim();
    if (!t) { return null; }
    var funnen = null;
    DP.installationstypMonster.some(function (par) {
      // En typ som inte finns i katalogen är ett mönster utan hem: tabellen ska peka på
      // riktiga typer, och en typ som strukits ska inte kunna föreslås.
      if (!DP.installationstyper[par[0]]) { return false; }
      var traff = par[1].some(function (m) { return m.test(t); });
      if (traff) { funnen = par[0]; return true; }
      return false;
    });
    return funnen;
  };

  // Installationstypens id ur det som står i kolumnen Installationstyp (beslut 109).
  // Planeraren kan skriva antingen id:t (det filen bär när den tas ut) eller namnet hon ser i
  // gränssnittet – båda ska peka på samma typ, eftersom hon inte vet att det finns två
  // skrivsätt. Samma form som `DP.rumstypAv`.
  DP.installationstypAv = function (varde) {
    var t = varde == null ? '' : String(varde).trim();
    if (!t) { return null; }
    if (DP.installationstyper[t]) { return t; }
    var lag = t.toLowerCase(), funnen = null;
    Object.keys(DP.installationstyper).forEach(function (id) {
      if (DP.installationstyper[id].namn.toLowerCase() === lag) { funnen = id; }
    });
    return funnen;
  };

  // De typer planeraren kan välja bland i steg 4: de **signifikanta**, alltså de som
  // registreras som individer och kan ha kopplade åtgärder. En övrig installation är ingen
  // individ (beslut 81) och ska inte stå i en lista planeraren väljer ur.
  //
  // Frågan är "vilka typer finns i mönstertabellen?" och inte "vilka är inte kategori
  // ovrig?": tabellen är den lista som underhålls, och en typ utan mönster går ändå inte att
  // föreslå ur en benämning.
  DP.signifikantaTyper = function () {
    return DP.installationstypMonster
      .map(function (par) { return par[0]; })
      .filter(function (id) { return !!DP.installationstyper[id]; });
  };
})();
