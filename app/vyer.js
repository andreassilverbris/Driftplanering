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
    var svarade = (bst.omraden ? 1 : 0) + (bst.kapacitet ? 1 : 0);
    return svarade ? svarade + ' av 2 frågor besvarade' : h.under;
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

  function ritaBalansering() {
    var sido = $('#balansering'), yta = $('#balansering-yta');
    if (!sido || !yta) { return; }

    var underlag = P.balanseringsUnderlag();
    var bel = DP.Balansering.belastning(underlag);

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
      'Klicka på en vecka för att se utförarens rutintillfällen med planerad tid.'
    ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    f.appendChild(ul);
    sido.appendChild(f);

    // Veckolistan: utförarens rutintillfällen i den valda veckan (berättelse 55)
    sido.appendChild(veckolista(bel));

    sido.appendChild(el('div', 'bal-status',
      'Frågan om <b>veckor utan tillsyn och skötsel</b> och flytt för hand byggs i nästa steg. ' +
      'Begreppen – besöksrytm, rondserie, kapacitet, provisorisk flytt och stryka – finns i ' +
      '<b>Ordlistan</b>.'));
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
  // Båda har förval, så de går att klicka igenom med ett klick var när förvalen stämmer
  // (beslut 37). Den tredje frågan – veckor utan tillsyn och skötsel – byggs i nästa biljett.
  var oppenFraga = 0;   // 0 = ingen, 1 = områden, 2 = kapacitet

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

    grupp.appendChild(balanseraKnapp(underlag, bst));
    sido.appendChild(grupp);
    if (bst.resultat) { sido.appendChild(resultatpanel(bst.resultat)); }
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

  // Knappen som ger frågan grön bock utan att något tal ändras: förvalen är ett svar, och det
  // ska gå lika fort att bekräfta dem som att ändra dem (beslut 37).
  function godkannRad(fraga, text) {
    var rad = el('div', 'knapprad hoger');
    var k = el('button', 'knapp', text);
    k.dataset.godkann = fraga;
    k.title = 'Svaret stämmer – gå vidare';
    k.addEventListener('click', function () {
      P.godkannFraga(fraga);
      oppenFraga = fraga === 'omraden' ? 2 : 0;
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
  function resultatpanel(res) {
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
      var rad = el('div', 'bal-frad' + (r.typ === 'orord' ? ' orord' : ''));
      rad.dataset.typ = r.typ;
      if (r.byggnad && DP.byggnader[r.byggnad]) { rad.appendChild(fargprick(DP.byggnader[r.byggnad].farg)); }
      rad.appendChild(el('span', 'bal-ftext', r.text));
      lista.appendChild(rad);
    });
    w.appendChild(lista);

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
  function balCell(utforareId, vecka) {
    return document.querySelector('.bt-cell[data-utforare="' + utforareId + '"][data-vecka="' + vecka + '"]');
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
    if (!cell.antal) {
      w.appendChild(el('div', 'bal-notis', 'Inga rutintillfällen den här veckan.'));
      return w;
    }
    var ul = el('div', 'bal-tillfallen');
    cell.tillfallen.forEach(function (t) {
      var r = el('div', 'bal-tillfalle');
      r.appendChild(fargprick(t.farg));
      var txt = el('div', 'bal-tnamn');
      txt.appendChild(el('span', 'bal-namn', t.byggnadNamn + ' · ' + t.rondNamn));
      txt.appendChild(el('span', 'bal-omrade', t.namn || ''));
      r.appendChild(txt);
      r.appendChild(el('span', 'bal-tid', dagsdelText(t)));
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

    bel.rader.forEach(function (rad) { ritaRad(grid, rad, n, underlag); });
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

  function ritaRad(grid, rad, n, underlag) {
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
      grid.appendChild(cellFor(rad, rad.veckor[v]));
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
          .forEach(function (t) { ucell.appendChild(bricka(t)); });
        grid.appendChild(ucell);
      }
    });
  }
  // Byggnaderna en utförare har tillfällen i – raderna en utfälld utförare delas upp i
  function byggnaderFor(underlag, utforareId) {
    return underlag.byggnader.filter(function (b) {
      return b.ronder.some(function (r) { return r.utforare === utforareId && r.veckor.length; });
    });
  }

  // Cellen: hur full veckan är mot kapaciteten, med brickorna i byggnadens färg
  function cellFor(rad, cell) {
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
    cell.tillfallen.forEach(function (t) { brickor.appendChild(bricka(t)); });
    k.appendChild(brickor);
    if (cell.manga) { k.appendChild(el('span', 'bt-ring', null)); }
    k.addEventListener('click', function () {
      valdVecka = { utforare: rad.utforare, vecka: cell.vecka };
      ritaBalansering();
    });
    return k;
  }

  // En bricka = ett rutintillfälle, i byggnadens färg (beslut 47)
  function bricka(t) {
    var d = el('span', 'bt-bricka');
    d.style.background = t.farg;
    d.dataset.byggnad = t.byggnad;
    d.dataset.rond = t.rond;
    d.title = (t.namn || t.byggnadNamn + ' · ' + t.rondNamn) + '\n' + dagsdelText(t);
    return d;
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
