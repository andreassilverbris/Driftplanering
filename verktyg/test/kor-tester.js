/*
 * Webbläsartester (Playwright + Chromium) för hela verktyget.
 *
 *   node verktyg/test/kor-tester.js [mapp-för-skärmdumpar]
 *
 * Öppnar index.html och flerbyggnad.html direkt från disk, klickar igenom flödena och tar
 * skärmdumpar (standard: <tmp>/driftplanering-test). Avslutas med felkod om något test misslyckas
 * eller om sidan loggar JavaScript-fel.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');

const ROT = path.resolve(__dirname, '..', '..');
const URL_INDEX = 'file://' + path.join(ROT, 'index.html');
const URL_FLER = 'file://' + path.join(ROT, 'flerbyggnad.html');
const UT = process.argv[2] || path.join(os.tmpdir(), 'driftplanering-test');
fs.mkdirSync(UT, { recursive: true });

// Texten för varje kontroll som fallit, så att sammanfattningen sist kan lista dem.
// Utan den syns ett fel bara i stunden, och en körning som lästs med `tail` säger inte vad som föll.
const fel = [];
function kontroll(villkor, text) {
  console.log((villkor ? '  OK   ' : '  FEL  ') + text);
  if (!villkor) { fel.push(text); }
}

// Väntar på att ett villkor i sidan ska bli sant, i stället för en fast väntetid. Villkoret
// läses om med jämna mellanrum, så en långsam maskin ger inget falskt fel – den tar bara längre tid.
//
// Tiden tar slut utan att kasta: den kontroll som följer får läsa tillståndet och falla med sin
// egen text. Ett kastat fel hade avbrutit hela sviten och gömt vad som egentligen uteblev,
// så väntan loggar i stället en rad och låter testet gå vidare.
const VANTETAK = 30000;
async function vanta(page, villkor, beskrivning, arg) {
  try {
    await page.waitForFunction(villkor, arg, { timeout: VANTETAK, polling: 100 });
  } catch (e) {
    console.log('  (väntan på "' + beskrivning + '" gav upp efter ' + VANTETAK / 1000 + ' s)');
  }
}

// Fast paus som låter brickorna flyga färdigt före en skärmdump. Den väntar inte på något
// villkor, så ingen kontroll får bero på den – bara bilderna.
const rorelsePaus = page => page.waitForTimeout(1200);

// Väntar på att ett steg ska ha landat i historiken, utan att säga något om vad steget gjorde.
// Det är förutsättningen kontrollerna behöver: de äger själva villkoret om *vad* som ändrades,
// och kan därför fortfarande falla på ett verkligt fel i stället för att upprepa väntan.
async function stegKlart(page, fore, beskrivning) {
  await vanta(page, n => DP.Plan.historik().lista.length > n, 'steget "' + beskrivning + '"', fore);
}
const historiklangd = page => page.evaluate(() => DP.Plan.historik().lista.length);

// Klickar Ångra och väntar på att historiken backat ett steg. Ångra ändrar bara positionen i
// historiken, inte dess längd, så det är pos som säger att klicket gått igenom.
async function angra(page) {
  const fore = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('.spelare button[title^="Ångra"]').click();
  await vanta(page, n => DP.Plan.historik().pos < n, 'ångra från position ' + fore, fore);
}

// Klickar Gör om och väntar på att historiken gått framåt ett steg. Som ångra: positionen,
// inte längden, är det som säger att klicket gått igenom.
async function gorOm(page) {
  const fore = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('.spelare button[title^="Gör om"]').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'gör om från position ' + fore, fore);
}

async function nySida(browser, url, valjByggnad) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1090 } });
  page.fel = [];
  page.on('pageerror', e => page.fel.push(e.message));
  page.on('console', m => { if (m.type() === 'error') { page.fel.push(m.text()); } });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  if (url === URL_INDEX) {
    // Skripten körs synkront vid laddning, så appen är uppe när namnrymden och den första
    // ritningen finns. Tidsaxelns veckorad ritas sist i flode.js, och alltid.
    await vanta(page, () => !!(window.DP && DP.Flode && DP.Plan && DP.viewer)
      && !!document.querySelector('#flode .steg-kort') && !!document.querySelector('#tidsaxel .ta-vecka'),
      'appen ritad');
  }
  if (valjByggnad) { await byggnadsval(page, valjByggnad); }
  return page;
}

// Byter byggnad och väntar på att bytet gått igenom. prenumereraByte-lyssnarna bygger om
// 3D-vyn, trädet, flödet, tidsaxeln och telefonerna synkront, så aktivId är villkoret.
async function byggnadsval(page, id) {
  await page.selectOption('#byggnad', id);
  await vanta(page, bid => DP.Plan.aktivId() === bid, 'byggnadsbyte till ' + id, id);
}
const bild = (page, namn) => page.screenshot({ path: path.join(UT, namn + '.png') });

// Steg 1–4 med Byggnad invändigt och Brandskydd varje månad
async function grundplanering(page) {
  const f = page.locator('#flode');
  await f.locator('button.val', { hasText: 'Varje månad' }).click();
  await f.locator('button', { hasText: 'Nästa' }).click();
  await f.locator('button.val', { hasText: 'Byggnad invändigt' }).click();
  await f.locator('button.val', { hasText: 'Brandskydd' }).click();
  await f.locator('button', { hasText: 'Nästa' }).click();
  await f.locator('.rondfrekvens', { hasText: 'Brandskydd' }).locator('button', { hasText: 'Samma som besöken' }).click();
  await f.locator('button', { hasText: 'Nästa' }).click();
  await f.locator('button', { hasText: 'Nästa' }).click();
  return f;
}

async function testPlaneringsflode(browser) {
  console.log('Etapp 2 – planeringsflödet (Hangar)');
  const page = await nySida(browser, URL_INDEX, 'hangar');
  const f = await grundplanering(page);
  await f.locator('.atgrad', { hasText: 'Kontroll handbrandsläckare' }).locator('button', { hasText: 'Lägg till' }).click();
  await f.locator('.guide button', { hasText: 'Ja' }).click();
  await f.locator('.guide button', { hasText: 'Lägg till' }).click();
  // Kopplingarna finns direkt; telefonvyerna öppnas först när brickorna landat.
  await vanta(page, () => DP.Plan.state().kopplingar.length > 0 && document.querySelectorAll('.telefon').length >= 2,
    'kopplingar och två telefonvyer');
  const n = await page.evaluate(() => DP.Plan.state().kopplingar.length);
  kontroll(n === 25, '25 handbrandsläckare kopplade (' + n + ')');
  kontroll(await page.locator('.telefon').count() === 2, 'två telefonvyer öppnas');
  await rorelsePaus(page);
  await bild(page, 'etapp2-tillagd');
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.state().kopplingar.length) === 0, 'ångra tar bort kopplingarna');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

async function testAtgardstexter(browser) {
  console.log('Etapp 3 – åtgärdstexter (Hangar)');
  const page = await nySida(browser, URL_INDEX, 'hangar');
  const f = await grundplanering(page);
  await f.locator('.atgrad', { hasText: 'Kontroll handbrandsläckare' }).locator('button', { hasText: 'Lägg till' }).click();
  await f.locator('.guide button', { hasText: 'Ja' }).click();
  await f.locator('.guide button', { hasText: 'Lägg till' }).click();
  // Telefonerna öppnas när brickorna landat, och nästa steg klickar i den första.
  await vanta(page, () => document.querySelectorAll('.telefon').length >= 2, 'två telefonvyer');
  // Telefonen: bara detta rutintillfälle
  const tel = page.locator('.telefon').first();
  await tel.locator('.tf-rad').first().click();
  await tel.locator('button', { hasText: 'Ändra åtgärdstext' }).click();
  const ta = tel.locator('textarea');
  await ta.fill((await ta.inputValue()) + '\nTestpunkt i rutintillfället');
  await tel.locator('.redigerare button', { hasText: 'Spara' }).click();
  const foreTillfalle = await historiklangd(page);
  await page.locator('.dlg button', { hasText: 'Bara i' }).click();
  await stegKlart(page, foreTillfalle, 'text bara i rutintillfället');
  kontroll(await page.evaluate(() => Object.keys(DP.Plan.state().tillfalleTexter).length) === 1, 'avvikande text på rutintillfällesnivå');
  kontroll(await page.locator('.rt-mark .avvik-symbol').count() === 1, 'symbolen ✎ på ett rutintillfälle i tidsaxeln');
  // Informationskortet: installationsnivå med konflikt
  await page.evaluate(() => { DP.ui.visaInstKort(DP.Plan.instIndex['00000030']); return 1; });
  await page.locator('#infokort button', { hasText: 'Ändra åtgärdstext för HB01' }).click();
  const ta2 = page.locator('#infokort textarea');
  await ta2.fill((await ta2.inputValue()).replace('Att plomberingen är intakt', 'Att plomberingen är intakt och märkt'));
  await page.locator('#infokort .redigerare button', { hasText: 'Spara' }).click();
  await page.locator('.dlg button', { hasText: 'Jämför åtgärdstexter' }).click();
  await page.locator('.jmf-kol').first().waitFor();
  await bild(page, 'etapp3-jamfor');
  kontroll(await page.locator('.jmf-kol').count() === 3, 'jämförelsen visar tre versioner');
  await page.locator('.dlg button', { hasText: 'Stäng' }).last().click();
  const foreInst = await historiklangd(page);
  await page.locator('.dlg button', { hasText: 'Spara' }).click();
  await stegKlart(page, foreInst, 'text på installationsnivå');
  kontroll(await page.evaluate(() => !!DP.Plan.state().instTexter['A010|00000030']), 'avvikande text på installationsnivå');
  // Bruttolistan: standardtext
  const rad = f.locator('.atgrad', { hasText: 'Kontroll handbrandsläckare' });
  await rad.locator('.atg-namn').click();
  await rad.locator('button', { hasText: 'Ändra åtgärdstext' }).click();
  const ta3 = rad.locator('textarea');
  await ta3.fill((await ta3.inputValue()) + '\nNy standardpunkt');
  await rad.locator('.redigerare button', { hasText: 'Spara' }).click();
  const foreStandard = await historiklangd(page);
  await page.locator('.dlg button', { hasText: 'Ja, uppdatera' }).click();
  await stegKlart(page, foreStandard, 'ändrad standardtext');
  kontroll(await page.evaluate(() => !!DP.Plan.state().standardTexter.A010), 'ändrad standardtext');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

async function testByggnaderOchKopiering(browser) {
  console.log('Etapp 4 – byggnader, standardplanering och kopiering');
  const page = await nySida(browser, URL_INDEX);
  kontroll(await page.evaluate(() => DP.Plan.aktivId()) === 'garage', 'garaget är startbyggnad');
  const f = page.locator('#flode');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.state().kopplingar.length > 0, 'standardplaneringens kopplingar i garaget');
  await rorelsePaus(page);
  await bild(page, 'etapp4-garage');
  kontroll(await page.evaluate(() => {
    const s = DP.Plan.state(), sig = DP.Plan.byggnad().installationer.filter(i => i.signifikant);
    return sig.length === 3 && sig.every(i => s.kopplingar.some(k => k.inst === i.id));
  }), 'garaget: alla 3 signifikanta (HB01, PORT01, PORT02) får åtgärd');

  await byggnadsval(page, 'kasern1');
  await bild(page, 'etapp4-kasern');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.state().kopplingar.length > 0, 'standardplaneringens kopplingar i Kasern 1');

  await byggnadsval(page, 'kasern2');
  await f.locator('button', { hasText: 'Kopiera från Kasern 1' }).click();
  const text = await page.locator('.dlg').innerText();
  kontroll(text.includes('TM02') && text.includes('HISS01'), 'kopieringsdialogen redovisar TM02 och HISS01');
  await page.locator('.dlg button', { hasText: 'Kopiera' }).first().click();
  await vanta(page, () => DP.Plan.state().kopplingar.length > 30, 'de kopierade kopplingarna i Kasern 2');
  await rorelsePaus(page);
  await bild(page, 'etapp4-kopierad');
  kontroll(await page.evaluate(() => DP.Plan.state().kopplingar.length > 30), 'Kasern 2 har fått kopplingarna');

  // Två ångra: det första tar bort kopieringen i Kasern 2, det andra växlar till Kasern 1
  // och tar bort dess standardplanering. Varje klick måste ha gått igenom innan nästa.
  await angra(page);
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.aktivId() === 'kasern1' && DP.Plan.state().kopplingar.length === 0),
    'två ångra växlar till Kasern 1 och tar bort dess standardplanering');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5, förarbete: planeringen räknar för valfri byggnad och kan ändra flera byggnader i ett steg
async function testPlaneringFlerByggnader(browser) {
  console.log('Etapp 5 – förarbete i planeringen');
  const page = await nySida(browser, URL_INDEX);
  const f = page.locator('#flode');

  // Halvfärdigt läge: bara steg 1 besvarat. Det är läget där Balansering ska kunna se
  // att byggnaden inte är klar, och det stegstatusen måste svara likadant för.
  await f.locator('button.val', { hasText: 'Varje månad' }).click();
  await vanta(page, () => document.querySelectorAll('#flode .steg-kort.klar').length === 1, 'en bock i flödet');
  const halv = await page.evaluate(() => DP.Plan.stegStatus(DP.Plan.stateFor('garage'), 'garage'));
  kontroll(await f.locator('.steg-kort.klar').count() === 1 && halv[1] && !halv[2] && !halv[3] && !halv[4],
    'stegstatus i ett halvfärdigt läge: bara steg 1 klart');
  await angra(page);

  // Standardplanering i Garage och Kasern 2, med Garage aktivt på slutet
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stateFor('garage').kopplingar.length > 0, 'standardplaneringen i garaget');
  await byggnadsval(page, 'kasern2');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  // Väntan ligger före ögonblicksbilden: kontrollen nedan jämför stegstatusen med flödets bockar,
  // och de två måste läsas ur samma läge för att jämförelsen ska betyda något.
  await vanta(page, () => DP.Plan.stateFor('kasern2').kopplingar.length > 0
    && document.querySelectorAll('#flode .steg-kort.klar').length === 6, 'standardplaneringen och sex bockar i Kasern 2');

  // Hur Kasern 2 ser ut medan den är aktiv – jämförelsen görs sedan från Garage
  const nar = await page.evaluate(() => ({
    rt: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern2'), 'kasern2').map(t => t.namn + '@' + t.vecka),
    besok: DP.Plan.besoksveckor(DP.Plan.stateFor('kasern2'), 'kasern2'),
    steg: DP.Plan.stegStatus(DP.Plan.stateFor('kasern2'), 'kasern2'),
    namn: DP.Plan.rutintillfalleNamn('BI', 5, 'kasern2')
  }));
  // Stegstatusen ska vara densamma som frågeflödet visar. Standardplaneringen kopplar allt och
  // fyller i de planerade tiderna, så alla sex stegen är gröna (beslut 23 och 35).
  const bockar = await f.locator('.steg-kort.klar').count();
  kontroll(bockar === 6 && [1, 2, 3, 4, 5, 6].every(n => nar.steg[n] === true),
    'stegstatus för Kasern 2 stämmer med flödets sex bockar (' + bockar + ')');

  await byggnadsval(page, 'garage');
  const fran = await page.evaluate(() => ({
    rt: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern2'), 'kasern2').map(t => t.namn + '@' + t.vecka),
    besok: DP.Plan.besoksveckor(DP.Plan.stateFor('kasern2'), 'kasern2'),
    steg: DP.Plan.stegStatus(DP.Plan.stateFor('kasern2'), 'kasern2'),
    namn: DP.Plan.rutintillfalleNamn('BI', 5, 'kasern2'),
    aktiv: DP.Plan.aktivId()
  }));
  kontroll(fran.aktiv === 'garage' && fran.rt.length > 0 && JSON.stringify(fran.rt) === JSON.stringify(nar.rt),
    'rutintillfällen och namn för Kasern 2 är likadana medan Garage är aktivt (' + fran.rt.length + ' st)');
  kontroll(fran.namn === nar.namn && fran.namn.indexOf('Kasern2-') === 0,
    'rutintillfällets namn bygger på rätt byggnad: ' + fran.namn);
  kontroll(JSON.stringify(fran.besok) === JSON.stringify(nar.besok) && fran.besok.length > 0,
    'besöksveckor för Kasern 2 är likadana (' + fran.besok.length + ' veckor)');
  kontroll(JSON.stringify(fran.steg) === JSON.stringify(nar.steg), 'stegstatus för Kasern 2 är likadan');

  // Ett steg som ändrar två byggnader och det gemensamma tillståndet
  const fore = await page.evaluate(() => ({
    hist: DP.Plan.historik().lista.length,
    garage: DP.Plan.stateFor('garage').ronder.length,
    kasern2: DP.Plan.stateFor('kasern2').ronder.length
  }));
  await page.evaluate(() => {
    window.provInfo = [];
    DP.Plan.prenumerera(function (fore, e, info) { window.provInfo.push((info.byggnader || []).slice().sort().join(',')); });
    return 1;
  });
  const efter = await page.evaluate(() => {
    DP.Plan.andraFlera('Prov: ändra två byggnader', function (a) {
      a.tillstand('garage').ronder = [];
      a.tillstand('kasern2').ronder = [];
      a.gemensamt.prov = 'balansering';
    });
    return {
      hist: DP.Plan.historik().lista.length,
      aktiv: DP.Plan.aktivId(),
      garage: DP.Plan.stateFor('garage').ronder.length,
      kasern2: DP.Plan.stateFor('kasern2').ronder.length,
      gem: DP.Plan.gemensamt().prov
    };
  });
  kontroll(efter.hist === fore.hist + 1 && efter.garage === 0 && efter.kasern2 === 0 && efter.gem === 'balansering',
    'ett steg ändrar två byggnader och det gemensamma tillståndet');

  await angra(page);
  const angrat = await page.evaluate(() => ({
    aktiv: DP.Plan.aktivId(),
    garage: DP.Plan.stateFor('garage').ronder.length,
    kasern2: DP.Plan.stateFor('kasern2').ronder.length,
    gem: DP.Plan.gemensamt().prov
  }));
  kontroll(angrat.garage === fore.garage && angrat.kasern2 === fore.kasern2 && angrat.gem === undefined,
    'ångra återställer båda byggnaderna och det gemensamma tillståndet');
  kontroll(angrat.aktiv === 'garage', 'ångra av ett flerbyggnadssteg byter inte aktiv byggnad');
  const info = await page.evaluate(() => window.provInfo);
  kontroll(info.length === 2 && info[0] === 'garage,kasern2' && info[1] === 'garage,kasern2',
    'lyssnarna får samma rörda byggnader vid ändringen och vid ångra (' + JSON.stringify(info) + ')');

  // Ett steg som bara ändrar det gemensamma tillståndet rör ingen byggnad
  const bara = await page.evaluate(() => {
    window.provInfo = [];
    DP.Plan.andraFlera('Prov: bara gemensamt', function (a) { a.gemensamt.svar = 'flygfaltet'; });
    return { gem: DP.Plan.gemensamt().svar, info: window.provInfo };
  });
  kontroll(bara.gem === 'flygfaltet' && bara.info.length === 1 && bara.info[0] === '',
    'ett steg som bara ändrar det gemensamma tillståndet rör ingen byggnad');

  // En byggnad i taget fungerar som förut: ångra växlar till den byggnad steget gällde
  await page.evaluate(() => { DP.Plan.vaxlaByggnad('kasern2'); DP.Plan.andra('Prov: töm ronderna', function (s) { s.ronder = []; }); return 1; });
  await vanta(page, () => DP.Plan.aktivId() === 'kasern2' && DP.Plan.stateFor('kasern2').ronder.length === 0, 'tömda ronder i Kasern 2');
  await byggnadsval(page, 'garage');
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.aktivId() === 'kasern2' && DP.Plan.state().ronder.length > 0),
    'ångra av ett enbyggnadssteg växlar tillbaka till den byggnaden');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: steg 5 blir grönt när allt är kopplat, och statusen säger vad som fattas (beslut 23)
async function testSteg5Klart(browser) {
  console.log('Etapp 5 – steg 5 blir grönt när allt är kopplat');
  const page = await nySida(browser, URL_INDEX);
  const f = page.locator('#flode');

  // Garaget har tre signifikanta installationer (HB01, PORT01, PORT02) och är den enklaste
  // byggnaden att läsa statusen på. Standardplaneringen kopplar allt, inklusive de generella.
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => document.querySelectorAll('#flode .steg-kort.klar').length === 6, 'sex bockar i garaget');
  const full = await page.evaluate(() => ({
    steg: DP.Plan.stegStatus(),
    st: DP.Plan.kopplingsStatus(DP.Plan.state())
  }));
  const bockar = await f.locator('.steg-kort.klar').count();
  kontroll(bockar === 6 && full.steg[5] === true && full.st.klar === true && full.st.saknasText === '',
    'garaget med standardplanering får grön bock i steg 5 (' + bockar + ' bockar)');
  await rorelsePaus(page);
  await bild(page, 'etapp5-steg5-klart');

  // Ta bort åtgärden som täcker HB01: en signifikant installation blir utan, bocken ska falla
  const foreBort = await historiklangd(page);
  await f.locator('.atgrad', { hasText: 'Kontroll handbrandsläckare' }).locator('button', { hasText: 'Ta bort' }).click();
  await stegKlart(page, foreBort, 'tog bort Kontroll handbrandsläckare');
  const utan = await page.evaluate(() => ({
    steg: DP.Plan.stegStatus(),
    st: DP.Plan.kopplingsStatus(DP.Plan.state())
  }));
  kontroll(utan.steg[5] === false && utan.st.klar === false && utan.st.saknas.length === 1,
    'bocken faller när en signifikant installation saknar åtgärd');
  kontroll(utan.st.saknasText === '1 installation saknas',
    'statusen nämner den installation som saknas: "' + utan.st.saknasText + '"');
  // Steg 5 är öppet, så texten läses ur kortets kropp – det är där planeraren ser luckan
  // medan hen arbetar i steget.
  const kropp = await f.locator('.steg-kort').nth(4).innerText();
  kontroll(kropp.includes('1 installation saknas'),
    'steg 5 visar vad som fattas i klartext');

  await angra(page);
  await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'bocken tillbaka efter ångra');
  kontroll(await page.evaluate(() => DP.Plan.stegStatus()[5] === true)
    && await f.locator('.steg-kort.klar').count() === 6,
    'ångra ger bocken i steg 5 tillbaka');

  // Bocken är härledd ur planeringen, så gör om tar bort den igen utan eget arbete
  await gorOm(page);
  await vanta(page, () => DP.Plan.stegStatus()[5] === false, 'bocken borta igen efter gör om');
  // Steg 6 kräver att steg 5 är klart, så båda bockarna faller när en installation blir utan
  kontroll(await page.evaluate(() => DP.Plan.stegStatus()[5] === false)
    && await f.locator('.steg-kort.klar').count() === 4,
    'gör om tar bort bocken igen');
  await angra(page);
  await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'bocken tillbaka inför nästa kontroll');

  // Alla signifikanta installationer har åtgärd, men en generell åtgärd saknas: ändå inte grönt
  // Efter ett ångra trunkeras historiken av nästa steg, så längden är inte längre ett villkor
  // som kan växa. Luckan i statusen är det kontrollen nedan bygger på, och den väntar på den.
  await f.locator('.atgrad', { hasText: 'Kontroll byggnad utvändigt' }).locator('button', { hasText: 'Ta bort' }).click();
  await vanta(page, () => DP.Plan.kopplingsStatus(DP.Plan.state()).saknarGenerella.length === 1,
    'tog bort Kontroll byggnad utvändigt');
  const genUtan = await page.evaluate(() => ({
    steg: DP.Plan.stegStatus(),
    st: DP.Plan.kopplingsStatus(DP.Plan.state())
  }));
  kontroll(genUtan.steg[5] === false && genUtan.st.saknas.length === 0 && genUtan.st.n === genUtan.st.tot,
    'steg 5 blir inte grönt bara för att alla installationer har åtgärd');
  kontroll(genUtan.st.saknasText === 'Kontroll byggnad utvändigt saknas',
    'statusen nämner den generella åtgärden vid namn: "' + genUtan.st.saknasText + '"');

  // Båda slagen av lucka samtidigt räknas upp i klartext
  const foreBada = await historiklangd(page);
  await f.locator('.atgrad', { hasText: 'Kontroll garageport' }).locator('button', { hasText: 'Ta bort' }).click();
  await stegKlart(page, foreBada, 'tog bort Kontroll garageport');
  const bada = await page.evaluate(() => DP.Plan.kopplingsStatus(DP.Plan.state()));
  kontroll(bada.saknasText === '2 installationer och Kontroll byggnad utvändigt saknas',
    'statusen räknar upp båda slagen av lucka: "' + bada.saknasText + '"');
  await bild(page, 'etapp5-steg5-luckor');

  // Stegstatusen går att läsa för en byggnad som inte är aktiv, så att Balansering kan använda den
  await byggnadsval(page, 'kasern1');
  const annan = await page.evaluate(() => ({
    garage: DP.Plan.stegStatus(DP.Plan.stateFor('garage'), 'garage'),
    gStatus: DP.Plan.kopplingsStatus(DP.Plan.stateFor('garage'), 'garage'),
    kasern: DP.Plan.stegStatus(DP.Plan.stateFor('kasern1'), 'kasern1')
  }));
  kontroll(annan.garage[5] === false && annan.gStatus.saknas.length === 2 && annan.kasern[5] === false,
    'stegstatus och luckor går att läsa för valfri byggnad från en annan byggnad');

  // Kasern 1 med standardplanering blir också klar – reglerna är inte garagespecifika
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus(DP.Plan.stateFor('kasern1'), 'kasern1')[5] === true,
    'steg 5 klart i Kasern 1');
  kontroll(await page.evaluate(() => DP.Plan.stegStatus(DP.Plan.stateFor('kasern1'), 'kasern1')[5] === true),
    'Kasern 1 med standardplanering får också grön bock i steg 5');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: steg 6 föreslår planerad tid i dagsdelar, visar uträkningen och godkänns (beslut 27, 35, 43)
async function testSteg6Tid(browser) {
  console.log('Etapp 5 – steg 6: planerad tid med förslag och uträkning');
  const page = await nySida(browser, URL_INDEX, 'kasern1');
  const f = page.locator('#flode');

  // Steg 6 öppnas efter steg 5, så byggnaden behöver en komplett planering först.
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'steg 5 klart i Kasern 1');

  // Standardplaneringen fyller i steg 6 (eget test nedan). Det här testet prövar vägen när
  // planeraren själv tar ställning, så tiderna nollställs: samma läge som en planering byggd
  // steg för steg i stället för från standarden.
  await page.evaluate(() => {
    DP.Plan.andra('Prov: töm de planerade tiderna', function (st) { st.tider = {}; });
    return 1;
  });
  await vanta(page, () => DP.Plan.stegStatus()[6] === false, 'steg 6 tömt i Kasern 1');

  // Schablonens siffror för standardplaneringen (beslut 44). De är hela poängen med steget:
  // stämmer de inte är förslagen inte rimliga, och då hjälper inte gränssnittet.
  const forslag = await page.evaluate(() => {
    const x = DP.Plan.tidForslag('BI', DP.Plan.stateFor('kasern1'), 'kasern1');
    return { k1: { dagsdel: x.dagsdel, timmar: Math.round(x.timmar * 10) / 10, text: x.text } };
  });
  kontroll(forslag.k1.dagsdel === 'heldag' && forslag.k1.timmar === 5.2,
    'Kasern 1 Byggnad invändigt föreslås som heldag, 5,2 h (' + forslag.k1.dagsdel + ', ' + forslag.k1.timmar + ' h)');
  kontroll(forslag.k1.text.includes('8 installationer') && forslag.k1.text.includes('2 tunga')
    && forslag.k1.text.includes('65 rum') && forslag.k1.text.includes('5,2 h')
    && forslag.k1.text.includes('heldag'),
    'uträkningen står i klartext: "' + forslag.k1.text + '"');

  // Steg 6 visas efter steg 5 med sin titel, och uträkningen syns i kortet
  await f.locator('.steg-huvud', { hasText: 'Hur lång tid tar ronderna?' }).click();
  await vanta(page, () => {
    const kort = document.querySelectorAll('#flode .steg-kort');
    return kort.length === 6 && kort[5].classList.contains('oppen');
  }, 'steg 6 öppet');
  const kort6 = f.locator('.steg-kort').nth(5);
  kontroll(await f.locator('.steg-kort').count() === 6, 'sex steg i flödet');
  kontroll((await kort6.innerText()).includes('Hur lång tid tar ronderna?'), 'steg 6 har titeln "Hur lång tid tar ronderna?"');
  const rader = await kort6.locator('.tidrad').count();
  kontroll(rader === 5, 'en rad per rond i Kasern 1 (' + rader + ')');
  const bi = kort6.locator('.tidrad[data-rond="BI"]');
  kontroll((await bi.locator('.td-utrakning').innerText()).includes('→ heldag'),
    'uträkningen visas vid förslaget i steg 6');
  await bild(page, 'etapp5-steg6-forslag');

  // Godkänn alla: ett steg i historiken och grön bock
  const foreAlla = await historiklangd(page);
  await kort6.locator('button', { hasText: 'Godkänn alla' }).click();
  await stegKlart(page, foreAlla, 'godkände alla förslag');
  const godkant = await page.evaluate(() => ({ steg: DP.Plan.stegStatus(), ts: DP.Plan.tidStatus(), tider: DP.Plan.state().tider }));
  kontroll(godkant.steg[6] === true && godkant.ts.klar === true && godkant.ts.utan.length === 0,
    'Godkänn alla ger grön bock i steg 6');
  kontroll(godkant.tider.BI.dagsdel === 'heldag' && godkant.tider.BI.godkand === true
    && godkant.tider.BI.forslagVidGodkandet === 'heldag'
    && godkant.tider.BI.minuterVidGodkandet === 310,
    'den godkända tiden och förslaget vid godkännandet sparas i dagsdel och minuter');
  const bockar = await f.locator('.steg-kort.klar').count();
  kontroll(bockar === 6, 'alla sex stegen har bock (' + bockar + ')');
  await bild(page, 'etapp5-steg6-godkant');

  // Ångra och gör om: godkännandet är ett steg i historiken som allt annat
  await angra(page);
  await vanta(page, () => DP.Plan.stegStatus()[6] === false, 'bocken borta efter ångra');
  kontroll(await page.evaluate(() => DP.Plan.stegStatus()[6] === false && Object.keys(DP.Plan.state().tider).length === 0),
    'ångra tar bort godkännandena');
  await gorOm(page);
  await vanta(page, () => DP.Plan.stegStatus()[6] === true, 'bocken tillbaka efter gör om');
  kontroll(await page.evaluate(() => DP.Plan.stegStatus()[6] === true), 'gör om ger godkännandena tillbaka');

  // Att välja en annan dagsdel räknas som godkänt, och den tiden står kvar
  const foreVal = await historiklangd(page);
  await bi.locator('button.chip', { hasText: 'kvartsdag' }).click();
  await stegKlart(page, foreVal, 'valde kvartsdag för Byggnad invändigt');
  const valt = await page.evaluate(() => ({
    tid: DP.Plan.state().tider.BI,
    steg: DP.Plan.stegStatus(),
    rad: DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0]
  }));
  kontroll(valt.tid.dagsdel === 'kvartsdag' && valt.tid.godkand === true && valt.steg[6] === true,
    'att välja en annan dagsdel räknas som godkänt och steget är kvar grönt');
  kontroll(valt.rad.andrad === false && valt.rad.forslagVidGodkandet === 'heldag',
    'det förslag som gällde vid valet sparas, och raden är inte markerad som ändrad');

  // Ändrade förutsättningar: flytta åtgärder ur ronden, så att förslaget sjunker från heldag
  // till en mindre dagsdel. Kopplingarna finns kvar i en annan rond, så steg 5 är fortfarande
  // klart – det är just en sådan omfördelning som gör ett godkänt förslag föråldrat.
  // Den godkända tiden ska stå kvar, och steget förblir grönt (antagandet i specen).
  const foreBort = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: flytta de generella åtgärderna till Brandskydd', function (st) {
      st.kopplingar.forEach(function (k) { if (k.inst === 'BYGGNAD') { k.rond = 'BS'; } });
    });
    return 1;
  });
  await stegKlart(page, foreBort, 'flyttade de generella åtgärderna');
  const andrad = await page.evaluate(() => ({
    rad: DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0],
    steg: DP.Plan.stegStatus(),
    tid: DP.Plan.state().tider.BI
  }));
  kontroll(andrad.rad.andrad === true && andrad.rad.forslag.dagsdel !== 'kvartsdag',
    'ett nytt förslag markeras som ändrade förutsättningar (nytt förslag: ' + andrad.rad.forslag.dagsdel + ')');
  kontroll(andrad.tid.dagsdel === 'kvartsdag' && andrad.rad.dagsdel === 'kvartsdag',
    'den godkända tiden ändras inte av sig själv');
  kontroll(andrad.steg[6] === true, 'steg 6 förblir grönt när förutsättningarna ändras');
  // Steg 6 är öppet sedan godkännandet, och lyssnaren har ritat om det efter flytten
  await vanta(page, () => !!document.querySelector('#flode .tidrad.andrad'), 'markeringen i steg 6');
  const bi2 = f.locator('.steg-kort').nth(5).locator('.tidrad[data-rond="BI"]');
  kontroll((await bi2.innerText()).includes('Förutsättningarna har ändrats'),
    'markeringen "Förutsättningarna har ändrats" visas med det nya förslaget');
  await bild(page, 'etapp5-steg6-andrad');

  // Ett förslag över en heldag: lägg alla åtgärder i Hangaren i samma rond, så att den blir
  // för stor för en dag. Delningen föreslås men görs inte.
  await byggnadsval(page, 'hangar');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'steg 5 klart i Hangaren');
  const hangar = await page.evaluate(() => {
    const las = rond => {
      const x = DP.Plan.tidForslag(rond, DP.Plan.state());
      return { dagsdel: x.dagsdel, timmar: Math.round(x.timmar * 10) / 10 };
    };
    return { bi: las('BI'), ve: las('VE') };
  });
  kontroll(hangar.bi.dagsdel === 'halvdag' && hangar.bi.timmar === 2.5,
    'Hangar Byggnad invändigt föreslås som halvdag, 2,5 h (' + hangar.bi.dagsdel + ', ' + hangar.bi.timmar + ' h)');
  kontroll(hangar.ve.dagsdel === 'halvdag' && hangar.ve.timmar === 3.8,
    'Hangar Ventilation föreslås som halvdag, 3,8 h (' + hangar.ve.dagsdel + ', ' + hangar.ve.timmar + ' h)');

  const foreFlytt = await historiklangd(page);
  await page.evaluate(() => {
    // Flytta alla åtgärder till Byggnad invändigt: en orimligt stor rond, som i verkligheten
    // uppstår när planeraren lägger för mycket i samma rond.
    DP.Plan.andra('Prov: allt i en rond', function (st) { st.kopplingar.forEach(function (k) { k.rond = 'BI'; }); });
    return 1;
  });
  await stegKlart(page, foreFlytt, 'allt i en rond i Hangaren');
  const stor = await page.evaluate(() => {
    const x = DP.Plan.tidForslag('BI', DP.Plan.state());
    return { delning: x.foreslaDelning, dagsdel: x.dagsdel, minuter: x.minuter, ronder: DP.Plan.state().ronder.length };
  });
  kontroll(stor.delning === true && stor.minuter > 480,
    'ett förslag över 8 h flaggas för delning (' + Math.round(stor.minuter / 6) / 10 + ' h)');
  kontroll(stor.dagsdel === 'heldag', 'dagsdelen stannar på heldag, så en tid går att godkänna');
  await f.locator('.steg-huvud', { hasText: 'Hur lång tid tar ronderna?' }).click();
  await vanta(page, () => !!document.querySelector('#flode .tidrad .notis.varning'), 'delningsförslaget i steg 6');
  const storRad = f.locator('.steg-kort').nth(5).locator('.tidrad[data-rond="BI"]');
  const storText = await storRad.innerText();
  kontroll(storText.includes('mer än en heldag') && storText.includes('Dela ronden'),
    'delningen föreslås i klartext');
  kontroll(stor.ronder === await page.evaluate(() => DP.Plan.state().ronder.length),
    'ingen delning sker automatiskt – ronderna är lika många (' + stor.ronder + ')');
  await bild(page, 'etapp5-steg6-delning');

  // Kasern 2 har en tvättmaskin mindre och en inbyggd hiss (beslut 17), så dess Byggnad
  // invändigt blir en halvtimme tyngre än Kasern 1:s – samma rond, olika förutsättningar.
  await byggnadsval(page, 'kasern2');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'steg 5 klart i Kasern 2');
  const k2 = await page.evaluate(() => {
    const x = DP.Plan.tidForslag('BI', DP.Plan.state());
    return { dagsdel: x.dagsdel, timmar: Math.round(x.timmar * 10) / 10 };
  });
  kontroll(k2.dagsdel === 'heldag' && k2.timmar === 5.7,
    'Kasern 2 Byggnad invändigt föreslås som heldag, 5,7 h (' + k2.dagsdel + ', ' + k2.timmar + ' h)');

  // Garaget: den minsta byggnaden ska bli kort, så att små byggnader är lika lätta att förstå
  await byggnadsval(page, 'garage');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'steg 5 klart i garaget');
  const garage = await page.evaluate(() => {
    const x = DP.Plan.tidForslag('BI', DP.Plan.state());
    return { dagsdel: x.dagsdel, minuter: x.minuter, timmar: DP.Plan.tidTimmar('BI', DP.Plan.state()) };
  });
  kontroll(garage.dagsdel === 'kort' && garage.timmar === 1,
    'Garage Byggnad invändigt föreslås som kort (' + garage.dagsdel + ', ' + garage.minuter + ' min)');

  // Tidsschablonen ligger som data och går att läsa som data
  const schablon = await page.evaluate(() => ({
    minuter: DP.tidsschablon.MINUTER,
    dagsdelar: DP.tidsschablon.DAGSDELAR.map(d => d.id + ':' + d.takMin),
    hb: DP.tidsschablon.tyngd(DP.Plan.atgard('A010')),
    lb: DP.tidsschablon.tyngd(DP.Plan.atgard('A020')),
    vvb: DP.tidsschablon.tyngd(DP.Plan.atgard('A022')),
    erfarenhet: Object.keys(DP.tidsschablon.erfarenhet).length
  }));
  kontroll(schablon.minuter.latt === 3 && schablon.minuter.normal === 15 && schablon.minuter.tung === 45,
    'schablonens minuter per tyngd är 3, 15 och 45');
  kontroll(schablon.dagsdelar.join(' ') === 'kort:60 kvartsdag:120 halvdag:240 heldag:480',
    'dagsdelarnas gränser är 1, 2, 4 och 8 h');
  kontroll(schablon.hb === 'latt' && schablon.lb === 'tung' && schablon.vvb === 'normal',
    'tyngden per åtgärd: handbrandsläckare lätt, luftbehandlingsaggregat tung, varmvattenberedare normal');
  kontroll(schablon.erfarenhet === 0, 'erfarenhetsvärden är förberedda men inte satta i etapp 5');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: den planerade tiden följer med när planeringen ändras eller skapas på andra sätt
// (biljett #11, berättelse 19, 22 och 23). Tre vägar: ändrade förutsättningar med båda
// ställningstagandena, standardplanering som fyller i steg 6, och kopiering som tar med tiderna.
async function testTidFoljerMed(browser) {
  console.log('Etapp 5 – planerad tid följer med: ändrade förutsättningar, standard och kopiering');
  const page = await nySida(browser, URL_INDEX);
  const f = page.locator('#flode');
  const standard = async id => {
    await byggnadsval(page, id);
    await f.locator('button', { hasText: 'Använd standardplanering' }).click();
    await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
    await vanta(page, () => DP.Plan.stegStatus()[5] === true, 'steg 5 klart i ' + id);
  };

  // ---- Standardplaneringen fyller i steg 6 för alla fyra byggnaderna (berättelse 22) ----
  // Det är förutsättningen för Balansering: en byggnad utan klar planering är gråad där
  // (beslut 39), så standardplaneringen måste räcka hela vägen till sex bockar.
  const ordning = await page.evaluate(() => DP.Plan.byggnadsordning);
  for (const id of ordning) {
    await standard(id);
    const r = await page.evaluate(() => {
      const s = DP.Plan.state(), ts = DP.Plan.tidStatus(s);
      return {
        namn: DP.byggnader[DP.Plan.aktivId()].namn,
        steg: DP.Plan.stegStatus(),
        klar: ts.klar,
        utan: ts.utan.length,
        andrade: ts.andrade.length,
        overHeldag: ts.rader.filter(x => x.forslag.foreslaDelning).map(x => x.rond),
        godkanda: ts.rader.every(x => x.godkand && typeof x.minuterVidGodkandet === 'number')
      };
    });
    const allaSex = [1, 2, 3, 4, 5, 6].every(n => r.steg[n] === true);
    kontroll(allaSex && r.klar && r.utan === 0,
      r.namn + ' får grön bock i alla sex stegen med standardplanering');
    kontroll(r.godkanda, r.namn + ': varje rond har en godkänd tid med sparade minuter');
    // En nyss skapad standardplanering kan inte ha föråldrade tider – då vore förslaget
    // inte det som just godkändes, och planeraren skulle mötas av en markering utan orsak.
    kontroll(r.andrade === 0, r.namn + ': inga ronder markeras som ändrade direkt efter standardplaneringen');
    kontroll(r.overHeldag.length === 0,
      r.namn + ': ingen standardrond är mer än en heldag' +
      (r.overHeldag.length ? ' (' + r.overHeldag.join(', ') + ')' : ''));
  }
  await byggnadsval(page, 'kasern1');
  await f.locator('.steg-huvud', { hasText: 'Hur lång tid tar ronderna?' }).click();
  await vanta(page, () => {
    const k = document.querySelectorAll('#flode .steg-kort');
    return k.length === 6 && k[5].classList.contains('oppen');
  }, 'steg 6 öppet i Kasern 1');
  kontroll(await f.locator('.steg-kort.klar').count() === 6,
    'alla sex stegen har bock direkt efter standardplaneringen');
  await bild(page, 'etapp5-tid-standard');

  // ---- Behåll min tid: den andra vägen ut ur en ändrad förutsättning (berättelse 19) ----
  // Lägg till en åtgärd i en rond med godkänd tid, så att förslaget växer.
  const foreLagg = await historiklangd(page);
  await page.evaluate(() => {
    // Flytta elronden till Byggnad invändigt: BI får fler åtgärder utan att någon koppling
    // försvinner, så steg 5 är orört. Det är den ändring kriteriet beskriver.
    DP.Plan.andra('Prov: flytta elronden till Byggnad invändigt', function (st) {
      st.kopplingar.forEach(function (k) { if (k.rond === 'EL') { k.rond = 'BI'; } });
    });
    return 1;
  });
  await stegKlart(page, foreLagg, 'flyttade elronden till Byggnad invändigt');
  const lagt = await page.evaluate(() => {
    const ts = DP.Plan.tidStatus();
    return { rad: ts.rader.filter(x => x.rond === 'BI')[0], steg: DP.Plan.stegStatus(), tid: DP.Plan.state().tider.BI };
  });
  kontroll(lagt.rad.andrad === true,
    'en tillagd åtgärd i en rond med godkänd tid ger markeringen (nu ' +
    lagt.rad.forslag.minuter + ' min mot ' + lagt.rad.minuterVidGodkandet + ' vid godkännandet)');
  kontroll(lagt.tid.dagsdel === 'heldag' && lagt.rad.dagsdel === 'heldag',
    'den godkända tiden är oförändrad i planeringen');
  kontroll(lagt.steg[6] === true, 'steg 6 är fortfarande grönt');

  // Dagsdelen är heldag både före och efter: markeringen kommer av minuterna. Gick jämförelsen
  // bara på dagsdelen hade den här ändringen gått tyst förbi.
  kontroll(lagt.rad.forslag.dagsdel === lagt.rad.forslagVidGodkandet,
    'markeringen bygger på minuterna, inte dagsdelen (båda ' + lagt.rad.forslag.dagsdel + ')');
  await vanta(page, () => !!document.querySelector('#flode .tidrad.andrad'), 'markeringen i steg 6');
  const biRad = f.locator('.steg-kort').nth(5).locator('.tidrad[data-rond="BI"]');
  const biText = await biRad.innerText();
  kontroll(biText.includes('Förutsättningarna har ändrats') && biText.includes('i stället för'),
    'markeringen säger vad som ändrats i klartext: "' + biText.split('\n').filter(r => r.includes('Förutsättningarna'))[0] + '"');
  kontroll(await biRad.locator('button', { hasText: 'Behåll' }).count() === 1,
    'raden erbjuder "Behåll" som väg ut ur markeringen');
  await bild(page, 'etapp5-tid-andrad-minuter');

  // Behåll min tid: dagsdelen rörs inte, men markeringen försvinner
  const foreBehall = await historiklangd(page);
  await biRad.locator('button', { hasText: 'Behåll' }).click();
  await stegKlart(page, foreBehall, 'behöll den godkända tiden');
  const behallt = await page.evaluate(() => {
    const ts = DP.Plan.tidStatus();
    return { rad: ts.rader.filter(x => x.rond === 'BI')[0], steg: DP.Plan.stegStatus(), tid: DP.Plan.state().tider.BI };
  });
  kontroll(behallt.rad.andrad === false && behallt.tid.dagsdel === 'heldag',
    'att behålla sin tid tar bort markeringen utan att ändra dagsdelen');
  kontroll(behallt.rad.minuterVidGodkandet === behallt.rad.forslag.minuter,
    'det nya förslaget är nu det som gäller vid godkännandet (' + behallt.rad.minuterVidGodkandet + ' min)');
  kontroll(behallt.steg[6] === true, 'steg 6 är grönt efter att tiden behållits');
  kontroll(await f.locator('.steg-kort').nth(5).locator('.tidrad[data-rond="BI"].andrad').count() === 0,
    'raden är inte längre markerad som ändrad');

  // Båda valen går att ångra. Flytten tömde elronden, så den är också markerad – kontrollen
  // håller sig därför till BI-raden, som är den planeraren tog ställning till.
  const biAndrad = () => page.evaluate(() => DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0].andrad);
  await angra(page);
  await vanta(page, () => DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0].andrad === true,
    'markeringen tillbaka efter ångra');
  kontroll(await biAndrad() === true,
    'ångra ger markeringen tillbaka – att behålla sin tid är ett steg i historiken');
  await gorOm(page);
  await vanta(page, () => DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0].andrad === false,
    'markeringen borta efter gör om');
  kontroll(await biAndrad() === false, 'gör om tar bort markeringen igen');

  // Den andra vägen: använd det nya förslaget. Den erbjuds när dagsdelen skiljer sig, så BI
  // töms på åtgärder – då faller förslaget från heldag till den minsta dagsdelen.
  const foreSank = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: flytta allt i Byggnad invändigt till Brandskydd', function (st) {
      st.kopplingar.forEach(function (k) { if (k.rond === 'BI') { k.rond = 'BS'; } });
    });
    return 1;
  });
  await stegKlart(page, foreSank, 'tömde Byggnad invändigt');
  await vanta(page, () => {
    const r = DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0];
    return r.andrad && r.forslag.dagsdel !== r.dagsdel;
  }, 'markeringen efter sänkningen');
  const sankt = await page.evaluate(() => DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0]);
  kontroll(sankt.andrad === true && sankt.forslag.dagsdel !== sankt.dagsdel,
    'en sänkt dagsdel markeras också (nytt förslag: ' + sankt.forslag.dagsdel + ', min tid: ' + sankt.dagsdel + ')');
  const biRad2 = f.locator('.steg-kort').nth(5).locator('.tidrad[data-rond="BI"]');
  kontroll(await biRad2.locator('button', { hasText: 'Använd' }).count() === 1
    && await biRad2.locator('button', { hasText: 'Behåll' }).count() === 1,
    'skiljer dagsdelen sig erbjuds båda vägarna: använd förslaget eller behåll min tid');
  const foreAnvand = await historiklangd(page);
  await biRad2.locator('button', { hasText: 'Använd' }).click();
  await stegKlart(page, foreAnvand, 'använde det nya förslaget');
  const anvant = await page.evaluate(() => {
    const ts = DP.Plan.tidStatus();
    return { rad: ts.rader.filter(x => x.rond === 'BI')[0], steg: DP.Plan.stegStatus() };
  });
  kontroll(anvant.rad.andrad === false && anvant.rad.dagsdel === anvant.rad.forslag.dagsdel,
    'att använda det nya förslaget tar bort markeringen och sätter den nya dagsdelen');
  kontroll(anvant.steg[6] === true, 'steg 6 är grönt efter att förslaget använts');

  // ---- Kopiering tar med tiderna (berättelse 23) ----
  // Kasern 2 nollställs först, så att kopieringen är det enda som sätter dess tider.
  await byggnadsval(page, 'kasern2');
  const foreTom = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: töm Kasern 2', function (st) {
      st.bas = null; st.ronder = []; st.kopplingar = []; st.tider = {};
    });
    return 1;
  });
  await stegKlart(page, foreTom, 'tömde Kasern 2');
  await byggnadsval(page, 'kasern1');
  await standard('kasern1');
  await byggnadsval(page, 'kasern2');
  const foreKop = await historiklangd(page);
  await f.locator('button', { hasText: 'Kopiera från Kasern 1' }).click();
  await page.locator('.dlg').locator('button', { hasText: /^Kopiera$/ }).click();
  await stegKlart(page, foreKop, 'kopierade planeringen från Kasern 1');
  const kopierat = await page.evaluate(() => {
    const s = DP.Plan.state(), ts = DP.Plan.tidStatus(s);
    return {
      tider: s.tider,
      klar: ts.klar,
      steg: DP.Plan.stegStatus(),
      rader: ts.rader.map(x => ({ rond: x.rond, dagsdel: x.dagsdel, andrad: x.andrad,
        arvd: x.arvd, nu: x.forslag.minuter, vid: x.minuterVidGodkandet }))
    };
  });
  kontroll(Object.keys(kopierat.tider).length === 5
    && kopierat.rader.every(x => kopierat.tider[x.rond] && kopierat.tider[x.rond].godkand),
    'kopieringen tar med en godkänd tid för var och en av de fem ronderna');
  // Tiderna är godkända direkt, så steg 6 har inga luckor av sig själv. Bocken dröjer ändå,
  // eftersom steg 6 kräver steg 5 och Kasern 2:s hiss är okopplad efter kopieringen (beslut 23).
  kontroll(kopierat.klar === true,
    'steg 6 har inga luckor efter kopieringen – tiderna behöver inte godkännas på nytt');
  kontroll(kopierat.rader.every(x => typeof x.vid === 'number'),
    'förslaget som gällde i källan följer med, så att en avvikelse i målbyggnaden kan upptäckas');

  // Kriterium 4: ronder där målbyggnadens förslag skiljer sig ska markeras direkt vid
  // kopieringen, inte först efter någon senare ändring. Kasern 2 saknar en av Kasern 1:s
  // tvättmaskiner, så Byggnad invändigt blir 295 min mot de ärvda 310 – en liten skillnad,
  // men ingen har räknat på Kasern 2, så den ska synas (beslut 51).
  const biKop = kopierat.rader.filter(x => x.rond === 'BI')[0];
  kontroll(biKop.nu !== biKop.vid && biKop.andrad === true,
    'en rond vars förslag skiljer sig markeras direkt vid kopieringen (' +
    biKop.nu + ' min här mot ' + biKop.vid + ' i Kasern 1)');
  kontroll(kopierat.rader.filter(x => x.nu === x.vid).every(x => x.andrad === false),
    'ronder med samma förslag som i källan markeras inte');
  await bild(page, 'etapp5-tid-kopierad');

  // Kasern 2 har en inbyggd hiss som Kasern 1 saknar (beslut 17), så den är okopplad efter
  // kopieringen och steg 5 är ogrönt. När planeraren kopplar den växer Byggnad invändigt från
  // Kasern 1:s 310 min till Kasern 2:s 340 – samma dagsdel, men en halvtimme mer arbete.
  // Det är fallet biljetten pekar ut: Kasern 2 ska inte tyst ärva en tid som inte stämmer.
  const biFore = kopierat.rader.filter(x => x.rond === 'BI')[0];
  kontroll(biFore.vid === 310,
    'Byggnad invändigt ärver Kasern 1:s förslag på 310 min (' + biFore.vid + ')');
  const foreHiss = await historiklangd(page);
  await page.evaluate(() => {
    // Koppla de installationer som saknar åtgärd, så som planeraren gör i steg 5
    DP.Plan.andra('Prov: koppla det som fattas i Kasern 2', function (st) {
      DP.Plan.signifikanta().forEach(function (i) {
        if (st.kopplingar.some(function (k) { return k.inst === i.id; })) { return; }
        DP.atgarder.forEach(function (a) {
          if (!a.generell && (a.galler || []).indexOf(i.typ) >= 0) {
            st.kopplingar.push({ atgard: a.id, inst: i.id, rond: 'BI' });
          }
        });
      });
    });
    return 1;
  });
  await stegKlart(page, foreHiss, 'kopplade det som fattades i Kasern 2');
  const efterHiss = await page.evaluate(() => {
    const ts = DP.Plan.tidStatus();
    return { rad: ts.rader.filter(x => x.rond === 'BI')[0], steg: DP.Plan.stegStatus() };
  });
  kontroll(efterHiss.rad.andrad === true && efterHiss.rad.forslag.minuter === 340,
    'Kasern 2:s egna förutsättningar ger ett annat förslag (' + efterHiss.rad.forslag.minuter +
    ' min mot ' + efterHiss.rad.minuterVidGodkandet + ') och ronden markeras');
  kontroll(efterHiss.rad.dagsdel === 'heldag' && efterHiss.rad.forslag.dagsdel === 'heldag',
    'markeringen syns fast dagsdelen är heldag i båda kasernerna – minuterna avgör');
  kontroll(efterHiss.steg[6] === true && efterHiss.steg[5] === true,
    'Kasern 2 är klar i alla stegen, med markeringen kvar tills planeraren tar ställning');

  // Steg 6 låses upp först när steg 5 är klart, så markeringen i gränssnittet kan läsas nu.
  // Den ska säga att tiden är kopierad – det är förklaringen planeraren behöver för att förstå
  // varför en oförändrad dagsdel ändå kräver ett ställningstagande.
  await f.locator('.steg-huvud', { hasText: 'Hur lång tid tar ronderna?' }).click();
  await vanta(page, () => {
    const k = document.querySelectorAll('#flode .steg-kort');
    return k.length === 6 && k[5].classList.contains('oppen');
  }, 'steg 6 öppet i Kasern 2');
  const kopRad = f.locator('.steg-kort').nth(5).locator('.tidrad[data-rond="BI"]');
  const kopText = await kopRad.innerText();
  kontroll(kopText.includes('kopierad från en annan byggnad'),
    'markeringen säger att tiden är kopierad: "' +
    kopText.split('\n').filter(r => r.includes('kopierad'))[0] + '"');
  await bild(page, 'etapp5-tid-kopierad-andrad');

  // Tar planeraren ställning blir tiden hens egen, och mäts därefter med den vanliga tröskeln
  const foreEget = await historiklangd(page);
  await kopRad.locator('button', { hasText: 'Behåll' }).click();
  await stegKlart(page, foreEget, 'behöll den kopierade tiden');
  const eget = await page.evaluate(() => DP.Plan.tidStatus().rader.filter(x => x.rond === 'BI')[0]);
  kontroll(eget.andrad === false && eget.arvd === false,
    'en kopierad tid planeraren tagit ställning till är inte längre ärvd');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

async function testFlerbyggnadSkiss(browser) {
  console.log('Skiss – flera byggnader');
  const page = await nySida(browser, URL_FLER);
  await page.locator('#plan .rt[title*="Hangar-Brandskydd-2026v48"]').dragTo(page.locator('#plan .cell').nth(2 * 13 + 2));
  // Förutsättningen är att planen ritats om efter flytten – spöket självt är kontrollens sak.
  await vanta(page, () => document.querySelectorAll('#plan .spoke').length > 0, 'planen omritad efter flytten');
  kontroll(await page.locator('#plan .spoke').count() === 1, 'provisorisk flytt lämnar ett spöke');
  await bild(page, 'flerbyggnad');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    await testPlaneringsflode(browser);
    await testAtgardstexter(browser);
    await testByggnaderOchKopiering(browser);
    await testPlaneringFlerByggnader(browser);
    await testSteg5Klart(browser);
    await testSteg6Tid(browser);
    await testTidFoljerMed(browser);
    await testFlerbyggnadSkiss(browser);
  } catch (e) {
    kontroll(false, 'testet avbröts: ' + e.message.split('\n')[0]);
  }
  await browser.close();
  if (fel.length) {
    // Listan sist, så att de misslyckade kontrollerna syns även när utdatan läses med `tail`.
    console.log('');
    fel.forEach(t => console.log('FEL: ' + t));
    console.log('\n' + fel.length + ' kontroll(er) misslyckades.');
  } else {
    console.log('\nAlla kontroller OK. Skärmdumpar: ' + UT);
  }
  process.exit(fel.length ? 1 : 0);
})();
