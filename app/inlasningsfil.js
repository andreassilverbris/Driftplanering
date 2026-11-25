/*
 * Inläsningsfilen: sömmen mot Excel-filen.
 *
 * Här – och bara här – känner systemet till att inläsningsfilen är en .xlsx och att den läses
 * med SheetJS. Allt annat arbetar med ett **ark**: en lista med flikar som var och en är en
 * lista med rader av celler.
 *
 *   { namn: 'Plan', rader: [['Plan', 'Benämning'], ['01', 'Entréplan']] }
 *
 * Att sömmen är så tunn är avsiktligt. `DP.Inlasning` tolkar ark och går därför att pröva i ett
 * test utan att en fil finns (beslut 61), och byter filformatet en dag är det den här filen som
 * byts och ingen annan.
 *
 * Två uppgifter:
 *
 *   `las(blob)`        Läser en fil planeraren valt → ark. Svarar genom ett anrop, eftersom
 *                      filen läses i bakgrunden av webbläsaren.
 *   `taUt(ark, namn)`  Skriver ett ark till en .xlsx och laddar ner den.
 *
 * Båda fungerar från `file://` utan server och utan nätverk, som resten av verktyget.
 */
(function () {
  'use strict';
  var DP = window.DP;

  // Finns SheetJS? Sidan ska fungera även om skriptet uteblivit – då är det bättre att säga
  // det i klartext än att en knapp inte gör någonting.
  function tillganglig() { return typeof window.XLSX !== 'undefined'; }

  // ------------------------------------------------------------------
  // Läs en fil → ark
  // ------------------------------------------------------------------
  // Varje blad blir en lista med rader. `header: 1` ger raderna som de står, utan att SheetJS
  // tolkar den första som rubriker: rubrikraden kan ligga en bit ner i en fil som gått via
  // Numbers, och det är `DP.Inlasning` som hittar den (berättelse 19).
  //
  // `raw: false` gör varje cell till text. Det är med flit: beteckningen 01 är ett **id** och
  // inte ett tal, och ett tal hade skrivits som "1" och tappat nollan som fastighetssystemet
  // har (beslut 77). Talen i Rum-fliken tolkas där de används i stället.
  function arkUrArbetsbok(bok) {
    return bok.SheetNames.map(function (namn) {
      var blad = bok.Sheets[namn];
      return {
        namn: namn,
        rader: window.XLSX.utils.sheet_to_json(blad, { header: 1, raw: false, defval: '' })
      };
    });
  }

  // Läser filen planeraren valt i filväljaren. Svaret kommer genom `nar(ark)`; gick det inte
  // att läsa kommer `fel(text)` med skälet i klartext, så att vyn kan visa det utan att veta
  // något om varför en .xlsx kan vara trasig.
  function las(blob, nar, fel) {
    if (!tillganglig()) {
      fel('Excel-biblioteket kunde inte laddas, så filen går inte att läsa.');
      return;
    }
    var lasare = new FileReader();
    lasare.onload = function () {
      var ark;
      try {
        ark = arkUrArbetsbok(window.XLSX.read(lasare.result, { type: 'array' }));
      } catch (e) {
        // En fil som inte är en kalkylfil alls, eller en som är trasig. Skälet från SheetJS är
        // på engelska och säger inget planeraren kan använda, så det blir ett eget besked.
        fel('Filen gick inte att läsa som en Excel-fil. Är det inläsningsfilen du valde?');
        return;
      }
      nar(ark);
    };
    lasare.onerror = function () { fel('Filen gick inte att läsa från disken.'); };
    lasare.readAsArrayBuffer(blob);
  }

  // ------------------------------------------------------------------
  // Ta ut filen (berättelse 14 och 17)
  // ------------------------------------------------------------------
  // Arket skrivs till en .xlsx och laddas ner. Kolumnbredden sätts ur innehållet: en fil där
  // *Temperaturreglerad* är avhuggen till "Tempe…" är den som ska fyllas i av någon annan
  // (berättelse 15), och den ska gå att läsa utan att dra i kolumnerna först.
  function taUt(ark, filnamn) {
    if (!tillganglig()) { return false; }
    var bok = window.XLSX.utils.book_new();
    ark.forEach(function (flik) {
      var blad = window.XLSX.utils.aoa_to_sheet(flik.rader);
      blad['!cols'] = bredder(flik.rader);
      window.XLSX.utils.book_append_sheet(bok, blad, flik.namn);
    });
    window.XLSX.writeFile(bok, filnamn);
    return true;
  }

  function bredder(rader) {
    var ut = [];
    (rader || []).forEach(function (rad) {
      rad.forEach(function (cell, i) {
        var l = String(cell == null ? '' : cell).length;
        ut[i] = Math.max(ut[i] || 8, Math.min(28, l + 2));
      });
    });
    return ut.map(function (w) { return { wch: w }; });
  }

  // Filnamnet: byggnadens namn, så att en planerare som skickat iväg tre filer ser vilken som
  // är vilken (berättelse 15). Tecken som inte hör i ett filnamn byts mot bindestreck.
  function filnamnFor(byggnadsnamn) {
    var n = String(byggnadsnamn || 'byggnad').trim().replace(/[^\wåäöÅÄÖ -]/g, '').replace(/\s+/g, '-');
    return 'inlasningsfil-' + (n || 'byggnad') + '.xlsx';
  }

  DP.Inlasningsfil = {
    tillganglig: tillganglig, las: las, taUt: taUt, filnamnFor: filnamnFor
  };
})();
