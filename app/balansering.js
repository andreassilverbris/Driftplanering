/*
 * Balanseringens uträkningar: en fristående modul utan DOM.
 *
 * Modulen tar emot ett **underlag** – alla klara byggnaders rondserier med utförare, planerad
 * tid och vilka veckor de ligger i – och svarar på frågor om det. Den vet ingenting om sidan,
 * om DP.Plan eller om hur tillståndet ser ut. Därför går den att pröva med ett underlag som
 * byggs direkt i ett test, och samma uträkning används både av tidsaxeln i Balansering och
 * (senare) av den automatiska balanseringen.
 *
 * Här finns belastningsfunktionen: för ett underlag ger den, per utförare och vecka, planerad
 * tid i dagar, antal rutintillfällen och vilka de är. Kapacitet räknas i tid (beslut 31):
 * en dag är 8 timmar, och utförarens kapacitet är antalet dagar × 8 h. Den mjuka varningen
 * går vid fler än 6 rutintillfällen en vecka, även när tiden räcker – många små saker samma
 * vecka är ett problem i sig.
 */
(function () {
  'use strict';

  var DP = window.DP;

  var TIMMAR_PER_DAG = 8;
  var MANGA_TILLFALLEN = 6;   // fler än så i en vecka ger den mjuka varningen
  var KAPACITET_FORVAL = 3;   // dagar i veckan för tillsyn och skötsel (beslut 31)

  function avrunda(tal, decimaler) {
    var f = Math.pow(10, decimaler || 0);
    return Math.round(tal * f) / f;
  }

  // ------------------------------------------------------------------
  // Belastning per utförare och vecka
  //
  // Underlaget:
  //   {
  //     antalVeckor: 52,
  //     byggnader: [{ id, namn, farg, omrade,
  //                   ronder: [{ id, namn, utforare, timmar, veckor: [1, 5, 9 …] }] }],
  //     utforare:   [{ id, namn, farg }],            // ordningen är radordningen
  //     kapacitet:  { anna: 3, … },                  // dagar i veckan, förval 3
  //     veckorUtan: [28, 29, 30, 31, 52]             // veckor utan tillsyn och skötsel
  //   }
  //
  // Svaret har en rad per utförare, och varje rad en cell per vecka (index 1..antalVeckor,
  // cell 0 används inte – veckonummer är 1-baserade och då slipper vi räkna om överallt).
  // ------------------------------------------------------------------
  function belastning(underlag) {
    var antalVeckor = underlag.antalVeckor || 52;
    var kapacitet = underlag.kapacitet || {};
    var veckorUtan = underlag.veckorUtan || [];
    var utan = {};
    veckorUtan.forEach(function (v) { utan[v] = true; });

    var rader = (underlag.utforare || []).map(function (u) {
      var dagar = kapacitet[u.id] === undefined ? KAPACITET_FORVAL : kapacitet[u.id];
      var rad = {
        utforare: u.id,
        namn: u.namn,
        farg: u.farg,
        kapacitetDagar: dagar,
        kapacitetTimmar: dagar * TIMMAR_PER_DAG,
        veckor: [],
        // Summor över året, så att raden kan säga hur det ser ut i stort
        over: [],      // veckor över kapaciteten
        manga: [],     // veckor med fler än 6 tillfällen
        tillfallen: 0,
        timmar: 0
      };
      for (var v = 0; v <= antalVeckor; v++) {
        rad.veckor.push({
          vecka: v, timmar: 0, dagar: 0, tillfallen: [],
          kapacitetTimmar: rad.kapacitetTimmar, kapacitetDagar: dagar,
          andel: 0, over: false, manga: false, utanTillsyn: !!utan[v]
        });
      }
      return rad;
    });

    var radFor = {};
    rader.forEach(function (r) { radFor[r.utforare] = r; });

    (underlag.byggnader || []).forEach(function (b) {
      (b.ronder || []).forEach(function (r) {
        var rad = radFor[r.utforare];
        if (!rad) { return; }   // en utförare som inte har någon rad hör inte hit
        (r.veckor || []).forEach(function (v) {
          if (v < 1 || v > antalVeckor) { return; }
          var cell = rad.veckor[v];
          cell.timmar += r.timmar || 0;
          cell.tillfallen.push({
            byggnad: b.id, byggnadNamn: b.namn, farg: b.farg,
            rond: r.id, rondNamn: r.namn, vecka: v, timmar: r.timmar || 0,
            dagsdel: r.dagsdel || null, namn: r.namnPerVecka ? r.namnPerVecka[v] : null
          });
        });
      });
    });

    rader.forEach(function (rad) {
      rad.veckor.forEach(function (cell) {
        cell.timmar = avrunda(cell.timmar, 2);
        cell.dagar = avrunda(cell.timmar / TIMMAR_PER_DAG, 2);
        cell.antal = cell.tillfallen.length;
        cell.andel = cell.kapacitetTimmar ? cell.timmar / cell.kapacitetTimmar : (cell.timmar ? 1 : 0);
        // Över kapaciteten: tiden räcker inte. Många tillfällen: tiden kan räcka, men
        // antalet är ändå en varning (beslut 31).
        cell.over = cell.timmar > cell.kapacitetTimmar;
        cell.manga = cell.antal > MANGA_TILLFALLEN;
        // Tillfällena sorteras så att samma underlag alltid ger samma ordning i listan
        cell.tillfallen.sort(function (a, b) {
          if (a.byggnad !== b.byggnad) { return a.byggnad < b.byggnad ? -1 : 1; }
          return a.rond < b.rond ? -1 : (a.rond > b.rond ? 1 : 0);
        });
        if (cell.vecka >= 1) {
          if (cell.over) { rad.over.push(cell.vecka); }
          if (cell.manga) { rad.manga.push(cell.vecka); }
          rad.tillfallen += cell.antal;
          rad.timmar += cell.timmar;
        }
      });
      rad.timmar = avrunda(rad.timmar, 2);
      rad.toppTimmar = rad.veckor.reduce(function (m, c) { return c.vecka >= 1 && c.timmar > m ? c.timmar : m; }, 0);
      rad.toppDagar = avrunda(rad.toppTimmar / TIMMAR_PER_DAG, 2);
    });

    return {
      antalVeckor: antalVeckor,
      rader: rader,
      veckorUtan: veckorUtan.slice(),
      // Den högsta belastningen någon utförare har någon vecka – måttet balanseringen
      // i första hand ska pressa ner (beslut 38 och reglerna i specen).
      toppTimmar: rader.reduce(function (m, r) { return r.toppTimmar > m ? r.toppTimmar : m; }, 0),
      overVeckor: rader.reduce(function (n, r) { return n + r.over.length; }, 0),
      mangaVeckor: rader.reduce(function (n, r) { return n + r.manga.length; }, 0),
      rad: function (utforareId) { return radFor[utforareId] || null; }
    };
  }

  // Kapaciteten i en vecka i klartext, för celler och för veckolistan: "4 h av 24 h · 5 av 6"
  function cellText(cell) {
    return timmarText(cell.timmar) + ' av ' + timmarText(cell.kapacitetTimmar) +
      ' · ' + cell.antal + ' av ' + MANGA_TILLFALLEN + ' tillfällen';
  }
  // Timmar i klartext. Heter inte timText som DP.Plan.timText, eftersom den tar minuter –
  // två funktioner med samma namn och olika enhet i samma namnrymd är en fälla.
  function timmarText(timmar) {
    var t = avrunda(timmar, 1);
    return (t === Math.round(t) ? String(Math.round(t)) : String(t).replace('.', ',')) + ' h';
  }

  DP.Balansering = {
    TIMMAR_PER_DAG: TIMMAR_PER_DAG,
    MANGA_TILLFALLEN: MANGA_TILLFALLEN,
    KAPACITET_FORVAL: KAPACITET_FORVAL,
    belastning: belastning,
    cellText: cellText,
    timmarText: timmarText
  };
})();
