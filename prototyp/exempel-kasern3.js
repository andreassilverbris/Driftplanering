/*
 * PROTOTYP – slit och släng (beslut 102).
 * En påhittad, avsiktligt rörig inläsningsfil för Kasern 3, som den kan se ut när någon annan
 * fyllt i den: plan skrivna på olika sätt (00, 0, P1, 1, Plan 3), ett plan som inte finns, rum
 * som inte känns igen, en saknad NTA, en installation med okänd typ, en i ett rum som inte finns,
 * en där planen saknas och ett tomt Id. Kolumnerna Golvmaterial och Kommentar är egna fält.
 */
(function () {
  'use strict';
  var DP = window.DP = window.DP || {};

  var plan = [
    ['Plan', 'Benämning'],
    ['01', 'Entréplan'],
    ['02', 'Plan 2'],
    ['03', ''],
    ['00', 'Källare']
  ];

  var rum = [
    ['Plan', 'Rum', 'Benämning', 'NTA', 'NTV', 'BRA', 'BTA', 'Temperaturreglerad', 'Golvmaterial'],
    // Källare – ett rum med planen skriven "0"
    ['00', '001', 'Korridor', 84, 218, '', '', 'Ja', 'Betong'],
    ['00', '002', 'Undercentral', 42, 109, '', '', 'Nej', 'Betong'],
    ['0', '003', 'Tvättstuga', 46, 120, '', '', 'Ja', 'Klinker'],
    ['00', '004', 'Förråd', 70, '', '', '', 'Nej', ''],
    ['00', '005', 'Skyddsrum', 84, '', '', '', 'Nej', 'Betong'],
    // Entréplan – "P1" och "1"/"10"
    ['01', '001', 'Entré', 44, '', 48, 52, 'Ja', 'Klinker'],
    ['01', '002', 'Korr.', 90, '', 96, 104, 'Ja', 'Linoleum'],
    ['01', '003', 'Trapphus', 22, '', '', '', 'Ja', ''],
    ['01', '004', 'Kompaniexpedition', 46, '', '', '', 'Ja', 'Linoleum'],
    ['01', '005', 'Dagrum', 70, '', '', '', 'Ja', 'Linoleum'],
    ['01', '006', 'WC/D', 16, '', '', '', 'Ja', 'Klinker'],
    ['01', '007', 'Städ', 8, '', '', '', 'Ja', ''],
    ['01', '008', 'Elrum', 9, '', '', '', 'Nej', ''],
    ['P1', '009', 'Materielförråd', 62, '', '', '', 'Nej', ''],
    ['1', '10', 'Vaktrum', 44, '', '', '', 'Ja', 'Linoleum'],
    ['01', '011', 'Trapphus', 22, '', '', '', 'Ja', ''],
    // Plan 2 – "Sovsal 4", "Gillestuga" och en saknad NTA
    ['02', '001', 'Korridor', 90, '', '', '', 'Ja', 'Linoleum'],
    ['02', '002', 'Trapphus', 22, '', '', '', 'Ja', ''],
    ['02', '003', 'Logement 2:1', 36, '', '', '', 'Ja', 'Linoleum'],
    ['02', '004', 'Logem. 2:2', 36, '', '', '', 'Ja', 'Linoleum'],
    ['02', '005', 'Sovsal 4', 48, '', '', '', 'Ja', 'Linoleum'],
    ['02', '006', 'Logement 2:4', 36, '', '', '', 'Ja', 'Linoleum'],
    ['02', '007', 'WC/Dusch', 16, '', '', '', 'Ja', 'Klinker'],
    ['02', '008', 'Gillestuga', 40, '', '', '', 'Ja', 'Parkett'],
    ['02', '009', 'Logement 2:5', '', '', '', '', 'Ja', ''],
    ['02', '010', 'Logement 2:6', 36, '', '', '', 'Ja', 'Linoleum'],
    ['02', '011', 'Trapphus', 22, '', '', '', 'Ja', ''],
    ['02', '012', 'Elrum', 9, '', '', '', 'Nej', ''],
    // Plan 3 – "Plan 3", ett högt fläktrum (NTV ÷ NTA = 4 m) och ett rum på ett plan som inte finns
    ['03', '001', 'Korridor', 90, '', '', '', 'Ja', 'Linoleum'],
    ['Plan 3', '002', 'Trapphus', 22, '', '', '', 'Ja', ''],
    ['03', '003', 'Logement 3:1', 36, '', '', '', 'Ja', 'Linoleum'],
    ['03', '004', 'Logement 3:2', 36, '', '', '', 'Ja', 'Linoleum'],
    ['03', '005', 'Logement 3:3', 36, '', '', '', 'Ja', 'Linoleum'],
    ['03', '006', 'WC/Dusch', 16, '', '', '', 'Ja', 'Klinker'],
    ['03', '007', 'Fläktrum', 48, 192, '', '', 'Nej', 'Betong'],
    ['03', '008', 'Logement 3:4', 36, '', '', '', 'Ja', 'Linoleum'],
    ['03', '009', 'Logement 3:5', 36, '', '', '', 'Ja', 'Linoleum'],
    ['03', '010', 'Trapphus', 22, '', '', '', 'Ja', ''],
    ['05', '001', 'Vindsförråd', 60, '', '', '', 'Nej', '']
  ];

  var inst = [
    ['Plan', 'Rum', 'Benämning', 'Beteckning', 'Fabrikat', 'Modell', 'Id', 'Externt id', 'Installationsdatum', 'Kommentar'],
    ['01', '001', 'Brandlarmscentral 1', 'BLC01', 'Securia', 'BC-200', '00000401', 'L850001', '2015-03-12', ''],
    ['01', '001', 'Dörrautomatik 1', 'DA01', 'Dorma', 'ED-100', '00000402', 'L850002', '2021-09-15', ''],
    ['01', '002', 'Handbrandsläckare 1', 'HB01', 'Presto', 'P6kg', '00000403', '', '2019-05-02', ''],
    ['01', '002', 'Brandpost 1', 'BP01', 'Nordhydrant', 'NH-25', '00000404', 'L850003', '', ''],
    ['01', '002', 'Nödbelysningsarmatur 1', 'NB01', 'Lumen', 'NL-3h', '00000405', '', '', ''],
    ['01', '008', 'Gruppcentral 1', 'GC01', 'Elektra', 'GC-63', '00000406', 'L850004', '', ''],
    ['01', '004', 'BLC 2', 'BLC02', 'Securia', 'BC-50', '00000407', 'L850005', '2015-03-12', 'Undercentral till BLC01'],
    ['02', '001', 'Handbrandsläckare 2', 'HB02', 'Presto', 'P6kg', '00000408', '', '2019-05-02', ''],
    ['02', '1', 'Brandpost 2', 'BP02', 'Nordhydrant', 'NH-25', '00000409', 'L850006', '', ''],
    ['02', '001', 'Nödbelysningsarmatur 2', 'NB02', 'Lumen', 'NL-3h', '00000410', '', '', ''],
    ['', '012', 'Gruppcentral 2', 'GC02', 'Elektra', 'GC-63', '00000411', 'L850007', '', ''],
    ['02', '099', 'Torkskåp 1', 'TS01', 'Tvättex', 'TS-18', '00000412', 'L850008', '', ''],
    ['03', '001', 'Handbr.släckare 3', 'HB03', 'Presto', 'P6kg', '00000413', '', '2019-05-02', ''],
    ['P3', '001', 'Brandpost 3', 'BP03', 'Nordhydrant', 'NH-25', '00000414', 'L850009', '', ''],
    ['03', '007', 'Luftbehandlingsaggregat 1', 'LB01', 'Fahoma', 'FTX0840', '00000415', 'L850010', '2012-06-20', ''],
    ['', '008', 'Gruppcentral 3', 'GC03', 'Elektra', 'GC-63', '00000416', 'L850011', '', 'Står i elrummet'],
    ['00', '002', 'Undercentral 1', 'UC01', 'Termex', 'UC-150', '00000417', 'L850012', '2009-10-01', ''],
    ['00', '001', 'Handbrandsläckare 4', 'HB04', 'Presto', 'K5kg', '', '', '2019-05-02', 'Id saknas i fastighetssystemet'],
    ['00', '005', 'Skyddsrumsaggregat 1', 'SRA01', 'Skyddsteknik', 'SRV-300', '00000418', 'L850013', '', ''],
    ['00', '003', 'Tvättmaskin 1', 'TM01', 'Tvättex', 'TX-8', '00000419', 'L850014', '2018-02-01', '']
  ];

  DP.exempelKasern3 = function () { return { plan: plan, rum: rum, inst: inst }; };
})();
