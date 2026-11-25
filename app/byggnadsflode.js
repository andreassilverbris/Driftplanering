/*
 * Byggnadsflödet: huvudsteget Byggnad som en vägledd process (beslut 69 och 107).
 *
 * Fyra steg i en lodrät lista – Byggnadstyp och namn → Plan → Rum → Installationer – med
 * samma form som Planeringens steglista: grön bock, hopfällning när steget är klart och
 * vilket steg som helst öppningsbart igen. Formen är inte vald för att vara bäst, utan för
 * att den redan är inlärd: enhetligheten är viktigare (beslut 107).
 *
 * Den här filen bygger listan, byggnadslistan med status och **steg 1** (byggnadstyp, namn,
 * område och färg). Steg 2–4 syns med sitt läge men är tomma tills de byggs i de följande
 * biljetterna i spåret.
 *
 * Reglerna – vad som är klart, om namnet går att använda och vad statusen heter – bor i
 * `DP.Plan` och inte här (beslut 61): de ska gå att läsa i ett test utan DOM, och
 * byggnadslistan och steglistan ska aldrig kunna säga olika saker om samma byggnad.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan;
  var rot = document.getElementById('byggnadsflode');

  var STEG = [
    { n: 1, titel: 'Byggnadstyp och namn', kropp: steg1 },
    { n: 2, titel: 'Plan', kropp: stegKommer },
    { n: 3, titel: 'Rum', kropp: stegKommer },
    { n: 4, titel: 'Installationer', kropp: stegKommer }
  ];

  // Flödet är stängt tills planeraren väljer *Skapa ny byggnad* eller öppnar ett steg: utan
  // det hade byggnadsträdet för en färdig byggnad hamnat långt ner bakom fyra steg som inte
  // har något att säga. `ny` är det som skrivs i steg 1 innan byggnaden finns.
  var ui = {
    oppet: 0,
    skapar: false,
    ny: { namn: '', typ: '', omrade: '' }
  };

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
  // Steglistan
  // ------------------------------------------------------------------
  function rita() {
    // Rullningen står kvar vid varje omritning (beslut 105): planeraren ska aldrig behöva
    // leta sig tillbaka till det hon just klickade på.
    var skroll = rot.parentNode ? rot.parentNode.scrollTop : 0;
    var fokus = document.activeElement;
    var fokusFalt = fokus && rot.contains(fokus) ? fokus.dataset.falt : null;
    var markering = fokusFalt && fokus.setSelectionRange ? fokus.selectionStart : null;
    rot.innerHTML = '';
    rot.appendChild(byggnadslista());

    // Medan planeraren fyller i en **ny** byggnad gäller stegen den byggnaden och inte den
    // aktiva: ett grönt steg 1 och "1 plan" i steg 2 hade varit den byggnad hon står i, och
    // sagt att arbetet är gjort innan det börjat. Den nya byggnaden har inget klart alls.
    var k = ui.skapar ? { 1: false, 2: false, 3: false, 4: false } : P.byggnadsSteg();
    STEG.forEach(function (st) {
      var oppen = ui.oppet === st.n;
      var klar = !!k[st.n];
      // Steg 2–4 gäller en byggnad som inte finns än, så de är låsta tills den skapats –
      // samma regel som Planeringens steglista: svara på frågorna ovanför först.
      var last = ui.skapar && st.n > 1;
      var kort = el('section', 'steg-kort' + (oppen ? ' oppen' : '') + (klar ? ' klar' : '') + (last ? ' last' : ''));
      kort.dataset.bsteg = st.n;
      var h = el('header', 'steg-huvud');
      h.innerHTML = '<span class="steg-nr">' + (klar ? '✓' : st.n) + '</span>' +
        '<div class="steg-text"><div class="steg-titel">' + st.titel + '</div>' +
        (oppen ? '' : '<div class="steg-sammanf">' + sammanfattning(st.n, klar) + '</div>') + '</div>';
      if (last) {
        h.title = 'Skapa byggnaden i steg 1 först';
      } else {
        h.addEventListener('click', function () { ui.oppet = oppen ? 0 : st.n; rita(); });
      }
      kort.appendChild(h);
      if (oppen && !last) {
        var kropp = el('div', 'steg-kropp');
        st.kropp(kropp, st.n);
        kort.appendChild(kropp);
      }
      rot.appendChild(kort);
    });

    if (rot.parentNode) { rot.parentNode.scrollTop = skroll; }
    // Skriver planeraren i namnfältet ska omritningen inte ta ifrån henne tangentbordet:
    // beskedet om ett upptaget namn kommer medan hon skriver (beslut 103), och ett tappat
    // fokus hade betytt att resten av namnet hamnade någon annanstans.
    if (fokusFalt) {
      var nytt = rot.querySelector('[data-falt="' + fokusFalt + '"]');
      if (nytt) {
        nytt.focus();
        if (markering !== null && nytt.setSelectionRange) { nytt.setSelectionRange(markering, markering); }
      }
    }
  }

  // Vad steget säger när det är hopfällt. Steg 1 säger vad byggnaden är, de övriga hur mycket
  // som är inläst – samma uppgift som listan visar, så att planeraren ser läget utan att
  // öppna steget (berättelse 6).
  function sammanfattning(n, klar) {
    // Den nya byggnaden är tom: stegen säger vad som ska fyllas i, inte vad den aktiva
    // byggnaden råkar ha.
    if (ui.skapar) {
      return n === 1 ? 'Välj typ och ge byggnaden ett namn' : 'Skapa byggnaden först';
    }
    var b = P.byggnad();
    if (!b) { return ''; }
    if (n === 1) {
      if (!klar) { return 'Välj typ och ge byggnaden ett namn'; }
      var typ = DP.byggnadstyper[b.typ];
      var omr = DP.omraden.filter(function (o) { return o.id === b.omrade; })[0];
      return b.namn + ' · ' + (typ ? typ.namn : b.typ) + (omr ? ' · ' + omr.namn : '');
    }
    if (n === 2) { return b.plan.length ? antal(b.plan.length, 'plan', 'plan') : 'Inget plan ännu'; }
    if (n === 3) { return b.rum.length ? antal(b.rum.length, 'rum', 'rum') : 'Inga rum ännu'; }
    var sig = b.installationer.filter(function (i) { return i.signifikant; }).length;
    return sig ? antal(sig, 'signifikant installation', 'signifikanta installationer') : 'Inga installationer ännu';
  }
  function antal(n, ett, flera) { return n + ' ' + (n === 1 ? ett : flera); }

  // ------------------------------------------------------------------
  // Byggnadslistan: var varje byggnad står (berättelse 7)
  // ------------------------------------------------------------------
  function byggnadslista() {
    var w = el('section', 'bf-lista');
    var h = el('div', 'bf-listhuvud');
    h.appendChild(el('div', 'liten-rubrik', 'Byggnader'));
    h.appendChild(knapp('+ Skapa ny byggnad', 'knapp sekundar liten-knapp', function () {
      ui.skapar = true;
      ui.oppet = 1;
      ui.ny = { namn: '', typ: '', omrade: (DP.omraden[0] || {}).id };
      rita();
    }, 'Lägg in en byggnad som inte finns i systemet. Du fyller i den steg för steg.'));
    w.appendChild(h);
    P.byggnadsordning.forEach(function (bid) {
      var b = P.byggnad(bid), aktiv = !ui.skapar && bid === P.aktivId();
      var rad = el('div', 'bf-byggnad' + (aktiv ? ' aktiv' : ''));
      rad.dataset.byggnad = bid;
      var prick = el('span', 'bal-farg', null);
      prick.style.background = b.farg;
      rad.appendChild(prick);
      var txt = el('div', 'bf-btext');
      txt.appendChild(el('span', 'bf-bnamn', b.namn));
      txt.appendChild(el('span', 'bf-bstatus', P.byggnadStatus(bid)));
      rad.appendChild(txt);
      rad.addEventListener('click', function () {
        if (bid !== P.aktivId()) { P.vaxlaByggnad(bid); }
      });
      w.appendChild(rad);
    });
    // Byggnaden som håller på att skapas står med i listan medan planeraren fyller i steg 1,
    // så att hon ser vart den är på väg och att den kommer efter de andra.
    if (ui.skapar) {
      var ny = el('div', 'bf-byggnad aktiv bf-ny');
      ny.dataset.byggnad = 'ny';
      ny.appendChild(el('span', 'bal-farg', null));
      var nytxt = el('div', 'bf-btext');
      nytxt.appendChild(el('span', 'bf-bnamn', ui.ny.namn || 'Ny byggnad'));
      nytxt.appendChild(el('span', 'bf-bstatus', 'Fylls i – steg 1'));
      ny.appendChild(nytxt);
      w.appendChild(ny);
    }
    return w;
  }

  // ------------------------------------------------------------------
  // Steg 1: byggnadstyp, namn och område
  // ------------------------------------------------------------------
  // Två lägen i samma steg: skapar planeraren en ny byggnad är allt redigerbart, och står hon
  // i en byggnad som finns visas dess uppgifter med typen låst (beslut 104).
  function steg1(kropp) {
    if (ui.skapar) { return nyByggnadsformular(kropp); }
    return befintligByggnad(kropp);
  }

  function nyByggnadsformular(kropp) {
    kropp.appendChild(el('p', 'forklar',
      'Byggnadstypen är mallen: den avgör hur modellen ritas, vilka rumstyper som känns igen ' +
      'och vilken standardplanering Planering föreslår. <b>Typen går inte att ändra efteråt</b> – ' +
      'blir det fel skapar du en ny byggnad och läser in samma fil.'));

    kropp.appendChild(el('div', 'liten-rubrik', 'Byggnadstyp'));
    var typval = el('div', 'frekvensval');
    Object.keys(DP.byggnadstyper).forEach(function (id) {
      var t = DP.byggnadstyper[id];
      var k = el('button', 'val' + (ui.ny.typ === id ? ' pa' : ''), '<b>' + t.namn + '</b><span>' + t.motivering + '</span>');
      k.dataset.typ = id;
      k.addEventListener('click', function () { ui.ny.typ = id; rita(); });
      typval.appendChild(k);
    });
    kropp.appendChild(typval);

    kropp.appendChild(el('div', 'liten-rubrik', 'Namn'));
    var falt = el('input', 'bf-falt');
    falt.type = 'text';
    falt.dataset.falt = 'namn';
    falt.value = ui.ny.namn;
    falt.placeholder = 't.ex. Kasern 3';
    falt.addEventListener('input', function () { ui.ny.namn = falt.value; rita(); });
    kropp.appendChild(falt);
    // Beskedet om namnet kommer medan planeraren skriver, inte när hon trycker på knappen
    // (beslut 103): två byggnader med samma namn hade gett rutintillfällen med samma namn.
    var hinder = ui.ny.namn ? P.namnHinder(ui.ny.namn) : '';
    if (hinder) { kropp.appendChild(el('div', 'bf-fel', hinder)); }

    kropp.appendChild(el('div', 'liten-rubrik', 'Område'));
    var omrval = el('div', 'frekvensval');
    DP.omraden.forEach(function (o) {
      var k = el('button', 'val' + (ui.ny.omrade === o.id ? ' pa' : ''), '<b>' + o.namn + '</b><span>' + o.beskrivning + '</span>');
      k.dataset.omrade = o.id;
      k.addEventListener('click', function () { ui.ny.omrade = o.id; rita(); });
      omrval.appendChild(k);
    });
    kropp.appendChild(omrval);

    kropp.appendChild(el('div', 'bf-notis',
      'Färgen väljer systemet: den är bara brickornas färg i Balanseringens tidsaxel och säger ' +
      'inget om byggnaden, så det finns inget att ta ställning till.'));

    var rad = el('div', 'knapprad hoger');
    rad.appendChild(knapp('Avbryt', 'knapp sekundar', function () {
      ui.skapar = false;
      rita();
    }));
    var skapa = knapp('Skapa byggnad', 'knapp', function () { skapaByggnaden(); });
    skapa.disabled = !!hinder || !ui.ny.namn || !ui.ny.typ || !ui.ny.omrade;
    if (skapa.disabled) {
      skapa.title = hinder || (!ui.ny.typ ? 'Välj byggnadstyp först' : 'Ge byggnaden ett namn');
    }
    rad.appendChild(skapa);
    kropp.appendChild(rad);
  }

  function skapaByggnaden() {
    var id = P.skapaByggnad({ namn: ui.ny.namn, typ: ui.ny.typ, omrade: ui.ny.omrade });
    if (!id) { rita(); return; }
    ui.skapar = false;
    // Nästa steg är Plan: byggnaden finns, och det som fattas är uppgifterna om den.
    ui.oppet = 2;
    rita();
  }

  // Byggnaden som finns: namnet och området går att läsa, typen står låst (beslut 104).
  // Att *ändra* dem hör till *Ändra byggnad* och byggs i en senare biljett i spåret.
  function befintligByggnad(kropp) {
    var b = P.byggnad();
    if (!b) { return; }
    var typ = DP.byggnadstyper[b.typ];
    var omr = DP.omraden.filter(function (o) { return o.id === b.omrade; })[0];
    var rutnat = el('div', 'bf-faltrutnat');
    falt(rutnat, 'Namn', b.namn);
    falt(rutnat, 'Byggnadstyp', (typ ? typ.namn : b.typ) + ' <span class="tagg">låst</span>');
    falt(rutnat, 'Område', omr ? omr.namn : '–');
    falt(rutnat, 'Färg', '<span class="bal-farg" style="background:' + b.farg + '"></span>');
    kropp.appendChild(rutnat);
    kropp.appendChild(el('div', 'bf-notis',
      'Byggnadstypen är låst när byggnaden skapats: den avgör planlösningen, utseendet och ' +
      'vilka byggnader planeringen kan kopieras mellan. Blir typen fel skapar du en ny byggnad ' +
      'och läser in samma fil.'));
  }
  function falt(rot2, etikett, varde) {
    var r = el('div', 'falt');
    r.appendChild(el('div', 'etikett', etikett));
    r.appendChild(el('div', 'varde', varde));
    rot2.appendChild(r);
  }

  // Steg 2–4 byggs i de följande biljetterna i spåret. De syns med sitt läge, så att
  // planeraren ser hela vägen framför sig – ett tomt steg som inte finns hade gjort flödet
  // kortare än det är.
  function stegKommer(kropp, n) {
    var texter = {
      2: 'Här läser du in byggnadens plan, eller lägger till dem för hand.',
      3: 'Här läser du in rummen med NTA och NTV, eller lägger till dem för hand.',
      4: 'Här läser du in de signifikanta installationerna, eller lägger till dem för hand.'
    };
    kropp.appendChild(el('p', 'forklar', texter[n]));
    kropp.appendChild(el('div', 'bf-notis', 'Steget är inte byggt ännu.'));
  }

  // ------------------------------------------------------------------
  // Flödet ritar om sig vid varje ändring och varje byggnadsbyte: statusen, bockarna och
  // byggnadslistan kommer ur tillståndet, så ångra och gör om sköter sig själva.
  // ------------------------------------------------------------------
  P.prenumerera(function () {
    // Ångras ett *Skapa byggnad* är formuläret inte längre på väg någonstans
    if (ui.skapar && !P.byggnad()) { ui.skapar = false; }
    rita();
  });
  // Byter planeraren byggnad mitt i ifyllningen är formuläret inte längre på väg någonstans:
  // det hör till den byggnad hon höll på att skapa, och stegen under det gäller nu en annan.
  // Lämnades det kvar hade "Ny byggnad" legat i listan och steg 2–4 stått låsta för en
  // byggnad som är färdig.
  P.prenumereraByte(function () {
    ui.skapar = false;
    rita();
  });
  rita();
})();
