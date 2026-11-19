/*
 * Gemensamma komponenter: dialogruta, jämförelse av åtgärdstexter och textredigerare.
 *
 * Jämförelsen tar emot en lista med versioner och kan i en senare etapp låta användaren välja
 * version: skicka med opts.onValj(index) så får varje kolumn knappen "Använd denna".
 */
(function () {
  'use strict';

  var DP = window.DP;
  var stack = [];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined && html !== null) { e.innerHTML = html; }
    return e;
  }

  // opts: { titel, html | nod, knappar: [{ text, prim, gor, stangInte }], bredd }
  function visa(opts) {
    var bak = el('div', 'dlg-bak');
    var d = el('div', 'dlg');
    if (opts.bredd) { d.style.width = opts.bredd + 'px'; }
    d.appendChild(el('h3', 'dlg-titel', opts.titel || ''));
    var kropp = el('div', 'dlg-kropp');
    if (opts.html) { kropp.innerHTML = opts.html; }
    if (opts.nod) { kropp.appendChild(opts.nod); }
    d.appendChild(kropp);
    var kr = el('div', 'knapprad dlg-knappar');
    (opts.knappar || [{ text: 'Stäng', prim: true }]).forEach(function (k) {
      var b = el('button', 'knapp' + (k.prim ? '' : ' sekundar'), k.text);
      b.addEventListener('click', function (e) {
        var p = DP.mitt(b);
        if (!k.stangInte) { stang(bak); }
        if (k.gor) { k.gor(p, e); }
      });
      kr.appendChild(b);
    });
    d.appendChild(kr);
    bak.appendChild(d);
    bak.addEventListener('mousedown', function (e) { if (e.target === bak) { stang(bak); } });
    document.body.appendChild(bak);
    stack.push(bak);
    var forsta = kr.querySelector('.knapp:not(.sekundar)');
    if (forsta) { forsta.focus(); }
    return { kropp: kropp, stang: function () { stang(bak); } };
  }

  function stang(bak) {
    bak = bak || stack[stack.length - 1];
    if (!bak) { return; }
    bak.remove();
    stack = stack.filter(function (x) { return x !== bak; });
  }
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stack.length) { e.stopPropagation(); stang(); } }, true);

  // ------------------------------------------------------------------
  // Jämför åtgärdstexter
  //   versioner: [{ rubrik, under, punkter }]
  //   opts: { titel, bas (index att jämföra mot, standard 0), onValj(index) – för senare etapp }
  // ------------------------------------------------------------------
  function jamfor(versioner, opts) {
    opts = opts || {};
    var bas = opts.bas || 0;
    var basSet = versioner[bas].punkter;
    var w = el('div', 'jmf');
    w.style.gridTemplateColumns = 'repeat(' + versioner.length + ', minmax(0, 1fr))';
    versioner.forEach(function (v, i) {
      var k = el('div', 'jmf-kol' + (i === bas ? ' bas' : ''));
      k.appendChild(el('div', 'jmf-rubrik', v.rubrik));
      k.appendChild(el('div', 'jmf-under', (v.under || '') + (i === bas && versioner.length > 1 ? ' · jämförs mot' : '')));
      var ul = el('ul', 'jmf-lista');
      v.punkter.forEach(function (p) {
        var ny = i !== bas && basSet.indexOf(p) < 0;
        ul.appendChild(el('li', ny ? 'jmf-ny' : null, esc(p)));
      });
      if (i !== bas) {
        basSet.filter(function (p) { return v.punkter.indexOf(p) < 0; }).forEach(function (p) {
          ul.appendChild(el('li', 'jmf-borta', esc(p)));
        });
      }
      k.appendChild(ul);
      if (opts.onValj) {
        var b = el('button', 'knapp sekundar liten-knapp', 'Använd denna');
        b.addEventListener('click', function () { stang(); opts.onValj(i); });
        k.appendChild(b);
      }
      w.appendChild(k);
    });
    var fork = el('div', 'jmf-forklaring', '<span class="jmf-ny">Grönt</span> finns inte i den version som jämförs mot. <span class="jmf-borta">Överstruket</span> saknas i versionen.');
    var nod = el('div');
    nod.appendChild(w);
    nod.appendChild(fork);
    return visa({ titel: opts.titel || 'Jämför åtgärdstexter', nod: nod, bredd: Math.min(1100, 260 + versioner.length * 250), knappar: [{ text: 'Stäng', prim: true }] });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ------------------------------------------------------------------
  // Redigerare för åtgärdstext: en kontrollpunkt per rad
  //   opts: { punkter, onSpara(punkter, knappEl), onAvbryt, kompakt }
  // ------------------------------------------------------------------
  function redigerare(opts) {
    var w = el('div', 'redigerare' + (opts.kompakt ? ' kompakt' : ''));
    w.appendChild(el('div', 'etikett', 'Åtgärdstext – Kontrollera:'));
    var ta = document.createElement('textarea');
    ta.value = opts.punkter.join('\n');
    ta.rows = Math.min(12, opts.punkter.length + 1);
    ta.spellcheck = false;
    w.appendChild(ta);
    var tips = el('div', 'liten-text', 'En kontrollpunkt per rad.');
    w.appendChild(tips);
    var kr = el('div', 'knapprad');
    var spara = el('button', 'knapp liten-knapp', 'Spara');
    var avbryt = el('button', 'knapp sekundar liten-knapp', 'Avbryt');
    spara.addEventListener('click', function (e) {
      e.stopPropagation();
      var p = tolka(ta.value);
      if (!p.length) { tips.textContent = 'Åtgärdstexten måste ha minst en kontrollpunkt.'; tips.classList.add('fel'); return; }
      opts.onSpara(p, spara);
    });
    avbryt.addEventListener('click', function (e) { e.stopPropagation(); if (opts.onAvbryt) { opts.onAvbryt(); } });
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
    kr.appendChild(spara); kr.appendChild(avbryt);
    w.appendChild(kr);
    setTimeout(function () { ta.focus(); }, 0);
    return w;
  }

  function tolka(text) {
    return text.split('\n').map(function (r) { return r.replace(/^\s*[-•*]\s*/, '').trim(); }).filter(Boolean);
  }

  DP.Dialog = { visa: visa, stang: stang, jamfor: jamfor, redigerare: redigerare, esc: esc };
})();
