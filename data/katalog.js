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
      kontrollpunkter: ['Att värme och fläkt fungerar', 'Att timer fungerar', 'Att luddfilter är rent', 'Att dörren stänger tätt'] }
  ].forEach(function (a) { DP.atgarder.push(a); });

  // ---------------- Byggnadstyper och standardplanering ----------------
  //   freq: 'bas' = samma som besöken, annars { typ, startManad }
  DP.byggnadstyper = {
    garage: {
      namn: 'Garage',
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
    }
  };

  // ---------------- Generering av ej signifikanta installationer ----------------
  // Standardutrustning per rum: belysning, brytare, uttag och rökdetektor, plus sanitet i WC/dusch.
  DP.genereraOvriga = function (rum, opts) {
    opts = opts || {};
    var lista = [];
    function ovr(typ, nr, x, z, h) { lista.push({ typ: typ, rum: nr, x: x, z: z, h: h || 0, signifikant: false }); }
    var cz = opts.mittZ;
    rum.forEach(function (r) {
      var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
      var w = x1 - x0, d = z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      // Belysning: ungefär en armatur per 3 m
      var nx = Math.max(1, Math.round(w / 3)), nz = Math.max(1, Math.round(d / 3));
      if (r.namn === 'Trapphus') {
        ovr('lysrorsarmatur', r.nr, mx, mz, 0);
        ovr('vaggarmatur', r.nr, x0, z0 + d * 0.5, 2.2);
      } else {
        for (var ix = 0; ix < nx; ix++) {
          for (var iz = 0; iz < nz; iz++) { ovr('lysrorsarmatur', r.nr, x0 + (ix + 0.5) * w / nx, z0 + (iz + 0.5) * d / nz, 0); }
        }
      }
      if (r.utanInstallationer) { return; }
      // Brytare vid väggen mot korridoren (mot byggnadens mittlinje), uttag mot motsatt vägg
      var dorrZ = (cz !== undefined && mz < cz) ? z1 : z0;
      var andraZ = dorrZ === z1 ? z0 : z1;
      if (r.namn.indexOf('Korridor') === 0) { dorrZ = z0; andraZ = z1; }
      ovr('vaggbrytare', r.nr, x0 + Math.min(0.6, w / 3), dorrZ, 1.1);
      ovr('vagguttag', r.nr, x0 + w * 0.3, andraZ, 0.3);
      ovr('vagguttag', r.nr, x0 + w * 0.7, andraZ, 0.3);
      if (opts.rokdetektor !== false) { ovr('rokdetektor', r.nr, mx + 0.4, mz + 0.3, 0); }
      if (r.namn.indexOf('WC') === 0) {
        ovr('toalettstol', r.nr, x0 + 1.0, andraZ, 0);
        ovr('toalettstol', r.nr, x0 + 2.2, andraZ, 0);
        ovr('handfat', r.nr, x1, mz - 0.6, 0.8);
        ovr('handfat', r.nr, x1, mz + 0.6, 0.8);
        ovr('dusch', r.nr, x0 + 3.4, andraZ, 0);
        ovr('dusch', r.nr, x0 + 4.5, andraZ, 0);
      }
    });
    return lista;
  };
})();
