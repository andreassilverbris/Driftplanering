/*
 * Tidsaxeln: en rad per rond med rutintillfällen per vecka, plus en rad med besöken i byggnaden.
 * Innehåller också mediaspelaren för att stega bakåt och framåt i historiken.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan;
  var rot = document.getElementById('tidsaxel');
  var zoomVal = null; // null = automatiskt, annars 'kvartal' | 'ar'
  var MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  function zoom() {
    if (zoomVal) { return zoomVal; }
    var s = P.state();
    return (s.bas && s.bas.typ === 'vecka') ? 'kvartal' : 'ar';
  }
  function antalVeckor() { return zoom() === 'kvartal' ? 13 : P.ANTAL_VECKOR; }

  function rita() {
    var s = P.state();
    rot.innerHTML = '';

    // Huvud: rubrik, zoom och spelare
    var huvud = el('div', 'ta-huvud');
    var rub = el('div', 'ta-rubrik');
    rub.innerHTML = '<b>Tidsaxel ' + P.AR + '</b> <span>rutintillfällen som planeringen skapar · klicka på ett tillfälle för att se det i telefonen</span>';
    huvud.appendChild(rub);
    var z = el('div', 'ta-zoom');
    [['kvartal', '13 veckor'], ['ar', 'Hela året']].forEach(function (o) {
      var k = el('button', 'chip' + (zoom() === o[0] ? ' pa' : ''), o[1]);
      k.addEventListener('click', function () { zoomVal = o[0]; rita(); });
      z.appendChild(k);
    });
    huvud.appendChild(z);
    huvud.appendChild(spelare());
    rot.appendChild(huvud);

    var n = antalVeckor();
    var grid = el('div', 'ta-grid');
    grid.style.gridTemplateColumns = '220px repeat(' + n + ', minmax(0, 1fr))';

    // Månader
    grid.appendChild(el('div', 'ta-etikett ta-man-etikett', ''));
    var v = 1;
    while (v <= n) {
      var m = P.manadForVecka(v), span = 0;
      while (v + span <= n && P.manadForVecka(v + span) === m) { span++; }
      var mc = el('div', 'ta-manad', MAN_KORT[m]);
      mc.style.gridColumn = 'span ' + span;
      grid.appendChild(mc);
      v += span;
    }
    // Veckor
    grid.appendChild(el('div', 'ta-etikett ta-vecka-etikett', 'Vecka'));
    for (v = 1; v <= n; v++) { grid.appendChild(el('div', 'ta-vecka', String(v))); }

    if (!s.bas) {
      var tom = el('div', 'ta-tom', 'Svara på fråga 1 – hur ofta byggnaden måste besökas – så visas besöken här direkt.');
      tom.style.gridColumn = '1 / -1';
      grid.appendChild(tom);
      rot.appendChild(grid);
      return;
    }

    // Besök i byggnaden
    var besok = s.ronder.length ? P.besoksveckor(s) : P.veckorFor(s.bas);
    var be = el('div', 'ta-etikett ta-besok-etikett');
    be.innerHTML = '<span class="ta-namn">Besök i byggnaden</span><span class="ta-antal">' + besok.length + ' / år</span>';
    be.title = s.ronder.length ? 'Alla veckor där minst ett rutintillfälle infaller' : 'Planerade besök enligt fråga 1';
    grid.appendChild(be);
    for (v = 1; v <= n; v++) {
      var c = el('div', 'ta-cell ta-besok');
      if (besok.indexOf(v) >= 0) { c.appendChild(el('span', 'besok-prick')); }
      grid.appendChild(c);
    }

    // En rad per rond
    var rt = P.rutintillfallen(s);
    s.ronder.forEach(function (r) {
      var u = P.utforare(r.utforare);
      var lab = el('div', 'ta-etikett');
      var veck = P.freqKomplett(r.freq) ? P.veckorFor(r.freq).length : 0;
      lab.innerHTML = '<span class="avatar" style="background:' + u.farg + '" title="Utförare: ' + u.namn + '">' + u.namn[0] + '</span>' +
        '<span class="ta-namn">' + P.rondNamn(r.id) + '</span><span class="ta-antal">' + (veck ? veck + ' / år' : 'frekvens?') + '</span>';
      grid.appendChild(lab);
      for (var w = 1; w <= n; w++) {
        var cell = el('div', 'ta-cell');
        var t = rt.filter(function (x) { return x.rond === r.id && x.vecka === w; })[0];
        if (t) { cell.appendChild(markor(t, u)); }
        grid.appendChild(cell);
      }
    });
    rot.appendChild(grid);
  }

  function markor(t, u) {
    var k = el('button', 'rt-mark' + (t.atgarder.length ? ' fylld' : '') + (DP.Telefon && DP.Telefon.arOppen(t.nyckel) ? ' oppen' : ''));
    k.dataset.nyckel = t.nyckel;
    k.style.setProperty('--u', u.farg);
    k.textContent = t.atgarder.length ? String(t.atgarder.length) : '';
    k.title = 'Rutintillfälle ' + t.namn + '\nUtförare: ' + u.namn + '\n' + (t.atgarder.length ? t.atgarder.length + ' åtgärder' : 'Tomt – inga åtgärder ännu');
    k.addEventListener('click', function () { DP.Telefon.oppna(t.nyckel, true); });
    return k;
  }

  // Mediaspelare för historiken
  function spelare() {
    var h = P.historik();
    var w = el('div', 'spelare');
    function knapp(symbol, titel, aktiv, gor) {
      var k = el('button', 'sp-knapp', symbol);
      k.title = titel;
      k.disabled = !aktiv;
      k.addEventListener('click', function () { gor(k); });
      return k;
    }
    w.appendChild(knapp('⏮', 'Till början', h.pos > 0, function (k) { P.gaTill(0, { historik: true, kalla: DP.mitt(k) }); }));
    w.appendChild(knapp('◀', 'Ångra (Ctrl+Z)', h.pos > 0, function (k) { P.angra({ historik: true, kalla: DP.mitt(k) }); }));
    var txt = el('div', 'sp-text');
    var steg = h.pos === 0 ? 'Start' : h.lista[h.pos];
    txt.innerHTML = '<span class="sp-steg">Steg ' + h.pos + ' / ' + (h.lista.length - 1) + '</span>' + steg;
    txt.title = steg;
    w.appendChild(txt);
    w.appendChild(knapp('▶', 'Gör om (Ctrl+Y)', h.pos < h.lista.length - 1, function (k) { P.gorOm({ historik: true, kalla: DP.mitt(k) }); }));
    w.appendChild(knapp('⏭', 'Till senaste', h.pos < h.lista.length - 1, function (k) { P.gaTill(h.lista.length - 1, { historik: true, kalla: DP.mitt(k) }); }));
    return w;
  }

  function markorEl(nyckel) { return rot.querySelector('.rt-mark[data-nyckel="' + nyckel + '"]'); }

  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); P.angra({ historik: true }); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); P.gorOm({ historik: true }); }
  });

  DP.Tidsaxel = { rita: rita, markorEl: markorEl };
})();
