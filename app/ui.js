/*
 * Sidopanel, verktygsfält och informationskort runt 3D-vyn.
 */
(function () {
  'use strict';

  var DP = window.DP;
  var typer = DP.installationstyper;
  var b, modell, rumIndex, instPerRum, signifikanta;
  // `b` är byggnadens data som den ligger i tillståndet (beslut 71) – det trädet, listorna och
  // informationskortet visar. `modell` är samma byggnad med **formen räknad**: elevationer per
  // plan och skal för de plan som inte har rum ännu (beslut 85). Bara viewern får formen, så
  // att ett skal aldrig kan dyka upp i trädet som ett rum planeraren tror finns.
  function indexera() {
    b = DP.Plan.byggnad();
    modell = DP.Planlosning.form(b);
    rumIndex = {}; instPerRum = {};
    // Nycklat på rummets nyckel (plan + rumsnummer): rumsnumret löper per plan och är inte
    // unikt i byggnaden (beslut 76). Installationernas `rum` bär samma nyckel.
    b.rum.forEach(function (r) { rumIndex[DP.rumBeteckning(r)] = r; });
    b.installationer.forEach(function (i) { (instPerRum[i.rum] = instPerRum[i.rum] || []).push(i); });
    signifikanta = b.installationer.filter(function (i) { return i.signifikant; });
  }
  indexera();

  var PLURAL = {
    lysrorsarmatur: 'lysrörsarmaturer', vaggarmatur: 'väggarmaturer', vaggbrytare: 'väggbrytare',
    vagguttag: 'vägguttag', rokdetektor: 'rökdetektorer', toalettstol: 'toalettstolar',
    handfat: 'handfat', dusch: 'duschar', jordfelsbrytare: 'jordfelsbrytare'
  };

  function $(sel, rot) { return (rot || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }
  function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function planNamn(id) { var p = b.plan.filter(function (x) { return x.id === id; })[0]; return p.id + ' – ' + p.namn; }
  function rumNamn(nyckel) { var r = rumIndex[nyckel]; return DP.rumBeteckning(r) + ' – ' + r.namn; }
  function antalText(n, typ) { return n + ' ' + (n === 1 ? typer[typ].namn.toLowerCase() : (PLURAL[typ] || typer[typ].namn.toLowerCase())); }

  function atgardForTyp(typ) {
    return DP.atgarder.filter(function (a) { return a.galler.indexOf(typ) >= 0; })[0];
  }

  // ------------------------------------------------------------------
  // Viewer
  // ------------------------------------------------------------------
  var viewer = new DP.Viewer($('#vy3d'), modell, {
    valtInstallation: function (inst) { visaInstKort(inst); viewer.valjInstallation(inst, false); markeraITrad(inst); },
    valtRum: function (r) { visaRumKort(r); },
    hover: visaTips,
    planAndrat: uppdateraPlanKnappar,
    lageAndrat: function (lage, r) {
      $('#rumlage').hidden = lage !== 'rum';
      if (r) { $('#rumlage-namn').textContent = planNamn(r.plan) + ' · ' + rumNamn(DP.rumBeteckning(r)); }
      document.body.classList.toggle('i-rum', lage === 'rum');
    }
  });
  DP.viewer = viewer;

  // ------------------------------------------------------------------
  // Verktygsfält
  // ------------------------------------------------------------------
  function bindToggle(id, lager) {
    var k = $(id);
    k.classList.toggle('pa', viewer.lager[lager]);
    k.addEventListener('click', function () {
      var v = !viewer.lager[lager];
      viewer.sattLager(lager, v);
      k.classList.toggle('pa', v);
    });
  }
  bindToggle('#t-ytter', 'ytterVaggar');
  bindToggle('#t-inner', 'innerVaggar');
  bindToggle('#t-tak', 'tak');
  bindToggle('#t-etikett', 'etiketter');
  bindToggle('#t-rontgen', 'rontgen');

  // En knapp som inte har något att visa är **utgråad, inte borttagen** (beslut 111):
  // verktygsfältet ska se likadant ut hela tiden, så att planeraren lär sig var sakerna ligger
  // och ser vad som kommer när byggnaden växer. En knapp som försvinner och kommer tillbaka
  // flyttar de andra, och då måste man leta varje gång.
  //
  // Vad som är "inget att visa" följer av vad lagret ritar: innerväggar och rumsnamn kräver
  // riktiga rum (ett skal har varken), röntgen kräver signifikanta installationer, och
  // ytterväggar och tak finns så fort det finns ett plan att rita dem kring.
  function uppdateraVerktyg() {
    var harPlan = b.plan.length > 0;
    var harRum = b.rum.length > 0;
    var harSig = signifikanta.length > 0;
    grana('#t-ytter', harPlan, 'Det finns inget plan att rita ytterväggar kring ännu.');
    grana('#t-tak', harPlan, 'Det finns inget plan att lägga tak över ännu.');
    grana('#t-inner', harRum, 'Innerväggar finns när rummen är inlästa (steg 3).');
    grana('#t-etikett', harRum, 'Rumsnamn finns när rummen är inlästa (steg 3).');
    grana('#t-rontgen', harSig, 'Röntgen visar signifikanta installationer, och det finns inga ännu (steg 4).');
    grana('#v-oversikt', harPlan, 'Det finns ingen modell att se över ännu.');
    grana('#v-uppifran', harPlan, 'Det finns ingen modell att se uppifrån ännu.');
  }
  function grana(sel, finns, varfor) {
    var k = $(sel);
    k.classList.toggle('utgraad', !finns);
    k.disabled = !finns;
    // Skälet står i titeln: en utgråad knapp som inte säger varför är en gåta, och planeraren
    // ska kunna få svaret genom att peka på den.
    if (!finns) { k.dataset.titel = k.dataset.titel || k.title || ''; k.title = varfor; }
    else if (k.dataset.titel !== undefined) { k.title = k.dataset.titel; }
  }

  var planKnappar = $('#planknappar');
  function byggPlanKnappar() {
    planKnappar.innerHTML = '';
    // Plan-gruppen är tom innan planen finns. Den får ett streck i stället för ingenting, så
    // att gruppen behåller sin plats och sin bredd i verktygsfältet (beslut 111).
    if (!b.plan.length) {
      var tomt = el('span', 'chip utgraad', '–');
      tomt.title = 'Planen visas här när de är inlästa (steg 2).';
      planKnappar.appendChild(tomt);
      return;
    }
    b.plan.slice().reverse().forEach(function (p) {
      var k = el('button', 'chip pa', p.id);
      k.title = planNamn(p.id) + ' (klick: visa/dölj, dubbelklick: visa bara detta plan och planen under)';
      k.dataset.plan = p.id;
      k.addEventListener('click', function () { viewer.sattPlanSynligt(p.id, !viewer.planSynligt[p.id]); uppdateraPlanKnappar(); });
      k.addEventListener('dblclick', function () { viewer._visaPlanUpptill(p.id); uppdateraPlanKnappar(); });
      planKnappar.appendChild(k);
    });
  }
  byggPlanKnappar();
  uppdateraVerktyg();

  // Val av byggnad i sidhuvudet
  var valj = $('#byggnad');
  function byggValjare() {
    valj.innerHTML = '';
    DP.Plan.byggnadsordning.forEach(function (id) {
      var o = el('option', null, DP.Plan.byggnadsNamn(id));
      o.value = id;
      valj.appendChild(o);
    });
    valj.value = DP.Plan.aktivId();
  }
  byggValjare();
  valj.addEventListener('change', function () { DP.Plan.vaxlaByggnad(valj.value); });
  DP.Plan.prenumereraByte(function (id) {
    valj.value = id;
    byggOm(true);
  });
  // Bygg om allt som kommer ur byggnadens data: modellen, plan-knapparna, trädet och
  // byggnadsnamnen i väljaren. Används både när planeraren byter byggnad och när byggnadens
  // data ändrats i ett steg (beslut 71) – samma arbete, och vid ett byte också en rensning av
  // det som pekade på den förra byggnaden.
  //
  // `tomKort` skiljer de två: vid ett byte finns inget att visa kvar, men när byggnaden
  // ändrats står planeraren fortfarande vid samma rum eller installation och kortet ska
  // stanna öppet – på det nya objektet, eftersom tillståndet är klonat vid varje steg.
  function byggOm(tomKort) {
    var visades = visas;
    indexera();
    // Vid ett byte nollställs vyn med flit; vid en dataändring står planeraren kvar vid sitt
    // rum och sin installation och ska se just det hon ändrade.
    if (tomKort) { viewer.sattByggnad(modell); } else { viewer.byggOmByggnad(modell); }
    byggPlanKnappar();
    uppdateraVerktyg();
    byggTrad();
    uppdateraTomBesked();
    byggValjare();
    $('#tips').hidden = true;
    if (tomKort || !visades) {
      kort.hidden = true; visas = null; redigerar = null;
      return;
    }
    // Objektet kortet visade hör till det förra steget. Hitta samma rum eller installation i
    // den nya datan – den kan ha ändrats, och det är just ändringen som ska synas.
    if (visades.inst) {
      var i = b.installationer.filter(function (x) { return x.id === visades.inst.id; })[0];
      if (i) { visaInstKort(i); } else { kort.hidden = true; visas = null; redigerar = null; }
    } else if (visades.rum) {
      var r = rumIndex[DP.rumBeteckning(visades.rum)];
      if (r) { visaRumKort(r); } else { kort.hidden = true; visas = null; redigerar = null; }
    }
  }
  // Byggnadens data ändrades i ett steg – även vid ångra och gör om, eftersom de går samma väg
  // (beslut 73). Bara den aktiva byggnaden har en modell och ett träd på skärmen.
  DP.Plan.prenumerera(function (fore, efter, info) {
    if (DP.Plan.aktivFickNyData(info)) { byggOm(false); }
  });
  function uppdateraPlanKnappar() {
    [].forEach.call(planKnappar.children, function (k) { k.classList.toggle('pa', !!viewer.planSynligt[k.dataset.plan]); });
  }
  $('#v-oversikt').addEventListener('click', function () {
    b.plan.forEach(function (p) { viewer.planSynligt[p.id] = true; });
    viewer._uppdateraSynlighet(); uppdateraPlanKnappar(); viewer.aterstallVy(true);
  });
  $('#v-uppifran').addEventListener('click', function () { viewer.uppifran(); });
  $('#lamna-rum').addEventListener('click', function () { viewer.lamnaRum(); });

  // ------------------------------------------------------------------
  // Byggnadsträd
  // ------------------------------------------------------------------
  function byggTrad() {
    var rot = $('#trad');
    rot.innerHTML = '';
    var sumSig = signifikanta.length, sumOvr = b.installationer.length - sumSig;
    var sum = el('div', 'sammanfattning');
    sum.innerHTML = '<b>' + b.namn + '</b> · ' + b.plan.length + ' plan · ' + b.rum.length + ' rum<br>' +
      (b.beskrivning ? '<span class="liten-text">' + b.beskrivning + '</span><br>' : '') +
      '<span class="prick" style="background:#4a5563"></span>' + sumSig + ' signifikanta installationer ' +
      '<span class="prick ovr"></span>' + sumOvr + ' övriga';
    rot.appendChild(sum);

    b.plan.forEach(function (p) {
      var sek = el('details', 'plan');
      sek.open = p.id === '01';
      var rubrik = el('summary', null);
      rubrik.innerHTML = '<span class="plan-id">' + p.id + '</span> ' + p.namn;
      sek.appendChild(rubrik);
      b.rum.filter(function (r) { return r.plan === p.id; }).forEach(function (r) {
        var rd = el('details', 'rum');
        var nyckel = DP.rumBeteckning(r);
        rd.dataset.rum = nyckel;
        var rs = el('summary');
        var lista = instPerRum[nyckel] || [];
        var nsig = lista.filter(function (i) { return i.signifikant; }).length;
        rs.innerHTML = '<span class="rum-nr">' + nyckel + '</span><span class="rum-namn">' + r.namn + '</span>' +
          (nsig ? '<span class="rakna">' + nsig + '</span>' : '');
        var gaIn = el('button', 'liten', 'Gå in');
        gaIn.title = 'Gå in i rummet och se dig omkring';
        gaIn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); viewer.gaIn(nyckel); });
        rs.appendChild(gaIn);
        rs.addEventListener('click', function () { viewer.visaRum(nyckel); visaRumKort(r); });
        rd.appendChild(rs);

        var ul = el('ul', 'instlista');
        lista.filter(function (i) { return i.signifikant; }).forEach(function (i) {
          var li = el('li', 'sig');
          li.dataset.id = i.id;
          li.innerHTML = '<span class="prick" style="background:' + hex(DP.KATEGORIFARG[typer[i.typ].kategori]) + '"></span>' +
            '<span class="bet">' + i.beteckning + '</span> ' + i.benamning;
          li.addEventListener('click', function () { visaInstKort(i); viewer.valjInstallation(i, true); markeraITrad(i); });
          ul.appendChild(li);
          (i.innehaller || []).forEach(function (c) {
            var sub = el('li', 'ovr sub', '↳ ' + antalText(c.antal, c.typ) + ' i ' + i.beteckning + ' (ej signifikanta)');
            sub.title = DP.ejSignifikantForklaring.jordfelsbrytare_i_central;
            ul.appendChild(sub);
          });
        });
        var ovr = {};
        lista.filter(function (i) { return !i.signifikant; }).forEach(function (i) { ovr[i.typ] = (ovr[i.typ] || 0) + 1; });
        var delar = Object.keys(ovr).map(function (t) { return antalText(ovr[t], t); });
        if (delar.length) {
          var li2 = el('li', 'ovr', 'Övriga: ' + delar.join(' · '));
          li2.title = 'Ej signifikanta installationer registreras inte som individer och går inte att klicka på.';
          ul.appendChild(li2);
        }
        rd.appendChild(ul);
        sek.appendChild(rd);
      });
      rot.appendChild(sek);
    });
  }

  function markeraITrad(inst) {
    [].forEach.call(document.querySelectorAll('.instlista li.vald'), function (x) { x.classList.remove('vald'); });
    if (!inst) { return; }
    var li = document.querySelector('.instlista li[data-id="' + inst.id + '"]');
    if (!li) { return; }
    li.classList.add('vald');
    var rd = li.closest('details.rum'), pd = li.closest('details.plan');
    if (pd) { pd.open = true; }
    if (rd) { rd.open = true; }
    if (!$('#hs-byggnad').hidden) { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  function atgardstext(punkter) {
    var w = el('div', 'atgardstext');
    w.appendChild(el('div', 'etikett', 'Åtgärdstext'));
    w.appendChild(el('div', 'kontrollera', 'Kontrollera:'));
    var ul = el('ul');
    punkter.forEach(function (p) { ul.appendChild(el('li', null, p)); });
    w.appendChild(ul);
    return w;
  }

  // ------------------------------------------------------------------
  // Informationskort
  // ------------------------------------------------------------------
  var kort = $('#infokort');
  function stangKort() { kort.hidden = true; viewer.valjInstallation(null); markeraITrad(null); }
  function nyttKort(titel, under) {
    kort.innerHTML = '';
    kort.hidden = false;
    var h = el('div', 'kort-huvud');
    var t = el('div');
    t.appendChild(el('div', 'kort-titel', titel));
    if (under) { t.appendChild(el('div', 'kort-under', under)); }
    h.appendChild(t);
    var x = el('button', 'stang', '×');
    x.title = 'Stäng';
    x.addEventListener('click', stangKort);
    h.appendChild(x);
    kort.appendChild(h);
    var k = el('div', 'kort-kropp');
    kort.appendChild(k);
    return k;
  }
  function falt(rot, etikett, varde, saknas) {
    var r = el('div', 'falt');
    r.appendChild(el('div', 'etikett', etikett));
    var v = el('div', 'varde' + (saknas ? ' saknas' : ''), saknas ? 'saknas' : varde);
    r.appendChild(v);
    rot.appendChild(r);
  }

  function visaInstKort(inst) {
    var typ = typer[inst.typ];
    var r = rumIndex[inst.rum];
    var k = nyttKort(inst.benamning, typ.namn + ' · Signifikant installation');
    var rutnat = el('div', 'faltrutnat');
    falt(rutnat, 'Id', inst.id);
    falt(rutnat, 'Beteckning', inst.beteckning);
    falt(rutnat, 'Fabrikat', inst.fabrikat);
    falt(rutnat, 'Modell', inst.modell);
    falt(rutnat, 'Externt id', inst.externtId, !inst.externtId);
    falt(rutnat, 'Plan', planNamn(r.plan));
    falt(rutnat, 'Rum', rumNamn(inst.rum));
    if (inst.placering) { falt(rutnat, 'Placering', inst.placering); }
    k.appendChild(rutnat);

    (inst.innehaller || []).forEach(function (c) {
      var n = el('div', 'notis');
      n.innerHTML = '<b>Innehåller ' + antalText(c.antal, c.typ) + '.</b> De är inte signifikanta eftersom de sitter i ' +
        typ.namn.toLowerCase() + 'en och är lätta att hitta. De provas via åtgärden för ' + typ.namn.toLowerCase() + 'en.';
      k.appendChild(n);
    });

    var P = DP.Plan;
    var kopplingar = P.kopplingarForInst(inst.id);
    var sek = el('div', 'sektion');
    sek.appendChild(el('h4', null, 'Kopplade åtgärder (' + kopplingar.length + ')'));
    if (!kopplingar.length) {
      var tom = el('div', 'tomt');
      tom.innerHTML = 'Inga ännu. En signifikant installation <b>ska</b> ha en kopplad åtgärd. Koppla den i steg 5 i planeringen, så blir installationen grön i modellen.';
      sek.appendChild(tom);
    }
    kopplingar.forEach(function (kp) {
      var at = P.atgard(kp.atgard);
      var rond = P.state().ronder.filter(function (r) { return r.id === kp.rond; })[0];
      var rt = P.rutintillfallen().filter(function (t) { return t.rond === kp.rond; });
      var box = el('div', 'koppling');
      box.innerHTML = '<div class="kp-titel"><span class="prick" style="background:#22b45a"></span><b>' + at.namn + '</b></div>' +
        '<div class="kp-rad">Rond <b>' + P.rondNamn(kp.rond) + '</b> · ' + P.freqText(rond.freq, true).toLowerCase() + ' · utförare ' + P.utforare(rond.utforare).namn + '</div>' +
        '<div class="kp-rad">Ingår i ' + rt.length + ' rutintillfällen: ' + rt.slice(0, 3).map(function (t) { return t.namn; }).join(', ') + (rt.length > 3 ? ' …' : '') + '</div>';
      if (rt.length) {
        var oppna = el('button', 'lank', 'Visa första rutintillfället i telefonen');
        oppna.addEventListener('click', function () { DP.Telefon.oppna(rt[0].nyckel, true); });
        box.appendChild(oppna);
      }
      var gall = P.textFor(kp, null);
      var avvT = P.tillfalleAvvikelser(kp);
      var nyckel = kp.atgard + '|' + kp.inst;
      if (redigerar === nyckel) {
        box.appendChild(DP.Dialog.redigerare({
          punkter: gall.punkter,
          onSpara: function (punkter, kn) {
            redigerar = null;
            var kalla = DP.mitt(kn);
            DP.ui.uppdatera();
            DP.Texter.sparaInst(kp, punkter, kalla);
          },
          onAvbryt: function () { redigerar = null; DP.ui.uppdatera(); }
        }));
      } else {
        if (gall.niva === 'installation' || avvT.length) {
          var av = el('div', 'avvik-info');
          var delar = [];
          if (gall.niva === 'installation') { delar.push('denna installation har en egen åtgärdstext i alla rutintillfällen'); }
          if (avvT.length) { delar.push(avvT.length + ' rutintillfälle' + (avvT.length > 1 ? 'n' : '') + ' har egen text (' + avvT.map(function (x) { return 'v' + x.vecka; }).join(', ') + ')'); }
          av.innerHTML = '<span class="avvik-symbol">✎</span> Avvikande åtgärdstext: ' + delar.join('; ') + '.';
          var jmf = el('button', 'lank', 'Jämför');
          jmf.addEventListener('click', function () { DP.Texter.jamforNivaer(kp, null); });
          av.appendChild(jmf);
          box.appendChild(av);
        }
        box.appendChild(atgardstext(gall.punkter));
        var andra = el('button', 'knapp sekundar liten-knapp', 'Ändra åtgärdstext för ' + inst.beteckning);
        andra.addEventListener('click', function () { redigerar = nyckel; DP.ui.uppdatera(); });
        box.appendChild(andra);
      }
      sek.appendChild(box);
    });
    k.appendChild(sek);

    var a = atgardForTyp(inst.typ);
    if (a && !kopplingar.length) {
      var sek2 = el('div', 'sektion');
      sek2.appendChild(el('h4', null, 'Matchande åtgärd i bruttolistan'));
      var rad = el('div', 'a-rad');
      rad.innerHTML = '<b>' + a.namn + '</b> · föreslagen rond <i>' + P.rondNamn(a.foreslagenRond) + '</i>';
      sek2.appendChild(rad);
      sek2.appendChild(atgardstext(DP.Plan.standardText(a.id)));
      k.appendChild(sek2);
    }

    var knappar = el('div', 'knapprad');
    var visa = el('button', 'knapp sekundar', 'Visa i modellen');
    visa.addEventListener('click', function () { viewer.valjInstallation(inst, true); });
    var gaIn = el('button', 'knapp sekundar', 'Gå in i ' + r.namn.toLowerCase());
    gaIn.addEventListener('click', function () { viewer.gaIn(inst.rum); viewer.valjInstallation(inst, false); });
    knappar.appendChild(visa); knappar.appendChild(gaIn);
    k.appendChild(knappar);
  }

  function visaRumKort(r) {
    var nyckel = DP.rumBeteckning(r);
    var area = (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
    var k = nyttKort(rumNamn(nyckel), 'Plan ' + planNamn(r.plan) + ' · ' + area + ' m²');
    var lista = instPerRum[nyckel] || [];
    var sig = lista.filter(function (i) { return i.signifikant; });
    var sek = el('div', 'sektion');
    sek.appendChild(el('h4', null, 'Signifikanta installationer (' + sig.length + ')'));
    if (!sig.length) { sek.appendChild(el('div', 'tomt', 'Inga signifikanta installationer i rummet.')); }
    var ul = el('ul', 'instlista');
    sig.forEach(function (i) {
      var li = el('li', 'sig');
      li.innerHTML = '<span class="prick" style="background:' + hex(DP.KATEGORIFARG[typer[i.typ].kategori]) + '"></span><span class="bet">' + i.beteckning + '</span> ' + i.benamning;
      li.addEventListener('click', function () { visaInstKort(i); viewer.valjInstallation(i, true); markeraITrad(i); });
      ul.appendChild(li);
    });
    sek.appendChild(ul);
    k.appendChild(sek);

    var ovr = {};
    lista.filter(function (i) { return !i.signifikant; }).forEach(function (i) { ovr[i.typ] = (ovr[i.typ] || 0) + 1; });
    if (Object.keys(ovr).length) {
      var sek2 = el('div', 'sektion');
      sek2.appendChild(el('h4', null, 'Övriga installationer (ej signifikanta)'));
      sek2.appendChild(el('div', 'tomt', Object.keys(ovr).map(function (t) { return antalText(ovr[t], t); }).join(' · ')));
      sek2.appendChild(el('div', 'liten-text', 'Registreras inte som individer. De ingår i den övergripande kontrollen av byggnaden.'));
      k.appendChild(sek2);
    }
    var knappar = el('div', 'knapprad');
    var gaIn = el('button', 'knapp', 'Gå in i rummet');
    gaIn.addEventListener('click', function () { viewer.gaIn(nyckel); });
    knappar.appendChild(gaIn);
    k.appendChild(knappar);
  }

  // ------------------------------------------------------------------
  // Hovertips
  // ------------------------------------------------------------------
  var tips = $('#tips');
  function visaTips(inst, rum, ev) {
    if (!ev || (!inst && !rum)) { tips.hidden = true; return; }
    var r = $('#vy').getBoundingClientRect();
    tips.style.left = (ev.clientX - r.left + 14) + 'px';
    tips.style.top = (ev.clientY - r.top + 14) + 'px';
    if (inst && inst.signifikant) {
      tips.className = 'tips sig';
      tips.innerHTML = '<b>' + inst.beteckning + ' · ' + inst.benamning + '</b><br>Signifikant – klicka för information';
    } else if (inst) {
      tips.className = 'tips ovr';
      tips.innerHTML = '<b>' + typer[inst.typ].namn + '</b> · ej signifikant<br>' + (DP.ejSignifikantForklaring[inst.typ] || '');
    } else {
      tips.className = 'tips rum';
      tips.innerHTML = '<b>' + DP.rumBeteckning(rum) + ' ' + rum.namn + '</b><br>Klicka: information · Dubbelklicka: gå in';
    }
    tips.hidden = false;
  }

  // ------------------------------------------------------------------
  // Förklaring
  // ------------------------------------------------------------------
  function byggForklaring() {
    var f = $('#forklaring');
    [['brand', 'Brandskydd'], ['el', 'El'], ['vvs', 'Ventilation / VVS'], ['maskin', 'Lyft / maskin'], ['byggnad', 'Byggnadsdel']].forEach(function (k) {
      var s = el('span', 'f-post');
      s.innerHTML = '<span class="prick" style="background:' + hex(DP.KATEGORIFARG[k[0]]) + '"></span>' + k[1];
      f.appendChild(s);
    });
    var o = el('span', 'f-post');
    o.innerHTML = '<span class="prick ovr"></span>Ej signifikant (ej klickbar)';
    f.appendChild(o);
    var g = el('span', 'f-post');
    g.innerHTML = '<span class="prick" style="background:#22b45a"></span>Har kopplad åtgärd';
    f.appendChild(g);
    var av = el('span', 'f-post');
    av.innerHTML = '<span class="avvik-symbol liten">✎</span>&nbsp;Avvikande åtgärdstext';
    f.appendChild(av);
  }

  // ------------------------------------------------------------------
  // Tom byggnad: beskedet i stället för modellen
  // ------------------------------------------------------------------
  // En nyskapad byggnad har inga plan än (beslut 69), och modellen visar då en tom tomt. En
  // tom ruta utan förklaring ser ut som ett fel, så vyn säger vad som fattas och var det
  // fylls i. Den ritas av trädets ombyggnad, så den kommer och går med byggnadens data –
  // också vid ångra och gör om.
  function uppdateraTomBesked() {
    var ruta = $('#tom-byggnad');
    var tom = !b.plan.length;
    ruta.hidden = !tom;
    if (!tom) { return; }
    ruta.innerHTML = '<div class="tb-rubrik">' + b.namn + ' har inga plan ännu</div>' +
      '<div class="tb-text">Modellen växer fram steg för steg: först planen som ett skal, ' +
      'sedan rummen och sist installationerna. Fyll i <b>steg 2 Plan</b> i byggnadsflödet ' +
      'till vänster, med en inläsningsfil eller för hand.</div>';
  }

  byggTrad();
  uppdateraTomBesked();
  byggForklaring();

  // Öppet informationskort ritas om när planeringen ändras
  var visas = null;
  var redigerar = null; // 'atgard|inst' som redigeras i informationskortet
  var gammalInst = visaInstKort, gammalRum = visaRumKort;
  visaInstKort = function (i) { if (!visas || visas.inst !== i) { redigerar = null; } visas = { inst: i }; gammalInst(i); };
  visaRumKort = function (r) { visas = { rum: r }; gammalRum(r); };
  DP.ui = {
    atgardstext: atgardstext,
    visaInstKort: function (i) { visaInstKort(i); },
    uppdatera: function () {
      if (kort.hidden || !visas) { return; }
      var skroll = kort.scrollTop;
      if (visas.inst) { gammalInst(visas.inst); } else if (visas.rum) { gammalRum(visas.rum); }
      kort.scrollTop = skroll;
    }
  };
})();
