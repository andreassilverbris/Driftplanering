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


  // ------------------------------------------------------------------
  // Den automatiska balanseringen
  //
  // Uträkningen väljer **förskjutningar**, aldrig frekvenser, utförare eller kapacitet
  // (beslut 26 och 46). Den arbetar i två steg: först byggnadernas besöksrytmer (nivå 1),
  // och bara om någon utförare fortfarande är över kapaciteten också enskilda rondserier
  // (nivå 2). Kvarstående överbelastning redovisas i klartext i stället för att gömmas.
  //
  // Underlaget är detsamma som belastningen räknar på, med två tillägg som behövs för att
  // kunna *pröva* en annan förskjutning:
  //   veckoraknare(freq, forskjutning) -> [veckor]   hur en rondserie ligger vid en förskjutning
  //   ronder[].freq                                  rondens frekvens, att skicka till räknaren
  // Räknaren injiceras i stället för att modulen anropar DP.Plan: då går uträkningen att
  // pröva med ett underlag som byggs direkt i ett test, och reglerna om frekvenser (bland
  // dem att en halvårsrond med startmånad bara flyttas inom sin månad, beslut 41) bor kvar
  // på ett ställe – i planeringen.
  //
  // Sökningen är **deterministisk och greedy**: byggnaderna placeras i underlagets ordning,
  // och varje byggnad får den förskjutning som gör måtten nedan bäst givet de redan
  // placerade. Vid lika utfall vinner den minsta förskjutningen. Samma underlag ger därför
  // alltid samma resultat, och förklaringen går att läsa som en följd av beslut.
  // ------------------------------------------------------------------

  // Hur bra ett läge är, i den ordning reglerna säger (specen i biljetten och beslut 38):
  //   1. lägsta toppbelastning per utförare
  //   2. därefter så få veckor som möjligt över kapaciteten
  //   3. därefter så få veckor som möjligt med fler än 6 tillfällen
  // Jämnheten (summan av kvadrerade veckotimmar) kommer sist: den skiljer två lägen som är
  // lika på alla tre måtten, så att tillfällena sprids i stället för att klumpa ihop sig.
  function matt(bel) {
    var spridning = 0;
    bel.rader.forEach(function (rad) {
      rad.veckor.forEach(function (c) { if (c.vecka >= 1) { spridning += c.timmar * c.timmar; } });
    });
    return [bel.toppTimmar, bel.overVeckor, bel.mangaVeckor, avrunda(spridning, 2)];
  }
  // Mindre är bättre, måtten jämförs i ordning
  function battre(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { return a[i] < b[i]; }
    }
    return false;
  }

  // Kandidatförskjutningar för en byggnad: 0 … (längsta rondintervallet − 1), så att varje
  // rond kan hamna i vilken fas som helst inom sin egen rytm. Taket håller sökningen liten
  // och begriplig: en byggnad med bara veckoronder har ingen fas att välja, och en med en
  // årsrond behöver inte 52 kandidater för att jämna ut belastningen – de 26 första räcker,
  // och längre förskjutningar är ändå samma rytm sedd från en annan vecka.
  var KANDIDATTAK = 26;
  function kandidater(byggnad, veckoraknare) {
    var langst = 1;
    (byggnad.ronder || []).forEach(function (r) {
      var iv = intervallFor(r, veckoraknare);
      if (iv > langst) { langst = iv; }
    });
    var n = Math.min(langst, KANDIDATTAK);
    var ut = [];
    for (var f = 0; f < n; f++) { ut.push(f); }
    return ut;
  }
  // Rondens intervall, läst ur räknaren i stället för ur en tabell: avståndet mellan de två
  // första tillfällena. Modulen behöver inte veta vad frekvenserna heter för att se hur
  // många faser en rond har.
  function intervallFor(rond, veckoraknare) {
    var v = veckoraknare(rond.freq, 0) || [];
    return v.length >= 2 ? v[1] - v[0] : 1;
  }

  // Underlaget med en uppsättning förskjutningar tillämpade. Veckorna räknas om ur freq, så
  // belastningen kan räknas på det prövade läget utan att något tillstånd ändras.
  // `bara` (valfri) begränsar underlaget till en lista byggnads-id. Steg 1 använder den för
  // att mäta ett val mot de byggnader som redan har valt sin plats.
  function medForskjutningar(underlag, fsk, rondFsk, veckoraknare, bara) {
    var med = bara ? (underlag.byggnader || []).filter(function (b) { return bara.indexOf(b.id) >= 0; })
                   : (underlag.byggnader || []);
    var kopia = {
      antalVeckor: underlag.antalVeckor,
      utforare: underlag.utforare,
      kapacitet: underlag.kapacitet,
      veckorUtan: underlag.veckorUtan,
      byggnader: med.map(function (b) {
        var bf = fsk[b.id] || 0;
        return {
          id: b.id, namn: b.namn, farg: b.farg, omrade: b.omrade,
          ronder: (b.ronder || []).map(function (r) {
            var rf = (rondFsk[b.id] && rondFsk[b.id][r.id]) || 0;
            return {
              id: r.id, namn: r.namn, utforare: r.utforare, timmar: r.timmar,
              dagsdel: r.dagsdel, freq: r.freq,
              veckor: veckoraknare(r.freq, bf + rf)
            };
          })
        };
      })
    };
    return kopia;
  }

  // Byggnaderna som delar område med en byggnad man åker till, i underlagets ordning
  function akerTillOmraden(underlag) {
    var set = {};
    (underlag.akerTill || []).forEach(function (o) { set[o] = true; });
    return set;
  }

  // ------------------------------------------------------------------
  // balansera(underlag) -> resultat
  //
  // Resultatet är rena data – inget rörs i planeringen. Den som vill tillämpa det skriver
  // förskjutningarna till tillståndet i ett enda historiksteg (beslut 36).
  //
  //   forskjutningar:     { byggnadId: veckor }                 nivå 1
  //   rondForskjutningar: { byggnadId: { rondId: veckor } }      nivå 2, bara där det behövdes
  //   fore / efter:       belastningen före och efter, för att kunna säga vad som blev bättre
  //   kvarstaende:        [{ utforare, namn, veckor, toppTimmar, kapacitetTimmar }]
  //   forklaring:         [{ typ, text }] – raderna planeraren läser
  // ------------------------------------------------------------------
  function balansera(underlag) {
    var veckoraknare = underlag.veckoraknare;
    if (typeof veckoraknare !== 'function') {
      throw new Error('balansera() behöver underlag.veckoraknare(freq, forskjutning)');
    }
    var byggnader = (underlag.byggnader || []).slice();
    var fsk = {}, rondFsk = {};
    byggnader.forEach(function (b) { fsk[b.id] = 0; });
    var fore = belastning(medForskjutningar(underlag, fsk, rondFsk, veckoraknare));
    var akerTill = akerTillOmraden(underlag);
    var forklaring = [];
    // Vilken förskjutning den första byggnaden i ett område man åker till fick: följande
    // byggnader i samma område ska helst ligga på samma vecka (beslut 38).
    var omradesFsk = {};

    // ---------------- Steg 1: byggnadernas besöksrytmer (nivå 1) ----------------
    // Byggnaderna placeras en i taget, och varje val mäts mot **de redan placerade** – inte
    // mot alla byggnader på en gång. Annars hade den första byggnaden fått flytta för att
    // komma undan byggnader som ännu inte hade valt sin plats, och förklaringen hade sagt
    // att något flyttades utan att planeraren kunde se varför. Nu flyttar en byggnad bara
    // när den krockar med något som redan ligger där.
    var placerade = [];
    byggnader.forEach(function (b) {
      placerade.push(b.id);
      var alla = kandidater(b, veckoraknare);
      if (alla.length <= 1) {
        forklaring.push({
          typ: 'orord', byggnad: b.id, veckor: 0,
          text: b.namn + ' har bara veckovisa ronder och har ingen fas att flytta – den ligger kvar.'
        });
        return;
      }
      var prova = function (f) {
        fsk[b.id] = f;
        return matt(belastning(medForskjutningar(underlag, fsk, rondFsk, veckoraknare, placerade)));
      };

      var samlat = akerTill[b.omrade] && omradesFsk[b.omrade] !== undefined;
      if (samlat) {
        // I ett område man åker till samlas byggnaderna i samma vecka så långt kapaciteten
        // räcker, annars i veckorna efter varandra (beslut 38). Därför prövas områdets vecka
        // först, och sedan veckorna efter den i tur och ordning: den första som inte lägger
        // någon utförare över kapaciteten vinner. Jämnheten får inte avgöra här – att samla
        // resan är viktigare än att sprida timmarna.
        var ordning = ordningEfter(alla, omradesFsk[b.omrade]);
        var vald = null;
        for (var i = 0; i < ordning.length; i++) {
          if (prova(ordning[i])[1] === 0) { vald = ordning[i]; break; }
        }
        // Räcker kapaciteten ingenstans blir det områdets vecka: besöken hör ihop, och den
        // kvarstående överbelastningen redovisas i stället för att gömmas (beslut 46).
        fsk[b.id] = vald === null ? ordning[0] : vald;
        forklaring.push(samladRad(b, fsk[b.id], omradesFsk[b.omrade], vald === null, veckoraknare));
        return;
      }

      // Övriga områden: byggnaderna sprids. Den förskjutning som gör måtten bäst vinner, och
      // vid lika utfall den minsta – alltså ingen flytt alls när ingen flytt behövs.
      var bast = null, bastMatt = null;
      alla.forEach(function (f) {
        var m = prova(f);
        if (bast === null || battre(m, bastMatt)) { bast = f; bastMatt = m; }
      });
      fsk[b.id] = bast;
      if (akerTill[b.omrade] && omradesFsk[b.omrade] === undefined) { omradesFsk[b.omrade] = bast; }
      forklaring.push(spriddRad(b, bast, akerTill[b.omrade], veckoraknare));
    });

    // ---------------- Steg 2: enskilda rondserier (nivå 2) ----------------
    var efter = belastning(medForskjutningar(underlag, fsk, rondFsk, veckoraknare));
    if (efter.overVeckor > 0) {
      var forbattrat = false;
      byggnader.forEach(function (b) {
        (b.ronder || []).forEach(function (r) {
          var iv = Math.min(intervallFor(r, veckoraknare), KANDIDATTAK);
          if (iv <= 1) { return; }
          var nu = matt(efter), bast = 0, bastMatt = nu;
          for (var f = 1; f < iv; f++) {
            rondFsk[b.id] = rondFsk[b.id] || {};
            rondFsk[b.id][r.id] = f;
            var m = matt(belastning(medForskjutningar(underlag, fsk, rondFsk, veckoraknare)));
            if (battre(m, bastMatt)) { bast = f; bastMatt = m; }
          }
          if (bast) {
            rondFsk[b.id][r.id] = bast;
            efter = belastning(medForskjutningar(underlag, fsk, rondFsk, veckoraknare));
            forbattrat = true;
            forklaring.push({
              typ: 'rondserie', byggnad: b.id, rond: r.id, veckor: bast,
              text: b.namn + ' · ' + r.namn + ' flyttades ' + veckorOrd(bast) +
                ' för sig, eftersom hela byggnadens rytm inte räckte för att få ner toppen.'
            });
          } else if (rondFsk[b.id]) {
            delete rondFsk[b.id][r.id];
          }
        });
        if (rondFsk[b.id] && !Object.keys(rondFsk[b.id]).length) { delete rondFsk[b.id]; }
      });
      if (!forbattrat && efter.overVeckor > 0) {
        forklaring.push({
          typ: 'rondserie-utan', text: 'Att flytta enskilda rondserier gjorde ingen skillnad, ' +
            'så de ligger kvar i sina byggnaders rytm.'
        });
      }
    }

    // ---------------- Kvarstående överbelastning (beslut 46) ----------------
    var kvarstaende = efter.rader.filter(function (rad) { return rad.over.length; }).map(function (rad) {
      return {
        utforare: rad.utforare, namn: rad.namn, veckor: rad.over.slice(),
        toppTimmar: rad.toppTimmar, kapacitetTimmar: rad.kapacitetTimmar,
        kapacitetDagar: rad.kapacitetDagar
      };
    });

    return {
      forskjutningar: fsk,
      rondForskjutningar: rondFsk,
      fore: fore,
      efter: efter,
      kvarstaende: kvarstaende,
      forbattring: {
        toppTimmarFore: fore.toppTimmar, toppTimmarEfter: efter.toppTimmar,
        overVeckorFore: fore.overVeckor, overVeckorEfter: efter.overVeckor,
        mangaVeckorFore: fore.mangaVeckor, mangaVeckorEfter: efter.mangaVeckor
      },
      forklaring: forklaring
    };
  }

  // Kandidaterna i den ordning ett samlat område vill ha dem: samma vecka först, sedan
  // veckorna efter varandra, och till sist resten (så att listan alltid är komplett).
  //
  // Områdets vecka behöver inte finnas bland den här byggnadens kandidater: listan är
  // 0 … (längsta rondintervallet − 1), och två byggnader i samma område kan ha olika långa
  // ronder. En byggnad med bara månadsronder har kandidaterna 0–3, och ligger områdets
  // första byggnad på 13 finns ingen sådan kandidat. Starten räknas därför modulo listans
  // längd – samma räkning som förskjutningen själv gör (beslut 26), så byggnaden hamnar i
  // den fas som ligger närmast områdets vecka.
  function ordningEfter(alla, start) {
    var ut = [];
    var fran = ((Math.round(start) % alla.length) + alla.length) % alla.length;
    for (var i = 0; i < alla.length; i++) { ut.push(alla[(fran + i) % alla.length]); }
    return ut;
  }

  function veckorOrd(n) { return n === 1 ? '1 vecka' : n + ' veckor'; }

  // Raderna i förklaringen, i klartext och med skälet till flytten (beslut 36). En förklaring
  // som bara säger *vad* som flyttades hjälper inte den som ska lita på uträkningen – varje
  // rad säger också varför, och vilka veckor besöken hamnade i.
  //
  // Förskjutningen i veckor räcker inte som besked. Varje rond räknar förskjutningen modulo
  // sitt eget intervall (beslut 26), så en byggnad kan få "4 veckor" och ändå ha sina
  // månadsronder kvar på samma veckor – 4 modulo 4 är 0. Raden säger därför hur många av
  // byggnadens rondserier som faktiskt bytte vecka, och vilka veckor den besöks i nu.
  function flyttBeskrivning(b, fsk, veckoraknare) {
    var flyttade = 0, total = 0, veckor = {};
    (b.ronder || []).forEach(function (r) {
      total++;
      var fore = veckoraknare(r.freq, 0) || [];
      var efter = veckoraknare(r.freq, fsk) || [];
      efter.forEach(function (v) { veckor[v] = true; });
      if (fore.join(',') !== efter.join(',')) { flyttade++; }
    });
    return {
      flyttade: flyttade, total: total,
      veckor: Object.keys(veckor).map(Number).sort(function (a, c) { return a - c; })
    };
  }
  // De första besöksveckorna i klartext: "v. 3, 7, 11 …" – nog för att hitta dem i tidsaxeln
  function veckorKort(veckor) {
    if (!veckor.length) { return 'inga veckor'; }
    var visa = veckor.slice(0, 3);
    return 'v. ' + visa.join(', ') + (veckor.length > visa.length ? ' …' : '');
  }
  function rondserieOrd(n) { return n === 1 ? '1 rondserie' : n + ' rondserier'; }

  function spriddRad(b, fsk, iAkerTill, veckoraknare) {
    var fl = flyttBeskrivning(b, fsk, veckoraknare);
    if (!fsk || !fl.flyttade) {
      return { typ: 'orord', byggnad: b.id, veckor: 0, besoksveckor: fl.veckor,
        text: b.namn + ' ligger kvar där den låg (' + veckorKort(fl.veckor) +
          ') – den krockar inte med någon annan byggnad.' };
    }
    return { typ: 'forskjuten', byggnad: b.id, veckor: fsk, besoksveckor: fl.veckor,
      flyttadeRonder: fl.flyttade,
      text: b.namn + ' förskjuts ' + veckorOrd(fsk) + ' och besöks nu ' + veckorKort(fl.veckor) +
        (iAkerTill ? '' : ', så att besöken inte hamnar samma veckor som de andra byggnadernas') +
        '. ' + (fl.flyttade === fl.total
          ? (fl.total === 1 ? 'Rondserien flyttade med.' : 'Alla ' + fl.total + ' rondserierna flyttade med.')
          : rondserieOrd(fl.flyttade) + ' av ' + fl.total + ' bytte vecka – de övriga ligger ' +
            'likadant, eftersom förskjutningen går jämnt upp i deras frekvens.') };
  }
  function samladRad(b, fsk, omradesFsk, utanPlats, veckoraknare) {
    var fl = flyttBeskrivning(b, fsk, veckoraknare);
    var efter = fsk - omradesFsk;
    if (utanPlats) {
      return { typ: 'samlad-utan-plats', byggnad: b.id, veckor: fsk, besoksveckor: fl.veckor,
        text: b.namn + ' ligger i samma vecka som de andra byggnaderna man åker till (' +
          veckorKort(fl.veckor) + '), men kapaciteten räcker inte någon vecka – ' +
          'överbelastningen står kvar och redovisas nedan.' };
    }
    if (!efter) {
      return { typ: 'samlad', byggnad: b.id, veckor: fsk, besoksveckor: fl.veckor,
        text: b.namn + ' ligger i samma vecka som de andra byggnaderna man åker till (' +
          veckorKort(fl.veckor) + ') – kapaciteten räcker för att göra dem i samma resa.' };
    }
    return { typ: 'samlad-efter', byggnad: b.id, veckor: fsk, besoksveckor: fl.veckor,
      text: b.namn + ' ligger ' + veckorOrd(efter) + ' efter de andra byggnaderna man åker till (' +
        veckorKort(fl.veckor) + '): kapaciteten räckte inte för att göra allt i samma vecka.' };
  }

  DP.Balansering = {
    TIMMAR_PER_DAG: TIMMAR_PER_DAG,
    MANGA_TILLFALLEN: MANGA_TILLFALLEN,
    KAPACITET_FORVAL: KAPACITET_FORVAL,
    belastning: belastning,
    balansera: balansera,
    cellText: cellText,
    timmarText: timmarText
  };
})();
