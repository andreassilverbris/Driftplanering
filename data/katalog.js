/*
 * Utökning av den gemensamma katalogen: fler installationstyper och åtgärder för kaserner och garage,
 * byggnadstyper med standardplanering, och en hjälpfunktion som genererar ej signifikanta installationer.
 * Laddas efter data/hangar.js (som innehåller grundkatalogen).
 */
(function () {
  'use strict';
  var DP = window.DP;

  // ---------------- Installationstyper ----------------
  var nyaTyper = {
    undercentral:       { namn: 'Undercentral fjärrvärme', kategori: 'vvs',     montage: 'golv' },
    tvattmaskin:        { namn: 'Tvättmaskin',             kategori: 'maskin',  montage: 'vagg' },
    torkskap:           { namn: 'Torkskåp',                kategori: 'maskin',  montage: 'vagg' },
    skyddsrumsaggregat: { namn: 'Skyddsrumsaggregat',      kategori: 'vvs',     montage: 'vagg' },
    brandgaslucka:      { namn: 'Brandgaslucka',           kategori: 'brand',   montage: 'tak' },
    dorrautomatik:      { namn: 'Dörrautomatik',           kategori: 'byggnad', montage: 'vagg' },
    nodbelysning:       { namn: 'Nödbelysningsarmatur',    kategori: 'brand',   montage: 'vagg' },
    garageport:         { namn: 'Garageport',              kategori: 'byggnad', montage: 'fasad' },
    // Panncentralen (beslut 72 och 99): byggnaden finns för att producera värme, så dess
    // installationer är värmeproduktionens egna. De får ronden **Värme** och inte Ventilation:
    // en panna är inte ett luftbehandlingsaggregat, och den som går ronden är värmetekniker.
    varmepanna:         { namn: 'Värmepanna',              kategori: 'vvs',     montage: 'golv' },
    expansionskarl:     { namn: 'Expansionskärl',          kategori: 'vvs',     montage: 'golv' },
    cirkulationspump:   { namn: 'Cirkulationspump',        kategori: 'vvs',     montage: 'vagg' },
    skorsten:           { namn: 'Skorsten',                kategori: 'byggnad', montage: 'utsida' },
    // Militärrestaurangens kök
    storkoksflakt:      { namn: 'Storköksfläkt',           kategori: 'vvs',     montage: 'tak' },
    fettavskiljare:     { namn: 'Fettavskiljare',          kategori: 'vvs',     montage: 'golv' },
    kylrumsaggregat:    { namn: 'Kylrumsaggregat',         kategori: 'vvs',     montage: 'vagg' },
    // Ej signifikanta
    ventilationsgaller: { namn: 'Ventilationsgaller',      kategori: 'ovrig',   montage: 'vagg' }
  };
  Object.keys(nyaTyper).forEach(function (k) { DP.installationstyper[k] = nyaTyper[k]; });

  DP.ejSignifikantForklaring.ventilationsgaller = 'Självdragsventilation utan fläkt. Kontrolleras i åtgärden Kontroll byggnad invändigt.';

  // ---------------- Åtgärder ----------------
  [
    { id: 'A045', namn: 'Kontroll brandgaslucka', galler: ['brandgaslucka'], foreslagenRond: 'BS',
      kontrollpunkter: ['Att luckan öppnar vid provning', 'Att manöverdon och skylt finns i trapphusets nedre del', 'Att luckan stänger och tätar', 'Att inga hinder finns runt luckan'] },
    { id: 'A053', namn: 'Kontroll garageport', galler: ['garageport'], foreslagenRond: 'BU',
      kontrollpunkter: ['Att porten går att öppna och stänga hela vägen', 'Att porten stannar kvar i öppet läge', 'Att fjädrar och linor är hela', 'Att lås och handtag fungerar', 'Att gångjärn och rullar är smorda', 'Att tätningslister är hela'] },
    { id: 'A052', namn: 'Kontroll dörrautomatik', galler: ['dorrautomatik'], foreslagenRond: 'BI',
      kontrollpunkter: ['Att dörren öppnar och stänger mjukt', 'Att närvarogivare och klämskydd fungerar', 'Att nödöppning fungerar', 'Att manöverknapp är hel'] },
    { id: 'A075', namn: 'Kontroll skyddsrum', galler: ['skyddsrumsaggregat'], foreslagenRond: 'BI',
      kontrollpunkter: ['Att aggregatet startar vid provkörning', 'Att filter och tätningar är hela', 'Att gastäta dörrar går att stänga', 'Att utrustningsförteckning finns', 'Att skyddsrummet är fritt från otillåtet förråd'] },
    { id: 'A092', namn: 'Kontroll torkskåp', galler: ['torkskap'], foreslagenRond: 'BI',
      kontrollpunkter: ['Att värme och fläkt fungerar', 'Att timer fungerar', 'Att luddfilter är rent', 'Att dörren stänger tätt'] },
    // Panncentralens åtgärder hamnar i ronden **Värme** (beslut 99). Undercentralen behåller
    // sin BI: den sitter i varje byggnad som tar emot fjärrvärme, och en byggnad utan
    // värmerond ska inte tappa den.
    { id: 'A100', namn: 'Kontroll värmepanna', galler: ['varmepanna'], foreslagenRond: 'VA',
      kontrollpunkter: ['Att panntryck och panntemperatur ligger inom driftområdet', 'Att brännaren startar och stannar som den ska', 'Att inga läckage finns vid pannan eller dess ventiler', 'Att larmindikeringar är släckta', 'Att pannrummets tillluft är fri'] },
    { id: 'A101', namn: 'Kontroll expansionskärl', galler: ['expansionskarl'], foreslagenRond: 'VA',
      kontrollpunkter: ['Att förtryck och vattennivå är rätt', 'Att säkerhetsventilen inte läcker', 'Att kärlet är fritt från korrosion'] },
    { id: 'A102', namn: 'Kontroll cirkulationspump', galler: ['cirkulationspump'], foreslagenRond: 'VA',
      kontrollpunkter: ['Att pumpen går utan missljud', 'Att varvtal och driftläge stämmer med inställningen', 'Att inga läckage finns vid packboxen'] },
    { id: 'A103', namn: 'Kontroll skorsten', galler: ['skorsten'], foreslagenRond: 'BU',
      kontrollpunkter: ['Att stag och infästningar är hela', 'Att inga sprickor eller rostskador syns', 'Att sotlucka går att öppna och stänga', 'Att stegar och fallskydd är hela'] },
    // Militärrestaurangens kök: storköket är det som skiljer byggnaden från ett kontor.
    { id: 'A110', namn: 'Kontroll storköksfläkt', galler: ['storkoksflakt'], foreslagenRond: 'VE',
      kontrollpunkter: ['Att fläkten startar och går utan missljud', 'Att fettfilter är rengjorda och hela', 'Att imkanalens rensluckor är åtkomliga', 'Att brandspjäll löser ut vid provning'] },
    { id: 'A111', namn: 'Kontroll kylrumsaggregat', galler: ['kylrumsaggregat'], foreslagenRond: 'KY',
      kontrollpunkter: ['Att temperaturen håller inställt värde', 'Att larm vid temperaturavvikelse fungerar', 'Att kondensor är ren', 'Att dörr och tätningslist är hela', 'Att nödöppning inifrån fungerar'] }
  ].forEach(function (a) { DP.atgarder.push(a); });

  // ---------------- Områden ----------------
  // Närhet anges med områden (beslut 28). Ett område är byggnader som ligger så nära varandra
  // att avståndet inte spelar någon roll för veckoplaneringen. Ett område man åker till ligger
  // så långt bort att man vill samla besöken där till samma vecka; vilka de är svarar planeraren
  // på i Balansering, och Flygfältet är förvalt.
  DP.omraden = [
    { id: 'kasernomradet', namn: 'Kasernområdet', beskrivning: 'Byggnaderna ligger inom gångavstånd från varandra.' },
    { id: 'flygfaltet', namn: 'Flygfältet', beskrivning: 'Ligger en bit bort – dit åker man.', akerTill: true }
  ];

  // ---------------- Byggnadstyper och standardplanering ----------------
  //   freq: 'bas' = samma som besöken, annars { typ, startManad }
  //
  // Byggnadstypen är mallen (beslut 72): den ger standardplaneringen och – för en byggnad
  // planeraren skapar själv – utseendet, måtten modellen ritas med och **planlösningens
  // regel** (beslut 78 och 99): hur rummen placeras ut när de läses in ur en fil.
  // `stil` och `konstanter` har samma form som i datafilerna under `data/`, så en skapad
  // byggnad och en handritad är samma sorts data.
  //
  // `planlosning` är regelns parametrar, inte regeln själv – uträkningen bor i
  // `DP.Planlosning.laggUtRum`. Två regler finns:
  //
  //   `korridor`  En korridor längs byggnaden med rum på båda sidor, i nummerordning
  //               medurs runt korridoren (kasernens form). `korrBredd` är korridorens
  //               djup i meter och `djup` byggnadens, så rumsdjupet blir
  //               (djup − korrBredd) ÷ 2.
  //   `hall`      Ett enda stort utrymme med rummen i en rad längs ena långsidan
  //               (garagets och hangarens form). Inget rum ligger inne i ett annat.
  //
  // Måtten är **riktmärken**: rummens bredd kommer ur NTA, så en byggnad med stora rum blir
  // längre än `langd` säger. Det är schematiskt med flit (beslut 78) – följer verklighetens
  // numrering inte regeln blir modellen schematisk, inte fel.
  DP.byggnadstyper = {
    garage: {
      namn: 'Garage',
      planlosning: { regel: 'hall', djup: 12, langd: 24 },
      stil: { tak: 'sadel', sadel: { bas: 2.8, hojd: 2.2 }, ytterFarg: 0xc9b89a, takFarg: 0x4d4f52, portSida: 'N',
        fonster: { bredd: 1.0, steg: 4, hojd: 0.8, brost: 1.4 } },
      konstanter: { PLANHOJD: 2.8, BJALKLAG: 0.2, FRIHOJD: 2.8 },
      standard: {
        bas: { typ: 'halvar', startManad: 4 },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: 'bas', utforare: 'anna' }
        ]
      },
      motivering: 'En enkel byggnad med få installationer. Två besök per år räcker. Allt görs i två ronder.'
    },
    kasern: {
      namn: 'Kasern',
      planlosning: { regel: 'korridor', djup: 14, korrBredd: 2, langd: 48 },
      stil: { tak: 'sadel', sadel: { bas: 10.3, hojd: 3.0 }, ytterFarg: 0xd9d2c4, takFarg: 0x6b4b3a },
      konstanter: { PLANHOJD: 3.5, BJALKLAG: 0.2, FRIHOJD: 3.3 },
      standard: {
        bas: { typ: 'manad', startManad: null },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: { typ: 'kvartal', startManad: null }, utforare: 'anna' },
          { id: 'BS', freq: 'bas', utforare: 'bertil' },
          { id: 'VE', freq: { typ: 'kvartal', startManad: null }, utforare: 'cecilia' },
          { id: 'EL', freq: { typ: 'halvar', startManad: 3 }, utforare: 'cecilia' }
        ]
      },
      motivering: 'Bostadsliknande byggnad med många människor. Brandskydd och invändig kontroll varje månad, ventilation och utvändigt varje kvartal, el varje halvår.'
    },
    hangar: {
      namn: 'Hangar',
      planlosning: { regel: 'hall', djup: 30, langd: 60 },
      stil: { tak: 'platt', ytterFarg: 0xb9c0c7, takFarg: 0x8d969e },
      konstanter: { PLANHOJD: 3.5, BJALKLAG: 0.2, FRIHOJD: 3.3 },
      standard: {
        bas: { typ: 'manad', startManad: null },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: { typ: 'kvartal', startManad: null }, utforare: 'anna' },
          { id: 'BS', freq: 'bas', utforare: 'bertil' },
          { id: 'VE', freq: { typ: 'kvartal', startManad: null }, utforare: 'cecilia' },
          { id: 'EL', freq: { typ: 'halvar', startManad: 2 }, utforare: 'cecilia' },
          { id: 'HI', freq: 'bas', utforare: 'david' }
        ]
      },
      motivering: 'Hög installationstäthet. Egna ronder för brandskydd, ventilation, el och hiss.'
    },
    // De fyra typerna i beslut 72. Var och en bär samma fyra saker som de tre ovan –
    // planlösningens regel, utseendet, måtten och standardplaneringen – och ingenting mer:
    // en typ är data, så en femte typ kräver ingen ändring i koden (beslut 99).
    logement: {
      namn: 'Mindre logement',
      // Samma korridorsregel som kasernen men smalare och kortare: 10–20 rum på ett eller
      // två plan (beslut 72). Djupet rymmer ett logement med egen toalett på var sida.
      planlosning: { regel: 'korridor', djup: 11, korrBredd: 1.8, langd: 24 },
      stil: { tak: 'sadel', sadel: { bas: 6.4, hojd: 2.4 }, ytterFarg: 0xd6c9ae, takFarg: 0x5d4a3c,
        fonster: { bredd: 1.1, steg: 3.2, hojd: 1.2, brost: 1.0 } },
      konstanter: { PLANHOJD: 3.0, BJALKLAG: 0.2, FRIHOJD: 2.8 },
      standard: {
        bas: { typ: 'manad', startManad: null },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: { typ: 'kvartal', startManad: null }, utforare: 'anna' },
          { id: 'BS', freq: 'bas', utforare: 'bertil' },
          { id: 'EL', freq: { typ: 'halvar', startManad: 4 }, utforare: 'cecilia' }
        ]
      },
      motivering: 'Som en kasern men mindre: få installationer och ingen egen ventilationsrond. ' +
        'Brandskydd och invändig kontroll varje månad, utvändigt varje kvartal, el varje halvår.'
    },
    restaurang: {
      namn: 'Militärrestaurang',
      // Matsalen dominerar planet, som hangarens flyghall gör: hallregeln ger den resten av
      // planet och lägger kök, kyl och personalrum i en rad längs ena långsidan. `langd` är
      // **skalets** mått: så snart planet har rum räknas längden ur deras NTA, som i garaget
      // och hangaren. Talet är alltså den tomma byggnaden planeraren ser i steg 2 (beslut 85).
      planlosning: { regel: 'hall', djup: 20, langd: 36 },
      stil: { tak: 'platt', ytterFarg: 0xe0d6c3, takFarg: 0x7a7f84,
        fonster: { bredd: 1.6, steg: 3.0, hojd: 1.8, brost: 0.9 } },
      konstanter: { PLANHOJD: 3.6, BJALKLAG: 0.2, FRIHOJD: 3.4 },
      standard: {
        bas: { typ: 'manad', startManad: null },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: { typ: 'kvartal', startManad: null }, utforare: 'anna' },
          { id: 'BS', freq: 'bas', utforare: 'bertil' },
          { id: 'VE', freq: 'bas', utforare: 'cecilia' },
          { id: 'KY', freq: 'bas', utforare: 'cecilia' },
          { id: 'EL', freq: { typ: 'halvar', startManad: 3 }, utforare: 'cecilia' }
        ]
      },
      motivering: 'Storkök med livsmedel: ventilation och kyla varje månad, inte varje kvartal. ' +
        'Ett kylrum som står still en vecka är förstörda livsmedel.'
    },
    utbildning: {
      namn: 'Utbildningsbyggnad',
      // Lektionssalar på båda sidor av en korridor. Djupare än kasernen – en lektionssal är
      // större än ett logement – och korridoren bredare, eftersom hela kullar rör sig i den.
      planlosning: { regel: 'korridor', djup: 16, korrBredd: 2.6, langd: 40 },
      stil: { tak: 'platt', ytterFarg: 0xcdd3d8, takFarg: 0x82888d,
        fonster: { bredd: 1.8, steg: 3.4, hojd: 1.6, brost: 1.0 } },
      konstanter: { PLANHOJD: 3.4, BJALKLAG: 0.2, FRIHOJD: 3.2 },
      standard: {
        bas: { typ: 'manad', startManad: null },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: { typ: 'kvartal', startManad: null }, utforare: 'anna' },
          { id: 'BS', freq: 'bas', utforare: 'bertil' },
          { id: 'VE', freq: { typ: 'kvartal', startManad: null }, utforare: 'cecilia' },
          { id: 'EL', freq: { typ: 'halvar', startManad: 2 }, utforare: 'cecilia' }
        ]
      },
      motivering: 'Många människor i lokalerna dagtid. Samma rytm som en kasern: brandskydd och ' +
        'invändig kontroll varje månad, ventilation och utvändigt varje kvartal, el varje halvår.'
    },
    panncentral: {
      namn: 'Panncentral',
      // Ett enda stort pannrum med några birum, alltså hallregeln. Liten till ytan men full
      // av installationer – det är därför den har en egen rond.
      planlosning: { regel: 'hall', djup: 12, langd: 18 },
      stil: { tak: 'sadel', sadel: { bas: 4.2, hojd: 1.6 }, ytterFarg: 0xb4aca0, takFarg: 0x4a4c4f,
        fonster: { bredd: 0.9, steg: 4.5, hojd: 0.7, brost: 2.0 } },
      konstanter: { PLANHOJD: 4.5, BJALKLAG: 0.2, FRIHOJD: 4.3 },
      standard: {
        bas: { typ: 'manad', startManad: null },
        ronder: [
          { id: 'BI', freq: 'bas', utforare: 'anna' },
          { id: 'BU', freq: { typ: 'kvartal', startManad: null }, utforare: 'anna' },
          { id: 'BS', freq: { typ: 'kvartal', startManad: null }, utforare: 'bertil' },
          { id: 'VA', freq: 'bas', utforare: 'cecilia' },
          { id: 'EL', freq: { typ: 'kvartal', startManad: null }, utforare: 'cecilia' }
        ]
      },
      motivering: 'Byggnaden finns för att producera värme, och får därför den egna ronden ' +
        'Värme varje månad. Inga människor vistas här, så brandskyddet räcker varje kvartal.'
    }
  };

  // ---------------- Generering av ej signifikanta installationer ----------------
  // Standardutrustning per rum: belysning, brytare, uttag och rökdetektor, plus sanitet i WC/dusch.
  //
  // Vilket slags rum det är läses ur **rumstypen** när rummet har en, och ur benämningen när
  // det inte har det (beslut 80). De handritade byggnadernas rum i `data/` bär bara en
  // benämning – "Korridor", "WC" – medan ett inläst rum bär `rumstyp` och en fri benämning
  // som "Korr." eller "WC/D". En regel som bara läste benämningen hade gett en inläst
  // kasern korridorer med uttag mot fel vägg och WC utan sanitet.
  function slag(r) {
    if (r.rumstyp === 'korridor') { return 'korridor'; }
    if (r.rumstyp === 'wcdusch') { return 'wc'; }
    if (r.rumstyp === 'trapphus') { return 'trapphus'; }
    if (r.rumstyp) { return 'rum'; }
    if (r.namn === 'Trapphus') { return 'trapphus'; }
    if (r.namn.indexOf('Korridor') === 0) { return 'korridor'; }
    if (r.namn.indexOf('WC') === 0) { return 'wc'; }
    return 'rum';
  }

  DP.genereraOvriga = function (rum, opts) {
    opts = opts || {};
    var lista = [];
    // Installationen bär rummets nyckel (plan + rumsnummer), inte rumsnumret: numret löper per
    // plan och är inte unikt i byggnaden (beslut 76).
    function ovr(typ, r, x, z, h) { lista.push({ typ: typ, rum: DP.rumBeteckning(r), x: x, z: z, h: h || 0, signifikant: false }); }
    var cz = opts.mittZ;
    rum.forEach(function (r) {
      var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
      var w = x1 - x0, d = z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      // Belysning: ungefär en armatur per 3 m
      var nx = Math.max(1, Math.round(w / 3)), nz = Math.max(1, Math.round(d / 3));
      var sl = slag(r);
      if (sl === 'trapphus') {
        ovr('lysrorsarmatur', r, mx, mz, 0);
        ovr('vaggarmatur', r, x0, z0 + d * 0.5, 2.2);
      } else {
        for (var ix = 0; ix < nx; ix++) {
          for (var iz = 0; iz < nz; iz++) { ovr('lysrorsarmatur', r, x0 + (ix + 0.5) * w / nx, z0 + (iz + 0.5) * d / nz, 0); }
        }
      }
      if (r.utanInstallationer) { return; }
      // Brytare vid väggen mot korridoren (mot byggnadens mittlinje), uttag mot motsatt vägg
      var dorrZ = (cz !== undefined && mz < cz) ? z1 : z0;
      var andraZ = dorrZ === z1 ? z0 : z1;
      if (sl === 'korridor') { dorrZ = z0; andraZ = z1; }
      ovr('vaggbrytare', r, x0 + Math.min(0.6, w / 3), dorrZ, 1.1);
      ovr('vagguttag', r, x0 + w * 0.3, andraZ, 0.3);
      ovr('vagguttag', r, x0 + w * 0.7, andraZ, 0.3);
      if (opts.rokdetektor !== false) { ovr('rokdetektor', r, mx + 0.4, mz + 0.3, 0); }
      if (sl === 'wc') {
        ovr('toalettstol', r, x0 + 1.0, andraZ, 0);
        ovr('toalettstol', r, x0 + 2.2, andraZ, 0);
        ovr('handfat', r, x1, mz - 0.6, 0.8);
        ovr('handfat', r, x1, mz + 0.6, 0.8);
        ovr('dusch', r, x0 + 3.4, andraZ, 0);
        ovr('dusch', r, x0 + 4.5, andraZ, 0);
      }
    });
    return lista;
  };
})();
