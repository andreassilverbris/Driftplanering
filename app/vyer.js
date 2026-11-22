/*
 * Processlinjen: huvudstegen Byggnad → Planering → Balansering, och ordlistan.
 *
 * Processlinjen ersätter de gamla flikarna. Den säger i vilken ordning arbetet görs, och
 * visar hur långt planeringen har kommit ("3 av 4 byggnader klara"). Byggnad går alltid att
 * öppna och har ingen bock: det är orienteringen i byggnaden, inte ett steg som blir klart.
 *
 * Balansering tar 3D-vyns yta. Vyn döljs med CSS och byggs inte om, så kamera, valda
 * installationer och plan finns kvar när man går tillbaka. Telefonvyerna hör till en enskild
 * byggnad och visas därför inte heller i Balansering.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan;

  var HUVUDSTEG = [
    { id: 'byggnad', namn: 'Byggnad', under: 'förstå byggnaden' },
    { id: 'planering', namn: 'Planering', under: 'en byggnad i taget' },
    { id: 'balansering', namn: 'Balansering', under: 'alla byggnader för utförarnas skull' }
  ];

  var aktivt = 'planering';

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined && html !== null) { e.innerHTML = html; }
    return e;
  }

  // ------------------------------------------------------------------
  // Hur långt Planering har kommit: en byggnad är klar när alla sex stegen är klara
  // ------------------------------------------------------------------
  function klaraByggnader() {
    return P.byggnadsordning.filter(function (id) {
      var k = P.stegStatus(null, id);
      return Object.keys(k).every(function (n) { return k[n]; });
    });
  }
  function planeringSammanfattning() {
    return klaraByggnader().length + ' av ' + P.byggnadsordning.length + ' byggnader klara';
  }

  // ------------------------------------------------------------------
  // Processlinjen
  // ------------------------------------------------------------------
  var linje = $('#processlinje');

  function rita() {
    linje.innerHTML = '';
    HUVUDSTEG.forEach(function (h, i) {
      if (i) { linje.appendChild(el('span', 'pl-pil', '→')); }
      var k = el('button', 'pl-steg' + (h.id === aktivt ? ' aktiv' : ''));
      k.dataset.steg = h.id;
      k.appendChild(el('span', 'pl-namn', h.namn));
      var under = h.id === 'planering' ? planeringSammanfattning() : h.under;
      k.appendChild(el('span', 'pl-under', under));
      k.addEventListener('click', function () { visa(h.id); });
      linje.appendChild(k);
    });
  }

  function visa(id) {
    aktivt = id;
    HUVUDSTEG.forEach(function (h) {
      var sek = document.getElementById('hs-' + h.id);
      if (sek) { sek.hidden = h.id !== id; }
    });
    // 3D-vyn och telefonvyerna hör till en enskild byggnad. I Balansering döljs de, men
    // vyn byggs inte om: `hidden` på behållaren lämnar scenen, kameran och valet orörda.
    var iBalansering = id === 'balansering';
    document.body.classList.toggle('i-balansering', iBalansering);
    if (iBalansering) { ritaBalansering(); }
    rita();
  }

  // ------------------------------------------------------------------
  // Balanseringens skal
  //
  // Vyn är ännu bara en förklaring av vad som kommer. Den är med redan nu för att
  // processlinjen ska svara på frågan "vad gör jag sist?" innan uträkningen finns.
  // ------------------------------------------------------------------
  function ritaBalansering() {
    var sido = $('#balansering'), yta = $('#balansering-yta');
    if (!sido || !yta) { return; }

    sido.innerHTML = '';
    sido.appendChild(el('div', 'sammanfattning',
      '<b>Balansering</b> fördelar alla byggnaders rutintillfällen över årets veckor, så att ' +
      'varje utförare får en jämn belastning. Frekvenserna ändras aldrig – bara när i året ' +
      'tillfällena ligger.'));
    sido.appendChild(el('div', 'bal-status',
      'Frågorna och knappen Balansera hamnar här. Så länge vyn är ett skal står förklaringen av ' +
      'vad som kommer bredvid.'));

    yta.innerHTML = '';
    var skal = el('div', 'bal-skal');
    skal.appendChild(el('h2', null, 'Balansering'));
    skal.appendChild(el('p', 'bal-ingress',
      'Hittills har du planerat en byggnad i taget. Varje rond börjar då i vecka 1, så alla ' +
      'byggnaders månadsronder hamnar i samma veckor. Här ser du planeringen ur utförarnas ' +
      'perspektiv i stället, och fördelar tillfällena så att ingen får allt en vecka och inget ' +
      'veckorna efter.'));
    var kommer = el('div', 'bal-kommer');
    kommer.appendChild(el('h3', null, 'Så kommer det att gå till'));
    var ol = el('ol');
    [
      'Du svarar på tre frågor: vilka områden måste man åka till, hur många dagar i veckan varje utförare har för tillsyn och skötsel, och vilka veckor ingen tillsyn och skötsel görs.',
      'Du trycker på Balansera. Byggnadernas besöksrytmer förskjuts, och vid behov enskilda rondserier, tills belastningen är jämn.',
      'Tidsaxeln visar hela året med en rad per utförare, och hur full varje vecka är jämfört med utförarens kapacitet.',
      'Du justerar för hand genom att dra en bricka till en annan vecka, och svarar på om flytten gäller bara denna gång, hela rondserien eller hela byggnadens besöksrytm.'
    ].forEach(function (t) { ol.appendChild(el('li', null, t)); });
    kommer.appendChild(ol);
    skal.appendChild(kommer);
    skal.appendChild(el('div', 'bal-status',
      'Begreppen som dyker upp här – besöksrytm, rondserie, kapacitet, provisorisk flytt och ' +
      'stryka – finns förklarade i <b>Ordlistan</b>, som går att öppna utan att du lämnar det ' +
      'steg du står i.'));
    yta.appendChild(skal);
  }

  // ------------------------------------------------------------------
  // Ordlistan: öppnas i dialogrutan, så att man inte lämnar steget man står i
  // ------------------------------------------------------------------
  function oppnaOrdlista() {
    var nod = el('div', 'ordlista');
    DP.ordlista.forEach(function (g) {
      nod.appendChild(el('h4', 'ol-grupp', g.grupp));
      var dl = el('dl', 'begrepp');
      g.poster.forEach(function (p) {
        dl.appendChild(el('dt', null, p.ord));
        dl.appendChild(el('dd', null, p.text));
      });
      nod.appendChild(dl);
    });
    return DP.Dialog.visa({
      titel: 'Ordlista',
      nod: nod,
      bredd: 720,
      knappar: [{ text: 'Stäng', prim: true }]
    });
  }

  $('#ordlista-knapp').addEventListener('click', function () { oppnaOrdlista(); });

  // Processlinjens sammanfattning ändras när en byggnad blir klar, och när man byter byggnad
  function uppdatera() {
    rita();
    if (aktivt === 'balansering') { ritaBalansering(); }
  }
  P.prenumerera(uppdatera);
  P.prenumereraByte(uppdatera);

  DP.Vyer = { visa: visa, aktivt: function () { return aktivt; } };

  visa(aktivt);
})();
