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
 * Flikarna **Plan** och **Rum** tolkas. Installationer har sina kolumner med i tabellen nedan,
 * eftersom filen tas ut med alla tre flikarna från första dagen (berättelse 14) och
 * flikigenkänningen måste kunna skilja dem åt – men dess rader tolkas i sin egen biljett.
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
    var ut = { plan: [], rum: [], inst: [], ignorerade: [],
      egnaKolumner: { plan: [], rum: [], inst: [] } };
    (ark || []).forEach(function (blad) {
      var rader = blad.rader || [];
      var rubrikRad = hittaRubrikrad(rader);
      if (rubrikRad < 0) { ut.ignorerade.push(blad.namn); return; }
      var rubriker = rader[rubrikRad].map(txt);
      var flik = vilkenFlik(rubriker);
      if (!flik) { ut.ignorerade.push(blad.namn); return; }
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
      // Ett plan som redan finns i byggnaden: raden är inte ny, och den ska inte bli ett
      // förslag om att lägga till något som är där. (Att **ändra** ett befintligt plan via fil
      // hör till beslut 86 och byggs i en senare biljett i spåret.)
      if (id && finns[id.toLowerCase()]) {
        rad.fanns = true;
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
          // Rummet finns i byggnaden: raden är inte ny. Att **ändra** ett befintligt rum via
          // fil hör till beslut 86 och byggs i biljetten om Ändra byggnad – tills dess är
          // raden ett rum som redan är på plats, precis som ett plan som redan finns.
          rad.fanns = true;
          rad.fragor = [];
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
    return { plan: r.plan, rum: r.rum, benamning: r.namn, instTyp: r.typ,
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
    planMatchning: planMatchning, nrMatchning: nrMatchning,
    grupper: grupper, raknat: raknat, planFranRad: planFranRad,
    tillArk: tillArk, pad3: pad3
  };
})();
