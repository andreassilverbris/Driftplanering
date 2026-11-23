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
  // En liten fyrkant i en byggnads färg – byggnadslistan, veckolistan och de utfällda raderna
  // pekar alla ut en byggnad på samma sätt
  function fargprick(farg) {
    var e = el('span', 'bal-farg', null);
    e.style.background = farg;
    return e;
  }
  // "1 vecka" / "4 veckor"
  function antalVeckorText(n) { return n + (n === 1 ? ' vecka' : ' veckor'); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined && html !== null) { e.innerHTML = html; }
    return e;
  }

  // ------------------------------------------------------------------
  // Hur långt Planering har kommit: en byggnad är klar när alla sex stegen är klara
  // ------------------------------------------------------------------
  // Reglerna ligger i planeringen, så att processlinjen och Balansering alltid är eniga om
  // vilka byggnader som är klara (beslut 39).
  function planeringSammanfattning() {
    return P.klaraByggnader().length + ' av ' + P.byggnadsordning.length + ' byggnader klara';
  }
  // Undertexten för Balansering säger var arbetet står: vilka frågor som är besvarade, och
  // om belastningen är jämnad ut. Övriga huvudsteg behåller sin beskrivning.
  function balanseringUnder(h) {
    if (h.id !== 'balansering') { return h.under; }
    var bst = P.balanseringStatus();
    if (bst.klar) {
      return bst.resultat.kvarstaende.length
        ? 'balanserad · överbelastning kvar'
        : 'balanserad · belastningen är jämn';
    }
    var svarade = (bst.omraden ? 1 : 0) + (bst.kapacitet ? 1 : 0) + (bst.veckorUtan ? 1 : 0);
    return svarade ? svarade + ' av 3 frågor besvarade' : h.under;
  }

  // ------------------------------------------------------------------
  // Processlinjen
  // ------------------------------------------------------------------
  var linje = $('#processlinje');

  function rita() {
    linje.innerHTML = '';
    HUVUDSTEG.forEach(function (h, i) {
      if (i) { linje.appendChild(el('span', 'pl-pil', '→')); }
      // Balansering får grön bock när den är gjord (beslut 37). Planering har ingen bock:
      // där säger undertexten hur många byggnader som är klara, och Byggnad är orientering
      // och inget steg som blir klart (beslut 42).
      var klar = h.id === 'balansering' && P.balanseringStatus().klar;
      var k = el('button', 'pl-steg' + (h.id === aktivt ? ' aktiv' : '') + (klar ? ' klar' : ''));
      k.dataset.steg = h.id;
      k.dataset.klar = klar ? 'ja' : 'nej';
      var namn = el('span', 'pl-namn', h.namn);
      if (klar) { namn.insertBefore(el('span', 'pl-bock', '✓'), namn.firstChild); }
      k.appendChild(namn);
      var under = h.id === 'planering' ? planeringSammanfattning() : balanseringUnder(h);
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
  // Balanseringens tidsaxel: en rad per utförare, en kolumn per vecka
  //
  // Tidsaxeln visar hela året ur utförarnas perspektiv (beslut 33), så att problemet syns
  // innan något balanseras. Cellen säger hur full veckan är jämfört med utförarens kapacitet,
  // och brickorna har byggnadens färg – raderna är redan utförare, så färgen får säga vilken
  // byggnad veckan består av (beslut 47).
  //
  // Bara byggnader där alla sex stegen i Planering är klara räknas med (beslut 39). De övriga
  // visas gråade med en länk till Planering för just den byggnaden, så att planeraren ser
  // varför de saknas och kommer dit med ett klick.
  // ------------------------------------------------------------------
  var MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var UTFORARRAD = 86;    // px per utförarrad – hög nog att läsa fyllnaden i, låg nog att fyra ryms
  var BYGGNADSRAD = 30;   // px per byggnadsrad när en utförare är utfälld
  var utfalld = {};     // utförar-id -> true när raden är fälld ut till en rad per byggnad
  var valdVecka = null; // { utforare, vecka } – veckan vars tillfällen visas i listan
  // Den senast uträknade belastningen. Dragningen behöver den för att säga hur full målveckan
  // blir, och hela vyn ritas om i ett svep varje gång något ändras – så den är alltid färsk.
  // Att tråda den genom fyra lager av ritfunktioner fram till varje bricka hade bara gjort
  // signaturerna otydligare utan att göra något säkrare.
  var senasteBelastning = null;

  function ritaBalansering() {
    var sido = $('#balansering'), yta = $('#balansering-yta');
    if (!sido || !yta) { return; }

    var underlag = P.balanseringsUnderlag();
    var bel = DP.Balansering.belastning(underlag);
    senasteBelastning = bel;

    ritaSidopanel(sido, underlag, bel);
    ritaYta(yta, underlag, bel);
  }

  // ---------------- Sidopanelen: vad Balansering är, och vilka byggnader som räknas ----------------
  function ritaSidopanel(sido, underlag, bel) {
    sido.innerHTML = '';
    sido.appendChild(el('div', 'sammanfattning',
      '<b>Balansering</b> fördelar alla byggnaders rutintillfällen över årets veckor, så att ' +
      'varje utförare får en jämn belastning. Frekvenserna ändras aldrig – bara när i året ' +
      'tillfällena ligger.'));

    // Byggnaderna: klara räknas med, övriga är gråade med en länk till Planering
    var klara = {};
    underlag.byggnader.forEach(function (b) { klara[b.id] = true; });
    var grupp = el('div', 'bal-grupp');
    grupp.appendChild(el('h3', null, 'Byggnader i balanseringen'));
    var lista = el('div', 'bal-byggnader');
    P.byggnadsordning.forEach(function (bid) {
      var b = DP.byggnader[bid], med = !!klara[bid];
      var rad = el('div', 'bal-byggnad' + (med ? '' : ' grad'));
      rad.dataset.byggnad = bid;
      rad.appendChild(fargprick(b.farg));
      var text = el('div', 'bal-bnamn');
      text.appendChild(el('span', 'bal-namn', b.namn));
      var omr = DP.omraden.filter(function (o) { return o.id === b.omrade; })[0];
      text.appendChild(el('span', 'bal-omrade', omr ? omr.namn : ''));
      // Byggnadens permanenta förskjutningar står med i listan, inte bara på den utfällda
      // raden i tidsaxeln: listan är där byggnaderna står oavsett om raden är utfälld.
      if (med) { text.appendChild(forskjutningsrad(bid)); }
      rad.appendChild(text);
      if (med) {
        rad.appendChild(el('span', 'bal-med', '✓ räknas med'));
      } else {
        // Länken tar planeraren till Planering för just den byggnaden (berättelse 26)
        var lank = el('button', 'bal-lank', 'Planera →');
        lank.title = 'Öppna Planering för ' + b.namn + ' – byggnaden räknas med när alla sex stegen är klara';
        lank.addEventListener('click', function () {
          P.vaxlaByggnad(bid);
          visa('planering');
        });
        rad.appendChild(lank);
      }
      lista.appendChild(rad);
    });
    grupp.appendChild(lista);

    var utan = P.byggnadsordning.filter(function (bid) { return !klara[bid]; });
    if (utan.length) {
      grupp.appendChild(el('div', 'bal-notis',
        utan.length + (utan.length === 1 ? ' byggnad är' : ' byggnader är') + ' inte klar' +
        (utan.length === 1 ? '' : 'a') + ' i alla sex stegen i Planering och räknas därför inte med. ' +
        'Du kan ge dem standardplanering direkt här, eller planera dem en i taget.'));
      // Snabbknapp för att öva: standardplanering åt alla som saknar planering, i ett steg (beslut 39)
      var rad = el('div', 'knapprad');
      var k = el('button', 'knapp sekundar liten-knapp', 'Standardplanering för alla');
      k.title = 'Ger standardplanering åt de ' + utan.length + ' byggnader som inte är klara. Ett enda ångra tar bort allt.';
      k.addEventListener('click', function () { standardForAlla(utan); });
      rad.appendChild(k);
      grupp.appendChild(rad);
    }
    sido.appendChild(grupp);

    // Frågorna och knappen Balansera. De står ovanför förklaringen av tidsaxeln: det är
    // arbetet i steget, och tidsaxeln är underlaget man arbetar mot.
    ritaFragor(sido, underlag);

    // Vad tidsaxeln visar, i klartext
    var f = el('div', 'bal-grupp');
    f.appendChild(el('h3', null, 'Så läser du tidsaxeln'));
    var ul = el('ul', 'bal-punkter');
    [
      'En <b>rad per utförare</b> och en <b>kolumn per vecka</b> för hela året.',
      'Cellen visar hur full veckan är jämfört med utförarens <b>kapacitet</b>, svaret på ' +
        'fråga 2 ovanför (' + DP.Balansering.KAPACITET_FORVAL + ' dagar i veckan är förvalt).',
      'En <b>röd</b> cell betyder att tiden inte räcker. En <b>ring</b> betyder fler än ' +
        DP.Balansering.MANGA_TILLFALLEN + ' rutintillfällen samma vecka – tiden kan räcka, men antalet är ändå en varning.',
      'Brickorna har <b>byggnadens färg</b>. Fäll ut en utförare för att se en rad per byggnad.',
      'En <b>streckad</b> vecka har ingen tillsyn och skötsel, svaret på fråga 3 ovanför.',
      'En bricka med <b>⤺</b> är <b>provisoriskt flyttad</b> dit, en med <b>✂</b> <b>föreslås ' +
        'strykas</b>, och en <b>ihålig</b> är <b>struken</b>.',
      'Klicka på en vecka för att se utförarens rutintillfällen med planerad tid.',
      '<b>Dra en bricka</b> till en annan vecka för att flytta tillfället för hand. Medan du ' +
        'drar står det hur full målveckan blir, och när du släpper frågar verktyget om flytten ' +
        'gäller <b>bara denna gång</b>, <b>hela rondserien</b> eller <b>hela besöksrytmen</b>.'
    ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    f.appendChild(ul);
    sido.appendChild(f);

    // Veckolistan: utförarens rutintillfällen i den valda veckan (berättelse 55)
    sido.appendChild(veckolista(bel));

    sido.appendChild(el('div', 'bal-status',
      'En <b>permanent</b> flytt – rondserien eller besöksrytmen – ändrar planeringen och syns ' +
      'som en förskjuten rytm i båda tidsaxlarna. En <b>provisorisk</b> flytt gäller bara i år ' +
      'och märks med <b>⤺</b>. Begreppen – besöksrytm, rondserie, kapacitet, provisorisk flytt ' +
      'och stryka – finns i <b>Ordlistan</b>.'));
  }

  // Förskjutningarna i klartext under byggnadens namn. Tom nod när inget är förskjutet, så
  // att listan inte växer av en flytt som inte gjorts.
  function forskjutningsrad(bid) {
    var fsk = P.forskjutningStatus(bid);
    var delar = [];
    if (fsk.byggnadText) { delar.push('⇥ ' + fsk.byggnadText); }
    fsk.ronder.filter(function (r) { return r.egen; }).forEach(function (r) {
      delar.push(P.rondNamn(r.rond) + ' ' + P.forskjutningMarke(r.egen));
    });
    var e = el('span', 'bal-fsk', delar.join(' · '));
    if (!delar.length) { e.hidden = true; }
    return e;
  }

  // Standardplanering åt alla byggnader som inte är klara, i ett enda historiksteg (beslut 39).
  // Ett enda ångra tar därför bort planeringen i alla byggnader som fick den, och eftersom
  // steget inte hör till någon byggnad byter ångra inte aktiv byggnad.
  function standardForAlla(utan) {
    var namn = utan.map(function (bid) { return DP.byggnader[bid].namn; });
    DP.Dialog.visa({
      titel: 'Standardplanering för alla',
      html: '<p>' + namn.join(', ') + ' får standardplanering för sin byggnadstyp: ronder, ' +
        'frekvenser, utförare, alla matchande åtgärder och godkända planerade tider.</p>' +
        '<p>Det är ett sätt att snabbt komma igång med att öva på balansering. Gå igenom ' +
        'stegen i Planering efteråt och justera det som inte passar.</p>' +
        '<div class="notis">Allt blir <b>ett</b> steg i historiken, så ett enda ångra tar bort det igen.</div>',
      bredd: 560,
      knappar: [
        { text: 'Skapa planering', prim: true, gor: function () {
          P.andraFlera('Standardplanering för ' + namn.join(', '), function (a) {
            utan.forEach(function (bid) { DP.Flode.skrivStandard(a.tillstand(bid), bid); });
          }, { standard: true });
        } },
        { text: 'Avbryt' }
      ]
    });
  }

  // ---------------- Balanseringens frågor och knappen Balansera ----------------
  //
  // Frågorna ser ut som Planeringens steg och beter sig likadant: ett kort med nummer eller
  // grön bock, en sammanfattning när det är stängt, och en kropp som öppnas när man klickar.
  // Alla tre har förval, så de går att klicka igenom med ett klick var när förvalen stämmer
  // (beslut 37).
  var oppenFraga = 0;   // 0 = ingen, 1 = områden, 2 = kapacitet, 3 = veckor utan tillsyn

  function ritaFragor(sido, underlag) {
    var bst = P.balanseringStatus();
    var grupp = el('div', 'bal-grupp');
    grupp.appendChild(el('h3', null, 'Svara på frågorna, balansera sedan'));

    fragekort(grupp, {
      n: 1, klar: bst.omraden,
      titel: 'Vilka områden måste man åka till?',
      sammanf: omradesSammanfattning(underlag),
      kropp: omradesKropp
    }, underlag);
    fragekort(grupp, {
      n: 2, klar: bst.kapacitet,
      titel: 'Hur många dagar i veckan har varje utförare?',
      sammanf: kapacitetSammanfattning(underlag),
      kropp: kapacitetKropp
    }, underlag);
    fragekort(grupp, {
      n: 3, klar: bst.veckorUtan,
      titel: 'Vilka veckor görs ingen tillsyn och skötsel?',
      sammanf: veckorUtanSammanfattning(underlag),
      kropp: veckorUtanKropp
    }, underlag);

    grupp.appendChild(balanseraKnapp(underlag, bst));
    sido.appendChild(grupp);
    if (bst.resultat) { sido.appendChild(resultatpanel(bst.resultat, bst)); }
  }

  function fragekort(grupp, f, underlag) {
    var oppen = oppenFraga === f.n;
    var kort = el('section', 'steg-kort bal-fraga' + (oppen ? ' oppen' : '') + (f.klar ? ' klar' : ''));
    kort.dataset.fraga = String(f.n);
    var h = el('header', 'steg-huvud');
    h.innerHTML = '<span class="steg-nr">' + (f.klar ? '✓' : f.n) + '</span><div class="steg-text">' +
      '<div class="steg-titel">' + f.titel + '</div>' +
      (!oppen ? '<div class="steg-sammanf">' + f.sammanf + '</div>' : '') + '</div>';
    h.addEventListener('click', function () { oppenFraga = oppen ? 0 : f.n; ritaBalansering(); });
    kort.appendChild(h);
    if (oppen) {
      var kropp = el('div', 'steg-kropp');
      f.kropp(kropp, underlag);
      kort.appendChild(kropp);
    }
    grupp.appendChild(kort);
  }

  // ---- Fråga 1: områden man åker till ----
  // Flygfältet är förvalt (beslut 28). Byggnaderna i varje område står under namnet, så att
  // planeraren ser vad svaret handlar om utan att gå tillbaka till byggnadslistan.
  function omradesSammanfattning(underlag) {
    var namn = underlag.akerTill.map(function (id) { return omradesNamn(id); });
    return namn.length ? 'Åker till: ' + namn.join(', ') : 'Inget område man åker till';
  }
  function omradesNamn(id) {
    var o = DP.omraden.filter(function (x) { return x.id === id; })[0];
    return o ? o.namn : id;
  }
  function omradesKropp(kropp, underlag) {
    kropp.appendChild(el('p', 'forklar', 'Ett <b>område man åker till</b> ligger en bit bort. Där samlas ' +
      'besöken i samma vecka så långt kapaciteten räcker, så att man slipper åka flera gånger. ' +
      'Inom övriga områden sprids byggnaderna i stället, för jämnare belastning.'));
    var valda = {};
    underlag.akerTill.forEach(function (id) { valda[id] = true; });
    var lista = el('div', 'bal-omradeslista');
    DP.omraden.forEach(function (o) {
      var rad = el('div', 'bal-omrade-rad' + (valda[o.id] ? ' pa' : ''));
      rad.dataset.omrade = o.id;
      var k = el('button', 'bal-kryss' + (valda[o.id] ? ' pa' : ''), valda[o.id] ? '✓' : '');
      k.title = valda[o.id] ? 'Man åker inte till ' + o.namn : 'Man åker till ' + o.namn;
      k.addEventListener('click', function () {
        var nya = DP.omraden.filter(function (x) {
          return x.id === o.id ? !valda[o.id] : !!valda[x.id];
        }).map(function (x) { return x.id; });
        P.sattAkerTill(nya);
      });
      rad.appendChild(k);
      var txt = el('div', 'bal-otext');
      txt.appendChild(el('span', 'bal-namn', o.namn));
      txt.appendChild(el('span', 'bal-omrade', o.beskrivning));
      // Byggnaderna i området, så att svaret går att se konsekvensen av
      var iOmradet = P.byggnadsordning.filter(function (bid) { return DP.byggnader[bid].omrade === o.id; });
      txt.appendChild(el('span', 'bal-obyggnader', iOmradet.map(function (bid) {
        return DP.byggnader[bid].namn;
      }).join(', ') || 'inga byggnader'));
      rad.appendChild(txt);
      lista.appendChild(rad);
    });
    kropp.appendChild(lista);
    kropp.appendChild(godkannRad('omraden', 'Förvalet stämmer →'));
  }

  // ---- Fråga 2: kapacitet per utförare ----
  // 3 dagar är förvalt för alla och kan ändras per person (beslut 31). Kapaciteten räknas i
  // tid, så siffran visas också i timmar – det är timmarna cellerna jämförs mot.
  function kapacitetSammanfattning(underlag) {
    var per = {};
    underlag.utforare.forEach(function (u) { (per[underlag.kapacitet[u.id]] = per[underlag.kapacitet[u.id]] || []).push(u.namn.split(' ')[0]); });
    var nycklar = Object.keys(per);
    if (nycklar.length === 1) { return 'Alla har ' + nycklar[0] + ' dagar i veckan'; }
    return nycklar.map(function (d) { return per[d].join(', ') + ': ' + d + ' d'; }).join(' · ');
  }
  function kapacitetKropp(kropp, underlag) {
    kropp.appendChild(el('p', 'forklar', 'Kapaciteten är den tid utföraren har för tillsyn och skötsel – ' +
      'resten av veckan går till annat. En dag räknas som ' + DP.Balansering.TIMMAR_PER_DAG + ' timmar, ' +
      'och en vecka är full när rutintillfällena når dit.'));
    var lista = el('div', 'bal-kaplista');
    underlag.utforare.forEach(function (u) {
      var dagar = underlag.kapacitet[u.id];
      var rad = el('div', 'bal-kaprad');
      rad.dataset.utforare = u.id;
      var av = el('span', 'avatar liten', u.namn[0]);
      av.style.background = u.farg;
      rad.appendChild(av);
      var txt = el('div', 'bal-ktext');
      txt.appendChild(el('span', 'bal-namn', u.namn));
      txt.appendChild(el('span', 'bal-omrade', dagar * DP.Balansering.TIMMAR_PER_DAG + ' h i veckan'));
      rad.appendChild(txt);
      var val = el('div', 'chiprad bal-dagar');
      [1, 2, 3, 4, 5].forEach(function (d) {
        var c = el('button', 'chip' + (d === dagar ? ' pa' : ''), String(d));
        c.dataset.dagar = String(d);
        c.title = u.namn + ' har ' + d + ' dag' + (d === 1 ? '' : 'ar') + ' i veckan (' +
          d * DP.Balansering.TIMMAR_PER_DAG + ' h)';
        c.addEventListener('click', function () { if (d !== dagar) { P.sattKapacitet(u.id, d); } });
        val.appendChild(c);
      });
      rad.appendChild(val);
      lista.appendChild(rad);
    });
    kropp.appendChild(lista);
    kropp.appendChild(godkannRad('kapacitet', 'Förvalet stämmer →'));
  }

  // ---- Fråga 3: veckor utan tillsyn och skötsel ----
  // Semesterveckorna och veckan mellan jul och nyår är förvalda (beslut 32). Svaret är en lista
  // veckor, och den visas som året i en rad klickbara veckor – det är så planeraren tänker på
  // semestern ("v. 28–31"), och ett intervall syns direkt medan en uppräkning måste läsas.
  function veckoIntervall(veckor) {
    if (!veckor.length) { return 'inga veckor'; }
    var delar = [], start = veckor[0], fore = veckor[0];
    veckor.slice(1).concat([null]).forEach(function (v) {
      if (v === fore + 1) { fore = v; return; }
      delar.push(start === fore ? String(start) : start + '–' + fore);
      start = v; fore = v;
    });
    return 'v. ' + delar.join(', ');
  }
  function veckorUtanSammanfattning(underlag) {
    var n = underlag.veckorUtan.length;
    return n ? veckoIntervall(underlag.veckorUtan) + ' (' + n + ' veckor)'
             : 'Tillsyn och skötsel alla veckor';
  }
  function veckorUtanKropp(kropp, underlag) {
    kropp.appendChild(el('p', 'forklar', 'Under semestern och mellan jul och nyår görs ingen tillsyn ' +
      'och skötsel. Ett rutintillfälle som hamnar i en sådan vecka flyttas <b>provisoriskt</b> till ' +
      'närmaste vecka före – planeringen är orörd, flytten gäller bara i år. Hamnar flytten högst ' +
      'en vecka från ett annat tillfälle i samma rondserie <b>föreslås</b> tillfället strykas i ' +
      'stället, och du bestämmer.'));
    var valda = {};
    underlag.veckorUtan.forEach(function (v) { valda[v] = true; });
    // Året som en rad veckor med månadsetiketter över: samma bild som tidsaxeln, så att
    // svaret och dess följd läses på samma ställe.
    var ar = el('div', 'bal-arrad');
    for (var v = 1; v <= P.ANTAL_VECKOR; v++) {
      (function (vecka) {
        var k = el('button', 'bal-veckoknapp' + (valda[vecka] ? ' pa' : ''), String(vecka));
        k.dataset.vecka = String(vecka);
        // Månadsskiftet markeras, annars är 52 rutor en oläslig rad
        if (vecka > 1 && P.manadForVecka(vecka) !== P.manadForVecka(vecka - 1)) { k.classList.add('manadsstart'); }
        k.title = valda[vecka]
          ? 'V. ' + vecka + ' har ingen tillsyn och skötsel – klicka för att ta tillbaka den'
          : 'V. ' + vecka + ' har tillsyn och skötsel – klicka för att korsa ut den';
        k.addEventListener('click', function () { P.vaxlaVeckaUtan(vecka); });
        ar.appendChild(k);
      })(v);
    }
    kropp.appendChild(ar);
    kropp.appendChild(el('div', 'bal-notis', 'De utkorsade veckorna är markerade i tidsaxeln. ' +
      'Varje klick är ett eget steg i historiken.'));
    kropp.appendChild(godkannRad('veckorUtan', 'Förvalet stämmer →'));
  }

  // Knappen som ger frågan grön bock utan att något tal ändras: förvalen är ett svar, och det
  // ska gå lika fort att bekräfta dem som att ändra dem (beslut 37).
  function godkannRad(fraga, text) {
    var rad = el('div', 'knapprad hoger');
    var k = el('button', 'knapp', text);
    k.dataset.godkann = fraga;
    k.title = 'Svaret stämmer – gå vidare';
    // Nästa obesvarade fråga öppnas av sig själv, så att de tre går att klicka igenom i en
    // följd. Är de alla besvarade stängs korten och Balansera står näst i tur.
    var NASTA = { omraden: 2, kapacitet: 3, veckorUtan: 0 };
    k.addEventListener('click', function () {
      P.godkannFraga(fraga);
      oppenFraga = NASTA[fraga] || 0;
      ritaBalansering();
    });
    rad.appendChild(k);
    return rad;
  }

  // ---- Knappen Balansera ----
  function balanseraKnapp(underlag, bst) {
    var w = el('div', 'bal-balansera');
    var rad = el('div', 'knapprad');
    var k = el('button', 'knapp primar', bst.balanserad ? 'Balansera om' : 'Balansera');
    k.id = 'balansera-knapp';
    if (!underlag.byggnader.length) {
      k.disabled = true;
      k.title = 'Ingen byggnad är klar i alla sex stegen i Planering, så det finns inget att balansera';
    } else {
      k.title = 'Förskjuter byggnadernas besöksrytmer så att belastningen blir jämnare. ' +
        'Frekvenser och utförare rörs aldrig. Allt blir ett steg i historiken.';
      k.addEventListener('click', function () { korBalansering(underlag); });
    }
    rad.appendChild(k);
    // Mediaspelaren hör till Planeringens tidsaxel och är dold här, men löftet att ett enda
    // ångra tar tillbaka hela balanseringen är tomt om vägen dit inte syns där man står.
    if (bst.balanserad) {
      var ang = el('button', 'knapp sekundar', 'Ångra balanseringen');
      ang.id = 'bal-angra';
      ang.title = 'Tar tillbaka alla förskjutningar på en gång (Ctrl+Z)';
      ang.addEventListener('click', function () { P.angra({ historik: true, kalla: DP.mitt(ang) }); });
      rad.appendChild(ang);
    }
    w.appendChild(rad);
    w.appendChild(el('div', 'bal-notis', underlag.byggnader.length
      ? 'Balanseringen förskjuter besöksrytmerna och vid behov enskilda rondserier. ' +
        'Den ändrar aldrig frekvenser, utförare eller kapacitet, och allt blir <b>ett</b> steg i ' +
        'historiken – ett enda ångra tar tillbaka hela balanseringen.'
      : 'Ge byggnaderna planering först: balanseringen räknar bara på byggnader som är klara i ' +
        'alla sex stegen.'));
    return w;
  }

  // Uträkningen görs i den fristående modulen, och resultatet skrivs till planeringen som ett
  // enda historiksteg (beslut 36). Själva animeringen sköts av lyssnaren längre ner: den
  // räknar ut vilka tillfällen som bytt vecka ur tillstånden, så ångra animerar flytten
  // tillbaka av sig själv.
  function korBalansering(underlag) {
    var resultat = DP.Balansering.balansera(underlag);
    P.tillampaBalansering(resultat);
  }

  // ---- Panelen med förklaringen i klartext (beslut 36 och 46) ----
  function resultatpanel(res, bst) {
    var w = el('div', 'bal-grupp bal-resultat');
    w.appendChild(el('h3', null, 'Så balanserades planeringen'));

    var f = res.forbattring;
    var sum = el('div', 'bal-vsum' + (f.overVeckorEfter ? ' over' : ''));
    sum.innerHTML = 'Högsta veckan gick från <b>' + DP.Balansering.timmarText(f.toppTimmarFore) +
      '</b> till <b>' + DP.Balansering.timmarText(f.toppTimmarEfter) + '</b>' +
      ', och veckorna över kapaciteten från <b>' + f.overVeckorFore + '</b> till <b>' +
      f.overVeckorEfter + '</b>.';
    w.appendChild(sum);

    var lista = el('div', 'bal-forklaring');
    res.forklaring.forEach(function (r) {
      var rad = el('div', 'bal-frad' + (r.typ === 'orord' ? ' orord' : '') +
        (r.typ === 'provisorisk' || r.typ === 'foreslagen-strykning' ? ' niva3' : ''));
      rad.dataset.typ = r.typ;
      if (r.byggnad && DP.byggnader[r.byggnad]) { rad.appendChild(fargprick(DP.byggnader[r.byggnad].farg)); }
      rad.appendChild(el('span', 'bal-ftext', r.text));
      lista.appendChild(rad);
    });
    w.appendChild(lista);

    // Förslagen att stryka: en lista att handla på, inte bara en upplysning (beslut 45).
    // Den räknas ur planeringen och inte ur det sparade resultatet, så att listan krymper när
    // planeraren behåller eller stryker enskilda tillfällen.
    var foreslagna = (bst && bst.foreslagna) || [];
    if (foreslagna.length) { w.appendChild(strykpanel(foreslagna)); }

    // Räcker kapaciteten inte sägs det rakt ut, med länkar dit man kan göra något åt det
    // (beslut 46): kapacitetsfrågan, eller utföraren i Planering steg 4.
    res.kvarstaende.forEach(function (k) {
      var v = el('div', 'bal-varning bal-kvar');
      v.dataset.utforare = k.utforare;
      v.appendChild(el('div', null, '<b>' + k.namn + '</b> har mer än hen hinner i ' +
        antalVeckorText(k.veckor.length) + ' (mest ' + DP.Balansering.timmarText(k.toppTimmar) +
        ' mot ' + DP.Balansering.timmarText(k.kapacitetTimmar) + '). Förskjutningar räcker inte: ' +
        'arbetet är mer än kapaciteten oavsett när det ligger.'));
      var lankar = el('div', 'lankrad bal-kvarlankar');
      var tillKap = el('button', 'lank bal-kaplank', 'Ändra kapaciteten →');
      tillKap.dataset.utforare = k.utforare;
      tillKap.title = 'Öppna frågan om hur många dagar i veckan ' + k.namn + ' har';
      tillKap.addEventListener('click', function () {
        oppenFraga = 2;
        ritaBalansering();
        var rad = document.querySelector('.bal-kaprad[data-utforare="' + k.utforare + '"]');
        if (rad) { rad.scrollIntoView({ block: 'nearest' }); DP.puls(rad); }
      });
      lankar.appendChild(tillKap);
      // Byggnaderna där utföraren har ronder – länken tar planeraren till steg 4 för den
      // byggnad överbelastningen faktiskt kommer ur, inte till en allmän lista.
      byggnaderForUtforare(k.utforare).forEach(function (bid) {
        var b = DP.byggnader[bid];
        var l = el('button', 'lank bal-steg4lank', 'Byt utförare i ' + b.namn + ' →');
        l.dataset.byggnad = bid;
        l.title = 'Öppna Planering steg 4 (Vem utför ronderna?) för ' + b.namn;
        l.addEventListener('click', function () {
          P.vaxlaByggnad(bid);
          DP.Flode.oppnaSteg(4);
          visa('planering');
        });
        lankar.appendChild(l);
      });
      v.appendChild(lankar);
      w.appendChild(v);
    });
    return w;
  }
  // De klara byggnader där utföraren har minst en rond
  function byggnaderForUtforare(utforareId) {
    return P.klaraByggnader().filter(function (bid) {
      return P.stateFor(bid).ronder.some(function (r) { return r.utforare === utforareId; });
    });
  }

  // ---- Förslagen att stryka: *Stryk alla*, och behåll enskilda (beslut 45) ----
  //
  // Förslaget är en fråga, inte ett beslut: tillfällena ligger kvar och räknas med i
  // belastningen tills planeraren svarar. *Stryk alla* är ett steg i historiken och *behåll*
  // ett eget, så att ett ja till alla går att ta tillbaka i ett svep medan ett enskilt
  // ställningstagande står för sig.
  function strykpanel(foreslagna) {
    var w = el('div', 'bal-stryk');
    w.appendChild(el('div', 'bal-strykrub',
      '<b>' + foreslagna.length + (foreslagna.length === 1 ? ' tillfälle' : ' tillfällen') +
      ' föreslås strykas.</b> Efter den provisoriska flytten ligger ' +
      (foreslagna.length === 1 ? 'det' : 'de') + ' högst ' +
      (DP.Balansering.NARA_VECKOR === 1 ? 'en vecka' : DP.Balansering.NARA_VECKOR + ' veckor') +
      ' från ett annat tillfälle i samma rondserie – arbetet skulle göras två gånger i rad.'));

    var rad = el('div', 'knapprad');
    var alla = el('button', 'knapp primar liten-knapp', 'Stryk alla ' + foreslagna.length);
    alla.id = 'stryk-alla';
    alla.title = 'Stryker alla föreslagna rutintillfällen i ett enda steg – ett ångra tar tillbaka dem';
    alla.addEventListener('click', function () { P.strykAllaForeslagna(); });
    rad.appendChild(alla);
    w.appendChild(rad);

    var lista = el('div', 'bal-stryklista');
    foreslagna.forEach(function (t) {
      var r = el('div', 'bal-strykrad');
      r.dataset.byggnad = t.byggnad;
      r.dataset.rond = t.rond;
      r.dataset.ordinarie = String(t.ordinarieVecka);
      r.appendChild(fargprick(DP.byggnader[t.byggnad].farg));
      var txt = el('div', 'bal-tnamn');
      txt.appendChild(el('span', 'bal-namn', t.byggnadNamn + ' · ' + t.rondNamn));
      txt.appendChild(el('span', 'bal-omrade', 'v. ' + t.ordinarieVecka + ' → v. ' + t.vecka +
        ' · ' + P.utforare(t.utforare).namn));
      r.appendChild(txt);
      var behall = el('button', 'lank bal-behall', 'Behåll');
      behall.title = 'Behåll ' + t.namn + ' där det ligger – förslaget tas bort, flytten står kvar';
      behall.addEventListener('click', function () {
        P.behallTillfalle(t.byggnad, t.rond, t.ordinarieVecka);
      });
      r.appendChild(behall);
      lista.appendChild(r);
    });
    w.appendChild(lista);
    return w;
  }

  // ------------------------------------------------------------------
  // Flytt för hand: dra en bricka till en annan vecka (beslut 34)
  //
  // Dragningen är byggd på musens egna händelser och inte på HTML5:s drag-and-drop. Skälet är
  // beskedet som ska synas *under* dragningen: hur full målveckan blir om brickan släpps där
  // (berättelse 59). HTML5-dragningen äger pekaren och ger ingen pålitlig plats att rita det på,
  // och den går inte att följa i ett test på samma sätt som en musrörelse.
  //
  // Brickan ligger kvar där den ligger medan man drar – det dragna är en kopia som följer
  // pekaren. Så ser planeraren hela tiden varifrån tillfället kommer, och ett avbrutet drag
  // behöver inte lägga tillbaka något.
  // ------------------------------------------------------------------
  var DRAG_TROSKEL = 4;   // px innan ett tryck räknas som ett drag och inte som ett klick
  var drag = null;        // { tillfalle, utforare, kopia, mal, startX, startY, igang }
  // Det senaste valet är förvalt nästa gång (berättelse 61). Det lever i vyn och inte i
  // planeringen: det är en vana hos den som arbetar, inte en uppgift om byggnaden, och ska
  // därför inte följa med i historiken eller ångras.
  var senasteValet = 'tillfalle';

  // Brickan blir dragbar. Tillfället kommer ur belastningens cell och bär allt som behövs:
  // byggnad, rond, ordinarie vecka och planerad tid – den sista för beskedet om målveckan.
  // Belastningen läses ur `senasteBelastning` när den behövs och trådas inte hit: den gäller
  // hela vyn, och en kopia per bricka hade bara kunnat bli gammal.
  function gorDragbar(d, t, utforareId) {
    if (t.struken) { return; }   // ett struket tillfälle ligger inte någonstans att flytta ifrån
    d.classList.add('dragbar');
    d.addEventListener('mousedown', function (e) {
      if (e.button !== 0) { return; }
      e.preventDefault();
      e.stopPropagation();
      drag = {
        tillfalle: t, utforare: utforareId,
        startX: e.clientX, startY: e.clientY, igang: false, kopia: null
      };
    });
  }

  window.addEventListener('mousemove', function (e) {
    if (!drag) { return; }
    if (!drag.igang) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_TROSKEL
        && Math.abs(e.clientY - drag.startY) < DRAG_TROSKEL) { return; }
      drag.igang = true;
      drag.kopia = dragkopia(drag.tillfalle);
      document.body.classList.add('drar-bricka');
    }
    drag.kopia.style.left = e.clientX + 'px';
    drag.kopia.style.top = e.clientY + 'px';
    siktaPa(malVeckaUnder(e.clientX, e.clientY, drag.utforare));
  });

  window.addEventListener('mouseup', function (e) {
    if (!drag) { return; }
    var d = drag;
    drag = null;
    document.body.classList.remove('drar-bricka');
    if (d.kopia) { d.kopia.remove(); }
    if (!d.igang) { return; }   // ett tryck utan rörelse är ett klick på cellen, inte ett drag
    var mal = malVeckaUnder(e.clientX, e.clientY, d.utforare);
    siktaPa(null);
    if (mal === null || mal === d.tillfalle.vecka) { return; }
    fragaOmFlytt(d.tillfalle, mal, d.utforare);
  });

  function dragkopia(t) {
    var k = el('div', 'bt-dragkopia');
    var b = el('span', 'bt-bricka', null);
    b.style.background = t.farg;
    k.appendChild(b);
    k.appendChild(el('span', 'bt-dragnamn', t.byggnadNamn + ' · ' + t.rondNamn));
    document.body.appendChild(k);
    return k;
  }

  // Veckan under pekaren, eller null utanför **den dragna utförarens** rader. Cellen bär både
  // vecka och utförare i sin data, så uppslagningen behöver inte veta något om rutnätets
  // geometri – men den måste se vems rad det är: balanseringen byter aldrig utförare
  // (beslut 46), och ett släpp på en annan utförares rad är därför inget mål. Hade bara
  // veckan lästs hade tillfället flyttats dit utan att vare sig sikte eller besked visats
  // under dragningen – planeraren hade fått ett resultat hen inte sett komma.
  // Utföraren är en parameter och inte en läsning av `drag`: släppet nollställer `drag` innan
  // målet slås upp, så en uppslagning som litade på den globala hade släppt igenom vilken rad
  // som helst – och just släppet är tillfället då en flytt faktiskt blir av.
  function malVeckaUnder(x, y, utforareId) {
    var nod = document.elementFromPoint(x, y);
    while (nod && nod !== document.body) {
      if (nod.classList && nod.classList.contains('bt-cell') && nod.dataset.vecka) {
        return nod.dataset.utforare === utforareId ? Number(nod.dataset.vecka) : null;
      }
      nod = nod.parentNode;
    }
    return null;
  }

  // Beskedet under dragningen: målveckan markeras, och en etikett säger hur full den blir om
  // brickan släpps där (berättelse 59). Det är hela skälet att dragningen är byggd för hand –
  // en planerare ska slippa släppa först och ångra sedan.
  function siktaPa(vecka) {
    var tidigare = document.querySelectorAll('.bt-cell.siktad');
    for (var i = 0; i < tidigare.length; i++) { tidigare[i].classList.remove('siktad'); }
    var etikett = $('#dragbesked');
    if (!drag || vecka === null) { if (etikett) { etikett.remove(); } return; }
    var cell = balCell(drag.utforare, vecka);
    if (!cell) { if (etikett) { etikett.remove(); } return; }
    cell.classList.add('siktad');
    if (!etikett) {
      etikett = el('div', 'bt-dragbesked');
      etikett.id = 'dragbesked';
      document.body.appendChild(etikett);
    }
    etikett.innerHTML = dragbesked(drag, vecka);
    var r = cell.getBoundingClientRect();
    etikett.style.left = Math.max(8, Math.min(window.innerWidth - 260, r.left + r.width / 2 - 125)) + 'px';
    etikett.style.top = Math.max(8, r.top - etikett.offsetHeight - 8) + 'px';
  }

  // Hur full målveckan blir: veckans nuvarande tid plus tillfällets, mot kapaciteten.
  // Ingen avräkning behövs – målveckan är en annan än den brickan ligger i, så tillfällets
  // tid finns ännu inte i cellen. Siktet släpper bara mål på utförarens egen rad, så raden
  // är alltid den dragnas.
  function dragbesked(d, vecka) {
    var rad = senasteBelastning && senasteBelastning.rad(d.utforare);
    var cell = rad && rad.veckor[vecka];
    if (!cell) { return 'V. ' + vecka; }
    var timmar = cell.timmar + d.tillfalle.timmar;
    var antal = cell.antal + 1;
    var kap = cell.kapacitetTimmar;
    var over = timmar > kap;
    return '<b>V. ' + vecka + '</b> blir <b class="' + (over ? 'bt-dbover' : '') + '">' +
      DP.Balansering.timmarText(timmar) + ' av ' + DP.Balansering.timmarText(kap) + '</b> · ' +
      antal + (antal === 1 ? ' tillfälle' : ' tillfällen') +
      (over ? ' <span class="bt-dbover">över kapaciteten</span>' : '') +
      (cell.utanTillsyn ? ' <span class="bt-dbmjuk">vecka utan tillsyn och skötsel</span>' : '');
  }

  // ---------------- Frågan när brickan släpps (berättelse 60 och 61) ----------------
  //
  // De tre svaren är de tre nivåerna i beslut 26, och dialogen säger för varje vad den
  // *landar i*: vilka veckor rytmen hamnar i, och hur många tillfällen valet rör. Skillnaden
  // mellan "bara denna gång" och "hela rondserien" är den svåraste i hela balanseringen, och
  // den ska gå att se i svaret innan man väljer – inte upptäckas i tidsaxeln efteråt.
  function fragaOmFlytt(t, mal, utforareId) {
    var alt = P.flyttAlternativ(t.byggnad, t.rond, t.ordinarieVecka, mal);
    if (!alt) { return; }
    var nod = el('div', 'flyttfraga');
    nod.appendChild(el('div', 'ff-topp', '<b>' + t.byggnadNamn + ' · ' + t.rondNamn + '</b>' +
      '<span>' + (t.provisorisk
        ? 'ligger i v. ' + t.vecka + ', ordinarie v. ' + t.ordinarieVecka
        : 'ligger i v. ' + t.vecka) + ' · släppt i <b>v. ' + mal + '</b></span>'));

    var valt = { id: null };
    var kort = [];
    VALEN.forEach(function (v) {
      var data = alt[v.id];
      var k = el('button', 'ff-val' + (data.tillaten ? '' : ' av'));
      k.dataset.val = v.id;
      k.appendChild(el('span', 'ff-rubrik', v.rubrik));
      k.appendChild(el('span', 'ff-under', v.under));
      k.appendChild(el('span', 'ff-utfall', v.utfall(alt, data, t)));
      k.disabled = !data.tillaten;
      k.addEventListener('click', function () { valj(v.id); });
      kort.push(k);
      nod.appendChild(k);
    });
    function valj(id) {
      valt.id = id;
      kort.forEach(function (k) { k.classList.toggle('vald', k.dataset.val === id); });
    }
    // Det senaste valet är förvalt, så att flera flyttar i rad går fort (berättelse 61). Är
    // det valet avstängt just nu faller förvalet tillbaka på "bara denna gång", som alltid går.
    valj(alt[senasteValet] && alt[senasteValet].tillaten ? senasteValet : 'tillfalle');

    if (alt.sparr === 'startmanad') {
      nod.appendChild(el('div', 'ff-sparr',
        'Ronden går <b>varje halvår med vald startmånad</b>, och en halvårsrond får bara ' +
        'förskjutas inom sin månad (beslut 41). V. ' + mal + ' ligger i en annan månad än ' +
        'v. ' + alt.ordinarieVecka + ', så de permanenta valen är inte möjliga här. ' +
        'Den provisoriska flytten går: den ändrar ingen planering, bara var tillfället ligger i år.'));
    }

    DP.Dialog.visa({
      titel: 'Vad ska flytten gälla?',
      nod: nod,
      bredd: 600,
      knappar: [
        { text: 'Flytta', prim: true, gor: function () { utforFlytt(alt, valt.id); } },
        { text: 'Avbryt' }
      ]
    });
  }
  // De tre valen och vad de landar i. `utfall` är texten som säger vad valet faktiskt gör –
  // den räknas ur alternativen och inte ur gissningar om frekvensen.
  var VALEN = [
    {
      id: 'tillfalle', rubrik: 'Bara denna gång', under: 'provisorisk flytt · planeringen rörs inte',
      utfall: function (alt, data, t) {
        return 'Tillfället ligger i <b>v. ' + alt.malVecka + '</b> i år. Ordinarie vecka är ' +
          'fortfarande v. ' + alt.ordinarieVecka + ', så nästa år ligger det där igen.';
      }
    },
    {
      id: 'rondserie', rubrik: 'Hela rondserien', under: 'permanent · förskjuter den här ronden',
      utfall: function (alt, data) { return permanentUtfall(alt, data, 'Rondserien'); }
    },
    {
      id: 'besoksrytm', rubrik: 'Hela byggnadens besöksrytm', under: 'permanent · förskjuter alla ronder',
      utfall: function (alt, data) {
        return permanentUtfall(alt, data, 'Alla ' + data.antalRonder + ' rondserierna') +
          ' Byggnaden fortsätter att besökas samlat.';
      }
    }
  ];
  // Vad en permanent flytt landar i. Det viktiga – och det som annars överraskar – är att
  // förskjutningen räknas modulo intervallet (beslut 56): drar man längre än intervallet
  // ligger rytmen likadant som ett kortare drag. Då hamnar inte det dragna tillfället i
  // målveckan, och det ska stå här och inte upptäckas i tidsaxeln efteråt.
  function permanentUtfall(alt, data, vad) {
    if (!data.tillaten) { return 'Inte möjligt för den här ronden – se förklaringen nedan.'; }
    if (data.delta === 0) { return vad + ' ligger redan så.'; }
    var t = vad + ' flyttas <b>' + antalVeckorText(Math.abs(data.delta)) + ' ' +
      (data.delta < 0 ? 'bakåt' : 'framåt') + '</b> till v. ' + veckorKort(data.veckor) + '.';
    if (!data.traffar && data.nyVecka !== null) {
      t += ' Det dragna tillfället hamnar i <b>v. ' + data.nyVecka + '</b> och inte i v. ' +
        alt.malVecka + ': frekvensen står still, så rytmen räknas i hela intervall – ' +
        'det är ett annat tillfälle i serien som hamnar i v. ' + alt.malVecka + '.';
    }
    return t;
  }
  // "3, 16, 29 och 42" eller "13 veckor från v. 3" – en uppräkning som inte svämmar över
  function veckorKort(veckor) {
    if (!veckor.length) { return '–' }
    if (veckor.length <= 5) {
      return veckor.length === 1 ? String(veckor[0])
        : veckor.slice(0, -1).join(', ') + ' och ' + veckor[veckor.length - 1];
    }
    return veckor[0] + ', ' + veckor[1] + ', ' + veckor[2] + ' … ' + veckor[veckor.length - 1];
  }
  function utforFlytt(alt, valId) {
    senasteValet = valId;
    if (valId === 'rondserie') { P.flyttaRondserie(alt.byggnad, alt.rond, alt.ordinarieVecka, alt.malVecka); }
    else if (valId === 'besoksrytm') { P.flyttaBesoksrytm(alt.byggnad, alt.rond, alt.ordinarieVecka, alt.malVecka); }
    else { P.flyttaTillfalle(alt.byggnad, alt.rond, alt.ordinarieVecka, alt.malVecka); }
  }

  // ------------------------------------------------------------------
  // Animering: brickorna flyger till sina nya veckor
  //
  // Skillnaden kommer färdigräknad i `info.flyttade` (byggnad -> tillfällen som bytt vecka).
  // Den räknas i planeringen ur tillstånden före och efter, så ångra och gör om animerar
  // flytten tillbaka av sig själva (beslut 36 och 69).
  //
  // Målet är cellen för rondens utförare och den nya veckan. Veckokolumnerna står still när
  // tidsaxeln ritas om, så den gamla cellen finns kvar på sin plats – tom.
  // ------------------------------------------------------------------
  var ANIM_TAK = 40;   // fler brickor än så säger inget mer, och gör bilden rörig

  function animeraFlyttade(flyttade) {
    if (!flyttade || aktivt !== 'balansering') { return; }
    var bidar = Object.keys(flyttade);
    if (!bidar.length) { return; }
    var kvar = ANIM_TAK;
    bidar.forEach(function (bid) {
      var s = P.stateFor(bid);
      flyttade[bid].forEach(function (f) {
        if (kvar <= 0) { return; }
        var rond = s.ronder.filter(function (r) { return r.id === f.rond; })[0];
        if (!rond) { return; }
        var fran = balCell(rond.utforare, f.fran), till = balCell(rond.utforare, f.till);
        if (!fran || !till) { return; }
        kvar--;
        var m = DP.mitt(till);
        m.klar = function () { DP.puls(till); };
        DP.flyg(DP.mitt(fran), [m], { text: '→', farg: DP.byggnader[bid].farg });
      });
    });
  }
  // Utförarens cell för en vecka. De utfällda byggnadsradernas celler bär samma utförare och
  // vecka i sin data, så uppslagningen måste utesluta dem (`bt-ucell`) – annars hade den
  // ibland svarat med en byggnadsrad, och både animeringen och dragningens sikte hade pekat
  // på en annan rad än den som bär belastningen.
  function balCell(utforareId, vecka) {
    return document.querySelector('.bt-cell:not(.bt-ucell)[data-utforare="' + utforareId +
      '"][data-vecka="' + vecka + '"]');
  }

  // ---------------- Veckolistan: "5 av 6" och tillfällena med planerad tid ----------------
  function veckolista(bel) {
    var w = el('div', 'bal-grupp bal-veckolista');
    if (!valdVecka) {
      w.appendChild(el('h3', null, 'Veckans rutintillfällen'));
      w.appendChild(el('div', 'bal-notis', 'Klicka på en vecka i tidsaxeln för att se vilka ' +
        'rutintillfällen som ligger där, med planerad tid.'));
      return w;
    }
    var rad = bel.rad(valdVecka.utforare);
    if (!rad) { valdVecka = null; return veckolista(bel); }
    var cell = rad.veckor[valdVecka.vecka];
    w.appendChild(el('h3', null, rad.namn + ' · v. ' + valdVecka.vecka));
    var sum = el('div', 'bal-vsum' + (cell.over ? ' over' : '') + (cell.manga ? ' manga' : ''));
    sum.innerHTML = '<b>' + cell.antal + ' av ' + DP.Balansering.MANGA_TILLFALLEN + '</b> rutintillfällen · ' +
      DP.Balansering.timmarText(cell.timmar) + ' av ' + DP.Balansering.timmarText(cell.kapacitetTimmar) +
      ' (' + cell.kapacitetDagar + ' dagar)';
    w.appendChild(sum);
    if (cell.over) {
      w.appendChild(el('div', 'bal-varning', 'Tiden räcker inte: veckan är ' +
        DP.Balansering.timmarText(cell.timmar - cell.kapacitetTimmar) + ' över kapaciteten.'));
    }
    if (cell.manga) {
      w.appendChild(el('div', 'bal-varning mjuk', 'Fler än ' + DP.Balansering.MANGA_TILLFALLEN +
        ' rutintillfällen samma vecka. Tiden kan räcka, men många små saker på en vecka är ändå mycket.'));
    }
    if (cell.utanTillsyn) {
      w.appendChild(el('div', 'bal-varning mjuk', 'Veckan är markerad som vecka utan tillsyn och skötsel.'));
    }
    // Listan säger för varje tillfälle ordinarie vecka, faktisk vecka och om det är
    // provisoriskt flyttat, föreslaget eller struket (biljett #16). De strukna hör med: de
    // belastar inte veckan, men de hör till vad planeraren bestämt om den.
    var struknaHar = struknaPerCell()[valdVecka.utforare + ':' + valdVecka.vecka] || [];
    if (!cell.antal && !struknaHar.length) {
      w.appendChild(el('div', 'bal-notis', 'Inga rutintillfällen den här veckan.'));
      return w;
    }
    var ul = el('div', 'bal-tillfallen');
    cell.tillfallen.concat(struknaHar).forEach(function (t) {
      var r = el('div', 'bal-tillfalle' + (t.provisorisk ? ' provisorisk' : '') +
        (t.foreslagen ? ' foreslagen' : '') + (t.struken ? ' struken' : ''));
      r.dataset.byggnad = t.byggnad;
      r.dataset.rond = t.rond;
      r.dataset.ordinarie = String(t.ordinarieVecka);
      r.appendChild(fargprick(t.farg));
      var txt = el('div', 'bal-tnamn');
      txt.appendChild(el('span', 'bal-namn', t.byggnadNamn + ' · ' + t.rondNamn));
      txt.appendChild(el('span', 'bal-omrade', t.namn || ''));
      // Veckoraden: ordinarie och faktisk vecka, så att flytten går att läsa i en rad
      var veckor = t.provisorisk
        ? '⤺ v. ' + t.ordinarieVecka + ' → v. ' + t.vecka + ' (provisoriskt flyttat)'
        : 'v. ' + t.vecka + ' (ordinarie)';
      if (t.foreslagen) { veckor += ' · ✂ föreslås strykas'; }
      if (t.struken) { veckor += ' · ✂ struket'; }
      txt.appendChild(el('span', 'bal-veckorad', veckor));
      r.appendChild(txt);
      // Ett struket tillfälle har ingen planerad tid att visa – det belastar ingen vecka.
      r.appendChild(el('span', 'bal-tid', t.struken ? 'struket' : dagsdelText(t)));
      // Stryka för hand, och vägen tillbaka (berättelse 62). Knappen ligger i veckolistan och
      // inte på brickan: en bricka är 11 px och ska bära dragningen, och strykningen är ett
      // beslut om ett namngivet tillfälle – det hör i listan där tillfället står med namn,
      // vecka och planerad tid, så att planeraren ser vad hen tar bort.
      var k = el('button', 'knapp sekundar liten-knapp bal-strykknapp',
        t.struken ? 'Återställ' : '✂ Stryk');
      k.title = t.struken
        ? 'Lägg tillbaka ' + (t.namn || 'tillfället') + ' i v. ' + t.vecka
        : 'Stryk ' + (t.namn || 'tillfället') + ' – det ska inte göras i år';
      k.addEventListener('click', function (e) {
        e.stopPropagation();
        if (t.struken) { P.aterstallStruket(t.byggnad, t.rond, t.ordinarieVecka); }
        else { P.strykTillfalle(t.byggnad, t.rond, t.ordinarieVecka); }
      });
      r.appendChild(k);
      ul.appendChild(r);
    });
    w.appendChild(ul);
    return w;
  }
  function dagsdelText(t) {
    var d = t.dagsdel ? DP.tidsschablon.dagsdel(t.dagsdel) : null;
    return (d ? d.namn + ' · ' : '') + DP.Balansering.timmarText(t.timmar);
  }

  // ---------------- Ytan: tidsaxeln ----------------
  function ritaYta(yta, underlag, bel) {
    yta.innerHTML = '';
    var w = el('div', 'bal-tidsaxel');

    var huvud = el('div', 'bt-huvud');
    var rub = el('div', 'bt-rubrik');
    rub.innerHTML = '<b>Belastning per utförare ' + P.AR + '</b> <span>hela året, en rad per utförare · ' +
      'brickorna har byggnadens färg</span>';
    huvud.appendChild(rub);
    huvud.appendChild(forklaringsrad(underlag));
    w.appendChild(huvud);

    if (!underlag.byggnader.length) {
      w.appendChild(el('div', 'bt-tom',
        'Ingen byggnad är klar i alla sex stegen i Planering, så det finns ingen belastning att ' +
        'visa än. Ge byggnaderna standardplanering här intill, eller planera dem en i taget.'));
      yta.appendChild(w);
      return;
    }

    var n = bel.antalVeckor;
    var grid = el('div', 'bt-grid');
    grid.style.gridTemplateColumns = '210px repeat(' + n + ', minmax(0, 1fr))';
    // Radhöjderna sätts här och inte i CSS, eftersom antalet rader beror på vilka utförare
    // som är utfällda. Utförarraderna har en **fast** höjd (beslut 58): lät man dem dela på
    // hela ytan blev cellerna så höga att fyllnaden mot kapaciteten inte gick att läsa.
    // Mallen räknas ut i samma ordning som raderna ritas – en utförarrad, följd av
    // eventuella byggnadsrader i lägre höjd.
    var rader = ['24px', '22px'];
    bel.rader.forEach(function (rad) {
      rader.push(UTFORARRAD + 'px');
      if (!utfalld[rad.utforare]) { return; }
      var antalByggnader = Math.max(1, byggnaderFor(underlag, rad.utforare).length);
      for (var i = 0; i < antalByggnader; i++) { rader.push(BYGGNADSRAD + 'px'); }
    });
    grid.style.gridTemplateRows = rader.join(' ');

    // Månadsrad
    grid.appendChild(el('div', 'bt-etikett bt-man-etikett', ''));
    var v = 1;
    while (v <= n) {
      var m = P.manadForVecka(v), span = 0;
      while (v + span <= n && P.manadForVecka(v + span) === m) { span++; }
      var mc = el('div', 'bt-manad', MAN_KORT[m]);
      mc.style.gridColumn = 'span ' + span;
      grid.appendChild(mc);
      v += span;
    }
    // Veckorad
    grid.appendChild(el('div', 'bt-etikett bt-vecka-etikett', 'Vecka'));
    for (v = 1; v <= n; v++) {
      var vc = el('div', 'bt-vecka' + (bel.veckorUtan.indexOf(v) >= 0 ? ' utan' : ''), String(v));
      grid.appendChild(vc);
    }

    var strukna = struknaPerCell();
    bel.rader.forEach(function (rad) { ritaRad(grid, rad, n, underlag, strukna); });
    w.appendChild(grid);
    w.appendChild(fot(bel));
    yta.appendChild(w);
  }

  // Foten under tidsaxeln: vad bilden säger, i klartext. Problemet ska gå att se innan något
  // balanseras (berättelse 50–52), och en tidsaxel full av färger säger inte av sig själv
  // vad som är fel – den som är ny i verktyget behöver läsa slutsatsen.
  function fot(bel) {
    var w = el('div', 'bt-fot');
    var over = bel.rader.filter(function (r) { return r.over.length; });
    var manga = bel.rader.filter(function (r) { return r.manga.length; });
    var h = el('div', 'bt-fot-text');
    // Foten säger olika saker före och efter en balansering. Att efteråt fortfarande kalla
    // det "problemet balanseringen ska lösa" hade varit fel: balanseringen *är* gjord, och
    // det som står kvar är kvarstående överbelastning som förskjutningar inte rår på (beslut 46).
    var balanserad = P.balanseringStatus().klar;
    if (over.length || manga.length) {
      var delar = [];
      over.forEach(function (r) {
        delar.push('<b>' + r.namn + '</b> har mer än hen hinner i ' + veckorText(r.over) +
          ' (mest ' + DP.Balansering.timmarText(r.toppTimmar) + ' mot ' +
          DP.Balansering.timmarText(r.kapacitetTimmar) + ')');
      });
      manga.forEach(function (r) {
        if (over.indexOf(r) >= 0) { return; }
        delar.push('<b>' + r.namn + '</b> har fler än ' + DP.Balansering.MANGA_TILLFALLEN +
          ' rutintillfällen i ' + veckorText(r.manga));
      });
      h.innerHTML = balanserad
        ? '<span class="bt-fot-rub">Det här står kvar efter balanseringen:</span> ' +
          delar.join('. ') + '. Förskjutningar räcker inte längre – arbetet är mer än ' +
          'kapaciteten oavsett när det ligger. Förklaringen här intill länkar till ' +
          'kapacitetsfrågan och till vem som utför ronderna.'
        : '<span class="bt-fot-rub">Det här är problemet balanseringen ska lösa:</span> ' +
          delar.join('. ') + '. Samtidigt står veckorna emellan tomma. ' +
          'Balanseringen förskjuter byggnadernas besöksrytmer så att belastningen jämnas ut – ' +
          'utan att någon frekvens ändras.';
    } else {
      h.innerHTML = balanserad
        ? '<span class="bt-fot-rub">Balanseringen gick jämnt ut.</span> ' +
          'Ingen utförare är över sin kapacitet någon vecka, och ingen har fler än ' +
          DP.Balansering.MANGA_TILLFALLEN + ' rutintillfällen samma vecka. ' +
          'Frekvenserna är desamma som före – bara när i året tillfällena ligger har ändrats.'
        : '<span class="bt-fot-rub">Ingen utförare är över sin kapacitet.</span> ' +
          'Tiden räcker varje vecka, och ingen har fler än ' + DP.Balansering.MANGA_TILLFALLEN +
          ' rutintillfällen samma vecka. Belastningen kan ändå vara ojämn: titta på hur ' +
          'brickorna klumpar ihop sig i vissa veckor medan andra står tomma.';
    }
    w.appendChild(h);
    return w;
  }
  // "v. 1", "v. 1 och 14" eller "4 veckor" – en uppräkning som inte blir oläslig lång
  function veckorText(veckor) {
    if (veckor.length === 1) { return 'v. ' + veckor[0]; }
    if (veckor.length <= 4) {
      return 'v. ' + veckor.slice(0, -1).join(', ') + ' och ' + veckor[veckor.length - 1];
    }
    return veckor.length + ' veckor';
  }

  // Förklaringen av färgskalan, så att cellerna går att läsa utan att gissa
  function forklaringsrad(underlag) {
    var w = el('div', 'bt-forklaring');
    [
      ['bt-prov lagom', 'inom kapaciteten'],
      ['bt-prov nara', 'nästan full'],
      ['bt-prov over', 'över kapaciteten'],
      ['bt-prov manga', 'fler än ' + DP.Balansering.MANGA_TILLFALLEN + ' tillfällen']
    ].forEach(function (p) {
      var d = el('span', 'bt-fpost');
      d.appendChild(el('span', p[0], null));
      d.appendChild(el('span', null, p[1]));
      w.appendChild(d);
    });
    return w;
  }

  function ritaRad(grid, rad, n, underlag, strukna) {
    var ut = !!utfalld[rad.utforare];
    var lab = el('div', 'bt-etikett bt-utforare' + (ut ? ' utfalld' : ''));
    var fall = el('button', 'bt-fall', ut ? '▾' : '▸');
    fall.title = ut ? 'Fäll in ' + rad.namn : 'Fäll ut ' + rad.namn + ' till en rad per byggnad';
    fall.dataset.utforare = rad.utforare;
    fall.addEventListener('click', function () {
      utfalld[rad.utforare] = !utfalld[rad.utforare];
      ritaBalansering();
    });
    lab.appendChild(fall);
    var av = el('span', 'avatar', rad.namn[0]);
    av.style.background = rad.farg;
    lab.appendChild(av);
    var namn = el('div', 'bt-unamn');
    namn.appendChild(el('span', 'bt-nrad', rad.namn));
    namn.appendChild(el('span', 'bt-krad', rad.kapacitetDagar + ' dagar/v · ' +
      rad.tillfallen + ' tillfällen/år'));
    if (rad.over.length || rad.manga.length) {
      var varning = rad.over.length
        ? antalVeckorText(rad.over.length) + ' över kapaciteten'
        : antalVeckorText(rad.manga.length) + ' med många tillfällen';
      namn.appendChild(el('span', 'bt-vrad' + (rad.over.length ? '' : ' mjuk'), varning));
    }
    lab.appendChild(namn);
    grid.appendChild(lab);

    for (var v = 1; v <= n; v++) {
      grid.appendChild(cellFor(rad, rad.veckor[v], strukna));
    }

    // Utfälld: en rad per byggnad som utföraren har tillfällen i
    if (!ut) { return; }
    var byggnader = byggnaderFor(underlag, rad.utforare);
    if (!byggnader.length) {
      var tom = el('div', 'bt-etikett bt-under', 'Inga tillfällen');
      tom.style.gridColumn = '1 / -1';
      grid.appendChild(tom);
      return;
    }
    byggnader.forEach(function (b) {
      var bl = el('div', 'bt-etikett bt-under');
      bl.appendChild(fargprick(b.farg));
      bl.appendChild(el('span', 'bt-bnamn', b.namn));
      // En **permanent** flytt är en förskjutning, och den syns inte på någon enskild bricka –
      // den syns som att hela rytmen ligger någon annanstans. Markeringen på byggnadsraden är
      // det som säger det, och den är densamma som i planeringens tidsaxel (beslut 34).
      bl.appendChild(forskjutningsmarke(b.id));
      grid.appendChild(bl);
      for (var vecka = 1; vecka <= n; vecka++) {
        // Veckan utan tillsyn och skötsel är redan uträknad per cell i belastningen –
        // byggnadsraden läser den ur utförarens cell i stället för att slå upp den igen.
        var ucell = el('div', 'bt-cell bt-ucell' + (rad.veckor[vecka].utanTillsyn ? ' utan' : ''));
        ucell.dataset.utforare = rad.utforare;
        ucell.dataset.byggnad = b.id;
        ucell.dataset.vecka = String(vecka);
        rad.veckor[vecka].tillfallen
          .filter(function (t) { return t.byggnad === b.id; })
          .forEach(function (t) { ucell.appendChild(bricka(t, rad.utforare)); });
        grid.appendChild(ucell);
      }
    });
  }
  // Förskjutningsmärket: "⇥ +2 v." med hela beskedet i titeln. Beskedet formuleras i
  // planeringen (`forskjutningStatus`), så att de två tidsaxlarna säger samma sak om samma
  // flytt – en permanent flytt ska inte heta olika beroende på var man står.
  function forskjutningsmarke(bid) {
    var fsk = P.forskjutningStatus(bid);
    var rondTexter = fsk.ronder.filter(function (r) { return r.egen; })
      .map(function (r) { return P.rondNamn(r.rond) + ': ' + r.text; });
    if (!fsk.byggnad && !rondTexter.length) { return el('span', 'bt-fsk tom', null); }
    var total = fsk.byggnad;
    var m = el('span', 'bt-fsk', total ? P.forskjutningMarke(total) : '⇥');
    m.title = [fsk.byggnadText].concat(rondTexter).filter(Boolean).join('\n');
    if (rondTexter.length) { m.classList.add('rond'); }
    return m;
  }

  // Byggnaderna en utförare har tillfällen i – raderna en utfälld utförare delas upp i
  function byggnaderFor(underlag, utforareId) {
    return underlag.byggnader.filter(function (b) {
      return b.ronder.some(function (r) { return r.utforare === utforareId && r.veckor.length; });
    });
  }

  // Cellen: hur full veckan är mot kapaciteten, med brickorna i byggnadens färg
  function cellFor(rad, cell, strukna) {
    var klasser = 'bt-cell';
    if (cell.utanTillsyn) { klasser += ' utan'; }
    if (cell.antal) { klasser += ' har'; }
    if (cell.over) { klasser += ' over'; }
    else if (cell.andel >= 0.75) { klasser += ' nara'; }
    if (cell.manga) { klasser += ' manga'; }
    if (valdVecka && valdVecka.utforare === rad.utforare && valdVecka.vecka === cell.vecka) { klasser += ' vald'; }
    var k = el('button', klasser);
    k.dataset.utforare = rad.utforare;
    k.dataset.vecka = String(cell.vecka);
    k.dataset.antal = String(cell.antal);
    k.dataset.andel = String(Math.round(cell.andel * 100));
    k.title = rad.namn + ', v. ' + cell.vecka + '\n' + DP.Balansering.cellText(cell) +
      (cell.over ? '\nÖver kapaciteten' : '') +
      (cell.manga ? '\nFler än ' + DP.Balansering.MANGA_TILLFALLEN + ' rutintillfällen' : '') +
      (cell.utanTillsyn ? '\nVecka utan tillsyn och skötsel' : '');
    // Fyllnaden ritas som en stapel underifrån: andelen av kapaciteten, aldrig över 100 %
    // (en överfull vecka säger sin röda färg, inte en stapel som växer ur cellen).
    var fyll = el('div', 'bt-fyll', null);
    fyll.style.height = Math.min(100, Math.round(cell.andel * 100)) + '%';
    k.appendChild(fyll);
    var brickor = el('div', 'bt-brickor');
    cell.tillfallen.forEach(function (t) { brickor.appendChild(bricka(t, rad.utforare)); });
    // De strukna ligger sist, som spöken: de belastar ingenting men visar att planeraren
    // har tagit bort ett tillfälle som annars hade legat här.
    ((strukna && strukna[rad.utforare + ':' + cell.vecka]) || []).forEach(function (t) {
      brickor.appendChild(bricka(t, rad.utforare));
    });
    k.appendChild(brickor);
    if (cell.manga) { k.appendChild(el('span', 'bt-ring', null)); }
    k.addEventListener('click', function () {
      valdVecka = { utforare: rad.utforare, vecka: cell.vecka };
      ritaBalansering();
    });
    return k;
  }

  // En bricka = ett rutintillfälle, i byggnadens färg (beslut 47).
  //
  // De tre slagen av markering är avsiktligt olika till formen och inte bara till färgen
  // (biljett #16): ett **provisoriskt flyttat** tillfälle har en pil, ett **föreslaget** en
  // sax och ett **struket** är ett tomt spöke. Färgen är redan upptagen av byggnaden, och
  // den som läser tidsaxeln ska kunna se skillnaden utan att hålla en färgskala i huvudet.
  function bricka(t, utforareId) {
    var d = el('span', 'bt-bricka' + (t.provisorisk ? ' provisorisk' : '') +
      (t.foreslagen ? ' foreslagen' : '') + (t.struken ? ' struken' : ''));
    if (!t.struken) { d.style.background = t.farg; }
    else { d.style.borderColor = t.farg; }
    d.dataset.byggnad = t.byggnad;
    d.dataset.rond = t.rond;
    if (t.ordinarieVecka !== undefined) { d.dataset.ordinarie = String(t.ordinarieVecka); }
    var extra = '';
    if (t.provisorisk) { extra += '\n⤺ Provisoriskt flyttat från v. ' + t.ordinarieVecka; }
    if (t.foreslagen) { extra += '\n✂ Föreslås strykas'; }
    if (t.struken) { extra += '\n✂ Struket'; }
    d.title = (t.namn || t.byggnadNamn + ' · ' + t.rondNamn) +
      (t.struken ? '' : '\n' + dagsdelText(t)) + extra +
      (t.struken ? '' : '\nDra till en annan vecka för att flytta');
    if (utforareId) { gorDragbar(d, t, utforareId); }
    return d;
  }

  // De strukna tillfällena per utförare och vecka. De finns inte i belastningen – ett struket
  // tillfälle belastar ingen vecka – men de ska synas: en strykning är ett ställningstagande
  // som går att ta tillbaka, och ett tomrum i tidsaxeln hade inte visat att det fanns något
  // att ta tillbaka (beslut 45).
  function struknaPerCell() {
    var ut = {};
    P.klaraByggnader().forEach(function (bid) {
      var s = P.stateFor(bid), b = DP.byggnader[bid];
      P.tillfallenMedStrukna(s, bid).forEach(function (t) {
        if (!t.struken) { return; }
        var n = t.utforare + ':' + t.vecka;
        (ut[n] = ut[n] || []).push({
          byggnad: bid, byggnadNamn: b.namn, farg: b.farg, rond: t.rond,
          rondNamn: P.rondNamn(t.rond), vecka: t.vecka, ordinarieVecka: t.ordinarieVecka,
          namn: t.namn, struken: true
        });
      });
    });
    return ut;
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
  function uppdatera(fore, efter, info) {
    rita();
    if (aktivt === 'balansering') {
      ritaBalansering();
      // Tidsaxeln är omritad, så cellerna finns på sina nya platser när brickorna flyger
      animeraFlyttade(info && info.flyttade);
    }
  }
  P.prenumerera(uppdatera);
  P.prenumereraByte(function () { uppdatera(); });

  DP.Vyer = { visa: visa, aktivt: function () { return aktivt; } };

  visa(aktivt);
})();
