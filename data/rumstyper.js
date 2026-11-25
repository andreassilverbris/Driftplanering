/*
 * Rumstyperna: tabellen som gör en benämning till en rumstyp.
 *
 * Beslut 80, 99 och 108: rumstypen läses ur benämningen, så att den som fyller i
 * inläsningsfilen inte behöver kunna systemets typer – hon skriver "Korr.", "WC/D" eller
 * "Logement 2:4" som i fastighetssystemet, och systemet känner igen vad det är. Kolumnen
 * Rumstyp finns ändå i filen (beslut 109): den är ifylld när filen tas ut, så en typ
 * planeraren själv valt följer med tur och retur i stället för att gissas om igen.
 *
 * Tabellen är **data och inte kod** (beslut 99): mönstren och standard-NTA ska gå att justera
 * utan att tolkningen rörs, och ett administrationsgränssnitt för dem är idé 11.
 *
 * Varje typ bär fyra saker:
 *
 *   namn       Det planeraren ser: "WC/Dusch", "Logement".
 *   kategori   Rummets sort i modellen (`kommunikation`, `personal`, `kontor`, `forrad`,
 *              `teknik`) – det viewern färgar golvet efter. Kategorierna är de som redan
 *              finns i de handritade byggnaderna, så ett inläst rum ser ut som ett ritat.
 *   nta        Standard-NTA i m², det en saknad NTA föreslås bli (beslut 79 och
 *              berättelse 40). Modellen måste kunna ritas, och en korridor är lång och
 *              smal medan ett WC är litet – ett gemensamt standardvärde hade gett en
 *              byggnad där allt är lika stort.
 *   monster    Det benämningen känns igen på. Reguljära uttryck, prövade i tabellens
 *              ordning: det mest utpekande först, så att "Tvättstuga" inte blir ett
 *              trapphus för att båda bär ett "t".
 *
 * Ordningen i tabellen är alltså en del av regeln. Korridor och trapphus står först
 * eftersom de är de rum varje plan har, och *övrigt rum* finns inte i tabellen alls: det är
 * svaret när ingenting matchar, och planeraren byter det med ett klick (beslut 80).
 */
(function () {
  'use strict';
  var DP = window.DP;

  DP.rumstyper = {
    korridor:  { namn: 'Korridor', kategori: 'kommunikation', nta: 96,
      monster: [/^korr/i, /\bkorridor/i, /^gång/i] },
    trapphus:  { namn: 'Trapphus', kategori: 'kommunikation', nta: 24,
      monster: [/^trapp/i, /\btrapphus/i, /^tr\.?hus/i] },
    entre:     { namn: 'Entré', kategori: 'kommunikation', nta: 48,
      monster: [/^entr/i, /^vindfång/i, /^foaj/i, /^hall\b/i] },
    logement:  { namn: 'Logement', kategori: 'kontor', nta: 36,
      monster: [/^logem/i, /^log\.?\s*\d/i, /^sovsal/i, /^sovrum/i] },
    wcdusch:   { namn: 'WC/Dusch', kategori: 'personal', nta: 36,
      monster: [/^wc/i, /^dusch/i, /^toalett/i, /^rwc/i, /^hygien/i] },
    stad:      { namn: 'Städ', kategori: 'teknik', nta: 18,
      monster: [/^städ/i, /^stad\b/i] },
    teknik:    { namn: 'Teknikutrymme', kategori: 'teknik', nta: 42,
      monster: [/^teknik/i, /^fläktrum/i, /^flaktrum/i, /^undercentral/i, /^elrum/i,
        /^elcentral/i, /^ställverk/i, /^apparatrum/i, /^pannrum/i, /^maskinrum/i] },
    tvatt:     { namn: 'Tvätt och tork', kategori: 'personal', nta: 48,
      monster: [/^tvätt/i, /^tvatt/i, /^tork/i] },
    forrad:    { namn: 'Förråd', kategori: 'forrad', nta: 72,
      monster: [/förråd/i, /forrad/i, /^lager/i, /^materiel/i] },
    skyddsrum: { namn: 'Skyddsrum', kategori: 'teknik', nta: 84,
      monster: [/^skyddsrum/i] },
    kok:       { namn: 'Kök', kategori: 'personal', nta: 60,
      monster: [/^kök/i, /^kok\b/i, /^diskrum/i, /^disk\b/i] },
    fikarum:   { namn: 'Fikarum', kategori: 'personal', nta: 36,
      monster: [/^fika/i, /^pentry/i, /^personalrum/i, /^matsal/i] },
    kontor:    { namn: 'Kontor', kategori: 'kontor', nta: 24,
      monster: [/^kontor/i, /expedition/i, /^lektionssal/i, /^lektion/i, /^mötesrum/i,
        /^konferens/i, /^vaktrum/i] },
    // "Gillestuga" står **inte** här med flit: den är exemplet i beslut 109 på en benämning
    // systemet inte känner igen, och den som fyller i den filen ska mötas av förslaget
    // *Övrigt rum* och kolumnen Rumstyp – inte av en gissning som råkar bli rätt.
    dagrum:    { namn: 'Dagrum', kategori: 'personal', nta: 72,
      monster: [/^dagrum/i, /^uppehållsrum/i] }
  };

  // Svaret när ingenting matchar (beslut 80). Det är en riktig rumstyp och inget felläge:
  // modellen ska kunna ritas, och planeraren byter typen med ett klick.
  DP.rumstypOvrig = 'ovrigt';
  DP.rumstyper[DP.rumstypOvrig] = { namn: 'Övrigt rum', kategori: 'forrad', nta: 36, monster: [] };

  // Rumstypen ur benämningen, eller null när ingen känns igen. Tabellens ordning är regeln:
  // det mest utpekande mönstret prövas först.
  //
  // Den bor här och inte i inläsningen, eftersom samma fråga ställs på två håll: inläsningen
  // föreslår typen ur benämningen, och en byggnad som fylls i för hand behöver samma svar.
  DP.rumstypFor = function (benamning) {
    var t = benamning == null ? '' : String(benamning).trim();
    if (!t) { return null; }
    var funnen = null;
    Object.keys(DP.rumstyper).some(function (id) {
      var monster = DP.rumstyper[id].monster || [];
      var traff = monster.some(function (m) { return m.test(t); });
      if (traff) { funnen = id; return true; }
      return false;
    });
    return funnen;
  };

  // Rumstypens id ur det som står i kolumnen Rumstyp (beslut 109). Planeraren kan skriva
  // antingen id:t (det filen bär när den tas ut) eller namnet hon ser i gränssnittet – båda
  // ska peka på samma typ, eftersom hon inte vet att det finns två skrivsätt.
  DP.rumstypAv = function (varde) {
    var t = varde == null ? '' : String(varde).trim();
    if (!t) { return null; }
    if (DP.rumstyper[t]) { return t; }
    var lag = t.toLowerCase(), funnen = null;
    Object.keys(DP.rumstyper).forEach(function (id) {
      if (DP.rumstyper[id].namn.toLowerCase() === lag) { funnen = id; }
    });
    return funnen;
  };
})();
