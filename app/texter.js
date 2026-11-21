/*
 * Flöden för att ändra åtgärdstexter på de tre nivåerna:
 *   standard (bruttolistan) · installation (modellen / alla rutintillfällen) · rutintillfälle (telefonen)
 * Varje flöde ställer sina frågor i en dialog och gör sedan ändringen som ett steg i historiken.
 */
(function () {
  'use strict';

  var DP = window.DP, P = DP.Plan, D = DP.Dialog;
  function instNamn(instId) {
    if (instId === 'BYGGNAD') { return P.byggnad().namn + ' (hela byggnaden)'; }
    var i = P.instIndex[instId];
    return i.beteckning + ' ' + i.benamning;
  }
  function kortNamn(instId) { return instId === 'BYGGNAD' ? P.byggnad().namn : P.instIndex[instId].beteckning; }

  function veckoChips(lista) {
    return '<div class="vchips">' + lista.map(function (t) { return '<span class="vchip">' + t + '</span>'; }).join('') + '</div>';
  }

  // Gemensam del: rad med kryssruta + Jämför-knapp när det finns avvikelser som krockar
  function konfliktRuta(text, versioner, kryssText) {
    var w = document.createElement('div');
    w.className = 'notis konflikt';
    w.innerHTML = text;
    var rad = document.createElement('div');
    rad.className = 'konflikt-rad';
    var lab = document.createElement('label');
    var cb = document.createElement('input'); cb.type = 'checkbox';
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' + kryssText));
    rad.appendChild(lab);
    var jmf = document.createElement('button');
    jmf.className = 'knapp sekundar liten-knapp';
    jmf.textContent = 'Jämför åtgärdstexter';
    jmf.addEventListener('click', function () { D.jamfor(versioner); });
    rad.appendChild(jmf);
    w.appendChild(rad);
    return { nod: w, skrivOver: function () { return cb.checked; } };
  }

  // ------------------------------------------------------------------
  // 1. Standardtext i bruttolistan
  // ------------------------------------------------------------------
  function sparaStandard(atgId, punkter, kalla) {
    var a = P.atgard(atgId), s = P.state();
    if (P.lika(punkter, P.standardText(atgId))) { return; }
    var kopp = s.kopplingar.filter(function (k) { return k.atgard === atgId; });
    var text = 'Ändrade standardtexten för ' + a.namn;
    if (!kopp.length) {
      P.andra(text, function (st) { P.sattStandard(st, atgId, punkter); }, { kalla: kalla });
      return;
    }
    var ronder = kopp.map(function (k) { return P.rondNamn(k.rond); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    var antalRt = P.rutintillfallen().filter(function (t) { return kopp.some(function (k) { return k.rond === t.rond; }); }).length;
    var avv = kopp.filter(function (k) { return P.kopplingAvviker(k); });

    var nod = document.createElement('div');
    nod.innerHTML = '<p><b>' + a.namn + '</b> är redan kopplad till ' + (kopp[0].inst === 'BYGGNAD' ? 'byggnaden' : kopp.length + ' installationer') +
      ' i ronden ' + ronder.join(', ') + ' och ingår i ' + antalRt + ' rutintillfällen.</p><p>Ska alla redan kopplade åtgärder uppdateras med den nya åtgärdstexten?</p>';
    var konflikt = null;
    if (avv.length) {
      var versioner = [{ rubrik: 'Ny standardtext', under: 'bruttolistan', punkter: punkter }, { rubrik: 'Nuvarande standardtext', under: 'bruttolistan', punkter: P.standardText(atgId) }];
      avv.slice(0, 2).forEach(function (k) {
        var t = P.textFor(k, null);
        if (t.niva === 'installation') { versioner.push({ rubrik: 'Avvikande för ' + kortNamn(k.inst), under: 'alla rutintillfällen', punkter: t.punkter }); }
        else { var ta = P.tillfalleAvvikelser(k)[0]; versioner.push({ rubrik: 'Avvikande för ' + kortNamn(k.inst), under: ta.namn, punkter: ta.punkter }); }
      });
      konflikt = konfliktRuta('<b>' + avv.length + ' av de kopplade åtgärderna har redan en avvikande åtgärdstext</b> (' + avv.map(function (k) { return kortNamn(k.inst); }).join(', ') +
        '). De behåller sin avvikande text om du inte väljer att skriva över dem.', versioner, 'Skriv även över de avvikande åtgärdstexterna');
      nod.appendChild(konflikt.nod);
    }
    D.visa({
      titel: 'Uppdatera kopplade åtgärder?', nod: nod, bredd: 560,
      knappar: [
        { text: 'Ja, uppdatera', prim: true, gor: function () {
          var over = konflikt && konflikt.skrivOver();
          P.andra(text + (over ? ' (även avvikande)' : ''), function (st) {
            P.sattStandard(st, atgId, punkter);
            if (over) { P.rensaInst(st, atgId); P.rensaTillfallen(st, atgId); }
          }, { kalla: kalla });
        } },
        { text: 'Avbryt' }
      ]
    });
  }

  // ------------------------------------------------------------------
  // 2. Installationens åtgärdstext (gäller alla rutintillfällen där åtgärden ingår för installationen)
  // ------------------------------------------------------------------
  // franVecka: ändringen gjordes i ett rutintillfälle – det tillfällets egen text ersätts alltid
  function sparaInst(k, punkter, kalla, franVecka) {
    var a = P.atgard(k.atgard);
    var avv = P.tillfalleAvvikelser(k).filter(function (x) { return x.vecka !== franVecka; });
    if (P.lika(punkter, P.textFor(k, null).punkter) && !avv.length && franVecka === undefined) { return; }
    var rt = P.rutintillfallen().filter(function (t) { return t.rond === k.rond; });
    var nod = document.createElement('div');
    nod.innerHTML = '<p>Du ändrar åtgärdstexten för <b>' + a.namn + '</b> på just <b>' + instNamn(k.inst) + '</b>. ' +
      'Övriga installationer behåller standardtexten.</p><p>Installationens åtgärd ingår i ' + rt.length + ' rutintillfällen i ronden ' + P.rondNamn(k.rond) + ':</p>' +
      veckoChips(rt.map(function (t) { return 'v' + t.vecka; }));
    var konflikt = null;
    if (avv.length) {
      var versioner = [{ rubrik: 'Ny text', under: 'för ' + kortNamn(k.inst), punkter: punkter }];
      avv.forEach(function (x) { versioner.push({ rubrik: 'Avvikande text', under: x.namn, punkter: x.punkter }); });
      versioner.push({ rubrik: 'Standardtext', under: 'bruttolistan', punkter: P.standardText(k.atgard) });
      konflikt = konfliktRuta('<b>' + avv.length + ' av rutintillfällena har redan en egen avvikande åtgärdstext</b> för installationen (' +
        avv.map(function (x) { return 'v' + x.vecka; }).join(', ') + '). Vill du uppdatera även den avvikande texten?', versioner, 'Ja, uppdatera även dessa');
      nod.appendChild(konflikt.nod);
    }
    D.visa({
      titel: 'Ändra åtgärdstexten för ' + kortNamn(k.inst) + '?', nod: nod, bredd: 560,
      knappar: [
        { text: 'Spara', prim: true, gor: function () {
          var over = konflikt && konflikt.skrivOver();
          P.andra('Avvikande åtgärdstext för ' + kortNamn(k.inst) + ' (' + a.namn + ')', function (st) {
            P.sattInst(st, k.atgard, k.inst, punkter);
            if (over) { P.rensaTillfallen(st, k.atgard, k.inst); }
            if (franVecka !== undefined) { delete st.tillfalleTexter[k.atgard + '|' + k.inst + '|' + k.rond + '|' + franVecka]; }
          }, { kalla: kalla });
        } },
        { text: 'Avbryt' }
      ]
    });
  }

  // ------------------------------------------------------------------
  // 3. Ändring i ett rutintillfälle (telefonen): bara detta eller alla rutintillfällen
  // ------------------------------------------------------------------
  function sparaTillfalle(k, vecka, punkter, kalla) {
    var a = P.atgard(k.atgard);
    var namn = P.rutintillfalleNamn(k.rond, vecka);
    var antal = P.rutintillfallen().filter(function (t) { return t.rond === k.rond; }).length;
    D.visa({
      titel: 'Var ska den nya åtgärdstexten gälla?', bredd: 560,
      html: '<p>Du har ändrat åtgärdstexten för <b>' + a.namn + '</b> på <b>' + instNamn(k.inst) + '</b>.</p>' +
        '<p>Ska ändringen bara gälla i det här rutintillfället, eller i alla ' + antal + ' rutintillfällen där åtgärden ingår?</p>',
      knappar: [
        { text: 'Bara i ' + namn, prim: true, gor: function () {
          P.andra('Avvikande åtgärdstext i ' + namn + ' (' + kortNamn(k.inst) + ')', function (st) { P.sattTillfalle(st, k, vecka, punkter); }, { kalla: kalla });
        } },
        { text: 'I alla ' + antal + ' rutintillfällen', gor: function (p) { sparaInst(k, punkter, p, vecka); } },
        { text: 'Avbryt' }
      ]
    });
  }

  // Jämför gällande text med nivåerna ovanför
  function jamforNivaer(k, vecka) {
    var v = [];
    var t = P.textFor(k, vecka);
    if (t.niva === 'tillfalle') { v.push({ rubrik: 'Detta rutintillfälle', under: P.rutintillfalleNamn(k.rond, vecka), punkter: t.punkter }); }
    var it = P.textFor(k, null);
    if (it.niva === 'installation') { v.push({ rubrik: 'Installationen', under: 'alla rutintillfällen för ' + kortNamn(k.inst), punkter: it.punkter }); }
    if (vecka === null || vecka === undefined) {
      P.tillfalleAvvikelser(k).forEach(function (x) { v.push({ rubrik: 'Avvikande text', under: x.namn, punkter: x.punkter }); });
    }
    v.push({ rubrik: 'Standardtext', under: 'bruttolistan', punkter: P.standardText(k.atgard) });
    D.jamfor(v, { bas: v.length - 1 });
  }

  DP.Texter = { sparaStandard: sparaStandard, sparaInst: sparaInst, sparaTillfalle: sparaTillfalle, jamforNivaer: jamforNivaer, kortNamn: kortNamn };
})();
