/*
 * Planlösningen: byggnadens form räknad fram ur plan, rum och byggnadstypens regel.
 *
 * Fristående från DOM, som `DP.Balansering` (beslut 61): modulen får rena data in och ger
 * rena data ut, så att formen går att pröva i ett test utan att en 3D-vy finns. Det som bor
 * här är *geometrin* – vilken höjd ett plan ligger på, hur stort skalet är och var rummen
 * hamnar – och ingenting om hur det ritas.
 *
 * Två uppgifter:
 *
 *   `foreslagenOrdning(plan)`  Ordningen nedifrån och upp, föreslagen ur beteckning och
 *                              benämning (beslut 84): källare under, vind överst. Planeraren
 *                              kan dra om den, och förslaget är bara ett förslag.
 *   `form(byggnad)`            Byggnaden med `elev` per plan och de rum modellen ritar. Ett
 *                              plan utan klara rum blir ett **skal** i byggnadstypens
 *                              standardstorlek (beslut 85 och 111), så att modellen växer fram
 *                              med stegen i stället för att stå tom till slutet.
 *
 * **De handritade byggnaderna rörs inte** (beslut 101). Garage, Kasern 1 och 2 och Hangar har
 * sina egna rektanglar och elevationer i `data/`, och `form()` lämnar ett plan som har rum i
 * byggnadsdatan precis som det är. Regeln gäller bara det som saknas: ett plan utan rum får
 * ett skal, och ett plan utan elev får en räknad.
 */
