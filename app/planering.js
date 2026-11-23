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

  // Veckorna för en frekvens, förskjutna ett antal veckor.
  //
  // Förskjutningen flyttar *när i året* rytmen ligger, aldrig hur ofta (beslut 26). Därför
  // räknas den modulo intervallet: en månadsrond förskjuten 5 veckor ligger likadant som
  // förskjuten 1 vecka. Mellanrummet mellan tillfällena är alltid intervallet, så frekvensen
  // står still – det är hela poängen med att balanseringen bara får förskjuta.
  //
  // Rytmen rullar löpande över årsskiftet (förslag A), och året visar de tillfällen som faller
  // inom det. För intervall som delar året jämnt (vecka, månad, kvartal, år) är antalet
  // tillfällen därför detsamma vid varje förskjutning. Varannan månad (var 8:e vecka) delar
  // inte 52 jämnt och ger 6 eller 7 tillfällen beroende på fas – det är vad frekvensen
  // själv säger ("6–7 ggr/år"), inte en ändrad frekvens.
  //
  // Halvårsronder med vald startmånad får bara flyttas inom månaden (beslut 41). Varje
  // tillfälle klampas då i *sin egen* månad: en halvårsrond som börjar i april har tillfällen
  // i april och oktober, och oktobertillfället hör hemma i oktober.
  function veckorFor(freq, forskjutning) {
    if (!freq || !freq.typ) { return []; }
    var f = frekvens(freq.typ);
    var fsk = normaliseraForskjutning(forskjutning, f.iv);
    var ut = [];
    // Startmånad: rytmen utgår från månadens första vecka, och varje tillfälle flyttas inom sin månad
    if (f.startManad && freq.startManad) {
      for (var m = forstaVeckan(freq.startManad); m <= ANTAL_VECKOR; m += f.iv) { ut.push(inomSinManad(m, fsk)); }
      return ut;
    }
    // Annars är startveckan själv förskjuten, och rytmen rullar vidare därifrån
    for (var v = fsk + 1; v <= ANTAL_VECKOR; v += f.iv) { ut.push(v); }
    return ut;
  }
  // Förskjutningen är en rytm, inte ett tillägg: den räknas modulo intervallet och är aldrig negativ
  function normaliseraForskjutning(forskjutning, iv) {
    var n = Math.round(Number(forskjutning) || 0);
    if (iv <= 1) { return 0; }
    return ((n % iv) + iv) % iv;
  }
  // Veckan förskjuten, men hållen kvar i den månad den låg i: hamnar den utanför månaden
  // stannar den på månadens sista vecka (beslut 41 – den får flyttas inom månaden, inte ut ur den).
  function inomSinManad(v, fsk) {
    var m = manadForVecka(v);
    var ut = v;
    for (var i = 0; i < fsk; i++) {
      if (ut + 1 > ANTAL_VECKOR || manadForVecka(ut + 1) !== m) { break; }
      ut++;
    }
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
      // Förskjutning av byggnadens besöksrytm i veckor (nivå 1, beslut 26). Alla ronder följer
      // med, så byggnaden fortsätter att besökas samlat. Frekvensen rörs inte.
      forskjutning: 0,
      ronder: [],         // { id, freq, foljerBas, besvarad, utforare, forskjutning }
                          // forskjutning = rondseriens egen förskjutning (nivå 2), ovanpå byggnadens
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
      tider: {},
      // Nivå 3 i beslut 26: enskilda rutintillfällen som flyttats provisoriskt eller strukits.
      // Båda är nycklade på **ordinarie vecka** ('rondId:vecka'), alltså den vecka planeringens
      // rytm ger tillfället. Den veckan står still när tillfället flyttas, så nyckeln pekar på
      // samma tillfälle hela tiden; hade nyckeln följt den faktiska veckan hade en andra flytt
      // inte kunnat hitta tillbaka till vad tillfället egentligen hette (beslut 32).
      flyttade: {},       // 'rond:ordinarieVecka' -> faktisk vecka
      // 'struken' = planeraren har strukit tillfället, 'foreslagen' = balanseringen föreslår det
      // (beslut 45). Förslaget är inte en strykning: tillfället ligger kvar och räknas med tills
      // planeraren säger ja.
      strukna: {}
    };
  }
  // Gemensamt tillstånd: det som inte hör till någon enskild byggnad. Här ligger Balanseringens
  // svar – områden man åker till (`akerTill`), kapacitet per utförare i dagar (`kapacitet`) och
  // veckor utan tillsyn och skötsel (`veckorUtan`). Tomt betyder "inte besvarad", och
  // balanseringsUnderlag() använder då förvalen. Frågorna som sätter svaren byggs i en
  // senare biljett; belastningsräkningen läser dem redan nu.
  function tomtGemensamt() {
    return {};
  }
  // Svaren i det gemensamma tillståndet, med förvalen när frågan inte är besvarad. Förvalet
  // är ett *svar* som gäller, inte ett tomrum: belastningen räknas på det från första stunden,
  // och frågan kan klickas igenom med ett klick när förvalet stämmer (beslut 37).
  function akerTillForval() {
    return DP.omraden.filter(function (o) { return o.akerTill; }).map(function (o) { return o.id; });
  }
  function svarAkerTill(gem) {
    gem = gem || gemensamt();
    return (gem.akerTill || akerTillForval()).slice();
  }
  function svarKapacitet(gem) {
    gem = gem || gemensamt();
    var ut = {};
    UTFORARE.forEach(function (u) {
      var svar = gem.kapacitet && gem.kapacitet[u.id];
      ut[u.id] = svar === undefined ? DP.Balansering.KAPACITET_FORVAL : svar;
    });
    return ut;
  }
  // Veckor utan tillsyn och skötsel: semesterveckorna och veckan mellan jul och nyår är förvalda
  // (beslut 32 och 37). Listan är ett svar med förval som de andra två frågorna, men till skillnad
  // från dem kan det riktiga svaret vara **tomt** – en planerare som gör tillsyn hela året har inga
  // utkorsade veckor. Därför går förvalet inte att läsa av listan: `veckorUtanBesvarad` säger om
  // planeraren tagit ställning, och en tom besvarad lista betyder noll veckor, inte "obesvarad".
  var VECKOR_UTAN_FORVAL = [28, 29, 30, 31, 52];
  function veckorUtanForval() { return VECKOR_UTAN_FORVAL.slice(); }
  function svarVeckorUtan(gem) {
    gem = gem || gemensamt();
    return (gem.veckorUtanBesvarad ? (gem.veckorUtan || []) : veckorUtanForval()).slice()
      .sort(function (a, b) { return a - b; });
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
    var allaFore = historik[pos].alla;
    var alla = klona(historik[pos].alla);
    var ny = alla[aktiv];
    if (fn(ny) === false) { return; }
    stada(ny);
    historik = historik.slice(0, pos + 1);
    historik.push({ alla: alla, gemensamt: klona(historik[pos].gemensamt), text: B().namn + ': ' + text, byggnad: aktiv, rorda: [aktiv] });
    pos = historik.length - 1;
    meddela(fore, ny, utokaInfo(info, [aktiv], allaFore));
  }

  // Ändring som rör flera byggnader och/eller det gemensamma tillståndet, som ett enda steg i
  // historiken. fn får ({ tillstand: fn(id), gemensamt: objekt }) och muterar kopior fritt.
  // Steget hör inte till någon byggnad, så att ångra och gör om inte byter aktiv byggnad.
  function andraFlera(text, fn, info) {
    var fore = state();
    var allaFore = historik[pos].alla;
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
    meddela(fore, state(), utokaInfo(info, rordaIds, allaFore));
  }

  // Lyssnarna får veta vilka byggnader steget ändrade, så att vyerna kan rita om rätt saker,
  // och vilka rutintillfällen som bytte vecka i **varje** rörd byggnad (`flyttade`).
  //
  // Skillnaden räknas här och inte hos den som gör ändringen, eftersom lyssnaren bara får den
  // aktiva byggnadens tillstånd före och efter – Balanseringens tidsaxel visar alla byggnader
  // på en gång. Och eftersom ga() går samma väg gäller det även ångra och gör om: flytten
  // animeras tillbaka av sig själv (beslut 36).
  function utokaInfo(info, byggnader, alltFore) {
    var ut = info ? klonaInfo(info) : {};
    ut.byggnader = byggnader;
    if (alltFore) {
      var flyttade = {};
      byggnader.forEach(function (bid) {
        var f = alltFore[bid], e = historik[pos].alla[bid];
        if (!f || !e) { return; }
        var vs = veckoSkillnad(f, e);
        if (vs.length) { flyttade[bid] = vs; }
      });
      ut.flyttade = flyttade;
    }
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
    var allaFore = historik[pos].alla;
    var steget = till < pos ? historik[pos] : historik[till];
    pos = till;
    meddela(fore, state(), utokaInfo(info || { historik: true }, (steget.rorda || BYGGNADSORDNING).slice(), allaFore));
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

  // Hela förskjutningen för en rond: byggnadens besöksrytm (nivå 1) plus rondens egen (nivå 2).
  // De två läggs ihop innan veckorna räknas, så att en rondserie kan ligga ur fas med resten av
  // byggnaden utan att byggnadens förskjutning tappas (beslut 26).
  function rondForskjutning(rond, s) {
    return (s.forskjutning || 0) + ((rond && rond.forskjutning) || 0);
  }
  // Veckorna för en rond, med båda förskjutningarna inräknade
  function veckorForRond(rond, s) {
    return (rond && freqKomplett(rond.freq)) ? veckorFor(rond.freq, rondForskjutning(rond, s)) : [];
  }

  // ------------------------------------------------------------------
  // Nivå 3: provisoriska flyttar och strykningar (beslut 26, 32 och 45)
  // ------------------------------------------------------------------
  // Ett tillfälle har två veckor: den **ordinarie**, som planeringens rytm ger, och den
  // **faktiska**, dit det flyttats. Flytten är provisorisk – den ändrar ingen frekvens och ingen
  // förskjutning, så ordinarie vecka står still och tillfället hittar alltid hem. Därför är både
  // flyttar och strykningar nycklade på ordinarie vecka.
  function tillfalleNyckel(rondId, ordinarieVecka) { return rondId + ':' + ordinarieVecka; }
  function faktiskVecka(s, rondId, ordinarieVecka) {
    var f = s.flyttade && s.flyttade[tillfalleNyckel(rondId, ordinarieVecka)];
    return f === undefined || f === null ? ordinarieVecka : f;
  }
  function strykStatus(s, rondId, ordinarieVecka) {
    return (s.strukna && s.strukna[tillfalleNyckel(rondId, ordinarieVecka)]) || null;
  }

  // Alla rutintillfällen som planeringen genererar.
  //
  // `vecka` är den **faktiska** veckan, alltså där tillfället ligger. Allt som visar tillfällen –
  // tidsaxeln, telefonen, informationskortet – läser `vecka` och får därför den provisoriska
  // flytten gratis, och namnet bygger på den faktiska veckan (biljett #16). Ordinarie vecka
  // följer med i `ordinarieVecka`: där ligger avvikande åtgärdstexter nycklade, eftersom
  // texten hör till planeringen och inte till den vecka tillfället råkar ligga i just nu.
  //
  // Ett struket tillfälle ligger inte i listan: det finns inte. Ett *föreslaget* gör det, med
  // flaggan `foreslagen` – förslaget är en fråga till planeraren, inte ett beslut (beslut 45).
  function rutintillfallen(s, bid) { return tillfallen(s, bid, false); }
  // Alla tillfällen inklusive de strukna, för listor som ska redovisa vad som hänt. Ett struket
  // tillfälle är inte borta ur planeringen – det är ett ställningstagande som går att ångra, och
  // det ska gå att se.
  function tillfallenMedStrukna(s, bid) { return tillfallen(s, bid, true); }

  // Nyckeln bygger på den **ordinarie** veckan och inte på den faktiska (beslut 64). Flera
  // tillfällen i samma rondserie kan flyttas till samma vecka – fyra semesterveckor av en
  // veckorond hamnar alla i veckan före – och hade nyckeln följt den faktiska veckan hade de
  // delat nyckel. Då hade tidsaxeln visat ett av dem och telefonen alltid öppnat samma.
  function tillfallen(s, bid, medStrukna) {
    s = s || stateFor(bid);
    var ut = [];
    s.ronder.forEach(function (r) {
      if (!freqKomplett(r.freq)) { return; }
      var atg = s.kopplingar.filter(function (k) { return k.rond === r.id; });
      veckorForRond(r, s).forEach(function (ov) {
        var status = strykStatus(s, r.id, ov);
        if (status === 'struken' && !medStrukna) { return; }
        var v = faktiskVecka(s, r.id, ov);
        ut.push({
          nyckel: tillfalleNyckel(r.id, ov), rond: r.id, vecka: v, ordinarieVecka: ov,
          provisorisk: v !== ov, foreslagen: status === 'foreslagen', struken: status === 'struken',
          namn: rutintillfalleNamn(r.id, v, bid), utforare: r.utforare, atgarder: atg
        });
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

  // ------------------------------------------------------------------
  // Förskjutningar (nivå 1 och 2)
  // ------------------------------------------------------------------
  // Används inuti andra()/andraFlera(). sattForskjutning förskjuter byggnadens besöksrytm, alltså
  // alla dess ronder på en gång (nivå 1). sattRondForskjutning förskjuter en enskild rondserie
  // ovanpå byggnadens förskjutning (nivå 2).
  //
  // Båda går genom samma väg, och den vägen gör två saker: sätter talet och flyttar de avvikande
  // texterna på rutintillfällesnivå lika många veckor som tillfällena (berättelse 70). Texterna
  // är nycklade på veckan, så utan flytten hade de hängt kvar på en vecka som inte längre har
  // något tillfälle – och städningen hade kastat dem. Flytten måste därför göras av den som
  // ändrar förskjutningen: efteråt finns inte längre uppgiften om var tillfället låg.
  function sattForskjutning(st, veckor) {
    return andraForskjutning(st, function (s) { s.forskjutning = Math.round(Number(veckor) || 0); });
  }
  function sattRondForskjutning(st, rondId, veckor) {
    return andraForskjutning(st, function (s) {
      var r = s.ronder.filter(function (x) { return x.id === rondId; })[0];
      if (r) { r.forskjutning = Math.round(Number(veckor) || 0); }
    });
  }

  // Vecka per rond före ändringen, ändringen, och sedan texterna flyttade till de nya veckorna
  function andraForskjutning(st, gor) {
    var fore = {};
    st.ronder.forEach(function (r) { fore[r.id] = veckorForRond(r, st); });
    gor(st);
    var flytt = {}; // rondId -> { gammalVecka: nyVecka }
    st.ronder.forEach(function (r) {
      var karta = {};
      // Samma parning som veckoSkillnad: tillfälle nummer n före svarar mot nummer n efter.
      // Tappas ett tillfälle ur året finns ingen vecka att flytta texten till, och städningen
      // tar hand om den.
      parihop(fore[r.id] || [], veckorForRond(r, st)).forEach(function (par) { karta[par.fran] = par.till; });
      flytt[r.id] = karta;
    });
    flyttaTillfalleTexter(st, flytt);
    flyttaNiva3(st, flytt);
  }

  // Provisoriska flyttar och strykningar följer sina tillfällen när besöksrytmen förskjuts.
  // De är nycklade på ordinarie vecka, precis som texterna, och av samma skäl: efter
  // förskjutningen finns ingen uppgift kvar om var tillfället låg, så den som ändrar
  // förskjutningen måste flytta dem (beslut 56). Att i stället kasta dem hade tagit bort
  // planerarens ställningstaganden i smyg varje gång balanseringen kördes om.
  //
  // Den provisoriska flytten är ett avstånd från ordinarie vecka, inte en absolut vecka:
  // flyttas ordinarie vecka 2 veckor framåt följer målveckan med lika långt, så tillfället
  // ligger kvar lika långt före sin ordinarie plats.
  function flyttaNiva3(st, flytt) {
    var nyaFlyttade = {}, nyaStrukna = {};
    st.ronder.forEach(function (r) {
      var karta = flytt[r.id] || {};
      Object.keys(karta).forEach(function (gammal) {
        var ov = Number(gammal), ny = karta[gammal];
        var fId = tillfalleNyckel(r.id, ov), nyId = tillfalleNyckel(r.id, ny);
        if (st.flyttade && st.flyttade[fId] !== undefined) {
          nyaFlyttade[nyId] = st.flyttade[fId] + (ny - ov);
        }
        if (st.strukna && st.strukna[fId]) { nyaStrukna[nyId] = st.strukna[fId]; }
      });
    });
    st.flyttade = nyaFlyttade;
    st.strukna = nyaStrukna;
  }

  // Flyttar texterna på rutintillfällesnivå till tillfällenas nya veckor
  function flyttaTillfalleTexter(st, flytt) {
    var nya = {};
    Object.keys(st.tillfalleTexter).forEach(function (n) {
      var d = n.split('|');
      var ny = flytt[d[2]] && flytt[d[2]][Number(d[3])];
      nya[ny === undefined ? n : tillfNyckel(d[0], d[1], d[2], ny)] = st.tillfalleTexter[n];
    });
    st.tillfalleTexter = nya;
  }

  // Tider för ronder som inte längre finns hänger inte kvar
  function rensaTider(st) {
    var finns = {};
    st.ronder.forEach(function (r) { finns[r.id] = true; });
    Object.keys(st.tider).forEach(function (id) { if (!finns[id]) { delete st.tider[id]; } });
  }

  // Provisoriska flyttar och strykningar för tillfällen som inte längre finns tas bort
  // (beslut 40). En rond som bytt frekvens eller försvunnit har inte längre de ordinarie
  // veckor nycklarna pekar på, och en flytt utan tillfälle hade legat kvar och slagit till
  // igen om frekvensen någon gång råkade ge samma vecka.
  function rensaNiva3(st) {
    var finns = {};
    st.ronder.forEach(function (r) {
      veckorForRond(r, st).forEach(function (v) { finns[tillfalleNyckel(r.id, v)] = true; });
    });
    [st.flyttade, st.strukna].forEach(function (karta) {
      if (!karta) { return; }
      Object.keys(karta).forEach(function (n) { if (!finns[n]) { delete karta[n]; } });
    });
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

  // En byggnad är klar för Balansering när alla sex stegen i Planering är klara (beslut 39).
  // Halvfärdiga byggnader balanseras inte: en planering utan tider eller kopplingar säger
  // inget om belastningen, och att räkna på den hade gett en falsk bild.
  function byggnadKlar(bid) {
    var k = stegStatus(null, bid);
    return [1, 2, 3, 4, 5, 6].every(function (n) { return k[n]; });
  }
  function klaraByggnader() { return BYGGNADSORDNING.filter(byggnadKlar); }

  // Underlaget till DP.Balansering: de klara byggnadernas rondserier med utförare, planerad
  // tid i timmar och de veckor tillfällena ligger i. Veckorna räknas här, med båda
  // förskjutningarna, så att balanseringsmodulen själv inte behöver veta något om frekvenser
  // eller om hur tillståndet ser ut.
  //
  // Svaren i det gemensamma tillståndet gäller när de finns. Kapacitetsfrågan och frågan om
  // veckor utan tillsyn och skötsel byggs i en senare biljett, så tills de finns gäller
  // förvalen: 3 dagar i veckan för alla (beslut 31) och inga veckor utkorsade.
  function balanseringsUnderlag() {
    var gem = gemensamt();
    return {
      antalVeckor: ANTAL_VECKOR,
      // Hur en rondserie ligger vid en annan förskjutning. Balanseringen prövar förskjutningar
      // och behöver räkna om veckorna, men ska inte själv veta något om frekvenser – reglerna
      // (bland dem beslut 41 om halvårsronder med startmånad) bor här.
      veckoraknare: veckorFor,
      utforare: UTFORARE.map(function (u) { return { id: u.id, namn: u.namn, farg: u.farg }; }),
      kapacitet: svarKapacitet(gem),
      veckorUtan: svarVeckorUtan(gem),
      akerTill: svarAkerTill(gem),
      byggnader: klaraByggnader().map(function (bid) {
        var s = stateFor(bid), b = DP.byggnader[bid];
        return {
          id: bid, namn: b.namn, farg: b.farg, omrade: b.omrade,
          // Byggnadens egen förskjutning (nivå 1) följer med, så att en permanent flytt går
          // att *se* i Balanseringens tidsaxel och inte bara räkna ut ur var brickorna hamnat
          // (beslut 34, berättelse 64).
          forskjutning: s.forskjutning || 0,
          ronder: s.ronder.filter(function (r) { return freqKomplett(r.freq); }).map(function (r) {
            // `veckor` är rondseriens **ordinarie** veckor, alltså de rytmen ger. Nivå 3 –
            // provisoriska flyttar och strykningar – följer med som egna kartor nycklade på
            // ordinarie vecka. Balanseringen räknar ut nivå 3 själv och behöver därför både
            // utgångsläget och vad som redan är bestämt, och belastningen räknar fram de
            // faktiska veckorna ur de två tillsammans.
            var veckor = veckorForRond(r, s);
            var namnPerVecka = {}, flyttade = {}, strukna = {};
            veckor.forEach(function (v) {
              namnPerVecka[v] = rutintillfalleNamn(r.id, faktiskVecka(s, r.id, v), bid);
              var f = s.flyttade && s.flyttade[tillfalleNyckel(r.id, v)];
              if (f !== undefined && f !== null) { flyttade[v] = f; }
              var st = strykStatus(s, r.id, v);
              if (st) { strukna[v] = st; }
            });
            var sparad = s.tider[r.id];
            return {
              id: r.id, namn: rondNamn(r.id), utforare: r.utforare,
              freq: { typ: r.freq.typ, startManad: r.freq.startManad || null },
              forskjutning: r.forskjutning || 0,
              timmar: tidTimmar(r.id, s, bid),
              dagsdel: sparad && sparad.godkand ? sparad.dagsdel : tidForslag(r.id, s, bid).dagsdel,
              veckor: veckor, namnPerVecka: namnPerVecka,
              flyttade: flyttade, strukna: strukna
            };
          })
        };
      })
    };
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
  function veckorForRondId(rondId, s) {
    return veckorForRond(s.ronder.filter(function (x) { return x.id === rondId; })[0], s);
  }
  // Rutintillfällen där en koppling har en egen text
  function tillfalleAvvikelser(k, s) {
    s = s || state();
    return veckorForRondId(k.rond, s).filter(function (v) { return !!s.tillfalleTexter[tillfNyckel(k.atgard, k.inst, k.rond, v)]; })
      .map(function (v) { return { vecka: v, namn: rutintillfalleNamn(k.rond, v), punkter: s.tillfalleTexter[tillfNyckel(k.atgard, k.inst, k.rond, v)] }; });
  }
  function kopplingAvviker(k, s) {
    s = s || state();
    return !!s.instTexter[instNyckel(k.atgard, k.inst)] || tillfalleAvvikelser(k, s).length > 0;
  }
  // Veckan en avvikande åtgärdstext är nycklad på: tillfällets **ordinarie** vecka. Texten hör
  // till planeringen, inte till den vecka tillfället råkar ligga i efter en provisorisk flytt –
  // flyttas tillfället följer texten med av sig själv, utan att någon nyckel skrivs om
  // (biljett #16). Äldre anropare som skickar ett tillfälle utan ordinarie vecka får sin
  // faktiska vecka, som är densamma när inget flyttats.
  function textVecka(t) {
    return t.ordinarieVecka === undefined ? t.vecka : t.ordinarieVecka;
  }
  function rutintillfalleAvviker(t, s) {
    return t.atgarder.some(function (k) { return textFor(k, textVecka(t), s).niva !== 'standard'; });
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
      if (!finnsRond[d[0] + '|' + d[1] + '|' + d[2]] || veckorForRondId(d[2], st).indexOf(Number(d[3])) < 0) { delete st.tillfalleTexter[n]; }
    });
  }

  // Städning efter varje ändring av en byggnads planering: avvikande texter och planerade tider
  // som inte längre har något att höra till tas bort. Allt som ändrar ett tillstånd går genom
  // andra() eller andraFlera(), så det räcker att städa där.
  function stada(st) {
    if (!st.flyttade) { st.flyttade = {}; }
    if (!st.strukna) { st.strukna = {}; }
    rensaTexter(st);
    rensaTider(st);
    rensaNiva3(st);
  }

  // Vilka rutintillfällen flyttade till en annan vecka mellan två tillstånd? Används för att
  // animera förskjutningar i tidsaxeln och för att låta en öppen telefonvy följa med. En rond
  // som bytt frekvens eller försvunnit har inte flyttats utan planerats om, och räknas därför
  // inte som en flytt.
  //
  // Tillfällena paras ihop på sina **ordinarie** veckor – det är rytmen som parningen bygger på
  // (beslut 56) – men `fran` och `till` är de **faktiska** veckorna. Det är där brickorna ligger
  // och vad telefonens nycklar pekar på, så en provisorisk flytt animeras och följs av en öppen
  // telefonvy på precis samma sätt som en förskjutning. Ett tillfälle som blivit struket har
  // ingen vecka att flytta till och räknas därför inte som en flytt.
  function veckoSkillnad(fore, efter) {
    var ut = [];
    efter.ronder.forEach(function (r) {
      var f = fore.ronder.filter(function (x) { return x.id === r.id; })[0];
      if (!f || !sammaFreq(f.freq, r.freq)) { return; }
      parihop(veckorForRond(f, fore), veckorForRond(r, efter)).forEach(function (par) {
        if (strykStatus(fore, r.id, par.fran) === 'struken' || strykStatus(efter, r.id, par.till) === 'struken') { return; }
        var fran = faktiskVecka(fore, r.id, par.fran), till = faktiskVecka(efter, r.id, par.till);
        if (fran !== till) {
          ut.push({ rond: r.id, fran: fran, till: till,
            // Nyckeln pekar ut *tillfället* och bygger därför på dess ordinarie vecka, som
            // `rutintillfallen()` – `fran` och `till` är de faktiska veckorna, alltså var
            // brickan flyger ifrån och till (beslut 64).
            nyckel: tillfalleNyckel(r.id, par.till), franNyckel: tillfalleNyckel(r.id, par.fran) });
        }
      });
    });
    return ut;
  }

  // Parar ihop en rondseries tillfällen före och efter en förskjutning. Rytmen är densamma,
  // bara förskjuten, så det n:te tillfället före svarar mot det n:te efter: båda listorna börjar
  // på årets första tillfälle och räknar framåt med samma intervall.
  //
  // Listorna kan vara olika långa, och det är inte ett skäl att ge upp parningen. Ett intervall
  // som inte delar året jämnt – varannan månad, var 8:e vecka – ger 6 eller 7 tillfällen beroende
  // på fas (beslut 56). Då saknar det sista tillfället motsvarighet, men de övriga har flyttat
  // precis som vanligt och ska animeras och bära sina texter med sig.
  function parihop(fore, efter) {
    var ut = [];
    for (var i = 0; i < Math.min(fore.length, efter.length); i++) {
      ut.push({ fran: fore[i], till: efter[i] });
    }
    return ut;
  }

  // Vilka rutintillfällen och installationer fick ändrad gällande text mellan två tillstånd
  function textSkillnad(fore, efter) {
    var nycklar = {}, inst = {};
    var foreK = {};
    fore.kopplingar.forEach(function (k) { foreK[k.atgard + '|' + k.inst + '|' + k.rond] = true; });
    efter.kopplingar.forEach(function (k) {
      if (!foreK[k.atgard + '|' + k.inst + '|' + k.rond]) { return; }
      veckorForRondId(k.rond, efter).forEach(function (v) {
        if (veckorForRondId(k.rond, fore).indexOf(v) < 0) { return; }
        if (!lika(textFor(k, v, fore).punkter, textFor(k, v, efter).punkter)) {
          nycklar[k.rond + ':' + v] = true;
          inst[k.inst] = true;
        }
      });
    });
    return { nycklar: Object.keys(nycklar), inst: Object.keys(inst) };
  }

  // ------------------------------------------------------------------
  // Balanseringens frågor och resultat
  // ------------------------------------------------------------------
  // Svaren på frågorna (områden man åker till, kapacitet per utförare) ligger i det
  // gemensamma tillståndet, så att de ångras som allt annat. Varje svar är ett eget steg i
  // historiken: planeraren som ändrar Annas kapacitet från 3 till 2 dagar ska kunna ta
  // tillbaka just det.
  function sattAkerTill(omraden) {
    andraFlera('Balansering: områden man åker till', function (a) {
      a.gemensamt.akerTill = omraden.slice();
      a.gemensamt.omradenBesvarad = true;
    }, { balanseringsfraga: 'omraden' });
  }
  function sattKapacitet(utforareId, dagar) {
    andraFlera('Balansering: ' + utforare(utforareId).namn + ' har ' + dagar + ' dagar i veckan', function (a) {
      a.gemensamt.kapacitet = a.gemensamt.kapacitet || {};
      a.gemensamt.kapacitet[utforareId] = Math.max(0, Math.min(5, Math.round(Number(dagar) || 0)));
      a.gemensamt.kapacitetBesvarad = true;
    }, { balanseringsfraga: 'kapacitet' });
  }
  // Veckor utan tillsyn och skötsel (fråga 3, beslut 32). Varje klick på en vecka är ett eget
  // steg i historiken, som kapacitetssvaret: planeraren som korsar ut fel vecka ska kunna ta
  // tillbaka just den.
  function vaxlaVeckaUtan(vecka) {
    var v = Math.round(Number(vecka) || 0);
    if (v < 1 || v > ANTAL_VECKOR) { return; }
    var nu = svarVeckorUtan();
    var pa = nu.indexOf(v) < 0;
    andraFlera('Balansering: v. ' + v + (pa ? ' utan tillsyn och skötsel' : ' har tillsyn och skötsel igen'), function (a) {
      a.gemensamt.veckorUtan = (pa ? nu.concat([v]) : nu.filter(function (x) { return x !== v; }))
        .sort(function (x, y) { return x - y; });
      a.gemensamt.veckorUtanBesvarad = true;
    }, { balanseringsfraga: 'veckorUtan' });
  }
  // "Förvalen stämmer" är ett svar och inte ett tomrum: frågan får grön bock utan att något
  // tal ändras, och ett klick räcker (beslut 37).
  var FRAGETEXT = { omraden: 'områdena stämmer', kapacitet: 'kapaciteten stämmer', veckorUtan: 'veckorna stämmer' };
  function godkannFraga(fraga) {
    andraFlera('Balansering: ' + (FRAGETEXT[fraga] || fraga), function (a) {
      if (fraga === 'omraden') {
        a.gemensamt.akerTill = svarAkerTill(a.gemensamt);
        a.gemensamt.omradenBesvarad = true;
      } else if (fraga === 'veckorUtan') {
        a.gemensamt.veckorUtan = svarVeckorUtan(a.gemensamt);
        a.gemensamt.veckorUtanBesvarad = true;
      } else {
        a.gemensamt.kapacitet = svarKapacitet(a.gemensamt);
        a.gemensamt.kapacitetBesvarad = true;
      }
    }, { balanseringsfraga: fraga });
  }

  // Resultatet av en balansering skrivs som **ett** historiksteg (beslut 36): alla byggnaders
  // förskjutningar och det gemensamma tillståndets minne av balanseringen i samma steg, så att
  // ett enda ångra tar tillbaka hela balanseringen. Steget hör inte till någon byggnad, så
  // ångra byter inte aktiv byggnad.
  function tillampaBalansering(resultat) {
    andraFlera('Balansering: förskjöt besöksrytmerna', function (a) {
      Object.keys(resultat.forskjutningar).forEach(function (bid) {
        var st = a.tillstand(bid);
        if (!st) { return; }
        sattForskjutning(st, resultat.forskjutningar[bid]);
        var rf = resultat.rondForskjutningar[bid] || {};
        Object.keys(rf).forEach(function (rondId) { sattRondForskjutning(st, rondId, rf[rondId]); });
      });
      // Nivå 3 skrivs **efter** förskjutningarna, och skriver över det som fanns. Förskjutningen
      // flyttade gamla flyttar till sina nya ordinarie veckor, men vilka tillfällen som nu
      // hamnar i en vecka utan tillsyn och skötsel beror på var rytmen hamnade – och det vet
      // bara uträkningen som just valde förskjutningen. Strykningar planeraren själv har gjort
      // räknas också om: ett tillfälle som efter den nya rytmen inte längre ligger nära sitt
      // granntillfälle ska inte vara struket av en tidigare balansering.
      Object.keys(resultat.niva3 || {}).forEach(function (bid) {
        var st = a.tillstand(bid);
        if (!st) { return; }
        st.flyttade = klona(resultat.niva3[bid].flyttade || {});
        st.strukna = klona(resultat.niva3[bid].strukna || {});
      });
      a.gemensamt.balanserad = {
        forskjutningar: klona(resultat.forskjutningar),
        rondForskjutningar: klona(resultat.rondForskjutningar),
        forklaring: klona(resultat.forklaring),
        kvarstaende: klona(resultat.kvarstaende),
        forbattring: klona(resultat.forbattring),
        provisoriska: resultat.provisoriska || 0,
        foreslagna: klona(resultat.foreslagna || [])
      };
    }, { balansering: true });
  }

  // De tillfällen balanseringen föreslår att stryka, läst ur tillstånden. Panelen och knappen
  // *Stryk alla* räknar på det som faktiskt står i planeringen och inte på det sparade
  // resultatet: behåller planeraren ett enskilt tillfälle ska de övriga förslagen stå kvar,
  // och listan ska krympa med dem (beslut 45).
  function foreslagnaStrykningar() {
    var ut = [];
    BYGGNADSORDNING.forEach(function (bid) {
      var s = stateFor(bid);
      tillfallenMedStrukna(s, bid).forEach(function (t) {
        if (t.foreslagen) {
          ut.push({ byggnad: bid, byggnadNamn: DP.byggnader[bid].namn, rond: t.rond,
            rondNamn: rondNamn(t.rond), ordinarieVecka: t.ordinarieVecka, vecka: t.vecka,
            namn: t.namn, utforare: t.utforare });
        }
      });
    });
    return ut;
  }
  // Alla föreslagna tillfällen stryks i **ett** steg (beslut 45): förslaget kom i ett svep, och
  // att säga ja till det ska gå att ta tillbaka i ett svep.
  function strykAllaForeslagna() {
    var lista = foreslagnaStrykningar();
    if (!lista.length) { return 0; }
    andraFlera('Balansering: strök ' + lista.length + ' föreslagna rutintillfällen', function (a) {
      lista.forEach(function (t) {
        var st = a.tillstand(t.byggnad);
        if (st) { st.strukna[tillfalleNyckel(t.rond, t.ordinarieVecka)] = 'struken'; }
      });
    }, { strykning: true });
    return lista.length;
  }
  // Behåll ett enskilt tillfälle: förslaget tas bort, tillfället ligger kvar där det ligger.
  // Den provisoriska flytten rörs inte – den är skälet till att förslaget kom, och tillfället
  // ska inte tillbaka in i en vecka utan tillsyn och skötsel.
  function behallTillfalle(bid, rondId, ordinarieVecka) {
    andraFlera('Balansering: behöll ' + rutintillfalleNamn(rondId, faktiskVecka(stateFor(bid), rondId, ordinarieVecka), bid), function (a) {
      var st = a.tillstand(bid);
      if (st) { delete st.strukna[tillfalleNyckel(rondId, ordinarieVecka)]; }
    }, { strykning: true });
  }

  // Vad som är förskjutet i en byggnad, i klartext. En **permanent** flytt är en förskjutning,
  // och en förskjutning syns i tidsaxeln bara som att veckorna ligger någon annanstans – det
  // går inte att se på en bricka att rytmen är flyttad. Därför svarar planeringen med beskedet
  // i stället för att varje vy ska formulera sitt eget, och de två tidsaxlarna säger samma sak
  // om samma flytt (beslut 34, berättelse 64).
  //
  // Provisoriska flyttar märks per bricka (⤺), permanenta per rad: skillnaden är vad de gäller,
  // och markeringen ligger därför på den nivå flytten faktiskt rör.
  // "⇥ +2 v." – märket vyerna sätter på raden. Det bor här och inte i vyerna av samma skäl som
  // klartexten: beslut 68 kräver att en permanent flytt heter samma sak var man än står, och
  // tre kopior av formen hade krävt tre redigeringar för att byta symbol.
  function forskjutningMarke(veckor) {
    return '⇥ ' + (veckor > 0 ? '+' : '−') + Math.abs(veckor) + ' v.';
  }
  function forskjutningStatus(bid) {
    var s = stateFor(bid);
    var bas = s.forskjutning || 0;
    return {
      byggnad: bas,
      byggnadText: bas ? 'Besöksrytmen är förskjuten ' + deltaText(bas) : null,
      ronder: s.ronder.map(function (r) {
        var egen = r.forskjutning || 0;
        return {
          rond: r.id, egen: egen, total: rondForskjutning(r, s),
          text: egen ? 'Rondserien är förskjuten ' + deltaText(egen) + ' utöver besöksrytmen'
            : (bas ? 'Följer byggnadens besöksrytm, förskjuten ' + deltaText(bas) : null)
        };
      })
    };
  }

  // ------------------------------------------------------------------
  // Flytt för hand (beslut 34)
  // ------------------------------------------------------------------
  // Planeraren drar en bricka till en annan vecka och svarar på vad flytten ska gälla: bara
  // det här tillfället, hela rondserien eller hela byggnadens besöksrytm. De tre svaren är de
  // tre nivåerna i beslut 26, nådda från samma gest – och det är hela poängen: skillnaden
  // mellan en provisorisk flytt och en permanent ska vara ett val planeraren möter och inte
  // två skilda verktyg hen måste veta om i förväg.
  //
  // Ett drag är ett **avstånd**: tillfället låg i sin faktiska vecka och släpptes i en annan.
  // Avståndet är det samma vad valet än blir, men vad det *betyder* skiljer sig:
  //   bara denna gång  – avståndet läggs på tillfället (nivå 3), ordinarie vecka står still
  //   hela rondserien  – avståndet läggs på rondens förskjutning (nivå 2)
  //   besöksrytmen     – avståndet läggs på byggnadens förskjutning (nivå 1)
  //
  // De två permanenta räknas från **ordinarie** vecka och inte från den faktiska. En
  // förskjutning flyttar rytmen, och rytmen är de ordinarie veckorna; drar planeraren ett
  // provisoriskt flyttat tillfälle vidare och väljer "hela rondserien" är det rytmen som ska
  // hamna i målveckan, inte rytmen plus den gamla provisoriska flytten en gång till.
  function flyttDelta(s, rondId, ordinarieVecka, malVecka, permanent) {
    var fran = permanent ? ordinarieVecka : faktiskVecka(s, rondId, ordinarieVecka);
    return Math.round(Number(malVecka) || 0) - fran;
  }

  // Vad de tre valen skulle ge, som rena data – frågedialogen läser det här och behöver inte
  // själv veta något om frekvenser, förskjutningar eller beslut 41. Att svaren räknas fram
  // *före* valet är vad som gör det möjligt att säga vad en permanent flytt landar i, och att
  // stänga av den när den inte är tillåten.
  //
  // `tillaten` är falskt för de permanenta när ronden är en halvårsrond med vald startmånad
  // och målveckan ligger i en annan månad än tillfällets ordinarie (beslut 41): rytmen får
  // flyttas inom månaden, inte ut ur den. Då finns bara "bara denna gång" kvar, och det är ett
  // riktigt svar – en halvårsrond går att flytta provisoriskt vart som helst, det är bara
  // planeringen som är bunden till månaden.
  function flyttAlternativ(bid, rondId, ordinarieVecka, malVecka) {
    var s = stateFor(bid);
    var rond = s.ronder.filter(function (r) { return r.id === rondId; })[0];
    if (!rond) { return null; }
    var mal = Math.round(Number(malVecka) || 0);
    var inomManad = !(frekvens(rond.freq.typ).startManad && rond.freq.startManad)
      || manadForVecka(mal) === manadForVecka(ordinarieVecka);
    return {
      byggnad: bid, rond: rondId, rondNamn: rondNamn(rondId),
      ordinarieVecka: ordinarieVecka, faktiskVecka: faktiskVecka(s, rondId, ordinarieVecka),
      malVecka: mal,
      // Varje val får sitt eget avstånd och sina egna veckor efteråt, så att dialogen kan
      // säga vad valet landar i utan att räkna om något själv.
      tillfalle: { delta: flyttDelta(s, rondId, ordinarieVecka, mal, false), tillaten: true },
      rondserie: permanentAlternativ(s, rond, ordinarieVecka, mal, false, inomManad),
      besoksrytm: permanentAlternativ(s, rond, ordinarieVecka, mal, true, inomManad),
      // Skälet står med, så att dialogen kan förklara varför ett val är avstängt i stället
      // för att bara visa en grå knapp (pedagogiken är det viktigaste i det här projektet).
      sparr: inomManad ? null : 'startmanad'
    };
  }
  // Ett permanent alternativ: avståndet, den nya förskjutningen och de veckor rytmen hamnar i.
  //
  // Förskjutningen räknas modulo intervallet (beslut 56), så ett drag längre än intervallet
  // ger inte en rytm som ligger längre bort – den ligger likadant. Därför svarar `veckor` med
  // vad rytmen *faktiskt* blir, och `traffar` säger om det dragna tillfället självt hamnar i
  // målveckan. Drar planeraren en månadsrond fem veckor framåt landar rytmen en vecka framåt,
  // och det är inte ett fel utan vad en frekvens betyder – men det ska stå i dialogen och inte
  // upptäckas efteråt.
  function permanentAlternativ(s, rond, ordinarieVecka, mal, byggnadsniva, inomManad) {
    var delta = flyttDelta(s, rond.id, ordinarieVecka, mal, true);
    var nuvarande = byggnadsniva ? (s.forskjutning || 0) : (rond.forskjutning || 0);
    var prov = klona(s);
    var provRond = prov.ronder.filter(function (r) { return r.id === rond.id; })[0];
    if (byggnadsniva) { prov.forskjutning = nuvarande + delta; }
    else { provRond.forskjutning = nuvarande + delta; }
    var veckor = veckorForRond(provRond, prov);
    // Vilken vecka det dragna tillfället hamnar i: tillfällena paras ihop på ordningsnummer
    // precis som i parihop(), så det n:te före svarar mot det n:te efter.
    var fore = veckorForRond(rond, s);
    var i = fore.indexOf(ordinarieVecka);
    var nyVecka = i >= 0 && i < veckor.length ? veckor[i] : null;
    return {
      delta: delta, forskjutning: nuvarande + delta, tillaten: inomManad,
      veckorFore: fore, veckor: veckor, nyVecka: nyVecka, traffar: nyVecka === mal,
      // Antalet rondserier valet rör: byggnadsnivån tar alla ronder med en komplett frekvens
      antalRonder: byggnadsniva ? s.ronder.filter(function (r) { return freqKomplett(r.freq); }).length : 1
    };
  }

  // Bara denna gång: ett eget historiksteg som bara rör tillfället (nivå 3). Ett tillfälle som
  // dras tillbaka till sin ordinarie vecka är inte längre flyttat – posten tas bort i stället
  // för att bli en flytt på noll veckor, så att brickan tappar sin markering av sig själv.
  //
  // Strykförslaget försvinner: det kom av var balanseringen lade tillfället, och planeraren
  // har nu tagit ställning till just den veckan med handen. Att låta saxen sitta kvar på en
  // vecka planeraren själv valt hade varit systemet som tjatade om sitt eget gamla förslag.
  function flyttaTillfalle(bid, rondId, ordinarieVecka, malVecka) {
    var mal = Math.round(Number(malVecka) || 0);
    if (mal < 1 || mal > ANTAL_VECKOR) { return false; }
    var nyckel = tillfalleNyckel(rondId, ordinarieVecka);
    andraFlera('Flyttade ' + rutintillfalleNamn(rondId, faktiskVecka(stateFor(bid), rondId, ordinarieVecka), bid) +
      ' till v. ' + mal + ' (bara denna gång)', function (a) {
      var st = a.tillstand(bid);
      if (!st) { return; }
      if (mal === ordinarieVecka) { delete st.flyttade[nyckel]; }
      else { st.flyttade[nyckel] = mal; }
      if (st.strukna[nyckel] === 'foreslagen') { delete st.strukna[nyckel]; }
    }, { handflytt: 'tillfalle' });
    return true;
  }

  // Hela rondserien (nivå 2) och hela byggnadens besöksrytm (nivå 1): permanenta, och därför
  // förskjutningar. Båda går genom sattRondForskjutning/sattForskjutning, som flyttar med sig
  // de avvikande texterna och planerarens nivå 3 (beslut 56) – en flytt för hand ska inte
  // kasta det som redan är bestämt om tillfällena.
  function flyttaRondserie(bid, rondId, ordinarieVecka, malVecka) {
    var alt = flyttAlternativ(bid, rondId, ordinarieVecka, malVecka);
    if (!alt || !alt.rondserie.tillaten) { return false; }
    andraFlera('Förskjöt rondserien ' + alt.rondNamn + ' i ' + DP.byggnader[bid].namn +
      ' ' + deltaText(alt.rondserie.delta), function (a) {
      var st = a.tillstand(bid);
      if (st) { sattRondForskjutning(st, rondId, alt.rondserie.forskjutning); }
    }, { handflytt: 'rondserie' });
    return true;
  }
  function flyttaBesoksrytm(bid, rondId, ordinarieVecka, malVecka) {
    var alt = flyttAlternativ(bid, rondId, ordinarieVecka, malVecka);
    if (!alt || !alt.besoksrytm.tillaten) { return false; }
    andraFlera('Förskjöt besöksrytmen för ' + DP.byggnader[bid].namn + ' ' +
      deltaText(alt.besoksrytm.delta), function (a) {
      var st = a.tillstand(bid);
      if (st) { sattForskjutning(st, alt.besoksrytm.forskjutning); }
    }, { handflytt: 'besoksrytm' });
    return true;
  }
  // "2 veckor framåt" / "1 vecka bakåt" – historikens text ska gå att läsa i mediaspelaren
  function deltaText(delta) {
    var n = Math.abs(delta);
    return n + (n === 1 ? ' vecka ' : ' veckor ') + (delta < 0 ? 'bakåt' : 'framåt');
  }

  // Stryka och återställa för hand: egna historiksteg, ett per tillfälle. En strykning för
  // hand är ett eget ställningstagande och inte ett ja till ett förslag, så den går inte genom
  // strykAllaForeslagna – men den ser likadan ut i tillståndet ('struken'), eftersom det är
  // samma sak: tillfället ska inte göras i år.
  function strykTillfalle(bid, rondId, ordinarieVecka) {
    var nyckel = tillfalleNyckel(rondId, ordinarieVecka);
    andraFlera('Strök ' + rutintillfalleNamn(rondId, faktiskVecka(stateFor(bid), rondId, ordinarieVecka), bid),
      function (a) {
        var st = a.tillstand(bid);
        if (st) { st.strukna[nyckel] = 'struken'; }
      }, { strykning: true });
  }
  // Vägen tillbaka utan att gå via ångra: ett struket tillfälle är ett ställningstagande, och
  // planeraren ska kunna ta tillbaka just det utan att rulla bort allt som gjorts sedan dess.
  function aterstallStruket(bid, rondId, ordinarieVecka) {
    var nyckel = tillfalleNyckel(rondId, ordinarieVecka);
    andraFlera('Återställde ' + rutintillfalleNamn(rondId, faktiskVecka(stateFor(bid), rondId, ordinarieVecka), bid),
      function (a) {
        var st = a.tillstand(bid);
        if (st) { delete st.strukna[nyckel]; }
      }, { strykning: true });
  }

  // Status för huvudsteget Balansering: frågorna och om balanseringen är gjord. Grön bock
  // kräver att den är gjord – frågorna med förval räcker inte, för det är balanseringen som
  // är arbetet (beslut 37).
  function balanseringStatus() {
    var gem = gemensamt();
    return {
      omraden: !!gem.omradenBesvarad,
      kapacitet: !!gem.kapacitetBesvarad,
      veckorUtan: !!gem.veckorUtanBesvarad,
      balanserad: !!gem.balanserad,
      resultat: gem.balanserad || null,
      // Förslagen räknas ur tillstånden och inte ur det sparade resultatet, så att listan
      // krymper när planeraren stryker eller behåller enskilda tillfällen.
      foreslagna: foreslagnaStrykningar(),
      klar: !!gem.balanserad
    };
  }

  window.DP.Plan = {
    standardText: standardText, instText: instText, textFor: textFor, tillfalleAvvikelser: tillfalleAvvikelser,
    kopplingAvviker: kopplingAvviker, rutintillfalleAvviker: rutintillfalleAvviker, avvikandeInst: avvikandeInst,
    textVecka: textVecka,
    sattStandard: sattStandard, sattInst: sattInst, sattTillfalle: sattTillfalle, rensaTillfallen: rensaTillfallen, rensaInst: rensaInst,
    textSkillnad: textSkillnad, veckoSkillnad: veckoSkillnad, lika: lika,
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
    tillfallenMedStrukna: tillfallenMedStrukna,
    kopplingarForInst: kopplingarForInst, besoksveckor: besoksveckor,
    signifikanta: signifikanta, kopplingsStatus: kopplingsStatus, stegStatus: stegStatus,
    byggnadKlar: byggnadKlar, klaraByggnader: klaraByggnader, balanseringsUnderlag: balanseringsUnderlag,
    gemensamt: gemensamt, andraFlera: andraFlera,
    tidForslag: tidForslag, tidStatus: tidStatus, tidTimmar: tidTimmar, sattTid: sattTid,
    behallTid: behallTid, arvTid: arvTid, timText: timText,
    rondForskjutning: rondForskjutning, veckorForRond: veckorForRond,
    sattForskjutning: sattForskjutning, sattRondForskjutning: sattRondForskjutning,
    svarAkerTill: svarAkerTill, svarKapacitet: svarKapacitet, akerTillForval: akerTillForval,
    svarVeckorUtan: svarVeckorUtan, veckorUtanForval: veckorUtanForval, vaxlaVeckaUtan: vaxlaVeckaUtan,
    sattAkerTill: sattAkerTill, sattKapacitet: sattKapacitet, godkannFraga: godkannFraga,
    tillampaBalansering: tillampaBalansering, balanseringStatus: balanseringStatus,
    foreslagnaStrykningar: foreslagnaStrykningar, strykAllaForeslagna: strykAllaForeslagna,
    behallTillfalle: behallTillfalle,
    flyttAlternativ: flyttAlternativ, flyttaTillfalle: flyttaTillfalle,
    flyttaRondserie: flyttaRondserie, flyttaBesoksrytm: flyttaBesoksrytm,
    strykTillfalle: strykTillfalle, aterstallStruket: aterstallStruket,
    forskjutningStatus: forskjutningStatus, forskjutningMarke: forskjutningMarke
  };
})();
