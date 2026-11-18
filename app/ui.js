/*
 * Sidopanel, verktygsfält och informationskort runt 3D-vyn.
 */
(function () {
  'use strict';

  var DP = window.DP;
  var b = DP.byggnader.hangar;
  var typer = DP.installationstyper;

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
  function rumNamn(nr) { var r = rumIndex[nr]; return r.nr + ' – ' + r.namn; }
  function antalText(n, typ) { return n + ' ' + (n === 1 ? typer[typ].namn.toLowerCase() : (PLURAL[typ] || typer[typ].namn.toLowerCase())); }

  var rumIndex = {};
  b.rum.forEach(function (r) { rumIndex[r.nr] = r; });
  var instPerRum = {};
  b.installationer.forEach(function (i) { (instPerRum[i.rum] = instPerRum[i.rum] || []).push(i); });
  var signifikanta = b.installationer.filter(function (i) { return i.signifikant; });

  function matchandeInst(a) {
    return signifikanta.filter(function (i) { return a.galler.indexOf(i.typ) >= 0; });
  }
  function atgardForTyp(typ) {
    return DP.atgarder.filter(function (a) { return a.galler.indexOf(typ) >= 0; })[0];
  }
  function rondNamn(id) { return (DP.ronder.filter(function (r) { return r.id === id; })[0] || {}).namn || id; }

  // ------------------------------------------------------------------
  // Viewer
  // ------------------------------------------------------------------
  var viewer = new DP.Viewer($('#vy3d'), b, {
    valtInstallation: function (inst) { visaInstKort(inst); viewer.valjInstallation(inst, false); markeraITrad(inst); },
    valtRum: function (r) { visaRumKort(r); },
    hover: visaTips,
    planAndrat: uppdateraPlanKnappar,
    lageAndrat: function (lage, r) {
      $('#rumlage').hidden = lage !== 'rum';
      if (r) { $('#rumlage-namn').textContent = planNamn(r.plan) + ' · ' + rumNamn(r.nr); }
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

  var planKnappar = $('#planknappar');
  b.plan.slice().reverse().forEach(function (p) {
    var k = el('button', 'chip pa', p.id);
    k.title = planNamn(p.id) + ' (klick: visa/dölj, dubbelklick: visa bara detta plan och planen under)';
    k.dataset.plan = p.id;
    k.addEventListener('click', function () { viewer.sattPlanSynligt(p.id, !viewer.planSynligt[p.id]); uppdateraPlanKnappar(); });
    k.addEventListener('dblclick', function () { viewer._visaPlanUpptill(p.id); uppdateraPlanKnappar(); });
    planKnappar.appendChild(k);
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
  // Flikar
  // ------------------------------------------------------------------
  [].forEach.call(document.querySelectorAll('.flik'), function (f) {
    f.addEventListener('click', function () {
      [].forEach.call(document.querySelectorAll('.flik'), function (x) { x.classList.toggle('aktiv', x === f); });
      [].forEach.call(document.querySelectorAll('.flikinnehall'), function (x) { x.hidden = x.id !== f.dataset.mal; });
    });
  });

  // ------------------------------------------------------------------
  // Byggnadsträd
  // ------------------------------------------------------------------
  function byggTrad() {
    var rot = $('#trad');
    var sumSig = signifikanta.length, sumOvr = b.installationer.length - sumSig;
    var sum = el('div', 'sammanfattning');
    sum.innerHTML = '<b>' + b.namn + '</b> · ' + b.plan.length + ' plan · ' + b.rum.length + ' rum<br>' +
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
        rd.dataset.rum = r.nr;
        var rs = el('summary');
        var lista = instPerRum[r.nr] || [];
        var nsig = lista.filter(function (i) { return i.signifikant; }).length;
        rs.innerHTML = '<span class="rum-nr">' + r.nr + '</span><span class="rum-namn">' + r.namn + '</span>' +
          (nsig ? '<span class="rakna">' + nsig + '</span>' : '');
        var gaIn = el('button', 'liten', 'Gå in');
        gaIn.title = 'Gå in i rummet och se dig omkring';
        gaIn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); viewer.gaIn(r.nr); });
        rs.appendChild(gaIn);
        rs.addEventListener('click', function () { viewer.visaRum(r.nr); visaRumKort(r); });
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
    if (!$('#flik-byggnad').hidden) { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  // ------------------------------------------------------------------
  // Åtgärdskatalog (bruttolista)
  // ------------------------------------------------------------------
  function byggAtgarder() {
    var rot = $('#atgardslista');
    var intro = el('p', 'intro');
    intro.innerHTML = 'Bruttolistan innehåller <b>alla</b> åtgärder som finns. De som matchar installationer i <b>' + b.namn +
      '</b> visas överst. I planeringssteget (nästa etapp) får de en <i>Lägg till</i>-knapp.';
    rot.appendChild(intro);

    var relevanta = [], ovriga = [];
    DP.atgarder.forEach(function (a) {
      if (a.generell || matchandeInst(a).length) { relevanta.push(a); } else { ovriga.push(a); }
    });
    rot.appendChild(el('h3', 'grupprubrik', 'Relevanta för ' + b.namn + ' (' + relevanta.length + ')'));
    relevanta.forEach(function (a) { rot.appendChild(atgardKort(a, true)); });
    rot.appendChild(el('h3', 'grupprubrik', 'Övriga åtgärder – ingen matchande installation (' + ovriga.length + ')'));
    ovriga.forEach(function (a) { rot.appendChild(atgardKort(a, false)); });
  }

  function atgardKort(a, relevant) {
    var d = el('details', 'atgard' + (relevant ? '' : ' irrelevant'));
    var s = el('summary');
    var antal = a.generell ? 'Hela byggnaden' : (matchandeInst(a).length + ' st');
    s.innerHTML = '<span class="a-namn">' + a.namn + '</span><span class="a-meta">' + antal + '</span>';
    d.appendChild(s);
    var kropp = el('div', 'a-kropp');
    var meta = el('div', 'a-rad');
    meta.innerHTML = '<span class="etikett">Föreslagen rond</span> ' + rondNamn(a.foreslagenRond) +
      (a.generell ? '' : ' · <span class="etikett">Gäller</span> ' + a.galler.map(function (t) { return typer[t] ? typer[t].namn : t; }).join(', '));
    kropp.appendChild(meta);
    kropp.appendChild(atgardstext(a.kontrollpunkter));
    if (relevant && !a.generell) {
      var knapp = el('button', 'knapp sekundar', 'Visa i modellen');
      knapp.title = 'Installationerna blinkar till i grönt genom väggar och tak';
      knapp.addEventListener('click', function () { viewer.blinka(matchandeInst(a)); });
      kropp.appendChild(knapp);
    }
    d.appendChild(kropp);
    return d;
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
    falt(rutnat, 'Rum', rumNamn(r.nr));
    if (inst.placering) { falt(rutnat, 'Placering', inst.placering); }
    k.appendChild(rutnat);

    (inst.innehaller || []).forEach(function (c) {
      var n = el('div', 'notis');
      n.innerHTML = '<b>Innehåller ' + antalText(c.antal, c.typ) + '.</b> De är inte signifikanta eftersom de sitter i ' +
        typ.namn.toLowerCase() + 'en och är lätta att hitta. De provas via åtgärden för ' + typ.namn.toLowerCase() + 'en.';
      k.appendChild(n);
    });

    var sek = el('div', 'sektion');
    sek.appendChild(el('h4', null, 'Kopplade åtgärder'));
    var tom = el('div', 'tomt');
    tom.innerHTML = 'Inga ännu. En signifikant installation <b>ska</b> ha en kopplad åtgärd – det görs i planeringsflödet (nästa etapp). När åtgärden är kopplad blir installationen grön i modellen.';
    sek.appendChild(tom);
    k.appendChild(sek);

    var a = atgardForTyp(inst.typ);
    if (a) {
      var sek2 = el('div', 'sektion');
      sek2.appendChild(el('h4', null, 'Matchande åtgärd i bruttolistan'));
      var rad = el('div', 'a-rad');
      rad.innerHTML = '<b>' + a.namn + '</b> · föreslagen rond <i>' + rondNamn(a.foreslagenRond) + '</i>';
      sek2.appendChild(rad);
      sek2.appendChild(atgardstext(a.kontrollpunkter));
      k.appendChild(sek2);
    }

    var knappar = el('div', 'knapprad');
    var visa = el('button', 'knapp sekundar', 'Visa i modellen');
    visa.addEventListener('click', function () { viewer.valjInstallation(inst, true); });
    var gaIn = el('button', 'knapp sekundar', 'Gå in i ' + r.namn.toLowerCase());
    gaIn.addEventListener('click', function () { viewer.gaIn(r.nr); viewer.valjInstallation(inst, false); });
    knappar.appendChild(visa); knappar.appendChild(gaIn);
    k.appendChild(knappar);
  }

  function visaRumKort(r) {
    var area = (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
    var k = nyttKort(rumNamn(r.nr), 'Plan ' + planNamn(r.plan) + ' · ' + area + ' m²');
    var lista = instPerRum[r.nr] || [];
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
    gaIn.addEventListener('click', function () { viewer.gaIn(r.nr); });
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
      tips.innerHTML = '<b>' + rum.nr + ' ' + rum.namn + '</b><br>Klicka: information · Dubbelklicka: gå in';
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
    var g = el('span', 'f-post kommande');
    g.innerHTML = '<span class="prick" style="background:#22b45a"></span>Har kopplad åtgärd';
    g.title = 'Används i nästa etapp när åtgärder kopplas';
    f.appendChild(g);
  }

  byggTrad();
  byggAtgarder();
  byggForklaring();
})();
