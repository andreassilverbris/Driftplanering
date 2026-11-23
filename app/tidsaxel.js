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
    // Veckor. De utan tillsyn och skötsel är markerade även här: det är förklaringen till att
    // ett tillfälle ligger en vecka tidigare än rytmen säger (beslut 32).
    var utan = {};
    P.svarVeckorUtan().forEach(function (x) { utan[x] = true; });
    grid.appendChild(el('div', 'ta-etikett ta-vecka-etikett', 'Vecka'));
    for (v = 1; v <= n; v++) {
      var vc = el('div', 'ta-vecka' + (utan[v] ? ' utan' : ''), String(v));
      if (utan[v]) { vc.title = 'V. ' + v + ' – ingen tillsyn och skötsel'; }
      grid.appendChild(vc);
    }

    if (!s.bas) {
      var tom = el('div', 'ta-tom', 'Svara på fråga 1 – hur ofta byggnaden måste besökas – så visas besöken här direkt.');
      tom.style.gridColumn = '1 / -1';
      grid.appendChild(tom);
      rot.appendChild(grid);
      return;
    }

    // Besök i byggnaden
    // Utan ronder finns bara fråga 1:s svar att visa. Byggnadens förskjutning gäller även då,
    // så raden flyttar sig med besöksrytmen.
    var besok = s.ronder.length ? P.besoksveckor(s) : P.veckorFor(s.bas, s.forskjutning);
    // En **permanent** flytt är en förskjutning, och en förskjuten rytm syns bara som att
    // veckorna ligger någon annanstans. Markeringen på raden är det som säger att de gör det
    // med flit – skilt från de provisoriska flyttarnas ⤺ på en enskild bricka (beslut 34).
    var fsk = P.forskjutningStatus(P.aktivId());
    var be = el('div', 'ta-etikett ta-besok-etikett');
    be.innerHTML = '<span class="ta-namn">Besök i byggnaden</span>' +
      (fsk.byggnad ? '<span class="ta-fsk" title="' + fsk.byggnadText + '">' + P.forskjutningMarke(fsk.byggnad) + '</span>' : '') +
      '<span class="ta-antal">' + besok.length + ' / år</span>';
    be.title = (s.ronder.length ? 'Alla veckor där minst ett rutintillfälle infaller' : 'Planerade besök enligt fråga 1') +
      (fsk.byggnadText ? '\n⇥ ' + fsk.byggnadText : '');
    grid.appendChild(be);
    for (v = 1; v <= n; v++) {
      var c = el('div', 'ta-cell ta-besok' + (utan[v] ? ' utan' : ''));
      if (besok.indexOf(v) >= 0) { c.appendChild(el('span', 'besok-prick')); }
      grid.appendChild(c);
    }

    // En rad per rond
    var rt = P.rutintillfallen(s);
    s.ronder.forEach(function (r) {
      var u = P.utforare(r.utforare);
      var lab = el('div', 'ta-etikett');
      var veck = P.veckorForRond(r, s).length;
      // Rondseriens egen förskjutning (nivå 2) står på rondens rad. Byggnadens (nivå 1) står
      // på besöksraden ovanför och upprepas inte här: den gäller alla rader, och en siffra på
      // varje rond hade sagt att de är förskjutna var för sig.
      var rfsk = fsk.ronder.filter(function (x) { return x.rond === r.id; })[0];
      lab.innerHTML = '<span class="avatar" style="background:' + u.farg + '" title="Utförare: ' + u.namn + '">' + u.namn[0] + '</span>' +
        '<span class="ta-namn">' + P.rondNamn(r.id) + '</span>' +
        (rfsk && rfsk.egen ? '<span class="ta-fsk" title="' + rfsk.text + '">' + P.forskjutningMarke(rfsk.egen) + '</span>' : '') +
        '<span class="ta-antal">' + (veck ? veck + ' / år' : 'frekvens?') + '</span>';
      if (rfsk && rfsk.text) { lab.title = '⇥ ' + rfsk.text; }
      grid.appendChild(lab);
      for (var w = 1; w <= n; w++) {
        var cell = el('div', 'ta-cell' + (utan[w] ? ' utan' : ''));
        // Rond och vecka på själva cellen, inte bara på markören: en förskjutning behöver veta
        // var ett tillfälle *låg* för att kunna animera flytten, och den cellen är nu tom.
        cell.dataset.rond = r.id;
        cell.dataset.vecka = String(w);
        // Flera tillfällen kan ligga i samma vecka: en veckorond får alla semesterveckornas
        // tillfällen provisoriskt flyttade till veckan före (beslut 32). Alla ritas – ett
        // tillfälle som inte syns går inte att öppna, och då syns inte heller att det är
        // för många i samma vecka, vilket är just vad strykförslaget handlar om.
        rt.filter(function (x) { return x.rond === r.id && x.vecka === w; })
          .forEach(function (t) { cell.appendChild(markor(t, u)); });
        grid.appendChild(cell);
      }
    });
    rot.appendChild(grid);
  }

  // Markören ligger i tillfällets **faktiska** vecka: `rutintillfallen()` ger den veckan, så
  // en provisorisk flytt syns i planeringens tidsaxel utan att den behöver veta något om
  // nivå 3. Att veckan inte är den ordinarie står i markeringen och i titeln (biljett #16).
  function markor(t, u) {
    var k = el('button', 'rt-mark' + (t.atgarder.length ? ' fylld' : '') +
      (t.provisorisk ? ' provisorisk' : '') + (t.foreslagen ? ' foreslagen' : '') +
      (DP.Telefon && DP.Telefon.arOppen(t.nyckel) ? ' oppen' : ''));
    k.dataset.nyckel = t.nyckel;
    k.dataset.ordinarie = String(t.ordinarieVecka);
    k.style.setProperty('--u', u.farg);
    k.textContent = t.atgarder.length ? String(t.atgarder.length) : '';
    k.title = 'Rutintillfälle ' + t.namn + '\nUtförare: ' + u.namn + '\n' + (t.atgarder.length ? t.atgarder.length + ' åtgärder' : 'Tomt – inga åtgärder ännu');
    if (t.provisorisk) {
      k.appendChild(el('span', 'rt-symbol flytt', '⤺'));
      k.title += '\n⤺ Provisoriskt flyttat från v. ' + t.ordinarieVecka + ' – vecka utan tillsyn och skötsel';
    }
    if (t.foreslagen) {
      k.appendChild(el('span', 'rt-symbol stryk', '✂'));
      k.title += '\n✂ Föreslås strykas – ligger nära ett annat tillfälle i samma rondserie';
    }
    if (P.rutintillfalleAvviker(t)) {
      k.appendChild(el('span', 'avvik-symbol mark', '✎'));
      k.title += '\n✎ Innehåller avvikande åtgärdstext';
    }
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
  // Cellen för en rond och en vecka, med eller utan tillfälle i sig
  function cellEl(rond, vecka) {
    return rot.querySelector('.ta-cell[data-rond="' + rond + '"][data-vecka="' + vecka + '"]');
  }

  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); P.angra({ historik: true }); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); P.gorOm({ historik: true }); }
  });

  DP.Tidsaxel = { rita: rita, markorEl: markorEl, cellEl: cellEl };
})();
