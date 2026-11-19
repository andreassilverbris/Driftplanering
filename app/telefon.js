/*
 * Telefonvyer: ett rutintillfälle visas som det ser ut i drifteknikerns telefon.
 * Lista med åtgärder → klick → åtgärdens detaljer. Högerklick ger en (pedagogisk) tömningsmeny.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan;
  var rot = document.getElementById('telefoner');
  var meny = document.getElementById('kontextmeny');
  var MAX = 3;
  var oppna = []; // { nyckel, vy: 'lista'|'detalj', index, scroll }
  var b = DP.byggnader.hangar;
  var rumIndex = {}, planIndex = {};
  b.rum.forEach(function (r) { rumIndex[r.nr] = r; });
  b.plan.forEach(function (p) { planIndex[p.id] = p; });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  function hitta(nyckel) { return P.rutintillfallen().filter(function (t) { return t.nyckel === nyckel; })[0]; }
  function arOppen(nyckel) { return oppna.some(function (o) { return o.nyckel === nyckel; }); }

  function oppnaTelefon(nyckel, fokus) {
    var finns = oppna.filter(function (o) { return o.nyckel === nyckel; })[0];
    if (finns) {
      if (fokus) { DP.puls(rot.querySelector('.telefon[data-nyckel="' + nyckel + '"]'), 'puls-telefon'); }
      return;
    }
    oppna.push({ nyckel: nyckel, vy: 'lista', index: 0, scroll: 0 });
    while (oppna.length > MAX) { oppna.shift(); }
    rita();
    DP.Tidsaxel.rita();
  }
  function stang(nyckel) {
    oppna = oppna.filter(function (o) { return o.nyckel !== nyckel; });
    rita();
    DP.Tidsaxel.rita();
  }

  function installationsInfo(k) {
    if (k.inst === 'BYGGNAD') { return { namn: b.namn + ' (hela byggnaden)', plan: '–', rum: '–', inst: null }; }
    var i = P.instIndex[k.inst];
    var r = rumIndex[i.rum], p = planIndex[r.plan];
    return { namn: i.benamning, bet: i.beteckning, plan: p.id + ' – ' + p.namn, rum: r.nr + ' – ' + r.namn, inst: i };
  }

  function rita() {
    // Spara skrollägen
    [].forEach.call(rot.querySelectorAll('.telefon'), function (t) {
      var o = oppna.filter(function (x) { return x.nyckel === t.dataset.nyckel; })[0];
      var lista = t.querySelector('.tf-innehall');
      if (o && lista) { o.scroll = lista.scrollTop; }
    });
    rot.innerHTML = '';
    oppna = oppna.filter(function (o) { return !!hitta(o.nyckel); });
    oppna.forEach(function (o) { rot.appendChild(telefon(o)); });
    [].forEach.call(rot.querySelectorAll('.telefon'), function (t) {
      var o = oppna.filter(function (x) { return x.nyckel === t.dataset.nyckel; })[0];
      var lista = t.querySelector('.tf-innehall');
      if (o && lista) { lista.scrollTop = o.scroll; }
    });
  }

  function telefon(o) {
    var t = hitta(o.nyckel);
    var u = P.utforare(t.utforare);
    var lista = P.sorteradeAtgarder(t.atgarder);

    var wrap = el('div', 'telefon-wrap');
    var stangK = el('button', 'tf-stang', '×');
    stangK.title = 'Stäng telefonvyn';
    stangK.addEventListener('click', function () { stang(o.nyckel); });
    wrap.appendChild(stangK);

    var tel = el('div', 'telefon');
    tel.dataset.nyckel = o.nyckel;
    var skarm = el('div', 'tf-skarm');
    var status = el('div', 'tf-status');
    status.innerHTML = '<span>09:41</span><span class="tf-o"></span><span>●●● ▮</span>';
    skarm.appendChild(status);

    if (o.vy === 'detalj' && lista[o.index]) {
      skarm.appendChild(detalj(o, t, lista[o.index]));
    } else {
      o.vy = 'lista';
      var app = el('div', 'tf-app');
      app.innerHTML = '<span class="tf-tillbaka">‹ Mina rutintillfällen</span>';
      skarm.appendChild(app);
      var h = el('div', 'tf-rubrik');
      h.appendChild(el('div', 'tf-titel', t.namn));
      var under = el('div', 'tf-under');
      var nAvv = lista.filter(function (k) { return P.textFor(k, t.vecka).niva !== 'standard'; }).length;
      under.innerHTML = '<span class="avatar liten" style="background:' + u.farg + '">' + u.namn[0] + '</span>' + u.namn + ' · ' + lista.length + ' åtgärder' +
        (nAvv ? ' · <span class="avvik-symbol liten">✎</span>' + nAvv + ' avvikande' : '');
      h.appendChild(under);
      skarm.appendChild(h);
      var inn = el('div', 'tf-innehall');
      if (!lista.length) {
        var tom = el('div', 'tf-tom');
        tom.innerHTML = 'Rutintillfället är tomt.<br><br>Koppla åtgärder till ronden <b>' + P.rondNamn(t.rond) + '</b> i steg 5 så hamnar de här.';
        inn.appendChild(tom);
      }
      lista.forEach(function (k, idx) {
        var a = P.atgard(k.atgard), info = installationsInfo(k);
        var rad = el('div', 'tf-rad');
        var avviker = P.textFor(k, t.vecka).niva !== 'standard';
        rad.innerHTML = '<div class="tf-a">' + a.namn + (avviker ? ' <span class="avvik-symbol liten" title="Avvikande åtgärdstext">✎</span>' : '') + '</div><div class="tf-i">' + (info.bet ? info.bet + ' · ' : '') + info.namn + '</div><span class="tf-pil">›</span>';
        rad.addEventListener('click', function () {
          o.vy = 'detalj'; o.index = idx; o.redigerar = false;
          if (info.inst && DP.viewer) { DP.viewer.valjInstallation(info.inst, false); }
          rita();
        });
        rad.addEventListener('contextmenu', function (e) { e.preventDefault(); visaMeny(e, t, k); });
        inn.appendChild(rad);
      });
      skarm.appendChild(inn);
      var tips = el('div', 'tf-tips', 'Högerklicka på en åtgärd för att tömma rutintillfället');
      skarm.appendChild(tips);
    }
    skarm.appendChild(el('div', 'tf-hem'));
    tel.appendChild(skarm);
    wrap.appendChild(tel);
    return wrap;
  }

  function detalj(o, t, k) {
    var d = el('div', 'tf-detalj-wrap');
    var app = el('div', 'tf-app');
    var tb = el('span', 'tf-tillbaka klickbar', '‹ ' + P.rondNamn(t.rond) + ' v' + t.vecka);
    tb.addEventListener('click', function () { o.vy = 'lista'; rita(); });
    app.appendChild(tb);
    d.appendChild(app);
    var a = P.atgard(k.atgard), info = installationsInfo(k);
    var inn = el('div', 'tf-innehall tf-detalj');
    function falt(rub, varde) {
      inn.appendChild(el('div', 'tf-falt-rub', rub));
      inn.appendChild(el('div', 'tf-falt', varde));
    }
    falt('Installation', (info.bet ? info.bet + ' · ' : '') + info.namn);
    falt('Plan', info.plan);
    falt('Rum', info.rum);
    falt('Åtgärd', a.namn);
    inn.appendChild(el('div', 'tf-falt-rub', 'Åtgärdstext'));
    var gall = P.textFor(k, t.vecka);
    if (o.redigerar) {
      inn.appendChild(DP.Dialog.redigerare({
        punkter: gall.punkter, kompakt: true,
        onSpara: function (punkter, kn) {
          o.redigerar = false;
          if (P.lika(punkter, gall.punkter)) { rita(); return; }
          rita();
          DP.Texter.sparaTillfalle(k, t.vecka, punkter, DP.mitt(kn));
        },
        onAvbryt: function () { o.redigerar = false; rita(); }
      }));
    } else {
      if (gall.niva !== 'standard') {
        var av = el('div', 'tf-avvik');
        av.innerHTML = '<span class="avvik-symbol">✎</span> Avvikande åtgärdstext – gäller ' + (gall.niva === 'tillfalle' ? 'bara detta rutintillfälle' : 'denna installation i alla rutintillfällen');
        var jmf = el('button', 'tf-lank', 'Jämför');
        jmf.addEventListener('click', function () { DP.Texter.jamforNivaer(k, t.vecka); });
        av.appendChild(jmf);
        inn.appendChild(av);
      }
      var txt = el('div', 'tf-falt');
      txt.appendChild(el('div', 'tf-kontrollera', 'Kontrollera:'));
      var ul = el('ul');
      gall.punkter.forEach(function (p) { ul.appendChild(el('li', null, p)); });
      txt.appendChild(ul);
      inn.appendChild(txt);
      var andra = el('button', 'tf-knapp', 'Ändra åtgärdstext');
      andra.addEventListener('click', function () { o.redigerar = true; rita(); });
      inn.appendChild(andra);
    }
    if (info.inst) {
      var visa = el('button', 'tf-knapp', 'Visa installationen i modellen');
      visa.addEventListener('click', function () { DP.viewer.valjInstallation(info.inst, true); });
      inn.appendChild(visa);
    }
    d.appendChild(inn);
    return d;
  }

  // ------------------------------------------------------------------
  // Högerklicksmeny
  // ------------------------------------------------------------------
  function visaMeny(e, t, k) {
    var a = P.atgard(k.atgard);
    var rond = P.rondNamn(t.rond);
    meny.innerHTML = '';
    var p = { x: e.clientX, y: e.clientY };
    function val(text, gor) {
      var v = el('button', 'km-val', text);
      v.addEventListener('click', function () { doljMeny(); gor(); });
      meny.appendChild(v);
    }
    val('Töm rutintillfället på alla åtgärder', function () {
      P.andra('Tömde ronden ' + rond + ' på alla åtgärder', function (s) {
        var fore = s.kopplingar.length;
        s.kopplingar = s.kopplingar.filter(function (x) { return x.rond !== t.rond; });
        return s.kopplingar.length !== fore;
      }, { kalla: p });
    });
    val('Töm rutintillfället på alla åtgärder ' + a.namn, function () {
      P.andra('Tömde ronden ' + rond + ' på ' + a.namn, function (s) {
        s.kopplingar = s.kopplingar.filter(function (x) { return !(x.rond === t.rond && x.atgard === k.atgard); });
      }, { kalla: p });
    });
    meny.appendChild(el('div', 'km-not', 'Åtgärderna är kopplade till ronden, så tömningen gäller alla rutintillfällen i ' + rond + '. Kan ångras.'));
    meny.style.left = Math.min(p.x, window.innerWidth - 340) + 'px';
    meny.style.top = Math.min(p.y, window.innerHeight - 160) + 'px';
    meny.hidden = false;
  }
  function doljMeny() { meny.hidden = true; }
  document.addEventListener('click', function (e) { if (!meny.contains(e.target)) { doljMeny(); } });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { doljMeny(); } });

  DP.Telefon = { oppna: oppnaTelefon, stang: stang, arOppen: arOppen, rita: rita };
})();
