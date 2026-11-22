/*
 * Planeringens logik: tillstånd, frekvenser i veckor, rutintillfällen och historik (ångra/gör om).
 *
 * Tillståndet är rena data och sparas som ögonblicksbilder i en historik. Allt som visas
 * (tidsaxel, telefoner, färger i modellen) räknas fram ur tillståndet. Det gör att ångra och
 * gör om fungerar för allt – både svar på frågor och kopplade åtgärder.
 */
(function () {
  'use strict';

  var DP = window.DP;
  var AR = 2027;

  var FREKVENSER = [
    { id: 'vecka',    namn: 'Varje vecka',      iv: 1,  detalj: 'var vecka · 52 ggr/år' },
    { id: 'manad',    namn: 'Varje månad',      iv: 4,  detalj: 'var 4:e vecka · 13 ggr/år' },
    { id: 'varannan', namn: 'Varannan månad',   iv: 8,  detalj: 'var 8:e vecka · 7 ggr/år' },
    { id: 'kvartal',  namn: 'Varje kvartal',    iv: 13, detalj: 'var 13:e vecka · 4 ggr/år' },
    { id: 'halvar',   namn: 'Varje halvår',     iv: 26, detalj: 'var 26:e vecka · 2 ggr/år', startManad: true },
    { id: 'ar',       namn: 'En gång om året',  iv: 52, detalj: '1 gång/år' }
  ];
  var MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

  var UTFORARE = [
    { id: 'anna',    namn: 'Anna Berg',    farg: '#4f6fd0' },
    { id: 'bertil',  namn: 'Bertil Ek',    farg: '#c8642f' },
    { id: 'cecilia', namn: 'Cecilia Holm', farg: '#2f8f66' },
    { id: 'david',   namn: 'David Lund',   farg: '#8a4fb8' }
  ];

  // ------------------------------------------------------------------
  // Veckor
  // ------------------------------------------------------------------
  function isoVecka(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dag);
    var arStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - arStart) / 86400000 + 1) / 7);
  }
  // Första veckan som börjar i månaden (första måndagen)
  function forstaVeckan(manad) {
    var d = new Date(AR, manad - 1, 1);
    while (d.getDay() !== 1) { d.setDate(d.getDate() + 1); }
    return isoVecka(d);
  }
  // Månad (0–11) som veckans torsdag ligger i
  function manadForVecka(v) {
    var d = new Date(AR, 0, 4); // 4 jan ligger alltid i vecka 1
    while (d.getDay() !== 1) { d.setDate(d.getDate() - 1); }
    d.setDate(d.getDate() + (v - 1) * 7 + 3);
    return d.getMonth();
  }
  var ANTAL_VECKOR = isoVecka(new Date(AR, 11, 28));

  function frekvens(id) { return FREKVENSER.filter(function (f) { return f.id === id; })[0]; }
  function veckorFor(freq) {
    if (!freq || !freq.typ) { return []; }
    var f = frekvens(freq.typ);
    var start = (f.startManad && freq.startManad) ? forstaVeckan(freq.startManad) : 1;
    var ut = [];
    for (var v = start; v <= ANTAL_VECKOR; v += f.iv) { ut.push(v); }
    return ut;
  }
  function freqText(freq, kort) {
    if (!freq || !freq.typ) { return '–'; }
    var f = frekvens(freq.typ);
    var t = f.namn;
    if (f.startManad && freq.startManad) { t += ' (start ' + MANADER[freq.startManad - 1] + ')'; }
    return kort ? t : t + ' – ' + f.detalj;
  }
  function sammaFreq(a, b) {
    if (!a || !b || a.typ !== b.typ) { return false; }
    return !frekvens(a.typ).startManad || a.startManad === b.startManad;
  }
  function freqKomplett(freq) {
    return !!(freq && freq.typ && (!frekvens(freq.typ).startManad || freq.startManad));
  }
  function veckoNamn(v) { return AR + 'v' + (v < 10 ? '0' : '') + v; }

  // ------------------------------------------------------------------
  // Tillstånd och historik
  // ------------------------------------------------------------------
  function tomtTillstand() {
    return {
      bas: null,          // { typ, startManad } – hur ofta byggnaden besöks
      ronder: [],         // { id, freq, foljerBas, besvarad, utforare }
      kopplingar: [],     // { atgard, inst, rond }  (inst = installations-id eller 'BYGGNAD')
      // Åtgärdstexter i tre nivåer. Den mest specifika vinner: rutintillfälle > installation > standard.
      standardTexter: {}, // atgardId -> [kontrollpunkter]   (ändrad standard i bruttolistan, gäller sessionen)
      instTexter: {},     // 'atgard|inst' -> [kontrollpunkter]
      tillfalleTexter: {}, // 'atgard|inst|rond|vecka' -> [kontrollpunkter]
      // Planerad tid per rond (steg 6):
      //   rondId -> { dagsdel, godkand, forslagVidGodkandet, minuterVidGodkandet, arvd }
      // forslagVidGodkandet och minuterVidGodkandet är förslaget som gällde när planeraren tog
      // ställning, i dagsdel och i minuter. Avviker det aktuella förslaget från dem har
      // förutsättningarna ändrats, och det visas – men den godkända tiden ändras aldrig av sig
      // själv (beslut 27). `arvd` sätts av kopiering: ställningstagandet gällde en annan byggnad,
      // så varje avvikelse märks (beslut 51).
      tider: {}
    };
  }
  // Gemensamt tillstånd: det som inte hör till någon enskild byggnad. Här ska Balanseringens svar
  // ligga (områden man åker till, kapacitet per utförare, veckor utan tillsyn och skötsel). Tomt så länge.
  function tomtGemensamt() {
    return {};
  }
  function klona(s) { return JSON.parse(JSON.stringify(s)); }

  // Varje byggnad har sin egen planering. Historiken är gemensam: varje steg sparar alla byggnaders
  // planering och vilken byggnad steget gällde. Ångra växlar till den byggnaden.
  var BYGGNADSORDNING = ['garage', 'kasern1', 'kasern2', 'hangar'].filter(function (id) { return DP.byggnader[id]; });
  var aktiv = BYGGNADSORDNING[0];
  function allaTomma() {
    var a = {};
    BYGGNADSORDNING.forEach(function (id) { a[id] = tomtTillstand(); });
    return a;
  }
  var historik = [{ alla: allaTomma(), gemensamt: tomtGemensamt(), text: 'Start', byggnad: null }];
  var pos = 0;
  var lyssnare = [], byteLyssnare = [];

  function state() { return historik[pos].alla[aktiv]; }
  function stateFor(id) { return historik[pos].alla[id || aktiv]; }
  function gemensamt() { return historik[pos].gemensamt; }
  function B() { return DP.byggnader[aktiv]; }
  function meddela(fore, efter, info) {
    lyssnare.forEach(function (fn) { fn(fore, efter, info || {}); });
  }
  // Gör en ändring i den aktiva byggnaden som ett steg i historiken
  function andra(text, fn, info) {
    var fore = state();
    var alla = klona(historik[pos].alla);
    var ny = alla[aktiv];
    if (fn(ny) === false) { return; }
    stada(ny);
    historik = historik.slice(0, pos + 1);
    historik.push({ alla: alla, gemensamt: klona(historik[pos].gemensamt), text: B().namn + ': ' + text, byggnad: aktiv, rorda: [aktiv] });
    pos = historik.length - 1;
    meddela(fore, ny, utokaInfo(info, [aktiv]));
  }

  // Ändring som rör flera byggnader och/eller det gemensamma tillståndet, som ett enda steg i
  // historiken. fn får ({ tillstand: fn(id), gemensamt: objekt }) och muterar kopior fritt.
  // Steget hör inte till någon byggnad, så att ångra och gör om inte byter aktiv byggnad.
  function andraFlera(text, fn, info) {
    var fore = state();
    var alla = klona(historik[pos].alla);
    var gem = klona(historik[pos].gemensamt);
    var rorda = {};
    var andring = {
      // Byggnadens planering, att mutera. Markerar samtidigt byggnaden som rörd av steget.
      tillstand: function (id) {
        if (!alla[id]) { return null; }
        rorda[id] = true;
        return alla[id];
      },
      gemensamt: gem
    };
    if (fn(andring) === false) { return; }
    var rordaIds = Object.keys(rorda);
    rordaIds.forEach(function (id) { stada(alla[id]); });
    historik = historik.slice(0, pos + 1);
    historik.push({ alla: alla, gemensamt: gem, text: text, byggnad: null, rorda: rordaIds });
    pos = historik.length - 1;
    meddela(fore, state(), utokaInfo(info, rordaIds));
  }

  // Lyssnarna får veta vilka byggnader steget ändrade, så att vyerna kan rita om rätt saker.
  function utokaInfo(info, byggnader) {
    var ut = info ? klonaInfo(info) : {};
    ut.byggnader = byggnader;
    return ut;
  }
  // Info kan innehålla DOM-noder och funktioner, så den kopieras ytligt
  function klonaInfo(info) {
    var ut = {};
    Object.keys(info).forEach(function (n) { ut[n] = info[n]; });
    return ut;
  }
  function ga(till, info) {
    if (till < 0 || till >= historik.length || till === pos) { return; }
    // Vilken byggnad gäller steget? Byt dit först så att man ser vad som ändras.
    var bid = till < pos ? historik[pos].byggnad : historik[till].byggnad;
    if (bid && bid !== aktiv) { vaxlaByggnad(bid); }
    var fore = state();
    var steget = till < pos ? historik[pos] : historik[till];
    pos = till;
    meddela(fore, state(), utokaInfo(info || { historik: true }, (steget.rorda || BYGGNADSORDNING).slice()));
  }
  function vaxlaByggnad(id) {
    if (!DP.byggnader[id] || id === aktiv) { return; }
    aktiv = id;
    byteLyssnare.forEach(function (fn) { fn(id); });
  }

  // ------------------------------------------------------------------
  // Härledda uppgifter
  // ------------------------------------------------------------------
  var instIndex = {}; // alla byggnaders signifikanta installationer (id är unika)
  BYGGNADSORDNING.forEach(function (id) {
    DP.byggnader[id].installationer.forEach(function (i) { if (i.signifikant) { instIndex[i.id] = i; } });
  });

  function rondNamn(id) { return (DP.ronder.filter(function (r) { return r.id === id; })[0] || {}).namn || id; }
  function utforare(id) { return UTFORARE.filter(function (u) { return u.id === id; })[0] || UTFORARE[0]; }
  function atgard(id) { return DP.atgarder.filter(function (a) { return a.id === id; })[0]; }

  // De härledda uppgifterna nedan gäller den aktiva byggnaden om inget byggnads-id anges.
  // Balanseringen räknar på alla byggnader samtidigt och skickar därför alltid med id:t.
  function rutintillfalleNamn(rondId, v, bid) {
    return DP.byggnader[bid || aktiv].namn.replace(/\s+/g, '') + '-' + rondNamn(rondId) + '-' + veckoNamn(v);
  }

  // Alla rutintillfällen som planeringen genererar
  function rutintillfallen(s, bid) {
    s = s || stateFor(bid);
    var ut = [];
    s.ronder.forEach(function (r) {
      if (!freqKomplett(r.freq)) { return; }
      var atg = s.kopplingar.filter(function (k) { return k.rond === r.id; });
      veckorFor(r.freq).forEach(function (v) {
        ut.push({ nyckel: r.id + ':' + v, rond: r.id, vecka: v, namn: rutintillfalleNamn(r.id, v, bid), utforare: r.utforare, atgarder: atg });
      });
    });
    return ut;
  }

  // Åtgärder i ett rutintillfälle, sorterade för telefonen
  function sorteradeAtgarder(lista) {
    return lista.slice().sort(function (x, y) {
      if (x.atgard !== y.atgard) { return x.atgard < y.atgard ? -1 : 1; }
      var ix = instIndex[x.inst], iy = instIndex[y.inst];
      return (ix ? ix.nr : 0) - (iy ? iy.nr : 0);
    });
  }

  function kopplingarForInst(instId, s) {
    return (s || state()).kopplingar.filter(function (k) { return k.inst === instId; });
  }

  function signifikanta(bid) {
    return DP.byggnader[bid || aktiv].installationer.filter(function (i) { return i.signifikant; });
  }

  // De generella åtgärderna gäller byggnaden som helhet och kopplas till 'BYGGNAD'
  function generellaAtgarder() {
    return DP.atgarder.filter(function (a) { return a.generell; });
  }

  // Luckorna i steg 5: signifikanta installationer utan kopplad åtgärd och generella
  // åtgärder som inte är kopplade. Byggnaden är klar när ingen av listorna har något i sig
  // (beslut 23). Texten räknar upp vad som fattas i klartext, så att planeraren ser varför
  // bocken inte kommer.
  function kopplingsStatus(s, bid) {
    s = s || stateFor(bid);
    var kopplade = {}, koppladeGenerella = {};
    s.kopplingar.forEach(function (x) {
      kopplade[x.inst] = true;
      // En generell åtgärd är kopplad till byggnaden som helhet, aldrig till en installation
      if (x.inst === 'BYGGNAD') { koppladeGenerella[x.atgard] = true; }
    });
    var sig = signifikanta(bid);
    var saknas = sig.filter(function (i) { return !kopplade[i.id]; });
    var saknarGenerella = generellaAtgarder().filter(function (a) { return !koppladeGenerella[a.id]; });
    var delar = [];
    if (saknas.length) {
      delar.push(saknas.length + (saknas.length === 1 ? ' installation' : ' installationer'));
    }
    saknarGenerella.forEach(function (a) { delar.push(a.namn); });
    var saknasText = delar.length ? raknaUpp(delar) + ' saknas' : '';
    return { n: sig.length - saknas.length, tot: sig.length, saknas: saknas,
      saknarGenerella: saknarGenerella, klar: !saknas.length && !saknarGenerella.length,
      saknasText: saknasText,
      text: (sig.length - saknas.length) + ' av ' + sig.length + ' signifikanta installationer har kopplad åtgärd' +
        (saknasText ? ' · ' + saknasText : '') };
  }

  // "a", "a och b", "a, b och c"
  function raknaUpp(delar) {
    if (delar.length < 2) { return delar.join(''); }
    return delar.slice(0, -1).join(', ') + ' och ' + delar[delar.length - 1];
  }

  // ------------------------------------------------------------------
  // Planerad tid (steg 6)
  // ------------------------------------------------------------------
  // Förslaget på planerad tid för en rond: tidsschablonen tillämpad på rondens kopplingar
  // (beslut 27 och 43). Det ger dagsdelen, minuterna bakom den, en förklaring i klartext och
  // flaggan för delning. Uträkningen visas alltid, så att planeraren kan bedöma om den är
  // rimlig i stället för att godkänna blint.
  function tidForslag(rondId, s, bid) {
    s = s || stateFor(bid);
    var schablon = DP.tidsschablon;
    var kopp = s.kopplingar.filter(function (k) { return k.rond === rondId; });
    var nRum = DP.byggnader[bid || aktiv].rum.length;
    var minuter = 0;
    var perTyngd = { latt: 0, normal: 0, tung: 0 };
    var nInst = 0;
    var generella = [];

    kopp.forEach(function (k) {
      var a = atgard(k.atgard);
      if (!a) { return; }
      if (a.generell) {
        var g = schablon.generella[a.id];
        if (!g) { return; }
        var m = g.perRum ? g.perRum * nRum : g.fast;
        minuter += m;
        generella.push({ namn: a.namn, minuter: m, perRum: !!g.perRum, rum: nRum });
        return;
      }
      minuter += schablon.minuterPerInstallation(a);
      nInst++;
      perTyngd[schablon.tyngd(a)]++;
    });

    var dagsdel = schablon.dagsdelFor(minuter);
    var over = !dagsdel;
    // Ryms ronden inte på en dag föreslås en delning. Dagsdelen stannar då på heldag, så att
    // en tid alltid går att godkänna medan planeraren bestämmer sig för att dela eller inte.
    if (over) { dagsdel = schablon.DAGSDELAR[schablon.DAGSDELAR.length - 1]; }

    return {
      rond: rondId,
      dagsdel: dagsdel.id,
      minuter: minuter,
      timmar: minuter / 60,
      installationer: nInst,
      perTyngd: perTyngd,
      generella: generella,
      foreslaDelning: over,
      text: tidText(nInst, perTyngd, generella, minuter, dagsdel, over)
    };
  }

  // Uträkningen i klartext: "41 installationer, varav 6 tunga, 65 rum → heldag"
  function tidText(nInst, perTyngd, generella, minuter, dagsdel, over) {
    var delar = [];
    if (nInst) {
      var d = nInst + (nInst === 1 ? ' installation' : ' installationer');
      var varav = [];
      if (perTyngd.tung) { varav.push(perTyngd.tung + ' tunga'); }
      if (perTyngd.latt) { varav.push(perTyngd.latt + ' lätta'); }
      if (varav.length) { d += ', varav ' + raknaUpp(varav); }
      delar.push(d);
    }
    generella.forEach(function (g) {
      delar.push(g.perRum ? g.rum + ' rum att gå igenom' : 'ett varv runt huset');
    });
    if (!delar.length) { delar.push('inga kopplade åtgärder'); }
    return raknaUpp(delar) + ' → ' + timText(minuter) + ' → ' +
      (over ? 'mer än en heldag' : dagsdel.namn);
  }

  // Minuter som timmar med en decimal, och rena minuter under timmen
  function timText(minuter) {
    if (minuter < 60) { return minuter + ' min'; }
    var t = minuter / 60;
    return (Math.round(t * 10) / 10).toString().replace('.', ',') + ' h';
  }

  // Luckorna i steg 6: ronder utan godkänd tid, och ronder där förutsättningarna ändrats
  // sedan tiden godkändes. Steget är klart när varje rond har en godkänd eller ändrad tid
  // (berättelse 18). En ändrad förutsättning gör inte steget ogrönt – den godkända tiden
  // gäller tills planeraren tar ställning.
  function tidStatus(s, bid) {
    s = s || stateFor(bid);
    var rader = s.ronder.map(function (r) {
      var forslag = tidForslag(r.id, s, bid);
      var sparad = s.tider[r.id];
      var godkand = !!(sparad && sparad.godkand);
      return {
        rond: r.id,
        forslag: forslag,
        dagsdel: godkand ? sparad.dagsdel : forslag.dagsdel,
        godkand: godkand,
        forslagVidGodkandet: sparad ? sparad.forslagVidGodkandet : null,
        minuterVidGodkandet: sparad ? sparad.minuterVidGodkandet : null,
        arvd: !!(sparad && sparad.arvd),
        // Förslaget har ändrats sedan tiden godkändes (dagsdel eller minuter över tröskeln)
        andrad: tidAndrad(sparad, forslag)
      };
    });
    var utan = rader.filter(function (x) { return !x.godkand; });
    var andrade = rader.filter(function (x) { return x.andrad; });
    return { rader: rader, utan: utan, andrade: andrade, klar: s.ronder.length > 0 && utan.length === 0,
      n: rader.length - utan.length, tot: rader.length,
      text: rader.length
        ? (rader.length - utan.length) + ' av ' + rader.length + ' ronder har en godkänd tid' +
          (andrade.length ? ' · ' + andrade.length + ' med ändrade förutsättningar' : '')
        : '' };
  }

  // Timmar för en rond, för Balanseringens belastningsräkning: den godkända tiden om den finns,
  // annars förslagets. Balansering tar bara med byggnader där steg 6 är klart, så i praktiken
  // är det den godkända.
  function tidTimmar(rondId, s, bid) {
    s = s || stateFor(bid);
    var sparad = s.tider[rondId];
    var id = (sparad && sparad.godkand) ? sparad.dagsdel : tidForslag(rondId, s, bid).dagsdel;
    var d = DP.tidsschablon.dagsdel(id);
    return d ? d.timmar : 0;
  }

  // Används inuti andra(): godkänn eller ändra den planerade tiden för en rond. Förslaget som
  // gällde vid godkännandet sparas i både dagsdel och minuter, så att en senare ändring av
  // kopplingarna kan upptäckas. `forslaget` är hela förslaget från tidForslag().
  function sattTid(st, rondId, dagsdel, forslaget) {
    st.tider[rondId] = {
      dagsdel: dagsdel,
      godkand: true,
      forslagVidGodkandet: forslaget.dagsdel,
      minuterVidGodkandet: forslaget.minuter
    };
  }

  // Används inuti andra(): tiden kommer från en annan byggnad (kopiering). Den är godkänd, så
  // steg 6 har inga luckor, men ställningstagandet gällde källan och inte den här byggnaden.
  // `arvd` gör att varje avvikelse märks, hur liten den än är – se tidAndrad.
  function arvTid(st, rondId, sparad) {
    st.tider[rondId] = {
      dagsdel: sparad.dagsdel,
      godkand: true,
      forslagVidGodkandet: sparad.forslagVidGodkandet,
      minuterVidGodkandet: sparad.minuterVidGodkandet,
      arvd: true
    };
  }

  // Har förutsättningarna ändrats sedan tiden godkändes? Dagsdelen är det planeraren faktiskt
  // beslutat, men den är grov: Kasern 1 och 2 har båda heldag för Byggnad invändigt trots en halv
  // timmes skillnad (310 mot 340 min). Gick jämförelsen bara på dagsdelen skulle en kopiering
  // mellan kasernerna aldrig märkas, och Kasern 2 ärva en tid som inte stämmer.
  //
  // Därför vägs minuterna in. Hur stor en avvikelse måste vara beror på var tiden kommer ifrån:
  //
  //  - Planeraren har själv tagit ställning till *den här* byggnaden. Då ska en liten justering
  //    inte störa: en enstaka lätt installation (3 min) i en heldagsrond är ingen ändrad
  //    förutsättning, och en markering som kommer för ofta lär planeraren att strunta i den.
  //    Tröskeln är en halvtimme, absolut och lika för alla ronder, eftersom det är den tid
  //    planeraren känner igen – en halvtimme är en halvtimme oavsett om ronden är kort eller lång.
  //  - Tiden är ärvd från en annan byggnad. Då har ingen räknat på den här byggnaden, så varje
  //    avvikelse är osedd och ska synas. Kasern 2 ska inte tyst ärva Kasern 1:s tid.
  var TID_TROSKEL_MIN = 30;
  function tidAndrad(sparad, forslag) {
    if (!sparad || !sparad.godkand) { return false; }
    if (sparad.forslagVidGodkandet !== forslag.dagsdel) { return true; }
    var skillnad = Math.abs(forslag.minuter - sparad.minuterVidGodkandet);
    return skillnad >= (sparad.arvd ? 1 : TID_TROSKEL_MIN);
  }

  // Används inuti andra(): behåll den godkända tiden men ta ställning till det nya förslaget, så
  // att markeringen om ändrade förutsättningar försvinner. Dagsdelen rörs inte – det är skillnaden
  // mot att godkänna förslaget, och den väg planeraren behöver när den egna bedömningen står sig.
  // sattTid skriver över posten utan `arvd`: en ärvd tid som planeraren tagit ställning till är
  // hens egen, och mäts därefter med den vanliga tröskeln.
  function behallTid(st, rondId, forslaget) {
    var sparad = st.tider[rondId];
    if (!sparad || !sparad.godkand) { return; }
    sattTid(st, rondId, sparad.dagsdel, forslaget);
  }

  // Tider för ronder som inte längre finns hänger inte kvar
  function rensaTider(st) {
    var finns = {};
    st.ronder.forEach(function (r) { finns[r.id] = true; });
    Object.keys(st.tider).forEach(function (id) { if (!finns[id]) { delete st.tider[id]; } });
  }

  // Status per steg i Planering, för en valfri byggnad. Samma regler som frågeflödet visar:
  // steg 4 är klart när steg 3 är klart (utföraren har alltid ett förval), steg 5 när
  // byggnaden inte har några luckor kvar i kopplingarna (beslut 23) och steg 6 när varje
  // rond har en godkänd planerad tid (beslut 35).
  function stegStatus(s, bid) {
    s = s || stateFor(bid);
    var k1 = freqKomplett(s.bas);
    var k2 = k1 && s.ronder.length > 0;
    var k3 = k2 && s.ronder.every(function (r) { return r.besvarad && freqKomplett(r.freq); });
    var k5 = k3 && kopplingsStatus(s, bid).klar;
    var k6 = k5 && tidStatus(s, bid).klar;
    return { 1: k1, 2: k2, 3: k3, 4: k3, 5: k5, 6: k6 };
  }

  // Besök i byggnaden = alla veckor där minst ett rutintillfälle infaller
  function besoksveckor(s, bid) {
    s = s || stateFor(bid);
    var set = {};
    rutintillfallen(s, bid).forEach(function (r) { set[r.vecka] = true; });
    return Object.keys(set).map(Number).sort(function (a, c) { return a - c; });
  }

  // ------------------------------------------------------------------
  // Åtgärdstexter
  // ------------------------------------------------------------------
  function lika(a, c) { return JSON.stringify(a) === JSON.stringify(c); }
  function instNyckel(a, i) { return a + '|' + i; }
  function tillfNyckel(a, i, r, v) { return a + '|' + i + '|' + r + '|' + v; }

  function standardText(atgId, s) {
    s = s || state();
    return (s.standardTexter && s.standardTexter[atgId]) || atgard(atgId).kontrollpunkter;
  }
  function instText(atgId, instId, s) {
    s = s || state();
    return s.instTexter[instNyckel(atgId, instId)] || standardText(atgId, s);
  }
  // Gällande text för en koppling, i ett visst rutintillfälle (vecka) eller generellt (vecka = null)
  function textFor(k, vecka, s) {
    s = s || state();
    if (vecka !== null && vecka !== undefined) {
      var t = s.tillfalleTexter[tillfNyckel(k.atgard, k.inst, k.rond, vecka)];
      if (t) { return { punkter: t, niva: 'tillfalle' }; }
    }
    var it = s.instTexter[instNyckel(k.atgard, k.inst)];
    if (it) { return { punkter: it, niva: 'installation' }; }
    return { punkter: standardText(k.atgard, s), niva: 'standard' };
  }
  function rondVeckor(rondId, s) {
    var r = s.ronder.filter(function (x) { return x.id === rondId; })[0];
    return r && freqKomplett(r.freq) ? veckorFor(r.freq) : [];
  }
  // Rutintillfällen där en koppling har en egen text
  function tillfalleAvvikelser(k, s) {
    s = s || state();
    return rondVeckor(k.rond, s).filter(function (v) { return !!s.tillfalleTexter[tillfNyckel(k.atgard, k.inst, k.rond, v)]; })
      .map(function (v) { return { vecka: v, namn: rutintillfalleNamn(k.rond, v), punkter: s.tillfalleTexter[tillfNyckel(k.atgard, k.inst, k.rond, v)] }; });
  }
  function kopplingAvviker(k, s) {
    s = s || state();
    return !!s.instTexter[instNyckel(k.atgard, k.inst)] || tillfalleAvvikelser(k, s).length > 0;
  }
  function rutintillfalleAvviker(t, s) {
    return t.atgarder.some(function (k) { return textFor(k, t.vecka, s).niva !== 'standard'; });
  }
  function avvikandeInst(s) {
    s = s || state();
    var set = {};
    s.kopplingar.forEach(function (k) { if (kopplingAvviker(k, s)) { set[k.inst] = true; } });
    return set;
  }

  // Används inuti andra(): sparar bara texter som faktiskt avviker från nivån ovanför
  function sattStandard(st, atgId, punkter) {
    if (lika(punkter, atgard(atgId).kontrollpunkter)) { delete st.standardTexter[atgId]; } else { st.standardTexter[atgId] = punkter; }
  }
  function sattInst(st, atgId, instId, punkter) {
    var n = instNyckel(atgId, instId);
    if (lika(punkter, standardText(atgId, st))) { delete st.instTexter[n]; } else { st.instTexter[n] = punkter; }
  }
  function sattTillfalle(st, k, vecka, punkter) {
    var n = tillfNyckel(k.atgard, k.inst, k.rond, vecka);
    if (lika(punkter, instText(k.atgard, k.inst, st))) { delete st.tillfalleTexter[n]; } else { st.tillfalleTexter[n] = punkter; }
  }
  function rensaTillfallen(st, atgId, instId) {
    Object.keys(st.tillfalleTexter).forEach(function (n) {
      var d = n.split('|');
      if (d[0] === atgId && (instId === undefined || d[1] === instId)) { delete st.tillfalleTexter[n]; }
    });
  }
  function rensaInst(st, atgId) {
    Object.keys(st.instTexter).forEach(function (n) { if (n.split('|')[0] === atgId) { delete st.instTexter[n]; } });
  }
  // Avvikelser försvinner när kopplingen tas bort (annars dyker de upp igen vid ny koppling)
  function rensaTexter(st) {
    var finns = {}, finnsRond = {};
    st.kopplingar.forEach(function (k) { finns[instNyckel(k.atgard, k.inst)] = true; finnsRond[k.atgard + '|' + k.inst + '|' + k.rond] = true; });
    Object.keys(st.instTexter).forEach(function (n) { if (!finns[n]) { delete st.instTexter[n]; } });
    Object.keys(st.tillfalleTexter).forEach(function (n) {
      var d = n.split('|');
      if (!finnsRond[d[0] + '|' + d[1] + '|' + d[2]] || rondVeckor(d[2], st).indexOf(Number(d[3])) < 0) { delete st.tillfalleTexter[n]; }
    });
  }

  // Städning efter varje ändring av en byggnads planering: avvikande texter och planerade tider
  // som inte längre har något att höra till tas bort. Allt som ändrar ett tillstånd går genom
  // andra() eller andraFlera(), så det räcker att städa där.
  function stada(st) {
    rensaTexter(st);
    rensaTider(st);
  }

  // Vilka rutintillfällen och installationer fick ändrad gällande text mellan två tillstånd
  function textSkillnad(fore, efter) {
    var nycklar = {}, inst = {};
    var foreK = {};
    fore.kopplingar.forEach(function (k) { foreK[k.atgard + '|' + k.inst + '|' + k.rond] = true; });
    efter.kopplingar.forEach(function (k) {
      if (!foreK[k.atgard + '|' + k.inst + '|' + k.rond]) { return; }
      rondVeckor(k.rond, efter).forEach(function (v) {
        if (rondVeckor(k.rond, fore).indexOf(v) < 0) { return; }
        if (!lika(textFor(k, v, fore).punkter, textFor(k, v, efter).punkter)) {
          nycklar[k.rond + ':' + v] = true;
          inst[k.inst] = true;
        }
      });
    });
    return { nycklar: Object.keys(nycklar), inst: Object.keys(inst) };
  }

  window.DP.Plan = {
    standardText: standardText, instText: instText, textFor: textFor, tillfalleAvvikelser: tillfalleAvvikelser,
    kopplingAvviker: kopplingAvviker, rutintillfalleAvviker: rutintillfalleAvviker, avvikandeInst: avvikandeInst,
    sattStandard: sattStandard, sattInst: sattInst, sattTillfalle: sattTillfalle, rensaTillfallen: rensaTillfallen, rensaInst: rensaInst,
    textSkillnad: textSkillnad, lika: lika,
    AR: AR, ANTAL_VECKOR: ANTAL_VECKOR, FREKVENSER: FREKVENSER, MANADER: MANADER, UTFORARE: UTFORARE,
    frekvens: frekvens, veckorFor: veckorFor, freqText: freqText, sammaFreq: sammaFreq, freqKomplett: freqKomplett,
    manadForVecka: manadForVecka, veckoNamn: veckoNamn, forstaVeckan: forstaVeckan,
    state: state, stateFor: stateFor, andra: andra, klona: klona,
    byggnad: B, aktivId: function () { return aktiv; }, byggnadsordning: BYGGNADSORDNING,
    vaxlaByggnad: vaxlaByggnad, prenumereraByte: function (fn) { byteLyssnare.push(fn); },
    angra: function (info) { ga(pos - 1, info); },
    gorOm: function (info) { ga(pos + 1, info); },
    gaTill: ga,
    historik: function () { return { lista: historik.map(function (h) { return h.text; }), pos: pos }; },
    prenumerera: function (fn) { lyssnare.push(fn); },
    instIndex: instIndex, rondNamn: rondNamn, utforare: utforare, atgard: atgard,
    rutintillfallen: rutintillfallen, rutintillfalleNamn: rutintillfalleNamn, sorteradeAtgarder: sorteradeAtgarder,
    kopplingarForInst: kopplingarForInst, besoksveckor: besoksveckor,
    signifikanta: signifikanta, kopplingsStatus: kopplingsStatus, stegStatus: stegStatus,
    gemensamt: gemensamt, andraFlera: andraFlera,
    tidForslag: tidForslag, tidStatus: tidStatus, tidTimmar: tidTimmar, sattTid: sattTid,
    behallTid: behallTid, arvTid: arvTid, timText: timText
  };
})();
