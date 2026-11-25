/*
 * Typbyggnad: Hangar
 * ------------------
 * All data är påhittad och finns för utbildningssyfte.
 *
 * Koordinatsystem (meter):
 *   x = längs byggnaden (0 = kontorsdelens västra fasad, 76 = hangarens östra gavel)
 *   z = djup (0 = baksida, 30 = framsida med portar och entré)
 *   Plan har en golvnivå (elev). Installationer anges med x/z och höjd över golv (h).
 *
 * Kontorsdelen: x 0–12, z 0–30, tre plan.
 * Hangaren:     x 12–76, z 0–30, ett plan med fri höjd upp till samma nivå som kontorsdelens tak.
 *
 * Rumsnummer: löpnummer per plan (001, 002 …) enligt vanlig svensk praxis med utgångspunkt i
 * SS-ISO 4157. Planet har en egen beteckning (01, 02 …), och ett rum pekas ut med plan + rumsnummer,
 * skrivet 01-001 (beslut 76). Plan och rum är egna objekt.
 *
 * Installationer:
 *   signifikant: true  -> registreras som individ med 8-siffrigt id, ska ha kopplade åtgärder, klickbar.
 *   signifikant: false -> registreras INTE som individ, visas bara för förståelse, ej klickbar.
 */
(function () {
  'use strict';

  window.DP = window.DP || {};

  // Ett rum pekas ut med plan + rumsnummer (beslut 76). Rumsnumret löper per plan (001, 002 …),
  // så det är inte unikt i byggnaden: rum 001 finns på varje plan. Nyckeln är därför planets
  // beteckning och rumsnumret, skrivna ihop med bindestreck – och den strängen är också det
  // planeraren ser, så det som pekar ut rummet och det som står i modellen är samma sak.
  // Installationernas `rum` och ett innerrums `iRum` bär den här nyckeln, inte rumsnumret.
  window.DP.rumNyckel = function (planId, nr) { return planId + '-' + nr; };
  window.DP.rumBeteckning = function (r) { return window.DP.rumNyckel(r.plan, r.nr); };

  var rk = window.DP.rumNyckel, rumNyckelFor = window.DP.rumBeteckning;

  var PLANHOJD = 3.5;     // våningshöjd
  var BJALKLAG = 0.2;     // bjälklagets tjocklek
  var FRIHOJD = PLANHOJD - BJALKLAG; // 3.3 m fri höjd i kontorsdelen
  var HANGARHOJD = 3 * PLANHOJD - BJALKLAG; // 10.3 m fri höjd i hangaren

  var plan = [
    { id: '01', namn: 'Entréplan',  elev: 0 },
    { id: '02', namn: 'Kontorsplan', elev: PLANHOJD },
    { id: '03', namn: 'Teknikplan', elev: 2 * PLANHOJD }
  ];

  // Rum: rect = [x0, z0, x1, z1]
  var rum = [
    // ---- Plan 01 – Entréplan ----
    { nr: '001', namn: 'Entré',              plan: '01', typ: 'kommunikation', rect: [0, 24, 7, 30] },
    { nr: '002', namn: 'Korridor',           plan: '01', typ: 'kommunikation', rect: [5, 0, 7, 24] },
    { nr: '003', namn: 'Trapphus',           plan: '01', typ: 'kommunikation', rect: [9, 24, 12, 30] },
    { nr: '004', namn: 'Hisschakt',          plan: '01', typ: 'teknik',        rect: [7, 27, 9, 30] },
    { nr: '005', namn: 'Städ',               plan: '01', typ: 'teknik',        rect: [7, 24, 9, 27] },
    { nr: '006', namn: 'Omklädningsrum 1',   plan: '01', typ: 'personal',      rect: [0, 12, 5, 24] },
    { nr: '007', namn: 'Omklädningsrum 2',   plan: '01', typ: 'personal',      rect: [0, 0, 5, 12] },
    { nr: '008', namn: 'Fikarum',            plan: '01', typ: 'personal',      rect: [7, 14, 12, 24] },
    { nr: '009', namn: 'Förråd',             plan: '01', typ: 'forrad',        rect: [7, 8, 12, 14] },
    { nr: '010', namn: 'Elrum',              plan: '01', typ: 'teknik',        rect: [7, 4, 12, 8] },
    { nr: '011', namn: 'Torkrum',            plan: '01', typ: 'personal',      rect: [7, 0, 12, 4] },
    { nr: '012', namn: 'Hangar',             plan: '01', typ: 'hangar',        rect: [12, 0, 76, 30], hojd: HANGARHOJD, utanVagg: ['W'] },
    { nr: '013', namn: 'Förråd hangar 1',    plan: '01', typ: 'forrad',        rect: [22, 0, 28, 4], hojd: 3.0, iRum: rk('01', '012') },
    { nr: '014', namn: 'Förråd hangar 2',    plan: '01', typ: 'forrad',        rect: [42, 0, 48, 4], hojd: 3.0, iRum: rk('01', '012') },
    { nr: '015', namn: 'Förråd hangar 3',    plan: '01', typ: 'forrad',        rect: [62, 0, 68, 4], hojd: 3.0, iRum: rk('01', '012') },

    // ---- Plan 02 – Kontorsplan ----
    { nr: '001', namn: 'Korridor',           plan: '02', typ: 'kommunikation', rect: [5, 0, 7, 30] },
    { nr: '002', namn: 'Trapphus',           plan: '02', typ: 'kommunikation', rect: [9, 24, 12, 30] },
    { nr: '003', namn: 'Hisschakt',          plan: '02', typ: 'teknik',        rect: [7, 27, 9, 30] },
    { nr: '004', namn: 'WC',                 plan: '02', typ: 'personal',      rect: [7, 24, 9, 27] },
    { nr: '005', namn: 'Kontor 1',           plan: '02', typ: 'kontor',        rect: [0, 24, 5, 30] },
    { nr: '006', namn: 'Kontor 2',           plan: '02', typ: 'kontor',        rect: [0, 18, 5, 24] },
    { nr: '007', namn: 'Kontor 3',           plan: '02', typ: 'kontor',        rect: [0, 12, 5, 18] },
    { nr: '008', namn: 'Kontor 4',           plan: '02', typ: 'kontor',        rect: [0, 6, 5, 12] },
    { nr: '009', namn: 'Kontor 5',           plan: '02', typ: 'kontor',        rect: [0, 0, 5, 6] },
    { nr: '010', namn: 'Konferensrum',       plan: '02', typ: 'kontor',        rect: [7, 14, 12, 24] },
    { nr: '011', namn: 'Kontor 6',           plan: '02', typ: 'kontor',        rect: [7, 9, 12, 14] },
    { nr: '012', namn: 'Kontor 7',           plan: '02', typ: 'kontor',        rect: [7, 4, 12, 9] },
    { nr: '013', namn: 'Elrum',              plan: '02', typ: 'teknik',        rect: [7, 0, 12, 4] },

    // ---- Plan 03 – Teknikplan ----
    { nr: '001', namn: 'Trapphus',           plan: '03', typ: 'kommunikation', rect: [9, 24, 12, 30] },
    { nr: '002', namn: 'Hall',               plan: '03', typ: 'kommunikation', rect: [0, 24, 9, 30] },
    { nr: '003', namn: 'Apparatrum',         plan: '03', typ: 'teknik',        rect: [0, 0, 12, 24] }
  ];

  // Utrymningsvägar per plan (två per plan)
  var utrymningsvagar = [
    { plan: '01', vag: 'Entrédörr i 01-001 Entré' },
    { plan: '01', vag: 'Portar och gångdörr i 01-012 Hangar' },
    { plan: '02', vag: 'Trapphus 02-002' },
    { plan: '02', vag: 'Utrymningsfönster i 02-009 Kontor 5 med utfällbar stege (US01)' },
    { plan: '03', vag: 'Trapphus 03-001' },
    { plan: '03', vag: 'Utrymningsfönster i 03-003 Apparatrum med utfällbar stege (US02)' }
  ];

  // Installationstyper: namn, kategori (färg i modellen) och hur de monteras
  //   montage: 'vagg' (mot närmaste vägg), 'golv', 'tak', 'fasad' (i fasadlinjen), 'utsida' (utanpå fasaden)
  var installationstyper = {
    brandlarmscentral:   { namn: 'Brandlarmscentral',      kategori: 'brand',   montage: 'vagg' },
    brandpost:           { namn: 'Brandpost',              kategori: 'brand',   montage: 'vagg' },
    handbrandslackare:   { namn: 'Handbrandsläckare',      kategori: 'brand',   montage: 'vagg' },
    utrymningsstege:     { namn: 'Utrymningsstege',        kategori: 'brand',   montage: 'utsida' },
    huvudcentral:        { namn: 'Huvudcentral',           kategori: 'el',      montage: 'vagg' },
    gruppcentral:        { namn: 'Gruppcentral',           kategori: 'el',      montage: 'vagg' },
    apparatskap:         { namn: 'Apparatskåp',            kategori: 'el',      montage: 'vagg' },
    jordfelsbrytare:     { namn: 'Jordfelsbrytare',        kategori: 'el',      montage: 'vagg' },
    luftbehandlingsaggregat: { namn: 'Luftbehandlingsaggregat', kategori: 'vvs', montage: 'golv' },
    flaktluftvarmare:    { namn: 'Fläktluftvärmare',       kategori: 'vvs',     montage: 'vagg' },
    varmvattenberedare:  { namn: 'Varmvattenberedare',     kategori: 'vvs',     montage: 'golv' },
    kompressor:          { namn: 'Tryckluftskompressor',   kategori: 'maskin',  montage: 'golv' },
    tryckkarl:           { namn: 'Tryckkärl',              kategori: 'maskin',  montage: 'golv' },
    personhiss:          { namn: 'Personhiss',             kategori: 'maskin',  montage: 'golv' },
    travers:             { namn: 'Travers',                kategori: 'maskin',  montage: 'golv' },
    pelarlyft:           { namn: 'Pelarlyft',              kategori: 'maskin',  montage: 'golv' },
    industriport:        { namn: 'Industriport',           kategori: 'byggnad', montage: 'fasad' },

    // Ej signifikanta
    lysrorsarmatur:      { namn: 'Lysrörsarmatur',         kategori: 'ovrig',   montage: 'tak' },
    vaggarmatur:         { namn: 'Väggarmatur',            kategori: 'ovrig',   montage: 'vagg' },
    vaggbrytare:         { namn: 'Väggbrytare',            kategori: 'ovrig',   montage: 'vagg' },
    vagguttag:           { namn: 'Vägguttag',              kategori: 'ovrig',   montage: 'vagg' },
    rokdetektor:         { namn: 'Rökdetektor',            kategori: 'ovrig',   montage: 'tak' },
    toalettstol:         { namn: 'Toalettstol',            kategori: 'ovrig',   montage: 'vagg' },
    handfat:             { namn: 'Handfat',                kategori: 'ovrig',   montage: 'vagg' },
    dusch:               { namn: 'Dusch',                  kategori: 'ovrig',   montage: 'vagg' }
  };

  // Varför en ej signifikant installation inte registreras (visas som tips i modellen)
  var ejSignifikantForklaring = {
    lysrorsarmatur: 'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    vaggarmatur:    'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    vaggbrytare:    'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    vagguttag:      'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    rokdetektor:    'Ingår i brandlarmsanläggningen och kontrolleras via brandlarmscentralen.',
    toalettstol:    'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    handfat:        'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    dusch:          'Kontrolleras översiktligt i åtgärden Kontroll byggnad invändigt.',
    jordfelsbrytare_i_central: 'Sitter i en central eller ett apparatskåp och är lätt att hitta. Provas via åtgärden för centralen.'
  };

  // ---------------------------------------------------------------
  // Signifikanta installationer (registrerade individer)
  // ---------------------------------------------------------------
  // `planId` och `rumNr` pekar tillsammans ut rummet (beslut 76). Installationen bär rummets
  // nyckel, eftersom rumsnumret löper per plan och inte är unikt i byggnaden.
  function sig(id, typ, nr, benamning, fabrikat, modell, beteckning, externtId, planId, rumNr, x, z, h, extra) {
    var o = {
      id: id, typ: typ, nr: nr, benamning: benamning, fabrikat: fabrikat, modell: modell,
      beteckning: beteckning, externtId: externtId, rum: rk(planId, rumNr), x: x, z: z, h: h || 0,
      signifikant: true
    };
    if (extra) { for (var k in extra) { o[k] = extra[k]; } }
    return o;
  }

  var signifikanta = [
    // Brandlarm
    sig('00000011', 'brandlarmscentral', 1, 'Brandlarmscentral 1', 'Securia', 'BC-400', 'BLC01', 'L410233', '01', '001', 0, 27, 1.3),

    // Elcentraler (jordfelsbrytare i dessa är EJ signifikanta)
    sig('00000012', 'huvudcentral', 1, 'Huvudcentral 1', 'Elektra', 'HC-400', 'HC01', 'L551204', '01', '010', 12, 6, 0, { innehaller: [{ typ: 'jordfelsbrytare', antal: 3 }] }),
    sig('00000013', 'gruppcentral', 1, 'Gruppcentral 1', 'Elektra', 'GC-63', 'GC01', 'L551205', '01', '002', 5, 4, 1.2, { innehaller: [{ typ: 'jordfelsbrytare', antal: 2 }] }),
    sig('00000014', 'personhiss', 1, 'Personhiss 1', 'Schindler', 'B450', 'HISS01', 'L222290', '01', '004', 8, 28.5, 0),
    sig('00000015', 'huvudcentral', 2, 'Huvudcentral 2', 'Elektra', 'HC-250', 'HC02', 'L551206', '02', '013', 12, 2, 0, { innehaller: [{ typ: 'jordfelsbrytare', antal: 3 }] }),
    sig('00000016', 'gruppcentral', 2, 'Gruppcentral 2', 'Elektra', 'GC-63', 'GC02', 'L551207', '02', '001', 5, 20, 1.2, { innehaller: [{ typ: 'jordfelsbrytare', antal: 2 }] }),
    sig('00000017', 'huvudcentral', 3, 'Huvudcentral 3', 'Elektra', 'HC-250', 'HC03', 'L551208', '03', '002', 4, 24, 0, { innehaller: [{ typ: 'jordfelsbrytare', antal: 3 }] }),
    sig('00000018', 'gruppcentral', 3, 'Gruppcentral 3', 'Elektra', 'GC-63', 'GC03', 'L551209', '03', '003', 0, 20, 1.2, { innehaller: [{ typ: 'jordfelsbrytare', antal: 2 }] }),

    // Brandposter
    sig('00000021', 'brandpost', 1, 'Brandpost 1', 'Nordhydrant', 'NH-25', 'BP01', 'L330101', '01', '002', 5, 14, 0.9),
    sig('00000022', 'brandpost', 2, 'Brandpost 2', 'Nordhydrant', 'NH-25', 'BP02', 'L330102', '02', '001', 5, 14, 0.9),
    sig('00000023', 'brandpost', 3, 'Brandpost 3', 'Nordhydrant', 'NH-25', 'BP03', 'L330103', '01', '012', 12, 16, 0.9),
    sig('00000024', 'brandpost', 4, 'Brandpost 4', 'Nordhydrant', 'NH-25', 'BP04', 'L330104', '01', '012', 76, 16, 0.9),

    // Handbrandsläckare – kontorsdelen (vartannat utrymme)
    sig('00000030', 'handbrandslackare', 1,  'Handbrandsläckare 1',  'Presto', 'P7kg', 'HB01', null, '01', '001', 6.8, 25.5, 0.5),
    sig('00000031', 'handbrandslackare', 2,  'Handbrandsläckare 2',  'Presto', 'P7kg', 'HB02', null, '01', '006', 4.8, 22, 0.5),
    sig('00000032', 'handbrandslackare', 3,  'Handbrandsläckare 3',  'Presto', 'P7kg', 'HB03', null, '01', '008', 7.2, 22, 0.5),
    sig('00000033', 'handbrandslackare', 4,  'Handbrandsläckare 4',  'Presto', 'K5kg', 'HB04', null, '01', '010', 7.2, 7, 0.5),
    sig('00000034', 'handbrandslackare', 5,  'Handbrandsläckare 5',  'Presto', 'P7kg', 'HB05', null, '01', '007', 4.8, 10, 0.5),
    sig('00000035', 'handbrandslackare', 6,  'Handbrandsläckare 6',  'Presto', 'P7kg', 'HB06', null, '02', '001', 6.9, 23, 0.5),
    sig('00000036', 'handbrandslackare', 7,  'Handbrandsläckare 7',  'Presto', 'P7kg', 'HB07', null, '02', '006', 4.8, 22.5, 0.5),
    sig('00000037', 'handbrandslackare', 8,  'Handbrandsläckare 8',  'Presto', 'P7kg', 'HB08', null, '02', '008', 4.8, 10.5, 0.5),
    sig('00000038', 'handbrandslackare', 9,  'Handbrandsläckare 9',  'Presto', 'P7kg', 'HB09', null, '02', '010', 7.2, 22.5, 0.5),
    sig('00000039', 'handbrandslackare', 10, 'Handbrandsläckare 10', 'Presto', 'P7kg', 'HB10', null, '02', '012', 7.2, 7.5, 0.5),
    sig('00000040', 'handbrandslackare', 11, 'Handbrandsläckare 11', 'Presto', 'K5kg', 'HB11', null, '02', '013', 7.2, 3, 0.5),
    sig('00000041', 'handbrandslackare', 12, 'Handbrandsläckare 12', 'Presto', 'K5kg', 'HB12', null, '03', '003', 6, 23.8, 0.5),
    sig('00000042', 'handbrandslackare', 13, 'Handbrandsläckare 13', 'Presto', 'P7kg', 'HB13', null, '03', '002', 8.8, 26, 0.5),
    // Handbrandsläckare – hangaren (12 st)
    sig('00000043', 'handbrandslackare', 14, 'Handbrandsläckare 14', 'Presto', 'P9kg', 'HB14', null, '01', '012', 20, 30, 0.5),
    sig('00000044', 'handbrandslackare', 15, 'Handbrandsläckare 15', 'Presto', 'P9kg', 'HB15', null, '01', '012', 36, 30, 0.5),
    sig('00000045', 'handbrandslackare', 16, 'Handbrandsläckare 16', 'Presto', 'P9kg', 'HB16', null, '01', '012', 52, 30, 0.5),
    sig('00000046', 'handbrandslackare', 17, 'Handbrandsläckare 17', 'Presto', 'P9kg', 'HB17', null, '01', '012', 68, 30, 0.5),
    sig('00000047', 'handbrandslackare', 18, 'Handbrandsläckare 18', 'Presto', 'P9kg', 'HB18', null, '01', '012', 18, 0, 0.5),
    sig('00000048', 'handbrandslackare', 19, 'Handbrandsläckare 19', 'Presto', 'P9kg', 'HB19', null, '01', '012', 35, 0, 0.5),
    sig('00000049', 'handbrandslackare', 20, 'Handbrandsläckare 20', 'Presto', 'P9kg', 'HB20', null, '01', '012', 55, 0, 0.5),
    sig('00000050', 'handbrandslackare', 21, 'Handbrandsläckare 21', 'Presto', 'P9kg', 'HB21', null, '01', '012', 72, 0, 0.5),
    sig('00000051', 'handbrandslackare', 22, 'Handbrandsläckare 22', 'Presto', 'P9kg', 'HB22', null, '01', '012', 12, 6, 0.5),
    sig('00000052', 'handbrandslackare', 23, 'Handbrandsläckare 23', 'Presto', 'P9kg', 'HB23', null, '01', '012', 12, 25, 0.5),
    sig('00000053', 'handbrandslackare', 24, 'Handbrandsläckare 24', 'Presto', 'P9kg', 'HB24', null, '01', '012', 76, 6, 0.5),
    sig('00000054', 'handbrandslackare', 25, 'Handbrandsläckare 25', 'Presto', 'P9kg', 'HB25', null, '01', '012', 76, 25, 0.5)
  ];

  // Industriportar och fläktluftvärmare ovanför varje port (8 st)
  for (var i = 0; i < 8; i++) {
    var px = 16 + i * 8;
    var n = i + 1, nn = (n < 10 ? '0' : '') + n;
    signifikanta.push(sig('000000' + (61 + i), 'industriport', n, 'Industriport ' + n, 'Portia', 'IP-5045', 'PORT' + nn, 'L6402' + (10 + i), '01', '012', px, 30, 0));
    signifikanta.push(sig('000000' + (71 + i), 'flaktluftvarmare', n, 'Fläktluftvärmare ' + n, 'Värmeflex', 'FV-30', 'FLV' + nn, 'L7120' + (10 + i), '01', '012', px, 30, 5.4));
  }

  signifikanta.push(
    // Lyftutrustning i hangaren
    sig('00000081', 'travers', 1, 'Travers 1', 'Lyftmax', 'TL-10T', 'TR01', 'L880011', '01', '012', 40, 15, 0),
    sig('00000082', 'pelarlyft', 1, 'Pelarlyft 1', 'Lyftmax', 'PL-4x7,5T', 'PL01', 'L880021', '01', '012', 34, 8, 0),
    sig('00000083', 'pelarlyft', 2, 'Pelarlyft 2', 'Lyftmax', 'PL-4x7,5T', 'PL02', 'L880022', '01', '012', 56, 8, 0),

    // Apparatrum plan 03
    sig('00000089', 'luftbehandlingsaggregat', 1, 'Luftbehandlingsaggregat 1', 'Fahoma', 'FTX1127', 'LB01', 'L773892', '03', '003', 2.2, 6, 0),
    sig('00000090', 'luftbehandlingsaggregat', 2, 'Luftbehandlingsaggregat 2', 'Fahoma', 'FTX1127', 'LB02', 'L773893', '03', '003', 2.2, 15, 0),
    sig('00000091', 'apparatskap', 1, 'Apparatskåp 1', 'Regulia', 'RS-800', 'AS01', 'L774010', '03', '003', 6, 0, 0, { innehaller: [{ typ: 'jordfelsbrytare', antal: 4 }] }),
    sig('00000092', 'varmvattenberedare', 1, 'Varmvattenberedare 1', 'Varmia', 'VV-500', 'VVB01', 'L775120', '03', '003', 11.1, 20, 0),
    sig('00000093', 'kompressor', 1, 'Tryckluftskompressor 1', 'Pneumatica', 'PK-55', 'KP01', 'L776201', '03', '003', 10.9, 9.5, 0),
    sig('00000094', 'tryckkarl', 1, 'Tryckkärl 1', 'Pneumatica', 'TK-900L', 'TK01', 'L776202', '03', '003', 10.9, 13, 0),
    // Enskilt placerade jordfelsbrytare (signifikanta för att de är svåra att hitta)
    sig('00000095', 'jordfelsbrytare', 1, 'Jordfelsbrytare 1', 'Elektra', 'JF-40/30mA', 'JFB01', null, '03', '003', 12, 9.5, 1.6, { placering: 'Bakom tryckluftskompressor KP01' }),
    sig('00000096', 'jordfelsbrytare', 2, 'Jordfelsbrytare 2', 'Elektra', 'JF-40/30mA', 'JFB02', null, '03', '003', 12, 20, 1.6, { placering: 'Bakom varmvattenberedare VVB01' }),

    // Utrymningsstegar (utanför utrymningsfönster)
    sig('00000097', 'utrymningsstege', 1, 'Utrymningsstege 1', 'Räddo', 'RS-2', 'US01', null, '02', '009', 0, 3, 0.9),
    sig('00000098', 'utrymningsstege', 2, 'Utrymningsstege 2', 'Räddo', 'RS-2', 'US02', null, '03', '003', 0, 11, 0.9)
  );

  // ---------------------------------------------------------------
  // Övriga (ej signifikanta) installationer – genereras per rum
  // ---------------------------------------------------------------
  // `rumNyckel` är rummets nyckel (plan + rumsnummer), inte rumsnumret ensamt.
  function ovr(typ, rumNyckel, x, z, h) {
    return { typ: typ, rum: rumNyckel, x: x, z: z, h: h || 0, signifikant: false };
  }

  function genereraOvriga() {
    var lista = [];
    rum.forEach(function (r) {
      if (r.namn === 'Hisschakt') { return; }
      var nyckel = rumNyckelFor(r);
      var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
      var w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

      // Belysning
      if (r.typ === 'hangar') {
        for (var gx = 0; gx < 8; gx++) {
          for (var gz = 0; gz < 3; gz++) {
            lista.push(ovr('lysrorsarmatur', nyckel, x0 + 4 + gx * 8, z0 + 6 + gz * 9, 0));
          }
        }
      } else if (r.namn === 'Trapphus') {
        lista.push(ovr('lysrorsarmatur', nyckel, cx, cz, 0));
        lista.push(ovr('vaggarmatur', nyckel, x1, z0 + 1.5, 2.2));
        lista.push(ovr('vaggarmatur', nyckel, x1, z1 - 1.5, 2.2));
      } else {
        var nx = Math.max(1, Math.round(w / 3)), nz = Math.max(1, Math.round(d / 3));
        for (var ix = 0; ix < nx; ix++) {
          for (var iz = 0; iz < nz; iz++) {
            lista.push(ovr('lysrorsarmatur', nyckel, x0 + (ix + 0.5) * w / nx, z0 + (iz + 0.5) * d / nz, 0));
          }
        }
      }

      // Brytare nära dörrsidan (mot korridoren), uttag på motsatt sida
      var brytX = (x1 <= 5.5) ? x1 : (x0 >= 6.5 ? x0 : x0);
      if (r.typ === 'hangar') { brytX = 12; }
      lista.push(ovr('vaggbrytare', nyckel, brytX, Math.min(z1 - 0.6, cz + 1), 1.1));
      var uttagX = (brytX === x0) ? x1 : x0;
      if (r.typ === 'hangar' || r.iRum) {
        lista.push(ovr('vagguttag', nyckel, x0 + w * 0.3, z0, 0.3));
        lista.push(ovr('vagguttag', nyckel, x0 + w * 0.7, z0, 0.3));
      } else {
        lista.push(ovr('vagguttag', nyckel, uttagX, z0 + d * 0.3, 0.3));
        lista.push(ovr('vagguttag', nyckel, uttagX, z0 + d * 0.7, 0.3));
      }

      // Rökdetektorer (ingår i brandlarmet)
      if (r.typ === 'hangar') {
        [[20, 15], [36, 15], [52, 15], [68, 15], [28, 25], [60, 25]].forEach(function (p) {
          lista.push(ovr('rokdetektor', nyckel, p[0], p[1], 0));
        });
      } else {
        lista.push(ovr('rokdetektor', nyckel, cx + 0.4, cz + 0.4, 0));
      }

      // Sanitet
      if (r.namn.indexOf('Omklädningsrum') === 0) {
        lista.push(ovr('toalettstol', nyckel, x0, z0 + 1.0, 0));
        lista.push(ovr('toalettstol', nyckel, x0, z0 + 2.4, 0));
        lista.push(ovr('handfat', nyckel, x0, z0 + 4.0, 0.8));
        lista.push(ovr('handfat', nyckel, x0, z0 + 5.0, 0.8));
        for (var s = 0; s < 4; s++) {
          lista.push(ovr('dusch', nyckel, x0 + 0.8 + s * 1.1, z1, 0));
        }
      }
      if (r.namn === 'WC') {
        lista.push(ovr('toalettstol', nyckel, x0 + 1.0, z1, 0));
        lista.push(ovr('handfat', nyckel, x1, z0 + 0.8, 0.8));
      }
    });
    return lista;
  }

  // ---------------------------------------------------------------
  // Ronder
  // ---------------------------------------------------------------
  var ronder = [
    { id: 'BI', namn: 'Byggnad invändigt' },
    { id: 'BU', namn: 'Byggnad utvändigt' },
    { id: 'BS', namn: 'Brandskydd' },
    { id: 'VE', namn: 'Ventilation' },
    { id: 'KY', namn: 'Kyla' },
    { id: 'VA', namn: 'Värme' },
    { id: 'EL', namn: 'El' },
    { id: 'HI', namn: 'Hiss' }
  ];

  // ---------------------------------------------------------------
  // Åtgärdskatalog (bruttolista)
  //   galler: installationstyper åtgärden matchar. Tom lista = generell åtgärd för byggnaden.
  //   kontrollpunkter: utgör åtgärdstexten (listan efter "Kontrollera:").
  // ---------------------------------------------------------------
  var atgarder = [
    {
      id: 'A001', namn: 'Kontroll byggnad invändigt', galler: [], generell: true, foreslagenRond: 'BI',
      kontrollpunkter: ['Väggar, golv och tak – skador, fukt och sprickor', 'Fönster och dörrar – funktion och tätning', 'Belysning – trasiga armaturer och lysrör', 'Vägguttag och väggbrytare – skador och funktion', 'Sanitet – läckage och funktion', 'Skyltar och märkning', 'Ordning och framkomlighet', 'Lyssna, lukta och känn efter avvikelser']
    },
    {
      id: 'A002', namn: 'Kontroll byggnad utvändigt', galler: [], generell: true, foreslagenRond: 'BU',
      kontrollpunkter: ['Fasad – skador, sprickor och klotter', 'Fönster och portar utvändigt', 'Takavvattning – hängrännor och stuprör', 'Tak – synliga skador och lösa delar', 'Mark och dagvattenbrunnar', 'Utvändig belysning', 'Lyssna, lukta och känn efter avvikelser']
    },
    {
      id: 'A010', namn: 'Kontroll handbrandsläckare', galler: ['handbrandslackare'], foreslagenRond: 'BS',
      kontrollpunkter: ['Att plomberingen är intakt', 'Att handbrandsläckaren sitter i sitt fäste', 'Att slangen och munstycket är hela och sitter som de ska', 'Att manometern visar grönt fält (där sådan finns)', 'Att behållaren är fri från rost, bucklor och skador', 'Att skylt för placering finns och syns', 'Att släckaren är åtkomlig och inte blockerad', 'Att senaste service-märkning är inom intervall']
    },
    {
      id: 'A011', namn: 'Kontroll brandpost', galler: ['brandpost'], foreslagenRond: 'BS',
      kontrollpunkter: ['Att skåpet är helt och går att öppna', 'Att slangen är hel och korrekt upprullad', 'Att strålröret finns och är helt', 'Att ventilen inte läcker', 'Att skylt för brandpost finns och syns', 'Att brandposten är åtkomlig och inte blockerad']
    },
    {
      id: 'A012', namn: 'Provning brandlarm', galler: ['brandlarmscentral'], foreslagenRond: 'BS',
      kontrollpunkter: ['Att centralen visar driftläge utan fel', 'Provlarm enligt anvisning – larmet når larmmottagare', 'Att larmdon hörs i hela byggnaden', 'Att återställning fungerar', 'Att larmplan och orienteringsritning finns vid centralen', 'Notera provningen i kontrolljournalen']
    },
    {
      id: 'A013', namn: 'Kontroll utrymningsstege', galler: ['utrymningsstege'], foreslagenRond: 'BS',
      kontrollpunkter: ['Att stegen sitter fast i sitt fäste', 'Att låsning och utfällningsmekanism är hel', 'Att utrymningsfönstret går att öppna', 'Att skylt för utrymningsväg finns', 'Att marken under stegen är fri från hinder']
    },
    {
      id: 'A020', namn: 'Kontroll luftbehandlingsaggregat', galler: ['luftbehandlingsaggregat'], foreslagenRond: 'VE',
      kontrollpunkter: ['Filter – tryckfall och nedsmutsning', 'Fläktar – ljud och vibrationer', 'Värmeväxlare – funktion och rengöring', 'Värmebatteri – funktion och temperatur', 'Kylbatteri – funktion och dränering', 'Spjäll och ställdon – funktion', 'Larm i styrsystemet', 'Lyssna, lukta och känn efter avvikelser']
    },
    {
      id: 'A021', namn: 'Kontroll fläktluftvärmare', galler: ['flaktluftvarmare'], foreslagenRond: 'VE',
      kontrollpunkter: ['Att fläkten startar och går utan missljud', 'Att värme avges', 'Att galler och lameller är rena', 'Att inga läckage finns på anslutningar']
    },
    {
      id: 'A022', namn: 'Kontroll varmvattenberedare', galler: ['varmvattenberedare'], foreslagenRond: 'BI',
      kontrollpunkter: ['Temperatur på utgående varmvatten (minst 60 °C)', 'Säkerhetsventil – motionera och kontrollera funktion', 'Läckage vid anslutningar', 'Isolering och mantel', 'Lyssna, lukta och känn efter avvikelser']
    },
    {
      id: 'A030', namn: 'Kontroll elcentral', galler: ['huvudcentral', 'gruppcentral'], foreslagenRond: 'EL',
      kontrollpunkter: ['Att centralen är låst och märkt', 'Att inga synliga skador eller värmeskador finns', 'Provning av jordfelsbrytare i centralen via testknapp', 'Att gruppförteckning finns och är aktuell', 'Att utrymmet framför centralen är fritt']
    },
    {
      id: 'A031', namn: 'Kontroll apparatskåp', galler: ['apparatskap'], foreslagenRond: 'VE',
      kontrollpunkter: ['Att skåpet är helt och stängt', 'Att inga larm är aktiva', 'Provning av jordfelsbrytare i skåpet via testknapp', 'Att dokumentation finns i skåpet']
    },
    {
      id: 'A032', namn: 'Provning jordfelsbrytare', galler: ['jordfelsbrytare'], foreslagenRond: 'EL',
      kontrollpunkter: ['Att jordfelsbrytaren går att hitta och är märkt', 'Provning via testknapp – brytaren löser ut', 'Återställning efter provning', 'Att utrustningen fungerar efter återställning']
    },
    {
      id: 'A040', namn: 'Kontroll hiss', galler: ['personhiss'], foreslagenRond: 'HI',
      kontrollpunkter: ['Att hissen går till alla plan', 'Att dörrar öppnar och stänger korrekt', 'Att nödtelefon/larmknapp fungerar', 'Att korgbelysning fungerar', 'Att stannprecisionen är god', 'Att besiktningsintyg finns uppsatt']
    },
    {
      id: 'A041', namn: 'Kontroll tryckluftskompressor', galler: ['kompressor'], foreslagenRond: 'BI',
      kontrollpunkter: ['Oljenivå', 'Kondensavtappning', 'Läckage i anslutningar', 'Ljud och vibrationer', 'Drifttimmar – notera']
    },
    {
      id: 'A042', namn: 'Kontroll tryckkärl', galler: ['tryckkarl'], foreslagenRond: 'BI',
      kontrollpunkter: ['Att manometern visar normalt tryck', 'Säkerhetsventil – motionera', 'Rost och skador på kärlet', 'Att märkskylt finns och är läsbar']
    },
    {
      id: 'A043', namn: 'Kontroll travers', galler: ['travers'], foreslagenRond: 'BI',
      kontrollpunkter: ['Att nödstopp fungerar', 'Att gränslägesbrytare fungerar', 'Lyftkrok och spärr – skador', 'Lina eller kätting – slitage', 'Att märkning av maxlast finns', 'Att manöverdosa är hel']
    },
    {
      id: 'A044', namn: 'Kontroll pelarlyft', galler: ['pelarlyft'], foreslagenRond: 'BI',
      kontrollpunkter: ['Att samtliga pelare är hela', 'Att säkerhetsspärrar fungerar', 'Att nödstopp fungerar', 'Kablar och kontakter – skador', 'Att märkning av maxlast finns']
    },
    {
      id: 'A050', namn: 'Kontroll industriport', galler: ['industriport'], foreslagenRond: 'BU',
      kontrollpunkter: ['Att porten öppnar och stänger utan missljud', 'Att klämskydd och fotocell fungerar', 'Tätningslister', 'Fjädrar och linor – slitage', 'Nödmanövrering']
    },

    // Åtgärder utan matchande installation i hangaren (finns för andra typbyggnader)
    { id: 'A060', namn: 'Kontroll sprinklercentral', galler: ['sprinklercentral'], foreslagenRond: 'BS', kontrollpunkter: ['Tryck på manometrar', 'Ventillägen', 'Larmprov', 'Läckage'] },
    { id: 'A061', namn: 'Kontroll brandgasfläkt', galler: ['brandgasflakt'], foreslagenRond: 'BS', kontrollpunkter: ['Provkörning', 'Ljud och vibrationer', 'Manöverpanel'] },
    { id: 'A062', namn: 'Kontroll nödbelysning', galler: ['nodbelysning'], foreslagenRond: 'BS', kontrollpunkter: ['Att armaturen lyser vid provning', 'Att skylten är hel och syns'] },
    { id: 'A070', namn: 'Kontroll undercentral fjärrvärme', galler: ['undercentral'], foreslagenRond: 'BI', kontrollpunkter: ['Temperaturer fram och retur', 'Tryck', 'Läckage', 'Pumpar'] },
    { id: 'A071', namn: 'Kontroll värmepump', galler: ['varmepump'], foreslagenRond: 'KY', kontrollpunkter: ['Driftläge och larm', 'Temperaturer', 'Ljud och vibrationer'] },
    { id: 'A072', namn: 'Kontroll kylaggregat', galler: ['kylaggregat'], foreslagenRond: 'KY', kontrollpunkter: ['Driftläge och larm', 'Läckagekontroll', 'Kondensor – rengöring'] },
    { id: 'A073', namn: 'Kontroll fettavskiljare', galler: ['fettavskiljare'], foreslagenRond: 'BI', kontrollpunkter: ['Fettnivå', 'Lock och tätning', 'Lukt'] },
    { id: 'A074', namn: 'Kontroll oljeavskiljare', galler: ['oljeavskiljare'], foreslagenRond: 'BU', kontrollpunkter: ['Oljenivå', 'Larm', 'Lock och tätning'] },
    { id: 'A080', namn: 'Kontroll reservkraftaggregat', galler: ['reservkraft'], foreslagenRond: 'EL', kontrollpunkter: ['Provstart', 'Bränslenivå', 'Batteri', 'Läckage'] },
    { id: 'A081', namn: 'Kontroll solcellsanläggning', galler: ['solceller'], foreslagenRond: 'EL', kontrollpunkter: ['Växelriktare – driftläge', 'Paneler – skador', 'Kablage'] },
    { id: 'A090', namn: 'Kontroll lekutrustning', galler: ['lekutrustning'], foreslagenRond: 'BU', kontrollpunkter: ['Skador och vassa kanter', 'Fallskyddsunderlag', 'Fästen och förankring'] },
    { id: 'A091', namn: 'Kontroll tvättmaskin', galler: ['tvattmaskin'], foreslagenRond: 'BI', kontrollpunkter: ['Funktion', 'Läckage', 'Filter'] }
  ];

  window.DP = window.DP || {};
  window.DP.byggnader = window.DP.byggnader || {};
  window.DP.byggnader.hangar = {
    id: 'hangar',
    namn: 'Hangar',
    typ: 'hangar',
    omrade: 'flygfaltet',
    // Byggnadsfärg för brickorna i Balanseringens tidsaxel (beslut 47)
    farg: '#2f8f66',
    beskrivning: 'Komplex byggnad med hög installationstäthet: kontorsdel i tre plan och en stor hall för fordon.',
    stil: { tak: 'platt', motX: 12, dekor: 'hangar' },
    konstanter: { PLANHOJD: PLANHOJD, BJALKLAG: BJALKLAG, FRIHOJD: FRIHOJD, HANGARHOJD: HANGARHOJD },
    yttermatt: { x0: 0, z0: 0, x1: 76, z1: 30, kontorX1: 12 },
    plan: plan,
    rum: rum,
    utrymningsvagar: utrymningsvagar,
    installationer: signifikanta.concat(genereraOvriga())
  };
  window.DP.installationstyper = installationstyper;
  window.DP.ejSignifikantForklaring = ejSignifikantForklaring;
  window.DP.ronder = ronder;
  window.DP.atgarder = atgarder;
})();
