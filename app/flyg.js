/*
 * Animering: små brickor flyger från en punkt till flera mål i en båge (som när ett
 * fönster minimeras i macOS) och anropar en funktion när varje bricka landar.
 */
(function () {
  'use strict';

  // fran: {x, y}, mal: [{x, y, klar?}], opts: {farg, text, ms, max}
  function flyg(fran, mal, opts) {
    opts = opts || {};
    var ms = opts.ms || 750;
    var max = opts.max || 40;
    var lista = mal.slice(0, max);
    var stagger = Math.min(40, 500 / Math.max(1, lista.length));
    lista.forEach(function (m, i) {
      var t = document.createElement('div');
      t.className = 'flygbricka';
      t.textContent = opts.text || '';
      t.style.background = opts.farg || '#22b45a';
      document.body.appendChild(t);
      var dx = m.x - fran.x, dy = m.y - fran.y;
      var lyft = -Math.min(160, 60 + Math.abs(dx) * 0.15);
      var anim = t.animate([
        { transform: 'translate(' + fran.x + 'px,' + fran.y + 'px) translate(-50%,-50%) scale(1)', opacity: 0.0 },
        { transform: 'translate(' + fran.x + 'px,' + fran.y + 'px) translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.08 },
        { transform: 'translate(' + (fran.x + dx * 0.5) + 'px,' + (fran.y + dy * 0.5 + lyft) + 'px) translate(-50%,-50%) scale(0.9)', opacity: 1, offset: 0.55 },
        { transform: 'translate(' + m.x + 'px,' + m.y + 'px) translate(-50%,-50%) scale(0.45)', opacity: 0.9 }
      ], { duration: ms, delay: i * stagger, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' });
      anim.onfinish = function () {
        t.remove();
        if (m.klar) { m.klar(); }
      };
    });
    return ms + lista.length * stagger;
  }

  function mitt(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function puls(el, klass) {
    if (!el) { return; }
    klass = klass || 'puls';
    el.classList.remove(klass);
    void el.offsetWidth;
    el.classList.add(klass);
    setTimeout(function () { el.classList.remove(klass); }, 1300);
  }

  window.DP = window.DP || {};
  window.DP.flyg = flyg;
  window.DP.mitt = mitt;
  window.DP.puls = puls;
})();
