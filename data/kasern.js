/*
 * Typbyggnad: Kasern (klassisk stil)
 * ----------------------------------
 * Lång tegelbyggnad med sadeltak: källare, tre våningar och vind. Mittkorridor med logement på båda
 * sidor och två trapphus. Två kaserner skapas från samma ritning. Kasern 2 skiljer sig med flit lite
 * (en hiss är inbyggd i efterhand och tvättstugan har en tvättmaskin mindre) så att det syns vad som
 * behöver justeras när man kopierar planering mellan byggnaderna.
 *
 * Koordinater (meter): x 0–48 längs byggnaden, z 0–14 på djupet (14 = framsida med entré).
 * Korridor z 6–8, rum på södra sidan z 0–6 och norra sidan z 8–14.
 */
(function () {
  'use strict';
  var DP = window.DP;

  var PLANHOJD = 3.3, BJALKLAG = 0.2, FRIHOJD = PLANHOJD - BJALKLAG;

  var plan = [
    { id: '00', namn: 'Källarplan',  elev: -2.8 },
    { id: '01', namn: 'Entréplan',   elev: 0 },
    { id: '02', namn: 'Plan 2',      elev: PLANHOJD },
    { id: '03', namn: 'Plan 3',      elev: 2 * PLANHOJD },
    { id: '04', namn: 'Vindsplan',   elev: 3 * PLANHOJD }
  ];

  function rum(nr, namn, planId, typ, rect, extra) {
    var r = { nr: nr, namn: namn, plan: planId, typ: typ, rect: rect };
    if (extra) { for (var k in extra) { r[k] = extra[k]; } }
    return r;
  }

  function byggRum() {
    var R = [];
    var KH = { hojd: 2.6 };
    // Källarplan
    R.push(rum('0001', 'Korridor', '00', 'kommunikation', [0, 6, 48, 8], KH));
    R.push(rum('0002', 'Trapphus', '00', 'kommunikation', [8, 0, 12, 6], KH));
    R.push(rum('0003', 'Trapphus', '00', 'kommunikation', [36, 0, 40, 6], KH));
    R.push(rum('0004', 'Undercentral', '00', 'teknik', [0, 0, 8, 6], KH));
    R.push(rum('0005', 'Tvättstuga', '00', 'personal', [12, 0, 20, 6], KH));
    R.push(rum('0006', 'Torkrum', '00', 'personal', [20, 0, 24, 6], KH));
    R.push(rum('0007', 'Förråd', '00', 'forrad', [24, 0, 36, 6], KH));
    R.push(rum('0008', 'Förråd', '00', 'forrad', [40, 0, 48, 6], KH));
    R.push(rum('0009', 'Elcentral', '00', 'teknik', [0, 8, 6, 14], KH));
    R.push(rum('0010', 'Skyddsrum', '00', 'teknik', [6, 8, 20, 14], KH));
    R.push(rum('0011', 'Förråd', '00', 'forrad', [20, 8, 34, 14], KH));
    R.push(rum('0012', 'Cykelförråd', '00', 'forrad', [34, 8, 48, 14], KH));
    // Entréplan
    R.push(rum('1001', 'Entré', '01', 'kommunikation', [20, 8, 28, 14]));
    R.push(rum('1002', 'Korridor', '01', 'kommunikation', [0, 6, 48, 8]));
    R.push(rum('1003', 'Trapphus', '01', 'kommunikation', [8, 0, 12, 6]));
    R.push(rum('1004', 'Trapphus', '01', 'kommunikation', [36, 0, 40, 6]));
    R.push(rum('1005', 'Kompaniexpedition', '01', 'kontor', [0, 0, 8, 6]));
    R.push(rum('1006', 'Dagrum', '01', 'personal', [12, 0, 24, 6]));
    R.push(rum('1007', 'Lektionssal', '01', 'kontor', [24, 0, 36, 6]));
    R.push(rum('1008', 'Kontor', '01', 'kontor', [40, 0, 48, 6]));
    R.push(rum('1009', 'Vaktrum', '01', 'kontor', [0, 8, 8, 14]));
    R.push(rum('1010', 'WC/Dusch', '01', 'personal', [8, 8, 14, 14]));
    R.push(rum('1011', 'WC/Dusch', '01', 'personal', [14, 8, 20, 14]));
    R.push(rum('1012', 'Städ', '01', 'teknik', [28, 8, 31, 14]));
    R.push(rum('1013', 'Elrum', '01', 'teknik', [31, 8, 34, 14]));
    R.push(rum('1014', 'Materielförråd', '01', 'forrad', [34, 8, 48, 14]));
    // Logementsplan 2 och 3
    ['02', '03'].forEach(function (p) {
      var s = p.slice(1); // '2' / '3'
      var n = 0;
      function log(lnr, rect) { n++; R.push(rum(s + pad(lnr), 'Logement ' + s + ':' + n, p, 'kontor', rect)); }
      R.push(rum(s + '001', 'Korridor', p, 'kommunikation', [0, 6, 48, 8]));
      R.push(rum(s + '002', 'Trapphus', p, 'kommunikation', [8, 0, 12, 6]));
      R.push(rum(s + '003', 'Trapphus', p, 'kommunikation', [36, 0, 40, 6]));
      log(4, [0, 0, 8, 6]); log(5, [12, 0, 18, 6]); log(6, [18, 0, 24, 6]); log(7, [24, 0, 30, 6]);
      log(8, [30, 0, 36, 6]); log(9, [40, 0, 48, 6]); log(10, [0, 8, 8, 14]);
      R.push(rum(s + '011', 'WC/Dusch', p, 'personal', [8, 8, 14, 14]));
      R.push(rum(s + '012', 'Torkrum', p, 'personal', [14, 8, 18, 14]));
      log(13, [18, 8, 24, 14]); log(14, [24, 8, 30, 14]);
      R.push(rum(s + '015', 'Städ', p, 'teknik', [30, 8, 33, 14]));
      R.push(rum(s + '016', 'Elrum', p, 'teknik', [33, 8, 36, 14]));
      log(17, [36, 8, 42, 14]); log(18, [42, 8, 48, 14]);
    });
    // Vindsplan (indragen under sadeltaket)
    R.push(rum('4001', 'Kallvind', '04', 'forrad', [0, 3, 16, 11], { hojd: 2.4, utanInstallationer: true }));
    R.push(rum('4002', 'Fläktrum', '04', 'teknik', [16, 3, 32, 11], { hojd: 2.4 }));
    R.push(rum('4003', 'Kallvind', '04', 'forrad', [32, 3, 48, 11], { hojd: 2.4, utanInstallationer: true }));
    return R;
  }
  function pad(n) { return ('000' + n).slice(-3); }

  // ---------------- Signifikanta installationer ----------------
  function byggInstallationer(nr) {
    var lista = [];
    var lopnr = nr * 100; // Kasern 1: 00000101…, Kasern 2: 00000201…
    var ext = 800000 + nr * 10000;
    function sig(typ, n, benamning, fabrikat, modell, bet, harExt, rumNr, x, z, h, extra) {
      lopnr++; ext += 7;
      var o = {
        id: ('00000000' + lopnr).slice(-8), typ: typ, nr: n, benamning: benamning, fabrikat: fabrikat, modell: modell,
        beteckning: bet, externtId: harExt ? 'L' + ext : null, rum: rumNr, x: x, z: z, h: h || 0, signifikant: true
      };
      if (extra) { for (var k in extra) { o[k] = extra[k]; } }
      lista.push(o);
    }
    function nn(n) { return (n < 10 ? '0' : '') + n; }

    sig('brandlarmscentral', 1, 'Brandlarmscentral 1', 'Securia', 'BC-200', 'BLC01', true, '1001', 20, 12, 1.3);
    sig('dorrautomatik', 1, 'Dörrautomatik 1', 'Dorma', 'ED-100', 'DA01', true, '1001', 24, 14, 2.25);

    // Brandposter: en per plan i korridoren
    [['0001', 1], ['1002', 2], ['2001', 3], ['3001', 4]].forEach(function (b) {
      sig('brandpost', b[1], 'Brandpost ' + b[1], 'Nordhydrant', 'NH-25', 'BP' + nn(b[1]), true, b[0], 16, 6, 0.9);
    });

    // Handbrandsläckare
    var hb = 0;
    function hbs(rumNr, x, z, modell) { hb++; sig('handbrandslackare', hb, 'Handbrandsläckare ' + hb, 'Presto', modell || 'P6kg', 'HB' + nn(hb), false, rumNr, x, z, 0.5); }
    hbs('0001', 30, 8); hbs('0004', 7.8, 3, 'K5kg'); hbs('0009', 5.8, 11, 'K5kg'); hbs('0005', 19.8, 3);
    ['1002', '2001', '3001'].forEach(function (k) { hbs(k, 6, 8); hbs(k, 42, 8); });
    hbs('4002', 16.2, 7, 'K5kg');

    // Nödbelysning i korridorerna
    var nb = 0;
    ['0001', '1002', '2001', '3001'].forEach(function (k) {
      [12, 36].forEach(function (x) { nb++; sig('nodbelysning', nb, 'Nödbelysningsarmatur ' + nb, 'Lumen', 'NL-3h', 'NB' + nn(nb), false, k, x, 8, 2.3); });
    });

    // Brandgasluckor överst i trapphusen
    sig('brandgaslucka', 1, 'Brandgaslucka 1', 'Brandskydd Nord', 'BGL-1010', 'BGL01', true, '3002', 10, 3, 0);
    sig('brandgaslucka', 2, 'Brandgaslucka 2', 'Brandskydd Nord', 'BGL-1010', 'BGL02', true, '3003', 38, 3, 0);

    // Värme och ventilation
    sig('undercentral', 1, 'Undercentral 1', 'Termex', 'UC-150', 'UC01', true, '0004', 4, 1.5, 0);
    sig('luftbehandlingsaggregat', 1, 'Luftbehandlingsaggregat 1', 'Fahoma', 'FTX0840', 'LB01', true, '4002', 24, 7, 0);
    sig('apparatskap', 1, 'Apparatskåp 1', 'Regulia', 'RS-400', 'AS01', true, '4002', 32, 5, 0, { innehaller: [{ typ: 'jordfelsbrytare', antal: 3 }] });
    sig('skyddsrumsaggregat', 1, 'Skyddsrumsaggregat 1', 'Skyddsteknik', 'SRV-300', 'SRA01', true, '0010', 6, 11, 0);

    // El
    sig('huvudcentral', 1, 'Huvudcentral 1', 'Elektra', 'HC-250', 'HC01', true, '0009', 0, 11, 0, { innehaller: [{ typ: 'jordfelsbrytare', antal: 4 }] });
    [['1013', 1, 31], ['2016', 2, 33], ['3016', 3, 33]].forEach(function (g) {
      sig('gruppcentral', g[1], 'Gruppcentral ' + g[1], 'Elektra', 'GC-63', 'GC' + nn(g[1]), true, g[0], g[2], 11, 1.2, { innehaller: [{ typ: 'jordfelsbrytare', antal: 2 }] });
    });
    sig('jordfelsbrytare', 1, 'Jordfelsbrytare 1', 'Elektra', 'JF-25/30mA', 'JFB01', false, '0005', 16, 0, 1.5, { placering: 'Bakom tvättmaskinerna' });

    // Tvätt och tork
    sig('tvattmaskin', 1, 'Tvättmaskin 1', 'Tvättex', 'TX-8', 'TM01', true, '0005', 13.5, 0, 0);
    if (nr === 1) { sig('tvattmaskin', 2, 'Tvättmaskin 2', 'Tvättex', 'TX-8', 'TM02', true, '0005', 14.8, 0, 0); }
    sig('torkskap', 1, 'Torkskåp 1', 'Tvättex', 'TS-18', 'TS01', true, '0006', 22, 0, 0);
    sig('torkskap', 2, 'Torkskåp 2', 'Tvättex', 'TS-18', 'TS02', true, '2012', 16, 14, 0);
    sig('torkskap', 3, 'Torkskåp 3', 'Tvättex', 'TS-18', 'TS03', true, '3012', 16, 14, 0);

    // Kasern 2: hiss inbyggd i trapphusöga vid renovering
    if (nr === 2) { sig('personhiss', 1, 'Personhiss 1', 'Schindler', '3000', 'HISS01', true, '1003', 10, 3, 0); }
    return lista;
  }

  function skapa(nr) {
    var rumLista = byggRum();
    return {
      id: 'kasern' + nr,
      namn: 'Kasern ' + nr,
      typ: 'kasern',
      beskrivning: nr === 1
        ? 'Klassisk kasern i tegel från 1900-talets början: källare, tre våningar och vind. Logement längs en mittkorridor.'
        : 'Likadan som Kasern 1, men renoverad: en hiss har byggts in i trapphuset och tvättstugan har en tvättmaskin.',
      stil: { tak: 'sadel', sadel: { bas: 3 * PLANHOJD, hojd: 6.5 }, ytterFarg: 0xa8604a, takFarg: 0x5b4a44, fonster: { bredd: 1.2, steg: 3, hojd: 1.6, brost: 0.9 } },
      konstanter: { PLANHOJD: PLANHOJD, BJALKLAG: BJALKLAG, FRIHOJD: FRIHOJD },
      plan: plan,
      rum: rumLista,
      installationer: byggInstallationer(nr).concat(DP.genereraOvriga(rumLista, { mittZ: 7 }))
    };
  }

  DP.byggnader.kasern1 = skapa(1);
  DP.byggnader.kasern2 = skapa(2);
})();
