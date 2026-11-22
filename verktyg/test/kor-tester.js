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
    && document.querySelectorAll('#flode .steg-kort.klar').length === 4, 'standardplaneringen och fyra bockar i Kasern 2');

  // Hur Kasern 2 ser ut medan den är aktiv – jämförelsen görs sedan från Garage
  const nar = await page.evaluate(() => ({
    rt: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern2'), 'kasern2').map(t => t.namn + '@' + t.vecka),
    besok: DP.Plan.besoksveckor(DP.Plan.stateFor('kasern2'), 'kasern2'),
    steg: DP.Plan.stegStatus(DP.Plan.stateFor('kasern2'), 'kasern2'),
    namn: DP.Plan.rutintillfalleNamn('BI', 5, 'kasern2')
  }));
  // Stegstatusen ska vara densamma som frågeflödet visar: stegen 1–4 gröna, 5 inte
  const bockar = await f.locator('.steg-kort.klar').count();
  kontroll(bockar === 4 && nar.steg[1] && nar.steg[2] && nar.steg[3] && nar.steg[4] && !nar.steg[5],
    'stegstatus för Kasern 2 stämmer med flödets fyra bockar (' + bockar + ')');

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
