/*
 * Inläsningen: inläsningsfilens flikar tolkade till klart, förslag och oplacerat.
 *
 * Fristående från DOM, som `DP.Balansering` och `DP.Planlosning` (beslut 61): modulen får
 * rena data in – ett **ark**, alltså en lista med flikar som var och en är en lista med rader
 * av celler – och ger rena data ut. Förslagens skäl formuleras här och inte i vyn, så att de
 * går att läsa i ett test utan att en webbläsare finns, och så att två vyer aldrig kan säga
 * olika saker om samma rad.
 *
 * Det som bor här är *tolkningen*. Hur filen blir ett ark och hur ett ark blir en .xlsx är
 * `DP.Inlasningsfil`:s sak (SheetJS), och vad som händer med en godtagen rad är `DP.Plan`:s.
 *
 * Radmodellen, som den prövades i prototypen (beslut 75 och 102):
 *
 *   { key, rad, egna, falt: { … }, fragor: [{ slag, text, forslag }] }
 *
 * `rad` är raden som den stod i filen, `egna` de kolumner systemet inte känner till (beslut 89),
 * `falt` uppgifterna som de **är**, och `fragor` det som återstår. Statusen är en följd av
 * frågorna och inget man sätter: inga frågor → *klar*, alla frågor har förslag → *förslag*,
 * annars → *oplacerad* (beslut 83). Att godta är att föra in förslagen och ta bort de frågorna.
 *
 * Varför status är härledd och inte ett fält: ett fält hade kunnat säga "klar" om en rad som
 * fortfarande har en obesvarad fråga. Då hade modellen visat en gissning (berättelse 55), och
 * felet syns först när någon tittar på byggnaden.
 *
 * **Mot en befintlig byggnad visar inläsningen skillnaden** (beslut 86, berättelse 72–74). En
 * rad vars identitet redan finns – planet på sin beteckning, rummet på plan + rumsnummer,
 * installationen på sitt Id – är inte ny. Bär den andra uppgifter än byggnaden blir den ett
 * **förslag om ändring** med `andring: { fore, efter }` och en fråga av slaget `andring`, så
 * att planeraren ser före och efter innan något skrivs över. Bär den samma uppgifter är den
 * klar: raden är samma rad en gång till, vilket är vad en fil som tas ut och läses in oförändrad
 * ger.
 *
 * Och det som finns i byggnaden men **saknas i filen** tas aldrig bort av sig självt. Det blir
 * en egen rad – `bort: true`, med en fråga av slaget `bort` – eftersom en rad som fattas lika
 * gärna kan vara glömd som borttagen. Raderna byggs av `bortForslag`, som till skillnad från
 * `tolka*` börjar i byggnaden och inte i filen.
 */
