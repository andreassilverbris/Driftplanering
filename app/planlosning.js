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
  // Är byggnaden **ritad** eller **räknad**? De fyra befintliga byggnaderna bär egna rektanglar
  // och elevationer i `data/` och lämnas orörda (beslut 101); allt annat räknas fram här.
  // Frågan ställs på två ställen – av taket här inne och av steget Rum, som varnar för att en
  // ritad byggnads grannar inte ritas om – och ska svaras likadant på båda.
  function arRitad(byggnad) {
    return (byggnad && byggnad.plan || []).some(function (p) { return p.elev != null; });
  }

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
    var ritad = arRitad(b);
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


  // ------------------------------------------------------------------
  // BRA och BTA räknade ur modellen (beslut 79, berättelse 43)
  // ------------------------------------------------------------------
  // NTA är alltid rummens summa: den kommer ur filen och systemet räknar inte om den.
  // BRA och BTA finns däremot sällan per rum, och då är det modellen som kan svara – men
  // bara på frågan *vad den här formen är*, och svaret märks därför `beraknad` så att
  // planeraren ser skillnaden mot ett tal ur fastighetssystemet.
  //
  // Geometrin: ett rums rektangel är satt så att dess **yta är rummets NTA** – nettoarean,
  // mätt innanför rummets egna väggar. Planets rum ligger kant i kant, så den omslutande
  // rektangeln är nettoytan samlad plus de mellanrum regeln lämnat. Då följer de två
  // areorna av den rektangeln:
  //
  //   * **BRA** – ytan innanför ytterväggarna – är rektangeln själv. Den är större än NTA
  //     därför att den också rymmer innerväggarna och det som ligger mellan rummen.
  //   * **BTA** – ytan utanför – är rektangeln utökad en halv väggtjocklek runt om, eftersom
  //     viewern ritar ytterväggen **centrerad på rummets kant**: halva väggen ligger innanför
  //     BRA och halva utanför.
  //
  // Att BRA är rektangeln och inte rektangeln minus väggarna är avsiktligt: innerväggarna
  // har ingen egen yta i modellen (rummen ligger kant i kant), och att krympa med
  // ytterväggen hade gett ett BRA **under** NTA på ett plan med ett enda rum – geometriskt
  // omöjligt, eftersom BRA alltid rymmer nettoarean.
  //
  // Väggtjockleken är densamma som viewern ritar med. Den bor här, i uträkningen, och
  // viewern läser den härifrån: två tal som ska vara samma och ligger på två ställen
  // glider isär, och då stämmer inte modellen med summan planeraren jämför den mot.
  var VAGG_TJ = 0.15;

  // Ett plans omslutande rektangel ur de rum som har en plats – samma rektanglar som
  // modellen ritas ur, så den area som räknas är den planeraren ser. Ett plan som bara är
  // skal har ingen area att räkna: skalet är typens standardstorlek och inte en uppgift
  // om byggnaden, och ett tal ur det hade varit en gissning som ser ut som ett mått.
  function planRam(rum) {
    var ram = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    var n = 0;
    rum.forEach(function (r) {
      if (!r.rect || r.skal || r.iRum) { return; }
      ram.x0 = Math.min(ram.x0, r.rect[0]); ram.z0 = Math.min(ram.z0, r.rect[1]);
      ram.x1 = Math.max(ram.x1, r.rect[2]); ram.z1 = Math.max(ram.z1, r.rect[3]);
      n++;
    });
    return n ? ram : null;
  }

  function rund(v) { return Math.round(v * 10) / 10; }

  // Areorna för en byggnad: en post per plan plus byggnadens summor, med `beraknad` som
  // säger varifrån talet kom.
  //
  // Rummens egna tal väger tyngst: har **alla** rum på ett plan BRA är planets BRA deras
  // summa, och då är talet fastighetssystemets. Saknar ett rum det räknas planet ur
  // modellen i stället – hela planet, inte de rum som råkar ha talet, eftersom en summa av
  // hälften av rummen är mindre än planet och inte en area alls (beslut 79).
  //
  // Byggnadens summa följer samma regel per nivå: har varje rum i byggnaden talet är summan
  // rummens, annars är den summan av planens – och då är den beräknad så fort **något**
  // plan räknades ur modellen. Det är varför märkningen är per plan och inte bara i
  // botten: ett hus där källaren saknar BRA ska visa vilket plan som är systemets tal.
  //
  // Ett **beräknat** tal lämnas däremot när modellen inte bär planets NTA. Korridoren i
  // korridorsregeln fyller remsan mellan rumsraderna och är därför sällan lika stor som sin
  // NTA – är rummen smala blir planets rektangel mindre än rummens summa, och då hade BRA
  // blivit mindre än NTA. Det är geometriskt omöjligt, och ett omöjligt tal är sämre än
  // inget: samma skäl som gör att BRA inte summeras ur hälften av rummen (beslut 79).
  // Strecket pekar då på modellens egen brist och inte på en uppgift som saknas.
  function areor(byggnad) {
    var b = byggnad;
    if (!b) {
      return { plan: [], antal: 0, nta: null, bra: null, bta: null,
        braBeraknad: false, btaBeraknad: false };
    }
    // Formen – inte byggnadsdatan – eftersom rektanglarna kan vara räknade ur regeln
    // (beslut 78) och inte ritade. Det är samma form modellen ritas ur.
    var f = form(b) || { plan: [], rum: [] };
    var plan = (f.plan || []).map(function (p) {
      var pa = (f.rum || []).filter(function (r) { return r.plan === p.id && !r.iRum && !r.skal; });
      var ram = planRam(pa);
      var mattBra = ram ? rund((ram.x1 - ram.x0) * (ram.z1 - ram.z0)) : null;
      var mattBta = ram ? rund((ram.x1 - ram.x0 + VAGG_TJ) * (ram.z1 - ram.z0 + VAGG_TJ)) : null;
      var egenBra = faltsumma(pa, 'bra'), egenBta = faltsumma(pa, 'bta');
      // Täcker modellens rektangel inte rummens NTA duger den inte som BRA – se ovan.
      // BTA faller med den: de två är samma rektangel mätt åt var sitt håll, och ett plan
      // med BTA men utan BRA hade sett ut som en uppgift som saknas och inte som en gräns.
      var pNta = faltsumma(pa, 'nta');
      if (mattBra != null && pNta != null && mattBra < pNta) { mattBra = mattBta = null; }
      return {
        // Ett plan utan rum har NTA noll och inte "saknas": nollan är ett svar, och
        // ett streck hade sagt att uppgiften fattas när det bara är rummen som gör det.
        id: p.id, namn: p.namn, antal: pa.length,
        nta: pa.length ? pNta : 0,
        bra: egenBra == null ? mattBra : egenBra,
        bta: egenBta == null ? mattBta : egenBta,
        braBeraknad: egenBra == null && mattBra != null,
        btaBeraknad: egenBta == null && mattBta != null
      };
    });
    var alla = (f.rum || []).filter(function (r) { return !r.iRum && !r.skal; });
    var hela = {
      plan: plan, antal: alla.length, nta: alla.length ? faltsumma(alla, 'nta') : 0,
      bra: faltsumma(alla, 'bra'), bta: faltsumma(alla, 'bta'),
      braBeraknad: false, btaBeraknad: false
    };
    // Byggnadens summa är planens – och **bara** när varje plan som har rum har ett tal.
    // Ett plan utan tal hade annars dragit ner summan under den verkliga arean, vilket är
    // samma fel som att summera hälften av rummen. Ett plan som bara är skal räknas inte:
    // det har inga rum, och ingen area att sakna.
    var medRum = plan.filter(function (p) { return p.antal > 0; });
    ['bra', 'bta'].forEach(function (falt) {
      if (hela[falt] != null || !medRum.length) { return; }
      var komplett = medRum.every(function (p) { return p[falt] != null; });
      if (!komplett) { return; }
      hela[falt] = rund(medRum.reduce(function (s, p) { return s + p[falt]; }, 0));
      hela[falt + 'Beraknad'] = medRum.some(function (p) { return p[falt + 'Beraknad']; });
    });
    return hela;
  }

  // Summan av ett areafält, eller null när något rum saknar det – samma regel som
  // `planering.js` har för rummens egna tal, och av samma skäl: att skilja "saknas" från
  // "noll" är hela poängen.
  function faltsumma(rum, falt) {
    if (!rum.length) { return null; }
    var s = 0;
    for (var i = 0; i < rum.length; i++) {
      if (rum[i][falt] == null) { return null; }
      s += Number(rum[i][falt]) || 0;
    }
    return rund(s);
  }

  // ------------------------------------------------------------------
  // Installationernas plats i rummet (beslut 78, berättelse 45 och 52)
  // ------------------------------------------------------------------
  // En **inläst** installation bär ingen plats: filen har plan och rumsnummer och ingenting
  // om var i rummet apparaten sitter, av samma skäl som ett rum inte har en rektangel – ingen
  // har en ritning. Platsen räknas därför här, ur rummets rektangel och typens montage.
  //
  // Regeln är enkel med flit: installationerna fördelas **jämnt längs rummets vägg** i den
  // ordning de står, och de golvstående ställs in en bit från väggen. Att placera dem exakt
  // går inte – uppgiften finns inte – och en schematisk plats som är läsbar är vad modellen
  // behöver: planeraren ska kunna se *att* rummet har tre handbrandsläckare och klicka på
  // dem, inte var de hänger.
  //
  // Vilken vägg: den sida av rummet som ligger mot byggnadens mitt, alltså mot korridoren.
  // Det är den vägg man ser när man kommer in, och den en släckare rimligen hänger på.
  // `viewer._byggInstallation` väljer själv närmaste vägg ur x och z, så det som behövs här är
  // en punkt som ligger **på** den väggen.
  var INST_HOJD = { vagg: 1.1, fasad: 1.0, utsida: 0.9, golv: 0, tak: 0 };

  function laggUtInstallationer(rum, installationer, mitt) {
    var perRum = {};
    installationer.forEach(function (i) {
      if (!perRum[i.rum]) { perRum[i.rum] = []; }
      perRum[i.rum].push(i);
    });
    var ut = {};
    Object.keys(perRum).forEach(function (nyckel) {
      var r = rum[nyckel];
      if (!r || !r.rect) { return; }
      var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
      // Väggen mot byggnadens mitt: den sida av rummet som vetter inåt. Ett rum på södra
      // sidan av korridoren har sin dörr i norr, ett på den norra i söder.
      var mz = (z0 + z1) / 2;
      var vaggZ = mz < mitt ? z1 : z0;
      var innerZ = mz < mitt ? z1 - 0.6 : z0 + 0.6;
      var lista = perRum[nyckel];
      lista.forEach(function (i, k) {
        // Jämnt fördelade längs väggen: (k + ½) av n, så att en ensam installation hamnar
        // mitt på väggen och två på en tredjedel var.
        var x = x0 + (x1 - x0) * (k + 0.5) / lista.length;
        var montage = ((DP.installationstyper || {})[i.typ] || {}).montage || 'vagg';
        var golvEllerTak = montage === 'golv' || montage === 'tak';
        ut[i.id] = {
          x: x,
          z: golvEllerTak ? innerZ : vaggZ,
          h: INST_HOJD[montage] == null ? 1.1 : INST_HOJD[montage]
        };
      });
    });
    return ut;
  }

  // Byggnaden med räknad form. Installationer som bär en egen plats – de handritade
  // byggnadernas – lämnas orörda (beslut 101); de inlästa får sin plats räknad ur rummet.
  // Ett skal har inga installationer: dess rum finns inte, och en installation sitter i ett rum.
  function kopia(b, plan, rum) {
    var ut = grundkopia(b);
    ut.plan = plan;
    ut.rum = rum;
    // Rummen som finns i formen, slagna upp på sin nyckel: en installation vars rum inte är
    // ritat (ett plan som bara är skal) har ingen plats att räkna, och tas inte med – viewern
    // hade annars försökt slå upp ett rum som inte finns i sitt index.
    var index = {};
    rum.forEach(function (r) { if (!r.skal) { index[nyckel(r)] = r; } });
    var utan = [], med = [];
    (b.installationer || []).forEach(function (i) {
      if (!index[i.rum]) { return; }
      if (i.x != null && i.z != null) { med.push(i); } else { utan.push(i); }
    });
    // Byggnadens mittlinje i z: den avgör vilken vägg som är den mot korridoren. Den räknas
    // ur rummen och inte ur byggnadstypen, eftersom rummens egna rektanglar bestämmer hur
    // djup byggnaden faktiskt blev.
    var z0 = Infinity, z1 = -Infinity;
    rum.forEach(function (r) {
      if (!r.rect) { return; }
      z0 = Math.min(z0, r.rect[1]); z1 = Math.max(z1, r.rect[3]);
    });
    var mitt = isFinite(z0) ? (z0 + z1) / 2 : 0;
    var platser = laggUtInstallationer(index, utan, mitt);
    ut.installationer = med.concat(utan.map(function (i) {
      var p = platser[i.id];
      if (!p) { return i; }
      var ny = grundkopia(i);
      ny.x = p.x; ny.z = p.z; ny.h = p.h;
      return ny;
    }));
    // De **övriga** installationerna – belysning, brytare, uttag, rökdetektor och sanitet i
    // ett WC – genereras ur rummen (berättelse 57), men bara för en byggnad som är **räknad**:
    // de handritade bär sina egna i `data/` och skulle få dem i dubbel uppsättning
    // (beslut 101). De är ingen individ någon planerar tillsyn för, så de hör till hur
    // byggnaden ritas och inte till vad planeraren bestämt om den – därför räknas de här och
    // ligger aldrig i tillståndet (beslut 71).
    if (!arRitad(b)) {
      var riktiga = rum.filter(function (r) { return !r.skal && r.rect; });
      if (riktiga.length) {
        ut.installationer = ut.installationer.concat(
          DP.genereraOvriga(riktiga, { mittZ: mitt }));
      }
    }
    return ut;
  }

  DP.Planlosning = {
    planTal: planTal, planRang: planRang, foreslagenOrdning: foreslagenOrdning,
    benamningsforslag: benamningsforslag, form: form, SKAL: SKAL,
    laggUtRum: laggUtRum, laggUtInstallationer: laggUtInstallationer,
    regelFor: regelFor, kategoriFor: kategoriFor, arRitad: arRitad,
    areor: areor, VAGG_TJ: VAGG_TJ
  };
})();
