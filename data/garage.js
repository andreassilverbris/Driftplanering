/*
 * Typbyggnad: Garage
 * ------------------
 * Enkel byggnad att börja lära sig på: ett rum för två bilar, två manuella portar,
 * självdragsventilation, lite belysning och en handbrandsläckare (den enda signifikanta installationen).
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
    beskrivning: 'Enkel byggnad för två bilar. Bra att börja med: bara en signifikant installation.',
    stil: { tak: 'sadel', sadel: { bas: HOJD, hojd: 2.2 }, ytterFarg: 0xc9b89a, takFarg: 0x4d4f52, portSida: 'N', dekor: 'garage', fonster: { bredd: 1.0, steg: 4, hojd: 0.8, brost: 1.4 } },
    konstanter: { PLANHOJD: HOJD, BJALKLAG: 0.2, FRIHOJD: HOJD },
    plan: [{ id: '01', namn: 'Garageplan', elev: 0 }],
    rum: rum,
    installationer: [
      { id: '00000301', typ: 'handbrandslackare', nr: 1, benamning: 'Handbrandsläckare 1', fabrikat: 'Presto', modell: 'P6kg', beteckning: 'HB01', externtId: null, rum: '1001', x: 0, z: 5.5, h: 0.5, signifikant: true },
      ovr('garageport', 2.1, 7, 0), ovr('garageport', 5.9, 7, 0),
      ovr('ventilationsgaller', 0, 1.2, 0.25), ovr('ventilationsgaller', 8, 1.2, 2.4),
      ovr('lysrorsarmatur', 2.2, 3.5, 0), ovr('lysrorsarmatur', 5.8, 3.5, 0),
      ovr('vaggbrytare', 0, 6.4, 1.1), ovr('vagguttag', 8, 2.5, 0.3), ovr('vagguttag', 8, 5, 0.3)
    ]
  };
})();
