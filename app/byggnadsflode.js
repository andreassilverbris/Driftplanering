/*
 * Byggnadsflödet: huvudsteget Byggnad som en vägledd process (beslut 69 och 107).
 *
 * Fyra steg i en lodrät lista – Byggnadstyp och namn → Plan → Rum → Installationer – med
 * samma form som Planeringens steglista: grön bock, hopfällning när steget är klart och
 * vilket steg som helst öppningsbart igen. Formen är inte vald för att vara bäst, utan för
 * att den redan är inlärd: enhetligheten är viktigare (beslut 107).
 *
 * Den här filen bygger listan, byggnadslistan med status, **steg 1** (byggnadstyp, namn,
 * område och färg), **steg 2 Plan** (ta ut och läsa in inläsningsfilen, godta förslag,
 * svara på det oplacerade, lägga till plan för hand, dra om ordningen, döpa om och ta bort)
 * och **steg 3 Rum** (de inlästa rummen med plan, nummer, rumstyp och NTA, rummen per plan
 * med areasummor, byte av rumstyp och borttagning, att dra om rummens ordning och dra ett
 * oplacerat rum till ett plan, och att lägga till ett rum för hand).
 * Steg 4 syns med sitt läge men är tomt tills det byggs i den följande biljetten i spåret.
 *
 * Inläsningens tre grupper (beslut 83) ritas av **samma** kod för båda stegen: det som
 * skiljer en plan-rad från en rumsrad är vilka frågor den kan ha, och det svarar
 * `DP.Inlasning` på. Två uppsättningar grupper hade glidit isär så fort någon rättade den ena,
 * och planeraren ska möta samma form i varje steg (beslut 90).
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
    { n: 2, titel: 'Plan', kropp: steg2 },
    { n: 3, titel: 'Rum', kropp: steg3 },
    { n: 4, titel: 'Installationer', kropp: steg4 }
  ];

  // Flödet är stängt tills planeraren väljer *Skapa ny byggnad* eller öppnar ett steg: utan
  // det hade byggnadsträdet för en färdig byggnad hamnat långt ner bakom fyra steg som inte
  // har något att säga. `ny` är det som skrivs i steg 1 innan byggnaden finns.
  var ui = {
    oppet: 0,
    skapar: false,
    ny: { namn: '', typ: '', omrade: '' },
    // Det som skrivs i steg 2 innan planet läggs till, och det plan som dras. `drag.over` är
    // planet linjen ligger vid och `drag.under` på vilken sida (beslut 106).
    nyttPlan: { id: '', namn: '' },
    drag: null,
    // Planet vars benämning redigeras på sin rad. Omdöpningen sker i listan och inte i en
    // ruta ovanpå sidan: resten av flödet frågar i panelen.
    doper: null,
    // Rummet vars rumstyp byts på sin rad. Samma mönster som `doper`: ändringen sker där
    // uppgiften står och inte i en ruta ovanpå sidan.
    rumstyp: null,
    // Inläsningen: skälet när en fil inte gick att läsa, och det planeraren skrivit i en
    // oplacerad rads fält (nyckel → text) innan hon tryckt på *Placera*.
    filfel: '',
    svar: {},
    // Steg 3: rummet som dras och det som skrivs innan rummet läggs till. `rumdrag` bär
    // antingen `nyckel` (ett rum som ligger i byggnaden) eller `inlkey` (en oplacerad
    // inläst rad), och var linjen ligger: `over` är rummet den står vid, `under` på vilken
    // sida, `planOver` planet när pekaren står på en planrubrik och inget rum.
    rumdrag: null,
    nyttRum: { plan: '', nr: '', namn: '', nta: '', ntv: '' },
    laggerTillRum: false,
    // Steg 4: installationen vars typ byts på sin rad (samma mönster som `rumstyp`), den som
    // dras, och det som skrivs innan installationen läggs till. `instdrag` bär antingen `id`
    // (en installation som ligger i byggnaden) eller `inlkey` (en oplacerad inläst rad), och
    // `rumOver` rummet pekaren står på.
    insttyp: null,
    instdrag: null,
    nyInst: { rum: '', benamning: '', beteckning: '', typ: '', fabrikat: '', modell: '',
      datum: '', externtId: '' },
    laggerTillInst: false,
    // *Ersätt apparaten* (beslut 91–95): installationen vars apparat byts, och uppgifterna om
    // den nya. Formuläret ligger **på installationens rad**, som typvalet gör, av samma skäl:
    // utbytet sker där den gamla apparatens uppgifter står. `ersatter` är `null` när inget
    // utbyte pågår.
    ersatter: null,
    nyApparat: null,
    // *Ändra byggnad* i steg 1 (beslut 100 och 103): det nya namnet medan planeraren skriver
    // det. `null` betyder att hon inte döper om – samma mönster som `doper` för ett plan, och
    // av samma skäl: ändringen sker där uppgiften står och inte i en ruta ovanpå sidan.
    // `nyttNamnFran` är namnet som gällde när fältet öppnades, så att ett ångra på annat håll
    // går att känna igen: då är det hon skrivit ett svar på ett namn som inte gäller längre.
    nyttNamn: null,
    nyttNamnFran: null
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
      var nyttFalt = rot.querySelector('[data-falt="' + fokusFalt + '"]');
      if (nyttFalt) {
        nyttFalt.focus();
        if (markering !== null && nyttFalt.setSelectionRange) { nyttFalt.setSelectionRange(markering, markering); }
      }
    }
    // Fokus på begäran: efter *Lägg till plan* står markören i beteckningsfältet igen, eftersom
    // nästa plan är nästa sak planeraren skriver. Det hanteras här och inte där knappen sitter,
    // så att omritningen inte hinner ta tillbaka fokus till knappen.
    if (ui.fokus) {
      var begart = rot.querySelector('[data-falt="' + ui.fokus + '"]');
      ui.fokus = null;
      if (begart) { begart.focus(); }
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
    // Det som **återstår** väger tyngst: planeraren ska se att två förslag ligger kvar utan
    // att öppna steget (berättelse 6), och antalet plan eller rum säger inte det.
    if (n === 2) {
      return aterstar('plan') ||
        (b.plan.length ? antal(b.plan.length, 'plan', 'plan') : 'Inget plan ännu');
    }
    if (n === 3) {
      return aterstar('rum') ||
        (b.rum.length ? antal(b.rum.length, 'rum', 'rum') : 'Inga rum ännu');
    }
    var sig = b.installationer.filter(function (i) { return i.signifikant; }).length;
    return aterstar('inst') ||
      (sig ? antal(sig, 'signifikant installation', 'signifikanta installationer')
        : 'Inga installationer ännu');
  }
  function antal(n, ett, flera) { return n + ' ' + (n === 1 ? ett : flera); }
  // Vad som återstår i en flik, i klartext – eller tomt när ingenting gör det.
  function aterstar(flik) {
    var r = P.inlasningStatus(flik).raknat;
    var delar = [];
    if (r.nytt) { delar.push(antal(r.nytt, 'förslag', 'förslag')); }
    if (r.andrade) { delar.push(antal(r.andrade, 'ändrad rad', 'ändrade rader')); }
    if (r.bort) { delar.push(antal(r.bort, 'rad', 'rader') + ' som saknas i filen'); }
    if (r.oplacerad) { delar.push(antal(r.oplacerad, 'oplacerad rad', 'oplacerade rader')); }
    return delar.length ? delar.join(', ') + ' kvar' : '';
  }

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

  // Byggnaden som finns: *Ändra byggnad* (berättelse 2). Typen är låst (beslut 104), men
  // **namnet går att byta** (beslut 103) och byggnaden att **ta bort** (beslut 100).
  //
  // Området och färgen står kvar som skrivskyddade: de hör också till *Ändra byggnad*, men
  // ingen av dem står i biljetten, och ett fält som ser redigerbart ut utan att vara det är
  // värre än ett som inte gör det.
  function befintligByggnad(kropp) {
    var b = P.byggnad();
    if (!b) { return; }
    var typ = DP.byggnadstyper[b.typ];
    var omr = DP.omraden.filter(function (o) { return o.id === b.omrade; })[0];
    var rutnat = el('div', 'bf-faltrutnat');
    // Namnet är det enda fältet med en knapp: resten av steget är uppgifter om byggnaden,
    // och namnet är det planeraren kan rätta.
    namnfalt(rutnat, b);
    falt(rutnat, 'Byggnadstyp', (typ ? typ.namn : b.typ) + ' <span class="tagg">låst</span>');
    falt(rutnat, 'Område', omr ? omr.namn : '–');
    falt(rutnat, 'Färg', '<span class="bal-farg" style="background:' + b.farg + '"></span>');
    kropp.appendChild(rutnat);
    kropp.appendChild(el('div', 'bf-notis',
      'Byggnadstypen är låst när byggnaden skapats: den avgör planlösningen, utseendet och ' +
      'vilka byggnader planeringen kan kopieras mellan. Blir typen fel skapar du en ny byggnad ' +
      'och läser in samma fil.'));
    taBortByggnadsrad(kropp, b);
  }

  // Namnet: visat med *Byt namn*, eller ett fält medan planeraren skriver det nya. Beskedet om
  // ett upptaget namn kommer **medan hon skriver** (beslut 103), precis som i steg 1 för en ny
  // byggnad, och det är samma regel som svarar – `P.namnHinder`, med byggnaden själv undantagen
  // så att namnet får skrivas om utan att krocka med sig självt.
  function namnfalt(rutnat, b) {
    if (ui.nyttNamn === null) {
      var r = el('div', 'falt');
      r.appendChild(el('div', 'etikett', 'Namn'));
      var v = el('div', 'varde');
      v.appendChild(el('span', null, b.namn));
      v.appendChild(knapp('Byt namn', 'knapp sekundar liten-knapp', function () {
        ui.nyttNamn = b.namn;
        ui.nyttNamnFran = b.namn;
        ui.fokus = 'byggnadsnamn';
        rita();
      }, 'Byt namn på byggnaden. Rutintillfällena byter namn med den.'));
      r.appendChild(v);
      rutnat.appendChild(r);
      return;
    }
    var hinder = P.namnHinder(ui.nyttNamn, b.id);
    var rad = el('div', 'falt bf-namnbyte');
    rad.appendChild(el('div', 'etikett', 'Namn'));
    var varde = el('div', 'varde');
    var namnfaltet = el('input', 'bf-falt');
    namnfaltet.value = ui.nyttNamn;
    namnfaltet.dataset.falt = 'byggnadsnamn';
    namnfaltet.addEventListener('input', function () { ui.nyttNamn = namnfaltet.value; rita(); });
    namnfaltet.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { spara(); }
      if (e.key === 'Escape') { avbrytNamnbyte(); rita(); }
    });
    varde.appendChild(namnfaltet);
    var spar = knapp('Spara', 'knapp liten-knapp', spara,
      'Rutintillfällena byter namn med byggnaden. ◀ tar namnet tillbaka.');
    spar.disabled = !!hinder || ui.nyttNamn.trim() === b.namn;
    if (spar.disabled) { spar.title = hinder || 'Namnet är oförändrat'; }
    varde.appendChild(spar);
    varde.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
      avbrytNamnbyte(); rita();
    }));
    rad.appendChild(varde);
    if (hinder) { rad.appendChild(el('div', 'bf-fel', hinder)); }
    rutnat.appendChild(rad);

    function spara() {
      // Gick namnbytet igenom ritar lyssnaren om; gick det inte står fältet kvar med
      // beskedet, och då måste omritningen begäras här.
      if (P.sattByggnadsNamn(ui.nyttNamn, b.id)) { avbrytNamnbyte(); } else { rita(); }
    }
  }
  // Lämna namnbytet. De två fälten nollställs tillsammans, så att `nyttNamnFran` aldrig kan
  // bli kvar och peka på ett namn ingen längre skriver mot.
  function avbrytNamnbyte() { ui.nyttNamn = null; ui.nyttNamnFran = null; }

  // *Ta bort byggnad* (beslut 100, berättelse 71). Planeringen försvinner med byggnaden, och
  // har den varit med i en balansering markeras Balansering som ändrad – följder nog att
  // frågan ställs först, till skillnad från ett rum eller en installation där `◀` räcker som
  // besked. Det är samma skiljelinje som *Ta bort rond* i Planering: bekräfta när
  // borttagningen rör något på annat håll.
  function taBortByggnadsrad(kropp, b) {
    var sista = P.byggnadsordning.length < 2;
    var rad = el('div', 'knapprad bf-farligt');
    var k = knapp('Ta bort byggnaden', 'knapp sekundar liten-knapp', function () {
      fragaTaBort(b);
    }, 'Tar bort byggnaden och dess planering. ◀ tar den tillbaka.');
    k.disabled = sista;
    if (sista) {
      k.title = 'Den sista byggnaden går inte att ta bort – modellen och listorna behöver en ' +
        'byggnad att visa.';
    }
    rad.appendChild(k);
    kropp.appendChild(rad);
  }

  // Frågan innan borttagningen. Den räknar upp vad som försvinner med byggnaden, eftersom det
  // är det planeraren behöver väga: ett tomt skal är en annan sak än en färdigplanerad kasern.
  function fragaTaBort(b) {
    var sig = b.installationer.filter(function (i) { return i.signifikant; }).length;
    var klar = P.byggnadKlar(b.id);
    var bal = P.balanseringStatus();
    var delar = [];
    if (b.plan.length) { delar.push(antal(b.plan.length, 'plan', 'plan')); }
    if (b.rum.length) { delar.push(antal(b.rum.length, 'rum', 'rum')); }
    if (sig) { delar.push(antal(sig, 'signifikant installation', 'signifikanta installationer')); }
    var html = '<p>' + DP.Dialog.esc(b.namn) + ' försvinner med ' +
      (delar.length ? delar.join(', ') : 'inga plan eller rum') + ', och planeringen med den.</p>';
    if (klar) {
      html += '<p>Byggnaden är <b>klar i alla sex stegen</b>, så dess ronder räknas med i ' +
        'Balansering i dag.</p>';
    }
    // Var byggnaden med i balanseringen blir Balansering markerad som ändrad planering
    // (beslut 40). Det sägs i förväg: planeraren ska veta att hon får en markering att svara
    // på, inte möta den som en överraskning i ett annat huvudsteg.
    if (bal.balanserad && klar) {
      html += '<p>Balansering kommer att säga att <b>planeringen har ändrats</b> sedan du ' +
        'balanserade. Inget räknas om av sig självt – förskjutningarna ligger kvar tills du ' +
        'balanserar om.</p>';
    }
    html += '<p>◀ tar byggnaden tillbaka, med planering och allt.</p>';
    DP.Dialog.visa({
      titel: 'Ta bort ' + b.namn + '?',
      html: html,
      knappar: [
        { text: 'Ta bort byggnaden', prim: true, gor: function () { P.taBortByggnad(b.id); } },
        { text: 'Avbryt' }
      ]
    });
  }
  function falt(rot2, etikett, varde) {
    var r = el('div', 'falt');
    r.appendChild(el('div', 'etikett', etikett));
    r.appendChild(el('div', 'varde', varde));
    rot2.appendChild(r);
  }

  // ------------------------------------------------------------------
  // Steg 2: Plan (beslut 76, 84, 85, 105 och 106)
  // ------------------------------------------------------------------
  // Planen i en lodrät lista med det **översta planet högst upp** – samma ordning som
  // plan-knapparna i verktygsfältet och byggnadsträdet, och samma ordning som modellen står i.
  // Listan är alltså en bild av byggnaden, och ett drag i listan är ett drag i modellen.
  //
  // Byggnadsdatan bär planen nedifrån och upp, så listan ritas baklänges. Den vändningen bor
  // bara här: allt annat – planeringen, modellen, förslaget om ordningen – räknar nedifrån.
  function steg2(kropp) {
    var b = P.byggnad();
    if (!b) { return; }
    var st = P.planStatus();

    kropp.appendChild(el('p', 'forklar',
      'Ett <b>plan</b> är en våning i byggnaden. Beteckningen är planets namn i ' +
      'fastighetssystemet och behålls precis som du skriver den – 01, P1 eller 00 – eftersom ' +
      'rummen och installationerna pekar på den. Benämningen är det du läser: Källarplan, ' +
      'Entréplan, Vindsplan.'));

    // Inläsningsfilen först, handinmatningen under: de är två sätt att fylla i **samma** steg
    // och inte två spår (beslut 69), men filen är det som bär en verklig byggnad och ska
    // därför vara det planeraren möter först.
    filrad(kropp, b, 'plan');
    // Det som återstår av inläsningen ligger **fast överst** medan resten rullas (beslut 112),
    // så att planeraren kan dra och godta med listan över plan framför sig.
    inlasningsgrupper(kropp, b, 'plan');

    if (!st.rader.length) {
      kropp.appendChild(el('div', 'bf-notis',
        'Byggnaden har inga plan ännu. Lägg till det nedersta först, eller läs in dem från en ' +
        'inläsningsfil när den funktionen finns. Så fort ett plan finns syns det som ett ' +
        '<b>skal</b> i modellen till höger – en tom våning i byggnadstypens standardstorlek, ' +
        'innan rummen är inlästa.'));
    } else {
      kropp.appendChild(planlista(b, st));
      // Att ordningen skiljer sig från förslaget är inget fel – planeraren får dra om den
      // (beslut 84). Men hon ska kunna komma tillbaka till förslaget utan att dra allt igen.
      if (st.avvikerFranForslag) {
        var rad0 = el('div', 'knapprad');
        rad0.appendChild(knapp('Ordna nedifrån och upp', 'knapp sekundar liten-knapp', function () {
          P.ordnaPlanEfterForslag();
        }, 'Lägg planen i den ordning systemet föreslår ur beteckning och benämning: källare ' +
           'underst, vind överst.'));
        kropp.appendChild(rad0);
      }
    }

    // ---- Lägg till ett plan ----
    kropp.appendChild(el('div', 'liten-rubrik', 'Lägg till plan'));
    var rutnat = el('div', 'bf-planform');
    faltIn(rutnat, 'Beteckning', 'plan-id', ui.nyttPlan.id, 't.ex. 01', function (v) {
      ui.nyttPlan.id = v; rita();
    });
    faltIn(rutnat, 'Benämning', 'plan-namn', ui.nyttPlan.namn,
      ui.nyttPlan.id ? DP.Planlosning.benamningsforslag(ui.nyttPlan.id) : 't.ex. Entréplan',
      function (v) { ui.nyttPlan.namn = v; rita(); });
    kropp.appendChild(rutnat);
    // Beskedet kommer medan planeraren skriver, som för byggnadens namn (beslut 103): hon ska
    // inte trycka på en knapp för att få veta att beteckningen är upptagen.
    var hinder = ui.nyttPlan.id ? P.planHinder(ui.nyttPlan.id) : '';
    if (hinder) { kropp.appendChild(el('div', 'bf-fel', hinder)); }
    // Benämningen är valfri: lämnas den tom får planet ett förslag (berättelse 34), och
    // planeraren ska se vilket innan hon lägger till det.
    if (ui.nyttPlan.id && !ui.nyttPlan.namn && !hinder) {
      kropp.appendChild(el('div', 'bf-notis',
        'Utan benämning får planet namnet <b>' + DP.Planlosning.benamningsforslag(ui.nyttPlan.id) +
        '</b>. Alla plan har ett namn, så att listor och modell går att läsa.'));
    }
    var rad = el('div', 'knapprad hoger');
    var lagg = knapp('Lägg till plan', 'knapp', function () {
      if (!P.laggTillPlan({ id: ui.nyttPlan.id, namn: ui.nyttPlan.namn })) { rita(); return; }
      ui.nyttPlan = { id: '', namn: '' };
      // Tillbaka till beteckningsfältet: nästa plan är nästa sak planeraren skriver, och ett
      // tappat fokus hade betytt ett klick för varje plan.
      ui.fokus = 'plan-id';
      rita();
    });
    lagg.disabled = !!hinder || !ui.nyttPlan.id;
    if (lagg.disabled) { lagg.title = hinder || 'Skriv planets beteckning först'; }
    rad.appendChild(lagg);
    kropp.appendChild(rad);
  }

  // ------------------------------------------------------------------
  // Inläsningsfilen (beslut 70, 83, 89 och 90)
  // ------------------------------------------------------------------
  // Två knappar: *Ta ut inläsningsfil* skriver filen med det som redan är inläst (berättelse
  // 14 och 17), och *Läs in fil* öppnar filväljaren. Samma rad, eftersom det är samma fil på
  // väg ut och in – och mellan dem kan veckor ha gått (berättelse 15).
  //
  // Samma rad i steg 2 och 3: det är **en** fil med tre flikar, och varje inläsning tolkar
  // dem alla (beslut 70). Vad raden säger efteråt beror på vilket steg planeraren står i –
  // hon vill veta hur många *plan* som kom in när hon står i Plan, och hur många *rum* när
  // hon står i Rum.
  function filrad(kropp, b, flik) {
    var w = el('section', 'bf-fil');
    var rad = el('div', 'knapprad');
    rad.appendChild(knapp('Ta ut inläsningsfil', 'knapp sekundar liten-knapp', function () {
      taUtFilen(b);
    }, 'Spara en Excel-fil med flikarna Plan, Rum och Installationer. Det som redan är ' +
       'inläst är ifyllt, så bara det som saknas återstår. Fyll i den själv eller skicka den ' +
       'vidare, och läs in den här igen.'));
    var valj = el('input', 'bf-filval');
    valj.type = 'file';
    // Numbers sparar som .numbers, men filen fylls i och exporteras som .xlsx – det är det
    // formatet fastighetssystemet och Excel delar. Begränsningen är en vägledning: webbläsaren
    // låter planeraren välja *Alla filer* ändå, och då säger inläsningen vad som gick fel.
    valj.accept = '.xlsx,.xlsm,.xls,.csv';
    valj.dataset.falt = 'filval';
    valj.addEventListener('change', function () {
      if (valj.files && valj.files[0]) { lasInFilen(valj.files[0]); }
      // Nollställs värdet går samma fil att läsa in igen – planeraren rättar filen och väljer
      // den en gång till, och utan detta hade webbläsaren tigit om att inget ändrats.
      valj.value = '';
    });
    rad.appendChild(knapp('Läs in fil', 'knapp liten-knapp', function () {
      valj.click();
    }, 'Välj den ifyllda inläsningsfilen. Du kan läsa in en flik i taget – börja med Plan.'));
    rad.appendChild(valj);
    w.appendChild(rad);
    if (ui.filfel) { w.appendChild(el('div', 'bf-fel', ui.filfel)); }
    var inl = P.inlasningStatus(flik);
    if (inl.fil) {
      // Vad filen gav, i klartext: hur många rader i det här steget som kom in, och vad som
      // ligger kvar i den flik som inte är byggd ännu – annars hade planeraren undrat var
      // hennes installationer tog vägen.
      var sort = flik === 'rum' ? ['rum klart', 'rum klara']
        : flik === 'inst' ? ['installation klar', 'installationer klara']
          : ['plan klart', 'plan klara'];
      var txt2 = 'Läst in <b>' + inl.fil.namn + '</b>';
      var delar = [];
      if (inl.raknat.klar) { delar.push(antal(inl.raknat.klar, sort[0], sort[1])); }
      // Förslagen räknas i sina tre sorter (beslut 86). "4 förslag" om en inläsning där tre
      // av dem vill ta bort ett rum hade sagt för lite: planeraren ska se att filen föreslår
      // en borttagning innan hon öppnar gruppen.
      if (inl.raknat.nytt) { delar.push(antal(inl.raknat.nytt, 'nytt', 'nya') + ' som förslag'); }
      if (inl.raknat.andrade) { delar.push(antal(inl.raknat.andrade, 'ändrad', 'ändrade')); }
      if (inl.raknat.bort) { delar.push(antal(inl.raknat.bort, 'rad', 'rader') + ' som saknas i filen'); }
      if (inl.raknat.oplacerad) { delar.push(antal(inl.raknat.oplacerad, 'oplacerad rad', 'oplacerade rader')); }
      if (delar.length) { txt2 += ': ' + delar.join(', '); }
      txt2 += '.';
      if ((inl.fil.ignorerade || []).length) {
        txt2 += ' Bladet ' + inl.fil.ignorerade.join(', ') + ' kändes inte igen på sina ' +
          'kolumnrubriker och lästes inte.';
      }
      w.appendChild(el('div', 'bf-notis', txt2));
    }
    kropp.appendChild(w);
  }

  function taUtFilen(b) {
    ui.filfel = '';
    if (!DP.Inlasningsfil.taUt(P.filArk(), DP.Inlasningsfil.filnamnFor(b.namn))) {
      ui.filfel = 'Excel-biblioteket kunde inte laddas, så filen går inte att ta ut.';
      rita();
    }
  }

  function lasInFilen(fil) {
    ui.filfel = '';
    // Halvskrivna svar hör till den förra filen. Nycklarna är radens plats i filen ('p3'), så
    // en ny inläsning återanvänder dem – och ett svar planeraren började skriva hade följt med
    // till en helt annan rad.
    ui.svar = {};
    DP.Inlasningsfil.las(fil, function (ark) {
      var svar = P.lasInArk(ark, fil.name);
      // En fil där inget blad kändes igen är ingen inläsning: hade steget tigit hade
      // planeraren trott att hennes fil var tom.
      if (svar && !svar.raknat.klar && !svar.raknat.forslag && !svar.raknat.oplacerad
        && !svar.rum && !svar.inst) {
        ui.filfel = 'Filen har inga rader systemet känner igen. Flikarna känns igen på sina ' +
          'kolumnrubriker – Plan och Benämning i fliken Plan – så en fil utan rubrikrad går ' +
          'inte att läsa. Ta ut en tom inläsningsfil och fyll i den.';
      }
      rita();
    }, function (text) {
      ui.filfel = text;
      rita();
    });
  }

  // De tre grupperna (beslut 83). Bara det som återstår visas som en lista att arbeta i:
  // *klart* är redan byggnaden och står i planlistan nedanför, så en andra lista med samma
  // plan hade varit samma uppgift två gånger.
  //
  // Samma kod för Plan och Rum (beslut 90): formen planeraren möter ska vara densamma i varje
  // steg, och det som skiljer raderna är vilka frågor de bär – inte hur en grupp ser ut.
  function inlasningsgrupper(kropp, b, flik) {
    var inl = P.inlasningStatus(flik);
    if (!inl.grupper.forslag.length && !inl.grupper.andrade.length
      && !inl.grupper.bort.length && !inl.grupper.oplacerad.length) { return; }
    var w = el('section', 'bf-oppet');
    if (inl.grupper.forslag.length) {
      var h = el('div', 'bf-grupphuvud');
      h.appendChild(el('div', 'liten-rubrik',
        'Nytt (' + inl.grupper.forslag.length + ')'));
      h.appendChild(godtaAllaKnapp(flik, inl));
      w.appendChild(h);
      w.appendChild(el('p', 'bf-grupptext',
        'Det här tror systemet. Läs skälet och godta det, eller rätta det själv.'));
      inl.grupper.forslag.forEach(function (r) { w.appendChild(forslagsrad(r, flik)); });
    }
    // Ändrat och saknas i filen står för sig (beslut 86): de tre förslagen gör tre olika saker
    // mot byggnaden, och det som skriver om eller tar bort något som finns är det planeraren
    // behöver titta närmast på.
    if (inl.grupper.andrade.length) {
      var ha = el('div', 'bf-grupphuvud');
      ha.appendChild(el('div', 'liten-rubrik',
        'Ändrat (' + inl.grupper.andrade.length + ')'));
      if (!inl.grupper.forslag.length) { ha.appendChild(godtaAllaKnapp(flik, inl)); }
      w.appendChild(ha);
      w.appendChild(el('p', 'bf-grupptext',
        'Det här finns redan, och filen säger något annat. Godta för att ändra byggnaden.'));
      inl.grupper.andrade.forEach(function (r) { w.appendChild(andradRad(r, flik)); });
    }
    if (inl.grupper.bort.length) {
      var hb = el('div', 'bf-grupphuvud');
      hb.appendChild(el('div', 'liten-rubrik',
        'Saknas i filen (' + inl.grupper.bort.length + ')'));
      hb.appendChild(knapp('Låt alla stå', 'knapp sekundar liten-knapp', function () {
        P.avvisaAllaBort(flik);
      }, 'Behåll alla ' + inl.grupper.bort.length + ' i byggnaden och ta bort förslagen. ' +
         '◀ tar tillbaka dem.'));
      w.appendChild(hb);
      w.appendChild(el('p', 'bf-grupptext',
        'Det här finns i byggnaden men inte i filen. Ingenting tas bort förrän du godtar ' +
        'det: en rad som fattas kan vara glömd lika väl som borttagen.'));
      inl.grupper.bort.forEach(function (r) { w.appendChild(bortRad(r, flik)); });
    }
    if (inl.grupper.oplacerad.length) {
      w.appendChild(el('div', 'liten-rubrik',
        'Oplacerat (' + inl.grupper.oplacerad.length + ')'));
      w.appendChild(el('p', 'bf-grupptext',
        'Det här vet systemet inte. Fyll i det som fattas, så hamnar raden på plats.'));
      inl.grupper.oplacerad.forEach(function (r) { w.appendChild(oplaceradRad(r, flik)); });
    }
    kropp.appendChild(w);
  }

  // *Godta alla* tar **alla** förslag i fliken, också de ändrade: det är ett godtagande av
  // filen och inte av en grupp, och ett knappset per grupp hade krävt två klick för det
  // planeraren menar med ett. Knappen sitter i den första gruppen som finns, så att den syns
  // en gång.
  //
  // Förslagen att **ta bort** följer inte med. Att skriva om byggnaden efter filen är en sak;
  // att låta en tom cell radera ett rum är en annan, och den ska aldrig gå i ett svep
  // (beslut 86 och berättelse 74).
  function godtaAllaKnapp(flik, inl) {
    var antalet = inl.grupper.forslag.length + inl.grupper.andrade.length;
    return knapp('Godta alla', 'knapp liten-knapp', function () {
      if (flik === 'inst') { P.godtaAllaInst(); }
      else if (flik === 'rum') { P.godtaAllaRum(); }
      else { P.godtaAllaPlan(); }
    }, 'För in alla ' + antalet + ' förslagen på en gång, utom de som föreslår att något ' +
       'tas bort. ◀ tar tillbaka hela godtagandet.');
  }

  // En ändrad rad: före och efter per fält (berättelse 73). Skillnaden visas som en egen rad
  // per fält och inte som en mening, så att planeraren kan läsa av vad som ändras i en kolumn.
  function andradRad(r, flik) {
    var rad = el('div', 'bf-inlrad andrad');
    rad.dataset.inlrad = r.key;
    rad.appendChild(el('span', 'bf-planbet', beteckningFor(r, flik)));
    var txt = el('div', 'bf-btext');
    txt.appendChild(el('span', 'bf-bnamn', namnEllerForslag(r)));
    r.andring.delar.forEach(function (d) {
      var r2 = el('span', 'bf-fore-efter');
      r2.appendChild(el('span', 'bf-fe-etikett', d.etikett));
      r2.appendChild(el('span', 'bf-fe-fore', d.fore));
      r2.appendChild(el('span', 'bf-fe-pil', '→'));
      r2.appendChild(el('span', 'bf-fe-efter', d.efter));
      txt.appendChild(r2);
    });
    rad.appendChild(txt);
    var verktyg = el('div', 'bf-planverktyg');
    verktyg.appendChild(knapp('Godta', 'knapp sekundar liten-knapp', function () {
      if (flik === 'inst') { P.godtaInst(r.key); }
      else if (flik === 'rum') { P.godtaRum(r.key); }
      else { P.godtaPlan(r.key); }
    }, 'Ändra byggnaden efter filen. ◀ tar tillbaka ändringen.'));
    rad.appendChild(verktyg);
    return rad;
  }

  // En rad som finns i byggnaden men saknas i filen (berättelse 74). Två svar, och båda är
  // ställningstaganden: *Ta bort* och *Låt stå*. Det senare är inget avbrott – ett steg blir
  // grönt när bara klart återstår, så förslaget måste gå att svara nej på.
  function bortRad(r, flik) {
    var rad = el('div', 'bf-inlrad bortforslag');
    rad.dataset.inlrad = r.key;
    rad.appendChild(el('span', 'bf-planbet', beteckningFor(r, flik)));
    var txt = el('div', 'bf-btext');
    txt.appendChild(el('span', 'bf-bnamn', r.falt.namn || r.nyckel));
    (r.fragor || []).forEach(function (f) { txt.appendChild(el('span', 'bf-skal', f.text)); });
    rad.appendChild(txt);
    var verktyg = el('div', 'bf-planverktyg');
    verktyg.appendChild(knapp('Ta bort', 'knapp sekundar liten-knapp', function () {
      if (flik === 'inst') { P.godtaInst(r.key); }
      else if (flik === 'rum') { P.godtaRum(r.key); }
      else { P.godtaPlan(r.key); }
    }, flik === 'plan'
      ? 'Ta bort planet, dess rum och deras installationer. ◀ tar tillbaka allt.'
      : flik === 'rum'
        ? 'Ta bort rummet och dess installationer. ◀ tar tillbaka dem.'
        : 'Ta bort installationen. Kopplade åtgärder försvinner i samma steg, och ◀ tar ' +
          'tillbaka båda.'));
    verktyg.appendChild(knapp('Låt stå', 'knapp sekundar liten-knapp', function () {
      P.avvisaBort(flik, r.key);
    }, 'Behåll det i byggnaden och ta bort förslaget. ◀ tar tillbaka förslaget.'));
    rad.appendChild(verktyg);
    return rad;
  }

  // En förslagsrad: beteckningen, det raden blir, och skälen i klartext (berättelse 24).
  function forslagsrad(r, flik) {
    var rad = el('div', 'bf-inlrad forslag');
    rad.dataset.inlrad = r.key;
    rad.appendChild(el('span', 'bf-planbet', beteckningFor(r, flik)));
    var txt = el('div', 'bf-btext');
    txt.appendChild(el('span', 'bf-bnamn', namnEllerForslag(r)));
    // En installationsrad säger också vilken typ den blir och var den hamnar: typen avgör
    // vilka åtgärder planeraren kan koppla (beslut 81), och det ska hon se innan hon godtar.
    if (flik === 'inst') { txt.appendChild(el('span', 'bf-bstatus', instUnderrad(r))); }
    r.fragor.forEach(function (f) { txt.appendChild(el('span', 'bf-skal', f.text)); });
    rad.appendChild(txt);
    var verktyg = el('div', 'bf-planverktyg');
    verktyg.appendChild(knapp('Godta', 'knapp sekundar liten-knapp', function () {
      if (flik === 'inst') { P.godtaInst(r.key); }
      else if (flik === 'rum') { P.godtaRum(r.key); }
      else { P.godtaPlan(r.key); }
    }, 'För in förslaget. ◀ tar tillbaka det.'));
    rad.appendChild(verktyg);
    return rad;
  }
  // Det raden kommer att heta i modellen: planets beteckning, rummets plan + nummer
  // (beslut 76), eller installationens beteckning och det rum den hamnar i. Är någon av dem
  // ett förslag visas förslaget – planeraren ska se vad raden blir innan hon godtar, inte
  // efteråt.
  function beteckningFor(r, flik) {
    if (flik === 'inst') {
      // Installationens beteckning är det planeraren känner igen den på (HB01); saknas den
      // är det rummet som pekar ut var den sitter.
      if (r.falt.beteckning) { return r.falt.beteckning; }
      var rum = r.falt.rum || (DP.Inlasning.fraga(r, 'rum') || {}).forslag;
      return rum || '–';
    }
    // En rad som föreslår att något tas bort pekar ut det med sin nyckel: beteckningen för ett
    // plan, plan + rumsnummer för ett rum (beslut 76).
    if (r.bort && flik === 'rum') { return r.nyckel; }
    if (flik !== 'rum') { return r.falt.id; }
    var plan = r.falt.plan || (DP.Inlasning.fraga(r, 'plan') || {}).forslag;
    var nr = r.falt.nr || (DP.Inlasning.fraga(r, 'nr') || {}).forslag;
    return plan && nr ? DP.rumNyckel(plan, nr) : (nr || '–');
  }
  // Namnet raden får: det egna om det finns, annars förslaget. Planeraren ska se vad planet,
  // rummet eller installationen kommer att heta innan hon godtar, inte efteråt.
  function namnEllerForslag(r) {
    if (r.falt.namn) { return r.falt.namn; }
    var f = DP.Inlasning.fraga(r, 'benamning');
    return f && f.forslag ? f.forslag : '(utan benämning)';
  }
  // Det en installationsrad säger under sitt namn: typen och var den hamnar. Typen är det
  // viktigaste (beslut 81), och är den okänd står frågan om den bland skälen.
  function instUnderrad(r) {
    var delar = [];
    if (r.falt.typ) {
      delar.push((DP.installationstyper[r.falt.typ] || {}).namn || r.falt.typ);
    }
    var rum = r.falt.rum || (DP.Inlasning.fraga(r, 'rum') || {}).forslag;
    if (rum) { delar.push('i ' + rum); }
    if (r.idFranSystemet) { delar.push('id ' + r.falt.id + ' från systemet'); }
    else if (r.falt.id) { delar.push('id ' + r.falt.id); }
    return delar.join(' · ');
  }

  // En oplacerad rad: varje fråga som saknar förslag får något att svara med. En plan-rad kan
  // bara sakna en sak – beteckningen – medan en rumsrad kan sakna plan, nummer eller båda, och
  // då ska planeraren kunna svara på dem i samma rad utan att leta i en dialog.
  function oplaceradRad(r, flik) {
    var rad = el('div', 'bf-inlrad oplacerad');
    rad.dataset.inlrad = r.key;
    // En oplacerad **rumsrad** går att dra till ett plan i listan nedanför (berättelse 26 och
    // 37), vid sidan av knapparna på raden. Draget är det planeraren når när listan är lång
    // och planet långt ner, och knapparna det hon når när hon redan ser dem – samma handling
    // två vägar, och båda går genom `svaraRum`, så nummerkrocken prövas likadant (beslut 110).
    if (flik === 'rum' && DP.Inlasning.fraga(r, 'plan')) {
      rad.draggable = true;
      rad.classList.add('dragbar');
      rad.addEventListener('dragstart', function (e) {
        ui.rumdrag = { inlkey: r.key, over: null, under: false, planOver: null };
        rad.classList.add('dras');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', r.key);
        }
      });
      rad.addEventListener('dragend', function () { ui.rumdrag = null; rita(); });
    }
    // En oplacerad **installationsrad** går att dra till ett rum i listan nedanför
    // (berättelse 50), vid sidan av knapparna på raden – samma mönster som en oplacerad
    // rumsrad, och båda vägarna går genom `svaraInst`.
    if (flik === 'inst' && DP.Inlasning.fraga(r, 'rum')) {
      rad.draggable = true;
      rad.classList.add('dragbar');
      rad.addEventListener('dragstart', function (e) {
        ui.instdrag = { inlkey: r.key, rumOver: null };
        rad.classList.add('dras');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', r.key);
        }
      });
      rad.addEventListener('dragend', function () { ui.instdrag = null; rita(); });
    }
    var txt = el('div', 'bf-btext');
    txt.appendChild(el('span', 'bf-bnamn',
      (flik === 'rum' ? beteckningFor(r, flik) + ' ' : '') + (r.falt.namn || '(utan benämning)')));
    if (flik === 'inst') { txt.appendChild(el('span', 'bf-bstatus', instUnderrad(r))); }
    r.fragor.forEach(function (f) { txt.appendChild(el('span', 'bf-skal', f.text)); });
    rad.appendChild(txt);
    var saknas = r.fragor.filter(function (f) { return f.forslag == null; })[0];
    if (!saknas) { return rad; }
    if (flik === 'inst') { svarsverktygInst(rad, r, saknas); return rad; }
    if (flik === 'rum') { svarsverktygRum(rad, r, saknas); return rad; }
    if (saknas.slag === 'id') { svarsverktygPlan(rad, r); }
    return rad;
  }

  // Svaret på en installationsrads obesvarade fråga. De två som finns är var den sitter och
  // vilken typ den är, och båda svaras med **knappar** i stället för ett fält: ett rum heter
  // "01-003 Logement 1:1" och en typ "Handbrandsläckare", och det finns ingenting att skriva.
  function svarsverktygInst(rad, r, saknas) {
    if (saknas.slag === 'typ') { return typvalsrad(rad, r); }
    if (saknas.slag === 'rum') { return rumvalsrad(rad, r); }
  }

  // En knapp per installationstyp. Listan är de **signifikanta** typerna (beslut 81): en
  // övrig installation är ingen individ och ska inte gå att välja här.
  function typvalsrad(rad, r) {
    var val = el('div', 'bf-typval');
    DP.signifikantaTyper().forEach(function (id) {
      val.appendChild(knapp(DP.installationstyper[id].namn, 'knapp sekundar liten-knapp',
        function () { P.svaraInst(r.key, 'typ', id); },
        'Installationstypen avgör vilka åtgärder du kan koppla. ◀ tar tillbaka valet.'));
    });
    rad.appendChild(val);
  }

  // En knapp per rum, grupperade per plan: en byggnad kan ha många rum, och "01-003 Logement
  // 1:1" utan sitt plan hade varit en lista planeraren måste läsa igenom. Finns inget rum
  // säger raden det i klartext i stället för att visa en tom rad.
  function rumvalsrad(rad, r) {
    var b = P.byggnad();
    var w = el('div', 'bf-rumval');
    var nagot = false;
    (b ? b.plan.slice().reverse() : []).forEach(function (p) {
      var pa = b.rum.filter(function (x) { return x.plan === p.id; });
      if (!pa.length) { return; }
      nagot = true;
      var grupp = el('div', 'bf-rumvalplan');
      grupp.appendChild(el('span', 'etikett', p.id + ' ' + p.namn));
      var knappar = el('div', 'bf-planval');
      pa.forEach(function (x) {
        var nyckel = DP.rumNyckel(x.plan, x.nr);
        knappar.appendChild(knapp(nyckel + ' ' + x.namn, 'knapp sekundar liten-knapp',
          function () { P.svaraInst(r.key, 'rum', nyckel); },
          'Lägg installationen i ' + nyckel + ' ' + x.namn + '. ◀ tar tillbaka det.'));
      });
      grupp.appendChild(knappar);
      w.appendChild(grupp);
    });
    if (!nagot) {
      rad.appendChild(el('div', 'bf-fel',
        'Byggnaden har inga rum att lägga installationen i. Läs in fliken Rum eller fyll i ' +
        'steg 3 först.'));
      return;
    }
    rad.appendChild(w);
  }

  // Beteckningsfältet för en plan-rad utan beteckning.
  function svarsverktygPlan(rad, r) {
    svarsfalt(rad, r, {
      falt: 'inlid-' + r.key,
      platshallare: 't.ex. 01',
      // Beskedet kommer medan planeraren skriver, som i steg 1 och i fältet för ett nytt
      // plan: en beteckning som redan finns ska hon få veta om innan hon trycker.
      hinder: ui.svar[r.key] ? P.planHinder(ui.svar[r.key]) : '',
      tomTitel: 'Skriv en beteckning i fältet först',
      knappTitel: 'Ge raden en beteckning, så blir den ett plan.',
      gor: function (v) { svaraId(r.key, v); }
    });
  }

  // Svaret på en rumsrads obesvarade fråga. Planet är det vanligaste och svaras med **en
  // knapp per plan**: byggnaden har sällan fler än sex, och en knapp som säger "01
  // Entréplan" är ett klick medan en rullgardin är tre. Rumsnumret och NTA är tal och får
  // ett fält.
  function svarsverktygRum(rad, r, saknas) {
    if (saknas.slag === 'plan') { return planvalsrad(rad, r); }
    var etikett = saknas.slag === 'nta' ? 'NTA i m²' : 'Rumsnummer';
    svarsfalt(rad, r, {
      falt: 'inl' + saknas.slag + '-' + r.key,
      platshallare: saknas.slag === 'nta' ? 't.ex. 36' : 't.ex. 001',
      titel: etikett,
      hinder: '',
      tomTitel: 'Skriv ' + etikett.toLowerCase() + ' i fältet först',
      knappTitel: 'Fyll i ' + etikett.toLowerCase() + ', så hamnar rummet på plats.',
      gor: function (v) { svaraRumFalt(r.key, saknas.slag, v); }
    });
  }

  // En knapp per plan. Finns inget plan säger raden det i klartext i stället för att visa
  // en tom rad: planeraren ska få veta att hon behöver fylla i steg 2 först.
  function planvalsrad(rad, r) {
    var b = P.byggnad();
    var val = el('div', 'bf-planval');
    // Översta planet först, som i steg 2:s lista och i plan-knapparna.
    (b ? b.plan.slice().reverse() : []).forEach(function (p) {
      val.appendChild(knapp(p.id + ' ' + p.namn, 'knapp sekundar liten-knapp', function () {
        P.svaraRum(r.key, 'plan', p.id);
      }, 'Lägg rummet på plan ' + p.id + '. ◀ tar tillbaka det.'));
    });
    if (!val.childNodes.length) {
      rad.appendChild(el('div', 'bf-fel',
        'Byggnaden har inga plan att lägga rummet på. Lägg till planet i steg 2 först.'));
      return;
    }
    rad.appendChild(val);
  }

  // Fältet planeraren svarar i, med *Placera* bredvid. Formen är densamma för en plan-rads
  // beteckning och en rumsrads nummer eller NTA, och skrevs en gång i stället för två:
  // två kopior hade glidit isär så fort någon rättade den ena, och planeraren ska möta
  // samma fält i varje steg.
  //
  // Det som skiljer kommer in som `opt`: `hinder` är beskedet medan hon skriver (plan-raden
  // har ett, rumsraden inte), och `gor` är vad svaret betyder.
  function svarsfalt(rad, r, opt) {
    var verktyg = el('div', 'bf-planverktyg');
    var f2 = el('input', 'bf-falt bf-smalt');
    f2.type = 'text';
    f2.dataset.falt = opt.falt;
    f2.value = ui.svar[r.key] == null ? '' : ui.svar[r.key];
    f2.placeholder = opt.platshallare;
    if (opt.titel) { f2.title = opt.titel; }
    // Omritningen ger beskedet medan planeraren skriver, och `rita()` lämnar tillbaka
    // tangentbordet till samma fält med markören där den stod.
    f2.addEventListener('input', function () { ui.svar[r.key] = f2.value; rita(); });
    f2.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { opt.gor(f2.value); }
    });
    verktyg.appendChild(f2);
    var placera = knapp('Placera', 'knapp sekundar liten-knapp', function () {
      opt.gor(f2.value);
    }, opt.knappTitel);
    // Knappen är utgråad i stället för att tiga: ett klick som inte gör någonting är det
    // planeraren tolkar som att systemet gick sönder, inte som att fältet är tomt.
    placera.disabled = !!opt.hinder || !ui.svar[r.key];
    if (placera.disabled) { placera.title = opt.hinder || opt.tomTitel; }
    verktyg.appendChild(placera);
    rad.appendChild(verktyg);
    if (opt.hinder) { rad.appendChild(el('div', 'bf-fel', opt.hinder)); }
  }

  function svaraId(key, varde) {
    if (P.planHinder(varde)) { rita(); return; }
    delete ui.svar[key];
    P.svaraPlan(key, 'id', varde);
  }
  function svaraRumFalt(key, slag, varde) {
    var v = String(varde || '').trim();
    if (!v) { rita(); return; }
    // Rumsnumret fylls ut till tre siffror här och inte i planeringen: planeraren skriver "1"
    // och menar 001, precis som i filen (beslut 77).
    if (slag === 'nr' && /^\d{1,2}$/.test(v)) { v = DP.Inlasning.pad3(v); }
    delete ui.svar[key];
    P.svaraRum(key, slag, v);
  }

  // Ett fält med etikett i steg 2:s formulär.
  function faltIn(rot2, etikett, namn, varde, platshallare, vid) {
    var w = el('label', 'bf-planfalt');
    w.appendChild(el('span', 'etikett', etikett));
    var f = el('input', 'bf-falt');
    f.type = 'text';
    f.dataset.falt = namn;
    f.value = varde;
    f.placeholder = platshallare;
    f.addEventListener('input', function () { vid(f.value); });
    w.appendChild(f);
    rot2.appendChild(w);
    return f;
  }

  // Planlistan, översta planet högst upp. Varje rad går att dra, och under dragningen visar en
  // **linje** var planet hamnar – ovanför eller nedanför det man pekar på (beslut 106). Att
  // släppa på ett plan och hoppas räcker inte: planeraren ska se platsen innan hon släpper.
  function planlista(b, st) {
    var w = el('div', 'bf-plan');
    var uppifran = st.rader.slice().reverse();
    uppifran.forEach(function (p) {
      var rad = el('div', 'bf-planrad');
      rad.dataset.plan = p.id;
      rad.draggable = true;
      if (ui.drag && ui.drag.id === p.id) { rad.classList.add('dras'); }
      // Linjen ligger på den rad planet hamnar vid, på den sida det hamnar. Den är en kant på
      // raden och inte ett eget element, så den aldrig kan hamna fel när listan rullas.
      if (ui.drag && ui.drag.over === p.id && ui.drag.id !== p.id) {
        rad.classList.add(ui.drag.under ? 'linje-under' : 'linje-over');
      }
      rad.appendChild(el('span', 'bf-planbet', p.id));
      var txt = el('div', 'bf-btext');
      var verktyg = el('div', 'bf-planverktyg');
      if (ui.doper === p.id) {
        // Benämningen ändras **på raden där den står**, inte i en ruta ovanpå sidan: resten av
        // flödet frågar i panelen, och planeraren ska se namnet byta plats i listan direkt.
        // Raden går inte att dra medan den redigeras – då hade ett klick i fältet startat ett
        // drag i stället för att sätta markören.
        rad.draggable = false;
        rad.classList.add('doper');
        var f = el('input', 'bf-falt');
        f.type = 'text';
        f.dataset.falt = 'plannamn-' + p.id;
        f.value = p.namn;
        f.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { ui.doper = null; P.sattPlanNamn(p.id, f.value); rita(); }
          if (e.key === 'Escape') { ui.doper = null; rita(); }
        });
        txt.appendChild(f);
        rad.appendChild(txt);
        verktyg.appendChild(knapp('Klar', 'knapp liten-knapp', function () {
          ui.doper = null;
          P.sattPlanNamn(p.id, f.value);
          rita();
        }, 'Spara benämningen. Enter gör samma sak.'));
        verktyg.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
          ui.doper = null; rita();
        }));
        // Markören hamnar i fältet så fort raden ritats om, som i steg 1:s namnfält.
        ui.fokus = 'plannamn-' + p.id;
      } else {
        txt.appendChild(el('span', 'bf-bnamn', p.namn));
        txt.appendChild(el('span', 'bf-bstatus',
          p.rum ? antal(p.rum, 'rum', 'rum') : 'Skal – inga rum ännu'));
        rad.appendChild(txt);
        verktyg.appendChild(knapp('Döp om', 'knapp sekundar liten-knapp', function () {
          ui.doper = p.id;
          rita();
        }, 'Byt benämning. Beteckningen ' + p.id + ' står kvar: rummen pekar på den.'));
        verktyg.appendChild(knapp('Ta bort', 'knapp sekundar liten-knapp', function () {
          P.taBortPlan(p.id);
        }, p.rum ? 'Tar bort planet och dess ' + p.rum + ' rum. ◀ tar det tillbaka.'
          : 'Tar bort planet. ◀ tar det tillbaka.'));
      }
      rad.appendChild(verktyg);

      rad.addEventListener('dragstart', function (e) {
        ui.drag = { id: p.id, over: null, under: false };
        // Raden bleknar direkt, utan omritning: den dragna raden ska synas vara i rörelse,
        // och en omritning mitt i ett drag tar bort noden webbläsaren drar – se dragover.
        rad.classList.add('dras');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }
      });
      rad.addEventListener('dragover', function (e) {
        if (!ui.drag || ui.drag.id === p.id) { return; }
        e.preventDefault();
        // Övre halvan av raden betyder ovanför, nedre nedanför: linjen följer var pekaren är,
        // inte vilken rad den råkar ligga på.
        var r = rad.getBoundingClientRect();
        var under = (e.clientY - r.top) > r.height / 2;
        if (ui.drag.over !== p.id || ui.drag.under !== under) {
          ui.drag.over = p.id; ui.drag.under = under;
          // Linjen flyttas på de rader som redan står där, och listan ritas **inte** om.
          // Att byta ut DOM mitt i ett drag tar bort den nod webbläsaren drar över, och då
          // slutar den skicka `dragover`: linjen hade fastnat där den först hamnade och
          // planeraren släppt på en plats hon inte såg. Att listan står still under draget
          // är också vad beslut 105 kräver.
          flyttaLinjen();
        }
      });
      rad.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!ui.drag || ui.drag.id === p.id) { ui.drag = null; rita(); return; }
        slappPlan(b, ui.drag.id, p.id, ui.drag.under);
      });
      w.appendChild(rad);
    });
    w.addEventListener('dragend', function () { ui.drag = null; rita(); });
    return w;
  }

  // Linjen som visar var det dragna planet hamnar (beslut 106), flyttad på plats i stället för
  // ritad om. Den är en kant på raden och inget eget element, så den kan aldrig hamna fel när
  // listan rullas – och den är borta så fort raden inte längre är den pekaren står över.
  function flyttaLinjen() {
    var rader = rot.querySelectorAll('.bf-planrad');
    [].forEach.call(rader, function (rad) {
      var pa = ui.drag && ui.drag.over === rad.dataset.plan && ui.drag.id !== rad.dataset.plan;
      rad.classList.toggle('linje-over', !!pa && !ui.drag.under);
      rad.classList.toggle('linje-under', !!pa && !!ui.drag.under);
    });
  }

  // Släppet räknas om från listans ordning (uppifrån) till byggnadens (nedifrån). Linjen
  // *ovanför* plan X i listan betyder i byggnaden "direkt över X", alltså under det plan som
  // ligger över X – och `flyttaPlan` tar planet det ska hamna under.
  function slappPlan(b, dragetId, overId, under) {
    var nedifran = b.plan.map(function (p) { return p.id; });
    var kvar = nedifran.filter(function (id) { return id !== dragetId; });
    var idx = kvar.indexOf(overId);
    ui.drag = null;
    if (idx < 0) { rita(); return; }
    // I listan (uppifrån) är "under målet" = i byggnaden "under målet", och "över målet" i
    // listan = i byggnaden "över målet", alltså under nästa plan uppåt.
    var fore = under ? overId : kvar[idx + 1] || null;
    P.flyttaPlan(dragetId, fore);
  }

  // ------------------------------------------------------------------
  // Steg 3: Rum (beslut 76, 78, 79, 80, 108, 109 och 110)
  // ------------------------------------------------------------------
  // Rummen per plan, i den ordning de ligger i – och **ordningen är placeringen** i modellen
  // (beslut 78). Därför står planen uppifrån och ner som i steg 2 och i byggnadsträdet, och
  // rummen under sitt plan i samma ordning som modellen ritar dem.
  //
  // Areasummorna per plan och byggnad står med (beslut 79). NTA är rummens summa; BRA och BTA
  // är rummens när alla rum har dem och annars räknade ur modellen och märkta *beräknad*
  // (berättelse 43). En summa av **hälften** av rummen visas aldrig: ett tal som ser ut som
  // en area men är hälften av den är värre än inget tal – då räknas hela planet ur modellen.
  function steg3(kropp) {
    var b = P.byggnad();
    if (!b) { return; }
    var st = P.rumStatus();

    kropp.appendChild(el('p', 'forklar',
      'Ett <b>rum</b> pekas ut med plan och rumsnummer, visat <b>01-001</b>: numret löper per ' +
      'plan som i verkligheten, så rum 001 finns på varje plan. <b>NTA</b> är rummets golvyta ' +
      'och ger dess storlek i modellen; <b>NTV</b> är nettovolymen och ger rumshöjden som ' +
      'NTV ÷ NTA, så ett fläktrum blir högt utan att någon mäter höjden. <b>Rumstypen</b> ' +
      'läser systemet ur benämningen och styr var rummet hamnar.'));

    filrad(kropp, b, 'rum');
    inlasningsgrupper(kropp, b, 'rum');

    if (!b.plan.length) {
      kropp.appendChild(el('div', 'bf-notis',
        'Byggnaden har inga plan ännu. Rummen ligger på plan, så fyll i steg 2 först – ' +
        'antingen för hand eller genom att läsa in fliken Plan.'));
      return;
    }
    if (!st.antal) {
      kropp.appendChild(el('div', 'bf-notis',
        'Inga rum ännu. Läs in fliken <b>Rum</b> ur inläsningsfilen: varje rad behöver plan, ' +
        'rumsnummer, benämning och NTA. Så fort ett rum är klart växer skalet i modellen till ' +
        'rummen – <b>korridoren längs byggnaden och rummen på båda sidor i nummerordning</b>, ' +
        'enligt byggnadstypens regel. Du kan också lägga till rummen för hand här nedan.'));
    } else {
      kropp.appendChild(summarad(st));
    }
    // De handritade byggnaderna är ritade rum för rum i `data/` och lämnas orörda av
    // planlösningen (beslut 101). Ett rum som läggs till eller dras om där får sin plats ur
    // regeln medan grannarna behåller sina ritade mått, och då kan de ligga över varandra.
    //
    // Två besked, inte ett. **Innan** något rörts är det en upplysning: byggnaden är ritad,
    // och det du gör här räknas om. **Efter** att ett plan blivit halvt räknat är det en
    // varning med en väg ut – *Rita om planet* lägger ut hela planet enligt regeln
    // (beslut 101, berättelse 58). Att skilja dem är hela poängen: en varning som står där
    // hela tiden slutar planeraren att läsa.
    if (st.handritad) {
      if (st.blandade.length) {
        kropp.appendChild(blandadVarning(b, st));
      } else {
        kropp.appendChild(el('div', 'bf-notis',
          '<b>' + b.namn + '</b> är en ritad byggnad: dess rum har egna mått i systemet. Att dra ' +
          'om ordningen eller lägga till ett rum här räknar om <i>det nya rummets</i> plats ur ' +
          'byggnadstypens regel, men inte grannarnas – så rummen kan hamna över varandra i ' +
          'modellen. Du får då välja att rita om hela planet enligt regeln.'));
      }
    }
    // Alla plan ritas, också de utan rum: ett tomt plan är det planeraren drar ett oplacerat
    // rum till (berättelse 37), och ett plan som inte syns går inte att dra till.
    var lista = el('div', 'bf-rumlista');
    st.plan.slice().reverse().forEach(function (p) {
      lista.appendChild(planensRum(p));
    });
    // Släpps draget utanför ett mål nollställs det här: ett `dragend` på raden hade uteblivit
    // när raden ritats om, och då hade linjen stått kvar efter ett avbrutet drag.
    lista.addEventListener('dragend', function () { ui.rumdrag = null; rita(); });
    kropp.appendChild(lista);
    laggTillRumFormular(kropp, st);
  }

  // ---- Varningen när ett ritat plan blivit halvt räknat (beslut 101, berättelse 58) ----
  // Varningen säger tre saker i den ordningen: vad som är fel (rummen kan ligga över
  // varandra), vilket plan det gäller, och vad *Rita om planet* gör. Det tredje är det
  // viktigaste: omritningen tar bort planets ritade mått, så hela planet läggs ut enligt
  // byggnadstypens regel. Det är inget planeraren kan gissa sig till, och det går inte att
  // se i modellen förrän det är gjort.
  //
  // Ett knapp per blandat plan, inte en knapp för byggnaden: bara det plan hon rört ska
  // ritas om, och de byggnader hon lärt sig på ska inte förändras i onödan (berättelse 58).
  function blandadVarning(b, st) {
    var w = el('div', 'bf-fel bf-ritaom');
    var namnFor = {};
    st.plan.forEach(function (p) { namnFor[p.id] = p.namn || p.id; });
    var listan = st.blandade.map(function (id) {
      return 'plan ' + id + (namnFor[id] ? ' ' + namnFor[id] : '');
    }).join(', ');
    w.appendChild(el('p', null,
      '<b>' + b.namn + '</b> är en ritad byggnad, och på ' + listan + ' har rummen nu både ' +
      'ritade och räknade mått. De två räknas inte i samma koordinatsystem, så <b>rummen kan ' +
      'ligga över varandra i modellen</b>.'));
    w.appendChild(el('p', null,
      'Att <i>rita om planet</i> tar bort planets ritade mått och lägger ut <b>alla</b> dess ' +
      'rum enligt byggnadstypens regel – korridoren längs byggnaden och rummen på båda sidor ' +
      'i nummerordning. Rummens egna uppgifter, installationer och tillsyn rörs inte; det är ' +
      'bara platsen i modellen som räknas om. Grannplanen står kvar som de är ritade.'));
    var rad = el('div', 'knapprad');
    st.blandade.forEach(function (id) {
      rad.appendChild(knapp('Rita om plan ' + id, 'knapp sekundar liten-knapp', function () {
        fragaRitaOm(b, id, namnFor[id]);
      }, 'Lägger ut alla rum på plan ' + id + ' enligt byggnadstypens regel. ◀ tar den ritade ' +
         'formen tillbaka.'));
    });
    w.appendChild(rad);
    return w;
  }

  // Frågan innan omritningen. Den säger hur många rum som får ny plats, eftersom det är
  // skillnaden mellan att rätta ett rum och att lägga om ett helt plan.
  function fragaRitaOm(b, planId, planNamn) {
    var pa = b.rum.filter(function (r) { return r.plan === planId && !r.iRum; });
    var ritade = pa.filter(function (r) { return !!r.rect; }).length;
    DP.Dialog.visa({
      titel: 'Rita om plan ' + planId + (planNamn ? ' ' + planNamn : '') + '?',
      html: '<p>' + antal(pa.length, 'rum', 'rum') + ' på planet får sin plats räknad ur ' +
        'byggnadstypens regel, varav ' + ritade + ' har ritade mått i dag.</p>' +
        '<p>Rummens nummer, benämningar, areor och installationer rörs inte – och tillsynen ' +
        'inte heller. Det är bara <b>platsen i modellen</b> som räknas om.</p>' +
        '<p>Övriga plan i ' + DP.Dialog.esc(b.namn) + ' står kvar som de är ritade. ◀ tar ' +
        'den ritade formen tillbaka.</p>',
      knappar: [
        { text: 'Rita om planet', prim: true, gor: function () { P.ritaOmPlan(planId, b.id); } },
        { text: 'Avbryt' }
      ]
    });
  }

  // ---- Lägg till ett rum för hand (berättelse 26) ----
  // Samma form som *Lägg till plan* i steg 2, och med samma förslag som inläsningen ger:
  // rumstypen läses ur benämningen och NTA föreslås ur rumstypen (beslut 80). Ett rum
  // planeraren skriver in själv ska bli detsamma som ett rum som kom ur filen – annars hade
  // modellen sett olika ut beroende på hur uppgifterna kom in.
  //
  // Formuläret är hopfällt bakom en knapp: vanligaste vägen är filen, och ett formulär som
  // alltid står öppet hade tryckt ner rumslistan som planeraren arbetar i.
  function laggTillRumFormular(kropp, st) {
    if (!ui.laggerTillRum) {
      var rad0 = el('div', 'knapprad');
      rad0.appendChild(knapp('Lägg till rum', 'knapp sekundar liten-knapp', function () {
        ui.laggerTillRum = true;
        // Förvalet är det översta planet, det planeraren ser högst upp i listan, och nästa
        // lediga nummer där: det hon skriver är benämningen, inte numret.
        var overst = st.plan.length ? st.plan[st.plan.length - 1].id : '';
        ui.nyttRum = { plan: overst, nr: P.nastaRumsnummer(overst), namn: '', nta: '', ntv: '' };
        ui.fokus = 'rum-namn';
        rita();
      }, 'Lägg till ett rum som inte finns i inläsningsfilen.'));
      kropp.appendChild(rad0);
      return;
    }
    kropp.appendChild(el('div', 'liten-rubrik', 'Lägg till rum'));
    var w = el('div', 'bf-rumform');
    // Planet väljs med en knapp per plan, som på en oplacerad rad: byggnaden har sällan fler
    // än sex, och en knapp som säger "01 Entréplan" är ett klick medan en rullgardin är tre.
    var planrad = el('div', 'bf-planval');
    st.plan.slice().reverse().forEach(function (p) {
      planrad.appendChild(knapp(p.id + ' ' + p.namn,
        'knapp liten-knapp' + (p.id === ui.nyttRum.plan ? '' : ' sekundar'), function () {
          ui.nyttRum.plan = p.id;
          // Numret följer planet: 001 kan vara ledigt på ett plan och taget på nästa.
          ui.nyttRum.nr = P.nastaRumsnummer(p.id);
          rita();
        }, 'Lägg rummet på plan ' + p.id + '.'));
    });
    w.appendChild(planrad);
    var rutnat = el('div', 'bf-rumfalt');
    faltIn(rutnat, 'Rumsnummer', 'rum-nr', ui.nyttRum.nr, 't.ex. 001', function (v) {
      ui.nyttRum.nr = v; rita();
    });
    faltIn(rutnat, 'Benämning', 'rum-namn', ui.nyttRum.namn, 't.ex. Logement 1:3', function (v) {
      ui.nyttRum.namn = v; rita();
    });
    faltIn(rutnat, 'NTA i m²', 'rum-nta', ui.nyttRum.nta,
      String((DP.rumstyper[foreslagenRumstyp()] || {}).nta || 36), function (v) {
        ui.nyttRum.nta = v; rita();
      });
    faltIn(rutnat, 'NTV i m³', 'rum-ntv', ui.nyttRum.ntv, 'valfri', function (v) {
      ui.nyttRum.ntv = v; rita();
    });
    w.appendChild(rutnat);
    kropp.appendChild(w);

    // Beskedet medan planeraren skriver, som för planets beteckning och byggnadens namn
    // (beslut 103): ett upptaget nummer ska hon få veta om innan hon trycker.
    var hinder = P.rumHinder(ui.nyttRum.plan, ui.nyttRum.nr);
    if (hinder) { kropp.appendChild(el('div', 'bf-fel', hinder)); }
    // Rumstypen och NTA är förslag planeraren ska se innan rummet finns: hon skriver
    // "Logement 1:3" och ska förstå att systemet läste Logement ur det.
    if (!hinder && ui.nyttRum.plan) {
      var typ = DP.rumstyper[foreslagenRumstyp()];
      var txt = 'Rummet blir <b>' + DP.rumNyckel(ui.nyttRum.plan, pad(ui.nyttRum.nr)) +
        '</b> med rumstypen <b>' + typ.namn + '</b>';
      txt += ui.nyttRum.namn ? ', läst ur benämningen.' : ' – benämningen säger ännu ingenting.';
      if (!String(ui.nyttRum.nta).trim()) {
        txt += ' NTA blir ' + (typ.nta || 36) + ' m², standard för ' + typ.namn +
          '. Den ger rummets storlek i modellen.';
      }
      kropp.appendChild(el('div', 'bf-notis', txt));
    }
    var rad = el('div', 'knapprad hoger');
    rad.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
      ui.laggerTillRum = false; rita();
    }));
    var lagg = knapp('Lägg till rum', 'knapp', function () {
      if (!P.laggTillRum({ plan: ui.nyttRum.plan, nr: ui.nyttRum.nr, namn: ui.nyttRum.namn,
        nta: ui.nyttRum.nta, ntv: ui.nyttRum.ntv })) { rita(); return; }
      // Nästa rum är nästa sak planeraren skriver: numret räknas upp och markören går
      // tillbaka till benämningen, som efter *Lägg till plan* i steg 2.
      ui.nyttRum = { plan: ui.nyttRum.plan, nr: P.nastaRumsnummer(ui.nyttRum.plan),
        namn: '', nta: '', ntv: '' };
      ui.fokus = 'rum-namn';
      rita();
    });
    lagg.disabled = !!hinder;
    if (lagg.disabled) { lagg.title = hinder; }
    rad.appendChild(lagg);
    kropp.appendChild(rad);
  }
  function foreslagenRumstyp() {
    return DP.rumstypFor(ui.nyttRum.namn) || DP.rumstypOvrig;
  }
  function pad(nr) {
    var t = String(nr == null ? '' : nr).trim();
    return /^\d{1,3}$/.test(t) ? DP.Inlasning.pad3(t) : t;
  }

  // Areorna för hela byggnaden, överst: det planeraren jämför mot fastighetssystemets siffra.
  //
  // NTA är alltid rummens summa. BRA och BTA är rummens när **alla** rum har dem, och annars
  // räknade ur modellen – och då märkta ***beräknad***, så att planeraren ser vad som kommer
  // ur filen och vad systemet räknat (beslut 79, berättelse 43). Märkningen är hela poängen:
  // ett beräknat tal är modellens svar på vad den här formen är, inte fastighetssystemets
  // mått, och de två ska inte gå att blanda ihop.
  function summarad(st) {
    var w = el('div', 'bf-summa');
    summafalt(w, 'Rum', st.antal);
    summafalt(w, 'NTA', area(st.nta));
    summafalt(w, 'BRA', areamarkt(st.bra, st.braBeraknad), st.braBeraknad && BRA_TITEL);
    summafalt(w, 'BTA', areamarkt(st.bta, st.btaBeraknad), st.btaBeraknad && BTA_TITEL);
    // Vad *beräknad* betyder står **i** summaraden och inte i styckets förklaring överst:
    // ordet syns bara ibland, och en mening som förklarar något som inte står där hade
    // planeraren fått läsa förgäves. Raden är borta när inget tal är beräknat.
    if (st.braBeraknad || st.btaBeraknad) {
      w.appendChild(el('div', 'bf-summanot',
        '<i>beräknad</i> = rummen saknar arean, så systemet räknade den ur modellen: ' +
        'BRA innanför ytterväggarna, BTA utanför.'));
    }
    return w;
  }
  var BRA_TITEL = 'Något rum saknar BRA, så arean är räknad ur modellen: ytan innanför ' +
    'ytterväggarna.';
  var BTA_TITEL = 'Något rum saknar BTA, så arean är räknad ur modellen: ytan utanför ' +
    'ytterväggarna.';
  // Arean med sin märkning. Ordet står **efter** talet och inte som en fotnot: planeraren
  // läser summan och ska i samma blick se varifrån den kom.
  function areamarkt(v, beraknad) {
    if (v == null) { return '–'; }
    return area(v) + (beraknad ? ' <i class="bf-beraknad">beräknad</i>' : '');
  }
  // Namnet är CSS-klassens: *område* är ett eget domänbegrepp i systemet (byggnader som
  // ligger nära varandra), och att återanvända ordet för en ruta i en summarad hade gjort
  // båda otydliga.
  function summafalt(w, etikett, varde, titel) {
    var r = el('div', 'bf-summafalt');
    if (titel) { r.title = titel; }
    r.appendChild(el('span', 'etikett', etikett));
    r.appendChild(el('span', 'varde', String(varde)));
    w.appendChild(r);
  }
  function area(v) { return v == null ? '–' : Math.round(v * 10) / 10 + ' m²'; }

  // Ett plan med sina rum. Tre saker händer här:
  //
  //   * Rumstypen går att byta med ett klick (beslut 80): systemet läste den ur benämningen,
  //     och en gissning planeraren inte kan rätta är värre än ingen gissning.
  //   * Varje rad går att **dra**, eftersom ordningen *är* placeringen i modellen (beslut 78):
  //     drar hon om ordningen byter rummet grannar i byggnaden (berättelse 44).
  //   * Planet självt är ett **droppmål**, så ett rum kan dras till ett annat plan – också till
  //     ett plan som ännu inte har några rum (berättelse 37 och 38).
  //
  // Linjen visar var rummet hamnar innan hon släpper (beslut 106), precis som i planlistan,
  // och är en kant på raden och inget eget element – så den kan aldrig hamna fel när listan
  // rullas.
  function planensRum(p) {
    var w = el('section', 'bf-planrum');
    w.dataset.rumplan = p.id;
    if (ui.rumdrag && ui.rumdrag.planOver === p.id) { w.classList.add('malplan'); }
    var h = el('div', 'bf-grupphuvud');
    // Planets areor står i rubriken: NTA ur rummen, och BRA och BTA bredvid den – märkta
    // *beräknad* när de kom ur modellen (beslut 79). Märkningen är **per plan** och inte
    // bara i botten: i ett hus där källaren saknar BRA ska planeraren se vilket plan som
    // är systemets tal och vilka som är fastighetssystemets.
    var areor = antal(p.rum.length, 'rum', 'rum') + ' · NTA ' + area(p.nta);
    if (p.bra != null) { areor += ' · BRA ' + areamarkt(p.bra, p.braBeraknad); }
    if (p.bta != null) { areor += ' · BTA ' + areamarkt(p.bta, p.btaBeraknad); }
    var rubrik = el('div', 'liten-rubrik', p.id + ' ' + p.namn +
      ' <span class="bf-planareor">' + areor + '</span>');
    h.appendChild(rubrik);
    w.appendChild(h);
    if (!p.rum.length) {
      w.appendChild(el('div', 'bf-tomtplan',
        'Inga rum ännu – planet är ett <b>skal</b> i modellen. Dra ett oplacerat rum hit, ' +
        'eller lägg till ett nedan.'));
    }
    p.rum.forEach(function (r) {
      var rad = el('div', 'bf-rumrad');
      rad.dataset.rum = r.nyckel;
      // Raden går inte att dra medan typvalet står öppet: ett klick på en typknapp hade
      // startat ett drag i stället för att välja typen.
      rad.draggable = ui.rumstyp !== r.nyckel;
      if (ui.rumdrag && ui.rumdrag.nyckel === r.nyckel) { rad.classList.add('dras'); }
      if (ui.rumdrag && ui.rumdrag.over === r.nyckel && ui.rumdrag.nyckel !== r.nyckel) {
        rad.classList.add(ui.rumdrag.under ? 'linje-under' : 'linje-over');
      }
      rad.appendChild(el('span', 'bf-planbet', r.nyckel));
      var txt = el('div', 'bf-btext');
      txt.appendChild(el('span', 'bf-bnamn', r.namn));
      var delar = [];
      if (r.rumstypNamn) { delar.push(r.rumstypNamn); }
      if (r.nta != null) { delar.push('NTA ' + area(r.nta)); }
      if (r.ntv != null) { delar.push('NTV ' + Math.round(r.ntv * 10) / 10 + ' m³'); }
      if (r.hojd != null) { delar.push('höjd ' + r.hojd + ' m'); }
      if (r.bra != null) { delar.push('BRA ' + area(r.bra)); }
      if (r.bta != null) { delar.push('BTA ' + area(r.bta)); }
      if (r.temp) { delar.push('temperaturreglerad'); }
      txt.appendChild(el('span', 'bf-bstatus', delar.join(' · ')));
      rad.appendChild(txt);
      var verktyg = el('div', 'bf-planverktyg');
      if (ui.rumstyp === r.nyckel) {
        // Typvalet ligger **på rummets rad**, som omdöpningen av ett plan gör: planeraren ska
        // se rummet byta färg och plats i modellen direkt, inte i en ruta ovanpå sidan.
        var val = el('div', 'bf-typval');
        Object.keys(DP.rumstyper).forEach(function (id) {
          var k = knapp(DP.rumstyper[id].namn,
            'knapp liten-knapp' + (id === r.rumstyp ? '' : ' sekundar'), function () {
              ui.rumstyp = null;
              P.sattRumstyp(r.nyckel, id);
            }, 'Rumstypen styr rummets plats och färg i modellen.');
          val.appendChild(k);
        });
        rad.appendChild(val);
        verktyg.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
          ui.rumstyp = null; rita();
        }));
      } else {
        verktyg.appendChild(knapp('Byt typ', 'knapp sekundar liten-knapp', function () {
          ui.rumstyp = r.nyckel;
          rita();
        }, 'Byt rumstyp. Den styr var rummet hamnar i modellen och vilken färg golvet får.'));
        verktyg.appendChild(knapp('Ta bort', 'knapp sekundar liten-knapp', function () {
          P.taBortRum(r.nyckel);
        }, 'Tar bort rummet och installationerna i det. ◀ tar det tillbaka.'));
      }
      rad.appendChild(verktyg);
      rumDrag(rad, r.nyckel, p.id);
      w.appendChild(rad);
    });
    // Planet som droppmål: pekaren står på rubriken eller på den tomma ytan mellan rummen,
    // och då hamnar rummet **sist** på planet. Utan det hade ett plan utan rum inte gått att
    // dra till, och det är just det plan ett oplacerat rum oftast ska till.
    w.addEventListener('dragover', function (e) {
      if (!ui.rumdrag || e.target.closest('.bf-rumrad')) { return; }
      e.preventDefault();
      if (ui.rumdrag.planOver !== p.id || ui.rumdrag.over) {
        ui.rumdrag.planOver = p.id;
        ui.rumdrag.over = null;
        flyttaRumsLinjen();
      }
    });
    w.addEventListener('drop', function (e) {
      if (!ui.rumdrag || e.target.closest('.bf-rumrad')) { return; }
      e.preventDefault();
      slappRum(p.id, null);
    });
    return w;
  }

  // Dragningen av en rumsrad, skriven en gång: den gäller både ett rum som ligger i byggnaden
  // och en oplacerad inläst rad, eftersom det som skiljer dem är vad släppet *betyder* och
  // inte hur draget ser ut. `nyckel` är rummets nyckel, eller null när en inläst rad dras –
  // då bär `ui.rumdrag.inlkey` raden.
  function rumDrag(rad, nyckel, planId) {
    rad.addEventListener('dragstart', function (e) {
      if (!nyckel) { return; }
      ui.rumdrag = { nyckel: nyckel, over: null, under: false, planOver: null };
      // Raden bleknar direkt, utan omritning: en omritning mitt i ett drag tar bort den nod
      // webbläsaren drar, och då slutar den skicka dragover.
      rad.classList.add('dras');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', nyckel);
      }
    });
    rad.addEventListener('dragover', function (e) {
      if (!ui.rumdrag || ui.rumdrag.nyckel === nyckel) { return; }
      e.preventDefault();
      // Övre halvan betyder före, nedre efter: linjen följer var pekaren är, inte vilken rad
      // den råkar ligga på.
      var box = rad.getBoundingClientRect();
      var under = (e.clientY - box.top) > box.height / 2;
      if (ui.rumdrag.over !== nyckel || ui.rumdrag.under !== under || ui.rumdrag.planOver) {
        ui.rumdrag.over = nyckel;
        ui.rumdrag.under = under;
        ui.rumdrag.planOver = null;
        // Linjen flyttas på de rader som redan står där, och listan ritas **inte** om: att
        // byta ut DOM mitt i ett drag tar bort noden webbläsaren drar över (beslut 105).
        flyttaRumsLinjen();
      }
    });
    rad.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!ui.rumdrag || ui.rumdrag.nyckel === nyckel) { ui.rumdrag = null; rita(); return; }
      // Linjen under raden betyder "efter den", alltså före nästa rum på planet.
      slappRum(planId, ui.rumdrag.under ? nastaRumPa(planId, nyckel) : nyckel);
    });
  }

  // Rummet efter `nyckel` på samma plan, eller null när det är det sista. Flytten tar rummet
  // det ska hamna **före**, så "efter det sista" är "sist på planet".
  function nastaRumPa(planId, nyckel) {
    var b = P.byggnad();
    if (!b) { return null; }
    var pa = b.rum.filter(function (r) { return r.plan === planId && !r.iRum; })
      .map(function (r) { return DP.rumNyckel(r.plan, r.nr); });
    var idx = pa.indexOf(nyckel);
    return idx >= 0 && pa[idx + 1] ? pa[idx + 1] : null;
  }

  // Släppet. Ett rum som ligger i byggnaden flyttas; en oplacerad inläst rad får sitt plan,
  // och då är det inläsningens egen väg – samma som knappen *02 Plan 2* på raden – så
  // nummerkrocken prövas där den hör hemma (beslut 110).
  function slappRum(planId, foreNyckel) {
    var d = ui.rumdrag;
    ui.rumdrag = null;
    if (!d) { rita(); return; }
    if (d.inlkey) {
      P.svaraRum(d.inlkey, 'plan', planId);
      return;
    }
    if (!P.flyttaRum(d.nyckel, planId, foreNyckel)) { rita(); }
  }

  // Linjen som visar var det dragna rummet hamnar (beslut 106), flyttad på plats i stället för
  // ritad om – av samma skäl som i planlistan. Planet som helhet märks när pekaren står
  // utanför rummen: då hamnar rummet sist på det planet, och ett plan utan rum har ingen rad
  // att lägga en linje på.
  function flyttaRumsLinjen() {
    var rader = rot.querySelectorAll('.bf-rumrad');
    [].forEach.call(rader, function (rad) {
      var pa = ui.rumdrag && ui.rumdrag.over === rad.dataset.rum
        && ui.rumdrag.nyckel !== rad.dataset.rum;
      rad.classList.toggle('linje-over', !!pa && !ui.rumdrag.under);
      rad.classList.toggle('linje-under', !!pa && !!ui.rumdrag.under);
    });
    var plan = rot.querySelectorAll('.bf-planrum');
    [].forEach.call(plan, function (w) {
      w.classList.toggle('malplan',
        !!(ui.rumdrag && ui.rumdrag.planOver === w.dataset.rumplan));
    });
  }

  // ------------------------------------------------------------------
  // Steg 4: Installationer (beslut 81, 86, 87, 109 och 111)
  // ------------------------------------------------------------------
  // De **signifikanta** installationerna grupperade per plan och rum, i samma ordning som
  // byggnadsträdet och modellen: planeraren letar efter en släckare där hon vet att den
  // sitter, inte i en lista sorterad på id.
  //
  // Det som skiljer steget från steg 3 är **installationstypen**. Den avgör vilka åtgärder
  // som går att koppla (beslut 81), så en okänd typ är ingenting systemet gissar om: raden
  // blir oplacerad, och planeraren väljer typen ur listan innan steget blir grönt. Ett rum
  // med fel rumstyp blir felfärgat i modellen; en installation med fel typ får fel tillsyn.
  function steg4(kropp) {
    var b = P.byggnad();
    if (!b) { return; }
    var st = P.instStatus();

    kropp.appendChild(el('p', 'forklar',
      'En <b>signifikant installation</b> registreras som individ med eget id och ska ha ' +
      'minst en kopplad åtgärd – det är dem du planerar tillsyn för i Planering. Fliken ' +
      '<b>Installationer</b> har bara dem: en installation behöver bara <b>plan och ' +
      'rumsnummer</b> för att hamna i rätt rum. <b>Installationstypen</b> läser systemet ur ' +
      'benämningen, och en typ det inte känner igen måste du välja själv: typen avgör vilka ' +
      'åtgärder du kan koppla. Övriga installationer – belysning, brytare, uttag – lägger ' +
      'systemet till själv utifrån rumstypen.'));

    filrad(kropp, b, 'inst');
    inlasningsgrupper(kropp, b, 'inst');

    if (!b.rum.length) {
      kropp.appendChild(el('div', 'bf-notis',
        'Byggnaden har inga rum ännu. Installationerna sitter i rum, så fyll i steg 3 först – ' +
        'antingen för hand eller genom att läsa in fliken Rum.'));
      return;
    }
    if (!st.antal) {
      kropp.appendChild(el('div', 'bf-notis',
        'Inga installationer ännu. Läs in fliken <b>Installationer</b> ur inläsningsfilen: ' +
        'varje rad behöver plan, rumsnummer och en benämning. Lämnar du <b>Id</b> tomt ger ' +
        'systemet ett. Så fort en installation är klar syns den i modellen till höger – ' +
        'slå på <b>Röntgen</b> för att se dem genom väggarna. Du kan också lägga till dem ' +
        'för hand här nedan.'));
    } else {
      kropp.appendChild(instSummarad(st));
    }
    // Installationer som **väntar på sitt rum**: raden i filen var klar, men rummet är ett
    // förslag i steg 3 som ännu inte godtagits (beslut 110). Det är inget fel, och ska inte se
    // ut som ett – planeraren har ett steg kvar att ta i steg 3, inte ett misstag att rätta
    // här. Därför en notis och inte en felruta, och texten pekar dit hon ska.
    if ((st.vantande || []).length) {
      kropp.appendChild(el('div', 'bf-notis',
        antal(st.vantande.length, 'installation väntar', 'installationer väntar') +
        ' på sitt rum: ' + st.vantande.map(function (i) {
          return (i.beteckning || i.benamning) + ' i ' + i.rum;
        }).join(', ') + '. Rummet är ett <b>förslag i steg 3</b> – godta det, så syns ' +
        (st.vantande.length === 1 ? 'installationen' : 'installationerna') + ' i modellen.'));
    }
    // Installationer vars rum inte finns och inte är på väg: de kan inte stå under något
    // plan, och att tiga om dem hade betytt att planeraren inte ser dem alls.
    if ((st.hemlosa || []).length) {
      kropp.appendChild(el('div', 'bf-fel',
        antal(st.hemlosa.length, 'installation', 'installationer') + ' sitter i ett rum som ' +
        'inte finns: ' + st.hemlosa.map(function (i) {
          return (i.beteckning || i.benamning) + ' i ' + i.rum;
        }).join(', ') + '. Lägg tillbaka rummet i steg 3, eller ta bort installationen.'));
    }
    var lista = el('div', 'bf-instlista');
    st.plan.slice().reverse().forEach(function (p) { lista.appendChild(planensInst(p)); });
    // Släpps draget utanför ett mål nollställs det här, som i steg 3.
    lista.addEventListener('dragend', function () { ui.instdrag = null; rita(); });
    kropp.appendChild(lista);
    laggTillInstFormular(kropp, st);
  }

  // Antalen överst: de signifikanta är de planeraren planerar tillsyn för, och de övriga är
  // de modellen fyller byggnaden med (berättelse 57). Att de står vid sidan av varandra är
  // hela pedagogiken: planeraren ska se att hon inte behöver fylla i 200 vägguttag.
  function instSummarad(st) {
    var w = el('div', 'bf-summa');
    summafalt(w, 'Signifikanta', st.antal);
    summafalt(w, 'Övriga', st.ovriga);
    summafalt(w, 'Rum med installationer', st.plan.reduce(function (s, p) {
      return s + p.rum.filter(function (r) { return r.inst.length; }).length;
    }, 0));
    return w;
  }

  // Ett plan med sina rum och deras installationer. Två saker händer här, som i steg 3:
  //
  //   * Installationstypen går att byta med ett klick (beslut 81): systemet läste den ur
  //     benämningen, och en gissning planeraren inte kan rätta är värre än ingen gissning.
  //   * Varje rad går att **dra** till ett annat rum (beslut 87 och berättelse 50). Det är
  //     samma installation: id:t består, och kopplade åtgärder följer med.
  //
  // Rummet är droppmålet och inte installationsraden: en installation sitter i ett rum, och
  // ordningen inom rummet betyder ingenting – platsen i rummet räknar planlösningen fram.
  // Därför finns ingen linje här, som det gör i steg 2 och 3; rummet märks i sin helhet.
  function planensInst(p) {
    var w = el('section', 'bf-planinst');
    w.dataset.instplan = p.id;
    var h = el('div', 'bf-grupphuvud');
    h.appendChild(el('div', 'liten-rubrik', p.id + ' ' + p.namn +
      ' <span class="bf-planareor">' + antal(p.antal, 'installation', 'installationer') +
      '</span>'));
    w.appendChild(h);
    p.rum.forEach(function (r) { w.appendChild(rummetsInst(r)); });
    return w;
  }

  // Ett rum med sina installationer. Rummet är droppmålet – hela rutan, så att den går att
  // träffa också när installationsraderna ligger tätt.
  function rummetsInst(r) {
    var w = el('div', 'bf-instrum');
    w.dataset.instrum = r.nyckel;
    if (ui.instdrag && ui.instdrag.rumOver === r.nyckel) { w.classList.add('malrum'); }
    w.appendChild(el('div', 'bf-instrumhuvud',
      '<span class="bf-planbet">' + r.nyckel + '</span> <b>' + r.namn + '</b>' +
      (r.inst.length ? '' : ' <span class="bf-instrumtom">inga installationer</span>')));
    r.inst.forEach(function (i) { w.appendChild(instrad(i, r)); });
    w.addEventListener('dragover', function (e) {
      if (!ui.instdrag) { return; }
      e.preventDefault();
      if (ui.instdrag.rumOver !== r.nyckel) {
        ui.instdrag.rumOver = r.nyckel;
        // Märket flyttas på de rutor som redan står där, och listan ritas **inte** om: att
        // byta ut DOM mitt i ett drag tar bort noden webbläsaren drar över (beslut 105).
        flyttaInstMarket();
      }
    });
    w.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      slappInst(r.nyckel);
    });
    return w;
  }

  // Formuläret för den nya apparaten, på installationens rad (beslut 91–95, berättelse 75).
  //
  // Bara apparatens uppgifter frågas om – fabrikat, modell, installationsdatum, externt id och
  // typen när den nya apparaten är en annan sort. Rummet och id:t står inte med: de hör till
  // *installationen*, och det som gör utbytet till ett utbyte och inte till en ny installation
  // är just att de består.
  function ersattFormular(i) {
    var n = ui.nyApparat || {};
    var w = el('div', 'bf-ersatt');
    w.appendChild(el('div', 'liten-rubrik', 'Den nya apparaten'));
    var rutnat = el('div', 'bf-instfalt');
    faltIn(rutnat, 'Installationsdatum', 'ers-datum', n.datum, 't.ex. 2026-11-25',
      function (v) { n.datum = v; rita(); });
    faltIn(rutnat, 'Fabrikat', 'ers-fabrikat', n.fabrikat, 'valfritt',
      function (v) { n.fabrikat = v; rita(); });
    faltIn(rutnat, 'Modell', 'ers-modell', n.modell, 'valfri',
      function (v) { n.modell = v; rita(); });
    faltIn(rutnat, 'Externt id', 'ers-externt', n.externtId, 'valfritt',
      function (v) { n.externtId = v; rita(); });
    w.appendChild(rutnat);

    // Typvalet är **hopfällt** bakom en knapp, till skillnad från i *Lägg till installation*:
    // en apparat byts nästan alltid mot en av samma sort, och en rad typknappar framför
    // planeraren hade frågat om något hon sällan vill ändra. Öppnar hon det får hon beskedet
    // om vad ett typbyte gör med tillsynen (beslut 94) innan hon väljer.
    var nyTyp = n.typ || i.typ;
    if (n.visaTyp) {
      w.appendChild(el('div', 'liten-rubrik', 'Installationstyp'));
      var typval = el('div', 'bf-typval');
      DP.signifikantaTyper().forEach(function (id) {
        typval.appendChild(knapp(DP.installationstyper[id].namn,
          'knapp liten-knapp' + (id === nyTyp ? '' : ' sekundar'), function () {
            n.typ = id;
            rita();
          }, 'Typen avgör vilka åtgärder du kan koppla i Planering steg 5.'));
      });
      w.appendChild(typval);
    } else {
      var rad0 = el('div', 'knapprad');
      rad0.appendChild(knapp('Den nya är av en annan typ', 'lank', function () {
        n.visaTyp = true;
        rita();
      }, 'Visa listan med installationstyper. Kopplingar som inte gäller den nya typen ' +
         'följer inte med.'));
      w.appendChild(rad0);
    }

    var hinder = P.ersattHinder(i.id, { datum: n.datum, typ: n.typ });
    if (hinder) { w.appendChild(el('div', 'bf-fel', hinder)); }
    else { w.appendChild(ersattBesked(i, P.ersattStatus(i.id, { typ: n.typ }))); }

    var rad = el('div', 'knapprad hoger');
    var gor = knapp('Ersätt apparaten', 'knapp', function () {
      // Formuläret stängs **före** utbytet och inte efter: ändringen ritar om steget genom
      // prenumeranten, och ett `ersatter` som stod kvar hade ritat formuläret en gång till –
      // nu med den nya apparatens uppgifter, som om ännu ett utbyte väntade.
      ui.ersatter = null;
      ui.nyApparat = null;
      var svar = P.ersattInst(i.id, { datum: n.datum, fabrikat: n.fabrikat, modell: n.modell,
        externtId: n.externtId, typ: n.typ });
      if (!svar) { rita(); return; }
      fragaEfterUtbyte(i, svar);
    });
    gor.disabled = !!hinder;
    if (gor.disabled) { gor.title = hinder; }
    rad.appendChild(gor);
    w.appendChild(rad);
    return w;
  }

  // Beskedet om vad utbytet gör, innan planeraren trycker. Tillsynen är det hon behöver veta
  // om: att den består är hela poängen med ett utbyte (beslut 91), och att den delvis inte gör
  // det vid ett typbyte är det enda som kan överraska henne (beslut 94).
  //
  // Vad som följer med räknas **inte** här utan i `P.ersattStatus`, samma uträkning utbytet
  // självt gör (beslut 61). Hade vyn räknat hade beskedet före och frågan efteråt kunnat säga
  // olika saker om samma utbyte.
  function ersattBesked(i, vad) {
    var html = 'Installationen behåller <b>id ' + DP.Dialog.esc(i.id) + '</b>, sitt rum och ' +
      'sin beteckning. ' +
      (i.fabrikat || i.modell
        ? 'Den gamla apparaten – ' + DP.Dialog.esc([i.fabrikat, i.modell].filter(Boolean).join(' ')) +
          ' – sparas '
        : 'Den gamla apparaten sparas ') +
      'som <b>' + DP.Dialog.esc(vad.version) + '</b> och syns när du klickar på installationen.';
    if (vad.byterTyp) {
      html += ' Den nya är <b>' +
        DP.Dialog.esc(DP.installationstyper[vad.nyTyp].namn) + '</b>, så ' +
        (vad.kvar.length
          ? vad.kvar.length + ' av ' + vad.kopplade + ' kopplade åtgärder följer med'
          : 'ingen av de ' + vad.kopplade + ' kopplade åtgärderna följer med') +
        ' – resten syns som saknade i Planering steg 5.';
    } else if (vad.kopplade) {
      html += ' Tillsynen är densamma: ' +
        antal(vad.kopplade, 'kopplad åtgärd', 'kopplade åtgärder') +
        ' pekar på id:t och följer med.';
    }
    return el('div', 'bf-notis', html);
  }

  // Frågan efter utbytet (beslut 97, berättelse 81 och 82). Den är **vägledning och inget lås**:
  // planeringen är redan ändrad när frågan kommer, och *Nej* öppnar bara steg 5 så att
  // planeraren kan koppla om där. Därför har den inget Avbryt – det finns inget att avbryta,
  // och ett ◀ är vägen tillbaka.
  function fragaEfterUtbyte(i, svar) {
    var namn = (i.beteckning ? i.beteckning + ' ' : '') + i.benamning;
    var html = '<p>Du har ersatt apparaten i <b>' + DP.Dialog.esc(namn) + '</b>. ' +
      'Installationen och id:t består, och den gamla apparaten ligger kvar som <b>' +
      DP.Dialog.esc(svar.version) + '</b>.</p>';
    if (svar.tappade.length) {
      // Vilka åtgärder som föll bort sägs i klartext och inte bara som ett antal: planeraren
      // ska kunna koppla om just dem, och "3 åtgärder" säger inte vilka.
      var namnen = svar.tappade.map(function (k) {
        var a = P.atgard(k.atgard);
        return a ? a.namn : k.atgard;
      });
      html += '<p><b>' + antal(svar.tappade.length, 'åtgärd följde', 'åtgärder följde') +
        ' inte med</b>, eftersom den nya apparaten är av en annan typ: ' +
        DP.Dialog.esc(namnen.join(', ')) + '. Installationen syns nu som saknad i steg 5.</p>';
    }
    html += '<p>Ska den nya ha samma tillsyn som förut?</p>';
    DP.Dialog.visa({
      titel: 'Ska den nya ha samma tillsyn som förut?',
      html: html,
      bredd: 560,
      knappar: [
        { text: 'Ja, samma tillsyn', prim: true },
        { text: 'Nej, visa den i Planering', gor: function () {
          // Ordningen är den befintliga: öppna steget först, visa huvudsteget sedan
          // (se Balanseringens länk till steg 4 i `vyer.js`). Markeringen blinkar i
          // modellen, så att planeraren ser *vilken* installation steg 5 gäller.
          DP.Flode.oppnaSteg(5);
          DP.Vyer.visa('planering');
          var inst = P.inst(i.id);
          if (inst && DP.viewer) { DP.viewer.blinka([inst], 2200, 0xe07b26); }
        } }
      ]
    });
  }

  // En installationsrad: beteckningen, benämningen, typen och uppgifterna ur filen.
  function instrad(i, r) {
    var rad = el('div', 'bf-instrad');
    rad.dataset.inst = i.id;
    // Raden går inte att dra medan typvalet eller utbytet står öppet: ett klick på en typknapp
    // eller i ett fält hade startat ett drag i stället för att välja typen eller skriva.
    rad.draggable = ui.insttyp !== i.id && ui.ersatter !== i.id;
    if (ui.instdrag && ui.instdrag.id === i.id) { rad.classList.add('dras'); }
    rad.appendChild(el('span', 'bf-planbet', i.beteckning || '–'));
    var txt = el('div', 'bf-btext');
    txt.appendChild(el('span', 'bf-bnamn', i.benamning));
    var delar = [i.typNamn];
    if (i.fabrikat || i.modell) { delar.push([i.fabrikat, i.modell].filter(Boolean).join(' ')); }
    if (i.datum) { delar.push('installerad ' + i.datum); }
    delar.push('id ' + i.id);
    if (i.externtId) { delar.push('externt id ' + i.externtId); }
    // Att apparaten bytts står på raden, eftersom det är en uppgift om installationen –
    // *vilka* apparater som suttit där syns i informationskortet (beslut 91).
    if (i.antalVersioner) {
      delar.push(antal(i.antalVersioner, 'tidigare apparat', 'tidigare apparater'));
    }
    txt.appendChild(el('span', 'bf-bstatus', delar.join(' · ')));
    rad.appendChild(txt);
    var verktyg = el('div', 'bf-planverktyg');
    if (ui.ersatter === i.id) {
      rad.appendChild(ersattFormular(i));
      verktyg.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
        ui.ersatter = null; ui.nyApparat = null; rita();
      }));
    } else if (ui.insttyp === i.id) {
      // Typvalet ligger **på installationens rad**, som rumstypvalet gör i steg 3: planeraren
      // ska se typen ändras där uppgiften står och inte i en ruta ovanpå sidan.
      var val = el('div', 'bf-typval');
      DP.signifikantaTyper().forEach(function (id) {
        val.appendChild(knapp(DP.installationstyper[id].namn,
          'knapp liten-knapp' + (id === i.typ ? '' : ' sekundar'), function () {
            ui.insttyp = null;
            P.sattInstTyp(i.id, id);
          }, 'Typen avgör vilka åtgärder du kan koppla i Planering steg 5.'));
      });
      rad.appendChild(val);
      verktyg.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
        ui.insttyp = null; rita();
      }));
    } else {
      verktyg.appendChild(knapp('Byt typ', 'knapp sekundar liten-knapp', function () {
        ui.insttyp = i.id;
        rita();
      }, 'Byt installationstyp. Den avgör vilka åtgärder du kan koppla i Planering steg 5; ' +
         'kopplingar som inte gäller den nya typen syns som saknade där.'));
      verktyg.appendChild(knapp('Ersätt', 'knapp sekundar liten-knapp', function () {
        ui.ersatter = i.id;
        ui.insttyp = null;
        // Fabrikat och modell står kvar som förval: en apparat byts oftast mot en likadan, och
        // det planeraren behöver skriva är då bara datumet. Lämnar hon dem orörda är det samma
        // uppgifter igen – ett tomt fält är inget svar (se `ersattInst`).
        ui.nyApparat = { fabrikat: i.fabrikat || '', modell: i.modell || '', datum: '',
          externtId: i.externtId || '', typ: '' };
        ui.fokus = 'ers-datum';
        rita();
      }, 'Ersätt apparaten. Installationen, id:t och tillsynen består; den gamla apparaten ' +
         'sparas som en tidigare version.'));
      verktyg.appendChild(knapp('Ta bort', 'knapp sekundar liten-knapp', function () {
        P.taBortInst(i.id);
      }, 'Tar bort installationen och dess kopplade åtgärder. ◀ tar den tillbaka.'));
    }
    rad.appendChild(verktyg);
    rad.addEventListener('dragstart', function (e) {
      ui.instdrag = { id: i.id, rumOver: null };
      // Raden bleknar direkt, utan omritning: en omritning mitt i ett drag tar bort den nod
      // webbläsaren drar, och då slutar den skicka dragover.
      rad.classList.add('dras');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i.id);
      }
    });
    return rad;
  }

  // Märket som visar vilket rum installationen hamnar i (beslut 106), flyttat på plats i
  // stället för ritat om – av samma skäl som linjen i steg 2 och 3. Ett rum är ett mål i sin
  // helhet och inte en plats mellan två rader: ordningen inom rummet betyder ingenting.
  function flyttaInstMarket() {
    var rutor = rot.querySelectorAll('.bf-instrum');
    [].forEach.call(rutor, function (w) {
      w.classList.toggle('malrum',
        !!(ui.instdrag && ui.instdrag.rumOver === w.dataset.instrum));
    });
  }

  // Släppet. En installation som ligger i byggnaden flyttas; en oplacerad inläst rad får sitt
  // rum, och då är det inläsningens egen väg – samma som knappen på raden.
  function slappInst(rumNyckel) {
    var d = ui.instdrag;
    ui.instdrag = null;
    if (!d) { rita(); return; }
    if (d.inlkey) {
      P.svaraInst(d.inlkey, 'rum', rumNyckel);
      return;
    }
    if (!P.flyttaInst(d.id, rumNyckel)) { rita(); }
  }

  // ---- Lägg till en installation för hand (berättelse 50) ----
  // Samma form som *Lägg till rum* i steg 3, och med samma förslag som inläsningen ger: typen
  // läses ur benämningen och id:t kommer från systemet när planeraren inte har ett.
  function laggTillInstFormular(kropp, st) {
    if (!ui.laggerTillInst) {
      var rad0 = el('div', 'knapprad');
      rad0.appendChild(knapp('Lägg till installation', 'knapp sekundar liten-knapp', function () {
        ui.laggerTillInst = true;
        // Förvalet är det första rummet på det översta planet, det planeraren ser högst upp.
        var forst = '';
        var b = P.byggnad();
        if (b && b.plan.length) {
          var overst = b.plan[b.plan.length - 1].id;
          var pa = b.rum.filter(function (r) { return r.plan === overst; });
          if (pa.length) { forst = DP.rumNyckel(pa[0].plan, pa[0].nr); }
          else if (b.rum.length) { forst = DP.rumNyckel(b.rum[0].plan, b.rum[0].nr); }
        }
        ui.nyInst = { rum: forst, benamning: '', beteckning: '', typ: '', fabrikat: '',
          modell: '', datum: '', externtId: '' };
        ui.fokus = 'inst-benamning';
        rita();
      }, 'Lägg till en signifikant installation som inte finns i inläsningsfilen.'));
      kropp.appendChild(rad0);
      return;
    }
    kropp.appendChild(el('div', 'liten-rubrik', 'Lägg till installation'));
    var w = el('div', 'bf-instform');
    // Rummet väljs med en knapp per rum, grupperade per plan: det är så planeraren tänker på
    // var en installation sitter.
    var rumval = el('div', 'bf-rumval');
    var b2 = P.byggnad();
    (b2 ? b2.plan.slice().reverse() : []).forEach(function (p) {
      var pa = b2.rum.filter(function (x) { return x.plan === p.id; });
      if (!pa.length) { return; }
      var grupp = el('div', 'bf-rumvalplan');
      grupp.appendChild(el('span', 'etikett', p.id + ' ' + p.namn));
      var knappar = el('div', 'bf-planval');
      pa.forEach(function (x) {
        var nyckel = DP.rumNyckel(x.plan, x.nr);
        knappar.appendChild(knapp(nyckel + ' ' + x.namn,
          'knapp liten-knapp' + (nyckel === ui.nyInst.rum ? '' : ' sekundar'), function () {
            ui.nyInst.rum = nyckel;
            rita();
          }, 'Lägg installationen i ' + nyckel + ' ' + x.namn + '.'));
      });
      grupp.appendChild(knappar);
      rumval.appendChild(grupp);
    });
    w.appendChild(rumval);
    var rutnat = el('div', 'bf-instfalt');
    faltIn(rutnat, 'Benämning', 'inst-benamning', ui.nyInst.benamning,
      't.ex. Handbrandsläckare 3', function (v) {
        ui.nyInst.benamning = v;
        // Benämningen är det typen läses ur, så ett eget typval som planeraren gjort innan
        // hon skrev något rörs inte – men gissningen ska följa det hon skriver.
        rita();
      });
    faltIn(rutnat, 'Beteckning', 'inst-beteckning', ui.nyInst.beteckning, 't.ex. HB03',
      function (v) { ui.nyInst.beteckning = v; rita(); });
    faltIn(rutnat, 'Fabrikat', 'inst-fabrikat', ui.nyInst.fabrikat, 'valfritt',
      function (v) { ui.nyInst.fabrikat = v; rita(); });
    faltIn(rutnat, 'Modell', 'inst-modell', ui.nyInst.modell, 'valfri',
      function (v) { ui.nyInst.modell = v; rita(); });
    faltIn(rutnat, 'Installationsdatum', 'inst-datum', ui.nyInst.datum, 't.ex. 2026-11-25',
      function (v) { ui.nyInst.datum = v; rita(); });
    // Externt id står med av samma skäl som de övriga valfria: en installation planeraren
    // skriver in själv ska kunna bära allt en inläst rad kan bära (beslut 81), annars är de
    // två vägarna inte samma väg.
    faltIn(rutnat, 'Externt id', 'inst-externt', ui.nyInst.externtId, 'valfritt',
      function (v) { ui.nyInst.externtId = v; rita(); });
    w.appendChild(rutnat);
    kropp.appendChild(w);

    // Typen: den läses ur benämningen, och planeraren kan välja en annan. Valet står med
    // även när gissningen träffade – hon ska kunna se *vilken* typ systemet läste, och rätta
    // den utan att först lägga till installationen.
    var last = DP.installationstypFor(ui.nyInst.benamning);
    var gallande = ui.nyInst.typ || last;
    kropp.appendChild(el('div', 'liten-rubrik', 'Installationstyp'));
    var typval = el('div', 'bf-typval');
    DP.signifikantaTyper().forEach(function (id) {
      typval.appendChild(knapp(DP.installationstyper[id].namn,
        'knapp liten-knapp' + (id === gallande ? '' : ' sekundar'), function () {
          ui.nyInst.typ = id;
          rita();
        }, 'Typen avgör vilka åtgärder du kan koppla i Planering steg 5.'));
    });
    kropp.appendChild(typval);
    if (last && !ui.nyInst.typ) {
      kropp.appendChild(el('div', 'bf-notis',
        'Systemet läste <b>' + DP.installationstyper[last].namn + '</b> ur benämningen. ' +
        'Välj en annan typ om det blev fel.'));
    }

    var hinder = P.instHinder({ rum: ui.nyInst.rum, benamning: ui.nyInst.benamning,
      typ: gallande });
    if (hinder) { kropp.appendChild(el('div', 'bf-fel', hinder)); }
    if (!hinder) {
      kropp.appendChild(el('div', 'bf-notis',
        'Installationen blir <b>' + (DP.installationstyper[gallande] || {}).namn +
        '</b> i <b>' + ui.nyInst.rum + '</b> och får ett <b>id från systemet</b>: ' +
        'fastighetssystemets id går att fylla i via inläsningsfilen.'));
    }
    var rad = el('div', 'knapprad hoger');
    rad.appendChild(knapp('Avbryt', 'knapp sekundar liten-knapp', function () {
      ui.laggerTillInst = false; rita();
    }));
    var lagg = knapp('Lägg till installation', 'knapp', function () {
      if (!P.laggTillInst({ rum: ui.nyInst.rum, benamning: ui.nyInst.benamning,
        beteckning: ui.nyInst.beteckning, typ: gallande, fabrikat: ui.nyInst.fabrikat,
        modell: ui.nyInst.modell, datum: ui.nyInst.datum,
        externtId: ui.nyInst.externtId })) { rita(); return; }
      // Nästa installation är nästa sak planeraren skriver: rummet, fabrikatet och datumet
      // står kvar – tjugo släckare i samma byggnad är samma fabrikat och samma dag – och
      // markören går tillbaka till benämningen.
      // Externt id är installationens eget och står **inte** kvar: fabrikat, modell och
      // datum delas av tjugo släckare som sätts upp samma dag, men ett externt id gör det
      // aldrig – det pekar ut en enda installation i fastighetssystemet.
      ui.nyInst = { rum: ui.nyInst.rum, benamning: '', beteckning: '', typ: '',
        fabrikat: ui.nyInst.fabrikat, modell: ui.nyInst.modell, datum: ui.nyInst.datum,
        externtId: '' };
      ui.fokus = 'inst-benamning';
      rita();
    });
    lagg.disabled = !!hinder;
    if (lagg.disabled) { lagg.title = hinder; }
    rad.appendChild(lagg);
    kropp.appendChild(rad);
  }


  // ------------------------------------------------------------------
  // Flödet ritar om sig vid varje ändring och varje byggnadsbyte: statusen, bockarna och
  // byggnadslistan kommer ur tillståndet, så ångra och gör om sköter sig själva.
  // ------------------------------------------------------------------
  P.prenumerera(function () {
    // Ångras ett *Skapa byggnad* är formuläret inte längre på väg någonstans
    if (ui.skapar && !P.byggnad()) { ui.skapar = false; }
    // Ändras byggnadens namn på annat håll – ett ångra, ett gör om – är det halvskrivna
    // namnet inte längre ett svar på vad som står i fältet: hon skrev det mot ett namn som
    // inte gäller längre. Jämförelsen går mot namnet som gällde när fältet öppnades, inte
    // mot att byggnaden finns – ett ångra av namnbytet lämnar byggnaden på plats.
    if (ui.nyttNamn !== null) {
      var bn = P.byggnad();
      if (!bn || bn.namn !== ui.nyttNamnFran) { avbrytNamnbyte(); }
    }
    rita();
  });
  // Byter planeraren byggnad mitt i ifyllningen är formuläret inte längre på väg någonstans:
  // det hör till den byggnad hon höll på att skapa, och stegen under det gäller nu en annan.
  // Lämnades det kvar hade "Ny byggnad" legat i listan och steg 2–4 stått låsta för en
  // byggnad som är färdig.
  P.prenumereraByte(function () {
    ui.skapar = false;
    ui.doper = null;
    ui.rumstyp = null;
    // Namnet hon skrev gällde den byggnad hon stod i, inte den hon bytt till.
    avbrytNamnbyte();
    // Ett halvskrivet rum hör till den byggnad hon stod i: planet det pekar på finns kanske
    // inte i den nya, och numret är räknat på den gamlas rum.
    ui.laggerTillRum = false;
    ui.rumdrag = null;
    // Samma för steg 4: rummet den halvskrivna installationen pekar på finns kanske inte i
    // den nya byggnaden.
    ui.insttyp = null;
    ui.instdrag = null;
    ui.laggerTillInst = false;
    // Det halvskrivna utbytet gällde en apparat i den byggnad hon stod i. Installationen finns
    // inte i den nya, så `ersattHinder` hade svarat "finns inte längre" på ett formulär hon
    // aldrig öppnat.
    ui.ersatter = null;
    ui.nyApparat = null;
    rita();
  });
  rita();
})();
