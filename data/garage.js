/*
 * Typbyggnad: Garage
 * ------------------
 * Enkel byggnad att börja lära sig på: ett rum för två bilar, två portar, självdragsventilation,
 * lite belysning och en handbrandsläckare. Signifikanta: handbrandsläckaren och de två portarna
 * (det är avgörande att portarna går att öppna).
 * Koordinater (meter): x 0–8, z 0–7 (7 = framsida med portarna).
 */
(function () {
  'use strict';
  var DP = window.DP;

  var HOJD = 2.8;
  var rum = [{ nr: '1001', namn: 'Garage', plan: '01', typ: 'forrad', rect: [0, 0, 8, 7], hojd: HOJD }];

  function ovr(typ, x, z, h) { return { typ: typ, rum: '1001', x: x, z: z, h: h || 0, signifikant: false }; }

  DP.byggnader.garage = {
    id: 'garage',
    namn: 'Garage',
    typ: 'garage',
    omrade: 'kasernomradet',
    // Byggnadsfärg: brickorna i Balanseringens tidsaxel har byggnadens färg (beslut 47)
    farg: '#d08a2f',
    beskrivning: 'Enkel byggnad för två bilar. Bra att börja med: bara tre signifikanta installationer – en handbrandsläckare och två portar.',
    stil: { tak: 'sadel', sadel: { bas: HOJD, hojd: 2.2 }, ytterFarg: 0xc9b89a, takFarg: 0x4d4f52, portSida: 'N', dekor: 'garage', fonster: { bredd: 1.0, steg: 4, hojd: 0.8, brost: 1.4 } },
    konstanter: { PLANHOJD: HOJD, BJALKLAG: 0.2, FRIHOJD: HOJD },
    plan: [{ id: '01', namn: 'Garageplan', elev: 0 }],
    rum: rum,
    installationer: [
      { id: '00000301', typ: 'handbrandslackare', nr: 1, benamning: 'Handbrandsläckare 1', fabrikat: 'Presto', modell: 'P6kg', beteckning: 'HB01', externtId: null, rum: '1001', x: 0, z: 5.5, h: 0.5, signifikant: true },
      { id: '00000302', typ: 'garageport', nr: 1, benamning: 'Garageport 1', fabrikat: 'Portia', modell: 'GP-2522', beteckning: 'PORT01', externtId: 'L930101', rum: '1001', x: 2.1, z: 7, h: 0, signifikant: true },
      { id: '00000303', typ: 'garageport', nr: 2, benamning: 'Garageport 2', fabrikat: 'Portia', modell: 'GP-2522', beteckning: 'PORT02', externtId: 'L930102', rum: '1001', x: 5.9, z: 7, h: 0, signifikant: true },
      ovr('ventilationsgaller', 0, 1.2, 0.25), ovr('ventilationsgaller', 8, 1.2, 2.4),
      ovr('lysrorsarmatur', 2.2, 3.5, 0), ovr('lysrorsarmatur', 5.8, 3.5, 0),
      ovr('vaggbrytare', 0, 6.4, 1.1), ovr('vagguttag', 8, 2.5, 0.3), ovr('vagguttag', 8, 5, 0.3)
    ]
  };
})();