(function () {
  'use strict';
  var DP = window.DP;

  // ------------------------------------------------------------------
  // Flikarna och deras kolumner (beslut 70 och 109)
  // ------------------------------------------------------------------
  // Rubriken är det planeraren ser i filen, nyckeln det raden bär inuti. Ordningen är
  // kolumnernas ordning när filen tas ut.
  var KOLUMNER = {
    plan: [['Plan', 'id'], ['Benämning', 'namn']],
    rum: [['Plan', 'plan'], ['Rum', 'nr'], ['Benämning', 'namn'], ['Rumstyp', 'rumstyp'],
      ['NTA', 'nta'], ['NTV', 'ntv'], ['BRA', 'bra'], ['BTA', 'bta'],
      ['Temperaturreglerad', 'temp']],
    inst: [['Plan', 'plan'], ['Rum', 'rum'], ['Benämning', 'benamning'],
      ['Installationstyp', 'instTyp'], ['Beteckning', 'beteckning'], ['Fabrikat', 'fabrikat'],
      ['Modell', 'modell'], ['Id', 'id'], ['Externt id', 'externtId'],
      ['Installationsdatum', 'datum']]
  };
  // Flikarnas namn i filen. Igenkänningen går ändå på rubrikerna och inte på namnet
  // (berättelse 19): Numbers döper bladen efter tabellen, så ett blad kan heta "Blad 1".
  var FLIKNAMN = { plan: 'Plan', rum: 'Rum', inst: 'Installationer' };
  var FLIKAR = ['plan', 'rum', 'inst'];

  function txt(v) { return v == null ? '' : String(v).trim(); }
  // Normalisering för jämförelse av rubriker: versaler, blanksteg och skiljetecken bort.
  // "NTA", "nta" och "NTA " är samma kolumn för den som fyller i filen.
  function norm(s) { return txt(s).toLowerCase().replace(/[^a-z0-9åäöé]/g, ''); }
  function pad3(n) { return ('000' + n).slice(-3); }

  // ------------------------------------------------------------------
  // Arket → rader (berättelse 19)
  // ------------------------------------------------------------------
  // Vilken flik är det? Rubrikerna avgör. Ordningen i prövningen går från det mest utpekande
  // till det minst: *Beteckning* och *Fabrikat* finns bara i Installationer, *NTA* bara i Rum,
  // och Plan är den enda fliken som har *Plan* utan något av de andra.
  function vilkenFlik(rubriker) {
    var r = (rubriker || []).map(norm);
    function har(x) { return r.indexOf(norm(x)) >= 0; }
    if (har('Fabrikat') || har('Beteckning') || har('Installationstyp')) { return 'inst'; }
    if (har('NTA') || har('Rumstyp') || (har('Rum') && har('Plan'))) { return 'rum'; }
    if (har('Plan')) { return 'plan'; }
    return null;
  }

  // Alla rubriker systemet känner till, över alla flikar. Används för att hitta rubrikraden.
  function kandaRubriker() {
    var ut = {};
    FLIKAR.forEach(function (f) {
      KOLUMNER[f].forEach(function (k) { ut[norm(k[0])] = true; });
    });
    return ut;
  }

  // Rubrikraden är den rad bland de sex översta som har **flest** kända rubriker, och vid lika
  // den första. De sex raderna är marginalen en fil som gått via Numbers behöver: Numbers
  // lägger gärna en tabellrubrik ("Plan") och en tom rad ovanför själva tabellen, och den som
  // fyller i filen skriver ibland en egen rad om vem som fyllt i den.
  //
  // *Flest* och inte *den första med minst två* är med flit. En tabellrubrik ovanför tabellen
  // heter just "Plan" – samma ord som en kolumn – och en regel som nöjer sig med den första
  // raden som ser ut som rubriker hade tagit tabellrubriken och läst den riktiga rubrikraden
  // som data. Den riktiga rubrikraden har alltid fler kända rubriker än en tabellrubrik har.
  function hittaRubrikrad(rader) {
    var kanda = kandaRubriker();
    var bast = -1, flest = 0;
    for (var i = 0; i < Math.min(6, rader.length); i++) {
      var antal = rader[i].filter(function (c) { return kanda[norm(c)]; }).length;
      if (antal > flest) { flest = antal; bast = i; }
    }
    return flest > 0 ? bast : -1;
  }

  // ark: [{ namn, rader: [[cell, …], …] }]
  //   → { plan: [rad], rum: [rad], inst: [rad], egnaKolumner: { … }, ignorerade: [namn] }
  //
  // En rad är `{ <nyckel>: text, egna: { rubrik: text } }`. Tomma rader hoppas över: ett blad
  // med tusen tomma rader under tabellen är vad både Excel och Numbers lämnar efter sig.
  //
  // Ett blad vars rubriker inte känns igen hamnar i `ignorerade` i stället för att tigas ihjäl
  // – planeraren ska kunna få veta att hennes tredje blad inte lästes.
  function lasArk(ark) {
    // `flikar` är vilka flikar filen **bar**, inte vilka som hade rader. Skillnaden är hela
    // skälet fältet finns: en tom flik Rum i en fil som tas ut ur en byggnad full av rum säger
    // att rummen ska bort (beslut 86), medan en fil som bara har Plan-fliken inte säger något
    // om rummen alls.
    var ut = { plan: [], rum: [], inst: [], ignorerade: [], flikar: {},
      egnaKolumner: { plan: [], rum: [], inst: [] } };
    (ark || []).forEach(function (blad) {
      var rader = blad.rader || [];
      var rubrikRad = hittaRubrikrad(rader);
      if (rubrikRad < 0) { ut.ignorerade.push(blad.namn); return; }
      var rubriker = rader[rubrikRad].map(txt);
      var flik = vilkenFlik(rubriker);
      if (!flik) { ut.ignorerade.push(blad.namn); return; }
      ut.flikar[flik] = true;
      // Rubrik → nyckel för den här fliken. Det som inte står i tabellen är ett eget fält.
      var karta = {};
      KOLUMNER[flik].forEach(function (k) { karta[norm(k[0])] = k[1]; });
      rubriker.forEach(function (r) {
        if (r && !karta[norm(r)] && ut.egnaKolumner[flik].indexOf(r) < 0) {
          ut.egnaKolumner[flik].push(r);
        }
      });
      rader.slice(rubrikRad + 1).forEach(function (rad) {
        if (!rad.some(function (c) { return txt(c); })) { return; }
        var o = { egna: {} };
        rubriker.forEach(function (r, j) {
          var v = txt(rad[j]);
          if (karta[norm(r)]) { o[karta[norm(r)]] = v; }
          else if (r && v) { o.egna[r] = v; }
        });
        ut[flik].push(o);
      });
    });
    return ut;
  }

  // ------------------------------------------------------------------
  // Radens status och frågor (beslut 83)
  // ------------------------------------------------------------------
  function status(rad) {
    if (!rad || !rad.fragor || !rad.fragor.length) { return 'klar'; }
    return rad.fragor.every(function (f) { return f.forslag != null; }) ? 'forslag' : 'oplacerad';
  }
  function fraga(rad, slag) {
    return (rad.fragor || []).filter(function (f) { return f.slag === slag; })[0] || null;
  }

  // Förslagen förs in i fälten. Ett `slag` som inte finns här är ett fält ingen kan godta, så
  // listan är den enda platsen där ett nytt slag behöver läggas till.
  function tillampa(rad, slag, varde) {
    if (slag === 'benamning') { rad.falt.namn = varde; }
    if (slag === 'id') { rad.falt.id = varde; }
    if (slag === 'plan') { rad.falt.plan = varde; }
    if (slag === 'nr') { rad.falt.nr = varde; }
    if (slag === 'rumstyp') { rad.falt.rumstyp = varde; }
    if (slag === 'nta') { rad.falt.nta = Number(varde); }
    // Installationens två: vilket rum den sitter i (rummets nyckel, beslut 76) och dess
    // installationstyp. `rum` är nyckeln och inte plan + nummer i text, så att ett rum som
    // dras till ett annat plan tar sina installationer med sig.
    if (slag === 'rum') { rad.falt.rum = varde; }
    if (slag === 'typ') { rad.falt.typ = varde; }
    // Skillnaden mot en befintlig byggnad (beslut 86). De två har inget värde att föra in i
    // `falt` – raden bär redan filens uppgifter – utan säger att planeraren **tagit ställning**
    // till att byggnaden ska ändras eller raden tas bort. Det är `DP.Plan` som utför det, och
    // märket är det den läser.
    if (slag === 'andring') { rad.godtagenAndring = true; }
    if (slag === 'bort') { rad.godtagetBort = true; }
  }

  // Godta raden: alla frågor som har ett förslag förs in och försvinner. Frågor **utan**
  // förslag står kvar, så en oplacerad rad blir inte klar av ett *Godta alla* – det systemet
  // inte vet kan planeraren inte godta sig förbi (beslut 83).
  function godta(rad) {
    (rad.fragor || []).forEach(function (f) {
      if (f.forslag != null) { tillampa(rad, f.slag, f.forslag); }
    });
    rad.fragor = (rad.fragor || []).filter(function (f) { return f.forslag == null; });
    return rad;
  }
  // Besvara en enskild fråga med planerarens eget svar (dra eller välj). Frågan försvinner,
  // oavsett om den hade ett förslag eller inte.
  function besvara(rad, slag, varde) {
    tillampa(rad, slag, varde);
    rad.fragor = (rad.fragor || []).filter(function (f) { return f.slag !== slag; });
    return rad;
  }

  // ------------------------------------------------------------------
  // Skillnaden mot en befintlig byggnad (beslut 86, berättelse 72–74)
  // ------------------------------------------------------------------
  // En fil som tas ut, ändras och läses in igen ska visa **vad inläsningen gör**: vad som är
  // nytt, vad som ändras (med före och efter) och vad som saknas i filen. Tre svar, och bara
  // det första fanns innan: nytt är ett vanligt förslag, och det byggs av `tolka*` redan.
  //
  // Jämförelsen görs fält för fält mot byggnadens rad, och varje fält har en **etikett** som
  // planeraren känner igen – "Benämning", inte `namn`. Etiketterna står här och inte i vyn av
  // samma skäl som förslagens skäl (beslut 61): två vyer ska inte kunna säga olika saker om
  // samma ändring, och texten ska gå att läsa i ett test.
  //
  // Vilka fält som jämförs är ett urval och inte alla: det som pekar ut raden (beteckningen,
  // plan + nummer, Id) kan inte ändras utan att raden blir en annan rad, och det som systemet
  // räknar fram (rummets rektangel, installationens plats) ligger inte i filen.
  var JAMFOR = {
    plan: [['namn', 'Benämning']],
    rum: [['namn', 'Benämning'], ['rumstyp', 'Rumstyp'], ['nta', 'NTA'], ['ntv', 'NTV'],
      ['bra', 'BRA'], ['bta', 'BTA'], ['temp', 'Temperaturreglerad']],
    inst: [['namn', 'Benämning'], ['typ', 'Installationstyp'], ['beteckning', 'Beteckning'],
      ['rum', 'Rum'], ['fabrikat', 'Fabrikat'], ['modell', 'Modell'],
      ['externtId', 'Externt id'], ['datum', 'Installationsdatum']]
  };

  // Värdet som det **visas** för planeraren: en rumstyp som sitt namn, ett ja/nej som ord, ett
  // tomt fält som ett streck. Jämförelsen görs på visningsvärdet och inte på det råa: en
  // rumstyp som står som 'korridor' i byggnaden och 'Korridor' i filen är samma rumstyp, och
  // en ändring som bara planeraren inte kan se är ingen ändring att ta ställning till.
  function visat(flik, falt, varde) {
    if (varde == null || varde === '') { return '–'; }
    if (falt === 'rumstyp') { return ((DP.rumstyper || {})[varde] || {}).namn || String(varde); }
    if (falt === 'typ' && flik === 'inst') {
      return ((DP.installationstyper || {})[varde] || {}).namn || String(varde);
    }
    if (falt === 'temp') { return varde ? 'Ja' : 'Nej'; }
    return String(varde);
  }

  // Skillnaden mellan byggnadens rad och filens: en lista `[{ falt, etikett, fore, efter }]`,
  // tom när de är lika. `befintlig` är fälten som de ligger i byggnadsdatan och `falt` radens;
  // namnen är desamma, eftersom radmodellens `falt` är byggd för att gå rakt in i byggnaden.
  //
  // Två sorters tomhet lämnas i fred, var och en av sitt skäl.
  //
  // Ett fält **filen** lämnar tomt är ingen ändring till tomt. Den som fyller i filen stryker
  // sällan en area med flit, och en tom cell är det vanligaste av allt – ska ett värde bort går
  // det genom byggnaden själv.
  //
  // Ett fält **byggnaden** saknar är ingen motsägelse utan en *lucka*: filen säger inte emot
  // något, den fyller i något som fattades. Den fylls i tyst. Utan den regeln hade en fil som
  // tas ut ur Kasern 1 och läses in oförändrad gett ett förslag om ändring på nästan varje rum –
  // de handritade byggnaderna har varken rumstyp eller NTA i `data/`, eftersom deras form är
  // ritad (beslut 101) – och med den är filen vägen att *ge* dem talen.
  //
  // Kvar som en fråga blir bara det planeraren faktiskt ändrat: byggnaden har ett svar och filen
  // ett annat. Svaret är därför två listor – `delar` det som frågas om, `luckor` det som fylls i.
  function skillnad(flik, befintlig, falt) {
    var delar = [], luckor = [];
    (JAMFOR[flik] || []).forEach(function (par) {
      var namn = par[0];
      var nytt = falt[namn];
      if (nytt == null || nytt === '') { return; }
      var fore = visat(flik, namn, befintlig[namn]);
      var efter = visat(flik, namn, nytt);
      if (fore === efter) { return; }
      var d = { falt: namn, etikett: par[1], fore: fore, efter: efter };
      if (befintlig[namn] == null || befintlig[namn] === '') { luckor.push(d); }
      else { delar.push(d); }
    });
    return { delar: delar, luckor: luckor };
  }

  // Frågan en ändrad rad får. Förslaget är `'ja'` och inte värdet: raden bär redan filens
  // uppgifter, och det planeraren svarar på är *om* byggnaden ska ändras. Att frågan har ett
  // förslag gör raden ett **förslag** och inte oplacerad, så *Godta alla* tar hela filen.
  function andringsfraga(vad, delar) {
    return { slag: 'andring', forslag: 'ja',
      text: vad + ' finns redan och filen säger något annat: ' +
        delar.map(function (d) {
          return d.etikett + ' ' + d.fore + ' → ' + d.efter;
        }).join(', ') + '. Godta för att ändra byggnaden.' };
  }

  // Märk raden som ett ändringsförslag, eller som en rad som redan är på plats. Delad av de
  // tre tolkningarna, så att en ändring betyder samma sak i alla tre stegen.
  function markBefintlig(rad, flik, befintlig, vad) {
    rad.fanns = true;
    // Frågorna gällde en rad som skulle läggas till. Raden finns, så det finns ingenting att
    // föreslå ett namn eller en NTA för – byggnadens egna uppgifter gäller, och filens är det
    // enda som kan ändra dem.
    rad.fragor = [];
    var s = skillnad(flik, befintlig, rad.falt);
    // Luckorna fylls i oavsett om raden också har en ändring att fråga om, och ligger på raden
    // så att den som för in den kan skriva dem i byggnaden.
    if (s.luckor.length) {
      rad.luckor = {};
      s.luckor.forEach(function (d) { rad.luckor[d.falt] = rad.falt[d.falt]; });
    }
    if (!s.delar.length) { return rad; }
    rad.andring = { fore: {}, efter: {}, delar: s.delar };
    s.delar.forEach(function (d) {
      rad.andring.fore[d.falt] = befintlig[d.falt];
      rad.andring.efter[d.falt] = rad.falt[d.falt];
    });
    rad.fragor = [andringsfraga(vad, s.delar)];
    return rad;
  }

  // Det som finns i byggnaden men **saknas i filen** (berättelse 74). Raderna byggs här och
  // inte av `tolka*`, eftersom de inte kommer ur filen: de börjar i byggnaden.
  //
  // `kom` är nycklarna filen bar, i flikens egen form – beteckningen, rumsnyckeln, id:t. En
  // flik filen **inte** bar ger inga förslag alls: en fil med bara Plan-fliken ifylld ska inte
  // föreslå att byggnadens alla rum tas bort, och det är skillnaden mellan en tom flik och en
  // flik som inte finns. Den skillnaden vet bara den som läste arket, så den kommer in som
  // `barFliken`.
  //
  // Och en flik som bar rader men **inte en enda** av byggnadens egna är ett *tillägg* och inte
  // en bild av byggnaden: planeraren kan läsa in en flik i taget (berättelse 16), och en fil med
  // ett enda nytt vindsförråd säger ingenting om de nio rum som redan finns. En fil som tagits
  // ut och ändrats bär däremot nästan allt byggnaden har, och då är det som fattas ur den
  // verkligen något som fattas.
  //
  // Regeln är en gissning, men den enda som går att förklara i en mening – och den gissar
  // **mot** att något tas bort, vilket är den säkra sidan: ett förslag som uteblir kostar
  // planeraren att ta bort raden för hand, ett förslag som uppstår i onödan kostar henne tjugo
  // rader hon måste läsa igenom.
  function bortForslag(flik, byggnad, kom, barFliken) {
    if (!barFliken) { return []; }
    var b = byggnad || {};
    var kvar = {};
    (kom || []).forEach(function (k) { kvar[String(k).toLowerCase()] = true; });
    var egna = flik === 'plan' ? (b.plan || []).map(function (p) { return p.id; })
      : flik === 'rum' ? (b.rum || []).map(function (r) { return DP.rumNyckel(r.plan, r.nr); })
        : signifikanta(b).map(function (i) { return i.id; });
    if (!egna.some(function (k) { return kvar[String(k).toLowerCase()]; })) { return []; }
    var rader = flik === 'plan' ? (b.plan || []).map(function (p) {
      return { nyckel: p.id, vad: 'Planet ' + p.id + ' ' + p.namn, rad: p,
        falt: { id: p.id, namn: p.namn } };
    }) : flik === 'rum' ? (b.rum || []).map(function (r) {
      var nyckel = DP.rumNyckel(r.plan, r.nr);
      return { nyckel: nyckel, vad: 'Rummet ' + nyckel + ' ' + r.namn, rad: r,
        falt: { plan: r.plan, nr: r.nr, namn: r.namn } };
    }) : signifikanta(b).map(function (i) {
      return { nyckel: i.id, rad: i, falt: { id: i.id, namn: i.benamning, rum: i.rum },
        vad: 'Installationen ' + (i.beteckning ? i.beteckning + ' ' : '') + i.benamning +
          ' i ' + i.rum };
    });
    var ut = [];
    rader.forEach(function (x, i) {
      if (kvar[String(x.nyckel).toLowerCase()]) { return; }
      ut.push({
        key: 'b' + flik + (i + 1), bort: true, nyckel: x.nyckel, rad: x.rad, egna: {},
        falt: x.falt,
        fragor: [{ slag: 'bort', forslag: 'ja',
          text: x.vad + ' finns i byggnaden men inte i filen. Godta för att ta bort det, ' +
            'eller låt det stå: en rad som fattas kan vara glömd lika väl som borttagen.' }]
      });
    });
    return ut;
  }

  // ------------------------------------------------------------------
  // Fliken Plan (beslut 77 och 84, berättelse 31 och 34)
  // ------------------------------------------------------------------
  // Beteckningen behålls **exakt** som den står i filen: fliken Plan är fastighetssystemets id
  // och ska kunna gå tillbaka dit (beslut 77). Systemet döper alltså inte om 'P1' till '01' –
  // det är matchningen från Rum och Installationer som är förlåtande, inte beteckningen.
  //
  // Därför har en plan-rad bara två frågor att svara på:
  //   benämning  Saknas den föreslås en ur beteckningen (berättelse 34), eftersom alla plan
  //              ska ha ett namn i listor och i modellen.
  //   id         Saknas beteckningen helt vet systemet ingenting om raden, och den blir
  //              oplacerad: utan beteckning finns ingenting för rummen att peka på.
  //
  // `befintliga` är de plan byggnaden redan har. Ett plan som redan finns är ingen nyhet och
  // tas inte in igen – planeraren kan ha läst in Plan-fliken en gång och fylla i Rum i nästa
  // omgång (berättelse 16 och 17), och filen hon tar ut då bär planen med sig.
  // Frågan ett plan utan benämning får (berättelse 34). Den byggs på ett ställe och inte två:
  // samma fråga uppstår också när planeraren ger en oplacerad rad sin beteckning, och två
  // formuleringar av samma sak glider isär så fort någon rättar den ena.
  function benamningsfraga(id) {
    return {
      slag: 'benamning',
      forslag: DP.Planlosning.benamningsforslag(id),
      text: 'Planet ' + id + ' saknar benämning – föreslås bli ' +
        DP.Planlosning.benamningsforslag(id) + '.'
    };
  }

  function tolkaPlan(rader, befintliga) {
    var finns = {};
    (befintliga || []).forEach(function (p) { finns[txt(p.id).toLowerCase()] = p; });
    var tagna = {};
    var ut = [];
    (rader || []).forEach(function (r, i) {
      var id = txt(r.id);
      var rad = {
        key: 'p' + (i + 1), rad: r, egna: r.egna || {},
        falt: { id: id, namn: txt(r.namn) }, fragor: []
      };
      // Ett plan som redan finns i byggnaden: raden är inte ny. Säger filen något annat om
      // planet blir den ett **förslag om ändring** med före och efter (beslut 86); säger den
      // detsamma är raden samma plan en gång till, och den är klar.
      if (id && finns[id.toLowerCase()]) {
        markBefintlig(rad, 'plan', finns[id.toLowerCase()], 'Planet ' + id);
        ut.push(rad);
        return;
      }
      if (!id) {
        rad.fragor.push({ slag: 'id', forslag: null,
          text: 'Raden har ingen beteckning i kolumnen Plan. Skriv en beteckning, eller ta ' +
            'bort raden ur filen: rummen pekar på beteckningen.' });
      } else if (tagna[id.toLowerCase()]) {
        // Två rader med samma beteckning är ett fel i filen, inte något att gissa om: vilken
        // av dem rummen menar vet bara den som skrev filen.
        rad.fragor.push({ slag: 'id', forslag: null,
          text: 'Beteckningen ' + id + ' står på mer än en rad i fliken Plan. Ta bort den ' +
            'ena ur filen: beteckningen pekar ut planet.' });
      } else {
        tagna[id.toLowerCase()] = true;
      }
      if (id && !rad.falt.namn) { rad.fragor.push(benamningsfraga(id)); }
      ut.push(rad);
    });
    return ut;
  }

  // ------------------------------------------------------------------
  // Fliken Rum (beslut 76, 77, 79, 80, 84, 108 och 109)
  // ------------------------------------------------------------------
  // Ett rum pekas ut med **plan + rumsnummer** (beslut 76), och båda matchas förlåtande
  // (beslut 77): den som fyller i filen skriver planet som fastighetssystemet råkar visa det,
  // och rumsnumret med eller utan inledande nollor.
  //
  // Fem frågor kan uppstå på en rumsrad, och var och en har sin egen anledning:
  //
  //   plan     Planet går inte att hitta exakt. Hittas det efter att bokstäver och inledande
  //            nollor tagits bort ("P1" → "01") är det ett **förslag**; hittas det inte alls
  //            är raden **oplacerad** och dras till rätt plan (berättelse 37).
  //   nr       Rumsnummer med tre siffror är klart; kortare föreslås utfyllt (1 → 001), så
  //            att numret ser ut som i verkligheten. Saknas numret helt vet systemet inte
  //            vilket rum raden är, och den blir oplacerad.
  //   rumstyp  Typen läses ur benämningen (beslut 80). Känns ingen igen föreslås *Övrigt
  //            rum*, som byts med ett klick. Kolumnen Rumstyp går före när den är ifylld
  //            (beslut 109): en typ planeraren själv valt ska inte gissas om.
  //   nta      NTA krävs (beslut 79) – modellen måste kunna ritas. Saknas den föreslås
  //            rumstypens standardvärde, så att en fil utan areor ändå går att läsa in.
  //   benamning Ett rum utan benämning får rumstypens namn, av samma skäl som ett plan utan
  //            benämning får ett förslag: allt ska gå att läsa i listor och modell.
  //
  // Varför plan och nummer inte slås ihop till en nyckel i filen: i fastighetssystemet är de
  // två kolumner, numret löper per plan och är inte unikt i byggnaden (beslut 76). En
  // sammanslagen kolumn hade betytt att den som fyller i filen måste skriva en nyckel hon
  // aldrig sett.

  // Planet "som det står" jämfört förlåtande: bokstäver och inledande nollor bort, källare
  // negativa. `DP.Planlosning.planTal` gör samma tolkning för ordningens skull, och att ha
  // den på ett ställe är vad som håller matchningen och ordningen eniga.
  function planMatchning(varde, plan) {
    var t = txt(varde);
    if (!t) { return { slag: 'saknas' }; }
    var exakt = (plan || []).filter(function (p) { return txt(p.id) === t; })[0];
    if (exakt) { return { slag: 'exakt', plan: exakt }; }
    var lika = (plan || []).filter(function (p) { return txt(p.id).toLowerCase() === t.toLowerCase(); })[0];
    if (lika) { return { slag: 'exakt', plan: lika }; }
    // Förlåtande: "P1", "1" och "Plan 1" är alla planet vars beteckning tolkas som 1.
    var tal = DP.Planlosning.planTal(t);
    if (tal == null) { return { slag: 'ingen' }; }
    var traffar = (plan || []).filter(function (p) { return DP.Planlosning.planTal(p.id) === tal; });
    if (traffar.length === 1) { return { slag: 'forslag', plan: traffar[0] }; }
    // Två plan som tolkas till samma tal (01 och P1 i samma byggnad) är inget att gissa om:
    // vilket raden menar vet bara den som skrev filen.
    if (traffar.length > 1) { return { slag: 'flera', traffar: traffar }; }
    return { slag: 'ingen' };
  }

  // Rumsnumret som det ska stå: tre siffror. "1" och "01" är samma rum som "001" för den som
  // fyller i filen, men numret ska se ut som i verkligheten – därför ett förslag och inte en
  // tyst utfyllnad (beslut 77).
  function nrMatchning(varde) {
    var t = txt(varde);
    if (!t) { return { slag: 'saknas' }; }
    if (/^\d{3}$/.test(t)) { return { slag: 'exakt', nr: t }; }
    if (/^\d{1,2}$/.test(t)) { return { slag: 'forslag', nr: pad3(t) }; }
    // Ett nummer som inte är siffror alls ("A12") behålls som det står: beteckningen är
    // fastighetssystemets och systemet döper inte om (beslut 77).
    return { slag: 'exakt', nr: t };
  }

  // Ett tal ur en cell eller ett fält planeraren skrivit i. Komma duger som decimaltecken –
  // det är det hon skriver, och fastighetssystemet skriver det också – men allt annat är
  // `null`: "36 m²" i en NTA-kolumn är inte ett tal, och ett tyst 36 hade varit en gissning.
  // Exporterad, så att handinmatningen i steget Rum läser ett tal på samma sätt som filen.
  function tal(v) {
    var t = txt(v).replace(/\s/g, '').replace(',', '.');
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) { return null; }
    return parseFloat(t);
  }
  // "Ja", "x", "1", "sant" är alla ja i en kolumn man kryssar i. Fältet lagras utan funktion
  // (beslut 79), men ska gå tur och retur utan att planeraren måste skriva exakt rätt ord.
  function jaNej(v) {
    var t = txt(v).toLowerCase();
    if (!t) { return null; }
    return /^(ja|j|x|1|sant|true|yes)$/.test(t);
  }

  function tolkaRum(rader, byggnad) {
    var b = byggnad || {};
    var plan = b.plan || [];
    // Upptagna rumsnycklar: de rum byggnaden redan har, plus de rader den här inläsningen
    // redan placerat. Två rum kan inte dela plan + nummer (beslut 76 och 110).
    var tagna = {};
    (b.rum || []).forEach(function (r) { tagna[DP.rumNyckel(r.plan, r.nr)] = r; });

    var ut = [];
    (rader || []).forEach(function (r, i) {
      var rad = {
        key: 'r' + (i + 1), rad: r, egna: r.egna || {},
        falt: {
          plan: '', nr: '', namn: txt(r.namn), rumstyp: '',
          nta: null, ntv: tal(r.ntv), bra: tal(r.bra), bta: tal(r.bta), temp: jaNej(r.temp)
        },
        fragor: []
      };

      // ---- Planet ----
      var pm = planMatchning(r.plan, plan);
      if (pm.slag === 'exakt') {
        rad.falt.plan = pm.plan.id;
      } else if (pm.slag === 'forslag') {
        rad.falt.plan = '';
        rad.fragor.push({ slag: 'plan', forslag: pm.plan.id,
          text: 'Planet ' + txt(r.plan) + ' tolkas som plan ' + pm.plan.id + ' (' +
            pm.plan.namn + ').' });
      } else if (pm.slag === 'saknas') {
        rad.fragor.push({ slag: 'plan', forslag: null,
          text: 'Raden saknar plan. Välj vilket plan rummet ligger på.' });
      } else if (pm.slag === 'flera') {
        rad.fragor.push({ slag: 'plan', forslag: null,
          text: 'Planet ' + txt(r.plan) + ' kan vara ' +
            pm.traffar.map(function (p) { return p.id; }).join(' eller ') +
            '. Välj vilket rummet ligger på.' });
      } else {
        rad.fragor.push({ slag: 'plan', forslag: null,
          text: 'Det finns inget plan ' + txt(r.plan) + ' i byggnaden. Välj vilket plan ' +
            'rummet ligger på, eller lägg till planet i steg 2.' });
      }

      // ---- Rumsnumret ----
      var nm = nrMatchning(r.nr);
      if (nm.slag === 'exakt') {
        rad.falt.nr = nm.nr;
      } else if (nm.slag === 'forslag') {
        rad.fragor.push({ slag: 'nr', forslag: nm.nr,
          text: 'Rumsnumret ' + txt(r.nr) + ' fylls ut till ' + nm.nr +
            ': numret har tre siffror och löper per plan.' });
      } else {
        rad.fragor.push({ slag: 'nr', forslag: null,
          text: 'Raden saknar rumsnummer. Skriv numret, eller ta bort raden ur filen: ' +
            'installationerna pekar på plan och rumsnummer.' });
      }

      // ---- Rumstypen (beslut 80 och 109) ----
      var angiven = DP.rumstypAv(r.rumstyp);
      if (angiven) {
        rad.falt.rumstyp = angiven;
      } else {
        var gissad = DP.rumstypFor(rad.falt.namn);
        if (gissad) {
          rad.falt.rumstyp = gissad;
        } else {
          rad.fragor.push({ slag: 'rumstyp', forslag: DP.rumstypOvrig,
            text: rad.falt.namn
              ? 'Benämningen ' + rad.falt.namn + ' känns inte igen som en rumstyp – ' +
                'föreslås bli ' + DP.rumstyper[DP.rumstypOvrig].namn + '. Rumstypen styr ' +
                'rummets plats i modellen och går att byta med ett klick.'
              : 'Rummet saknar benämning, så rumstypen går inte att läsa ut – föreslås bli ' +
                DP.rumstyper[DP.rumstypOvrig].namn + '.' });
        }
      }

      // ---- NTA (beslut 79, berättelse 40) ----
      // Standardvärdet beror på rumstypen, också när den själv är ett förslag: en korridor
      // är lång och ett WC litet, och ett gemensamt standardvärde hade gett en byggnad där
      // allt är lika stort.
      var nta = tal(r.nta);
      var typForNta = rad.falt.rumstyp || DP.rumstypOvrig;
      if (nta != null && nta > 0) {
        rad.falt.nta = nta;
      } else {
        var std = (DP.rumstyper[typForNta] || {}).nta || 36;
        rad.fragor.push({ slag: 'nta', forslag: std,
          text: 'Rummet saknar NTA – föreslås bli ' + std + ' m², standard för ' +
            (DP.rumstyper[typForNta] || {}).namn + '. NTA ger rummets storlek i modellen.' });
      }

      // ---- Benämningen ----
      // Rumstypens namn är förslaget: ett rum som ska stå i en lista behöver något att heta,
      // och "Korridor" är vad ett rum systemet känt igen som korridor rimligen kallas.
      if (!rad.falt.namn) {
        var typNu = rad.falt.rumstyp || DP.rumstypOvrig;
        rad.fragor.push({ slag: 'benamning', forslag: DP.rumstyper[typNu].namn,
          text: 'Rummet saknar benämning – föreslås bli ' + DP.rumstyper[typNu].namn + '.' });
      }

      // ---- Rummet finns redan, eller numret är upptaget (beslut 86 och 110) ----
      // Avgörs sist: plan och nummer kan själva vara förslag, och vilket rum raden pekar på
      // vet man först när de två är avgjorda.
      var planNu = rad.falt.plan || (fraga(rad, 'plan') || {}).forslag;
      var nrNu = rad.falt.nr || (fraga(rad, 'nr') || {}).forslag;
      if (planNu && nrNu) {
        var nyckel = DP.rumNyckel(planNu, nrNu);
        if (tagna[nyckel]) {
          // Rummet finns i byggnaden: raden är inte ny. Säger filen något annat om rummet blir
          // den ett **förslag om ändring** med före och efter (beslut 86), precis som ett plan
          // som redan finns – men bara mot ett rum som ligger i byggnaden. Krockar numret med
          // en **annan rad i samma fil** är det ingen ändring att godta: raden är ett nytt rum
          // som vill ha ett nummer som är taget, och den frågan ställs när raden blir klar
          // (beslut 110).
          if (tagna[nyckel].falt) {
            // Numret togs av en rad i samma fil. Raden får ett förslag om nästa lediga nummer,
            // av samma skäl som när planeraren drar ett rum till ett plan där numret finns
            // (beslut 110): två rum kan inte dela plan + nummer, och ingen vet vilket
            // installationerna sitter i. Utan frågan hade raden blivit klar och förts in som
            // ett andra rum med samma nyckel.
            var upptagna = Object.keys(tagna).filter(function (k) {
              return k.slice(0, k.indexOf('-')) === planNu;
            }).map(function (k) { return k.slice(k.indexOf('-') + 1); });
            var nytt = nastaLedigaNr(planNu, byggnad, upptagna);
            rad.falt.plan = planNu;
            rad.falt.nr = '';
            rad.fragor = rad.fragor.filter(function (f) {
              return f.slag !== 'plan' && f.slag !== 'nr';
            });
            rad.fragor.push({ slag: 'nr', forslag: nytt,
              text: 'Rummet ' + nyckel + ' står på mer än en rad i fliken Rum. Nästa lediga ' +
                'nummer på plan ' + planNu + ' är ' + nytt + '.' });
            tagna[DP.rumNyckel(planNu, nytt)] = rad;
          } else {
            // Planet och numret kan ha varit förslag. Är de det är rummet inte *samma* rum
            // förrän planeraren godtagit dem, så de förs in här: utan dem hade raden pekat på
            // ett rum den inte vet att den pekar på.
            rad.falt.plan = planNu;
            rad.falt.nr = nrNu;
            markBefintlig(rad, 'rum', tagna[nyckel], 'Rummet ' + nyckel);
          }
        } else {
          tagna[nyckel] = rad;
        }
      }
      ut.push(rad);
    });
    return ut;
  }

  // Nästa lediga rumsnummer på ett plan (beslut 110). Dras ett rum till ett plan där numret
  // redan finns föreslås det här numret i stället: annars hade två rum haft samma plan +
  // nummer, och ingen vet vilket installationerna sitter i.
  function nastaLedigaNr(planId, byggnad, utom) {
    var b = byggnad || {};
    var tagna = {};
    (b.rum || []).forEach(function (r) {
      if (r.plan === planId) { tagna[txt(r.nr)] = true; }
    });
    (utom || []).forEach(function (nr) { tagna[txt(nr)] = true; });
    for (var i = 1; i <= 999; i++) {
      if (!tagna[pad3(i)]) { return pad3(i); }
    }
    return pad3(999);
  }

  // Krockar radens plan + nummer med något som redan finns? Svaret är den fråga raden ska
  // få – nästa lediga nummer som förslag (beslut 110) – eller null när numret är ledigt.
  //
  // Frågan ställs **när raden blir klar** och inte vid inläsningen: planet kan självt vara
  // ett förslag, och vilket rum raden pekar på vet man först när plan och nummer är avgjorda.
  // `ocksa` är de rader som blir klara i samma steg – utan dem hade ett *Godta alla* kunnat
  // ge två rum samma nummer, eftersom ingen av dem ligger i byggnaden än.
  function nummerkrock(rad, byggnad, ocksa) {
    var nyckel = DP.rumNyckel(rad.falt.plan, rad.falt.nr);
    var krock = ((byggnad || {}).rum || [])
      .some(function (r) { return DP.rumNyckel(r.plan, r.nr) === nyckel; })
      || (ocksa || []).some(function (r) {
        return r !== rad && DP.rumNyckel(r.falt.plan, r.falt.nr) === nyckel;
      });
    if (!krock) { return null; }
    var upptagna = (ocksa || []).filter(function (r) { return r.falt.plan === rad.falt.plan; })
      .map(function (r) { return r.falt.nr; });
    var nytt = nastaLedigaNr(rad.falt.plan, byggnad, upptagna);
    return { slag: 'nr', forslag: nytt,
      text: 'Det finns redan ett rum ' + nyckel + '. Nästa lediga nummer på plan ' +
        rad.falt.plan + ' är ' + nytt + '.' };
  }

  // Ett rum som det ska ligga i byggnadsdatan. Bara klara rader förs in (berättelse 55).
  //
  // Rektangeln sätts **inte** här: var rummet ligger är planlösningens sak och räknas ur
  // byggnadstypens regel och rummens ordning (beslut 78). Rummet bär `rumstyp`, och
  // `DP.Planlosning` översätter den till den sort viewern färgar golvet efter – så att en ny
  // rumstyp aldrig kräver en ändring i det som läser rummet.
  function rumFranRad(rad) {
    var f = rad.falt;
    var ut = {
      nr: f.nr, namn: f.namn || DP.rumstyper[f.rumstyp || DP.rumstypOvrig].namn,
      plan: f.plan, rumstyp: f.rumstyp || DP.rumstypOvrig,
      typ: DP.Planlosning.kategoriFor(f.rumstyp || DP.rumstypOvrig),
      nta: f.nta
    };
    // De valfria uppgifterna skrivs bara när de finns: ett `bra: null` i byggnadsdatan hade
    // sett ut som ett svar, och areasummorna behöver kunna skilja "saknas" från "noll".
    if (f.ntv != null) { ut.ntv = f.ntv; }
    if (f.bra != null) { ut.bra = f.bra; }
    if (f.bta != null) { ut.bta = f.bta; }
    if (f.temp != null) { ut.temp = f.temp; }
    if (rad.egna && Object.keys(rad.egna).length) { ut.egna = rad.egna; }
    return ut;
  }

  // ------------------------------------------------------------------
  // Fliken Installationer (beslut 81, 86 och 109, berättelse 45–49)
  // ------------------------------------------------------------------
  // Fliken har bara **signifikanta** installationer (beslut 81): ingen ska behöva fylla i
  // hundratals vägguttag, och de övriga genereras ur rumstypen ändå.
  //
  // En installation behöver bara **plan och rumsnummer** för att hamna i rätt rum
  // (berättelse 45). Tre frågor kan uppstå, och var och en har sin egen anledning:
  //
  //   rum   Rummet går inte att hitta. Är planet tomt men rumsnumret finns på **ett enda**
  //         plan är det ett förslag; finns numret på flera plan vet systemet inte vilket
  //         raden menar, och installationen blir **oplacerad** (beslut 86 och berättelse 46).
  //   typ   Installationstypen läses ur benämningen (beslut 81). Känns ingen igen är frågan
  //         **utan förslag**: typen avgör vilka åtgärder som går att koppla, och en gissning
  //         hade gett en installation som ingen tillsyn hittar. Kolumnen Installationstyp går
  //         före när den är ifylld (beslut 109).
  //   benamning  En installation utan benämning får typens namn, av samma skäl som ett rum
  //         utan benämning: allt ska gå att läsa i listor och i informationskortet.
  //
  // Id:t är **ingen** fråga. Ett tomt Id får ett id från systemet (beslut 81 och
  // berättelse 48): den som fyller i filen har sällan fastighetssystemets id för en
  // handbrandsläckare, och en rad som stannade på det hade varit en rad hon inte kan svara på.
  //
  // Varför installationen bär rummets **nyckel** och inte plan + nummer i text: dras rummet
  // till ett annat plan byter det nyckel, och `flyttaRum` skriver om installationernas nyckel
  // i samma steg (beslut 76). En installation som bar texten "01" och "003" hade hängt kvar på
  // ett rum som inte längre finns.
  //
  // `blirRum` är de rum byggnaden får när inläsningens **rumsförslag** godtas: står det i
  // filen exakt vad rummet kommer att heta är installationen klar, och den syns när rummet gör
  // det (beslut 110 och berättelse 45). Annars hade en fil med plan, rum och installationer i
  // samma inläsning gett oplacerade installationer till varje rum som själv var ett förslag.

  // Vilka rum raden kan mena? Svaret är rummets nyckel när det är entydigt, och de träffar som
  // finns när det inte är det. Plan matchas förlåtande som för ett rum (beslut 77), och
  // rumsnumret fylls ut till tre siffror.
  //
  // `rum` är de rum som finns, `blivande` de nycklar inläsningens egna förslag ger. De hålls
  // isär i svaret (`blivande: true`), så att den som läser kan säga att installationen syns
  // när rummet gör det.
  function rumMatchning(planVarde, nrVarde, rum, plan, blivande) {
    var nrT = txt(nrVarde);
    if (!nrT) { return { slag: 'utanNr' }; }
    var nm = nrMatchning(nrT);
    var nr = nm.nr;
    var nycklar = (rum || []).map(function (r) { return DP.rumNyckel(r.plan, r.nr); });
    var alla = nycklar.concat(blivande || []);

    var planT = txt(planVarde);
    if (planT) {
      var pm = planMatchning(planT, plan);
      if (pm.slag === 'exakt' || pm.slag === 'forslag') {
        var nyckel = DP.rumNyckel(pm.plan.id, nr);
        if (alla.indexOf(nyckel) >= 0) {
          return { slag: pm.slag === 'exakt' && nm.slag === 'exakt' ? 'exakt' : 'forslag',
            rum: nyckel, plan: pm.plan,
            blivande: nycklar.indexOf(nyckel) < 0 };
        }
        return { slag: 'ingenRum', plan: pm.plan, nr: nr };
      }
      if (pm.slag === 'flera') { return { slag: 'fleraPlan', traffar: pm.traffar, nr: nr }; }
      return { slag: 'ingetPlan', plan: planT, nr: nr };
    }
    // Planet saknas: numret får avgöra, men bara när det är entydigt (berättelse 46).
    var traffar = alla.filter(function (k) { return k.slice(k.indexOf('-') + 1) === nr; });
    if (traffar.length === 1) {
      return { slag: 'forslag', rum: traffar[0], nr: nr, utanPlan: true,
        blivande: nycklar.indexOf(traffar[0]) < 0 };
    }
    if (traffar.length > 1) { return { slag: 'fleraRum', traffar: traffar, nr: nr }; }
    return { slag: 'ingenRum', nr: nr };
  }

  // Installationstypen: kolumnen går före benämningen (beslut 109), och en okänd typ är en
  // fråga **utan förslag** (beslut 81) – till skillnad från rumstypen, som får *Övrigt rum*.
  function instTypFraga(rad) {
    var namn = rad.falt.namn;
    return { slag: 'typ', forslag: null,
      text: namn
        ? 'Benämningen ' + namn + ' känns inte igen som en installationstyp. Välj typ ur ' +
          'listan: typen avgör vilka åtgärder du kan koppla till installationen.'
        : 'Raden saknar benämning, så installationstypen går inte att läsa ut. Välj typ ur ' +
          'listan: typen avgör vilka åtgärder du kan koppla till installationen.' };
  }

  function tolkaInst(rader, byggnad, blivandeRum) {
    var b = byggnad || {};
    var plan = b.plan || [];
    var rum = b.rum || [];
    // Id:n som redan är tagna: byggnadens egna och de som den här inläsningen delat ut. Ett
    // id pekar ut installationen, och två installationer kan inte dela det.
    var tagnaId = {};
    (b.installationer || []).forEach(function (i) { if (i.id) { tagnaId[txt(i.id)] = i; } });

    var ut = [];
    (rader || []).forEach(function (r, i) {
      var rad = {
        key: 'i' + (i + 1), rad: r, egna: r.egna || {},
        falt: {
          rum: '', typ: '', namn: txt(r.benamning), beteckning: txt(r.beteckning),
          fabrikat: txt(r.fabrikat), modell: txt(r.modell), id: txt(r.id),
          externtId: txt(r.externtId), datum: txt(r.datum)
        },
        fragor: []
      };

      // ---- Installationstypen (beslut 81 och 109) ----
      // Före rummet, eftersom typens namn är förslaget en saknad benämning får – och
      // benämningen är det typen läses ur när kolumnen är tom.
      var angiven = DP.installationstypAv(r.instTyp);
      if (angiven) {
        rad.falt.typ = angiven;
      } else {
        var gissad = DP.installationstypFor(rad.falt.namn);
        if (gissad) { rad.falt.typ = gissad; } else { rad.fragor.push(instTypFraga(rad)); }
      }

      // ---- Rummet (berättelse 45 och 46) ----
      var rm = rumMatchning(r.plan, r.rum, rum, plan, blivandeRum);
      if (rm.slag === 'exakt') {
        rad.falt.rum = rm.rum;
      } else if (rm.slag === 'forslag') {
        rad.fragor.push({ slag: 'rum', forslag: rm.rum, text: rumForslagText(rm, r) });
      } else if (rm.slag === 'utanNr') {
        rad.fragor.push({ slag: 'rum', forslag: null,
          text: 'Raden saknar rumsnummer. Välj vilket rum installationen sitter i: en ' +
            'installation sitter i ett rum, och rummet pekas ut med plan och rumsnummer.' });
      } else if (rm.slag === 'fleraRum') {
        // Numret finns på flera plan och planet är tomt: systemet gissar bara när det är
        // säkert (berättelse 46).
        rad.fragor.push({ slag: 'rum', forslag: null,
          text: 'Rumsnummer ' + rm.nr + ' finns på flera plan (' + rm.traffar.join(', ') +
            ') och raden saknar plan. Välj vilket rum installationen sitter i.' });
      } else if (rm.slag === 'fleraPlan') {
        rad.fragor.push({ slag: 'rum', forslag: null,
          text: 'Planet ' + txt(r.plan) + ' kan vara ' +
            rm.traffar.map(function (p) { return p.id; }).join(' eller ') +
            '. Välj vilket rum installationen sitter i.' });
      } else if (rm.slag === 'ingetPlan') {
        rad.fragor.push({ slag: 'rum', forslag: null,
          text: 'Det finns inget plan ' + rm.plan + ' i byggnaden. Välj vilket rum ' +
            'installationen sitter i, eller fyll i planet i steg 2 och rummet i steg 3 först.' });
      } else {
        rad.fragor.push({ slag: 'rum', forslag: null,
          text: 'Det finns inget rum ' +
            (rm.plan ? DP.rumNyckel(rm.plan.id, rm.nr) : 'med nummer ' + rm.nr) +
            ' i byggnaden. Välj vilket rum installationen sitter i, eller läs in rummet i ' +
            'steg 3 först.' });
      }

      // ---- Benämningen ----
      // Typens namn är förslaget, som rumstypens namn är det för ett rum utan benämning.
      // Finns ingen typ heller har raden inget att heta, och då är det typfrågan som ska
      // besvaras först – benämningen följer av den.
      if (!rad.falt.namn && rad.falt.typ) {
        var tnamn = (DP.installationstyper[rad.falt.typ] || {}).namn || rad.falt.typ;
        rad.fragor.push({ slag: 'benamning', forslag: tnamn,
          text: 'Installationen saknar benämning – föreslås bli ' + tnamn + '.' });
      }

      // ---- Id:t (beslut 81, berättelse 48) ----
      // Ett tomt Id får ett id från systemet, och ett Id som redan finns i byggnaden betyder
      // att raden är **samma** installation – den är inte ny. Säger filen något annat om den
      // blir raden ett **förslag om ändring** med före och efter (beslut 86). En flytt till ett
      // annat rum är en sådan ändring: id:t består, så det är samma installation som bytt rum,
      // och kopplingarna följer med (beslut 87).
      // Står samma Id på två rader i filen är det ett fel i filen och inget att gissa om, som
      // samma planbeteckning två gånger: vilken av dem som är installationen vet bara den som
      // skrev filen.
      if (rad.falt.id && tagnaId[rad.falt.id] && tagnaId[rad.falt.id].falt) {
        rad.fragor = [{ slag: 'id', forslag: null,
          text: 'Id ' + rad.falt.id + ' står på mer än en rad i fliken Installationer. Ta ' +
            'bort den ena ur filen: id:t pekar ut installationen.' }];
      } else if (rad.falt.id && tagnaId[rad.falt.id]) {
        var fanns = tagnaId[rad.falt.id];
        // Rummet kan ha varit ett förslag. Är det det är det förslaget som ska jämföras mot
        // byggnadens rum – annars hade en flytt via fil sett ut som ingen ändring alls.
        var rumFraga = fraga(rad, 'rum');
        if (rumFraga && rumFraga.forslag) { rad.falt.rum = rumFraga.forslag; }
        // Filens egna fält jämförs mot byggnadens, inte mot de namn radmodellen använder: en
        // installation bär `benamning` i byggnaden och `namn` i raden.
        markBefintlig(rad, 'inst', {
          namn: fanns.benamning, typ: fanns.typ, beteckning: fanns.beteckning,
          rum: fanns.rum, fabrikat: fanns.fabrikat, modell: fanns.modell,
          externtId: fanns.externtId, datum: fanns.datum
        }, 'Installationen ' + (fanns.beteckning ? fanns.beteckning + ' ' : '') +
          fanns.benamning);
      } else if (!rad.falt.id) {
        rad.falt.id = nyttInstId(tagnaId);
        rad.idFranSystemet = true;
      }
      if (rad.falt.id) { tagnaId[rad.falt.id] = rad; }
      ut.push(rad);
    });
    return ut;
  }

  // Skälet ett rumsförslag får, i klartext (berättelse 24). Tre olika saker kan ha gjorts
  // förlåtande, och planeraren ska kunna läsa vilket: planet tolkades, numret fylldes ut,
  // eller planet saknades och numret var entydigt.
  function rumForslagText(rm, r) {
    var ut;
    if (rm.utanPlan) {
      ut = 'Raden saknar plan, men rumsnummer ' + rm.nr + ' finns bara på ett plan: ' +
        rm.rum + '.';
    } else if (txt(r.plan) !== rm.plan.id) {
      ut = 'Planet ' + txt(r.plan) + ' tolkas som plan ' + rm.plan.id + ' (' + rm.plan.namn +
        '), så installationen sitter i ' + rm.rum + '.';
    } else {
      ut = 'Rumsnumret ' + txt(r.rum) + ' fylls ut: installationen sitter i ' + rm.rum + '.';
    }
    // Rummet kan själv vara ett förslag i samma inläsning. Då är installationen klar först
    // när rummet är det, och planeraren ska veta varför den inte syns i modellen ännu.
    if (rm.blivande) {
      ut += ' Rummet är ett förslag i steg 3 – installationen syns när rummet gör det.';
    }
    return ut;
  }

  // Ett id från systemet (beslut 81). Åtta siffror som de handritade byggnadernas, och
  // räknade uppåt från 90000001 så att de aldrig krockar med dem som står i `data/` – de
  // id:na är fastighetssystemets, och ett systemgivet ska gå att skilja från dem.
  //
  // `tagna` är en karta över de id som är upptagna, och innehåller också de id den här
  // inläsningen redan delat ut: utan dem hade två rader i samma fil fått samma id.
  var ID_START = 90000001;
  function nyttInstId(tagna) {
    for (var n = ID_START; n < ID_START + 100000; n++) {
      if (!tagna[String(n)]) { return String(n); }
    }
    return String(ID_START);
  }

  // En installation som den ska ligga i byggnadsdatan. Bara klara rader förs in
  // (berättelse 55).
  //
  // `x`, `z` och `h` sätts **inte** här: var installationen sitter i rummet är planlösningens
  // sak och räknas ur rummets rektangel och typens montage (beslut 78), precis som rummets
  // plats räknas ur regeln. Formen är räknad och ska inte ligga i tillståndet (beslut 71).
  function instFranRad(rad) {
    var f = rad.falt;
    var typNamn = (DP.installationstyper[f.typ] || {}).namn || f.typ;
    var ut = {
      id: f.id, typ: f.typ, rum: f.rum,
      benamning: f.namn || typNamn,
      beteckning: f.beteckning || '', signifikant: true
    };
    // De valfria uppgifterna skrivs bara när de finns, av samma skäl som för ett rum: ett
    // tomt fält som ser ut som ett svar är värre än inget fält.
    if (f.fabrikat) { ut.fabrikat = f.fabrikat; }
    if (f.modell) { ut.modell = f.modell; }
    if (f.externtId) { ut.externtId = f.externtId; }
    // Installationsdatumet skiljer versionerna av en installation åt (beslut 95 och
    // berättelse 49). Det är upplysning och påverkar inte årets rutintillfällen.
    if (f.datum) { ut.datum = f.datum; }
    if (rad.egna && Object.keys(rad.egna).length) { ut.egna = rad.egna; }
    return ut;
  }

  // Raderna uppdelade i de tre grupperna (beslut 83). Ordningen inom varje grupp är filens:
  // planeraren läser listan vid sidan av sin egen fil, och en omsortering hade gjort det
  // svårare att hitta raden.
  function grupper(rader) {
    var ut = { klar: [], forslag: [], oplacerad: [] };
    (rader || []).forEach(function (r) { ut[status(r)].push(r); });
    return ut;
  }
  // Antal per grupp, det steglistan visar hopfällt (berättelse 6).
  function raknat(rader) {
    var g = grupper(rader);
    return { klar: g.klar.length, forslag: g.forslag.length, oplacerad: g.oplacerad.length };
  }

  // En plan-rad som den ska ligga i byggnadsdatan. Bara klara rader förs in: modellen visar
  // aldrig en gissning (berättelse 55).
  function planFranRad(rad) {
    var ut = { id: rad.falt.id, namn: rad.falt.namn || DP.Planlosning.benamningsforslag(rad.falt.id) };
    // Egna fält följer med in i byggnaden och därmed ut igen när filen tas ut (beslut 89).
    if (rad.egna && Object.keys(rad.egna).length) { ut.egna = rad.egna; }
    return ut;
  }

  // ------------------------------------------------------------------
  // Ta ut filen (berättelse 14 och 17)
  // ------------------------------------------------------------------
  // Arket som ska skrivas: en flik per sort, med rubrikraden och det som redan är inläst.
  // En tom byggnad ger tre flikar med bara rubriker – det är den tomma inläsningsfilen.
  //
  // Egna kolumner läggs sist, efter de kända: en kolumn systemet inte förstår ska följa med ut
  // igen (beslut 89), men den ska inte flytta de kolumner den som fyller i känner igen.
  function tillArk(byggnad) {
    var b = byggnad || {};
    return FLIKAR.map(function (flik) {
      var rader = flik === 'plan' ? (b.plan || []) : flik === 'rum' ? (b.rum || []) : signifikanta(b);
      var egnaNamn = [];
      rader.forEach(function (r) {
        Object.keys(r.egna || {}).forEach(function (n) {
          if (egnaNamn.indexOf(n) < 0) { egnaNamn.push(n); }
        });
      });
      var rubriker = KOLUMNER[flik].map(function (k) { return k[0]; }).concat(egnaNamn);
      var ut = [rubriker];
      rader.forEach(function (r) {
        var vardet = varden(flik, r);
        ut.push(KOLUMNER[flik].map(function (k) { return vardet[k[1]] == null ? '' : vardet[k[1]]; })
          .concat(egnaNamn.map(function (n) { return (r.egna || {})[n] || ''; })));
      });
      return { namn: FLIKNAMN[flik], rader: ut };
    });
  }
  // Fliken Installationer har bara signifikanta installationer (beslut 81): ingen ska behöva
  // fylla i hundratals vägguttag, och de genereras ur rumstypen ändå.
  function signifikanta(b) {
    return (b.installationer || []).filter(function (i) { return i.signifikant; });
  }
  // Värdena en rad i byggnadsdatan ger i filen. Rum och Installationer är med redan nu, så att
  // filen tas ut komplett från första dagen (berättelse 14) – deras *inläsning* byggs senare.
  function varden(flik, r) {
    if (flik === 'plan') { return { id: r.id, namn: r.namn }; }
    if (flik === 'rum') {
      // Rumstypen tas ut som det **namn** planeraren ser och inte som id:t: filen läses av
      // en människa, och "WC/Dusch" är vad hon känner igen. `DP.rumstypAv` tar emot båda vid
      // inläsningen, så kolumnen går tur och retur (beslut 109).
      var typ = (DP.rumstyper || {})[r.rumstyp];
      return { plan: r.plan, nr: r.nr, namn: r.namn, rumstyp: typ ? typ.namn : r.rumstyp,
        nta: r.nta, ntv: r.ntv, bra: r.bra, bta: r.bta,
        temp: r.temp == null ? '' : (r.temp ? 'Ja' : 'Nej') };
    }
    // Installationen bär rummets **nyckel** (beslut 76), och filen har två kolumner: Plan och
    // Rum. Nyckeln delas därför upp på väg ut, så att den som fyller i filen möter samma två
    // kolumner hon möter i fastighetssystemet och inte en nyckel hon aldrig sett.
    var delar = txt(r.rum).split('-');
    var nr = delar.length > 1 ? delar.pop() : '';
    var planId = delar.join('-');
    // Installationstypen tas ut som det **namn** planeraren ser och inte som id:t, precis som
    // rumstypen: filen läses av en människa, och "Handbrandsläckare" är vad hon känner igen.
    // `DP.installationstypAv` tar emot båda vid inläsningen, så kolumnen går tur och retur
    // (beslut 109).
    var typ = (DP.installationstyper || {})[r.typ];
    return { plan: planId, rum: nr, benamning: r.benamning, instTyp: typ ? typ.namn : r.typ,
      beteckning: r.beteckning, fabrikat: r.fabrikat, modell: r.modell, id: r.id,
      externtId: r.externtId, datum: r.datum };
  }

  DP.Inlasning = {
    KOLUMNER: KOLUMNER, FLIKNAMN: FLIKNAMN,
    vilkenFlik: vilkenFlik, hittaRubrikrad: hittaRubrikrad, lasArk: lasArk,
    status: status, fraga: fraga, godta: godta, besvara: besvara,
    tolkaPlan: tolkaPlan, benamningsfraga: benamningsfraga,
    tolkaRum: tolkaRum, rumFranRad: rumFranRad, nastaLedigaNr: nastaLedigaNr,
    nummerkrock: nummerkrock,
    tolkaInst: tolkaInst, instFranRad: instFranRad, nyttInstId: nyttInstId,
    rumMatchning: rumMatchning, instTypFraga: instTypFraga,
    planMatchning: planMatchning, nrMatchning: nrMatchning,
    grupper: grupper, raknat: raknat, planFranRad: planFranRad,
    skillnad: skillnad, bortForslag: bortForslag, JAMFOR: JAMFOR,
    tillArk: tillArk, pad3: pad3, tal: tal
  };
})();
