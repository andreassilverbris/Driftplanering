/*
 * PROTOTYP – slit och släng (beslut 75 och 102). Sidan runt inläsningslägets logik.
 * Allt här är tunt: varje klick blir en åtgärd till DP.Inlasning.steg(), och historiken är en
 * lista med tillstånd som mediaspelaren går fram och tillbaka i.
 */
(function () {
  'use strict';
  var DP = window.DP, I = DP.Inlasning;

  var BEFINTLIGA = ['Garage', 'Kasern 1', 'Kasern 2', 'Hangar'];
  var BYGGNADSTYPER = [
    { id: 'garage', namn: 'Garage' }, { id: 'kasern', namn: 'Kasern', aktiv: true },
    { id: 'logement', namn: 'Mindre logement' }, { id: 'hangar', namn: 'Hangar' },
    { id: 'restaurang', namn: 'Militärrestaurang' }, { id: 'utbildning', namn: 'Utbildningsbyggnad' },
    { id: 'panncentral', namn: 'Panncentral' }
  ];
  var OMRADEN = [{ id: 'kasernomradet', namn: 'Kasernområdet' }, { id: 'flygfaltet', namn: 'Flygfältet' }];
  var STEG = [
    { id: 'byggnad', namn: 'Byggnadstyp och namn' }, { id: 'plan', namn: 'Plan' },
    { id: 'rum', namn: 'Rum' }, { id: 'inst', namn: 'Installationer' }
  ];

  // ---------------- Historik ----------------
  var hist = [{ text: 'Start: ingen byggnad', st: I.tomt() }], pos = 0, aktivt = 'byggnad';
  function cur() { return hist[pos].st; }
  function gor(a) {
    var text = I.beskriv(cur(), a), st = I.steg(cur(), a);
    hist = hist.slice(0, pos + 1).concat([{ text: text, st: st }]);
    pos = hist.length - 1;
    rita();
  }
  function ga(n) { pos = Math.max(0, Math.min(hist.length - 1, n)); rita(); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  // ---------------- Mediaspelaren ----------------
  function ritaSpelare() {
    var opts = hist.map(function (h, i) { return '<option value="' + i + '"' + (i === pos ? ' selected' : '') + '>' + (i) + '. ' + esc(h.text) + '</option>'; }).join('');
    $('spelare').innerHTML =
      '<button data-ga="0" title="Till början"' + (pos === 0 ? ' disabled' : '') + '>⏮</button>' +
      '<button data-ga="' + (pos - 1) + '" title="Ångra (Ctrl/⌘+Z)"' + (pos === 0 ? ' disabled' : '') + '>◀</button>' +
      '<button data-ga="' + (pos + 1) + '" title="Gör om (Ctrl/⌘+Shift+Z)"' + (pos === hist.length - 1 ? ' disabled' : '') + '>▶</button>' +
      '<button data-ga="' + (hist.length - 1) + '" title="Till senaste"' + (pos === hist.length - 1 ? ' disabled' : '') + '>⏭</button>' +
      '<select id="historik" title="Hoppa till ett steg">' + opts + '</select>';
  }

  // ---------------- Vänsterpanelen ----------------
  function rita() {
    var st = cur(), ss = I.stegStatus(st);
    if (!st.byggnad) { aktivt = 'byggnad'; }
    ritaSpelare();

    var b = st.byggnad, rad = '';
    if (b) {
      var statusTxt = !st.fil ? '<span class="bricka vantar">Väntar på inläsningsfil</span>'
        : (ss.plan.klar && ss.rum.klar && ss.inst.klar ? '<span class="bricka klar">Klar för Planering</span>' : '<span class="bricka pagar">Inläsning pågår</span>');
      rad = '<div class="byggrad"><b>' + esc(b.namn) + '</b> · Kasern · ' + esc(OMRADEN.filter(function (o) { return o.id === b.omrade; })[0].namn) + ' ' + statusTxt + '</div>';
    }
    var linje = STEG.map(function (s, i) {
      var x = ss[s.id], bock = x.klar ? '<span class="bock">✓</span>' : '<span class="nr">' + (i + 1) + '</span>';
      var extra = '';
      if (x.raknat && st.fil && !x.klar) {
        var d = [];
        if (x.raknat.forslag) { d.push('<span class="f">' + x.raknat.forslag + ' förslag</span>'); }
        if (x.raknat.oplacerad) { d.push('<span class="o">' + x.raknat.oplacerad + ' oplacerade</span>'); }
        extra = '<span class="sma">' + d.join(' ') + '</span>';
      }
      var av = (!b && s.id !== 'byggnad') ? ' disabled' : '';
      return '<button class="stegknapp' + (aktivt === s.id ? ' aktiv' : '') + (x.klar ? ' klar' : '') + '" data-steg="' + s.id + '"' + av + '>' + bock + '<span class="sn">' + s.namn + '</span>' + extra + '</button>';
    }).join('');

    var innehall = aktivt === 'byggnad' ? ritaByggnad(st) : ritaInlasning(st, aktivt, ss);
    $('panel').innerHTML = rad + '<nav class="processlinje">' + linje + '</nav><div class="steginnehall">' + innehall + '</div>';
    ritaModell();
  }

  function ritaByggnad(st) {
    if (!st.byggnad) {
      var typer = BYGGNADSTYPER.map(function (t) {
        return '<label class="typval' + (t.aktiv ? '' : ' av') + '"><input type="radio" name="btyp" value="' + t.id + '"' + (t.aktiv ? ' checked' : ' disabled') + '> ' + t.namn + (t.aktiv ? '' : ' <i>(inte i prototypen)</i>') + '</label>';
      }).join('');
      return '<h2>Skapa ny byggnad</h2>' +
        '<p class="ingress">Byggnadstypen ger planlösningens regel, utseendet och standardplaneringen. Den går inte att byta efteråt.</p>' +
        '<div class="falt"><div class="etikett">Byggnadstyp</div><div class="typer">' + typer + '</div></div>' +
        '<div class="falt"><label class="etikett" for="bnamn">Namn</label><input id="bnamn" value="Kasern 3"><div id="namnfel" class="fel"></div></div>' +
        '<div class="falt"><label class="etikett" for="bomrade">Område</label><select id="bomrade">' + OMRADEN.map(function (o) { return '<option value="' + o.id + '">' + o.namn + '</option>'; }).join('') + '</select>' +
        '<div class="hjalptext">Färgen i Balanseringens tidsaxel väljer systemet.</div></div>' +
        '<button class="knapp huvud" id="skapa">Skapa byggnaden</button>';
    }
    var h = '<h2>' + esc(st.byggnad.namn) + ' är skapad</h2>' +
      '<div class="ruta"><h3>Inläsningsfilen</h3>' +
      '<p>En Excel-fil med tre flikar: <b>Plan</b>, <b>Rum</b> och <b>Installationer</b>. Fyll i de flikar du har – eller skicka filen till den som kan. ' +
      'Här blir det ofta ett uppehåll på flera veckor; byggnaden väntar då med statusen <i>Väntar på inläsningsfil</i>.</p>' +
      '<div class="knapprad"><button class="knapp" id="tautfil">Ta ut inläsningsfil' + (st.fil ? ' (med det inlästa)' : '') + '</button>' +
      '<button class="knapp huvud" id="lasin">Läs in fil …</button><input type="file" id="filval" accept=".xlsx,.xls,.numbers,.csv" hidden></div>' +
      '<p class="hjalptext">Går att fylla i i Numbers: öppna, fyll i och exportera som Excel – eller pröva att läsa in Numbers-filen direkt.</p></div>' +
      '<div class="ruta prov"><h3>För att pröva prototypen</h3>' +
      '<p>En påhittad, avsiktligt rörig fil för Kasern 3: plan skrivna som 00, 0, P1, 1 och Plan 3, ett plan som inte finns, rum och installationer som inte känns igen, en saknad NTA och ett tomt Id.</p>' +
      '<div class="knapprad"><button class="knapp" id="tautexempel">Ta ut exempelfilen</button><button class="knapp" id="lasinexempel">Läs in exemplet direkt</button></div></div>';
    if (st.fil) {
      var egna = [].concat(st.egnaKolumner.plan, st.egnaKolumner.rum, st.egnaKolumner.inst);
      h += '<div class="ruta klar"><h3>Inläst: ' + esc(st.fil.namn) + '</h3><p>' + st.planer.length + ' plan, ' + st.rum.length + ' rum och ' + st.inst.length + ' installationer.' +
        (egna.length ? ' Okända kolumner blir <b>egna fält</b> och följer med ut: ' + egna.map(esc).join(', ') + '.' : '') +
        (st.fil.ignorerade.length ? ' Ignorerade blad (kände inte igen rubrikerna): ' + st.fil.ignorerade.map(esc).join(', ') + '.' : '') +
        '</p><button class="knapp huvud" data-steg="plan">Fortsätt till Plan →</button></div>';
    }
    return h;
  }

  function lageRad(st, slag, ss) {
    var x = ss[slag].raknat, n = x.forslag;
    return '<div class="lagesrad"><span class="k">✓ ' + x.klar + ' klara</span>' +
      (x.forslag ? '<span class="f">' + x.forslag + ' förslag</span>' : '') +
      (x.oplacerad ? '<span class="o">' + x.oplacerad + ' oplacerade</span>' : '') +
      (n ? '<button class="knapp huvud" data-godtaalla="' + slag + '">Godta alla förslag (' + n + ')</button>' : '') + '</div>';
  }

  function egnaTxt(rad) {
    var k = Object.keys(rad.egna || {});
    return k.length ? '<div class="egna">' + k.map(function (x) { return esc(x) + ': ' + esc(rad.egna[x]); }).join(' · ') + '</div>' : '';
  }

  function kort(st, slag, rad) {
    var s = I.status(rad), titel;
    if (slag === 'plan') { titel = 'Plan ' + esc(rad.falt.id); }
    else if (slag === 'rum') { titel = esc(rad.rad.plan || '?') + '-' + esc(rad.rad.nr || '?') + ' ' + esc(rad.falt.namn); }
    else { titel = esc(rad.falt.benamning) + ' <span class="gra">' + esc(rad.falt.beteckning) + ' · i fil: ' + esc(rad.rad.plan || '–') + '-' + esc(rad.rad.rum || '–') + '</span>'; }
    var fragor = rad.fragor.map(function (f) {
      var val = '';
      if (f.slag === 'rumstyp') {
        val = ' <select data-rumstyp="' + rad.key + '">' + I.RUMSTYPER.map(function (t) { return '<option value="' + t.id + '"' + (t.id === f.forslag ? ' selected' : '') + '>' + t.namn + '</option>'; }).join('') + '</select>';
      }
      if (f.slag === 'typ') {
        val = ' <select data-typ="' + rad.key + '"><option value="">Välj typ …</option>' + I.signifikantaTyper().map(function (t) { return '<option value="' + t + '">' + DP.installationstyper[t].namn + '</option>'; }).join('') + '</select>';
      }
      var forslag = f.forslag != null && f.slag !== 'rumstyp' ? ' → <b>' + esc(f.slag === 'rum' ? I.rumEtikett(st, f.forslag) : f.forslag) + '</b>' : '';
      return '<li class="' + (f.forslag != null ? 'harforslag' : 'utan') + '">' + esc(f.text) + forslag + val + '</li>';
    }).join('');
    var info = slag === 'inst' && rad.idFranSystemet ? '<div class="gra">Id saknades – systemet gav ' + esc(rad.falt.id) + '</div>' : '';
    var drag = slag === 'plan' ? '' : ' draggable="true" data-drag="' + slag + ':' + rad.key + '"';
    return '<div class="kort ' + s + '"' + drag + '><div class="kort-titel">' + (drag ? '<span class="grepp">⠿</span>' : '') + titel + '</div><ul>' + fragor + '</ul>' + info + egnaTxt(rad) +
      (s === 'forslag' ? '<button class="knapp liten" data-godta="' + slag + ':' + rad.key + '">Godta</button>' : '') + '</div>';
  }

  function ritaInlasning(st, slag, ss) {
    if (!st.fil) { return '<p class="ingress">Ingen fil är inläst ännu. Gå till steg 1 och läs in inläsningsfilen.</p>'; }
    var lst = slag === 'plan' ? st.planer : slag === 'rum' ? st.rum : st.inst;
    var namn = { plan: 'Plan', rum: 'Rum', inst: 'Installationer' }[slag];
    var h = '<h2>' + namn + '</h2>' + lageRad(st, slag, ss);
    if (ss[slag].klar) {
      var nasta = { plan: 'rum', rum: 'inst' }[slag];
      h += '<div class="ruta klar"><b>✓ Steget är klart.</b> ' + (nasta ? '<button class="knapp huvud" data-steg="' + nasta + '">Fortsätt till ' + (nasta === 'rum' ? 'Rum' : 'Installationer') + ' →</button>'
        : 'Byggnaden är klar för Planering – där möter snabbstarten med standardplaneringen för kasern (beslut 88).') + '</div>';
    }
    if (slag === 'plan' && !st.ordningBekraftad) {
      var forsl = I.foreslagenOrdning(st.planer);
      var namnFor = function (id) { var p = st.planer.filter(function (x) { return x.falt.id === id; })[0]; return id + (p.falt.namn ? ' ' + p.falt.namn : ''); };
      h += '<div class="kort forslag"><div class="kort-titel">Planens ordning</div><ul><li class="harforslag">I filen står planen i ordningen ' + st.planOrdning.map(esc).join(', ') +
        '. Nedifrån och upp föreslås → <b>' + forsl.map(namnFor).map(esc).join(' · ') + '</b></li></ul>' +
        '<div class="gra">Utan rätt ordning hamnar källaren överst i modellen – titta till höger.</div><button class="knapp liten" data-godtaordning="1">Godta</button></div>';
    }
    var forslag = lst.filter(function (r) { return I.status(r) === 'forslag'; });
    var oplac = lst.filter(function (r) { return I.status(r) === 'oplacerad'; });
    // Det öppna ligger kvar överst medan listan nedanför rullas, så att det går att dra långt
    var oppet = '';
    if (forslag.length) { oppet += '<h3>Förslag <span class="gra">– systemet tror, du bestämmer</span></h3>' + forslag.map(function (r) { return kort(st, slag, r); }).join(''); }
    if (oplac.length) { oppet += '<h3>Oplacerat <span class="gra">– dra till rätt ' + (slag === 'rum' ? 'plan' : 'rum') + ', eller välj i listan</span></h3>' + oplac.map(function (r) { return kort(st, slag, r); }).join(''); }
    if (oppet) { h += '<div class="oppna">' + oppet + '</div>'; }
    h += '<h3>' + (slag === 'plan' ? 'Planen, översta överst <span class="gra">– dra för att ändra ordningen</span>' : slag === 'rum' ? 'Rummen per plan <span class="gra">– ordningen är placeringen; dra för att ändra ordning eller plan</span>' : 'Installationerna per rum <span class="gra">– dra mellan rummen</span>') + '</h3>';
    h += slag === 'plan' ? klartPlan(st) : slag === 'rum' ? klartRum(st) : klartInst(st);
    return h;
  }

  function planNamn(st, id) { var p = st.planer.filter(function (x) { return x.falt.id === id; })[0]; return p ? (p.falt.namn || I.status(p) === 'forslag' && p.fragor[0].forslag || '') : ''; }

  function klartPlan(st) {
    return st.planOrdning.slice().reverse().map(function (id) {
      var p = st.planer.filter(function (x) { return x.falt.id === id; })[0];
      var antal = st.rum.filter(function (r) { return r.falt.plan === id; }).length;
      return '<div class="planrad" draggable="true" data-drag="plan:' + esc(id) + '" data-plan-id="' + esc(id) + '"><span class="grepp">⠿</span><b>' + esc(id) + '</b> ' + esc(p.falt.namn || '(benämning saknas)') + '<span class="gra"> · ' + antal + ' rum</span></div>';
    }).join('');
  }

  function klartRum(st) {
    return st.planOrdning.slice().reverse().map(function (pid) {
      var keys = I.ordningPaPlan(st, pid);
      var nta = keys.reduce(function (s, k) { var r = st.rum.filter(function (x) { return x.key === k; })[0]; return s + (r.falt.nta || 0); }, 0);
      var chips = keys.map(function (k) {
        var r = st.rum.filter(function (x) { return x.key === k; })[0], s = I.status(r);
        return '<span class="chip-rum ' + s + '" draggable="true" data-drag="rum:' + k + '" data-fore-rum="' + k + '" data-visa="' + esc(pid + '-' + r.falt.nr) + '">' + esc(r.falt.nr || r.rad.nr) + ' ' + esc(r.falt.namn) + (r.falt.nta ? ' <span class="gra">' + r.falt.nta + ' m²</span>' : '') + '</span>';
      }).join('');
      return '<div class="zon" data-zon-plan="' + esc(pid) + '"><div class="zon-titel">Plan ' + esc(pid) + ' – ' + esc(planNamn(st, pid)) + ' <span class="gra">· ' + keys.length + ' rum · ' + Math.round(nta) + ' m² NTA</span></div><div class="chips">' + (chips || '<span class="gra">Släpp rum här</span>') + '</div></div>';
    }).join('');
  }

  function klartInst(st) {
    return st.planOrdning.slice().reverse().map(function (pid) {
      var keys = I.ordningPaPlan(st, pid);
      var rutor = keys.map(function (k) {
        var r = st.rum.filter(function (x) { return x.key === k; })[0];
        var inst = st.inst.filter(function (i) { return i.falt.rumKey === k; });
        var chips = inst.map(function (i) {
          var s = I.status(i), typ = i.falt.typ ? DP.installationstyper[i.falt.typ].namn : '?';
          return '<span class="chip-inst ' + s + '" draggable="true" data-drag="inst:' + i.key + '" title="' + esc(i.falt.benamning + ' – ' + typ) + '">' + esc(i.falt.beteckning || i.falt.benamning) + '</span>';
        }).join('');
        return '<div class="rumruta' + (inst.length ? ' har' : '') + '" data-zon-rum="' + k + '"><div class="rr-titel">' + esc(r.falt.nr) + ' ' + esc(r.falt.namn) + '</div>' + chips + '</div>';
      }).join('');
      return '<div class="zon"><div class="zon-titel">Plan ' + esc(pid) + ' – ' + esc(planNamn(st, pid)) + '</div><div class="rutor">' + rutor + '</div></div>';
    }).join('');
  }

  // ---------------- Modellen ----------------
  var viewer = null, signatur = null, lager = { ytterVaggar: true, innerVaggar: true, tak: true, etiketter: true, rontgen: false }, dolda = {};
  function ritaModell() {
    var ss = I.stegStatus(cur());
    var niva = { rum: aktivt === 'rum' || aktivt === 'inst' || ss.plan.klar, inst: aktivt === 'inst' || ss.rum.klar };
    var b = I.byggModell(cur(), niva);
    $('tom').hidden = !!b;
    $('verktyg').hidden = !b;
    if (!b) { if (viewer) { $('vy3d').style.visibility = 'hidden'; } signatur = null; $('modelltext').textContent = ''; return; }
    $('vy3d').style.visibility = 'visible';
    var sig = JSON.stringify([b.plan, b.rum.map(function (r) { return [r.nr, r.namn, r.rect, r.hojd, r.typ]; }), b.installationer.filter(function (i) { return i.signifikant; }).map(function (i) { return [i.id, i.typ, i.rum, i.x, i.z]; })]);
    // 3D-vyns kamera är inställd för de handritade byggnaderna; backa lite så att hela syns
    function luft() { viewer.storlek = Math.max(viewer.storlek * 1.45, 40); }
    if (!viewer) {
      viewer = new DP.Viewer($('vy3d'), b, { valtInstallation: visaInst, valtRum: visaRumInfo });
      luft(); viewer.aterstallVy(false);
    } else if (sig !== signatur) {
      var p = viewer.camera.position.clone(), m = viewer.controls.target.clone(), forst = signatur === null;
      viewer.sattByggnad(b);
      luft();
      if (!forst) { viewer.camera.position.copy(p); viewer.controls.target.copy(m); } else { viewer.aterstallVy(false); }
    }
    signatur = sig;
    Object.keys(lager).forEach(function (k) { viewer.sattLager(k, lager[k]); });
    b.plan.forEach(function (pl) { viewer.sattPlanSynligt(pl.id, !dolda[pl.id]); });
    ritaVerktyg(b);
    var rum = b.rum.filter(function (r) { return !r.skal; }).length, inst = b.installationer.filter(function (i) { return i.signifikant; }).length;
    var vantar = !niva.rum ? ' Rummen kommer fram i steget Rum.' : !niva.inst ? ' Installationerna kommer fram i steget Installationer.' : '';
    $('modelltext').innerHTML = 'Modellen visar det som är <b>klart</b>: ' + b.plan.length + ' plan, ' + rum + ' rum och ' + inst + ' signifikanta installationer. Förslag och oplacerat syns när de godtagits eller dragits på plats.' + vantar +
      '<br><span class="gra">Senaste steg: ' + esc(hist[pos].text) + '</span>';
  }

  function ritaVerktyg(b) {
    function chip(k, namn, av) { return '<button class="chip' + (lager[k] ? ' pa' : '') + '" data-lager="' + k + '"' + (av ? ' disabled title="Inget att visa ännu"' : '') + '>' + namn + '</button>'; }
    var planer = b.plan.map(function (p) { return '<button class="chip' + (dolda[p.id] ? '' : ' pa') + '" data-plantoggle="' + esc(p.id) + '">' + esc(p.id) + '</button>'; }).join('');
    $('verktyg').innerHTML = '<span class="gn">Visa</span>' + chip('ytterVaggar', 'Ytterväggar') + chip('innerVaggar', 'Innerväggar', !b.harRum) + chip('tak', 'Tak') + chip('etiketter', 'Rumsnamn') + chip('rontgen', 'Röntgen', !b.harInst) +
      '<span class="gn">Plan</span>' + planer + '<span class="gn">Vy</span><button class="chip" data-vy="oversikt">Översikt</button><button class="chip" data-vy="uppifran"' + (b.harRum ? '' : ' disabled') + '>Uppifrån</button>';
  }

  function visaInst(inst) {
    var rad = cur().inst.filter(function (i) { return i.key === inst.key; })[0];
    var f = rad ? rad.falt : inst;
    $('infokort').hidden = false;
    $('infokort').innerHTML = '<button class="stang" data-stang="1">×</button><h3>' + esc(f.benamning) + '</h3><dl>' +
      '<dt>Typ</dt><dd>' + esc(DP.installationstyper[inst.typ].namn) + '</dd><dt>Rum</dt><dd>' + esc(inst.rum) + '</dd>' +
      '<dt>Beteckning</dt><dd>' + esc(f.beteckning) + '</dd><dt>Fabrikat, modell</dt><dd>' + esc(f.fabrikat + ' ' + f.modell) + '</dd>' +
      '<dt>Id</dt><dd>' + esc(f.id) + (rad && rad.idFranSystemet ? ' <i>(från systemet)</i>' : '') + '</dd>' +
      (f.datum ? '<dt>Installationsdatum</dt><dd>' + esc(f.datum) + '</dd>' : '') + '</dl>' + (rad ? egnaTxt(rad) : '');
  }
  function visaRumInfo(r) {
    var rad = cur().rum.filter(function (x) { return x.key === r.key; })[0];
    if (!rad) { return; }
    var f = rad.falt;
    $('infokort').hidden = false;
    $('infokort').innerHTML = '<button class="stang" data-stang="1">×</button><h3>' + esc(r.nr + ' ' + f.namn) + '</h3><dl>' +
      '<dt>Rumstyp</dt><dd>' + esc(I.rumstyp(f.rumstyp).namn) + '</dd><dt>NTA</dt><dd>' + esc(f.nta) + ' m²</dd>' +
      (f.ntv ? '<dt>NTV</dt><dd>' + esc(f.ntv) + ' m³ → rumshöjd ' + (f.ntv / f.nta).toFixed(1) + ' m</dd>' : '<dt>Rumshöjd</dt><dd>' + r.hojd.toFixed(1) + ' m (standard)</dd>') +
      (f.bra ? '<dt>BRA</dt><dd>' + esc(f.bra) + ' m²</dd>' : '') + (f.bta ? '<dt>BTA</dt><dd>' + esc(f.bta) + ' m²</dd>' : '') +
      (f.temp ? '<dt>Temperaturreglerad</dt><dd>' + esc(f.temp) + '</dd>' : '') + '</dl>' + egnaTxt(rad);
  }

  // ---------------- Filer ----------------
  function skrivFil(data, filnamn) {
    var wb = XLSX.utils.book_new();
    ['plan', 'rum', 'inst'].forEach(function (flik) {
      var ws = XLSX.utils.aoa_to_sheet(data[flik]);
      ws['!cols'] = data[flik][0].map(function (r) { return { wch: Math.max(10, r.length + 4) }; });
      XLSX.utils.book_append_sheet(wb, ws, I.FLIKNAMN[flik]);
    });
    XLSX.writeFile(wb, filnamn);
  }
  function exempelArk() {
    var e = DP.exempelKasern3();
    return [{ namn: 'Plan', rader: e.plan }, { namn: 'Rum', rader: e.rum }, { namn: 'Installationer', rader: e.inst }];
  }
  function lasFil(fil) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(r.result), { type: 'array' });
        var ark = wb.SheetNames.map(function (n) { return { namn: n, rader: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }) }; });
        gor({ typ: 'lasIn', fil: I.lasArk(ark), filnamn: fil.name });
      } catch (e) { alert('Filen gick inte att läsa: ' + e.message); }
    };
    r.readAsArrayBuffer(fil);
  }

  // ---------------- Händelser ----------------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, [data-visa]');
    if (!t || t.disabled) { return; }
    var d = t.dataset, st = cur();
    if (d.ga !== undefined) { ga(parseInt(d.ga, 10)); return; }
    if (d.steg) { aktivt = d.steg; rita(); return; }
    if (d.godta) { var g = d.godta.split(':'); gor({ typ: 'godta', slag: g[0], key: g[1] }); return; }
    if (d.godtaalla) { gor({ typ: 'godtaAlla', slag: d.godtaalla }); return; }
    if (d.godtaordning) { gor({ typ: 'godtaPlanordning' }); return; }
    if (d.lager) { lager[d.lager] = !lager[d.lager]; ritaModell(); return; }
    if (d.plantoggle) { dolda[d.plantoggle] = !dolda[d.plantoggle]; ritaModell(); return; }
    if (d.vy) { if (d.vy === 'oversikt') { viewer.aterstallVy(); } else { viewer.uppifran(); } return; }
    if (d.stang) { $('infokort').hidden = true; return; }
    if (d.visa && viewer && viewer.rumIndex[d.visa]) { viewer.visaRum(d.visa); return; }
    if (t.id === 'skapa') {
      var namn = $('bnamn').value.trim();
      if (!namn) { $('namnfel').textContent = 'Byggnaden behöver ett namn.'; return; }
      if (BEFINTLIGA.indexOf(namn) >= 0) { $('namnfel').textContent = 'Det finns redan en byggnad som heter ' + namn + '. Namnet måste vara unikt (beslut 103).'; return; }
      gor({ typ: 'skapa', namn: namn, byggnadstyp: 'kasern', omrade: $('bomrade').value });
      return;
    }
    if (t.id === 'tautfil') { skrivFil(st.fil ? I.taUt(st) : I.tomFil(), st.byggnad.namn + ' – inläsningsfil.xlsx'); return; }
    if (t.id === 'tautexempel') { skrivFil(DP.exempelKasern3(), 'Kasern 3 – exempelfil (rörig).xlsx'); return; }
    if (t.id === 'lasin') { $('filval').click(); return; }
    if (t.id === 'lasinexempel') { gor({ typ: 'lasIn', fil: I.lasArk(exempelArk()), filnamn: 'exempelfilen för Kasern 3' }); return; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'historik') { ga(parseInt(t.value, 10)); return; }
    if (t.id === 'filval' && t.files[0]) { lasFil(t.files[0]); t.value = ''; return; }
    if (t.dataset.rumstyp) { gor({ typ: 'valjRumstyp', key: t.dataset.rumstyp, rumstyp: t.value }); return; }
    if (t.dataset.typ && t.value) { gor({ typ: 'valjTyp', key: t.dataset.typ, instTyp: t.value }); return; }
  });

  // Dra och släpp
  var dras = null;
  document.addEventListener('dragstart', function (e) {
    var t = e.target.closest && e.target.closest('[data-drag]');
    if (!t) { return; }
    dras = t.dataset.drag;
    e.dataTransfer.setData('text/plain', dras);
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('drar-' + dras.split(':')[0]);
  });
  document.addEventListener('dragend', function () {
    dras = null;
    document.body.className = '';
    Array.prototype.forEach.call(document.querySelectorAll('.over'), function (x) { x.classList.remove('over'); });
  });
  function malFor(el) {
    if (!dras || !el.closest) { return null; }
    var slag = dras.split(':')[0];
    if (slag === 'rum') { return el.closest('[data-fore-rum]') || el.closest('[data-zon-plan]'); }
    if (slag === 'plan') { return el.closest('[data-plan-id]'); }
    if (slag === 'inst') { return el.closest('[data-zon-rum]'); }
    return null;
  }
  document.addEventListener('dragover', function (e) {
    var m = malFor(e.target);
    if (!m) { return; }
    e.preventDefault();
    Array.prototype.forEach.call(document.querySelectorAll('.over'), function (x) { if (x !== m) { x.classList.remove('over'); } });
    m.classList.add('over');
  });
  document.addEventListener('drop', function (e) {
    var m = malFor(e.target);
    if (!m) { return; }
    e.preventDefault();
    var d = dras.split(':'), slag = d[0], key = d.slice(1).join(':'), st = cur();
    if (slag === 'rum') {
      if (m.dataset.foreRum) {
        if (m.dataset.foreRum === key) { return; }
        var plan = m.closest('[data-zon-plan]').dataset.zonPlan;
        gor({ typ: 'flyttaRum', key: key, plan: plan, fore: m.dataset.foreRum });
      } else { gor({ typ: 'flyttaRum', key: key, plan: m.dataset.zonPlan }); }
    }
    if (slag === 'plan' && m.dataset.planId !== key) {
      // Listan visar översta planet överst: släpp på ett plan = lägg det dragna ovanför
      var o = st.planOrdning.filter(function (id) { return id !== key; });
      var i = o.indexOf(m.dataset.planId);
      gor({ typ: 'ordnaPlan', id: key, fore: o[i + 1] || null });
    }
    if (slag === 'inst') { gor({ typ: 'flyttaInst', key: key, rumKey: m.dataset.zonRum }); }
  });

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.target.tagName === 'INPUT') { return; }
    var k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ga(pos - 1); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); ga(pos + 1); }
  });

  // Testkrok för skärmdumpar och prov
  window.prototypInlasning = { gor: gor, ga: ga, cur: cur, hist: function () { return hist; }, valj: function (s) { aktivt = s; rita(); }, exempelArk: exempelArk };

  rita();
})();