(function () {
  'use strict';
  var DP = window.DP;

  // Skalets mått när inget rum säger något annat. Djupet är kasernens (två rumsrader och en
  // korridor), så att skalet och den färdiga byggnaden är ungefär lika stora och modellen inte
  // hoppar i storlek när rummen kommer in.
  var SKAL = { langd: 36, djup: 14 };
  var STD_HOJD = 3.1, KALLAR_HOJD = 2.6, BJALK = 0.2;
  // Rangerna för de plan vars beteckning inte säger var de hör hemma. En vind ligger överst
  // oavsett beteckning; ett plan utan siffra har systemet inget att ordna på och hamnar
  // ovanför de numrerade, så att planeraren drar det på plats i stället för att en gissning
  // ser rätt ut. Talen är bara större än varje rimlig våningssiffra.
  var RANG_VIND = 1000, RANG_OKAND = 500;

  function txt(v) { return v == null ? '' : String(v).trim(); }
  // Grund kopia: svaret från `form()` är nya objekt, så att ingen läsare kan råka ändra
  // byggnadsdatan i tillståndet genom den räknade formen (beslut 71).
  function grundkopia(o) {
    var ut = {};
    Object.keys(o).forEach(function (k) { ut[k] = o[k]; });
    return ut;
  }

  // ------------------------------------------------------------------
  // Planens ordning (beslut 84)
  // ------------------------------------------------------------------
  // "P1", "01", "1" och "Plan 1" blir alla 1; källare blir negativa. Samma tolkning som
  // inläsningen behöver för att matcha ett plan förlåtande (beslut 77), så den bor här och
  // inte på två ställen.
  function planTal(s) {
    var t = txt(s).toLowerCase();
    if (!t) { return null; }
    if (/^(k|källare|kallare)\b/.test(t) || /^k\d/.test(t)) {
      var k = t.match(/\d+/);
      return -(k ? parseInt(k[0], 10) : 1);
    }
    var m = t.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // Var planet hör hemma i ordningen nedifrån och upp. Benämningen väger tyngre än beteckningen
  // när den säger något otvetydigt: ett plan som heter "Källarplan" ligger under 01 även om det
  // är betecknat 00 eller 1, och "Vindsplan" överst även om beteckningen är låg.
  function planRang(p) {
    var namn = txt(p.namn).toLowerCase();
    if (/vind|teknikplan/.test(namn)) { return RANG_VIND; }
    if (/källar|kallar/.test(namn)) {
      var t0 = planTal(p.id);
      return t0 != null && t0 <= 0 ? t0 - 0.5 : -1;
    }
    var t = planTal(p.id);
    return t == null ? RANG_OKAND : t;
  }

  // Ordningen nedifrån och upp, som en lista med plan-id. Stabil: två plan med samma rang
  // behåller den inbördes ordning de kom i, så ett förslag aldrig kastar om något i onödan.
  function foreslagenOrdning(plan) {
    return (plan || []).map(function (p, i) { return { id: p.id, r: planRang(p), i: i }; })
      .sort(function (a, b) { return a.r - b.r || a.i - b.i; })
      .map(function (x) { return x.id; });
  }

  // Benämningen ett plan utan namn får (berättelse 34). Alla plan ska ha ett namn i listor och
  // i modellen, och ett tomt namn är inget att visa.
  function benamningsforslag(id) {
    var t = planTal(id);
    if (t != null && t < 0) { return t === -1 ? 'Källarplan' : 'Källarplan ' + (-t); }
    return 'Plan ' + txt(id);
  }

  // ------------------------------------------------------------------
  // Formen: elevationer och skal
  // ------------------------------------------------------------------
  // Entréplanet – det första planet nedifrån vars beteckning är 1 eller mer – ligger på marken,
  // och planen under det går nedåt (beslut 85). Har inget plan en beteckning som är 1 eller mer
  // ligger det nedersta på marken: en byggnad som bara har en källare står ändå på marken.
  function entreIndex(plan) {
    for (var i = 0; i < plan.length; i++) {
      var t = planTal(plan[i].id);
      if (t != null && t >= 1) { return i; }
    }
    return 0;
  }

  // Rummets höjd: NTV ÷ NTA när båda finns (beslut 79), annars planets standardhöjd. Gränserna
  // håller en felskriven NTV från att göra ett rum tio våningar högt.
  function rumHojd(r, standard) {
    if (r.hojd) { return r.hojd; }
    if (r.ntv && r.nta) { return Math.max(2.2, Math.min(15, r.ntv / r.nta)); }
    return standard;
  }

  // Byggnaden som modellen ska ritas ur: samma form som datafilerna i `data/`, med `elev` per
  // plan och `rect` per rum. Byggnadsdatan själv rörs inte – svaret är en ny byggnad, så att
  // tillståndet inte bär något som är räknat (beslut 71).
  //
  // Plan utan rum får ett skal: ett enda rum som täcker hela planet, märkt `skal` så att vyn
  // kan visa det som ett tomt bjälklag och inte som ett rum man går in i.
  function form(byggnad) {
    var b = byggnad;
    if (!b) { return null; }
    var K = b.konstanter || {};
    var stdHojd = K.FRIHOJD || STD_HOJD, bjalk = K.BJALKLAG || BJALK;
    var plan = (b.plan || []).slice();
    if (!plan.length) { return kopia(b, [], []); }

    var entre = entreIndex(plan);
    // Byggnadens längd och djup: det som rummen upptar, eller skalets mått när inga rum finns.
    // Måtten är gemensamma för alla plan, eftersom ett plan som är bredare än ett annat hade
    // sett ut som ett fel i en schematisk modell.
    var ram = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    (b.rum || []).forEach(function (r) {
      if (!r.rect) { return; }
      ram.x0 = Math.min(ram.x0, r.rect[0]); ram.z0 = Math.min(ram.z0, r.rect[1]);
      ram.x1 = Math.max(ram.x1, r.rect[2]); ram.z1 = Math.max(ram.z1, r.rect[3]);
    });
    if (!isFinite(ram.x0)) { ram = { x0: 0, z0: 0, x1: SKAL.langd, z1: SKAL.djup }; }

    // Rum per plan, och höjden varje plan behöver. Ett plan utan rum får ett skal.
    var rum = [], hojdFor = {};
    plan.forEach(function (p, idx) {
      var under = idx < entre;
      var standard = under ? Math.min(stdHojd, KALLAR_HOJD) : stdHojd;
      var egna = (b.rum || []).filter(function (r) { return r.plan === p.id && r.rect; });
      var maxH = standard;
      if (!egna.length) {
        // Skalet (beslut 85): planet finns, men rummen är inte inlästa än. Det syns som ett
        // bjälklag i typens standardstorlek, så att planeraren ser byggnaden växa – och ser
        // källaren ligga överst när ordningen är fel (beslut 111 och berättelse 53).
        rum.push({
          nr: '000', namn: txt(p.namn) || benamningsforslag(p.id), plan: p.id,
          typ: 'kommunikation', rect: [ram.x0, ram.z0, ram.x1, ram.z1],
          hojd: standard, skal: true, utanInstallationer: true
        });
      } else {
        egna.forEach(function (r) {
          var h = rumHojd(r, standard);
          if (!r.iRum) { maxH = Math.max(maxH, h); }
          var ny = grundkopia(r);
          ny.hojd = h;
          rum.push(ny);
        });
      }
      hojdFor[p.id] = maxH;
    });

    // Elevationerna: entréplanet på marken, planen över det uppåt och planen under nedåt.
    // Ett plan som bär en egen `elev` i byggnadsdatan behåller den – de handritade byggnaderna
    // är ritade med sina mått, och de ska inte flytta (beslut 101).
    var elev = {}, y = 0, i;
    for (i = entre; i < plan.length; i++) {
      elev[plan[i].id] = plan[i].elev != null ? plan[i].elev : y;
      y = elev[plan[i].id] + hojdFor[plan[i].id] + bjalk;
    }
    y = 0;
    for (i = entre - 1; i >= 0; i--) {
      y -= hojdFor[plan[i].id] + bjalk;
      elev[plan[i].id] = plan[i].elev != null ? plan[i].elev : y;
      y = elev[plan[i].id];
    }

    // `baraSkal` per plan: formen vet redan vilka plan som inte har rum, och vyn ska inte
    // behöva räkna om det ur rumslistan. Den som ritar väggarna frågar planet.
    var utPlan = plan.map(function (p) {
      return {
        id: p.id, namn: txt(p.namn) || benamningsforslag(p.id), elev: elev[p.id],
        baraSkal: rum.filter(function (r) { return r.plan === p.id; })
          .every(function (r) { return r.skal; })
      };
    });
    // Sadeltakets bas står i byggnadstypens stil och är måttsatt för en färdig byggnad – i
    // kasernens fall fem plan. En byggnad som växer plan för plan är lägre än så, och ett tak
    // som svävade ovanför översta bjälklaget hade sett ut som ett fel i modellen. Basen följer
    // därför byggnadens faktiska topp så länge något plan är skal; när alla plan har rum står
    // byggnaden på sina egna mått och stilen får gälla som den är ritad (beslut 101).
    var ut = kopia(b, utPlan, rum);
    if (rum.some(function (r) { return r.skal; }) && ut.stil && ut.stil.tak === 'sadel') {
      var topp = plan.reduce(function (h, p) {
        return Math.max(h, elev[p.id] + hojdFor[p.id]);
      }, 0);
      var stil = grundkopia(ut.stil);
      stil.sadel = { bas: topp, hojd: (ut.stil.sadel || {}).hojd || 3 };
      ut.stil = stil;
    }
    return ut;
  }

  // Byggnaden med räknad form. Installationerna följer med som de är: var de sitter är rummets
  // sak, och ett skal har inga.
  function kopia(b, plan, rum) {
    var ut = grundkopia(b);
    ut.plan = plan;
    ut.rum = rum;
    ut.installationer = (b.installationer || []).slice();
    return ut;
  }

  DP.Planlosning = {
    planTal: planTal, planRang: planRang, foreslagenOrdning: foreslagenOrdning,
    benamningsforslag: benamningsforslag, form: form, SKAL: SKAL
  };
})();
