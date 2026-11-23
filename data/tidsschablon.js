/*
 * Tidsschablonen: underlaget för förslaget på planerad tid per rond (beslut 43).
 *
 * Schablonen ligger som data och inte i koden, så att den går att justera utan att röra
 * uträkningen. En åtgärd kostar ett antal minuter per installation den är kopplad till, och
 * de generella åtgärderna kostar per rum respektive ett fast påslag för varvet runt huset.
 *
 * Tyngden är en grov bedömning: en handbrandsläckare tittar man på i några minuter, ett
 * luftbehandlingsaggregat tar en stund. Får en åtgärd ett erfarenhetsvärde i minuter gäller
 * det i stället för tyngden – det är förberett för verklig statistik och sätts inte här.
 */
(function () {
  'use strict';
  var DP = window.DP;

  // Minuter per installation för varje tyngd
  var MINUTER = { latt: 3, normal: 15, tung: 45 };

  // Tyngd per installationstyp. Åtgärdens tyngd följer den typ den gäller.
  // Typer som inte står här är normala.
  var LATT = ['handbrandslackare', 'nodbelysning', 'jordfelsbrytare', 'brandpost', 'utrymningsstege', 'brandgaslucka'];
  var TUNG = ['luftbehandlingsaggregat', 'undercentral', 'sprinklercentral', 'reservkraft', 'kylaggregat',
    'varmepump', 'skyddsrumsaggregat', 'personhiss', 'brandlarmscentral'];

  var tyngdPerTyp = {};
  LATT.forEach(function (t) { tyngdPerTyp[t] = 'latt'; });
  TUNG.forEach(function (t) { tyngdPerTyp[t] = 'tung'; });

  // De generella åtgärderna gäller byggnaden som helhet. Invändigt skalar med antalet rum
  // (man går igenom dem), utvändigt är ett varv runt huset oavsett storlek.
  var GENERELLA = {
    A001: { perRum: 2, namn: 'Kontroll byggnad invändigt' },
    A002: { fast: 30, namn: 'Kontroll byggnad utvändigt' }
  };

  // Dagsdelarna och deras tak i minuter (beslut 27). Den minsta dagsdel som rymmer tiden väljer.
  // Över taket för heldag ryms rutintillfället inte på en dag, och då föreslås en delning.
  var DAGSDELAR = [
    { id: 'kort',      namn: 'kort',       timmar: 1, takMin: 60 },
    { id: 'kvartsdag', namn: 'kvartsdag',  timmar: 2, takMin: 120 },
    { id: 'halvdag',   namn: 'halvdag',    timmar: 4, takMin: 240 },
    { id: 'heldag',    namn: 'heldag',     timmar: 8, takMin: 480 }
  ];

  // Erfarenhetsvärden i minuter per installation, per åtgärds-id. Gäller i stället för tyngden.
  // Tomt i etapp 5: fältet är förberett för statistik från utförda rutintillfällen (idé 7).
  var ERFARENHET = {};

  DP.tidsschablon = {
    MINUTER: MINUTER,
    DAGSDELAR: DAGSDELAR,
    tyngdPerTyp: tyngdPerTyp,
    generella: GENERELLA,
    erfarenhet: ERFARENHET,

    // Minuter per installation för en åtgärd: erfarenhetsvärdet om det finns, annars tyngden.
    minuterPerInstallation: function (atgard) {
      if (ERFARENHET[atgard.id] !== undefined) { return ERFARENHET[atgard.id]; }
      return MINUTER[this.tyngd(atgard)];
    },

    // Åtgärdens tyngd följer de installationstyper den gäller. Gäller den flera typer med olika
    // tyngd (Kontroll elcentral gäller både huvud- och gruppcentral) väger den tyngsta, så att
    // tiden inte underskattas. Generella åtgärder har ingen tyngd.
    tyngd: function (atgard) {
      if (atgard.generell) { return null; }
      var tyngst = null;
      (atgard.galler || []).forEach(function (typ) {
        var t = tyngdPerTyp[typ] || 'normal';
        if (tyngst === null || MINUTER[t] > MINUTER[tyngst]) { tyngst = t; }
      });
      return tyngst || 'normal';
    },

    // Minsta dagsdel som rymmer tiden. Över heldagen finns ingen: då ryms ronden inte på en dag.
    dagsdelFor: function (minuter) {
      for (var i = 0; i < DAGSDELAR.length; i++) {
        if (minuter <= DAGSDELAR[i].takMin) { return DAGSDELAR[i]; }
      }
      return null;
    },
    dagsdel: function (id) {
      return DAGSDELAR.filter(function (d) { return d.id === id; })[0] || null;
    }
  };
})();
