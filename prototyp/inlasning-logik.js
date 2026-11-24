/*
 * PROTOTYP – slit och släng (beslut 75 och 102). Inte en del av systemet.
 * -----------------------------------------------------------------------
 * Inläsningslägets logik utan DOM: tolkning av inläsningsfilens tre flikar, förslag och
 * frågor, åtgärderna som ett rent steg (tillstånd, åtgärd) → nytt tillstånd, och en enkel
 * planlösning för kasern. Sidan (inlasning-sida.js) anropar hit; inget går åt andra hållet.
 *
 * Frågan prototypen ska besvara: känns inläsningsläget rätt – klart, förslag och oplacerat,
 * Godta alla, dra och släpp, modellen som växer fram och ångra/gör om?
 */
(function () {
  'use strict';
  var DP = window.DP = window.DP || {};

  // ------------------------------------------------------------------
  // Flikar och kolumner
  // ------------------------------------------------------------------
  var KOLUMNER = {
    plan: [['Plan', 'id'], ['Benämning', 'namn']],
    rum: [['Plan', 'plan'], ['Rum', 'nr'], ['Benämning', 'namn'], ['NTA', 'nta'], ['NTV', 'ntv'],
      ['BRA', 'bra'], ['BTA', 'bta'], ['Temperaturreglerad', 'temp']],
    inst: [['Plan', 'plan'], ['Rum', 'rum'], ['Benämning', 'benamning'], ['Beteckning', 'beteckning'],
      ['Fabrikat', 'fabrikat'], ['Modell', 'modell'], ['Id', 'id'], ['Externt id', 'externtId'],
      ['Installationsdatum', 'datum']]
  };
  var FLIKNAMN = { plan: 'Plan', rum: 'Rum', inst: 'Installationer' };

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9åäöé]/g, ''); }
  function txt(v) { return v == null ? '' : String(v).trim(); }
  function tal(v) {
    var s = txt(v).replace(/\s/g, '').replace(',', '.');
    if (!s) { return null; }
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function pad3(n) { return ('000' + n).slice(-3); }
  function kopia(o) { return JSON.parse(JSON.stringify(o)); }

  // Vilken flik är det? Rubrikerna avgör, inte bladets namn (Numbers döper ibland om bladen).
  function vilkenFlik(rubriker) {
    var r = rubriker.map(norm);
    function har(x) { return r.indexOf(norm(x)) >= 0; }
    if (har('Fabrikat') || har('Beteckning')) { return 'inst'; }
    if (har('NTA') || (har('Rum') && har('Plan'))) { return 'rum'; }
    if (har('Plan')) { return 'plan'; }
    return null;
  }

  // ark: [{ namn, rader: [[cell, …], …] }] → { plan: [rad], rum: [rad], inst: [rad], ignorerade: [namn] }
  // En rad är { falt-nyckel: text, egna: { rubrik: text } }.
  function lasArk(ark) {
    var ut = { plan: [], rum: [], inst: [], ignorerade: [], egnaKolumner: { plan: [], rum: [], inst: [] } };
    ark.forEach(function (a) {
      // Rubrikraden: första raden bland de sex översta som har minst två kända rubriker.
      // Tabellrubriker och tomma rader som Numbers lägger överst hoppas över.
      var kanda = {};
      Object.keys(KOLUMNER).forEach(function (f) { KOLUMNER[f].forEach(function (k) { kanda[norm(k[0])] = true; }); });
      var rubrikRad = -1;
      for (var i = 0; i < Math.min(6, a.rader.length); i++) {
        var antal = a.rader[i].filter(function (c) { return kanda[norm(c)]; }).length;
        if (antal >= 2 || (antal === 1 && a.rader[i].filter(function (c) { return txt(c); }).length <= 2)) { rubrikRad = i; break; }
      }
      if (rubrikRad < 0) { ut.ignorerade.push(a.namn); return; }
      var rubriker = a.rader[rubrikRad].map(txt);
      var flik = vilkenFlik(rubriker);
      if (!flik) { ut.ignorerade.push(a.namn); return; }
      var karta = {};
      KOLUMNER[flik].forEach(function (k) { karta[norm(k[0])] = k[1]; });
      rubriker.forEach(function (r) {
        if (r && !karta[norm(r)] && ut.egnaKolumner[flik].indexOf(r) < 0) { ut.egnaKolumner[flik].push(r); }
      });
      a.rader.slice(rubrikRad + 1).forEach(function (rad) {
        if (!rad.some(function (c) { return txt(c); })) { return; }
        var o = { egna: {} };
        rubriker.forEach(function (r, j) {
          var v = txt(rad[j]);
          if (karta[norm(r)]) { o[karta[norm(r)]] = v; }
          else if (r && v) { o.egna[r] = v; }
        });
        ut[flik].push(o);
      });
    });
    return ut;
  }

  // ------------------------------------------------------------------
  // Igenkänning: plan, rumstyp och installationstyp
  // ------------------------------------------------------------------
  // "P1", "01", "1" och "Plan 1" blir alla 1. Källare blir negativa.
  function planTal(s) {
    var t = txt(s).toLowerCase();
    if (!t) { return null; }
    if (/^(k|källare|kallare)\b/.test(t) || /^k\d/.test(t)) { var k = t.match(/\d+/); return -(k ? parseInt(k[0], 10) : 1); }
    var m = t.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  function rumTal(s) { var m = txt(s).match(/^\d+$/); return m ? parseInt(m[0], 10) : null; }

  var RUMSTYPER = [
    { id: 'korridor', namn: 'Korridor', monster: /^korr/, farg: 'kommunikation', nta: 80 },
    { id: 'trapphus', namn: 'Trapphus', monster: /trapp/, farg: 'kommunikation', nta: 22 },
    { id: 'entre', namn: 'Entré', monster: /entr/, farg: 'kommunikation', nta: 40 },
    { id: 'logement', namn: 'Logement', monster: /logem|sovsal/, farg: 'kontor', nta: 36 },
    { id: 'wc', namn: 'WC/Dusch', monster: /^wc|dusch|toalett/, farg: 'personal', nta: 16 },
    { id: 'stad', namn: 'Städ', monster: /städ/, farg: 'teknik', nta: 8 },
    { id: 'teknik', namn: 'Teknikutrymme', monster: /elrum|elcentral|undercentral|fläktrum|teknik/, farg: 'teknik', nta: 16 },
    { id: 'tvatt', namn: 'Tvätt och tork', monster: /tvätt|tork/, farg: 'personal', nta: 30 },
    { id: 'forrad', namn: 'Förråd', monster: /förråd|kallvind/, farg: 'forrad', nta: 40 },
    { id: 'skyddsrum', namn: 'Skyddsrum', monster: /skyddsrum/, farg: 'teknik', nta: 70 },
    { id: 'kok', namn: 'Kök', monster: /kök|diskrum/, farg: 'personal', nta: 30 },
    { id: 'fikarum', namn: 'Fikarum', monster: /fika|pentry|personalrum/, farg: 'personal', nta: 20 },
    { id: 'kontor', namn: 'Kontor och dagrum', monster: /kontor|expedition|vaktrum|lektion|dagrum/, farg: 'kontor', nta: 40 },
    { id: 'ovrigt', namn: 'Övrigt rum', monster: null, farg: 'forrad', nta: 30 }
  ];
  function rumstyp(id) { return RUMSTYPER.filter(function (t) { return t.id === id; })[0] || RUMSTYPER[RUMSTYPER.length - 1]; }
  function kannIgenRum(namn) {
    var t = txt(namn).toLowerCase();
    for (var i = 0; i < RUMSTYPER.length; i++) { if (RUMSTYPER[i].monster && RUMSTYPER[i].monster.test(t)) { return RUMSTYPER[i].id; } }
    return null;
  }

  var TYP_ALIAS = {
    handbrandslackare: ['handbrandsläckare', 'handbr', 'brandsläckare'],
    brandlarmscentral: ['brandlarmscentral', 'brandlarmcentral'],
    nodbelysning: ['nödbelysning', 'nödljus'],
    undercentral: ['undercentral'],
    luftbehandlingsaggregat: ['luftbehandlingsaggregat', 'lb-aggregat', 'ventilationsaggregat'],
    kompressor: ['kompressor']
  };
  function signifikantaTyper() {
    var T = DP.installationstyper || {};
    return Object.keys(T).filter(function (k) { return T[k].kategori !== 'ovrig'; });
  }
  function kannIgenTyp(benamning) {
    var t = txt(benamning).toLowerCase(), T = DP.installationstyper || {}, bast = null, langd = 0;
    signifikantaTyper().forEach(function (k) {
      var alias = (TYP_ALIAS[k] || []).concat([T[k].namn.toLowerCase()]);
      alias.forEach(function (a) { if (t.indexOf(a) >= 0 && a.length > langd) { bast = k; langd = a.length; } });
    });
    return bast;
  }

  // ------------------------------------------------------------------
  // Tolkning: varje rad får sina uppgifter (falt) och sina frågor.
  // En fråga med förslag är ett förslag; en fråga utan förslag gör raden oplacerad.
  // ------------------------------------------------------------------
  function status(rad) {
    if (!rad.fragor.length) { return 'klar'; }
    return rad.fragor.every(function (f) { return f.forslag != null; }) ? 'forslag' : 'oplacerad';
  }
  function forslagFor(rad, slag) {
    var f = rad.fragor.filter(function (x) { return x.slag === slag; })[0];
    return f ? f.forslag : null;
  }

  function tolkaPlan(rader) {
    var ut = [];
    rader.forEach(function (r, i) {
      if (!txt(r.id)) { return; }
      var rad = { key: 'p' + (i + 1), rad: r, egna: r.egna, falt: { id: txt(r.id), namn: txt(r.namn) }, fragor: [] };
      if (!rad.falt.namn) {
        rad.fragor.push({ slag: 'benamning', text: 'Planen saknar benämning', forslag: 'Plan ' + rad.falt.id });
      }
      ut.push(rad);
    });
    return ut;
  }

  // Ordningen nedifrån och upp föreslås ur beteckning och benämning (beslut 84).
  function planRang(p) {
    var namn = (p.falt.namn || '').toLowerCase();
    if (/vind|teknikplan/.test(namn)) { return 1000; }
    if (/källar/.test(namn)) { var t0 = planTal(p.falt.id); return t0 != null && t0 <= 0 ? t0 - 0.5 : -1; }
    var t = planTal(p.falt.id);
    return t == null ? 500 : t;
  }
  function foreslagenOrdning(planer) {
    return planer.map(function (p, i) { return { id: p.falt.id, r: planRang(p), i: i }; })
      .sort(function (a, b) { return a.r - b.r || a.i - b.i; })
      .map(function (x) { return x.id; });
  }

  function matchaPlan(planer, varde) {
    var v = txt(varde);
    if (!v) { return { exakt: null, kand: [] }; }
    var exakt = planer.filter(function (p) { return p.falt.id === v; })[0];
    if (exakt) { return { exakt: exakt.falt.id, kand: [exakt.falt.id] }; }
    var n = planTal(v);
    var kand = n == null ? [] : planer.filter(function (p) { return planTal(p.falt.id) === n; }).map(function (p) { return p.falt.id; });
    return { exakt: null, kand: kand };
  }

  function tolkaRum(rader, planer) {
    return rader.map(function (r, i) {
      var rad = {
        key: 'r' + (i + 1), rad: r, egna: r.egna, fragor: [],
        falt: { plan: null, nr: null, namn: txt(r.namn), rumstyp: null, nta: tal(r.nta), ntv: tal(r.ntv), bra: tal(r.bra), bta: tal(r.bta), temp: txt(r.temp) }
      };
      var mp = matchaPlan(planer, r.plan);
      if (mp.exakt) { rad.falt.plan = mp.exakt; }
      else if (mp.kand.length === 1) { rad.fragor.push({ slag: 'plan', text: 'Plan "' + txt(r.plan) + '" tolkas som plan ' + mp.kand[0], forslag: mp.kand[0] }); }
      else { rad.fragor.push({ slag: 'plan', text: txt(r.plan) ? 'Det finns inget plan "' + txt(r.plan) + '". Dra rummet till rätt plan.' : 'Planen saknas. Dra rummet till rätt plan.', forslag: null }); }

      var nr = txt(r.nr);
      if (/^\d{3}$/.test(nr) || (nr && !/^\d+$/.test(nr))) { rad.falt.nr = nr; }
      else if (/^\d+$/.test(nr)) { rad.fragor.push({ slag: 'nr', text: 'Rumsnummer "' + nr + '" tolkas som ' + pad3(parseInt(nr, 10)), forslag: pad3(parseInt(nr, 10)) }); }
      else { rad.fragor.push({ slag: 'nr', text: 'Rumsnummer saknas', forslag: null }); }

      var typ = kannIgenRum(r.namn);
      if (typ) { rad.falt.rumstyp = typ; }
      else { rad.fragor.push({ slag: 'rumstyp', text: '"' + txt(r.namn) + '" känns inte igen – blir Övrigt rum', forslag: 'ovrigt' }); }

      if (rad.falt.nta == null) {
        var st = rumstyp(typ || 'ovrigt');
        rad.fragor.push({ slag: 'nta', text: 'NTA saknas – standard för ' + st.namn.toLowerCase() + ' är ' + st.nta + ' m²', forslag: st.nta });
      }
      return rad;
    });
  }

  // Ett rums plan och nummer som de är eller som de föreslås bli.
  function rumPlanNr(rum) {
    return { plan: rum.falt.plan || forslagFor(rum, 'plan'), nr: rum.falt.nr || forslagFor(rum, 'nr') };
  }

  var idRaknare = 0;
  function tolkaInst(rader, planer, rum) {
    return rader.map(function (r, i) {
      var rad = {
        key: 'i' + (i + 1), rad: r, egna: r.egna, fragor: [],
        falt: { rumKey: null, typ: null, benamning: txt(r.benamning), beteckning: txt(r.beteckning), fabrikat: txt(r.fabrikat), modell: txt(r.modell), id: txt(r.id), externtId: txt(r.externtId), datum: txt(r.datum) }
      };
      var typ = kannIgenTyp(r.benamning);
      if (typ) { rad.falt.typ = typ; }
      else { rad.fragor.push({ slag: 'typ', text: '"' + txt(r.benamning) + '" – okänd installationstyp. Välj typ i listan.', forslag: null }); }

      if (!rad.falt.id) { idRaknare++; rad.falt.id = '0000' + (9000 + idRaknare); rad.idFranSystemet = true; }

      // Rummet: plan + rumsnummer, förlåtande (beslut 76 och 77)
      var mp = matchaPlan(planer, r.plan), rn = rumTal(r.rum), rnTxt = txt(r.rum);
      var kand = rum.filter(function (x) {
        var pn = rumPlanNr(x);
        if (!pn.nr) { return false; }
        var nrOk = pn.nr === rnTxt || (rn != null && rumTal(pn.nr) === rn);
        var planOk = !txt(r.plan) ? true : (mp.exakt ? pn.plan === mp.exakt : mp.kand.indexOf(pn.plan) >= 0);
        return nrOk && planOk;
      });
      var visa = (txt(r.plan) || '?') + '-' + (rnTxt || '?');
      if (kand.length === 1) {
        var pn = rumPlanNr(kand[0]);
        // Står det i filen exakt det rummet heter (eller kommer att heta när rummets eget förslag
        // godtas) är installationen klar; den syns i modellen när rummet gör det.
        var exakt = mp.exakt && pn.plan === mp.exakt && pn.nr === rnTxt;
        if (exakt) { rad.falt.rumKey = kand[0].key; }
        else {
          var skal = !txt(r.plan) ? 'Planen saknas, men rum ' + rnTxt + ' finns bara på plan ' + pn.plan : 'Rum "' + visa + '" tolkas som ' + pn.plan + '-' + pn.nr;
          rad.fragor.push({ slag: 'rum', text: skal + ' (' + kand[0].falt.namn + ')', forslag: kand[0].key });
        }
      } else if (kand.length > 1) {
        rad.fragor.push({ slag: 'rum', text: 'Rum ' + rnTxt + ' finns på flera plan. Dra installationen till rätt rum.', forslag: null });
      } else {
        rad.fragor.push({ slag: 'rum', text: 'Rummet ' + visa + ' finns inte. Dra installationen till rätt rum.', forslag: null });
      }
      return rad;
    });
  }

  function tolka(fil) {
    idRaknare = 0;
    var planer = tolkaPlan(fil.plan);
    var rum = tolkaRum(fil.rum, planer);
    var inst = tolkaInst(fil.inst, planer, rum);
    return { planer: planer, rum: rum, inst: inst };
  }

  // ------------------------------------------------------------------
  // Tillstånd och åtgärder
  // ------------------------------------------------------------------
  function tomt() {
    return { byggnad: null, fil: null, planer: [], planOrdning: [], ordningBekraftad: false, rum: [], inst: [], rumOrdning: {}, egnaKolumner: { plan: [], rum: [], inst: [] } };
  }

  function hitta(lista, key) { return lista.filter(function (x) { return x.key === key; })[0]; }
  function lista(st, slag) { return slag === 'plan' ? st.planer : slag === 'rum' ? st.rum : st.inst; }

  function tillampa(rad, f) {
    if (f.slag === 'plan') { rad.falt.plan = f.forslag; }
    if (f.slag === 'nr') { rad.falt.nr = f.forslag; }
    if (f.slag === 'rumstyp') { rad.falt.rumstyp = f.forslag; }
    if (f.slag === 'nta') { rad.falt.nta = f.forslag; }
    if (f.slag === 'benamning') { rad.falt.namn = f.forslag; }
    if (f.slag === 'rum') { rad.falt.rumKey = f.forslag; }
    if (f.slag === 'typ') { rad.falt.typ = f.forslag; }
  }
  function godtaRad(rad) {
    rad.fragor.filter(function (f) { return f.forslag != null; }).forEach(function (f) { tillampa(rad, f); });
    rad.fragor = rad.fragor.filter(function (f) { return f.forslag == null; });
  }
  function besvara(rad, slag, varde) {
    var f = { slag: slag, forslag: varde };
    tillampa(rad, f);
    rad.fragor = rad.fragor.filter(function (x) { return x.slag !== slag; });
  }

  function ordningPaPlan(st, planId) {
    var pa = st.rum.filter(function (r) { return r.falt.plan === planId && status(r) !== 'oplacerad'; });
    var given = st.rumOrdning[planId] || [];
    return pa.slice().sort(function (a, b) {
      var ia = given.indexOf(a.key), ib = given.indexOf(b.key);
      if (ia >= 0 && ib >= 0) { return ia - ib; }
      if (ia >= 0) { return -1; }
      if (ib >= 0) { return 1; }
      return (rumTal(a.falt.nr) || 0) - (rumTal(b.falt.nr) || 0);
    }).map(function (r) { return r.key; });
  }

  // Ett steg: (tillstånd, åtgärd) → nytt tillstånd. Rör aldrig det gamla.
  function steg(gammalt, a) {
    var st = kopia(gammalt);
    switch (a.typ) {
      case 'skapa':
        st.byggnad = { namn: a.namn, byggnadstyp: a.byggnadstyp, omrade: a.omrade };
        break;
      case 'lasIn': {
        var t = tolka(a.fil);
        st.fil = { namn: a.filnamn, ignorerade: a.fil.ignorerade || [] };
        st.planer = t.planer; st.rum = t.rum; st.inst = t.inst;
        st.planOrdning = t.planer.map(function (p) { return p.falt.id; });
        st.ordningBekraftad = foreslagenOrdning(t.planer).join() === st.planOrdning.join();
        st.rumOrdning = {};
        st.egnaKolumner = a.fil.egnaKolumner || { plan: [], rum: [], inst: [] };
        break;
      }
      case 'godta':
        godtaRad(hitta(lista(st, a.slag), a.key));
        break;
      case 'godtaAlla':
        lista(st, a.slag).forEach(function (r) { if (status(r) === 'forslag') { godtaRad(r); } });
        if (a.slag === 'plan' && !st.ordningBekraftad) { st.planOrdning = foreslagenOrdning(st.planer); st.ordningBekraftad = true; }
        break;
      case 'godtaPlanordning':
        st.planOrdning = foreslagenOrdning(st.planer); st.ordningBekraftad = true;
        break;
      case 'ordnaPlan': {
        var o = st.planOrdning.filter(function (id) { return id !== a.id; });
        var pos = a.fore ? o.indexOf(a.fore) : o.length;
        o.splice(pos < 0 ? o.length : pos, 0, a.id);
        st.planOrdning = o; st.ordningBekraftad = true;
        break;
      }
      case 'flyttaRum': {
        // Dra ett rum till ett plan (oplacerat eller klart), eventuellt före ett annat rum
        var r = hitta(st.rum, a.key);
        var franPlan = r.falt.plan;
        besvara(r, 'plan', a.plan);
        // Krockar rumsnumret med ett rum som redan finns på planet föreslås nästa lediga nummer.
        // Annars hade två rum fått samma plan + nummer, och ingen vet vilket installationerna sitter i.
        var nrNu = r.falt.nr || forslagFor(r, 'nr');
        var andra = st.rum.filter(function (x) { return x.key !== r.key && rumPlanNr(x).plan === a.plan; });
        if (andra.some(function (x) { return rumPlanNr(x).nr === nrNu; })) {
          var hogst = Math.max.apply(null, andra.map(function (x) { return rumTal(rumPlanNr(x).nr) || 0; }).concat([0]));
          r.fragor = r.fragor.filter(function (f) { return f.slag !== 'nr'; });
          r.fragor.push({ slag: 'nr', text: 'Plan ' + a.plan + ' har redan ett rum ' + nrNu + ' – nästa lediga nummer föreslås', forslag: pad3(hogst + 1) });
        }
        var ordning = ordningPaPlan(st, a.plan).filter(function (k) { return k !== a.key; });
        var p2 = a.fore ? ordning.indexOf(a.fore) : ordning.length;
        ordning.splice(p2 < 0 ? ordning.length : p2, 0, a.key);
        st.rumOrdning[a.plan] = ordning;
        if (franPlan && franPlan !== a.plan && st.rumOrdning[franPlan]) {
          st.rumOrdning[franPlan] = st.rumOrdning[franPlan].filter(function (k) { return k !== a.key; });
        }
        break;
      }
      case 'valjRumstyp':
        besvara(hitta(st.rum, a.key), 'rumstyp', a.rumstyp);
        break;
      case 'flyttaInst':
        besvara(hitta(st.inst, a.key), 'rum', a.rumKey);
        break;
      case 'valjTyp':
        besvara(hitta(st.inst, a.key), 'typ', a.instTyp);
        break;
    }
    return st;
  }

  // ------------------------------------------------------------------
  // Läget per steg i flödet
  // ------------------------------------------------------------------
  function raknaStatus(rader) {
    var r = { klar: 0, forslag: 0, oplacerad: 0 };
    rader.forEach(function (x) { r[status(x)]++; });
    return r;
  }
  function stegStatus(st) {
    var p = raknaStatus(st.planer), r = raknaStatus(st.rum), i = raknaStatus(st.inst);
    if (st.planer.length && !st.ordningBekraftad) { p.forslag++; }
    function klar(x, n) { return n > 0 && x.forslag === 0 && x.oplacerad === 0; }
    return {
      byggnad: { klar: !!st.byggnad },
      plan: { klar: klar(p, st.planer.length), raknat: p },
      rum: { klar: klar(r, st.rum.length), raknat: r },
      inst: { klar: klar(i, st.inst.length), raknat: i }
    };
  }

  function rumEtikett(st, key) {
    var r = hitta(st.rum, key);
    if (!r) { return '?'; }
    var pn = rumPlanNr(r);
    return (pn.plan || '?') + '-' + (pn.nr || '?') + ' ' + r.falt.namn;
  }

  // Texten i historiken: vad steget gjorde, i klartext.
  function beskriv(st, a) {
    switch (a.typ) {
      case 'skapa': return 'Skapa ' + a.namn;
      case 'lasIn': return 'Läs in ' + a.filnamn;
      case 'godta': {
        var r = hitta(lista(st, a.slag), a.key);
        var namn = a.slag === 'plan' ? 'plan ' + r.falt.id : a.slag === 'rum' ? 'rum ' + rumEtikett(st, a.key) : r.falt.benamning;
        return 'Godta förslag: ' + namn;
      }
      case 'godtaAlla': {
        var n = lista(st, a.slag).filter(function (x) { return status(x) === 'forslag'; }).length;
        if (a.slag === 'plan' && !st.ordningBekraftad) { n++; }
        return 'Godta alla förslag i ' + { plan: 'Plan', rum: 'Rum', inst: 'Installationer' }[a.slag] + ' (' + n + ')';
      }
      case 'godtaPlanordning': return 'Godta planens ordning';
      case 'ordnaPlan': return 'Flytta plan ' + a.id + ' i ordningen';
      case 'flyttaRum': {
        var rr = hitta(st.rum, a.key);
        if (a.fore && rr.falt.plan === a.plan) { return 'Flytta ' + rr.falt.namn + ' före ' + hitta(st.rum, a.fore).falt.namn + ' på plan ' + a.plan; }
        return 'Dra ' + rr.falt.namn + ' till plan ' + a.plan + (a.fore ? ', före ' + hitta(st.rum, a.fore).falt.namn : '');
      }
      case 'valjRumstyp': return 'Rumstyp för ' + hitta(st.rum, a.key).falt.namn + ': ' + rumstyp(a.rumstyp).namn;
      case 'flyttaInst': return 'Dra ' + hitta(st.inst, a.key).falt.benamning + ' till ' + rumEtikett(st, a.rumKey);
      case 'valjTyp': return 'Typ för ' + hitta(st.inst, a.key).falt.benamning + ': ' + DP.installationstyper[a.instTyp].namn;
    }
    return a.typ;
  }

  // ------------------------------------------------------------------
  // Modellen: kaserns planlösning (beslut 78) räknad ur det som är klart
  // ------------------------------------------------------------------
  var DJUP = 6, KORR = 2, BJALK = 0.2, STD_HOJD = 3.1, KALLAR_HOJD = 2.6;

  // niva: { rum, inst } – modellen växer i takt med stegen (beslut 85), även när allt kommer
  // från en och samma fil: i steget Plan syns bara planen, rummen och installationerna därefter.
  function byggModell(st, niva) {
    if (!st.byggnad || !st.planer.length) { return null; }
    niva = niva || { rum: true, inst: true };
    var planIndex = {};
    st.planer.forEach(function (p) { planIndex[p.falt.id] = p; });
    var ordning = st.planOrdning.filter(function (id) { return planIndex[id]; });
    var entre = 0;
    for (var e = 0; e < ordning.length; e++) { var tt = planTal(ordning[e]); if (tt != null && tt >= 1) { entre = e; break; } }

    // Rummen per plan: bara klara rum syns
    var perPlan = {};
    ordning.forEach(function (pid) {
      var klara = !niva.rum ? [] : ordningPaPlan(st, pid).map(function (k) { return hitta(st.rum, k); }).filter(function (r) { return status(r) === 'klar'; });
      var korr = klara.filter(function (r) { return r.falt.rumstyp === 'korridor'; });
      var ovr = klara.filter(function (r) { return r.falt.rumstyp !== 'korridor'; });
      var djup = korr.length ? DJUP : DJUP + KORR / 2;
      var bredd = ovr.map(function (r) { return Math.max(2.4, (r.falt.nta || 20) / djup); });
      var summa = bredd.reduce(function (a, b) { return a + b; }, 0);
      // Medurs: söder om korridoren från vänster, sedan tillbaka längs norra sidan
      var acc = 0, delning = ovr.length;
      for (var i = 0; i < ovr.length; i++) { if (acc >= summa / 2) { delning = i; break; } acc += bredd[i]; }
      var syd = ovr.slice(0, delning), norr = ovr.slice(delning);
      var bs = bredd.slice(0, delning), bn = bredd.slice(delning);
      perPlan[pid] = {
        korr: korr, syd: syd, norr: norr, bs: bs, bn: bn, djup: djup,
        langd: Math.max(sum(bs), sum(bn))
      };
    });
    function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
    var L = Math.max.apply(null, ordning.map(function (pid) { return perPlan[pid].langd; }).concat([0]));
    if (L < 12) { L = 36; }
    var Z = 2 * DJUP + KORR;

    var utRum = [], hojdPerPlan = {};
    ordning.forEach(function (pid, idx) {
      var P = perPlan[pid], under = idx < entre;
      function hojd(r) {
        if (r.falt.ntv && r.falt.nta) { return Math.max(2.2, Math.min(15, r.falt.ntv / r.falt.nta)); }
        return under ? KALLAR_HOJD : STD_HOJD;
      }
      var maxH = under ? KALLAR_HOJD : STD_HOJD;
      function lagg(r, rect) {
        var h = hojd(r); maxH = Math.max(maxH, h);
        utRum.push({ nr: pid + '-' + r.falt.nr, namn: r.falt.namn, plan: pid, typ: rumstyp(r.falt.rumstyp).farg, rect: rect, hojd: h, key: r.key, sida: rect.sida });
      }
      if (!P.korr.length && !P.syd.length && !P.norr.length) {
        // Skalet: planet finns men inga rum ännu (beslut 85)
        utRum.push({ nr: pid, namn: planIndex[pid].falt.namn || '', plan: pid, typ: 'kommunikation', rect: [0, 0, L, Z], hojd: under ? KALLAR_HOJD : STD_HOJD, skal: true, utanInstallationer: true });
      } else {
        var x = 0, ks = P.bs.length ? L / sum(P.bs) : 1;
        P.syd.forEach(function (r, i) { var w = P.bs[i] * ks; var rect = [x, 0, x + w, P.djup]; rect.sida = 'S'; lagg(r, rect); x += w; });
        x = L; var kn = P.bn.length ? L / sum(P.bn) : 1;
        P.norr.forEach(function (r, i) { var w = P.bn[i] * kn; var rect = [x - w, Z - P.djup, x, Z]; rect.sida = 'N'; lagg(r, rect); x -= w; });
        var kw = L / Math.max(1, P.korr.length);
        P.korr.forEach(function (r, i) { var rect = [i * kw, DJUP, (i + 1) * kw, DJUP + KORR]; rect.sida = 'K'; lagg(r, rect); });
      }
      hojdPerPlan[pid] = maxH;
    });

    // Plannivåer: entréplanet på marken, planen under det nedåt, resten uppåt
    var elev = {}, y = 0;
    for (var a = entre; a < ordning.length; a++) { elev[ordning[a]] = y; y += hojdPerPlan[ordning[a]] + BJALK; }
    var topp = y - BJALK;
    y = 0;
    for (var b = entre - 1; b >= 0; b--) { y -= hojdPerPlan[ordning[b]] + BJALK; elev[ordning[b]] = y; }

    // Installationer: bara klara, i rum som syns
    var rumFor = {};
    utRum.forEach(function (r) { if (r.key) { rumFor[r.key] = r; } });
    var T = DP.installationstyper || {}, perRum = {};
    st.inst.filter(function (i) { return niva.inst && status(i) === 'klar' && rumFor[i.falt.rumKey]; }).forEach(function (i) {
      (perRum[i.falt.rumKey] = perRum[i.falt.rumKey] || []).push(i);
    });
    var HOJD = { handbrandslackare: 0.5, brandpost: 0.9, nodbelysning: 2.3, brandlarmscentral: 1.3, gruppcentral: 1.2 };
    var utInst = [];
    Object.keys(perRum).forEach(function (k) {
      var r = rumFor[k], lst = perRum[k], x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
      lst.forEach(function (i, n) {
        var montage = (T[i.falt.typ] || {}).montage || 'vagg';
        var x = x0 + (n + 1) * (x1 - x0) / (lst.length + 1), z, h = HOJD[i.falt.typ] || 1.2;
        if (montage === 'golv' || montage === 'tak') { z = (z0 + z1) / 2 + (n % 2 ? 0.8 : -0.8); h = 0; }
        else if (montage === 'fasad' || montage === 'utsida') { z = r.sida === 'N' ? z1 : z0; h = 0; }
        else { z = r.sida === 'S' ? z1 - 0.05 : r.sida === 'N' ? z0 + 0.05 : (n % 2 ? z0 + 0.05 : z1 - 0.05); }
        utInst.push({ id: i.falt.id, typ: i.falt.typ, nr: n + 1, benamning: i.falt.benamning, fabrikat: i.falt.fabrikat, modell: i.falt.modell, beteckning: i.falt.beteckning, externtId: i.falt.externtId || null, rum: r.nr, x: x, z: z, h: h, signifikant: true, key: i.key });
      });
    });
    var riktiga = utRum.filter(function (r) { return !r.skal; });
    var ovriga = DP.genereraOvriga && riktiga.length && niva.inst ? DP.genereraOvriga(riktiga, { mittZ: DJUP + KORR / 2 }) : [];

    return {
      id: 'prototyp', namn: st.byggnad.namn, typ: st.byggnad.byggnadstyp,
      stil: { tak: 'sadel', sadel: { bas: topp, hojd: 6 }, ytterFarg: 0xa8604a, takFarg: 0x5b4a44, fonster: { bredd: 1.2, steg: 3, hojd: 1.6, brost: 0.9 } },
      konstanter: { PLANHOJD: STD_HOJD + BJALK, BJALKLAG: BJALK, FRIHOJD: STD_HOJD },
      plan: ordning.slice().sort(function (p, q) { return elev[p] - elev[q]; }).map(function (pid) { return { id: pid, namn: planIndex[pid].falt.namn || pid, elev: elev[pid] }; }),
      rum: utRum,
      installationer: utInst.concat(ovriga),
      harRum: riktiga.length > 0,
      harInst: utInst.length > 0
    };
  }

  // ------------------------------------------------------------------
  // Ta ut: inläsningsfilen med det som är inläst (beslut 70)
  // ------------------------------------------------------------------
  function taUt(st) {
    function rubriker(flik) { return KOLUMNER[flik].map(function (k) { return k[0]; }).concat(st.egnaKolumner[flik] || []); }
    function egna(flik, rad) { return (st.egnaKolumner[flik] || []).map(function (k) { return (rad.egna || {})[k] || ''; }); }
    function v(x) { return x == null ? '' : x; }
    var plan = [rubriker('plan')].concat(st.planOrdning.map(function (id) {
      var p = hitta(st.planer, st.planer.filter(function (x) { return x.falt.id === id; })[0].key);
      return [p.falt.id, p.falt.namn].concat(egna('plan', p));
    }));
    var rum = [rubriker('rum')].concat(st.rum.map(function (r) {
      var f = r.falt;
      return [v(f.plan || r.rad.plan), v(f.nr || r.rad.nr), f.namn, v(f.nta), v(f.ntv), v(f.bra), v(f.bta), v(f.temp)].concat(egna('rum', r));
    }));
    var inst = [rubriker('inst')].concat(st.inst.map(function (i) {
      var f = i.falt, rr = f.rumKey ? hitta(st.rum, f.rumKey) : null;
      return [rr ? v(rr.falt.plan) : i.rad.plan, rr ? v(rr.falt.nr) : i.rad.rum, f.benamning, f.beteckning, f.fabrikat, f.modell, f.id, f.externtId, f.datum].concat(egna('inst', i));
    }));
    return { plan: plan, rum: rum, inst: inst };
  }
  function tomFil() {
    return {
      plan: [KOLUMNER.plan.map(function (k) { return k[0]; })],
      rum: [KOLUMNER.rum.map(function (k) { return k[0]; })],
      inst: [KOLUMNER.inst.map(function (k) { return k[0]; })]
    };
  }

  DP.Inlasning = {
    KOLUMNER: KOLUMNER, FLIKNAMN: FLIKNAMN, RUMSTYPER: RUMSTYPER,
    lasArk: lasArk, tolka: tolka, tomt: tomt, steg: steg, beskriv: beskriv,
    status: status, stegStatus: stegStatus, foreslagenOrdning: foreslagenOrdning,
    ordningPaPlan: ordningPaPlan, rumEtikett: rumEtikett, rumstyp: rumstyp, rumPlanNr: rumPlanNr,
    signifikantaTyper: signifikantaTyper, byggModell: byggModell, taUt: taUt, tomFil: tomFil
  };
})();
