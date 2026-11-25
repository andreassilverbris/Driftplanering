/*
 * Byggnadsflödet: huvudsteget Byggnad som en vägledd process (beslut 69 och 107).
 *
 * Fyra steg i en lodrät lista – Byggnadstyp och namn → Plan → Rum → Installationer – med
 * samma form som Planeringens steglista: grön bock, hopfällning när steget är klart och
 * vilket steg som helst öppningsbart igen. Formen är inte vald för att vara bäst, utan för
 * att den redan är inlärd: enhetligheten är viktigare (beslut 107).
 *
 * Den här filen bygger listan, byggnadslistan med status, **steg 1** (byggnadstyp, namn,
 * område och färg) och **steg 2 Plan** (lägg till plan, dra om ordningen, döp om och ta bort).
 * Steg 3–4 syns med sitt läge men är tomma tills de byggs i de följande biljetterna i spåret.
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
    { n: 3, titel: 'Rum', kropp: stegKommer },
    { n: 4, titel: 'Installationer', kropp: stegKommer }
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
    doper: null
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

  // Steg 3–4 byggs i de följande biljetterna i spåret. De syns med sitt läge, så att
  // planeraren ser hela vägen framför sig – ett tomt steg som inte finns hade gjort flödet
  // kortare än det är.
  function stegKommer(kropp, n) {
    var texter = {
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
    ui.doper = null;
    rita();
  });
  rita();
})();
