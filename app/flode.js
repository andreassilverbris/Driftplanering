/*
 * Planeringsflödet: frågor i steg (dragspel) och bruttolistan med Lägg till / Ta bort.
 * Sist i filen finns kopplingen som får tidsaxel, telefoner och 3D-modell att reagera
 * på varje ändring – med animeringar – även när man ångrar och gör om.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan;
  var b, signifikanta;
  function indexera() {
    b = P.byggnad();
    signifikanta = P.signifikanta();
  }
  indexera();
  var typer = DP.installationstyper;
  var rot = document.getElementById('flode');

  var ui = {
    oppet: 1,
    annan: {},          // rondId -> visa frekvensval
    expanderad: null,   // åtgärds-id med synlig åtgärdstext
    guide: null         // { atgard, val, valda, rond, samma }
  };

  function matchande(a) { return signifikanta.filter(function (i) { return a.galler.indexOf(i.typ) >= 0; }); }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined && html !== null) { e.innerHTML = html; }
    return e;
  }
  function knapp(text, cls, gor, titel) {
    var k = el('button', cls || 'knapp', text);
    if (titel) { k.title = titel; }
    k.addEventListener('click', function (e) { e.stopPropagation(); gor(k, e); });
    return k;
  }

  // ------------------------------------------------------------------
  // Status per steg – reglerna ligger i planeringen, så att den också kan svara för
  // en byggnad som inte är aktiv (Balansering behöver det).
  // ------------------------------------------------------------------
  var klara = P.stegStatus;
  function tillganglig(n, k) {
    for (var i = 1; i < n; i++) { if (!k[i]) { return false; } }
    return true;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function rita() {
    var lista = rot.querySelector('.steg5-lista');
    var skroll = rot.parentNode.scrollTop, listSkroll = lista ? lista.scrollTop : 0;
    var s = P.state(), k = klara(s);
    rot.innerHTML = '';
    rot.appendChild(snabbstart(s));

    var steg = [
      { n: 1, titel: 'Hur ofta måste byggnaden besökas?', sammanf: s.bas ? P.freqText(s.bas, true) : '', kropp: steg1 },
      { n: 2, titel: 'Vilka ronder behöver byggnaden?', sammanf: s.ronder.map(function (r) { return P.rondNamn(r.id); }).join(', '), kropp: steg2 },
      { n: 3, titel: 'Vilken frekvens ska varje rond ha?', sammanf: k[3] ? s.ronder.map(function (r) { return P.rondNamn(r.id) + ': ' + P.frekvens(r.freq.typ).namn.toLowerCase(); }).join(' · ') : obesvarade(s), kropp: steg3 },
      { n: 4, titel: 'Vem utför ronderna?', sammanf: k[4] ? utforareSammanf(s) : '', kropp: steg4 },
      { n: 5, titel: 'Koppla åtgärder till installationerna', sammanf: k[4] ? kopplingsStatus(s).text : '', kropp: steg5 },
      { n: 6, titel: 'Hur lång tid tar ronderna?', sammanf: k[5] ? P.tidStatus(s).text : '', kropp: steg6 }
    ];
    var sista = steg[steg.length - 1].n;

    steg.forEach(function (st) {
      var tillg = tillganglig(st.n, k);
      var oppen = ui.oppet === st.n && tillg;
      var kort = el('section', 'steg-kort' + (oppen ? ' oppen' : '') + (k[st.n] ? ' klar' : '') + (tillg ? '' : ' last'));
      var h = el('header', 'steg-huvud');
      h.innerHTML = '<span class="steg-nr">' + (k[st.n] ? '✓' : st.n) + '</span><div class="steg-text"><div class="steg-titel">' + st.titel + '</div>' +
        (!oppen && st.sammanf ? '<div class="steg-sammanf">' + st.sammanf + '</div>' : '') + '</div>';
      if (tillg) {
        h.addEventListener('click', function () { ui.oppet = oppen ? 0 : st.n; rita(); });
      } else {
        h.title = 'Svara på frågorna ovanför först';
      }
      kort.appendChild(h);
      if (oppen) {
        var kropp = el('div', 'steg-kropp');
        st.kropp(kropp, s, k);
        if (st.n < sista) {
          var nasta = knapp('Nästa →', 'knapp', function () { ui.oppet = st.n + 1; rita(); });
          nasta.disabled = !k[st.n];
          var rad = el('div', 'knapprad hoger');
          rad.appendChild(nasta);
          kropp.appendChild(rad);
        }
        kort.appendChild(kropp);
      }
      rot.appendChild(kort);
    });

    rot.parentNode.scrollTop = skroll;
    var ny = rot.querySelector('.steg5-lista');
    if (ny) { ny.scrollTop = listSkroll; }
  }

  function obesvarade(s) {
    var n = s.ronder.filter(function (r) { return !r.besvarad; }).length;
    return n ? n + ' fråga' + (n > 1 ? 'r' : '') + ' att besvara' : '';
  }
  function utforareSammanf(s) {
    var per = {};
    s.ronder.forEach(function (r) { (per[r.utforare] = per[r.utforare] || []).push(P.rondNamn(r.id)); });
    return Object.keys(per).map(function (u) { return P.utforare(u).namn + ': ' + per[u].join(', '); }).join(' · ');
  }

  // Frekvensval (används i steg 1 och 3)
  function frekvensval(freq, valj, valjStart) {
    var w = el('div', 'frekvensval');
    P.FREKVENSER.forEach(function (f) {
      var k = el('button', 'val' + (freq && freq.typ === f.id ? ' pa' : ''), '<b>' + f.namn + '</b><span>' + f.detalj + '</span>');
      k.addEventListener('click', function () { valj(f.id); });
      w.appendChild(k);
    });
    if (freq && freq.typ && P.frekvens(freq.typ).startManad) {
      var sm = el('div', 'startmanad');
      sm.appendChild(el('div', 'liten-rubrik', 'Vilken månad ska första besöket göras? Nästa blir 6 månader senare.'));
      var rad = el('div', 'chiprad');
      for (var m = 1; m <= 6; m++) {
        (function (m) {
          var c = el('button', 'chip' + (freq.startManad === m ? ' pa' : ''), P.MANADER[m - 1]);
          c.addEventListener('click', function () { valjStart(m); });
          rad.appendChild(c);
        })(m);
      }
      sm.appendChild(rad);
      w.appendChild(sm);
    }
    return w;
  }

  // ---------------- Steg 1 ----------------
  function steg1(k, s) {
    k.appendChild(el('p', 'forklar', 'Välj hur ofta någon behöver vara i byggnaden. Tidsaxeln nedanför visar besöken direkt – du kan ändra så länge du vill.'));
    k.appendChild(frekvensval(s.bas, function (typ) {
      var f = P.frekvens(typ);
      P.andra('Besöksfrekvens: ' + f.namn.toLowerCase(), function (st) {
        var start = f.startManad ? ((st.bas && st.bas.startManad) || null) : null;
        st.bas = { typ: typ, startManad: start };
        st.ronder.forEach(function (r) { if (r.foljerBas) { r.freq = { typ: typ, startManad: start }; } });
      });
    }, function (m) {
      P.andra('Första besöket i ' + P.MANADER[m - 1], function (st) {
        st.bas.startManad = m;
        st.ronder.forEach(function (r) { if (r.foljerBas) { r.freq = { typ: st.bas.typ, startManad: m }; } });
      });
    }));
    k.appendChild(el('p', 'liten-text', 'Planeringen görs alltid i veckor. "Varje månad" betyder var 4:e vecka, så det blir 13 besök per år.'));
  }

  // ---------------- Steg 2 ----------------
  function steg2(k, s) {
    k.appendChild(el('p', 'forklar', 'En <b>rond</b> grupperar åtgärder som görs vid samma tillfälle. Varje rond blir ett eget <b>rutintillfälle</b> i teknikerns telefon. Välj en eller flera.'));
    var rad = el('div', 'rondval');
    DP.ronder.forEach(function (r) {
      var vald = s.ronder.some(function (x) { return x.id === r.id; });
      var c = el('button', 'val rond' + (vald ? ' pa' : ''), '<b>' + (vald ? '✓ ' : '') + r.namn + '</b>');
      c.addEventListener('click', function () { vaxlaRond(r.id); });
      rad.appendChild(c);
    });
    k.appendChild(rad);
    if (s.ronder.length > 1) {
      var n = s.ronder.filter(function (r) { return !r.besvarad; }).length;
      if (n) { k.appendChild(el('div', 'notis', 'Du har valt flera ronder. I nästa steg får du svara på om de ska ha samma frekvens.')); }
    }
  }

  function vaxlaRond(id) {
    var s = P.state();
    var finns = s.ronder.filter(function (x) { return x.id === id; })[0];
    if (finns) {
      var n = s.kopplingar.filter(function (x) { return x.rond === id; }).length;
      if (n && !window.confirm('Ronden ' + P.rondNamn(id) + ' har ' + n + ' kopplade åtgärder. Om du tar bort ronden kopplas de bort. Fortsätta?')) { return; }
      P.andra('Tog bort ronden ' + P.rondNamn(id), function (st) {
        st.ronder = st.ronder.filter(function (x) { return x.id !== id; });
        st.kopplingar = st.kopplingar.filter(function (x) { return x.rond !== id; });
        if (st.ronder.length && !st.ronder.some(function (r) { return r.foljerBas; })) {
          // Minst en rond behöver inte följa basen – inget att göra
        }
      });
      return;
    }
    P.andra('La till ronden ' + P.rondNamn(id), function (st) {
      var forsta = st.ronder.length === 0;
      st.ronder.push({ id: id, freq: forsta ? { typ: st.bas.typ, startManad: st.bas.startManad } : null, foljerBas: forsta, besvarad: forsta, utforare: forsta ? P.UTFORARE[0].id : st.ronder[st.ronder.length - 1].utforare });
      var ordning = DP.ronder.map(function (r) { return r.id; });
      st.ronder.sort(function (a, c) { return ordning.indexOf(a.id) - ordning.indexOf(c.id); });
    });
  }

  // ---------------- Steg 3 ----------------
  function steg3(k, s) {
    k.appendChild(el('p', 'forklar', 'Varje rond kan ha egen frekvens. Byggnaden besöks de veckor då minst en rond har ett rutintillfälle.'));
    s.ronder.forEach(function (r) {
      var rad = el('div', 'rondfrekvens' + (r.besvarad ? '' : ' fraga'));
      var namn = P.rondNamn(r.id);
      if (r.besvarad && !ui.annan[r.id]) {
        rad.innerHTML = '<div class="rf-namn">' + namn + '</div><div class="rf-varde">' + P.freqText(r.freq, true) +
          (r.foljerBas ? ' <span class="tagg">samma som besöken</span>' : '') + '</div>';
        rad.appendChild(knapp('Ändra', 'lank', function () { ui.annan[r.id] = true; rita(); }));
      } else {
        rad.appendChild(el('div', 'rf-fraga', 'Ska <b>' + namn + '</b> ha samma frekvens som någon av de andra, eller en annan frekvens?'));
        var alt = el('div', 'chiprad');
        sammaAlternativ(s, r).forEach(function (o) {
          alt.appendChild(knapp(o.text, 'chip' + (r.besvarad && P.sammaFreq(r.freq, o.freq) && r.foljerBas === o.bas ? ' pa' : ''), function () {
            delete ui.annan[r.id];
            P.andra(namn + ': ' + o.kort, function (st) {
              var x = st.ronder.filter(function (y) { return y.id === r.id; })[0];
              x.freq = { typ: o.freq.typ, startManad: o.freq.startManad };
              x.foljerBas = o.bas; x.besvarad = true;
            });
          }));
        });
        alt.appendChild(knapp('Annan frekvens …', 'chip' + (ui.annan[r.id] === 'ny' ? ' pa' : ''), function () { ui.annan[r.id] = 'ny'; rita(); }));
        rad.appendChild(alt);
        if (ui.annan[r.id] === 'ny') {
          rad.appendChild(frekvensval(r.freq, function (typ) {
            var f = P.frekvens(typ);
            P.andra(namn + ': ' + f.namn.toLowerCase(), function (st) {
              var x = st.ronder.filter(function (y) { return y.id === r.id; })[0];
              x.freq = { typ: typ, startManad: f.startManad ? ((x.freq && x.freq.startManad) || null) : null };
              x.foljerBas = false;
              x.besvarad = P.freqKomplett(x.freq);
            });
            if (!f.startManad) { delete ui.annan[r.id]; }
          }, function (m) {
            P.andra(namn + ': start i ' + P.MANADER[m - 1], function (st) {
              var x = st.ronder.filter(function (y) { return y.id === r.id; })[0];
              x.freq.startManad = m; x.besvarad = true;
            });
            delete ui.annan[r.id];
          }));
        }
      }
      k.appendChild(rad);
    });
  }

  function sammaAlternativ(s, r) {
    var alt = [{ freq: s.bas, bas: true, text: 'Samma som besöken – ' + P.freqText(s.bas, true).toLowerCase(), kort: 'samma frekvens som besöken' }];
    s.ronder.forEach(function (x) {
      if (x.id === r.id || !x.besvarad || x.foljerBas) { return; }
      if (P.sammaFreq(x.freq, s.bas)) { return; }
      var finns = alt.filter(function (a) { return !a.bas && P.sammaFreq(a.freq, x.freq); })[0];
      if (finns) { finns.text = finns.text.replace(' – ', ', ' + P.rondNamn(x.id) + ' – '); return; }
      alt.push({ freq: x.freq, bas: false, text: 'Samma som ' + P.rondNamn(x.id) + ' – ' + P.freqText(x.freq, true).toLowerCase(), kort: 'samma frekvens som ' + P.rondNamn(x.id) });
    });
    return alt;
  }

  // ---------------- Steg 4 ----------------
  function steg4(k, s) {
    k.appendChild(el('p', 'forklar', 'Utföraren sätts en gång per rond. Alla åtgärder i ronden får samma utförare, och rutintillfällena hamnar i den personens telefon.'));
    s.ronder.forEach(function (r) {
      var rad = el('div', 'utfrad');
      var u = P.utforare(r.utforare);
      rad.appendChild(el('span', 'avatar', u.namn[0])).style.background = u.farg;
      rad.appendChild(el('span', 'utf-rond', P.rondNamn(r.id)));
      var sel = el('select', 'utf-val');
      P.UTFORARE.forEach(function (x) {
        var o = el('option', null, x.namn); o.value = x.id; if (x.id === r.utforare) { o.selected = true; }
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        var ny = sel.value;
        P.andra('Utförare för ' + P.rondNamn(r.id) + ': ' + P.utforare(ny).namn, function (st) {
          st.ronder.filter(function (y) { return y.id === r.id; })[0].utforare = ny;
        });
      });
      rad.appendChild(sel);
      k.appendChild(rad);
    });

    // Byt utförare – t.ex. vid sjukdom eller när någon slutar
    var anvanda = P.UTFORARE.filter(function (u) { return s.ronder.some(function (r) { return r.utforare === u.id; }); });
    var byt = el('div', 'bytruta');
    byt.appendChild(el('div', 'liten-rubrik', 'Byt utförare för alla ronder'));
    byt.appendChild(el('div', 'liten-text', 'När en utförare slutar eller är långtidssjuk: flytta alla ronder i ett steg.'));
    var rad2 = el('div', 'chiprad');
    var fran = el('select', 'utf-val'), till = el('select', 'utf-val');
    anvanda.forEach(function (u) { var o = el('option', null, u.namn); o.value = u.id; fran.appendChild(o); });
    P.UTFORARE.forEach(function (u) { var o = el('option', null, u.namn); o.value = u.id; till.appendChild(o); });
    if (P.UTFORARE[1]) { till.value = P.UTFORARE.filter(function (u) { return u.id !== fran.value; })[0].id; }
    rad2.appendChild(fran); rad2.appendChild(el('span', 'pil', '→')); rad2.appendChild(till);
    rad2.appendChild(knapp('Byt', 'knapp sekundar', function () {
      if (fran.value === till.value) { return; }
      var n = P.state().ronder.filter(function (r) { return r.utforare === fran.value; }).length;
      P.andra('Bytte utförare ' + P.utforare(fran.value).namn + ' → ' + P.utforare(till.value).namn + ' (' + n + ' ronder)', function (st) {
        st.ronder.forEach(function (r) { if (r.utforare === fran.value) { r.utforare = till.value; } });
      });
    }));
    byt.appendChild(rad2);
    k.appendChild(byt);
  }

  // ---------------- Steg 5 ----------------
  var kopplingsStatus = P.kopplingsStatus;

  function steg5(k, s) {
    var st = kopplingsStatus(s);
    var prog = el('div', 'progress' + (st.klar ? ' klar' : ''));
    prog.innerHTML = '<div class="prog-text"><b>' + st.n + '</b> av ' + st.tot + ' signifikanta installationer har kopplad åtgärd</div>' +
      '<div class="prog-bar"><div style="width:' + Math.round(st.n / st.tot * 100) + '%"></div></div>';
    // Steget är klart först när ingen lucka finns kvar (beslut 23), så luckorna står i klartext.
    prog.appendChild(el('div', 'prog-saknas', st.klar
      ? 'Allt är kopplat: varje signifikant installation har en åtgärd, och båda de generella åtgärderna ligger i en rond.'
      : st.saknasText + ' innan steget är klart.'));
    if (st.saknas.length && st.n > 0) {
      prog.appendChild(knapp('Visa de ' + st.saknas.length + ' som saknar åtgärd', 'lank', function () { DP.viewer.blinka(st.saknas, 1800, 0xe07b26); }));
    }
    k.appendChild(prog);
    k.appendChild(el('p', 'forklar', 'Bruttolistan innehåller alla åtgärder. De som matchar installationer i <b>' + b.namn + '</b> har en knapp. Klicka på en åtgärd för att se åtgärdstexten.'));

    var lista = el('div', 'steg5-lista');
    var relevanta = [], ovriga = [];
    DP.atgarder.forEach(function (a) { (a.generell || matchande(a).length ? relevanta : ovriga).push(a); });
    relevanta.forEach(function (a) { lista.appendChild(atgardRad(a, s, true)); });
    lista.appendChild(el('div', 'grupprubrik', 'Övriga åtgärder – ingen matchande installation i ' + b.namn));
    ovriga.forEach(function (a) { lista.appendChild(atgardRad(a, s, false)); });
    k.appendChild(lista);
  }

  function atgardRad(a, s, relevant) {
    var kopp = s.kopplingar.filter(function (x) { return x.atgard === a.id; });
    var tot = a.generell ? 1 : matchande(a).length;
    var rad = el('div', 'atgrad' + (relevant ? '' : ' irrelevant') + (kopp.length ? ' kopplad' : ''));
    var topp = el('div', 'atg-topp');
    var namn = el('div', 'atg-namn');
    var status;
    if (!relevant) { status = 'Ingen matchande installation'; }
    else if (kopp.length) {
      var ronder = kopp.map(function (x) { return P.rondNamn(x.rond); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      status = (a.generell ? 'Kopplad till byggnaden' : kopp.length + ' av ' + tot + ' kopplade') + ' · ' + ronder.join(', ');
    } else { status = a.generell ? 'Gäller hela byggnaden' : tot + ' ' + typNamn(a, tot); }
    var nAvv = kopp.filter(function (x) { return P.kopplingAvviker(x, s); }).length;
    if (nAvv) { status += ' · <span class="avvik-symbol liten">✎</span>' + nAvv + ' avvikande'; }
    if (s.standardTexter[a.id]) { status += ' · <span class="tagg">ändrad text</span>'; }
    namn.innerHTML = '<div class="atg-titel">' + (kopp.length ? '<span class="bock">✓</span>' : '') + a.namn + '</div><div class="atg-status">' + status + '</div>';
    namn.addEventListener('click', function () { ui.expanderad = ui.expanderad === a.id ? null : a.id; rita(); });
    topp.appendChild(namn);

    var guideOppen = ui.guide && ui.guide.atgard === a.id;
    if (relevant && !guideOppen) {
      var klar = klara(s)[3];
      if (!kopp.length) {
        var lagg = knapp('Lägg till', 'knapp liten-knapp', function () { oppnaGuide(a); }, klar ? '' : 'Svara på stegen ovanför först');
        lagg.disabled = !klar;
        topp.appendChild(lagg);
      } else {
        if (!a.generell && kopp.length < tot) { topp.appendChild(knapp('Fler', 'knapp sekundar liten-knapp', function () { oppnaGuide(a); })); }
        topp.appendChild(knapp('Ta bort', 'knapp sekundar liten-knapp', function (kn) { taBort(a, kn); }));
      }
    }
    rad.appendChild(topp);

    if (ui.guide && ui.guide.atgard === a.id) { rad.appendChild(guide(a, s)); }
    else if (ui.redigerarText === a.id) {
      rad.appendChild(DP.Dialog.redigerare({
        punkter: P.standardText(a.id),
        onSpara: function (punkter, kn) {
          ui.redigerarText = null;
          var kalla = DP.mitt(kn);
          rita();
          DP.Texter.sparaStandard(a.id, punkter, kalla);
        },
        onAvbryt: function () { ui.redigerarText = null; rita(); }
      }));
    } else if (ui.expanderad === a.id) {
      if (s.standardTexter[a.id]) {
        var andrad = el('div', 'avvik-info', 'Standardtexten är ändrad i den här sessionen. ');
        andrad.appendChild(knapp('Jämför med ursprunglig', 'lank', function () {
          DP.Dialog.jamfor([{ rubrik: 'Ursprunglig standardtext', under: 'bruttolistan', punkter: a.kontrollpunkter },
            { rubrik: 'Ändrad standardtext', under: 'denna session', punkter: P.standardText(a.id) }]);
        }));
        rad.appendChild(andrad);
      }
      rad.appendChild(DP.ui.atgardstext(P.standardText(a.id)));
      var lankar = el('div', 'lankrad');
      lankar.appendChild(knapp('Ändra åtgärdstext', 'lank', function () { ui.redigerarText = a.id; rita(); }));
      if (relevant && !a.generell) {
        lankar.appendChild(knapp('Visa installationerna i modellen', 'lank', function () { DP.viewer.blinka(matchande(a)); }));
      }
      rad.appendChild(lankar);
    }
    return rad;
  }

  function typNamn(a, n) {
    var t = typer[a.galler[0]];
    if (!t) { return ''; }
    var namn = t.namn.toLowerCase();
    if (n === 1) { return namn; }
    var pl = { handbrandsläckare: 'handbrandsläckare', brandpost: 'brandposter', brandlarmscentral: 'brandlarmscentraler', utrymningsstege: 'utrymningsstegar',
      luftbehandlingsaggregat: 'luftbehandlingsaggregat', fläktluftvärmare: 'fläktluftvärmare', huvudcentral: 'elcentraler', apparatskåp: 'apparatskåp',
      jordfelsbrytare: 'jordfelsbrytare', industriport: 'industriportar', pelarlyft: 'pelarlyftar', garageport: 'garageportar',
      nödbelysningsarmatur: 'nödbelysningsarmaturer', brandgaslucka: 'brandgasluckor', torkskåp: 'torkskåp', tvättmaskin: 'tvättmaskiner' };
    return pl[namn] || namn;
  }

  // ---------------- Steg 6: planerad tid ----------------
  // Varje rond får ett förslag ur tidsschablonen, med uträkningen synlig. Planeraren godkänner,
  // väljer en annan dagsdel eller godkänner alla på en gång. En godkänd tid ändras aldrig av sig
  // själv: ändrade förutsättningar visas som en markering med ett nytt förslag (beslut 27 och 35).
  function steg6(k, s) {
    var ts = P.tidStatus(s);
    var prog = el('div', 'progress' + (ts.klar ? ' klar' : ''));
    prog.innerHTML = '<div class="prog-text">' + ts.text + '</div>';
    prog.appendChild(el('div', 'prog-saknas', ts.klar
      ? 'Alla ronder har en planerad tid. Byggnaden är klar för Balansering.'
      : ts.utan.length + ' ' + (ts.utan.length === 1 ? 'rond väntar' : 'ronder väntar') + ' på ett ställningstagande.'));
    k.appendChild(prog);
    k.appendChild(el('p', 'forklar', 'Planerad tid sätts per rond i grova <b>dagsdelar</b>: kort (≈ 1 h), kvartsdag (2 h), halvdag (4 h) och heldag (8 h). ' +
      'Förslaget räknas fram ur de kopplade åtgärderna och en tidsschablon. Uträkningen står under varje rond, så att du kan bedöma om den är rimlig – godkänn eller välj en annan dagsdel.'));

    if (ts.utan.length > 1) {
      var rad = el('div', 'knapprad');
      rad.appendChild(knapp('Godkänn alla ' + ts.utan.length + ' förslag', 'knapp', function () { godkannAlla(); }));
      k.appendChild(rad);
    }

    ts.rader.forEach(function (x) { k.appendChild(tidRad(x, s)); });
  }

  function dagsdelNamn(id) {
    return (DP.tidsschablon.dagsdel(id) || {}).namn || id;
  }

  function tidRad(x, s) {
    var rad = el('div', 'tidrad' + (x.godkand ? ' godkand' : '') + (x.andrad ? ' andrad' : ''));
    rad.setAttribute('data-rond', x.rond);
    var valdNamn = dagsdelNamn(x.dagsdel);
    rad.appendChild(el('div', 'td-namn', '<b>' + P.rondNamn(x.rond) + '</b>' +
      (x.godkand ? ' <span class="tagg gron">✓ ' + valdNamn + '</span>' : ' <span class="tagg">förslag: ' + valdNamn + '</span>')));
    rad.appendChild(el('div', 'td-utrakning', x.forslag.text));

    // Mer än en heldag: ronden ryms inte på en dag. Delningen görs för hand, med de verktyg
    // som redan finns, så att planeraren bestämmer hur åtgärderna fördelas (beslut 27).
    if (x.forslag.foreslaDelning) {
      var delning = el('div', 'notis varning', '<b>Ronden tar mer än en heldag</b> (' + P.timText(x.forslag.minuter) +
        '). Ett rutintillfälle ska rymmas på en dag. Dela ronden i två: lägg till en rond i steg 2 och flytta hälften av åtgärderna dit i steg 5.');
      rad.appendChild(delning);
    }

    // Förutsättningarna har ändrats sedan tiden godkändes. Den godkända tiden står kvar, och
    // planeraren har två vägar ut: använda det nya förslaget eller behålla sin egen tid. Båda
    // räknas som ett ställningstagande och tar bort markeringen (berättelse 19).
    if (x.andrad) {
      var nyNamn = dagsdelNamn(x.forslag.dagsdel);
      var notisText;
      if (x.forslag.dagsdel !== x.dagsdel) {
        notisText = '<b>Förutsättningarna har ändrats</b>, nytt förslag: ' + nyNamn +
          '. Din tid (' + valdNamn + ') gäller tills du tar ställning.';
      } else if (x.arvd) {
        // Tiden kom med en kopiering. Säg varifrån, så att planeraren förstår varför en
        // oförändrad dagsdel ändå är värd ett ställningstagande.
        notisText = '<b>Tiden är kopierad från en annan byggnad</b>: där tog ronden ' +
          P.timText(x.minuterVidGodkandet) + ', här tar den ' + P.timText(x.forslag.minuter) +
          '. Båda ryms i ' + nyNamn + ', men siffran är räknad på en annan byggnad.';
      } else {
        // Dagsdelen är oförändrad och det är minuterna bakom den som flyttat sig. Då räcker
        // det inte att nämna dagsdelen – planeraren skulle läsa "nytt förslag: heldag" om
        // sin egen heldag.
        notisText = '<b>Förutsättningarna har ändrats</b>: ronden tar nu ' + P.timText(x.forslag.minuter) +
          ' i stället för ' + P.timText(x.minuterVidGodkandet) + ', fortfarande ' + nyNamn + '.';
      }
      var notis = el('div', 'notis konflikt', notisText);
      var vagar = el('div', 'chiprad');
      if (x.forslag.dagsdel !== x.dagsdel) {
        vagar.appendChild(knapp('Använd ' + nyNamn, 'lank', function () { godkann(x.rond, x.forslag.dagsdel); }));
      }
      vagar.appendChild(knapp('Behåll ' + valdNamn, 'lank', function () { behall(x.rond); }));
      notis.appendChild(vagar);
      rad.appendChild(notis);
    }

    var val = el('div', 'chiprad');
    if (!x.godkand) {
      val.appendChild(knapp('Godkänn ' + valdNamn, 'knapp liten-knapp', function () { godkann(x.rond, x.forslag.dagsdel); }));
    }
    DP.tidsschablon.DAGSDELAR.forEach(function (d) {
      var vald = x.godkand && x.dagsdel === d.id;
      val.appendChild(knapp(d.namn + ' <span class="dov">' + d.timmar + ' h</span>', 'chip' + (vald ? ' pa' : ''), function () {
        if (!vald) { godkann(x.rond, d.id); }
      }));
    });
    rad.appendChild(val);
    return rad;
  }

  // Att välja en dagsdel räknas som att ta ställning, oavsett om det är förslaget eller något
  // annat. Förslaget som gällde sparas, så att en senare ändring av kopplingarna upptäcks.
  function godkann(rondId, dagsdel) {
    var s = P.state();
    var forslag = P.tidForslag(rondId, s);
    var d = DP.tidsschablon.dagsdel(dagsdel);
    var text = dagsdel === forslag.dagsdel
      ? 'Godkände ' + d.namn + ' för ' + P.rondNamn(rondId)
      : 'Planerad tid för ' + P.rondNamn(rondId) + ': ' + d.namn;
    P.andra(text, function (st) {
      P.sattTid(st, rondId, dagsdel, forslag);
    });
  }

  // Den andra vägen ut ur en ändrad förutsättning: planeraren står fast vid sin tid. Dagsdelen
  // rörs inte, men ställningstagandet är nytt, så markeringen försvinner (berättelse 19).
  function behall(rondId) {
    var s = P.state();
    var forslag = P.tidForslag(rondId, s);
    var sparad = s.tider[rondId];
    var d = DP.tidsschablon.dagsdel(sparad ? sparad.dagsdel : forslag.dagsdel);
    P.andra('Behöll ' + d.namn + ' för ' + P.rondNamn(rondId), function (st) {
      P.behallTid(st, rondId, forslag);
    });
  }

  function godkannAlla() {
    var s = P.state();
    var utan = P.tidStatus(s).utan;
    if (!utan.length) { return; }
    P.andra('Godkände de ' + utan.length + ' föreslagna tiderna', function (st) {
      utan.forEach(function (x) { P.sattTid(st, x.rond, x.forslag.dagsdel, x.forslag); });
    });
  }

  // ---------------- Guiden för Lägg till ----------------
  function oppnaGuide(a) {
    var s = P.state();
    var redan = s.kopplingar.filter(function (x) { return x.atgard === a.id; });
    var forslag = s.ronder.some(function (r) { return r.id === a.foreslagenRond; }) ? a.foreslagenRond : null;
    ui.guide = {
      atgard: a.id,
      val: redan.length ? 'vissa' : 'alla',
      valda: {},
      rond: redan.length ? redan[0].rond : forslag,
      lastRond: redan.length > 0,
      samma: null
    };
    ui.expanderad = null;
    rita();
  }

  function guide(a, s) {
    var g = ui.guide;
    var redan = {};
    s.kopplingar.forEach(function (x) { if (x.atgard === a.id) { redan[x.inst] = true; } });
    var lediga = a.generell ? [] : matchande(a).filter(function (i) { return !redan[i.id]; });
    var w = el('div', 'guide');

    // a) Alla eller vissa
    var antal = a.generell ? 1 : (g.val === 'alla' ? lediga.length : Object.keys(g.valda).filter(function (k) { return g.valda[k]; }).length);
    if (!a.generell) {
      var tn = typNamn(a, lediga.length);
      w.appendChild(el('div', 'g-fraga', 'Vill du koppla <b>' + a.namn + '</b> till alla ' + lediga.length + ' ' + tn + ' i ' + b.namn + ', eller bara till vissa?'));
      var r1 = el('div', 'chiprad');
      r1.appendChild(knapp('Alla ' + lediga.length, 'chip' + (g.val === 'alla' ? ' pa' : ''), function () { g.val = 'alla'; rita(); }));
      r1.appendChild(knapp('Vissa …', 'chip' + (g.val === 'vissa' ? ' pa' : ''), function () { g.val = 'vissa'; rita(); }));
      w.appendChild(r1);
      if (g.val === 'vissa') {
        var cl = el('div', 'checklista');
        lediga.forEach(function (i) {
          var lab = el('label', null);
          var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!g.valda[i.id];
          cb.addEventListener('change', function () { g.valda[i.id] = cb.checked; rita(); });
          lab.appendChild(cb);
          lab.appendChild(el('span', null, '<b>' + i.beteckning + '</b> ' + i.benamning + ' <span class="dov">· ' + i.rum + '</span>'));
          cl.appendChild(lab);
        });
        w.appendChild(cl);
      }
    }

    // b) Rond
    w.appendChild(el('div', 'g-fraga', 'Till vilken rond ska åtgärderna läggas?'));
    var r2 = el('div', 'chiprad');
    s.ronder.forEach(function (r) {
      var c = knapp(P.rondNamn(r.id) + (r.id === a.foreslagenRond ? ' <span class="tagg">föreslagen</span>' : ''), 'chip' + (g.rond === r.id ? ' pa' : ''), function () { if (!g.lastRond) { g.rond = r.id; rita(); } });
      if (g.lastRond && g.rond !== r.id) { c.disabled = true; }
      r2.appendChild(c);
    });
    w.appendChild(r2);
    if (g.lastRond) { w.appendChild(el('div', 'liten-text', 'Åtgärden finns redan i ' + P.rondNamn(g.rond) + '. Samma åtgärd ska inte delas upp på olika ronder.')); }
    if (!a.generell && a.foreslagenRond && !s.ronder.some(function (r) { return r.id === a.foreslagenRond; })) {
      w.appendChild(el('div', 'liten-text', 'Föreslagen rond är ' + P.rondNamn(a.foreslagenRond) + ', men den finns inte i planeringen. Välj en av de befintliga, eller lägg till ronden i steg 2.'));
    }

    // c) Samma tillfälle
    var behoverSamma = !a.generell && antal > 1;
    if (behoverSamma) {
      w.appendChild(el('div', 'g-fraga', 'Ska alla ' + antal + ' åtgärderna utföras vid samma tillfälle?'));
      var r3 = el('div', 'chiprad');
      r3.appendChild(knapp('Ja', 'chip' + (g.samma === true ? ' pa' : ''), function () { g.samma = true; rita(); }));
      r3.appendChild(knapp('Nej', 'chip' + (g.samma === false ? ' pa' : ''), function () { g.samma = false; rita(); }));
      w.appendChild(r3);
      if (g.samma === false) {
        w.appendChild(el('div', 'notis varning', '<b>Det är inte lämpligt.</b> Om samma åtgärd ska utföras vid olika tillfällen behövs flera ronder för samma sak, t.ex. två ronder för brandskydd med olika handbrandsläckare i varje. Det blir svårt att överblicka och är sällan rationellt. Välj <b>Ja</b>, eller koppla åtgärden till färre installationer.'));
      }
    }

    // Förhandsvisning och knappar
    var giltig = antal > 0 && g.rond && (!behoverSamma || g.samma === true);
    if (giltig) {
      var rond = s.ronder.filter(function (r) { return r.id === g.rond; })[0];
      var n = P.veckorForRond(rond, s).length;
      w.appendChild(el('div', 'forhands', '→ ' + antal + ' åtgärd' + (antal > 1 ? 'er' : '') + ' hamnar i vart och ett av ' + n + ' rutintillfällen <b>' + P.rondNamn(g.rond) + '</b> under ' + P.AR + '.'));
    }
    var kr = el('div', 'knapprad');
    var ok = knapp('Lägg till', 'knapp', function (kn) { laggTill(a, lediga, kn); });
    ok.disabled = !giltig;
    kr.appendChild(ok);
    kr.appendChild(knapp('Avbryt', 'knapp sekundar', function () { ui.guide = null; rita(); }));
    w.appendChild(kr);
    return w;
  }

  function laggTill(a, lediga, kn) {
    var g = ui.guide;
    var inst = a.generell ? ['BYGGNAD'] : (g.val === 'alla' ? lediga.map(function (i) { return i.id; }) : Object.keys(g.valda).filter(function (k) { return g.valda[k]; }));
    var kalla = DP.mitt(kn);
    ui.guide = null;
    P.andra('La till ' + a.namn + (a.generell ? '' : ' (' + inst.length + ' st)') + ' i ' + P.rondNamn(g.rond), function (st) {
      inst.forEach(function (id) { st.kopplingar.push({ atgard: a.id, inst: id, rond: g.rond }); });
    }, { kalla: kalla, lagtTill: true });
  }

  function taBort(a, kn) {
    P.andra('Tog bort ' + a.namn, function (st) {
      st.kopplingar = st.kopplingar.filter(function (x) { return x.atgard !== a.id; });
    }, { kalla: DP.mitt(kn) });
  }

  // ------------------------------------------------------------------
  // Snabbstart: standardplanering och kopiering från annan byggnad
  // ------------------------------------------------------------------
  function snabbstart(s) {
    var typ = DP.byggnadstyper[b.typ];
    var w = el('section', 'snabbstart');
    w.appendChild(el('div', 'ss-rubrik', 'Snabbstart för <b>' + b.namn + '</b>'));
    w.appendChild(el('div', 'ss-text', 'Bygg planeringen själv steg för steg nedan, eller utgå från en grund och justera.'));
    var rad = el('div', 'knapprad');
    if (typ) {
      rad.appendChild(knapp('Använd standardplanering för ' + typ.namn.toLowerCase(), 'knapp sekundar liten-knapp', function (kn) { standardplanering(DP.mitt(kn)); },
        typ.motivering));
    }
    // Kopiering erbjuds från byggnader av samma typ som har en planering
    var kallor = P.byggnadsordning.filter(function (id) { return id !== P.aktivId() && DP.byggnader[id].typ === b.typ && P.stateFor(id).ronder.length; });
    kallor.forEach(function (id) {
      rad.appendChild(knapp('Kopiera från ' + DP.byggnader[id].namn, 'knapp sekundar liten-knapp', function (kn) { kopieraFran(id, DP.mitt(kn)); }));
    });
    w.appendChild(rad);
    var sammaTyp = P.byggnadsordning.filter(function (id) { return id !== P.aktivId() && DP.byggnader[id].typ === b.typ; });
    if (!kallor.length && sammaTyp.length) {
      w.appendChild(el('div', 'liten-text', 'När ' + sammaTyp.map(function (id) { return DP.byggnader[id].namn; }).join(', ') + ' har en planering kan du kopiera den hit.'));
    }
    return w;
  }

  function harPlanering(s) { return s.ronder.length > 0 || s.kopplingar.length > 0; }

  // Standardplanering: byggnadstypens ronder och frekvenser + alla matchande åtgärder i föreslagen rond
  function standardplanering(kalla) {
    var typ = DP.byggnadstyper[b.typ], s = P.state();
    var gor = function () {
      P.andra('Standardplanering för ' + typ.namn.toLowerCase(), function (st) {
        var bas = { typ: typ.standard.bas.typ, startManad: typ.standard.bas.startManad || null };
        st.bas = bas;
        st.ronder = typ.standard.ronder.map(function (r) {
          var f = r.freq === 'bas' ? { typ: bas.typ, startManad: bas.startManad } : { typ: r.freq.typ, startManad: r.freq.startManad || null };
          return { id: r.id, freq: f, foljerBas: r.freq === 'bas', besvarad: true, utforare: r.utforare };
        });
        var finns = st.ronder.map(function (r) { return r.id; });
        st.kopplingar = []; st.instTexter = {}; st.tillfalleTexter = {};
        DP.atgarder.forEach(function (a) {
          var rond = finns.indexOf(a.foreslagenRond) >= 0 ? a.foreslagenRond : 'BI';
          if (a.generell) { st.kopplingar.push({ atgard: a.id, inst: 'BYGGNAD', rond: rond }); return; }
          matchande(a).forEach(function (i) { st.kopplingar.push({ atgard: a.id, inst: i.id, rond: rond }); });
        });
        // Steg 6 fylls i med godkända förslag, så att alla sex stegen är besvarade direkt
        // (beslut 35, berättelse 22). Förslagen räknas på de kopplingar som just lagts.
        st.tider = {};
        st.ronder.forEach(function (r) {
          var f = P.tidForslag(r.id, st);
          P.sattTid(st, r.id, f.dagsdel, f);
        });
      }, { kalla: kalla, standard: true });
      ui.oppet = 5; ui.guide = null;
      rita();
    };
    var forklaring = '<p>' + typ.motivering + '</p><p><b>Så skapas förslaget:</b></p><ul class="dlg-lista">' +
      '<li>Ronder och frekvenser enligt standarden för ' + typ.namn.toLowerCase() + ': ' + typ.standard.ronder.map(function (r) { return P.rondNamn(r.id); }).join(', ') + '.</li>' +
      '<li>Alla åtgärder som matchar installationer i ' + b.namn + ' kopplas, plus Kontroll byggnad invändigt och utvändigt.</li>' +
      '<li>Varje åtgärd hamnar i sin föreslagna rond. Finns inte den ronden hamnar åtgärden i Byggnad invändigt.</li></ul>' +
      '<p>Gå sedan igenom stegen och justera det som inte passar.</p>' +
      (harPlanering(s) ? '<div class="notis varning">Den nuvarande planeringen för ' + b.namn + ' ersätts. Det går att ångra.</div>' : '');
    DP.Dialog.visa({ titel: 'Standardplanering för ' + typ.namn.toLowerCase(), html: forklaring, bredd: 560,
      knappar: [{ text: 'Skapa förslag', prim: true, gor: gor }, { text: 'Avbryt' }] });
  }

  // Kopiera planering från en annan byggnad. Installationer matchas på typ och beteckning.
  function kopieraFran(kallId, kalla) {
    var kb = DP.byggnader[kallId], ks = P.stateFor(kallId), s = P.state();
    var malMap = {};
    signifikanta.forEach(function (i) { malMap[i.typ + '|' + i.beteckning] = i.id; });
    var idMap = { BYGGNAD: 'BYGGNAD' }, traffar = [], saknas = [];
    ks.kopplingar.forEach(function (k) {
      if (k.inst === 'BYGGNAD') { traffar.push({ atgard: k.atgard, inst: 'BYGGNAD', rond: k.rond }); return; }
      var ki = P.instIndex[k.inst], mid = malMap[ki.typ + '|' + ki.beteckning];
      if (mid) { idMap[k.inst] = mid; traffar.push({ atgard: k.atgard, inst: mid, rond: k.rond }); }
      else { saknas.push({ inst: ki, atgard: P.atgard(k.atgard) }); }
    });
    var kopplade = {};
    traffar.forEach(function (k) { kopplade[k.inst] = true; });
    var utan = signifikanta.filter(function (i) { return !kopplade[i.id]; });
    var nAvv = Object.keys(ks.instTexter).length + Object.keys(ks.tillfalleTexter).length;

    var nod = document.createElement('div');
    var html = '<p>All planering i <b>' + kb.namn + '</b> kopieras till <b>' + b.namn + '</b>: besöksfrekvens, ' + ks.ronder.length +
      ' ronder med frekvens och utförare, kopplade åtgärder, planerade tider' + (nAvv ? ' och ' + nAvv + ' avvikande åtgärdstexter' : '') + '.</p>' +
      '<p>Installationerna matchas på typ och beteckning (t.ex. HB01 ↔ HB01).</p>' +
      '<div class="kopiera-sammanf">' +
      '<div class="ks-rad ok"><b>' + traffar.length + '</b> ' + (traffar.length === 1 ? 'koppling får' : 'kopplingar får') + ' en motsvarighet</div>' +
      '<div class="ks-rad' + (saknas.length ? ' varn' : ' ok') + '"><b>' + saknas.length + '</b> ' + (saknas.length === 1 ? 'koppling saknar' : 'kopplingar saknar') + ' motsvarighet i ' + b.namn +
      (saknas.length ? ': ' + saknas.map(function (x) { return x.inst.beteckning + ' (' + x.atgard.namn.toLowerCase() + ')'; }).join(', ') : '') + '</div>' +
      '<div class="ks-rad' + (utan.length ? ' varn' : ' ok') + '"><b>' + utan.length + '</b> ' + (utan.length === 1 ? 'installation' : 'installationer') + ' i ' + b.namn + ' får ingen åtgärd' +
      (utan.length ? ': ' + utan.map(function (i) { return i.beteckning + ' ' + i.benamning; }).join(', ') : '') + '</div></div>';
    if (kb.typ !== b.typ) { html += '<div class="notis varning">Byggnaderna är av olika typ. Kontrollera resultatet noga.</div>'; }
    if (harPlanering(s)) { html += '<div class="notis varning">Den nuvarande planeringen för ' + b.namn + ' ersätts. Det går att ångra.</div>'; }
    nod.innerHTML = html;
    var urad = el('div', 'chiprad', '<span class="liten-rubrik">Utförare i ' + b.namn + ':</span>');
    var usel = document.createElement('select'); usel.className = 'utf-val';
    var o0 = el('option', null, 'Samma som i ' + kb.namn); o0.value = ''; usel.appendChild(o0);
    P.UTFORARE.forEach(function (u) { var o = el('option', null, u.namn + ' för alla ronder'); o.value = u.id; usel.appendChild(o); });
    urad.appendChild(usel);
    nod.appendChild(urad);

    DP.Dialog.visa({ titel: 'Kopiera planering från ' + kb.namn, nod: nod, bredd: 620,
      knappar: [
        { text: 'Kopiera', prim: true, gor: function () {
          var nyUtf = usel.value;
          P.andra('Kopierade planering från ' + kb.namn, function (st) {
            st.bas = P.klona(ks.bas);
            st.ronder = P.klona(ks.ronder).map(function (r) { if (nyUtf) { r.utforare = nyUtf; } return r; });
            st.kopplingar = traffar.map(function (k) { return { atgard: k.atgard, inst: k.inst, rond: k.rond }; });
            st.standardTexter = P.klona(ks.standardTexter);
            // De planerade tiderna följer med, inklusive det förslag som gällde i källan. Tiden
            // är godkänd, så steg 6 har inga luckor – men den är märkt som ärvd, så att varje
            // avvikelse i målbyggnadens egna förutsättningar syns, hur liten den än är.
            // Kasern 2 ska inte tyst ärva en tid som räknats på Kasern 1 (berättelse 23).
            st.tider = {};
            Object.keys(ks.tider).forEach(function (rondId) {
              P.arvTid(st, rondId, ks.tider[rondId]);
            });
            st.instTexter = {}; st.tillfalleTexter = {};
            Object.keys(ks.instTexter).forEach(function (n) {
              var d = n.split('|'); if (idMap[d[1]]) { st.instTexter[d[0] + '|' + idMap[d[1]]] = P.klona(ks.instTexter[n]); }
            });
            Object.keys(ks.tillfalleTexter).forEach(function (n) {
              var d = n.split('|'); if (idMap[d[1]]) { st.tillfalleTexter[[d[0], idMap[d[1]], d[2], d[3]].join('|')] = P.klona(ks.tillfalleTexter[n]); }
            });
          }, { kalla: kalla, kopierad: { utan: utan } });
          ui.oppet = 5; ui.guide = null;
          rita();
        } },
        { text: 'Avbryt' }
      ] });
  }

  // Byte av byggnad: allt ritas om för den nya byggnadens planering
  P.prenumereraByte(function () {
    indexera();
    ui.guide = null; ui.expanderad = null; ui.redigerarText = null; ui.annan = {};
    var s = P.state();
    ui.oppet = harPlanering(s) ? 5 : 1;
    rita();
    DP.Tidsaxel.rita();
    var set = {};
    s.kopplingar.forEach(function (k) { set[k.inst] = true; });
    DP.viewer.sattKopplade(set);
    DP.viewer.sattAvvikande(P.avvikandeInst(s));
  });

  // ------------------------------------------------------------------
  // Reaktion på varje ändring: rita om och animera skillnaden
  // ------------------------------------------------------------------
  function nyckel(k) { return k.atgard + '|' + k.inst + '|' + k.rond; }

  P.prenumerera(function (fore, efter, info) {
    rita();
    DP.Tidsaxel.rita();
    DP.Telefon.rita();
    DP.ui.uppdatera();

    // info.byggnader säger vilka byggnader steget ändrade. Ett steg som inte rörde den aktiva
    // byggnaden (Balansering ändrar flera på en gång) har inget att animera här; vyerna är redan omritade.
    if (info.byggnader && info.byggnader.indexOf(P.aktivId()) < 0) {
      DP.viewer.sattAvvikande(P.avvikandeInst(efter));
      return;
    }

    var set = {};
    efter.kopplingar.forEach(function (k) { set[k.inst] = true; });

    var fset = {}, eset = {};
    fore.kopplingar.forEach(function (k) { fset[nyckel(k)] = k; });
    efter.kopplingar.forEach(function (k) { eset[nyckel(k)] = k; });
    var tillagda = efter.kopplingar.filter(function (k) { return !fset[nyckel(k)]; });
    var borttagna = fore.kopplingar.filter(function (k) { return !eset[nyckel(k)]; });

    var kalla = info.kalla || DP.mitt(document.querySelector('.sidopanel'));
    DP.viewer.sattAvvikande(P.avvikandeInst(efter));

    // Förskjutna rutintillfällen: en bricka flyger från den vecka tillfället låg i till den
    // nya. Skillnaden räknas ur tillstånden, så ångra animerar flytten tillbaka av sig själv
    // (berättelse 69). Tidsaxeln är redan omritad, men veckokolumnerna står still, så den
    // gamla cellen finns kvar på sin plats – tom.
    var vs = P.veckoSkillnad(fore, efter);
    vs.slice(0, 40).forEach(function (f) {
      var fran = DP.Tidsaxel.cellEl(f.rond, f.fran), till = DP.Tidsaxel.markorEl(f.nyckel);
      if (!fran || !till) { return; }
      var m = DP.mitt(till);
      m.klar = function () { DP.puls(till); };
      DP.flyg(DP.mitt(fran), [m], { text: '→', farg: '#4f6fd0' });
    });

    // Ändrade åtgärdstexter: samma visualisering som när åtgärder läggs till
    var ts = P.textSkillnad(fore, efter);
    if (ts.nycklar.length && !tillagda.length) {
      var markorer = ts.nycklar.map(function (n) { return document.querySelector('.rt-mark[data-nyckel="' + n + '"]'); }).filter(Boolean);
      DP.flyg(kalla, markorer.map(function (m) { var p = DP.mitt(m); p.klar = function () { DP.puls(m); }; return p; }), { text: '✎', farg: '#22b45a' });
      var ti = ts.inst.map(function (id) { return P.instIndex[id]; }).filter(Boolean);
      var m3 = ti.map(function (i) { return DP.viewer.skarmPos(i); }).filter(Boolean);
      var t3 = m3.length ? DP.flyg(kalla, m3, { text: '', farg: '#22b45a', max: 30 }) : 0;
      setTimeout(function () { DP.viewer.blinka(ti, 1600); }, Math.min(Math.max(t3, 300), 1100));
    }

    if (borttagna.length) {
      DP.viewer.sattKopplade(set);
      var bi = borttagna.map(function (k) { return P.instIndex[k.inst]; }).filter(Boolean);
      DP.viewer.blinka(bi, 1200, 0xd64541);
      rondGrupper(borttagna).forEach(function (rond) {
        [].forEach.call(document.querySelectorAll('.rt-mark[data-nyckel^="' + rond + ':"]'), function (m) { DP.puls(m, 'puls-rod'); });
      });
    }
    if (!tillagda.length) {
      if (!borttagna.length) { DP.viewer.sattKopplade(set); }
      return;
    }

    // 1) Till tidsaxeln: en bricka per rutintillfälle i de berörda ronderna
    var langst = 0;
    rondGrupper(tillagda).forEach(function (rond) {
      var n = tillagda.filter(function (k) { return k.rond === rond; }).length;
      var marken = [].slice.call(document.querySelectorAll('.rt-mark[data-nyckel^="' + rond + ':"]'));
      var mal = marken.map(function (m) { var p = DP.mitt(m); p.klar = function () { DP.puls(m); }; return p; });
      langst = Math.max(langst, DP.flyg(kalla, mal, { text: '+' + n, farg: '#22b45a' }));
    });

    // 2) Till installationerna i modellen
    var inst = tillagda.map(function (k) { return P.instIndex[k.inst]; }).filter(Boolean);
    var vy = DP.mitt(document.getElementById('vy3d'));
    var mal3d = inst.map(function (i) { return DP.viewer.skarmPos(i); }).filter(Boolean);
    if (!mal3d.length) { mal3d = [vy]; }
    var t3d = DP.flyg(kalla, mal3d, { text: '', farg: '#22b45a', max: 30 });
    setTimeout(function () {
      DP.viewer.sattKopplade(set);
      DP.viewer.blinka(inst, 1600);
    }, Math.min(t3d, 1100));
    // Efter kopiering: visa vad som saknar åtgärd (orange)
    if (info.kopierad && info.kopierad.utan.length) {
      setTimeout(function () { DP.viewer.blinka(info.kopierad.utan, 2200, 0xe07b26); }, Math.min(t3d, 1100) + 1700);
    }

    // 3) Öppna telefonvyn för de första rutintillfällena när brickorna landat
    if (info.lagtTill) {
      setTimeout(function () {
        rondGrupper(tillagda).forEach(function (rond) {
          P.rutintillfallen().filter(function (t) { return t.rond === rond; }).slice(0, 2).forEach(function (t) { DP.Telefon.oppna(t.nyckel); });
        });
      }, langst);
    }
  });

  function rondGrupper(lista) {
    return lista.map(function (k) { return k.rond; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  DP.Flode = { rita: rita };
  rita();
  DP.Tidsaxel.rita();
})();
