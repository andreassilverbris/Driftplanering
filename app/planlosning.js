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
    // Står ordet "plan" redan i beteckningen används den som den är: en inläsningsfil där
    // planen heter "Plan 3" ska inte ge benämningen "Plan Plan 3".
    var s = txt(id);
    if (/^plan\b/i.test(s)) { return s.charAt(0).toUpperCase() + s.slice(1); }
    return 'Plan ' + s;
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

  // ------------------------------------------------------------------
  // Rummens placering ur byggnadstypens regel (beslut 78 och 99)
  // ------------------------------------------------------------------
  // Ett inläst rum bär **ingen rektangel** – filen har NTA och ingenting om var rummet
  // ligger, eftersom ingen har en ritning (det är hela skälet till att inläsningsfilen
  // finns). Rektangeln räknas därför här, ur byggnadstypens regel och rummens ordning:
  // bredden ur NTA, djupet ur typen, och rummen i den ordning de står i byggnadsdatan.
  //
  // **Ordningen är placeringen** (beslut 78). Listan kommer in i nummerordning från
  // inläsningen, och planeraren kan dra om den – då byter rummen plats i modellen. Det är
  // varför ordningen går att dra om men fri ritning inte finns: ordningen är det enda
  // planeraren behöver kunna säga för att grannarna ska bli rätt.
  //
  // Att modellen blir schematisk och inte verklighetstrogen är avsiktligt: följer
  // verklighetens numrering inte regeln blir modellen schematisk, inte fel.
  var MIN_BREDD = 2, STD_NTA = 36;

  // Rummet pekas ut med plan + rumsnummer (beslut 76), så den nyckeln är också den som
  // parar ihop ett rum med den rektangel regeln räknade fram för det.
  function nyckel(r) { return DP.rumNyckel(r.plan, r.nr); }
  // Rumstypens sort i modellen: det viewern färgar golvet efter. Översättningen bor i
  // tabellen (`data/rumstyper.js`), så att en ny rumstyp inte kräver en ändring här.
  function kategoriFor(rumstyp) {
    var t = (DP.rumstyper || {})[rumstyp];
    return (t && t.kategori) || 'forrad';
  }

  function regelFor(b) {
    var t = (DP.byggnadstyper || {})[(b || {}).typ] || {};
    var r = t.planlosning || {};
    return {
      regel: r.regel || 'korridor',
      djup: r.djup || SKAL.djup,
      korrBredd: r.korrBredd || 2,
      langd: r.langd || SKAL.langd
    };
  }

  // Rummets bredd längs byggnaden: NTA delat på det djup regeln ger det. Ett rum utan NTA
  // får standardvärdet – inläsningen kräver NTA (beslut 79), men en byggnad som fylls i för
  // hand kan ha ett rum utan, och ett rum med bredden noll hade varit osynligt.
  function bredd(r, djup) {
    var nta = Number(r.nta) || STD_NTA;
    return Math.max(MIN_BREDD, nta / djup);
  }

  // Korridorsregeln: en korridor längs byggnaden och rummen på båda sidor, i nummerordning
  // **medurs** runt korridoren – ut längs ena sidan och tillbaka längs den andra, som i en
  // kasern (beslut 78).
  //
  // Rummen delas mellan sidorna **mitt i nummerordningen**: första halvan ut längs ena sidan,
  // andra halvan tillbaka längs den andra. Att dela på halva NTA:n i stället hade sett jämnare
  // ut i en byggnad med lika rum, men brutit rundan så fort ett rum dominerar – en hall på
  // 500 m² hade legat ensam på sin sida, och nästa rum i ordningen hamnat längst bort på den
  // andra. Rundan är det planeraren läser i modellen; symmetrin är bara en följd av rummen.
  //
  // Ett rum vars **rumstyp är korridor** blir korridoren själv och ligger inte i raden: det
  // är det rum som löper genom planet, och att lägga det i ledet hade gett en byggnad med
  // två korridorer – en riktig och en på tvären.
  function laggUtKorridor(rum, reg) {
    var korrDjup = Math.min(reg.korrBredd, reg.djup - 2 * MIN_BREDD);
    var sidDjup = (reg.djup - korrDjup) / 2;
    var z0Syd = 0, z1Syd = sidDjup;
    var z0Korr = sidDjup, z1Korr = sidDjup + korrDjup;
    var z0Norr = z1Korr, z1Norr = reg.djup;

    var korridorer = rum.filter(function (r) { return r.rumstyp === 'korridor'; });
    var ovriga = rum.filter(function (r) { return r.rumstyp !== 'korridor'; });
    // Udda antal lägger det extra rummet på första sidan, så att rundan börjar där.
    var vand = Math.ceil(ovriga.length / 2);

    var ut = [], x = 0, sydSlut = 0, norrBredder = [];
    ovriga.forEach(function (r, i) {
      var w = bredd(r, sidDjup);
      if (i < vand) {
        ut.push({ r: r, rect: [x, z0Syd, x + w, z1Syd] });
        x += w;
        sydSlut = x;
      } else {
        // Norra sidan räknas ut i samma ordning men läggs ut **baklänges** längs x, så att
        // rundan går medurs: sista rummet hamnar vid samma ände som det första.
        norrBredder.push({ r: r, w: w });
      }
    });
    var norrLangd = norrBredder.reduce(function (s, o) { return s + o.w; }, 0);
    var langd = Math.max(sydSlut, norrLangd, reg.korrBredd * 2);
    var xn = langd;
    norrBredder.forEach(function (o) {
      ut.push({ r: o.r, rect: [xn - o.w, z0Norr, xn, z1Norr] });
      xn -= o.w;
    });
    // Korridoren löper genom hela planet. Finns flera delas längden mellan dem – ett plan
    // med två korridorer är ovanligt, men filen bestämmer och systemet ska inte tappa en rad.
    korridorer.forEach(function (r, i) {
      var del = langd / korridorer.length;
      ut.push({ r: r, rect: [i * del, z0Korr, (i + 1) * del, z1Korr] });
    });
    return { rum: ut, langd: langd, djup: reg.djup };
  }

  // Hallregeln: ett garage eller en hangar är ett stort utrymme med några rum längs ena
  // långsidan. Rummen läggs i nummerordning längs x på den sidan; det stora utrymmet –
  // det rum som är störst – får resten av planet.
  //
  // Att det största rummet blir hallen och inte ett rum i ledet är inget val om rumstypen:
  // en hangar har en flyghall, ett garage en vagnhall, och de heter vad de heter i
  // fastighetssystemet. Storleken är det som alltid skiljer dem från ett kontor.
  function laggUtHall(rum, reg) {
    if (!rum.length) { return { rum: [], langd: reg.langd, djup: reg.djup }; }
    // Hallen är det rum vars NTA är störst, och bara när den är stor nog att dominera:
    // ett plan med fem lika rum har ingen hall, och då är det en rad av rum.
    var sorterade = rum.slice().sort(function (a, b2) {
      return (Number(b2.nta) || 0) - (Number(a.nta) || 0);
    });
    var totalNta = rum.reduce(function (s, r) { return s + (Number(r.nta) || STD_NTA); }, 0);
    var hall = (Number(sorterade[0].nta) || 0) > totalNta / 2 ? sorterade[0] : null;
    var ovriga = rum.filter(function (r) { return r !== hall; });

    // Sidodjupet: en remsa längs ena långsidan, tillräckligt djup för att rymma ett rum men
    // inte så djup att hallen försvinner.
    var sidDjup = Math.max(MIN_BREDD, Math.min(reg.djup / 3, 6));
    var sidLangd = ovriga.reduce(function (s, r) { return s + bredd(r, sidDjup); }, 0);
    var hallNta = hall ? Number(hall.nta) || STD_NTA : 0;
    var hallDjup = hall ? reg.djup - (ovriga.length ? sidDjup : 0) : 0;
    // Hallens längd kommer ur **dess egen NTA**, precis som varje annat rums bredd gör.
    // Att i stället sträcka den över hela planet hade gett en hall som är större än sin
    // area: planeraren jämför summan i steget mot modellen, och de två ska stämma.
    var hallLangd = hall ? hallNta / Math.max(hallDjup, MIN_BREDD) : 0;
    var langd = Math.max(sidLangd, hallLangd, reg.korrBredd * 2);

    var ut = [], x = 0;
    ovriga.forEach(function (r) {
      var w = bredd(r, sidDjup);
      ut.push({ r: r, rect: [x, reg.djup - sidDjup, x + w, reg.djup] });
      x += w;
    });
    if (hall) { ut.push({ r: hall, rect: [0, 0, hallLangd, hallDjup] }); }
    return { rum: ut, langd: langd, djup: reg.djup };
  }

  // Rummen på ett plan lagda ut enligt byggnadstypens regel. Svaret är en lista med
  // `{ r, rect }` och planets mått, så att den som ritar kan hålla planen lika stora.
  //
  // Fristående och utan DOM, som allt annat här: att rummen inte överlappar och ligger i
  // nummerordning är en räkning, och den ska gå att pröva i ett test utan en 3D-vy.
  function laggUtRum(byggnad, rum) {
    var reg = regelFor(byggnad);
    return reg.regel === 'hall' ? laggUtHall(rum || [], reg) : laggUtKorridor(rum || [], reg);
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
    // Rummen utan rektangel – de inlästa – läggs ut enligt byggnadstypens regel innan måtten
    // räknas, så att ramen omfattar också dem. Utläggningen sker per plan: varje plan har sin
    // egen runda runt korridoren, och ett rums grannar är rummen på samma plan.
    var lagda = {};
    plan.forEach(function (p) {
      var utan = (b.rum || []).filter(function (r) { return r.plan === p.id && !r.rect && !r.iRum; });
      if (!utan.length) { return; }
      laggUtRum(b, utan).rum.forEach(function (o) { lagda[nyckel(o.r)] = o.rect; });
    });
    function rektFor(r) { return r.rect || lagda[nyckel(r)] || null; }

    // Byggnadens längd och djup: det som rummen upptar, eller skalets mått när inga rum finns.
    // Måtten är gemensamma för alla plan, eftersom ett plan som är bredare än ett annat hade
    // sett ut som ett fel i en schematisk modell.
    var ram = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    (b.rum || []).forEach(function (r) {
      var rect = rektFor(r);
      if (!rect) { return; }
      ram.x0 = Math.min(ram.x0, rect[0]); ram.z0 = Math.min(ram.z0, rect[1]);
      ram.x1 = Math.max(ram.x1, rect[2]); ram.z1 = Math.max(ram.z1, rect[3]);
    });
    if (!isFinite(ram.x0)) { ram = { x0: 0, z0: 0, x1: SKAL.langd, z1: SKAL.djup }; }

    // Rum per plan, och höjden varje plan behöver. Ett plan utan rum får ett skal.
    var rum = [], hojdFor = {};
    plan.forEach(function (p, idx) {
      var under = idx < entre;
      var standard = under ? Math.min(stdHojd, KALLAR_HOJD) : stdHojd;
      var egna = (b.rum || []).filter(function (r) { return r.plan === p.id && rektFor(r); });
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
          // Rektangeln kan vara räknad ur regeln i stället för ritad. Den sätts på kopian och
          // inte på byggnadsdatan: formen är räknad och ska inte ligga i tillståndet (beslut 71),
          // så ett rum som dras om får en ny rektangel utan att något behöver rensas.
          ny.rect = rektFor(r);
          // Rummets sort i modellen kommer ur rumstypen när den finns – ett inläst rum bär
          // `rumstyp` och inte viewerns `typ`, och färgen på golvet ska ändå bli rätt.
          if (!ny.typ && r.rumstyp) { ny.typ = kategoriFor(r.rumstyp); }
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
    // Sadeltakets bas står i byggnadstypens stil och är måttsatt för en **färdig** byggnad –
    // i kasernens fall fem plan. En byggnad som planeraren bygger upp ur en fil har sällan
    // fem plan, och ett tak som svävade ovanför översta bjälklaget hade sett ut som ett fel
    // i modellen. Basen följer därför byggnadens faktiska topp.
    //
    // Undantaget är de handritade byggnaderna (beslut 101): deras plan bär egna elevationer
    // i datafilen, och då är stilen ritad för just den byggnaden och ska gälla som den står.
    // Skiljelinjen går alltså vid **om byggnaden är ritad eller räknad**, inte vid om något
    // plan råkar vara skal just nu – ett hus som nyss blev färdigt ska inte plötsligt få
    // ett tak som svävar tre meter upp.
    var ritad = plan.some(function (p) { return p.elev != null; });
    var ut = kopia(b, utPlan, rum);
    if (!ritad && ut.stil && ut.stil.tak === 'sadel') {
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
    benamningsforslag: benamningsforslag, form: form, SKAL: SKAL,
    laggUtRum: laggUtRum, regelFor: regelFor, kategoriFor: kategoriFor
  };
})();
