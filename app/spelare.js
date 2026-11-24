/*
 * Mediaspelaren: ångra, gör om och vägen till vilket steg som helst i historiken.
 *
 * Den satt tidigare i Planeringens tidsaxel, och var därför dold i Byggnad när tidsaxeln
 * rullades undan och helt borta i Balansering. Nu har den en fast plats högst upp i
 * toppraden, gemensam för alla tre huvudsteg (beslut 82): planeraren backar och spolar fram
 * på samma ställe oavsett var i processen hen står. Balanseringen är ett enda steg i
 * historiken, så ◀ tar tillbaka hela – och den egna knappen *Ångra balanseringen*
 * (beslut 63) behövs inte längre när spelaren syns där löftet gäller.
 *
 * Historiken är gemensam för alla byggnader, så spelaren är det också: den ritas om av varje
 * ändring och av varje byggnadsbyte, men innehållet beror bara på historiken.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan;
  var rot = document.getElementById('spelare');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  function rita() {
    var h = P.historik();
    rot.innerHTML = '';
    function knapp(symbol, titel, aktiv, gor) {
      var k = el('button', 'sp-knapp', symbol);
      k.title = titel;
      k.disabled = !aktiv;
      k.addEventListener('click', function () { gor(k); });
      return k;
    }
    rot.appendChild(knapp('⏮', 'Till början', h.pos > 0, function (k) { P.gaTill(0, { historik: true, kalla: DP.mitt(k) }); }));
    rot.appendChild(knapp('◀', 'Ångra (Ctrl+Z)', h.pos > 0, function (k) { P.angra({ historik: true, kalla: DP.mitt(k) }); }));
    var txt = el('div', 'sp-text');
    var steg = h.pos === 0 ? 'Start' : h.lista[h.pos];
    txt.innerHTML = '<span class="sp-steg">Steg ' + h.pos + ' / ' + (h.lista.length - 1) + '</span>' + steg;
    txt.title = steg;
    rot.appendChild(txt);
    rot.appendChild(knapp('▶', 'Gör om (Ctrl+Y)', h.pos < h.lista.length - 1, function (k) { P.gorOm({ historik: true, kalla: DP.mitt(k) }); }));
    rot.appendChild(knapp('⏭', 'Till senaste', h.pos < h.lista.length - 1, function (k) { P.gaTill(h.lista.length - 1, { historik: true, kalla: DP.mitt(k) }); }));
  }

  // Tangentbordet gäller överallt och hör till spelaren, inte till någon vy
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); P.angra({ historik: true }); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); P.gorOm({ historik: true }); }
  });

  // Spelaren ritar sig själv ur historiken och behöver ingen ingång utifrån: varje ändring
  // och varje byggnadsbyte går redan genom prenumerationerna. Därför ingen export till DP.
  P.prenumerera(function () { rita(); });
  P.prenumereraByte(function () { rita(); });
  rita();
})();
