/*
 * Webbläsartester (Playwright + Chromium) för hela verktyget.
 *
 *   node verktyg/test/kor-tester.js [mapp-för-skärmdumpar]
 *
 * Öppnar index.html och den fristående filen dist/driftplanering.html direkt från disk, klickar
 * igenom flödena och tar skärmdumpar (standard: <tmp>/driftplanering-test). Avslutas med felkod om
 * något test misslyckas eller om sidan loggar JavaScript-fel.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');

const ROT = path.resolve(__dirname, '..', '..');
const URL_INDEX = 'file://' + path.join(ROT, 'index.html');
// Den fristående filen är samma app med allt inbäddat. Den prövas för sig, eftersom den är det
// enda sättet användarens jobbdator kan öppna verktyget på när raw.githack.com inte går fram.
const FIL_DIST = path.join(ROT, 'dist', 'driftplanering.html');
const URL_DIST = 'file://' + FIL_DIST;
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

// Samma väntan, men på **positionen** i stället för längden. Ett nytt steg efter en ångran
// skriver över det som låg framför, så längden står still medan positionen går fram – och då
// hade stegKlart() väntat förgäves. Varje kontroll som följer äger fortfarande sitt eget
// villkor om vad steget gjorde.
async function stegKlartPos(page, fore, beskrivning) {
  await vanta(page, n => DP.Plan.historik().pos > n, 'steget "' + beskrivning + '"', fore);
}
const historikpos = page => page.evaluate(() => DP.Plan.historik().pos);

// Klickar Ångra och väntar på att historiken backat ett steg. Ångra ändrar bara positionen i
// historiken, inte dess längd, så det är pos som säger att klicket gått igenom.
//
// Mediaspelaren har en fast plats högst upp och syns i alla tre huvudstegen (beslut 82), så
// knappen går att klicka på var planeraren än står – inget tangentbord behövs som reserv.
async function angra(page) {
  const fore = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#spelare button[title^="Ångra"]').click();
  await vanta(page, n => DP.Plan.historik().pos < n, 'ångra från position ' + fore, fore);
}

// Klickar Gör om och väntar på att historiken gått framåt ett steg. Som ångra: positionen,
// inte längden, är det som säger att klicket gått igenom.
async function gorOm(page) {
  const fore = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#spelare button[title^="Gör om"]').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'gör om från position ' + fore, fore);
}

// Standardhöjden är 1090 och inte användarens 1200: de flesta testerna bryr sig inte om
// höjden, och en lägre ruta fångar att något ändå ryms. De tester som prövar *utrymmet* säger
// 1200 i stället, genom `hojd`.
async function nySida(browser, url, valjByggnad, hojd) {
  const page = await browser.newPage({ viewport: { width: 1920, height: hojd || 1090 } });
  page.fel = [];
  page.on('pageerror', e => page.fel.push(e.message));
  page.on('console', m => { if (m.type() === 'error') { page.fel.push(m.text()); } });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  // Skripten körs synkront vid laddning, så appen är uppe när namnrymden och den första
  // ritningen finns. Tidsaxelns veckorad ritas sist i flode.js, och alltid. Villkoret gäller
  // både index.html och den fristående filen – det är samma app.
  await vanta(page, () => !!(window.DP && DP.Flode && DP.Plan && DP.viewer)
    && !!document.querySelector('#flode .steg-kort') && !!document.querySelector('#tidsaxel .ta-vecka'),
    'appen ritad');
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
  // Informationskortet för en installation utan kopplingar visar den matchande åtgärden ur
  // bruttolistan med rondens **namn**, inte dess id. Rondnamnet slås upp i planeringen, och den
  // här kontrollen är det som håller uppslagningen på plats: visar kortet 'BS' i stället för
  // 'Brandskydd' har namnet tappats någonstans på vägen.
  await page.evaluate(() => { DP.ui.visaInstKort(DP.Plan.inst('00000030')); return 1; });
  const matchande = page.locator('#infokort .sektion', { hasText: 'Matchande åtgärd i bruttolistan' });
  kontroll(await matchande.count() === 1, 'informationskortet visar den matchande åtgärden');
  const forslagsrad = await matchande.locator('.a-rad').innerText();
  kontroll(/föreslagen rond\s+Brandskydd/.test(forslagsrad),
    'den föreslagna ronden visas med namn: "' + forslagsrad.replace(/\n/g, ' ') + '"');
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
  await page.evaluate(() => { DP.ui.visaInstKort(DP.Plan.inst('00000030')); return 1; });
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
        namn: DP.Plan.byggnad().namn,
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

// Etapp 5: processlinjen (Byggnad → Planering → Balansering) och ordlistan (berättelse 1–3, 5–8)
// Etapp 5: förskjuten besöksrytm (nivå 1) och rondserie (nivå 2). Förskjutningen flyttar när i
// året tillfällena ligger, aldrig hur ofta (beslut 26). Det finns inget gränssnitt för att sätta
// den än, så testet sätter den med ett historiksteg direkt i planeringen – samma väg som
// balanseringen och flytt för hand kommer att gå.
async function testForskjutning(browser) {
  console.log('Etapp 5 – förskjuten besöksrytm och rondserie');
  const page = await nySida(browser, URL_INDEX, 'kasern1');
  const f = page.locator('#flode');

  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[6] === true, 'standardplaneringen klar i Kasern 1');

  // Utgångsläget: Kasern 1 besöks varje månad, alltså var fjärde vecka från v. 1
  const fore = await page.evaluate(() => ({
    bi: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => t.vecka),
    bs: DP.Plan.rutintillfallen().filter(t => t.rond === 'BS').map(t => t.vecka),
    besok: DP.Plan.besoksveckor()
  }));
  kontroll(fore.bi.slice(0, 3).join(',') === '1,5,9' && fore.bi.length === 13,
    'utan förskjutning ligger månadsronden i v. 1, 5, 9 … (' + fore.bi.length + ' tillfällen)');

  // ---- Nivå 1: byggnadens besöksrytm förskjuts två veckor ----
  const foreHist = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: förskjut besöksrytmen 2 veckor', function (st) { DP.Plan.sattForskjutning(st, 2); });
    return 1;
  });
  await stegKlart(page, foreHist, 'förskjöt besöksrytmen');
  const n1 = await page.evaluate(() => ({
    bi: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => t.vecka),
    bs: DP.Plan.rutintillfallen().filter(t => t.rond === 'BS').map(t => t.vecka),
    bu: DP.Plan.rutintillfallen().filter(t => t.rond === 'BU').map(t => t.vecka),
    besok: DP.Plan.besoksveckor(),
    steg: DP.Plan.stegStatus(),
    freq: DP.Plan.state().ronder.filter(r => r.id === 'BI')[0].freq
  }));
  kontroll(n1.bi.slice(0, 3).join(',') === '3,7,11' && n1.bi.length === fore.bi.length,
    'med förskjutning 2 ligger månadsronden i v. 3, 7, 11 … och antalet tillfällen står still ('
    + n1.bi.length + ')');
  kontroll(JSON.stringify(n1.freq) === JSON.stringify({ typ: 'manad', startManad: null }),
    'frekvensen är oförändrad – förskjutningen flyttar bara när i året tillfällena ligger');
  kontroll(n1.bs.slice(0, 3).join(',') === '3,7,11' && n1.bu.slice(0, 2).join(',') === '3,16',
    'alla byggnadens ronder följer med besöksrytmen (BS v. ' + n1.bs.slice(0, 3).join(',')
    + ', kvartalsronden BU v. ' + n1.bu.slice(0, 2).join(',') + ')');
  kontroll(n1.besok.indexOf(1) < 0 && n1.besok.indexOf(3) >= 0 && n1.besok.length === fore.besok.length,
    'besöksveckorna har flyttat med (' + n1.besok.length + ' veckor, inte längre v. 1)');
  kontroll([1, 2, 3, 4, 5, 6].every(n => n1.steg[n] === true),
    'planeringen är fortfarande klar i alla sex stegen efter förskjutningen');

  // Tidsaxeln visar de förskjutna veckorna, och namnet bygger på den nya veckan
  kontroll(await page.locator('#tidsaxel .ta-cell[data-rond="BI"][data-vecka="3"] .rt-mark').count() === 1
    && await page.locator('#tidsaxel .ta-cell[data-rond="BI"][data-vecka="1"] .rt-mark').count() === 0,
    'tidsaxeln visar månadsronden i v. 3 och inte längre i v. 1');
  const namn = await page.evaluate(() =>
    DP.Plan.rutintillfallen().filter(t => t.rond === 'BI')[0].namn);
  kontroll(namn === 'Kasern1-Byggnad invändigt-2027v03',
    'rutintillfällets namn bygger på den förskjutna veckan: ' + namn);
  await rorelsePaus(page);
  await bild(page, 'etapp5-forskjuten-besoksrytm');

  // ---- Nivå 2: en rondserie förskjuts ovanpå byggnadens förskjutning ----
  const foreN2 = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: förskjut brandskyddsronden 1 vecka', function (st) {
      DP.Plan.sattRondForskjutning(st, 'BS', 1);
    });
    return 1;
  });
  await stegKlart(page, foreN2, 'förskjöt rondserien');
  const n2 = await page.evaluate(() => ({
    bs: DP.Plan.rutintillfallen().filter(t => t.rond === 'BS').map(t => t.vecka),
    bi: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => t.vecka),
    samlad: DP.Plan.rondForskjutning(DP.Plan.state().ronder.filter(r => r.id === 'BS')[0], DP.Plan.state())
  }));
  kontroll(n2.bs.slice(0, 3).join(',') === '4,8,12' && n2.bs.length === fore.bs.length,
    'rondförskjutningen läggs ovanpå byggnadens: 2 + 1 ger v. 4, 8, 12 … (' + n2.bs.slice(0, 3).join(',') + ')');
  kontroll(n2.samlad === 3, 'den samlade förskjutningen för rondserien är 3 veckor (' + n2.samlad + ')');
  kontroll(n2.bi.slice(0, 3).join(',') === '3,7,11',
    'de andra ronderna ligger kvar på byggnadens förskjutning (BI v. ' + n2.bi.slice(0, 3).join(',') + ')');

  // ---- Telefonvyn följer med tillfället till den nya veckan ----
  await page.locator('#tidsaxel .ta-cell[data-rond="BI"][data-vecka="3"] .rt-mark').click();
  await vanta(page, () => document.querySelectorAll('.telefon').length > 0, 'telefonvyn öppen');
  const foreTel = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: förskjut besöksrytmen till 1 vecka', function (st) { DP.Plan.sattForskjutning(st, 1); });
    return 1;
  });
  await stegKlart(page, foreTel, 'ändrade byggnadens förskjutning');
  const tel = await page.evaluate(() => [].map.call(document.querySelectorAll('.telefon'), t => ({
    nyckel: t.dataset.nyckel, titel: t.querySelector('.tf-titel').textContent
  })));
  kontroll(tel.length === 1 && tel[0].nyckel === 'BI:2',
    'telefonvyn följer med tillfället från v. 3 till v. 2 i stället för att stängas ('
    + JSON.stringify(tel.map(t => t.nyckel)) + ')');
  kontroll(tel[0].titel === 'Kasern1-Byggnad invändigt-2027v02',
    'telefonvyn visar det nya namnet: ' + tel[0].titel);

  // ---- En avvikande text på ett rutintillfälle följer med till den nya veckan ----
  const foreText = await historiklangd(page);
  const kopplingBI = await page.evaluate(() => {
    const k = DP.Plan.state().kopplingar.filter(x => x.rond === 'BI' && x.inst !== 'BYGGNAD')[0];
    DP.Plan.andra('Prov: avvikande text i ett rutintillfälle', function (st) {
      DP.Plan.sattTillfalle(st, k, 2, ['Prov: egen punkt i just detta tillfälle']);
    });
    return k;
  });
  await stegKlart(page, foreText, 'satte en avvikande text på rutintillfället');
  kontroll(await page.evaluate(k => DP.Plan.textFor(k, 2).niva === 'tillfalle', kopplingBI),
    'den avvikande texten gäller rutintillfället i v. 2');

  const foreFlytt = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: förskjut besöksrytmen till 3 veckor', function (st) { DP.Plan.sattForskjutning(st, 3); });
    return 1;
  });
  await stegKlart(page, foreFlytt, 'förskjöt besöksrytmen med texten på plats');
  const flyttad = await page.evaluate(k => ({
    nyV4: DP.Plan.textFor(k, 4).niva,
    gamlaV2: DP.Plan.textFor(k, 2).niva,
    avvikelser: DP.Plan.tillfalleAvvikelser(k).map(a => a.vecka + ':' + a.namn)
  }), kopplingBI);
  kontroll(flyttad.nyV4 === 'tillfalle' && flyttad.gamlaV2 === 'standard',
    'den avvikande texten flyttade med tillfället från v. 2 till v. 4 (v. 4: ' + flyttad.nyV4
    + ', v. 2: ' + flyttad.gamlaV2 + ')');
  kontroll(flyttad.avvikelser.length === 1 && flyttad.avvikelser[0].includes('2027v04'),
    'avvikelsen listas på den nya veckan med det nya namnet: ' + flyttad.avvikelser.join(', '));

  // ---- Ångra: veckor, namn och texter kommer tillbaka ----
  await angra(page);
  await vanta(page, () => DP.Plan.state().forskjutning === 1, 'förskjutningen ångrad');
  const angrat = await page.evaluate(k => ({
    bi: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => t.vecka),
    v2: DP.Plan.textFor(k, 2).niva,
    v4: DP.Plan.textFor(k, 4).niva,
    namn: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI')[0].namn
  }), kopplingBI);
  kontroll(angrat.bi.slice(0, 3).join(',') === '2,6,10' && angrat.namn.includes('2027v02'),
    'ångra ger veckorna och namnen tillbaka (v. ' + angrat.bi.slice(0, 3).join(',') + ')');
  kontroll(angrat.v2 === 'tillfalle' && angrat.v4 === 'standard',
    'ångra ger den avvikande texten tillbaka till v. 2');

  // ---- Ett intervall som inte delar året jämnt: tillfällena flyttar ändå med ----
  // Varannan månad (var 8:e vecka) ger 6 eller 7 tillfällen på ett år beroende på fas
  // (beslut 56). Det sista tillfället saknar då motsvarighet efter förskjutningen, men de
  // övriga har flyttat som vanligt och ska bära sina texter med sig. Hade parningen gett upp
  // när listorna är olika långa hade just den frekvensen tappat både texter och animering.
  // Ångra ovanför lämnade historiken en position bakåt, och nästa steg trunkerar den i
  // stället för att förlänga den. Väntan går därför på planeringens innehåll, inte på längden.
  const kopplingVE = await page.evaluate(() => {
    DP.Plan.andra('Prov: varannan månad och text på ett senare tillfälle', function (st) {
      DP.Plan.sattForskjutning(st, 0);
      st.ronder.filter(r => r.id === 'VE')[0].freq = { typ: 'varannan', startManad: null };
      const k = st.kopplingar.filter(x => x.rond === 'VE')[0];
      DP.Plan.sattTillfalle(st, k, 17, ['Prov: egen punkt i det tredje tillfället']);
    });
    return DP.Plan.state().kopplingar.filter(x => x.rond === 'VE')[0];
  });
  await vanta(page, () => DP.Plan.state().ronder.filter(r => r.id === 'VE')[0].freq.typ === 'varannan'
    && DP.Plan.state().forskjutning === 0, 'varannan månad satt utan förskjutning');
  const varFore = await page.evaluate(() => DP.Plan.rutintillfallen().filter(t => t.rond === 'VE').map(t => t.vecka));
  kontroll(varFore.join(',') === '1,9,17,25,33,41,49',
    'varannan månad utan förskjutning ger 7 tillfällen: v. ' + varFore.join(','));

  const foreVar2 = await historiklangd(page);
  await page.evaluate(() => {
    DP.Plan.andra('Prov: förskjut byggnaden 4 veckor', function (st) { DP.Plan.sattForskjutning(st, 4); });
    return 1;
  });
  await stegKlart(page, foreVar2, 'förskjöt med varannan månad i planeringen');
  const varEfter = await page.evaluate(k => ({
    ve: DP.Plan.rutintillfallen().filter(t => t.rond === 'VE').map(t => t.vecka),
    v21: DP.Plan.textFor(k, 21).niva,
    v17: DP.Plan.textFor(k, 17).niva
  }), kopplingVE);
  kontroll(varEfter.ve.join(',') === '5,13,21,29,37,45',
    'förskjuten 4 veckor blir det 6 tillfällen – det sjunde ryms inte i året: v. ' + varEfter.ve.join(','));
  kontroll(varEfter.v21 === 'tillfalle' && varEfter.v17 === 'standard',
    'texten följer med från v. 17 till v. 21 fast rondserien tappade ett tillfälle (v. 21: '
    + varEfter.v21 + ', v. 17: ' + varEfter.v17 + ')');
  await angra(page);
  await vanta(page, () => DP.Plan.state().forskjutning === 0, 'förskjutningen av varannan månad ångrad');
  kontroll(await page.evaluate(k => DP.Plan.textFor(k, 17).niva === 'tillfalle', kopplingVE),
    'ångra ger texten tillbaka till v. 17');

  // ---- Halvårsrond med vald startmånad stannar i sin månad (beslut 41) ----
  await byggnadsval(page, 'garage');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[6] === true, 'standardplaneringen klar i Garage');
  const g0 = await page.evaluate(() => ({
    bi: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => t.vecka),
    man: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => DP.Plan.manadForVecka(t.vecka)),
    bas: DP.Plan.state().bas
  }));
  kontroll(g0.bas.typ === 'halvar' && g0.bas.startManad === 4 && g0.bi.join(',') === '14,40',
    'Garaget besöks varje halvår med start i april: v. ' + g0.bi.join(','));

  // En stor förskjutning: varje tillfälle flyttas så långt det går inom sin egen månad
  for (const [fsk, vantat, text] of [[2, '16,42', 'liten'], [9, '17,43', 'stor']]) {
    const h = await historiklangd(page);
    await page.evaluate(n => {
      DP.Plan.andra('Prov: förskjut garaget ' + n + ' veckor', function (st) { DP.Plan.sattForskjutning(st, n); });
      return 1;
    }, fsk);
    await stegKlart(page, h, 'förskjöt garaget ' + fsk + ' veckor');
    const g = await page.evaluate(() => ({
      bi: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => t.vecka),
      man: DP.Plan.rutintillfallen().filter(t => t.rond === 'BI').map(t => DP.Plan.manadForVecka(t.vecka))
    }));
    kontroll(g.bi.join(',') === vantat && g.man.join(',') === '3,9',
      'halvårsronden med startmånad april stannar i april och oktober vid en ' + text
      + ' förskjutning (' + fsk + ' v. → v. ' + g.bi.join(',') + ')');
  }

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

async function testProcesslinjen(browser) {
  console.log('Etapp 5 – processlinjen och ordlistan');
  // Användarens skärm är 1920×1200, och huvudvyn ska rymmas där utan att sidan scrollar.
  // Resten av sviten kör 1090 px höjd; här är hela höjden själva saken som prövas.
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.fel = [];
  page.on('pageerror', e => page.fel.push(e.message));
  page.on('console', m => { if (m.type() === 'error') { page.fel.push(m.text()); } });
  page.on('dialog', d => d.accept());
  await page.goto(URL_INDEX);
  await vanta(page, () => !!(window.DP && DP.Vyer && DP.Flode && DP.viewer)
    && !!document.querySelector('.pl-steg'), 'appen ritad med processlinje');

  const steg = page.locator('.pl-steg');
  kontroll(await steg.count() === 3
    && (await steg.nth(0).getAttribute('data-steg')) === 'byggnad'
    && (await steg.nth(1).getAttribute('data-steg')) === 'planering'
    && (await steg.nth(2).getAttribute('data-steg')) === 'balansering',
    'processlinjen visar Byggnad, Planering och Balansering i den ordningen');
  kontroll(await page.locator('.flik').count() === 0 && await page.locator('#flik-begrepp').count() === 0,
    'de gamla flikarna finns inte kvar');

  // Berättelse 2: hur långt Planering har kommit. Ingen byggnad har en planering vid start.
  const planeringSteg = page.locator('.pl-steg[data-steg="planering"]');
  kontroll((await planeringSteg.innerText()).includes('0 av 4 byggnader klara'),
    'Planering visar hur många byggnader som är klara: "' + (await planeringSteg.innerText()).replace(/\n/g, ' ') + '"');

  // Berättelse 5–6: ordlistan öppnas utan att man lämnar steget man står i
  await page.locator('#ordlista-knapp').click();
  await page.waitForSelector('.ordlista');
  const ordlistaText = await page.locator('.ordlista').innerText();
  const nya = ['Balansering', 'Planerad tid', 'Dagsdel', 'Område', 'Kapacitet', 'Besöksrytm',
    'Rondserie', 'Provisorisk flytt', 'Stryka'];
  const saknas = nya.filter(o => !ordlistaText.includes(o));
  kontroll(saknas.length === 0, 'ordlistan innehåller de nya begreppen' + (saknas.length ? ' (saknas: ' + saknas.join(', ') + ')' : ''));
  kontroll(await page.locator('#hs-planering').isVisible() && !await page.locator('#hs-planering').getAttribute('hidden'),
    'ordlistan öppnas utan att man lämnar Planering');
  await bild(page, 'etapp5-ordlista');
  await page.keyboard.press('Escape');
  await vanta(page, () => !document.querySelector('.ordlista'), 'ordlistan stängd');

  // Ordlistan går att öppna från alla tre huvudstegen
  for (const id of ['byggnad', 'planering', 'balansering']) {
    await page.locator('.pl-steg[data-steg="' + id + '"]').click();
    await page.locator('#ordlista-knapp').click();
    await page.waitForSelector('.ordlista');
    kontroll(await page.locator('.ordlista').isVisible(), 'ordlistan öppnas från huvudsteget ' + id);
    await page.keyboard.press('Escape');
    await vanta(page, () => !document.querySelector('.ordlista'), 'ordlistan stängd i ' + id);
  }

  // Berättelse 3: Byggnad går alltid att öppna och har ingen bock
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  kontroll(await page.locator('#trad').isVisible() && !(await page.locator('.pl-steg[data-steg="byggnad"]').innerText()).includes('✓'),
    'Byggnad går att öppna direkt och har ingen bock');
  await bild(page, 'etapp5-huvudsteg-byggnad');

  // Berättelse 7–8: 3D-vyn ger plats åt Balansering, men byggs inte om. Kamera och val
  // ska finnas kvar, så de läses före och efter – inte bara synligheten.
  await page.locator('.pl-steg[data-steg="planering"]').click();
  const f = page.locator('#flode');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.stegStatus()[6] === true, 'garaget klart i alla sex stegen');
  kontroll((await planeringSteg.innerText()).includes('1 av 4 byggnader klara'),
    'Planering räknas upp när en byggnad får alla sex stegen klara');

  // Välj en installation, så att valet går att känna igen efter besöket i Balansering
  await page.evaluate(() => DP.viewer.valjInstallation(DP.Plan.signifikanta()[0], true));
  await rorelsePaus(page);
  const fore = await page.evaluate(() => ({
    vald: DP.viewer.valdInst && DP.viewer.valdInst.id,
    kamera: [DP.viewer.camera.position.x, DP.viewer.camera.position.y, DP.viewer.camera.position.z],
    scen: DP.viewer.scene.uuid
  }));
  await bild(page, 'etapp5-huvudsteg-planering');

  await page.locator('.pl-steg[data-steg="balansering"]').click();
  kontroll(!await page.locator('#vy').isVisible() && await page.locator('#balansering-yta').isVisible(),
    '3D-vyn är dold i Balansering och ytan går till balanseringsvyn');
  kontroll(!await page.locator('#tidsaxel').isVisible() && !await page.locator('#telefoner').isVisible(),
    'planeringens tidsaxel och telefonvyerna visas inte i Balansering');
  await bild(page, 'etapp5-huvudsteg-balansering');

  await page.locator('.pl-steg[data-steg="planering"]').click();
  const efter = await page.evaluate(() => ({
    vald: DP.viewer.valdInst && DP.viewer.valdInst.id,
    kamera: [DP.viewer.camera.position.x, DP.viewer.camera.position.y, DP.viewer.camera.position.z],
    scen: DP.viewer.scene.uuid
  }));
  kontroll(await page.locator('#vy').isVisible(), '3D-vyn syns igen i Planering');
  kontroll(efter.vald === fore.vald && efter.vald,
    'samma installation är vald efter besöket i Balansering (' + efter.vald + ')');
  kontroll(efter.scen === fore.scen && JSON.stringify(efter.kamera) === JSON.stringify(fore.kamera),
    'vyn byggdes inte om: samma scen och samma kameraläge');

  // Huvudvyn ska rymmas på 1920×1200 utan att sidan scrollar.
  //
  // `document.scrollHeight > innerHeight` duger inte som villkor: style.css sätter
  // `html, body { overflow: hidden }`, så dokumentet kan aldrig växa förbi fönstret och
  // kontrollen hade varit sann vad som än ritades. Två saker mäts i stället. Att layouten
  // slutar vid fönsterkanten är det ena. Det andra är att processlinjen och ordlisteraden
  // inte äter upp sidopanelen: de är nya och ligger ovanför steginnehållet, så växer de
  // blir steget obrukbart smalt långt innan något sticker ut ur sidan.
  for (const id of ['byggnad', 'planering', 'balansering']) {
    await page.locator('.pl-steg[data-steg="' + id + '"]').click();
    const matt = await page.evaluate(stegId => {
      const h = e => Math.round(document.querySelector(e).getBoundingClientRect().height);
      const layout = document.querySelector('.layout').getBoundingClientRect();
      return {
        fonster: window.innerHeight,
        layoutBotten: Math.round(layout.bottom),
        huvud: h('.processlinje') + h('.pl-rad'),
        innehall: h('#hs-' + stegId)
      };
    }, id);
    kontroll(matt.layoutBotten <= matt.fonster,
      'layouten slutar vid fönsterkanten i huvudsteget ' + id +
      ' (' + matt.layoutBotten + ' av ' + matt.fonster + ' px)');
    kontroll(matt.huvud <= 140 && matt.innehall >= 800,
      'processlinjen och ordlisteraden lämnar plats åt huvudsteget ' + id +
      ' (' + matt.huvud + ' px huvud, ' + matt.innehall + ' px innehåll)');
  }

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Mediaspelaren på en fast plats i alla huvudsteg (beslut 82, biljett #31).
//
// Den satt tidigare i Planeringens tidsaxel, som är dold i Balansering, och Balansering hade
// därför en egen knapp *Ångra balanseringen*. Nu ligger spelaren högst upp i toppraden och
// syns i alla tre huvudstegen, så den egna knappen är borta.
//
// Tre saker prövas: att den ligger på **samma** plats i alla tre steg (samma rektangel, inte
// bara "syns"), att ångra och gör om fungerar från varje steg – även för Balanseringens enda
// stora steg – och att den inte stjäl höjd från huvudvyn på användarens 1920×1200.
async function testMediaspelaren(browser) {
  console.log('Mediaspelaren på en fast plats i alla huvudsteg');
  const page = await nySida(browser, URL_INDEX, null, 1200);

  // ---- Samma plats i alla tre huvudsteg ----
  // Spelaren hör till toppraden och inte till någon vy, så den ska ligga stilla på pixeln när
  // huvudsteget byts. Rektangeln jämförs, inte bara synligheten: en spelare som hoppar mellan
  // stegen är inte en fast plats, och det är just det löftet som gör att man vågar byta steg.
  const lagen = {};
  for (const id of ['byggnad', 'planering', 'balansering']) {
    await page.locator('.pl-steg[data-steg="' + id + '"]').click();
    await vanta(page, stegId => DP.Vyer.aktivt() === stegId, 'huvudsteget ' + id, id);
    lagen[id] = await page.evaluate(() => {
      const r = document.querySelector('#spelare').getBoundingClientRect();
      const topp = document.querySelector('.topp').getBoundingClientRect();
      return {
        synlig: !!document.querySelector('#spelare .sp-knapp'),
        x: Math.round(r.x), y: Math.round(r.y), bredd: Math.round(r.width), hojd: Math.round(r.height),
        iToppraden: r.top >= topp.top && r.bottom <= topp.bottom,
        knappar: document.querySelectorAll('#spelare .sp-knapp').length
      };
    });
    kontroll(lagen[id].synlig && lagen[id].knappar === 4,
      'mediaspelaren syns med sina fyra knappar i huvudsteget ' + id);
    kontroll(lagen[id].iToppraden,
      'mediaspelaren ligger i toppraden i huvudsteget ' + id);
  }
  const plats = o => o.x + ',' + o.y + ',' + o.bredd + ',' + o.hojd;
  kontroll(plats(lagen.byggnad) === plats(lagen.planering)
    && plats(lagen.planering) === plats(lagen.balansering),
    'mediaspelaren ligger på exakt samma plats i alla tre huvudstegen (' + plats(lagen.planering) + ')');
  // Den gamla platsen i tidsaxelns huvud ska vara tom: två spelare hade varit två svar på
  // samma fråga, och den i tidsaxeln försvinner i Balansering.
  kontroll(await page.locator('.ta-huvud .spelare').count() === 0,
    'mediaspelaren ligger inte kvar i tidsaxelns huvud');

  // ---- Ångra och gör om från varje huvudsteg ----
  // Ett steg görs i Planering och ångras/görs om därifrån, sedan samma sak med huvudsteget
  // Byggnad framme: steget hör till planeringen, men vägen tillbaka ska finnas där man står.
  await page.locator('.pl-steg[data-steg="planering"]').click();
  const f = page.locator('#flode');
  for (const steg of ['byggnad', 'planering']) {
    const forePos = await historikpos(page);
    await f.locator('button.val', { hasText: forePos ? 'Varje kvartal' : 'Varje månad' }).click();
    await stegKlartPos(page, forePos, 'besöksfrekvens i huvudsteget ' + steg);
    const bas = await page.evaluate(() => DP.Plan.state().bas.typ);
    await page.locator('.pl-steg[data-steg="' + steg + '"]').click();
    await angra(page);
    const efterAngra = await page.evaluate(() => DP.Plan.state().bas && DP.Plan.state().bas.typ);
    kontroll(efterAngra !== bas,
      'ångra från mediaspelaren tar tillbaka steget med huvudsteget ' + steg +
      ' framme (' + bas + ' → ' + efterAngra + ')');
    await gorOm(page);
    const efterGorOm = await page.evaluate(() => DP.Plan.state().bas && DP.Plan.state().bas.typ);
    kontroll(efterGorOm === bas,
      'gör om från mediaspelaren lägger tillbaka steget med huvudsteget ' + steg + ' framme');
    await page.locator('.pl-steg[data-steg="planering"]').click();
  }

  // ---- Balanseringens enda steg, ångrat från Balansering ----
  // Löftet i beslut 36 är att hela balanseringen är **ett** steg i historiken. Det löftet var
  // osynligt i Balansering så länge spelaren satt i tidsaxeln; nu prövas det där det gäller.
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await vanta(page, () => DP.Plan.klaraByggnader().length === 4, 'alla fyra byggnaderna klara');
  await page.locator('#balansera-knapp').click();
  await vanta(page, () => DP.Plan.balanseringStatus().balanserad, 'balanseringen gjord');
  kontroll(await page.locator('#bal-angra').count() === 0,
    'knappen Ångra balanseringen finns inte kvar i Balansering');
  const efterBal = await page.evaluate(() =>
    DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).forskjutning || 0).join(','));
  await angra(page);
  await vanta(page, () => !DP.Plan.balanseringStatus().balanserad, 'balanseringen ångrad');
  kontroll(await page.evaluate(() =>
    DP.Plan.byggnadsordning.every(id => !DP.Plan.stateFor(id).forskjutning)),
    'ett ◀ i mediaspelaren tar tillbaka hela balanseringen');
  await gorOm(page);
  await vanta(page, () => DP.Plan.balanseringStatus().balanserad, 'balanseringen tillbaka');
  kontroll(await page.evaluate(() =>
    DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).forskjutning || 0).join(',')) === efterBal,
    'gör om lägger tillbaka samma förskjutningar (' + efterBal + ')');
  await bild(page, 'mediaspelaren-balansering');

  // ---- Utrymmet: huvudvyn ryms fortfarande på 1920×1200 ----
  // Spelaren ligger i toppraden som redan fanns, så den ska inte ha kostat någon höjd. Samma
  // två mått som processlinjens test: layouten slutar vid fönsterkanten, och sidopanelens
  // huvud lämnar plats åt steginnehållet.
  for (const id of ['byggnad', 'planering', 'balansering']) {
    await page.locator('.pl-steg[data-steg="' + id + '"]').click();
    const matt = await page.evaluate(stegId => {
      const h = e => Math.round(document.querySelector(e).getBoundingClientRect().height);
      return {
        fonster: window.innerHeight,
        layoutBotten: Math.round(document.querySelector('.layout').getBoundingClientRect().bottom),
        topp: h('.topp'),
        innehall: h('#hs-' + stegId)
      };
    }, id);
    kontroll(matt.layoutBotten <= matt.fonster && matt.topp <= 60 && matt.innehall >= 800,
      'huvudvyn ryms med mediaspelaren i huvudsteget ' + id +
      ' (topprad ' + matt.topp + ' px, layout slutar på ' + matt.layoutBotten + ' av ' + matt.fonster + ' px)');
  }

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: Balanseringens tidsaxel – belastning per utförare (berättelse 25–27 och 50–55).
//
// Två saker prövas. Den ena är modulen DP.Balansering, med ett underlag som byggs direkt i
// testet: den är en ren uträkning utan DOM, så den går att ställa precis vilken fråga som helst
// utan att klicka ihop en planering som råkar ge rätt siffror. Den andra är tidsaxeln i sidan,
// med den planering som standardplaneringen faktiskt ger.
async function testBalanseringensTidsaxel(browser) {
  console.log('Etapp 5 – Balanseringens tidsaxel');
  const page = await nySida(browser, URL_INDEX);

  // ------------------------------------------------------------------
  // Belastningsfunktionen, med underlag som byggs i testet
  // ------------------------------------------------------------------
  const bel = await page.evaluate(() => {
    const B = DP.Balansering;
    // Två byggnader, en utförare. Kapacitet 2 dagar = 16 h.
    const underlag = {
      antalVeckor: 10,
      utforare: [{ id: 'anna', namn: 'Anna Berg', farg: '#4f6fd0' }, { id: 'bertil', namn: 'Bertil Ek', farg: '#c8642f' }],
      kapacitet: { anna: 2 },           // bertil utelämnad -> förvalet gäller
      veckorUtan: [7],
      byggnader: [
        { id: 'a', namn: 'Hus A', farg: '#111', omrade: 'o1', ronder: [
          { id: 'R1', namn: 'Rond 1', utforare: 'anna', timmar: 8, dagsdel: 'heldag', veckor: [1, 3, 5] },
          { id: 'R2', namn: 'Rond 2', utforare: 'anna', timmar: 4, dagsdel: 'halvdag', veckor: [1] }
        ] },
        { id: 'b', namn: 'Hus B', farg: '#222', omrade: 'o1', ronder: [
          { id: 'R1', namn: 'Rond 1', utforare: 'anna', timmar: 8, dagsdel: 'heldag', veckor: [1] },
          { id: 'R3', namn: 'Rond 3', utforare: 'bertil', timmar: 1, dagsdel: 'kort', veckor: [2] }
        ] }
      ]
    };
    const r = B.belastning(underlag);
    const anna = r.rad('anna'), bertil = r.rad('bertil');
    // Sju korta tillfällen samma vecka: tiden räcker (7 h av 24 h) men antalet gör inte det
    const mjuk = B.belastning({
      antalVeckor: 3,
      utforare: [{ id: 'anna', namn: 'Anna Berg' }],
      byggnader: [{ id: 'a', namn: 'Hus A', ronder: [1, 2, 3, 4, 5, 6, 7].map(n => (
        { id: 'R' + n, namn: 'Rond ' + n, utforare: 'anna', timmar: 1, veckor: [2] })) }]
    }).rad('anna');
    const sex = B.belastning({
      antalVeckor: 3,
      utforare: [{ id: 'anna', namn: 'Anna Berg' }],
      byggnader: [{ id: 'a', namn: 'Hus A', ronder: [1, 2, 3, 4, 5, 6].map(n => (
        { id: 'R' + n, namn: 'Rond ' + n, utforare: 'anna', timmar: 1, veckor: [2] })) }]
    }).rad('anna');
    return {
      v1: { timmar: anna.veckor[1].timmar, dagar: anna.veckor[1].dagar, antal: anna.veckor[1].antal,
            over: anna.veckor[1].over, manga: anna.veckor[1].manga,
            namn: anna.veckor[1].tillfallen.map(t => t.byggnad + ':' + t.rond) },
      v3: { timmar: anna.veckor[3].timmar, antal: anna.veckor[3].antal, over: anna.veckor[3].over },
      v2tom: { timmar: anna.veckor[2].timmar, antal: anna.veckor[2].antal },
      v7utan: anna.veckor[7].utanTillsyn,
      annaKap: anna.kapacitetTimmar, bertilKap: bertil.kapacitetTimmar,
      annaOver: anna.over, annaTillfallen: anna.tillfallen, annaTopp: anna.toppTimmar,
      bertilTillfallen: bertil.tillfallen,
      mjuk: { antal: mjuk.veckor[2].antal, timmar: mjuk.veckor[2].timmar, manga: mjuk.veckor[2].manga, over: mjuk.veckor[2].over, veckor: mjuk.manga },
      sex: { antal: sex.veckor[2].antal, manga: sex.veckor[2].manga }
    };
  });

  // Planerad tid i dagar: 20 h på 8 h/dag = 2,5 dagar
  kontroll(bel.v1.timmar === 20 && bel.v1.dagar === 2.5 && bel.v1.antal === 3,
    'belastningen i v. 1 är 20 h = 2,5 dagar på 3 rutintillfällen (' + bel.v1.timmar + ' h, ' + bel.v1.dagar + ' dagar, ' + bel.v1.antal + ' st)');
  kontroll(JSON.stringify(bel.v1.namn) === JSON.stringify(['a:R1', 'a:R2', 'b:R1']),
    'cellen vet vilka rutintillfällena är, i samma ordning varje gång: ' + bel.v1.namn.join(', '));
  kontroll(bel.annaKap === 16 && bel.bertilKap === 24,
    'kapaciteten är dagarna × 8 h, och en utförare utan svar får förvalet 3 dagar (' + bel.annaKap + ' h, ' + bel.bertilKap + ' h)');
  kontroll(bel.v1.over === true && bel.v3.over === false,
    'v. 1 är över kapaciteten (20 h av 16 h) och v. 3 är det inte (' + bel.v3.timmar + ' h)');
  kontroll(JSON.stringify(bel.annaOver) === JSON.stringify([1]) && bel.annaTopp === 20,
    'raden sammanfattar vilka veckor som är över och hur hög toppen är (v. ' + bel.annaOver.join(', ') + ', ' + bel.annaTopp + ' h)');
  kontroll(bel.v2tom.timmar === 0 && bel.v2tom.antal === 0 && bel.annaTillfallen === 5 && bel.bertilTillfallen === 1,
    'tomma veckor är tomma och årssumman räknar varje tillfälle en gång (Anna ' + bel.annaTillfallen + ', Bertil ' + bel.bertilTillfallen + ')');
  kontroll(bel.v7utan === true, 'veckor utan tillsyn och skötsel är markerade i cellen');

  // Den mjuka varningen: fler än 6 tillfällen, även när tiden räcker (beslut 31)
  kontroll(bel.mjuk.antal === 7 && bel.mjuk.manga === true && bel.mjuk.over === false && bel.mjuk.timmar === 7,
    'fler än 6 rutintillfällen ger varningen även när tiden räcker (7 st, ' + bel.mjuk.timmar + ' h av 24 h, över: ' + bel.mjuk.over + ')');
  kontroll(JSON.stringify(bel.mjuk.veckor) === JSON.stringify([2]), 'raden vet vilka veckor som har för många tillfällen');
  kontroll(bel.sex.antal === 6 && bel.sex.manga === false,
    'exakt 6 tillfällen ger ingen varning – gränsen går vid fler än 6');

  // Samma underlag ger samma svar: uträkningen är deterministisk (berättelse 49)
  const lika = await page.evaluate(() => {
    const u = {
      antalVeckor: 5,
      utforare: [{ id: 'anna', namn: 'Anna' }],
      byggnader: [
        { id: 'b', namn: 'B', ronder: [{ id: 'R', namn: 'R', utforare: 'anna', timmar: 2, veckor: [1, 3] }] },
        { id: 'a', namn: 'A', ronder: [{ id: 'R', namn: 'R', utforare: 'anna', timmar: 2, veckor: [1] }] }
      ]
    };
    const ett = DP.Balansering.belastning(u).rad('anna').veckor[1].tillfallen.map(t => t.byggnad);
    const tva = DP.Balansering.belastning(u).rad('anna').veckor[1].tillfallen.map(t => t.byggnad);
    return { ett, tva };
  });
  kontroll(JSON.stringify(lika.ett) === JSON.stringify(lika.tva) && JSON.stringify(lika.ett) === JSON.stringify(['a', 'b']),
    'samma underlag ger samma resultat två gånger (' + lika.ett.join(', ') + ')');

  // ------------------------------------------------------------------
  // Tidsaxeln i sidan
  // ------------------------------------------------------------------
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => !!document.querySelector('#balansering .bal-byggnad'), 'Balansering ritad');

  // Berättelse 26: ingen byggnad är planerad än, så alla fyra är gråade med en länk till Planering
  kontroll(await page.locator('.bal-byggnad.grad').count() === 4 && await page.locator('.bal-byggnad .bal-lank').count() === 4,
    'alla fyra byggnader är gråade med en länk till Planering innan något är planerat');
  kontroll((await page.locator('.bt-tom').innerText()).includes('Ingen byggnad är klar'),
    'tidsaxeln säger varför den är tom');

  // Länken öppnar Planering för just den byggnaden
  await page.locator('.bal-byggnad[data-byggnad="kasern1"] .bal-lank').click();
  await vanta(page, () => DP.Plan.aktivId() === 'kasern1' && DP.Vyer.aktivt() === 'planering', 'Planering för Kasern 1');
  kontroll(await page.evaluate(() => DP.Plan.aktivId()) === 'kasern1' && await page.locator('#hs-planering').isVisible(),
    'länken på en gråad byggnad öppnar Planering för just den byggnaden');

  // Berättelse 27: standardplanering åt alla som saknar planering, i ett enda historiksteg
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  const foreHist = await historiklangd(page);
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await stegKlart(page, foreHist, 'standardplanering för alla');
  await vanta(page, () => document.querySelectorAll('.bt-utforare').length === 4, 'tidsaxeln ritad med fyra utförare');

  const efter = await page.evaluate(() => ({
    klara: DP.Plan.klaraByggnader(),
    hist: DP.Plan.historik().lista.length,
    aktiv: DP.Plan.aktivId()
  }));
  kontroll(efter.klara.length === 4 && efter.hist === foreHist + 1,
    'alla fyra byggnaderna räknas med efter "Standardplanering för alla", i ett enda historiksteg');
  kontroll(await page.locator('.bal-byggnad.grad').count() === 0 && await page.locator('.bal-med').count() === 4,
    'ingen byggnad är gråad längre');

  // Ett enda ångra tar bort planeringen i alla byggnader som fick den
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await angra(page);
  const angrat = await page.evaluate(() => ({ klara: DP.Plan.klaraByggnader(), aktiv: DP.Plan.aktivId() }));
  kontroll(angrat.klara.length === 0, 'ett enda ångra tar bort planeringen i alla byggnader som fick den');
  kontroll(angrat.aktiv === efter.aktiv, 'ångra av steget byter inte aktiv byggnad (' + angrat.aktiv + ')');
  await gorOm(page);
  await vanta(page, () => DP.Plan.klaraByggnader().length === 4, 'gör om ger planeringen tillbaka');

  // Tidsaxeln: en rad per utförare och en kolumn per vecka för hela året (berättelse 50)
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => document.querySelectorAll('.bt-utforare').length === 4, 'tidsaxeln ritad igen');
  const veckor = await page.evaluate(() => DP.Plan.ANTAL_VECKOR);
  kontroll(await page.locator('.bt-utforare').count() === 4 && await page.locator('.bt-vecka').count() === veckor,
    'en rad per utförare och en kolumn per vecka för hela året (' + veckor + ' veckor)');

  // Berättelse 51: cellen visar hur full veckan är. Annas topp med standardplaneringen är
  // v. 1: sex rutintillfällen och 26 h mot kapaciteten 24 h, alltså en överfull cell.
  //
  // Biljett #14 och beslut 44 säger "8 rutintillfällen" i v. 1. Den siffran stämmer inte med
  // den standardplanering koden faktiskt skapar: garaget är halvårsrond med start i april och
  // ligger i v. 14 och 40, och Byggnad utvändigt är kvartalsrond i kasernerna och hangaren.
  // Anna får därför 6 tillfällen i v. 1, och ingen vecka i året når över 6. Testet kontrollerar
  // det koden ger – överfull cell ja, mjuk varning nej – och den mjuka varningen prövas i
  // stället mot ett eget underlag ovan. Avvikelsen är anmäld som en egen biljett.
  const topp = await page.evaluate(() => {
    const bel = DP.Balansering.belastning(DP.Plan.balanseringsUnderlag());
    const anna = bel.rad('anna');
    return { over: anna.over, timmar: anna.veckor[1].timmar, antal: anna.veckor[1].antal, kap: anna.kapacitetTimmar };
  });
  kontroll(topp.timmar === 26 && topp.antal === 6 && topp.kap === 24 && JSON.stringify(topp.over) === JSON.stringify([1]),
    'Annas topp ligger i v. 1: ' + topp.antal + ' rutintillfällen och ' + topp.timmar + ' h mot ' + topp.kap + ' h');
  const cell = page.locator('.bt-cell[data-utforare="anna"][data-vecka="1"]');
  kontroll((await cell.getAttribute('class')).includes('over') && (await cell.getAttribute('data-antal')) === '6',
    'cellen för Annas v. 1 är markerad som överfull');
  kontroll((await page.locator('.bt-fot-text').innerText()).includes('Anna Berg')
    && (await page.locator('.bt-fot-text').innerText()).includes('v. 1'),
    'förklaringen under tidsaxeln säger vem som har för mycket och vilken vecka');

  // Berättelse 53: brickorna har byggnadens färg
  const fargerIV1 = await page.evaluate(() => {
    const c = document.querySelector('.bt-cell[data-utforare="anna"][data-vecka="1"]');
    return Array.prototype.map.call(c.querySelectorAll('.bt-bricka'), b => b.dataset.byggnad + '=' + b.style.background);
  });
  const vantade = await page.evaluate(() => ({
    kasern1: DP.Plan.byggnad('kasern1').farg, kasern2: DP.Plan.byggnad('kasern2').farg, hangar: DP.Plan.byggnad('hangar').farg
  }));
  const rgb = h => { const n = parseInt(h.slice(1), 16); return 'rgb(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')'; };
  kontroll(fargerIV1.length === 6
    && fargerIV1.filter(f => f.startsWith('kasern1=')).every(f => f.endsWith(rgb(vantade.kasern1)))
    && fargerIV1.filter(f => f.startsWith('hangar=')).every(f => f.endsWith(rgb(vantade.hangar))),
    'brickorna har byggnadens färg (' + fargerIV1.join(', ') + ')');

  // Berättelse 54: en utförare kan fällas ut till en rad per byggnad
  kontroll(await page.locator('.bt-under').count() === 0, 'ingen utförare är utfälld från början');
  await page.locator('.bt-fall[data-utforare="anna"]').click();
  await vanta(page, () => document.querySelectorAll('.bt-under').length > 0, 'Anna utfälld');
  const utfallda = await page.locator('.bt-under .bt-bnamn').allInnerTexts();
  kontroll(utfallda.length === 4 && utfallda.join(',') === 'Garage,Kasern 1,Kasern 2,Hangar',
    'Anna fälls ut till en rad per byggnad hon har tillfällen i: ' + utfallda.join(', '));
  const ubricka = await page.evaluate(() => {
    const c = document.querySelector('.bt-ucell[data-utforare="anna"][data-byggnad="kasern1"][data-vecka="1"]');
    const b = c && c.querySelector('.bt-bricka');
    return b ? b.style.background : null;
  });
  kontroll(ubricka === rgb(vantade.kasern1), 'brickorna i den utfällda raden har också byggnadens färg (' + ubricka + ')');
  await bild(page, 'etapp5-balansering-utfalld');
  await page.locator('.bt-fall[data-utforare="anna"]').click();
  await vanta(page, () => document.querySelectorAll('.bt-under').length === 0, 'Anna infälld igen');

  // Berättelse 55: klick på en vecka visar rutintillfällena med planerad tid och antal
  await page.locator('.bt-cell[data-utforare="anna"][data-vecka="1"]').click();
  await vanta(page, () => !!document.querySelector('.bal-tillfalle'), 'veckolistan öppen');
  const sum = await page.locator('.bal-vsum').innerText();
  kontroll(sum.includes('6 av 6') && sum.includes('26 h av 24 h'),
    'veckolistan visar antalet som "x av 6" och tiden mot kapaciteten: ' + sum.replace(/\n/g, ' '));
  const rader = await page.locator('.bal-tillfalle').allInnerTexts();
  kontroll(rader.length === 6 && rader.some(r => r.includes('Kasern 1 · Byggnad invändigt') && r.includes('heldag'))
    && rader.some(r => r.includes('Hangar · Byggnad invändigt') && r.includes('halvdag')),
    'varje rutintillfälle visas med byggnad, rond och planerad tid (' + rader.length + ' rader)');
  kontroll((await page.locator('.bal-varning').first().innerText()).includes('Tiden räcker inte'),
    'veckolistan säger rakt ut att tiden inte räcker');

  // En vecka inom kapaciteten visar ingen varning
  await page.locator('.bt-cell[data-utforare="anna"][data-vecka="5"]').click();
  await vanta(page, () => {
    const h = document.querySelector('.bal-veckolista h3');
    return h && h.textContent.indexOf('v. 5') >= 0;
  }, 'veckolistan för v. 5');
  kontroll(await page.locator('.bal-varning').count() === 0 && (await page.locator('.bal-vsum').innerText()).includes('av 6'),
    'en vecka inom kapaciteten visas utan varning');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Huvudvyn ska rymmas på 1920×1200 utan att sidan scrollar, även i Balansering med fyra
// utförare och hela året. Samma mätning som i processlinjetestet: overflow:hidden gör att
// dokumentet aldrig kan växa förbi fönstret, så det är layoutens underkant och tidsaxelns
// egen scrollhöjd som säger om något inte får plats.
// Öppnar en av Balanseringens frågor om den inte redan är öppen. Ett klick på en öppen fråga
// stänger den, så ett villkorslöst klick hade gett motsatt läge beroende på vad som hänt före.
// Öppnar ett stegkort i flödet på dess titel och svarar med kortets text. Bara ett kort kan
// vara öppet åt gången, så den som vill läsa två kort måste öppna dem i tur och ordning.
async function oppnaSteg(page, titel) {
  const kort = page.locator('.steg-kort', { hasText: titel }).first();
  if (!(await kort.getAttribute('class')).includes('oppen')) {
    await kort.locator('.steg-huvud').first().click();
  }
  await vanta(page, t => {
    const k = document.querySelector('.steg-kort.oppen .steg-titel');
    return !!k && k.textContent.indexOf(t) >= 0;
  }, 'stegkortet "' + titel + '" öppet', titel);
  return kort.innerText();
}

async function oppnaFraga(page, n) {
  if (!await page.locator('.bal-fraga[data-fraga="' + n + '"].oppen').count()) {
    await page.locator('.bal-fraga[data-fraga="' + n + '"] .steg-huvud').click();
  }
  await vanta(page, nr => !!document.querySelector('.bal-fraga[data-fraga="' + nr + '"].oppen .steg-kropp'),
    'fråga ' + n + ' öppen', n);
}

// Etapp 5: Balansera – de två frågorna, uträkningen och vad som händer efteråt (biljett #15).
//
// Uträkningen prövas med underlag som byggs i testet, med planeringens egen veckoräknare
// inskickad. Då gäller de riktiga reglerna om frekvenser (bland dem beslut 41 om
// halvårsronder med startmånad) utan att något tillstånd behöver sättas upp först.
async function testBalansera(browser) {
  console.log('Etapp 5 – Balansera');
  const page = await nySida(browser, URL_INDEX);

  // ------------------------------------------------------------------
  // Uträkningen, med underlag som byggs i testet
  // ------------------------------------------------------------------
  const rakning = await page.evaluate(() => {
    const P = DP.Plan, B = DP.Balansering;
    // En byggnad i underlagsform. Timmarna och frekvensen är det som styr uträkningen.
    const hus = (id, namn, omrade, ronder) => ({ id, namn, omrade, farg: '#888', ronder });
    const rond = (id, utforare, timmar, freq) => ({ id, namn: 'Rond ' + id, utforare, timmar, freq });
    const bygg = (byggnader, extra) => Object.assign({
      antalVeckor: P.ANTAL_VECKOR, veckoraknare: P.veckorFor,
      utforare: [{ id: 'anna', namn: 'Anna Berg' }, { id: 'bertil', namn: 'Bertil Ek' }],
      kapacitet: { anna: 3, bertil: 3 }, akerTill: [], byggnader
    }, extra || {});
    const manad = { typ: 'manad', startManad: null };

    // 1) Två kaserner på samma område med samma utförare får olika förskjutning
    const tva = B.balansera(bygg([
      hus('k1', 'Kasern 1', 'kasernomradet', [rond('BI', 'anna', 8, manad)]),
      hus('k2', 'Kasern 2', 'kasernomradet', [rond('BI', 'anna', 8, manad)])
    ]));

    // 2) Två byggnader i ett område man åker till: kapaciteten räcker (4 + 4 = 8 h av 24 h)
    const samlat = B.balansera(bygg([
      hus('h1', 'Hangar 1', 'flygfaltet', [rond('BI', 'anna', 4, manad)]),
      hus('h2', 'Hangar 2', 'flygfaltet', [rond('BI', 'anna', 4, manad)])
    ], { akerTill: ['flygfaltet'] }));
    // … och när den inte räcker (16 + 16 = 32 h av 24 h) hamnar de veckorna efter varandra
    const samlatTrangt = B.balansera(bygg([
      hus('h1', 'Hangar 1', 'flygfaltet', [rond('BI', 'anna', 16, manad)]),
      hus('h2', 'Hangar 2', 'flygfaltet', [rond('BI', 'anna', 16, manad)])
    ], { akerTill: ['flygfaltet'] }));

    // … och byggnaderna i området behöver inte ha samma rondmix. Den som bara har månadsronder
    // har 4 faser att välja mellan, den med en årsrond har 26. Områdets vecka kan därför ligga
    // utanför den andra byggnadens kandidater, och då ska förskjutningen räknas modulo listans
    // längd i stället för att bli odefinierad. Kontrollen är en vaktpost: med dagens fyra
    // byggnader hamnar områdets första byggnad på en låg fas som finns i bådas listor, men
    // skulle den någon gång hamna högre ska en byggnad aldrig få `undefined` som förskjutning.
    const olikaMix = B.balansera(bygg([
      hus('stor', 'Stor hall', 'flygfaltet', [rond('AR', 'anna', 8, { typ: 'ar', startManad: null })]),
      hus('liten', 'Liten hall', 'flygfaltet', [rond('BI', 'anna', 8, manad)])
    ], { akerTill: ['flygfaltet'] }));

    // 3) Halvårsrond med vald startmånad stannar i sin månad (beslut 41)
    const halvar = { typ: 'halvar', startManad: 4 };
    const iManaden = B.balansera(bygg([
      hus('a', 'Hus A', 'o', [rond('R', 'anna', 8, halvar)]),
      hus('b', 'Hus B', 'o', [rond('R', 'anna', 8, halvar)])
    ]));
    const veckorB = P.veckorFor(halvar, iManaden.forskjutningar.b);

    // 4) Kapacitet 1 dag (8 h): en veckorond och en månadsrond på 8 h var hos samma utförare
    //    går inte att förskjuta ifrån varandra – överbelastningen ska redovisas, inte gömmas
    const trangt = bygg([
      hus('a', 'Hus A', 'o', [
        rond('V', 'anna', 8, { typ: 'vecka', startManad: null }),
        rond('M', 'anna', 8, manad)
      ])
    ], { kapacitet: { anna: 1, bertil: 3 } });
    const enDag = B.balansera(trangt);

    // 5) Samma underlag ger samma resultat två gånger
    const u = bygg([
      hus('k1', 'Kasern 1', 'kasernomradet', [rond('BI', 'anna', 8, manad), rond('BU', 'bertil', 4, { typ: 'kvartal', startManad: null })]),
      hus('k2', 'Kasern 2', 'kasernomradet', [rond('BI', 'anna', 8, manad)])
    ]);
    const kor1 = B.balansera(u), kor2 = B.balansera(u);

    const veckorFor = (res, bid, rondId, freq) =>
      P.veckorFor(freq, (res.forskjutningar[bid] || 0) +
        ((res.rondForskjutningar[bid] || {})[rondId] || 0));

    return {
      tva: {
        fsk: tva.forskjutningar,
        k1: veckorFor(tva, 'k1', 'BI', manad).slice(0, 3),
        k2: veckorFor(tva, 'k2', 'BI', manad).slice(0, 3),
        toppFore: tva.forbattring.toppTimmarFore, toppEfter: tva.forbattring.toppTimmarEfter
      },
      samlat: { fsk: samlat.forskjutningar, over: samlat.efter.overVeckor,
                typer: samlat.forklaring.map(f => f.typ) },
      samlatTrangt: { fsk: samlatTrangt.forskjutningar, typer: samlatTrangt.forklaring.map(f => f.typ) },
      olikaMix: { fsk: olikaMix.forskjutningar,
                  veckor: P.veckorFor(manad, olikaMix.forskjutningar.liten) },
      halvar: { fsk: iManaden.forskjutningar, veckorB, manaderB: veckorB.map(v => P.manadForVecka(v)),
                veckorA: P.veckorFor(halvar, iManaden.forskjutningar.a || 0) },
      enDag: {
        kvar: enDag.kvarstaende.map(k => ({ u: k.utforare, antal: k.veckor.length, topp: k.toppTimmar, kap: k.kapacitetTimmar })),
        // Redovisningen ska täcka varje vecka som faktiskt är över, inte bara säga att det finns
        // ett problem: "redovisas exakt" är kriteriet i biljetten.
        redovisat: enDag.kvarstaende.reduce((n, k) => n + k.veckor.length, 0),
        overVeckor: enDag.efter.overVeckor,
        utforare: trangt.byggnader[0].ronder.map(r => r.utforare),
        kapacitet: trangt.kapacitet.anna,
        freq: trangt.byggnader[0].ronder.map(r => r.freq.typ)
      },
      lika: JSON.stringify(kor1.forskjutningar) === JSON.stringify(kor2.forskjutningar) &&
            JSON.stringify(kor1.rondForskjutningar) === JSON.stringify(kor2.rondForskjutningar) &&
            JSON.stringify(kor1.forklaring) === JSON.stringify(kor2.forklaring),
      likaFsk: JSON.stringify(kor1.forskjutningar)
    };
  });

  kontroll(rakning.tva.k1.join(',') !== rakning.tva.k2.join(',')
    && rakning.tva.toppEfter < rakning.tva.toppFore,
    'två kaserner på samma område med samma utförare får olika veckor (v. ' + rakning.tva.k1.join(',')
    + ' mot v. ' + rakning.tva.k2.join(',') + '), och toppen går från ' + rakning.tva.toppFore
    + ' h till ' + rakning.tva.toppEfter + ' h');
  kontroll(rakning.samlat.fsk.h1 === rakning.samlat.fsk.h2 && rakning.samlat.over === 0
    && rakning.samlat.typer.indexOf('samlad') >= 0,
    'två byggnader i ett område man åker till får samma förskjutning när kapaciteten räcker ('
    + JSON.stringify(rakning.samlat.fsk) + ')');
  kontroll(rakning.samlatTrangt.fsk.h2 === rakning.samlatTrangt.fsk.h1 + 1
    && rakning.samlatTrangt.typer.indexOf('samlad-efter') >= 0,
    'räcker kapaciteten inte hamnar de veckorna efter varandra ('
    + JSON.stringify(rakning.samlatTrangt.fsk) + ')');
  kontroll(typeof rakning.olikaMix.fsk.liten === 'number' && rakning.olikaMix.fsk.liten >= 0
    && rakning.olikaMix.veckor.length > 0,
    'en byggnad i ett åker-till-område får en giltig förskjutning även när områdets vecka '
    + 'ligger utanför dess egna faser (' + JSON.stringify(rakning.olikaMix.fsk) + ')');
  kontroll(JSON.stringify(rakning.halvar.manaderB) === JSON.stringify([3, 9])
    && rakning.halvar.veckorB.join(',') !== rakning.halvar.veckorA.join(','),
    'en halvårsrond med vald startmånad stannar i sin månad men byter vecka (v. '
    + rakning.halvar.veckorB.join(', ') + ', april och oktober)');
  kontroll(rakning.enDag.kvar.length === 1 && rakning.enDag.kvar[0].u === 'anna'
    && rakning.enDag.kvar[0].topp > rakning.enDag.kvar[0].kap,
    'kapacitet 1 dag ger redovisad överbelastning (' + JSON.stringify(rakning.enDag.kvar) + ')');
  kontroll(rakning.enDag.redovisat === rakning.enDag.overVeckor && rakning.enDag.overVeckor > 0,
    'varje överbelastad vecka som blir kvar står i redovisningen – ingen går tyst förbi ('
    + rakning.enDag.redovisat + ' av ' + rakning.enDag.overVeckor + ' veckor)');
  kontroll(rakning.enDag.utforare.join(',') === 'anna,anna' && rakning.enDag.kapacitet === 1
    && rakning.enDag.freq.join(',') === 'vecka,manad',
    'uträkningen byter aldrig utförare och ändrar aldrig kapacitet eller frekvens');
  kontroll(rakning.lika === true,
    'samma underlag ger samma resultat två gånger (' + rakning.likaFsk + ')');

  // ------------------------------------------------------------------
  // Frågorna i sidan: förval, grön bock och ett klick var
  // ------------------------------------------------------------------
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await vanta(page, () => DP.Plan.klaraByggnader().length === 4, 'alla fyra byggnaderna klara');

  const forval = await page.evaluate(() => {
    const u = DP.Plan.balanseringsUnderlag();
    return { akerTill: u.akerTill, kapacitet: u.kapacitet, status: DP.Plan.balanseringStatus() };
  });
  kontroll(JSON.stringify(forval.akerTill) === JSON.stringify(['flygfaltet'])
    && forval.kapacitet.anna === 3 && forval.kapacitet.david === 3,
    'förvalen gäller innan frågorna besvarats: Flygfältet och 3 dagar för alla');
  kontroll(forval.status.omraden === false && forval.status.kapacitet === false && forval.status.klar === false,
    'ingen fråga är besvarad och Balansering är inte klar från början');
  kontroll(await page.locator('.bal-fraga').count() === 3
    && (await page.locator('.bal-fraga[data-fraga="1"]').innerText()).includes('Flygfältet')
    && (await page.locator('.bal-fraga[data-fraga="2"]').innerText()).includes('3 dagar')
    && (await page.locator('.bal-fraga[data-fraga="3"]').innerText()).includes('28–31'),
    'alla tre frågorna visar sitt förval i sammanfattningen');

  // Ett klick öppnar frågan, ett till bekräftar förvalet och ger grön bock
  await page.locator('.bal-fraga[data-fraga="1"] .steg-huvud').click();
  await vanta(page, () => !!document.querySelector('.bal-omrade-rad'), 'områdesfrågan öppen');
  kontroll((await page.locator('.bal-omrade-rad[data-omrade="kasernomradet"]').innerText()).includes('Kasern 1')
    && (await page.locator('.bal-omrade-rad[data-omrade="flygfaltet"]').innerText()).includes('Hangar'),
    'det syns vilka byggnader som ligger i varje område');
  let foreHist = await historiklangd(page);
  await page.locator('.bal-fraga[data-fraga="1"] button[data-godkann]').click();
  await stegKlart(page, foreHist, 'bekräftade områdesfrågan');
  kontroll(await page.evaluate(() => DP.Plan.balanseringStatus().omraden) === true
    && (await page.locator('.bal-fraga[data-fraga="1"] .steg-nr').innerText()) === '✓',
    'fråga 1 får grön bock av ett klick på "Förvalet stämmer"');
  kontroll(await page.locator('.bal-fraga[data-fraga="2"].oppen').count() === 1,
    'nästa fråga öppnas av sig själv');

  foreHist = await historiklangd(page);
  await page.locator('.bal-fraga[data-fraga="2"] button[data-godkann]').click();
  await stegKlart(page, foreHist, 'bekräftade kapacitetsfrågan');
  kontroll(await page.evaluate(() => DP.Plan.balanseringStatus().kapacitet) === true
    && (await page.locator('.bal-fraga[data-fraga="2"] .steg-nr').innerText()) === '✓',
    'fråga 2 får grön bock av ett klick');

  // Kapaciteten går att ändra per person, och belastningen räknas om på svaret
  await oppnaFraga(page, 2);
  foreHist = await historiklangd(page);
  await page.locator('.bal-kaprad[data-utforare="anna"] .chip[data-dagar="2"]').click();
  await stegKlart(page, foreHist, 'satte Annas kapacitet till 2 dagar');
  const andrad = await page.evaluate(() => {
    const u = DP.Plan.balanseringsUnderlag();
    return { kap: u.kapacitet, annaTimmar: DP.Balansering.belastning(u).rad('anna').kapacitetTimmar };
  });
  kontroll(andrad.kap.anna === 2 && andrad.kap.bertil === 3 && andrad.annaTimmar === 16,
    'kapaciteten ändras per person och belastningen räknas om på svaret (Anna '
    + andrad.annaTimmar + ' h, Bertil ' + andrad.kap.bertil + ' dagar)');
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.balanseringsUnderlag().kapacitet.anna) === 3,
    'ångra tar tillbaka kapacitetssvaret');

  // ------------------------------------------------------------------
  // Balansera: ett historiksteg, jämnare belastning och en förklaring
  // ------------------------------------------------------------------
  const fore = await page.evaluate(() => {
    const b = DP.Balansering.belastning(DP.Plan.balanseringsUnderlag());
    return {
      topp: b.toppTimmar, over: b.overVeckor,
      bi1: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern1'), 'kasern1').filter(t => t.rond === 'BI').map(t => t.vecka),
      bi2: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern2'), 'kasern2').filter(t => t.rond === 'BI').map(t => t.vecka),
      utforare: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).ronder.map(r => r.utforare).join(',')),
      freq: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).ronder.map(r => JSON.stringify(r.freq)).join(','))
    };
  });
  kontroll(fore.bi1.join(',') === fore.bi2.join(','),
    'före balanseringen ligger kasernernas månadsronder i samma veckor (v. ' + fore.bi1.slice(0, 3).join(', ') + ' …)');

  // Positionen och inte längden: ett ångra tidigare i testet har spolat tillbaka historiken,
  // och nästa steg skriver då över det som låg framför – längden står still, positionen går fram.
  const forePos = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#balansera-knapp').click();
  const brickor = await page.locator('.flygbricka').count();
  await vanta(page, n => DP.Plan.historik().pos > n, 'balanseringssteget', forePos);
  await vanta(page, () => !!document.querySelector('.bal-frad'), 'förklaringen ritad');
  kontroll(brickor > 0,
    'brickorna animeras till sina nya veckor när balanseringen görs (' + brickor + ' brickor)');

  const efter = await page.evaluate(() => {
    const b = DP.Balansering.belastning(DP.Plan.balanseringsUnderlag());
    return {
      topp: b.toppTimmar, over: b.overVeckor, pos: DP.Plan.historik().pos,
      status: DP.Plan.balanseringStatus(),
      redovisat: DP.Plan.balanseringStatus().resultat.kvarstaende.reduce((n, k) => n + k.veckor.length, 0),
      bi1: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern1'), 'kasern1').filter(t => t.rond === 'BI').map(t => t.vecka),
      bi2: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern2'), 'kasern2').filter(t => t.rond === 'BI').map(t => t.vecka),
      utforare: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).ronder.map(r => r.utforare).join(',')),
      freq: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).ronder.map(r => JSON.stringify(r.freq)).join(',')),
      fsk: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).forskjutning)
    };
  });
  kontroll(efter.pos === forePos + 1,
    'hela balanseringen blir ett enda steg i historiken (position ' + forePos + ' → ' + efter.pos + ')');
  kontroll(efter.bi1.join(',') !== efter.bi2.join(','),
    'Kasern 1 och Kasern 2 hamnar i olika veckor (v. ' + efter.bi1.slice(0, 3).join(', ')
    + ' … mot v. ' + efter.bi2.slice(0, 3).join(', ') + ' …)');
  kontroll(efter.topp < fore.topp && efter.over <= fore.over,
    'toppbelastningen sjunker (' + fore.topp + ' h → ' + efter.topp + ' h) och veckorna över '
    + 'kapaciteten blir inte fler (' + fore.over + ' → ' + efter.over + ')');
  kontroll(JSON.stringify(efter.utforare) === JSON.stringify(fore.utforare)
    && JSON.stringify(efter.freq) === JSON.stringify(fore.freq),
    'inga frekvenser eller utförare ändras av Balansera');
  kontroll(efter.over === efter.redovisat,
    'med standardplaneringen och förvalen är ingen utförare över kapaciteten, eller så är varje '
    + 'sådan vecka redovisad (' + efter.over + ' över, ' + efter.redovisat + ' redovisade)');
  kontroll(efter.status.klar === true
    && (await page.locator('.pl-steg[data-steg="balansering"]').getAttribute('data-klar')) === 'ja',
    'Balansering får grön bock i processlinjen när den är gjord');

  // Förklaringen i klartext: en rad per byggnad, och den säger vilka veckor besöken hamnade i.
  // Nivå 3 lägger till egna rader om provisoriska flyttar och strykförslag (biljett #16), och
  // de räknas inte som byggnadsrader – de hör till hela balanseringen, inte till en byggnad.
  const byggnadsrader = await page.locator('.bal-frad:not(.niva3)').allInnerTexts();
  kontroll(byggnadsrader.length === 4 && byggnadsrader.every(r => /v\. \d/.test(r)),
    'förklaringen har en rad per byggnad och säger vilka veckor den besöks i ('
    + byggnadsrader.length + ' rader)');
  const rader = byggnadsrader;
  kontroll(rader.some(r => r.includes('Kasern 2')) && rader.some(r => r.includes('Kasern 1')),
    'förklaringen nämner båda kasernerna');
  kontroll((await page.locator('.bal-resultat .bal-vsum').innerText()).includes('Högsta veckan'),
    'förklaringen sammanfattar vad som blev bättre');
  kontroll((await page.locator('.bt-fot-text').innerText()).includes('efter balanseringen')
    || (await page.locator('.bt-fot-text').innerText()).includes('gick jämnt ut'),
    'foten under tidsaxeln säger att balanseringen är gjord i stället för att beskriva problemet');
  await rorelsePaus(page);
  await bild(page, 'etapp5-balanserad');

  // ------------------------------------------------------------------
  // Ett enda ångra återställer alla förskjutningar, och brickorna animeras tillbaka
  // ------------------------------------------------------------------
  const aktivFore = await page.evaluate(() => DP.Plan.aktivId());
  // Ångras från mediaspelaren högst upp, som nu syns även i Balansering (beslut 82). Den egna
  // knappen *Ångra balanseringen* finns inte längre – kontrollen nedan håller den borta.
  kontroll(await page.locator('#bal-angra').count() === 0,
    'knappen Ångra balanseringen finns inte längre – mediaspelaren gör samma sak');
  kontroll(await page.locator('#spelare button[title^="Ångra"]').isVisible(),
    'mediaspelarens Ångra går att klicka på i Balansering');
  // Flygbrickorna lever bara medan animeringen pågår, så de räknas direkt efter klicket.
  // Att de finns är kontrollen: flytten syns, i stället för att tidsaxeln bara byter innehåll.
  await page.locator('#spelare button[title^="Ångra"]').click();
  const brickorVidAngra = await page.locator('.flygbricka').count();
  kontroll(brickorVidAngra > 0,
    'brickorna animeras till sina gamla veckor vid ångra (' + brickorVidAngra + ' brickor)');
  await vanta(page, () => !DP.Plan.balanseringStatus().klar, 'balanseringen ångrad');
  const angrat = await page.evaluate(() => ({
    fsk: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).forskjutning),
    rondFsk: DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).ronder.map(r => r.forskjutning || 0).join(',')),
    bi1: DP.Plan.rutintillfallen(DP.Plan.stateFor('kasern1'), 'kasern1').filter(t => t.rond === 'BI').map(t => t.vecka),
    klar: DP.Plan.balanseringStatus().klar,
    aktiv: DP.Plan.aktivId()
  }));
  kontroll(angrat.fsk.every(f => !f) && angrat.rondFsk.every(r => /^0(,0)*$/.test(r)),
    'ett enda ångra återställer alla förskjutningar, på båda nivåerna');
  kontroll(angrat.bi1.join(',') === fore.bi1.join(','),
    'tillfällena ligger i sina gamla veckor igen');
  kontroll(angrat.klar === false, 'Balansering är inte längre klar efter ångra');
  kontroll(angrat.aktiv === aktivFore, 'ångra av balanseringen byter inte aktiv byggnad (' + angrat.aktiv + ')');
  await gorOm(page);
  await vanta(page, () => DP.Plan.balanseringStatus().klar, 'gör om ger balanseringen tillbaka');
  kontroll(await page.evaluate(() =>
    JSON.stringify(DP.Plan.byggnadsordning.map(id => DP.Plan.stateFor(id).forskjutning))) === JSON.stringify(efter.fsk),
    'gör om ger samma förskjutningar tillbaka');

  // ------------------------------------------------------------------
  // Kvarstående överbelastning: sägs rakt ut, med länkar som fungerar
  // ------------------------------------------------------------------
  await oppnaFraga(page, 2);
  foreHist = await historiklangd(page);
  await page.locator('.bal-kaprad[data-utforare="anna"] .chip[data-dagar="1"]').click();
  await stegKlart(page, foreHist, 'satte Annas kapacitet till 1 dag');
  foreHist = await historiklangd(page);
  await page.locator('#balansera-knapp').click();
  await stegKlart(page, foreHist, 'balanserade om med 1 dag');
  await vanta(page, () => !!document.querySelector('.bal-kvar'), 'kvarstående överbelastning visas');

  const kvar = await page.evaluate(() => DP.Plan.balanseringStatus().resultat.kvarstaende);
  // Biljettens kriterium: ingen utförare är över kapaciteten, *eller* så redovisas
  // överbelastningen exakt. Kontrollen prövar båda grenarna på en gång mot det verkliga läget.
  const redovisning = await page.evaluate(() => {
    const b = DP.Balansering.belastning(DP.Plan.balanseringsUnderlag());
    const k = DP.Plan.balanseringStatus().resultat.kvarstaende;
    return { over: b.overVeckor, redovisat: k.reduce((n, r) => n + r.veckor.length, 0) };
  });
  kontroll(redovisning.over === redovisning.redovisat,
    'varje vecka som är över kapaciteten efter balanseringen är redovisad ('
    + redovisning.redovisat + ' av ' + redovisning.over + ')');
  kontroll(kvar.length >= 1 && kvar.some(k => k.utforare === 'anna'),
    'med 1 dag i veckan räcker kapaciteten inte, och det redovisas (' +
    kvar.map(k => k.namn + ': ' + k.veckor.length + ' v').join(', ') + ')');
  const kvarText = await page.locator('.bal-kvar').first().innerText();
  kontroll(kvarText.includes('Anna Berg') && kvarText.includes('mer än hen hinner'),
    'överbelastningen sägs rakt ut: ' + kvarText.split('\n')[0]);
  kontroll(await page.evaluate(() =>
    DP.Plan.byggnadsordning.every(id => DP.Plan.stateFor(id).ronder.every(r => ['anna', 'bertil', 'cecilia', 'david'].indexOf(r.utforare) >= 0))
    && DP.Plan.stateFor('kasern1').ronder.filter(r => r.id === 'BI')[0].utforare === 'anna'),
    'ingen utförare byts av balanseringen, inte heller när kapaciteten inte räcker');
  await bild(page, 'etapp5-balansering-kvarstaende');

  // Länken till kapacitetsfrågan öppnar den och pekar ut rätt person
  if (await page.locator('.bal-fraga[data-fraga="2"].oppen').count()) {
    await page.locator('.bal-fraga[data-fraga="2"] .steg-huvud').click();
    await vanta(page, () => !document.querySelector('.bal-kaprad'), 'kapacitetsfrågan stängd');
  }
  await page.locator('.bal-kvar .bal-kaplank[data-utforare="anna"]').click();
  await vanta(page, () => !!document.querySelector('.bal-kaprad[data-utforare="anna"]'), 'kapacitetsfrågan öppnad av länken');
  kontroll(await page.locator('.bal-fraga[data-fraga="2"].oppen').count() === 1
    && await page.locator('.bal-kaprad[data-utforare="anna"]').count() === 1,
    'länken "Ändra kapaciteten" öppnar kapacitetsfrågan');

  // Länken till Planering steg 4 byter byggnad och öppnar rätt steg
  const malByggnad = await page.locator('.bal-kvar .bal-steg4lank').first().getAttribute('data-byggnad');
  await page.locator('.bal-kvar .bal-steg4lank').first().click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppen');
  const steg4 = await page.evaluate(() => ({
    aktiv: DP.Plan.aktivId(),
    oppet: (document.querySelector('.steg-kort.oppen .steg-titel') || {}).textContent
  }));
  kontroll(steg4.aktiv === malByggnad && /Vem utför ronderna/.test(steg4.oppet || ''),
    'länken till Planering steg 4 byter byggnad och öppnar frågan om vem som utför ronderna ('
    + steg4.aktiv + ', "' + steg4.oppet + '")');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: veckor utan tillsyn och skötsel, provisoriska flyttar och strykningar (biljett #16).
// Uträkningen prövas först i balanseringsmodulen med ett underlag som byggs i testet – reglerna
// i beslut 32 och 45 är rena veckoräkningar och behöver ingen hopklickad planering för att
// visa vad de gör. Sedan prövas frågan, markeringarna och knapparna i sidan.
async function testVeckorUtanTillsyn(browser) {
  console.log('Etapp 5 – Veckor utan tillsyn och skötsel');
  const page = await nySida(browser, URL_INDEX);

  // ------------------------------------------------------------------
  // Nivå 3 i modulen: flytt bakåt, och förslag när flytten hamnar för nära
  // ------------------------------------------------------------------
  const rakning = await page.evaluate(() => {
    const P = DP.Plan, B = DP.Balansering;
    const UTAN = [28, 29, 30, 31, 52];
    const rond = (id, veckor) => ({ id, namn: 'Rond ' + id, utforare: 'anna', timmar: 4, veckor });
    const kor = (ronder, utan) => B.niva3({
      antalVeckor: 52, veckorUtan: utan || UTAN,
      byggnader: [{ id: 'a', namn: 'Hus A', ronder }]
    });

    // En månadsrond ligger var 4:e vecka. Tillfället i v. 28 flyttas till v. 27, och
    // granntillfällena ligger i v. 24 och v. 32 – långt nog bort för att inte föreslås strykas.
    const manad = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52];
    const m = kor([rond('M', manad)]);

    // En veckorond har ett tillfälle var vecka. Alla fyra semesterveckornas tillfällen hamnar
    // i v. 27, där det redan ligger ett – fyra ronder på en dag är inte en flytt.
    const vecka = []; for (let v = 1; v <= 52; v++) { vecka.push(v); }
    const v = kor([rond('V', vecka)]);

    // Veckan direkt före saknar också tillsyn och skötsel: sökningen går vidare bakåt.
    // Med v. 26–31 utkorsade ska ett tillfälle i v. 31 hamna i v. 25, inte i v. 30.
    const djup = kor([rond('D', [31])], [26, 27, 28, 29, 30, 31]);

    // Året börjar med utkorsade veckor: då finns ingen tillåten vecka före, och flytten går
    // framåt i stället. Regeln är att flytta bakåt, men syftet är att ingen ska arbeta en
    // utkorsad vecka – och syftet väger tyngre än riktningen (beslut 65).
    const framat = kor([rond('F', [1, 5, 9])], [1, 2]);

    // Belastningen räknas på de faktiska veckorna: den flyttade veckan bär timmarna, och
    // den utkorsade är tom. Ett struket tillfälle belastar ingenting alls.
    const underlag = {
      antalVeckor: 52, veckorUtan: UTAN,
      utforare: [{ id: 'anna', namn: 'Anna Berg' }], kapacitet: { anna: 3 },
      byggnader: [{ id: 'a', namn: 'Hus A', farg: '#888', ronder: [
        { id: 'M', namn: 'M', utforare: 'anna', timmar: 4, veckor: manad,
          flyttade: { 28: 27, 52: 51 }, strukna: { 52: 'struken' } }
      ] }]
    };
    const bel = B.belastning(underlag);
    const rad = bel.rad('anna');

    return {
      manadFlyttade: m.perByggnad.a.flyttade,
      manadStrukna: m.perByggnad.a.strukna,
      manadAntal: m.antalFlyttade,
      veckaStrukna: Object.keys(v.perByggnad.a.strukna).length,
      veckaForeslagna: v.foreslagna.map(f => f.ordinarieVecka).sort((x, y) => x - y),
      veckaFlyttMal: Object.keys(v.perByggnad.a.flyttade).map(k => v.perByggnad.a.flyttade[k]),
      djupMal: djup.perByggnad.a.flyttade['D:31'],
      framatMal: framat.perByggnad.a.flyttade['F:1'],
      bel: {
        v27: rad.veckor[27].timmar, v28: rad.veckor[28].timmar,
        v51: rad.veckor[51].timmar, v52: rad.veckor[52].timmar,
        v27prov: rad.veckor[27].tillfallen.some(t => t.provisorisk),
        utan28: rad.veckor[28].utanTillsyn
      }
    };
  });

  kontroll(JSON.stringify(rakning.manadFlyttade) === JSON.stringify({ 'M:28': 27, 'M:52': 51 })
    && Object.keys(rakning.manadStrukna).length === 0,
    'en månadsrond med tillfälle i v. 28 flyttas provisoriskt till v. 27 och föreslås inte strykas ('
    + JSON.stringify(rakning.manadFlyttade) + ')');
  kontroll(JSON.stringify(rakning.veckaForeslagna) === JSON.stringify([28, 29, 30, 31, 52])
    && rakning.veckaStrukna === 5,
    'en veckorond i v. 28–31 får förslag att stryka – alla fyra hamnar i samma vecka före ('
    + JSON.stringify(rakning.veckaForeslagna) + ')');
  kontroll(rakning.veckaFlyttMal.every(v => v === 27 || v === 51),
    'veckorondens tillfällen flyttas till närmaste tillåtna vecka före, inte efter ('
    + JSON.stringify(rakning.veckaFlyttMal) + ')');
  kontroll(rakning.djupMal === 25,
    'flytten går vidare bakåt när också veckan direkt före saknar tillsyn och skötsel '
    + '(v. 31 med v. 26–31 utkorsade → v. ' + rakning.djupMal + ')');
  kontroll(rakning.framatMal === 3,
    'finns ingen tillåten vecka före går flytten framåt i stället – inget tillfälle lämnas '
    + 'i en utkorsad vecka (v. 1 med v. 1–2 utkorsade → v. ' + rakning.framatMal + ')');
  kontroll(rakning.bel.v28 === 0 && rakning.bel.v27 === 4 && rakning.bel.v27prov
    && rakning.bel.utan28 === true,
    'belastningen räknas på den faktiska veckan: v. 28 är tom och v. 27 bär ' + rakning.bel.v27
    + ' h, märkt som provisorisk');
  kontroll(rakning.bel.v51 === 0 && rakning.bel.v52 === 0,
    'ett struket tillfälle belastar ingen vecka alls (v. 51 ' + rakning.bel.v51
    + ' h, v. 52 ' + rakning.bel.v52 + ' h)');

  // ------------------------------------------------------------------
  // Fråga 3 i sidan: förval, ett klick, och varje vecka för sig
  // ------------------------------------------------------------------
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await vanta(page, () => DP.Plan.klaraByggnader().length === 4, 'alla fyra byggnaderna klara');

  const forval = await page.evaluate(() => ({
    veckor: DP.Plan.balanseringsUnderlag().veckorUtan,
    besvarad: DP.Plan.balanseringStatus().veckorUtan
  }));
  kontroll(JSON.stringify(forval.veckor) === JSON.stringify([28, 29, 30, 31, 52])
    && forval.besvarad === false,
    'v. 28–31 och v. 52 är förvalda, och frågan är inte besvarad från början');
  kontroll(await page.locator('.bal-fraga').count() === 3
    && (await page.locator('.bal-fraga[data-fraga="3"]').innerText()).includes('28–31'),
    'fråga 3 finns och visar sitt förval som ett intervall i sammanfattningen');

  await oppnaFraga(page, 3);
  kontroll(await page.locator('.bal-veckoknapp').count() === 52
    && await page.locator('.bal-veckoknapp.pa').count() === 5,
    'året visas som 52 klickbara veckor, fem av dem utkorsade');

  // Varje klick är ett eget steg, och det går att ångra
  let foreHist = await historiklangd(page);
  await page.locator('.bal-veckoknapp[data-vecka="27"]').click();
  await stegKlart(page, foreHist, 'korsade ut v. 27');
  kontroll(await page.evaluate(() => DP.Plan.balanseringsUnderlag().veckorUtan.indexOf(27) >= 0)
    && await page.evaluate(() => DP.Plan.balanseringStatus().veckorUtan) === true,
    'ett klick korsar ut en vecka och besvarar frågan');
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.balanseringsUnderlag().veckorUtan.indexOf(27) < 0),
    'ångra tar tillbaka den utkorsade veckan');

  // Positionen och inte längden: ångran ovanför har spolat tillbaka historiken, och nästa steg
  // skriver då över det som låg framför – längden står still, positionen går fram.
  await oppnaFraga(page, 3);
  let forePosFraga = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('.bal-fraga[data-fraga="3"] button[data-godkann]').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'bekräftade veckofrågan', forePosFraga);
  kontroll(await page.evaluate(() => DP.Plan.balanseringStatus().veckorUtan) === true
    && (await page.locator('.bal-fraga[data-fraga="3"] .steg-nr').innerText()) === '✓',
    'fråga 3 får grön bock av ett klick på "Förvalet stämmer"');

  // ------------------------------------------------------------------
  // Balansera: inget tillfälle blir kvar i en vecka utan tillsyn och skötsel
  // ------------------------------------------------------------------
  const forePos = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#balansera-knapp').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'balanseringssteget', forePos);
  await vanta(page, () => !!document.querySelector('.bal-frad'), 'förklaringen ritad');

  const efter = await page.evaluate(() => {
    const P = DP.Plan;
    const utan = P.svarVeckorUtan();
    let iUtan = 0, provisoriska = 0;
    P.byggnadsordning.forEach(bid => {
      P.rutintillfallen(P.stateFor(bid), bid).forEach(t => {
        if (utan.indexOf(t.vecka) >= 0) { iUtan++; }
        if (t.provisorisk) { provisoriska++; }
      });
    });
    const bst = P.balanseringStatus();
    return {
      iUtan, provisoriska, pos: P.historik().pos,
      foreslagna: bst.foreslagna.length,
      typer: bst.resultat.forklaring.map(f => f.typ),
      // Ordinarie veckor är orörda: en provisorisk flytt ändrar ingen frekvens och ingen
      // förskjutning, så rytmen ligger kvar där förskjutningen satte den.
      ordinarieKvar: P.byggnadsordning.every(bid => {
        const s = P.stateFor(bid);
        return s.ronder.every(r => {
          const rytm = P.veckorForRond(r, s);
          return P.tillfallenMedStrukna(s, bid).filter(t => t.rond === r.id)
            .every(t => rytm.indexOf(t.ordinarieVecka) >= 0);
        });
      })
    };
  });
  kontroll(efter.iUtan === 0 && efter.provisoriska > 0,
    'inget tillfälle ligger i en vecka utan tillsyn och skötsel efter Balansera ('
    + efter.provisoriska + ' flyttades provisoriskt)');
  kontroll(efter.pos === forePos + 1,
    'de provisoriska flyttarna ingår i balanseringens enda historiksteg (position '
    + forePos + ' → ' + efter.pos + ')');
  kontroll(efter.ordinarieKvar === true,
    'de ordinarie veckorna är orörda – planeringen ändras inte av en provisorisk flytt');
  kontroll(efter.typer.indexOf('provisorisk') >= 0,
    'förklaringen säger att tillfällen flyttades provisoriskt ('
    + efter.typer.join(', ') + ')');
  await rorelsePaus(page);
  await bild(page, 'etapp5-veckor-utan-tillsyn');

  // ------------------------------------------------------------------
  // Markeringarna i Balanseringens tidsaxel
  // ------------------------------------------------------------------
  kontroll(await page.locator('.bt-vecka.utan').count() === 5
    && await page.locator('.bt-cell.utan').count() > 0,
    'veckorna utan tillsyn och skötsel är markerade i tidsaxeln ('
    + await page.locator('.bt-vecka.utan').count() + ' veckor)');
  kontroll(await page.locator('.bt-bricka.provisorisk').count() === efter.provisoriska,
    'varje provisoriskt flyttat tillfälle har en egen markering i tidsaxeln ('
    + await page.locator('.bt-bricka.provisorisk').count() + ' av ' + efter.provisoriska + ')');
  kontroll(await page.locator('.bt-bricka.foreslagen').count() === efter.foreslagna
    && efter.foreslagna > 0,
    'de föreslagna tillfällena har en egen markering (' + efter.foreslagna + ')');

  // ------------------------------------------------------------------
  // "Stryk alla" och "behåll" – egna steg, båda går att ångra (beslut 45)
  // ------------------------------------------------------------------
  await vanta(page, () => !!document.querySelector('.bal-strykrad'), 'listan över förslag');
  kontroll(await page.locator('.bal-strykrad').count() === efter.foreslagna,
    'förslagen listas en och en med ordinarie och faktisk vecka');

  // Behåll ett enskilt: förslaget försvinner, flytten står kvar, de andra är orörda
  const forsta = await page.evaluate(() => {
    const f = DP.Plan.balanseringStatus().foreslagna[0];
    return { byggnad: f.byggnad, rond: f.rond, ordinarie: f.ordinarieVecka, vecka: f.vecka };
  });
  foreHist = await historiklangd(page);
  await page.locator('.bal-strykrad[data-byggnad="' + forsta.byggnad + '"][data-rond="'
    + forsta.rond + '"][data-ordinarie="' + forsta.ordinarie + '"] .bal-behall').click();
  await stegKlart(page, foreHist, 'behöll ett enskilt tillfälle');
  const behallet = await page.evaluate(arg => {
    const P = DP.Plan;
    const t = P.rutintillfallen(P.stateFor(arg.byggnad), arg.byggnad)
      .filter(x => x.rond === arg.rond && x.ordinarieVecka === arg.ordinarie)[0];
    return { finns: !!t, foreslagen: t && t.foreslagen, vecka: t && t.vecka, provisorisk: t && t.provisorisk,
      kvar: P.balanseringStatus().foreslagna.length };
  }, forsta);
  kontroll(behallet.finns && behallet.foreslagen === false && behallet.vecka === forsta.vecka
    && behallet.provisorisk === true,
    'ett enskilt tillfälle kan behållas: förslaget tas bort men den provisoriska flytten står kvar');
  kontroll(behallet.kvar === efter.foreslagna - 1,
    'de övriga förslagen står kvar (' + behallet.kvar + ' av ' + efter.foreslagna + ')');
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.balanseringStatus().foreslagna.length) === efter.foreslagna,
    'ångra ger förslaget tillbaka');

  // Stryk alla: ett steg, och de strukna tillfällena finns inte längre
  const forePosStryk = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#stryk-alla').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'strök alla föreslagna', forePosStryk);
  const struket = await page.evaluate(() => {
    const P = DP.Plan;
    let strukna = 0, kvarIListan = 0;
    P.byggnadsordning.forEach(bid => {
      P.tillfallenMedStrukna(P.stateFor(bid), bid).forEach(t => { if (t.struken) { strukna++; } });
      P.rutintillfallen(P.stateFor(bid), bid).forEach(t => { if (t.foreslagen) { kvarIListan++; } });
    });
    return { strukna, kvarIListan, forslag: P.balanseringStatus().foreslagna.length };
  });
  kontroll(struket.strukna === efter.foreslagna && struket.forslag === 0 && struket.kvarIListan === 0,
    'Stryk alla stryker de föreslagna tillfällena i ett steg (' + struket.strukna + ' strukna)');
  kontroll(await page.locator('.bt-bricka.struken').count() === efter.foreslagna,
    'de strukna tillfällena har en egen markering i tidsaxeln');
  await bild(page, 'etapp5-strukna');
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.balanseringStatus().foreslagna.length) === efter.foreslagna,
    'ett enda ångra tar tillbaka alla strykningar');

  // ------------------------------------------------------------------
  // Planeringens tidsaxel och telefonvyerna visar faktisk vecka
  // ------------------------------------------------------------------
  await page.evaluate(arg => { DP.Plan.vaxlaByggnad(arg.byggnad); }, forsta);
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppen');
  await vanta(page, () => !!document.querySelector('.rt-mark.provisorisk'),
    'ett provisoriskt flyttat tillfälle i planeringens tidsaxel');

  const iPlanering = await page.evaluate(arg => {
    const mark = document.querySelector('.ta-cell[data-rond="' + arg.rond + '"][data-vecka="'
      + arg.vecka + '"] .rt-mark');
    const ordinarieCell = document.querySelector('.ta-cell[data-rond="' + arg.rond
      + '"][data-vecka="' + arg.ordinarie + '"] .rt-mark');
    return {
      iFaktisk: !!mark,
      provisorisk: mark ? mark.classList.contains('provisorisk') : false,
      nyckel: mark ? mark.dataset.nyckel : null,
      iOrdinarie: !!ordinarieCell,
      utanMarkerade: document.querySelectorAll('.ta-vecka.utan').length
    };
  }, forsta);
  kontroll(iPlanering.iFaktisk && iPlanering.provisorisk && !iPlanering.iOrdinarie,
    'planeringens tidsaxel visar tillfället i den faktiska veckan (v. ' + forsta.vecka
    + '), inte i den ordinarie (v. ' + forsta.ordinarie + ')');
  kontroll(iPlanering.utanMarkerade === 5,
    'veckorna utan tillsyn och skötsel är markerade också i planeringens tidsaxel');

  // Telefonen: namnet bygger på den faktiska veckan, och flytten sägs rakt ut
  await page.locator('.ta-cell[data-rond="' + forsta.rond + '"][data-vecka="'
    + forsta.vecka + '"] .rt-mark').click();
  await vanta(page, () => document.querySelectorAll('.telefon').length > 0, 'telefonvyn öppen');
  // Nyckeln bygger på den **ordinarie** veckan (beslut 64) – det är den som pekar ut
  // tillfället. Namnet i vyn bygger däremot på den faktiska, och det är kontrollen.
  const iTelefon = await page.evaluate(arg => {
    const tel = document.querySelector('.telefon[data-nyckel="' + arg.rond + ':' + arg.ordinarie + '"]');
    return {
      finns: !!tel,
      titel: tel ? tel.querySelector('.tf-titel').textContent : '',
      flyttad: tel ? (tel.querySelector('.tf-flyttad') || {}).textContent || '' : ''
    };
  }, forsta);
  kontroll(iTelefon.finns && iTelefon.titel.includes(await page.evaluate(v => DP.Plan.veckoNamn(v), forsta.vecka)),
    'telefonvyns namn bygger på den faktiska veckan (' + iTelefon.titel + ')');
  kontroll(iTelefon.flyttad.includes('v. ' + forsta.ordinarie),
    'telefonen säger att tillfället är provisoriskt flyttat och varifrån ('
    + iTelefon.flyttad + ')');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// ------------------------------------------------------------------
// Etapp 5 – flytt för hand i Balanseringens tidsaxel (biljett #17, beslut 34)
// ------------------------------------------------------------------
// Dragningen styrs med musen steg för steg och inte med dragTo(): beskedet om målveckans
// fyllnad ska läsas *medan* pekaren står över målcellen (berättelse 59), och det går bara
// att se mellan mousemove och mouseup.
async function dra(page, franValjare, tillValjare, opts) {
  const fran = page.locator(franValjare).first();
  const till = page.locator(tillValjare).first();
  const a = await fran.boundingBox();
  const b = await till.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // Två rörelser: den första passerar tröskeln som skiljer ett drag från ett klick, den andra
  // landar på målet. Ett enda hopp hade också gått, men då hade testet inte visat att
  // tröskeln finns.
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  if (opts && opts.medanDuDrar) { await opts.medanDuDrar(); }
  await page.mouse.up();
}

// Alla dragbara brickor i tidsaxeln, med det testet behöver veta om vart och ett: var brickan
// sitter (utförare och vecka, för att hitta den i DOM) och vad planeringen säger om tillfället
// (rond, ordinarie vecka, frekvens, rytm). Testet väljer sedan själv i JavaScript utanför
// sidan, så filtret är en vanlig funktion och inte en sträng som måste tolkas i webbläsaren.
async function dragbaraBrickor(page) {
  return page.evaluate(() => {
    const P = DP.Plan;
    const bel = DP.Balansering.belastning(P.balanseringsUnderlag());
    const ut = [];
    bel.rader.forEach(rad => {
      for (let v = 1; v <= bel.antalVeckor; v++) {
        rad.veckor[v].tillfallen.forEach(t => {
          const s = P.stateFor(t.byggnad);
          const rond = s.ronder.filter(r => r.id === t.rond)[0];
          ut.push({
            byggnad: t.byggnad, rond: t.rond, vecka: t.vecka, ordinarie: t.ordinarieVecka,
            utforare: rad.utforare, freq: rond.freq.typ, startManad: rond.freq.startManad || null,
            provisorisk: !!t.provisorisk, timmar: t.timmar,
            veckor: P.veckorForRond(rond, s), antalRonder: s.ronder.length
          });
        });
      }
    });
    return ut;
  });
}
async function valjBricka(page, filter) {
  const alla = await dragbaraBrickor(page);
  return (filter ? alla.filter(filter) : alla)[0] || null;
}
// Utförarraden och inte de utfällda byggnadsraderna: båda bär samma utförare och vecka i sin
// data, och det är utförarradens cell som bär belastningen och är dropmålet.
const cellValjare = (b, vecka) => '.bt-cell:not(.bt-ucell)[data-utforare="' + b.utforare
  + '"][data-vecka="' + vecka + '"]';
const brickValjare = b => cellValjare(b, b.vecka) + ' .bt-bricka[data-byggnad="' + b.byggnad
  + '"][data-rond="' + b.rond + '"][data-ordinarie="' + b.ordinarie + '"]';

// Öppnar Balansering med alla fyra byggnaderna planerade och balanserade – samma utgångsläge
// som planeraren möter när hen börjar justera för hand.
async function balanseradSida(browser) {
  const page = await nySida(browser, URL_INDEX);
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await vanta(page, () => DP.Plan.klaraByggnader().length === 4, 'alla fyra byggnaderna klara');
  const forePos = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#balansera-knapp').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'balanseringssteget', forePos);
  await vanta(page, () => !!document.querySelector('.bt-bricka'), 'brickorna ritade');
  return page;
}

async function testFlyttForHand(browser) {
  console.log('Etapp 5 – flytt för hand (beslut 34)');

  // ------------------------------------------------------------------
  // Alternativen som rena data: vad de tre valen skulle ge, före valet
  // ------------------------------------------------------------------
  const page = await balanseradSida(browser);

  const alt = await page.evaluate(() => {
    const P = DP.Plan;
    // En månadsrond i Kasern 1: intervallet är 4 veckor, så ett drag 2 veckor framåt landar
    // rytmen 2 veckor framåt, och ett drag 5 veckor framåt landar den bara 1 vecka framåt
    // (förskjutningen räknas modulo intervallet, beslut 56).
    const s = P.stateFor('kasern1');
    const rond = s.ronder.filter(r => P.frekvens(r.freq.typ).iv === 4)[0];
    const veckor = P.veckorForRond(rond, s);
    const ov = veckor[1];
    const tva = P.flyttAlternativ('kasern1', rond.id, ov, ov + 2);
    const fem = P.flyttAlternativ('kasern1', rond.id, ov, ov + 5);
    return {
      rond: rond.id, ordinarie: ov, intervall: P.frekvens(rond.freq.typ).iv,
      tvaTillfalle: tva.tillfalle.delta,
      tvaRondserie: { delta: tva.rondserie.delta, nyVecka: tva.rondserie.nyVecka, traffar: tva.rondserie.traffar },
      tvaRytm: { delta: tva.besoksrytm.delta, antalRonder: tva.besoksrytm.antalRonder },
      femRondserie: { delta: fem.rondserie.delta, nyVecka: fem.rondserie.nyVecka, traffar: fem.rondserie.traffar },
      sparr: tva.sparr
    };
  });
  kontroll(alt.tvaTillfalle === 2 && alt.tvaRondserie.delta === 2
    && alt.tvaRondserie.nyVecka === alt.ordinarie + 2 && alt.tvaRondserie.traffar === true,
    'ett drag 2 veckor framåt ger samma avstånd på alla tre nivåerna, och rytmen träffar '
    + 'målveckan (v. ' + alt.ordinarie + ' → v. ' + alt.tvaRondserie.nyVecka + ')');
  kontroll(alt.femRondserie.delta === 5 && alt.femRondserie.traffar === false
    && alt.femRondserie.nyVecka === alt.ordinarie + 1,
    'ett drag längre än intervallet ger en rytm som ligger modulo intervallet – det dragna '
    + 'tillfället hamnar i v. ' + alt.femRondserie.nyVecka + ', inte i v. ' + (alt.ordinarie + 5)
    + ', och alternativen säger det (beslut 56)');
  kontroll(alt.tvaRytm.antalRonder > 1 && alt.sparr === null,
    'besöksrytmen rör alla ' + alt.tvaRytm.antalRonder + ' rondserierna, och inget val är spärrat');

  // Halvårsrond med vald startmånad: permanent bara inom månaden (beslut 41)
  const halvar = await page.evaluate(() => {
    const P = DP.Plan;
    let svar = null;
    P.byggnadsordning.forEach(bid => {
      const s = P.stateFor(bid);
      s.ronder.forEach(r => {
        if (svar || r.freq.typ !== 'halvar' || !r.freq.startManad) { return; }
        const ov = P.veckorForRond(r, s)[0];
        // En vecka in i samma månad, och en vecka långt in i nästa – samma gest, olika svar
        let iManaden = null, utanfor = null;
        for (let v = 1; v <= P.ANTAL_VECKOR; v++) {
          if (v === ov) { continue; }
          if (P.manadForVecka(v) === P.manadForVecka(ov) && iManaden === null) { iManaden = v; }
          if (P.manadForVecka(v) !== P.manadForVecka(ov) && utanfor === null) { utanfor = v; }
        }
        const a = P.flyttAlternativ(bid, r.id, ov, iManaden);
        const b = P.flyttAlternativ(bid, r.id, ov, utanfor);
        svar = {
          byggnad: bid, rond: r.id, ordinarie: ov, iManaden, utanfor,
          inomTillaten: a.rondserie.tillaten && a.besoksrytm.tillaten,
          utanforTillaten: b.rondserie.tillaten || b.besoksrytm.tillaten,
          utanforTillfalle: b.tillfalle.tillaten, sparr: b.sparr
        };
      });
    });
    return svar;
  });
  kontroll(halvar && halvar.inomTillaten === true && halvar.utanforTillaten === false
    && halvar.utanforTillfalle === true && halvar.sparr === 'startmanad',
    'en halvårsrond med startmånad får förskjutas inom månaden (v. ' + (halvar && halvar.iManaden)
    + ') men inte ut ur den (v. ' + (halvar && halvar.utanfor)
    + ') – där erbjuds bara "bara denna gång" (beslut 41)');

  // ------------------------------------------------------------------
  // Dra en bricka: beskedet under dragningen och frågan när man släpper
  // ------------------------------------------------------------------
  const b1 = await valjBricka(page, k => !k.provisorisk && k.freq === 'manad');
  // Förskjutningarna som balanseringen redan satt är utgångsläget, inte noll: en flytt för
  // hand ska lämna dem orörda, inte nollställa dem.
  const fskFore = await page.evaluate(arg => {
    const s = DP.Plan.stateFor(arg.byggnad);
    const r = s.ronder.filter(x => x.id === arg.rond)[0];
    return { byggnad: s.forskjutning || 0, rond: r.forskjutning || 0 };
  }, b1);
  const mal1 = b1.vecka + 2 <= 52 ? b1.vecka + 2 : b1.vecka - 2;
  let besked = null;
  await dra(page, brickValjare(b1), cellValjare(b1, mal1), {
    medanDuDrar: async () => {
      besked = await page.evaluate(() => {
        const e = document.getElementById('dragbesked');
        const siktad = document.querySelector('.bt-cell.siktad');
        return {
          text: e ? e.textContent : null,
          kopia: !!document.querySelector('.bt-dragkopia'),
          siktadVecka: siktad ? Number(siktad.dataset.vecka) : null
        };
      });
    }
  });
  kontroll(besked && besked.kopia && besked.siktadVecka === mal1
    && besked.text.includes('V. ' + mal1) && /av \d/.test(besked.text),
    'medan brickan dras markeras målveckan och beskedet säger hur full den blir ('
    + (besked && besked.text) + ')');

  await vanta(page, () => !!document.querySelector('.flyttfraga'), 'frågan när brickan släpps');
  const fraga = await page.evaluate(() => ({
    val: [].map.call(document.querySelectorAll('.ff-val'), k => k.dataset.val),
    vald: (document.querySelector('.ff-val.vald') || {}).dataset?.val || null,
    utfall: [].map.call(document.querySelectorAll('.ff-val'), k => k.querySelector('.ff-utfall').textContent),
    borta: !document.getElementById('dragbesked')
  }));
  kontroll(JSON.stringify(fraga.val) === JSON.stringify(['tillfalle', 'rondserie', 'besoksrytm'])
    && fraga.vald === 'tillfalle' && fraga.borta,
    'frågan har de tre valen i ordningen minst till mest ingripande, med "bara denna gång" '
    + 'förvalt första gången, och beskedet är borta');
  kontroll(fraga.utfall[0].includes('v. ' + mal1) && fraga.utfall[0].includes('v. ' + b1.ordinarie)
    && fraga.utfall[1].includes('v.'),
    'varje val säger vad det landar i, med veckorna utskrivna');
  await bild(page, 'etapp5-flyttfraga');

  // "Bara denna gång" ger en provisorisk flytt av just det tillfället, och inget annat
  let forePosSteg = await historikpos(page);
  await page.locator('.dlg-knappar button', { hasText: 'Flytta' }).click();
  await stegKlartPos(page, forePosSteg, 'provisorisk flytt för hand');
  const efterProv = await page.evaluate(arg => {
    const P = DP.Plan, s = P.stateFor(arg.b.byggnad);
    const rond = s.ronder.filter(r => r.id === arg.b.rond)[0];
    const t = P.rutintillfallen(s, arg.b.byggnad)
      .filter(x => x.rond === arg.b.rond && x.ordinarieVecka === arg.b.ordinarie)[0];
    return {
      vecka: t && t.vecka, ordinarie: t && t.ordinarieVecka, provisorisk: t && t.provisorisk,
      rytmKvar: JSON.stringify(P.veckorForRond(rond, s)) === JSON.stringify(arg.b.veckor),
      rondFsk: rond.forskjutning || 0, byggnadFsk: s.forskjutning || 0,
      steg: P.historik().lista[P.historik().pos]
    };
  }, { b: b1 });
  kontroll(efterProv.vecka === mal1 && efterProv.ordinarie === b1.ordinarie
    && efterProv.provisorisk === true && efterProv.rytmKvar
    && efterProv.rondFsk === fskFore.rond && efterProv.byggnadFsk === fskFore.byggnad,
    '"bara denna gång" flyttar tillfället till v. ' + mal1 + ' och lämnar rytmen, '
    + 'förskjutningarna (' + fskFore.byggnad + '/' + fskFore.rond
    + ' v.) och den ordinarie veckan (v. ' + b1.ordinarie + ') orörda');
  kontroll(await page.locator(brickValjare({ ...b1, vecka: mal1 }) + '.provisorisk').count() === 1,
    'brickan ligger i målveckan med sin provisoriska markering');
  await angra(page);
  kontroll(await page.evaluate(arg => {
    const P = DP.Plan;
    const t = P.rutintillfallen(P.stateFor(arg.byggnad), arg.byggnad)
      .filter(x => x.rond === arg.rond && x.ordinarieVecka === arg.ordinarie)[0];
    return t && t.vecka === arg.vecka && !t.provisorisk;
  }, b1) === true, 'ångra tar tillbaka den provisoriska flytten för hand');
  await gorOm(page);

  // ------------------------------------------------------------------
  // "Hela rondserien" förskjuter rondserien, och ingen annan rond
  // ------------------------------------------------------------------
  const b2 = await valjBricka(page, k => !k.provisorisk && k.freq === 'manad' && k.antalRonder > 1);
  const mal2 = b2.vecka + 1 <= 52 ? b2.vecka + 1 : b2.vecka - 1;
  const foreRonder = await page.evaluate(bid => {
    const P = DP.Plan, s = P.stateFor(bid);
    const ut = { veckor: {}, byggnadFsk: s.forskjutning || 0 };
    s.ronder.forEach(r => { ut.veckor[r.id] = P.veckorForRond(r, s); });
    return ut;
  }, b2.byggnad);
  await dra(page, brickValjare(b2), cellValjare(b2, mal2));
  await vanta(page, () => !!document.querySelector('.flyttfraga'), 'frågan igen');
  forePosSteg = await historikpos(page);
  await page.locator('.ff-val[data-val="rondserie"]').click();
  await page.locator('.dlg-knappar button', { hasText: 'Flytta' }).click();
  await stegKlartPos(page, forePosSteg, 'förskjöt rondserien');
  const efterRond = await page.evaluate(arg => {
    const P = DP.Plan, s = P.stateFor(arg.b.byggnad);
    const rond = s.ronder.filter(r => r.id === arg.b.rond)[0];
    const andrade = [], ororda = [];
    s.ronder.forEach(r => {
      const nu = JSON.stringify(P.veckorForRond(r, s));
      (nu === JSON.stringify(arg.fore.veckor[r.id]) ? ororda : andrade).push(r.id);
    });
    return {
      rondFsk: rond.forskjutning || 0, byggnadFsk: s.forskjutning || 0,
      andrade, ororda, veckor: P.veckorForRond(rond, s),
      steg: P.historik().lista[P.historik().pos]
    };
  }, { b: b2, fore: foreRonder });
  kontroll(efterRond.rondFsk !== 0 && efterRond.byggnadFsk === foreRonder.byggnadFsk
    && efterRond.andrade.length === 1 && efterRond.andrade[0] === b2.rond,
    '"hela rondserien" förskjuter bara den ronden (' + b2.rond + ' ' + efterRond.rondFsk
    + ' v.) och lämnar byggnadens besöksrytm, så de ' + efterRond.ororda.length
    + ' övriga rondserierna ligger kvar');
  kontroll(efterRond.veckor.indexOf(mal2) >= 0,
    'rondseriens veckor går nu genom målveckan v. ' + mal2 + ' (' + efterRond.veckor.join(', ') + ')');
  kontroll(/[Ff]örskjöt rondserien/.test(efterRond.steg),
    'historikens text säger att en rondserie förskjutits ("' + efterRond.steg + '")');
  await angra(page);
  kontroll(await page.evaluate(arg => {
    const P = DP.Plan, s = P.stateFor(arg.b.byggnad);
    const rond = s.ronder.filter(r => r.id === arg.b.rond)[0];
    return JSON.stringify(P.veckorForRond(rond, s)) === JSON.stringify(arg.fore.veckor[arg.b.rond]);
  }, { b: b2, fore: foreRonder }) === true,
    'ångra tar tillbaka rondseriens förskjutning');

  // ------------------------------------------------------------------
  // "Hela byggnadens besöksrytm" förskjuter alla byggnadens ronder
  // ------------------------------------------------------------------
  const b3 = await valjBricka(page, k => !k.provisorisk && k.freq === 'manad' && k.antalRonder > 1);
  const mal3 = b3.vecka + 1 <= 52 ? b3.vecka + 1 : b3.vecka - 1;
  const foreRonder3 = await page.evaluate(bid => {
    const P = DP.Plan, s = P.stateFor(bid);
    const ut = { veckor: {}, byggnadFsk: s.forskjutning || 0, bundna: [] };
    s.ronder.forEach(r => {
      ut.veckor[r.id] = P.veckorForRond(r, s);
      // En halvårsrond med vald startmånad är bunden till sin månad (beslut 41) och rör sig
      // inte av varje förskjutning. Den hör ändå till besöksrytmen – den är bara klampad.
      if (r.freq.typ === 'halvar' && r.freq.startManad) { ut.bundna.push(r.id); }
    });
    return ut;
  }, b3.byggnad);
  await dra(page, brickValjare(b3), cellValjare(b3, mal3));
  await vanta(page, () => !!document.querySelector('.flyttfraga'), 'frågan en tredje gång');
  // Det senaste valet var "hela rondserien" och ska vara förvalt nu (berättelse 61)
  kontroll(await page.evaluate(() => (document.querySelector('.ff-val.vald') || {}).dataset.val) === 'rondserie',
    'det senaste valet är förvalt vid nästa flytt');
  forePosSteg = await historikpos(page);
  await page.locator('.ff-val[data-val="besoksrytm"]').click();
  await page.locator('.dlg-knappar button', { hasText: 'Flytta' }).click();
  await stegKlartPos(page, forePosSteg, 'förskjöt besöksrytmen');
  const efterRytm = await page.evaluate(arg => {
    const P = DP.Plan, s = P.stateFor(arg.b.byggnad);
    const andrade = [];
    s.ronder.forEach(r => {
      if (JSON.stringify(P.veckorForRond(r, s)) !== JSON.stringify(arg.fore.veckor[r.id])) { andrade.push(r.id); }
    });
    return {
      byggnadFsk: s.forskjutning || 0, andrade, antalRonder: s.ronder.length,
      // Alla ronder följer besöksrytmen – att veckorna *syns* flytta är en annan sak, se
      // nedan om de månadsbundna halvårsronderna.
      allaFoljer: P.forskjutningStatus(arg.b.byggnad).ronder
        .every(r => r.egen === 0 && r.total === (s.forskjutning || 0)),
      steg: P.historik().lista[P.historik().pos],
      // Markeringen som skiljer en permanent flytt från en provisorisk (berättelse 64)
      status: P.forskjutningStatus(arg.b.byggnad)
    };
  }, { b: b3, fore: foreRonder3 });
  // Besöksrytmen flyttar byggnadens alla rondserier. Veckorna syns flytta för alla utom de
  // halvårsronder som är bundna till sin startmånad: de klampas inom månaden (beslut 41) och
  // står still när förskjutningen skulle ta dem ut ur den. Förskjutningen gäller ändå dem –
  // den sitter på byggnaden, inte på ronden – så kontrollen mäter de ronder som kan röra sig.
  const borRora = efterRytm.antalRonder - foreRonder3.bundna.length;
  kontroll(efterRytm.byggnadFsk !== foreRonder3.byggnadFsk
    && efterRytm.andrade.length >= borRora && efterRytm.allaFoljer === true,
    '"hela byggnadens besöksrytm" förskjuter byggnadens alla ' + efterRytm.antalRonder
    + ' rondserier: ' + efterRytm.andrade.length + ' av ' + borRora
    + ' som kan röra sig bytte veckor, och ingen rondserie har en egen förskjutning ('
    + foreRonder3.byggnadFsk + ' → ' + efterRytm.byggnadFsk + ' v.)');
  kontroll(efterRytm.status.byggnad === efterRytm.byggnadFsk
    && /[Bb]esöksrytmen är förskjuten/.test(efterRytm.status.byggnadText || ''),
    'förskjutningen har ett eget besked i klartext ("' + efterRytm.status.byggnadText + '")');
  await angra(page);
  kontroll(await page.evaluate(arg => (DP.Plan.stateFor(arg.bid).forskjutning || 0) === arg.fore,
    { bid: b3.byggnad, fore: foreRonder3.byggnadFsk }) === true,
    'ångra tar tillbaka besöksrytmens förskjutning (till ' + foreRonder3.byggnadFsk + ' v.)');
  await gorOm(page);

  // ------------------------------------------------------------------
  // Permanent och provisoriskt syns olika, i båda tidsaxlarna (berättelse 64)
  // ------------------------------------------------------------------
  await page.evaluate(() => {
    // Fäll ut utförarna, så att byggnadsraderna med förskjutningsmärket finns i tidsaxeln
    document.querySelectorAll('.bt-fall').forEach(k => k.click());
  });
  await vanta(page, () => !!document.querySelector('.bt-under'), 'utfällda byggnadsrader');
  const iBal = await page.evaluate(bid => ({
    marken: document.querySelectorAll('.bt-fsk:not(.tom)').length,
    forByggnaden: [].some.call(document.querySelectorAll('.bal-byggnad[data-byggnad="' + bid + '"] .bal-fsk'),
      e => !e.hidden && /⇥/.test(e.textContent)),
    provisoriska: document.querySelectorAll('.bt-bricka.provisorisk').length
  }), b3.byggnad);
  kontroll(iBal.marken > 0 && iBal.forByggnaden && iBal.provisoriska > 0,
    'Balanseringens tidsaxel visar permanenta flyttar som ⇥ på raden och provisoriska som '
    + 'markerade brickor – två olika markeringar för två olika saker ('
    + iBal.marken + ' ⇥, ' + iBal.provisoriska + ' provisoriska)');
  await bild(page, 'etapp5-flytt-for-hand');

  // Nivå 2 ovanpå nivå 1, i samma byggnad: då bär besöksraden ett märke och rondens rad ett
  // eget. Det är hela poängen med att märket ligger på den nivå flytten rör (beslut 68).
  const b5 = (await dragbaraBrickor(page))
    .filter(k => k.byggnad === b3.byggnad && k.freq === 'manad')[0];
  const mal5 = b5.vecka + 1 <= 52 ? b5.vecka + 1 : b5.vecka - 1;
  await dra(page, brickValjare(b5), cellValjare(b5, mal5));
  await vanta(page, () => !!document.querySelector('.flyttfraga'), 'frågan för nivå 2');
  forePosSteg = await historikpos(page);
  await page.locator('.ff-val[data-val="rondserie"]').click();
  await page.locator('.dlg-knappar button', { hasText: 'Flytta' }).click();
  await stegKlartPos(page, forePosSteg, 'förskjöt en rondserie ovanpå besöksrytmen');

  await page.evaluate(bid => { DP.Plan.vaxlaByggnad(bid); }, b3.byggnad);
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppen');
  const iPlan = await page.evaluate(() => ({
    besokFsk: (document.querySelector('#tidsaxel .ta-besok-etikett .ta-fsk') || {}).textContent || null,
    // Rondraderna: etiketter som varken är besöksraden eller rubrikerna
    rondFsk: [].filter.call(document.querySelectorAll('#tidsaxel .ta-etikett'),
      e => !e.classList.contains('ta-besok-etikett') && e.querySelector('.ta-fsk'))
      .map(e => e.querySelector('.ta-namn').textContent + ' ' + e.querySelector('.ta-fsk').textContent),
    provisoriska: document.querySelectorAll('#tidsaxel .rt-mark.provisorisk').length,
    utanFsk: document.querySelectorAll('#tidsaxel .rt-mark:not(.provisorisk)').length
  }));
  kontroll(iPlan.besokFsk && /⇥/.test(iPlan.besokFsk),
    'planeringens tidsaxel visar besöksrytmens förskjutning som ⇥ på besöksraden ('
    + iPlan.besokFsk + ')');
  kontroll(iPlan.rondFsk.length === 1 && iPlan.rondFsk[0].includes('⇥'),
    'rondseriens egen förskjutning står som ⇥ på just den rondens rad, och upprepas inte på '
    + 'de övriga (' + iPlan.rondFsk.join(' | ') + ')');
  kontroll(iPlan.provisoriska > 0 && iPlan.utanFsk > 0,
    'de provisoriskt flyttade tillfällena är markerade för sig i planeringens tidsaxel ('
    + iPlan.provisoriska + ' av ' + (iPlan.provisoriska + iPlan.utanFsk) + ' markörer) – '
    + 'permanent märks på raden, provisoriskt på tillfället');
  await bild(page, 'etapp5-forskjutning-i-planeringen');

  // ------------------------------------------------------------------
  // Stryka ett enskilt tillfälle för hand (berättelse 62)
  // ------------------------------------------------------------------
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'balansering', 'Balansering öppen igen');
  const b4 = await valjBricka(page, k => !k.provisorisk);
  await page.locator(cellValjare(b4, b4.vecka)).click();
  await vanta(page, () => !!document.querySelector('.bal-strykknapp'), 'veckolistan med strykknappar');
  const radValjare = '.bal-tillfalle[data-byggnad="' + b4.byggnad + '"][data-rond="' + b4.rond
    + '"][data-ordinarie="' + b4.ordinarie + '"]';
  forePosSteg = await historikpos(page);
  await page.locator(radValjare + ' .bal-strykknapp').click();
  await stegKlartPos(page, forePosSteg, 'strök ett tillfälle för hand');
  const struket = await page.evaluate(arg => {
    const P = DP.Plan, s = P.stateFor(arg.byggnad);
    const kvar = P.rutintillfallen(s, arg.byggnad)
      .filter(t => t.rond === arg.rond && t.ordinarieVecka === arg.ordinarie).length;
    const med = P.tillfallenMedStrukna(s, arg.byggnad)
      .filter(t => t.rond === arg.rond && t.ordinarieVecka === arg.ordinarie)[0];
    return { kvar, struken: med && med.struken, steg: P.historik().lista[P.historik().pos] };
  }, b4);
  kontroll(struket.kvar === 0 && struket.struken === true,
    'ett tillfälle kan strykas för hand: det finns inte längre bland rutintillfällena, men '
    + 'står kvar som struket');
  kontroll(await page.locator(radValjare + '.struken').count() === 1
    && (await page.locator(radValjare + ' .bal-strykknapp').innerText()).includes('Återställ'),
    'den strukna raden står kvar i veckolistan med en knapp för att återställa');
  await angra(page);
  kontroll(await page.evaluate(arg => DP.Plan.rutintillfallen(DP.Plan.stateFor(arg.byggnad), arg.byggnad)
    .filter(t => t.rond === arg.rond && t.ordinarieVecka === arg.ordinarie).length === 1, b4) === true,
    'ångra tar tillbaka strykningen för hand');
  await gorOm(page);

  // Återställ utan att gå via ångra: ett ställningstagande ska gå att ta tillbaka för sig
  forePosSteg = await historikpos(page);
  await page.locator(radValjare + ' .bal-strykknapp').click();
  await stegKlartPos(page, forePosSteg, 'återställde ett struket tillfälle');
  kontroll(await page.evaluate(arg => {
    const t = DP.Plan.rutintillfallen(DP.Plan.stateFor(arg.byggnad), arg.byggnad)
      .filter(x => x.rond === arg.rond && x.ordinarieVecka === arg.ordinarie)[0];
    return !!t && !t.struken;
  }, b4) === true,
    'ett struket tillfälle kan återställas för hand, utan att gå via ångra');

  // ------------------------------------------------------------------
  // En annan utförares rad är inget mål: balanseringen byter aldrig utförare (beslut 46)
  // ------------------------------------------------------------------
  const b6 = await valjBricka(page, k => !k.provisorisk);
  const annanRad = await page.evaluate(arg => {
    const rad = [].filter.call(document.querySelectorAll('.bt-cell:not(.bt-ucell)'),
      c => c.dataset.utforare !== arg.utforare && Number(c.dataset.vecka) !== arg.vecka)[0];
    return rad ? { utforare: rad.dataset.utforare, vecka: Number(rad.dataset.vecka) } : null;
  }, b6);
  const forePosAnnan = await historikpos(page);
  let siktePaAnnan = null;
  await dra(page, brickValjare(b6),
    '.bt-cell:not(.bt-ucell)[data-utforare="' + annanRad.utforare + '"][data-vecka="' + annanRad.vecka + '"]', {
      medanDuDrar: async () => {
        siktePaAnnan = await page.evaluate(() => ({
          siktad: document.querySelectorAll('.bt-cell.siktad').length,
          besked: !!document.getElementById('dragbesked')
        }));
      }
    });
  kontroll(siktePaAnnan && siktePaAnnan.siktad === 0 && !siktePaAnnan.besked
    && await page.locator('.flyttfraga').count() === 0
    && await historikpos(page) === forePosAnnan,
    'en annan utförares rad är inget mål: inget sikte, inget besked, ingen fråga och inget '
    + 'steg i historiken (' + b6.utforare + ' v. ' + b6.vecka + ' → ' + annanRad.utforare
    + ' v. ' + annanRad.vecka + ')');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: planeringen har ändrats sedan balanseringen (beslut 40, biljett #18).
//
// Balanseringen räknade på en planering, och den planeringen kan ändras efteråt. Då ska
// förskjutningarna ligga kvar – arbetet ska inte gå förlorat – men steget ska säga att
// underlaget inte längre stämmer, och ingenting får räknas om av sig själv.
async function testPlaneringAndratsEfterBalansering(browser) {
  console.log('Etapp 5 – planeringen har ändrats sedan balanseringen (beslut 40)');
  const page = await balanseradSida(browser);

  // ------------------------------------------------------------------
  // Direkt efter balanseringen stämmer underlaget
  // ------------------------------------------------------------------
  const efter = await page.evaluate(() => {
    const b = DP.Plan.balanseringStatus();
    return { klar: b.klar, andrad: b.andrad, antal: b.andringar.length,
             sammandrag: !!(b.resultat && b.resultat.sammandrag) };
  });
  kontroll(efter.sammandrag, 'balanseringen sparar ett sammandrag av underlaget');
  kontroll(efter.klar && !efter.andrad && efter.antal === 0,
    'direkt efter balanseringen är steget klart och ingenting är ändrat');
  kontroll(await page.locator('.bal-andrad').count() === 0,
    'ingen markering om ändrad planering direkt efter balanseringen');

  // ------------------------------------------------------------------
  // En ändrad frekvens: markeringen, listan – och förskjutningarna ligger kvar
  // ------------------------------------------------------------------
  const forskjutningFore = await page.evaluate(() => DP.Plan.stateFor('kasern1').forskjutning);
  const frekvens = await page.evaluate(() => {
    const P = DP.Plan;
    P.vaxlaByggnad('kasern1');
    P.andra('Byggnad invändigt varje vecka', s => {
      s.ronder.filter(r => r.id === 'BI')[0].freq = { typ: 'vecka', startManad: null };
    });
    const b = P.balanseringStatus();
    return { klar: b.klar, andrad: b.andrad, rader: b.andringar.map(a => ({ typ: a.typ, text: a.text })),
             forskjutning: P.stateFor('kasern1').forskjutning,
             // Balanseringens sparade resultat är orört: inget räknas om av sig själv
             balanserad: b.balanserad, sparadFsk: b.resultat.forskjutningar.kasern1 };
  });
  kontroll(frekvens.andrad && !frekvens.klar,
    'en ändrad frekvens gör steget ändrat och tar bort grön bock');
  kontroll(frekvens.rader.length === 1 && frekvens.rader[0].typ === 'frekvens'
    && frekvens.rader[0].text === 'Kasern 1: Byggnad invändigt varje vecka i stället för varje månad',
    'ändringen står i listan i klartext: ' + JSON.stringify(frekvens.rader));
  kontroll(frekvens.forskjutning === forskjutningFore && forskjutningFore > 0,
    'förskjutningen ligger kvar efter ändringen (' + frekvens.forskjutning + ' v.)');
  kontroll(frekvens.balanserad && frekvens.sparadFsk === forskjutningFore,
    'balanseringen är fortfarande gjord och dess resultat är orört – inget räknas om automatiskt');

  // Markeringen i vyn, ovanför knappen Balansera om
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => !!document.querySelector('.bal-andrad'), 'markeringen om ändrad planering');
  const panel = await page.evaluate(() => {
    const p = document.querySelector('.bal-andrad');
    const knapp = document.getElementById('balansera-knapp');
    return {
      rubrik: p.querySelector('.bal-andrad-rubrik').innerText.trim(),
      rader: Array.from(p.querySelectorAll('.bal-arad')).map(r => r.innerText.trim()),
      typer: Array.from(p.querySelectorAll('.bal-arad')).map(r => r.dataset.typ),
      // Beskedet ska stå ovanför handlingen, inte under den
      foreKnappen: p.compareDocumentPosition(knapp) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
      knapptext: knapp.textContent
    };
  });
  kontroll(panel.rubrik === 'Planeringen har ändrats sedan du balanserade – balansera om?',
    'markeringen har biljettens text: "' + panel.rubrik + '"');
  kontroll(panel.rader.length === 1 && panel.typer[0] === 'frekvens'
    && /varje vecka i stället för varje månad/.test(panel.rader[0]),
    'listan i panelen visar ändringen');
  kontroll(panel.foreKnappen && panel.knapptext === 'Balansera om',
    'markeringen står ovanför knappen Balansera om');

  // Processlinjens bock är borta och undertexten säger varför
  const linje = await page.evaluate(() => {
    const k = document.querySelector('.pl-steg[data-steg="balansering"]');
    return { klar: k.dataset.klar, under: k.querySelector('.pl-under').textContent,
             bock: !!k.querySelector('.pl-bock') };
  });
  kontroll(linje.klar === 'nej' && !linje.bock,
    'bocken för Balansering försvinner när planeringen har ändrats');
  kontroll(/ändrats/.test(linje.under), 'undertexten säger att planeringen har ändrats: ' + linje.under);

  // ------------------------------------------------------------------
  // Ångra ändringen: bocken kommer tillbaka
  // ------------------------------------------------------------------
  await angra(page);
  await vanta(page, () => !DP.Plan.balanseringStatus().andrad, 'ändringen ångrad');
  const angrat = await page.evaluate(() => {
    const k = document.querySelector('.pl-steg[data-steg="balansering"]');
    return { klar: DP.Plan.balanseringStatus().klar, bock: k.dataset.klar,
             panel: document.querySelectorAll('.bal-andrad').length };
  });
  kontroll(angrat.klar && angrat.bock === 'ja' && angrat.panel === 0,
    'bocken kommer tillbaka när ändringen ångras, och markeringen försvinner');

  // ------------------------------------------------------------------
  // Utförare, planerad tid och en byggnad som slutar vara klar
  // ------------------------------------------------------------------
  const ovriga = await page.evaluate(() => {
    const P = DP.Plan, ut = {};
    const rader = () => P.balanseringStatus().andringar.map(a => ({ typ: a.typ, text: a.text }));
    P.vaxlaByggnad('kasern1');

    P.andra('Bytte utförare', s => { s.ronder.filter(r => r.id === 'BI')[0].utforare = 'bertil'; });
    ut.utforare = rader();
    P.angra();

    P.andra('Halvdag i stället', s => { P.sattTid(s, 'BI', 'halvdag', P.tidForslag('BI', s, 'kasern1')); });
    ut.tid = rader();
    P.angra();

    // Utan ronder är steg 2–6 inte klara, så byggnaden räknas inte med längre
    P.andra('Tog bort alla ronder', s => { s.ronder = []; });
    ut.ejKlar = rader();
    ut.klaraUtan = P.klaraByggnader().length;
    P.angra();
    ut.efterAngra = rader().length;
    return ut;
  });
  kontroll(ovriga.utforare.length === 1 && ovriga.utforare[0].typ === 'utforare'
    && ovriga.utforare[0].text === 'Kasern 1: Byggnad invändigt utförs av Bertil Ek i stället för Anna Berg',
    'en ändrad utförare listas: ' + JSON.stringify(ovriga.utforare));
  kontroll(ovriga.tid.length === 1 && ovriga.tid[0].typ === 'tid'
    && /planerad till 4 h i stället för 8 h/.test(ovriga.tid[0].text),
    'en ändrad planerad tid listas: ' + JSON.stringify(ovriga.tid));
  kontroll(ovriga.klaraUtan === 3
    && ovriga.ejKlar.some(r => r.typ === 'ej-klar'
      && r.text === 'Kasern 1 är inte längre klar i alla sex stegen och räknas inte med'),
    'en byggnad som slutar vara klar listas som egen rad: ' + JSON.stringify(ovriga.ejKlar));
  kontroll(ovriga.efterAngra === 0, 'allt är orört igen när ändringen ångras');

  // ------------------------------------------------------------------
  // En provisorisk flytt för ett tillfälle som försvinner redovisas
  // ------------------------------------------------------------------
  const niva3 = await page.evaluate(() => {
    const P = DP.Plan;
    P.vaxlaByggnad('kasern1');
    // Flytta Byggnad utvändigt (kvartalsrond) provisoriskt en vecka bakåt …
    const t = P.rutintillfallen(P.stateFor('kasern1'), 'kasern1').filter(x => x.rond === 'BU');
    const sista = t[t.length - 1];
    P.flyttaTillfalle('kasern1', 'BU', sista.ordinarieVecka, sista.ordinarieVecka - 1);
    const foreAndring = P.balanseringStatus().bortstadade.length;
    const kvarFore = Object.keys(P.stateFor('kasern1').flyttade).length;
    // … och byt sedan frekvens så att den ordinarie veckan inte längre finns
    P.andra('Byggnad utvändigt en gång om året', s => {
      s.ronder.filter(r => r.id === 'BU')[0].freq = { typ: 'ar', startManad: null };
    });
    const b = P.balanseringStatus();
    const ut = {
      vecka: sista.ordinarieVecka, foreAndring, kvarFore,
      bortstadade: b.bortstadade.map(a => a.text),
      kvar: Object.keys(P.stateFor('kasern1').flyttade)
    };
    P.angra();
    ut.efterAngra = P.balanseringStatus().bortstadade.length;
    ut.flyttKvarEfterAngra = Object.keys(P.stateFor('kasern1').flyttade).length;
    // Ta också tillbaka själva flytten, så att nästa kontroll börjar från en ren planering
    P.angra();
    return ut;
  });
  kontroll(niva3.foreAndring === 0 && niva3.kvarFore > 0,
    'en provisorisk flytt i sig är ingen ändring av förutsättningarna – den ligger på nivå 3');
  kontroll(niva3.bortstadade.length === 1
    && niva3.bortstadade[0] === 'Kasern 1: den provisoriska flytten av Byggnad utvändigt v. '
      + niva3.vecka + ' togs bort – tillfället finns inte längre efter ändringen',
    'flytten för ett tillfälle som försvann redovisas i klartext: ' + JSON.stringify(niva3.bortstadade));
  kontroll(niva3.kvar.indexOf('BU:' + niva3.vecka) === -1,
    'den provisoriska flytten är borta ur planeringen');
  kontroll(niva3.efterAngra === 0 && niva3.flyttKvarEfterAngra === niva3.kvarFore,
    'ångra tar tillbaka både flytten och beskedet om att den togs bort');

  // En **strykning** för ett tillfälle som försvinner redovisas på samma sätt, med sitt eget ord
  const struken = await page.evaluate(() => {
    const P = DP.Plan;
    P.vaxlaByggnad('kasern1');
    const t = P.rutintillfallen(P.stateFor('kasern1'), 'kasern1').filter(x => x.rond === 'BU');
    const sista = t[t.length - 1];
    P.strykTillfalle('kasern1', 'BU', sista.ordinarieVecka);
    P.andra('Byggnad utvändigt en gång om året', s => {
      s.ronder.filter(r => r.id === 'BU')[0].freq = { typ: 'ar', startManad: null };
    });
    const ut = { vecka: sista.ordinarieVecka,
      texter: DP.Plan.balanseringStatus().bortstadade.map(a => a.text) };
    P.angra(); P.angra();
    return ut;
  });
  kontroll(struken.texter.length === 1
    && struken.texter[0] === 'Kasern 1: strykningen av Byggnad utvändigt v. ' + struken.vecka
      + ' togs bort – tillfället finns inte längre efter ändringen',
    'en strykning för ett tillfälle som försvann redovisas med sitt eget ord: '
      + JSON.stringify(struken.texter));

  // ------------------------------------------------------------------
  // Balanseringens tre svar är också underlag
  // ------------------------------------------------------------------
  // Halveras en utförares kapacitet räckte den balansering som gjordes inte längre, även om
  // ingen rond rörts. Att bara bekräfta ett förval är däremot inget svar som ändrats.
  const svar = await page.evaluate(() => {
    const P = DP.Plan, ut = {};
    const rader = () => P.balanseringStatus().andringar.map(a => ({ typ: a.typ, text: a.text }));
    P.sattKapacitet('anna', 1); ut.kapacitet = rader(); P.angra();
    P.vaxlaVeckaUtan(10); ut.veckorUtan = rader(); P.angra();
    P.sattAkerTill([]); ut.omraden = rader(); P.angra();
    P.godkannFraga('kapacitet'); ut.godkann = rader(); P.angra();
    return ut;
  });
  kontroll(svar.kapacitet.length === 1 && svar.kapacitet[0].typ === 'kapacitet'
    && svar.kapacitet[0].text === 'Anna Berg har 1 dag i veckan i stället för 3 dagar',
    'en ändrad kapacitet listas: ' + JSON.stringify(svar.kapacitet));
  kontroll(svar.veckorUtan.length === 1 && svar.veckorUtan[0].typ === 'veckor-utan'
    && /v\. 10, 28, 29, 30, 31, 52 i stället för v\. 28, 29, 30, 31, 52/.test(svar.veckorUtan[0].text),
    'ändrade veckor utan tillsyn och skötsel listas: ' + JSON.stringify(svar.veckorUtan));
  kontroll(svar.omraden.length === 1 && svar.omraden[0].typ === 'omraden'
    && svar.omraden[0].text === 'Områdena man åker till är inga i stället för Flygfältet',
    'ändrade områden man åker till listas: ' + JSON.stringify(svar.omraden));
  kontroll(svar.godkann.length === 0,
    'att bekräfta ett förval är inget ändrat svar – förvalet gällde redan (beslut 37)');

  // ------------------------------------------------------------------
  // Ett bortstädat tillfälle ogiltigförklarar inte balanseringen
  // ------------------------------------------------------------------
  // Ändrar planeraren en frekvens fram och tillbaka igen är förutsättningarna exakt de
  // balanseringen räknade på, så bocken ska vara tillbaka. Men flytten är fortfarande borta,
  // och beskedet om att den försvann ska stå kvar.
  const ensam = await page.evaluate(() => {
    const P = DP.Plan;
    P.vaxlaByggnad('kasern1');
    const t = P.rutintillfallen(P.stateFor('kasern1'), 'kasern1').filter(x => x.rond === 'BU');
    const sista = t[t.length - 1];
    P.flyttaTillfalle('kasern1', 'BU', sista.ordinarieVecka, sista.ordinarieVecka - 1);
    P.andra('Byggnad utvändigt en gång om året', s => {
      s.ronder.filter(r => r.id === 'BU')[0].freq = { typ: 'ar', startManad: null };
    });
    const mitt = P.balanseringStatus();
    P.andra('Byggnad utvändigt varje kvartal igen', s => {
      s.ronder.filter(r => r.id === 'BU')[0].freq = { typ: 'kvartal', startManad: null };
    });
    const b = P.balanseringStatus();
    const ut = {
      mitt: { klar: mitt.klar, andringar: mitt.andringar.length, bortstadade: mitt.bortstadade.length },
      klar: b.klar, andrad: b.andrad, andringar: b.andringar.length,
      bortstadade: b.bortstadade.map(x => x.text)
    };
    P.angra(); P.angra(); P.angra();
    return ut;
  });
  kontroll(ensam.mitt.klar === false && ensam.mitt.andringar === 1 && ensam.mitt.bortstadade === 1,
    'under ändringen är både förutsättningen och det bortstädade redovisade');
  kontroll(ensam.klar && !ensam.andrad && ensam.andringar === 0,
    'bocken är tillbaka när förutsättningarna är desamma igen, trots det bortstädade');
  kontroll(ensam.bortstadade.length === 1 && /togs bort/.test(ensam.bortstadade[0]),
    'beskedet om den borttagna flytten står kvar – flytten är fortfarande borta');

  // Den egna rutan för bortstädat, skild från "balansera om?"
  await page.evaluate(() => {
    const P = DP.Plan;
    P.vaxlaByggnad('kasern1');
    const t = P.rutintillfallen(P.stateFor('kasern1'), 'kasern1').filter(x => x.rond === 'BU');
    const sista = t[t.length - 1];
    P.flyttaTillfalle('kasern1', 'BU', sista.ordinarieVecka, sista.ordinarieVecka - 1);
    P.andra('Byggnad utvändigt en gång om året', s => {
      s.ronder.filter(r => r.id === 'BU')[0].freq = { typ: 'ar', startManad: null };
    });
    P.andra('Byggnad utvändigt varje kvartal igen', s => {
      s.ronder.filter(r => r.id === 'BU')[0].freq = { typ: 'kvartal', startManad: null };
    });
  });
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => !!document.querySelector('.bal-bortstadad'), 'rutan för bortstädat');
  const rutor = await page.evaluate(() => ({
    bortstadad: document.querySelectorAll('.bal-bortstadad .bal-arad').length,
    andrad: document.querySelectorAll('.bal-andrad').length,
    bock: document.querySelector('.pl-steg[data-steg="balansering"]').dataset.klar
  }));
  kontroll(rutor.bortstadad === 1 && rutor.andrad === 0 && rutor.bock === 'ja',
    'bortstädat står i en egen ruta, utan "balansera om?" och med bocken kvar');
  await angra(page); await angra(page); await angra(page);
  await vanta(page, () => DP.Plan.balanseringStatus().bortstadade.length === 0, 'allt återställt');

  // ------------------------------------------------------------------
  // Balansera om: ingenting händer utan att planeraren trycker
  // ------------------------------------------------------------------
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  const forePos = await historikpos(page);
  await page.evaluate(() => {
    DP.Plan.vaxlaByggnad('kasern2');
    DP.Plan.andra('Byggnad invändigt varannan vecka', s => {
      s.ronder.filter(r => r.id === 'BI')[0].freq = { typ: 'varannan', startManad: null };
    });
  });
  await vanta(page, () => DP.Plan.balanseringStatus().andrad, 'markeringen efter ändringen i Kasern 2');
  const efterAndring = await historikpos(page);
  kontroll(efterAndring === forePos + 1,
    'ändringen är ett steg i historiken och ingen balansering sker av sig själv');

  await page.locator('#balansera-knapp').click();
  await vanta(page, () => !DP.Plan.balanseringStatus().andrad, 'ny balansering gjord');
  const omBalanserat = await page.evaluate(() => {
    const k = document.querySelector('.pl-steg[data-steg="balansering"]');
    return { klar: DP.Plan.balanseringStatus().klar, bock: k.dataset.klar,
             panel: document.querySelectorAll('.bal-andrad').length, pos: DP.Plan.historik().pos };
  });
  kontroll(omBalanserat.klar && omBalanserat.bock === 'ja' && omBalanserat.panel === 0,
    'bocken kommer tillbaka efter en ny balansering');
  kontroll(omBalanserat.pos === efterAndring + 1,
    'den nya balanseringen är ett enda steg i historiken');

  await bild(page, 'etapp5-planeringen-har-andrats');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

async function testBalanseringRymsPaSkarmen(browser) {
  console.log('Etapp 5 – Balansering på 1920×1200');
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.fel = [];
  page.on('pageerror', e => page.fel.push(e.message));
  page.on('console', m => { if (m.type() === 'error') { page.fel.push(m.text()); } });
  page.on('dialog', d => d.accept());
  await page.goto(URL_INDEX);
  await vanta(page, () => !!(window.DP && DP.Vyer && DP.Balansering) && !!document.querySelector('.pl-steg'), 'appen ritad');

  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await vanta(page, () => document.querySelectorAll('.bt-utforare').length === 4, 'tidsaxeln med fyra utförare');
  await page.locator('.bt-cell[data-utforare="anna"][data-vecka="1"]').click();
  await vanta(page, () => !!document.querySelector('.bal-tillfalle'), 'veckolistan öppen');
  await rorelsePaus(page);
  await bild(page, 'etapp5-balansering-tidsaxel');

  const matt = await page.evaluate(() => {
    const layout = document.querySelector('.layout').getBoundingClientRect();
    const grid = document.querySelector('.bt-grid');
    const sido = document.querySelector('#hs-balansering');
    return {
      fonster: window.innerHeight,
      layoutBotten: Math.round(layout.bottom),
      gridScroll: grid.scrollHeight, gridKlient: grid.clientHeight,
      sidoScroll: sido.scrollHeight, sidoKlient: sido.clientHeight,
      sistaVeckan: !!document.querySelector('.bt-cell[data-vecka="' + DP.Plan.ANTAL_VECKOR + '"]'),
      breddOk: Math.round(document.querySelector('.bt-grid').scrollWidth) <= Math.round(grid.clientWidth) + 1
    };
  });
  kontroll(matt.layoutBotten <= matt.fonster,
    'layouten slutar vid fönsterkanten i Balansering (' + matt.layoutBotten + ' av ' + matt.fonster + ' px)');
  kontroll(matt.gridScroll <= matt.gridKlient,
    'tidsaxeln med fyra utförare ryms utan att scrolla (' + matt.gridScroll + ' av ' + matt.gridKlient + ' px)');
  kontroll(matt.breddOk && matt.sistaVeckan,
    'hela året ryms på bredden, till och med sista veckan');
  // Sidopanelen får scrolla: där ligger veckolistan, som växer med antalet tillfällen.
  // Det som inte får hända är att den inte går att nå alls.
  kontroll(matt.sidoKlient > 600, 'sidopanelen har plats åt byggnaderna och veckolistan (' + matt.sidoKlient + ' px)');

  // ------------------------------------------------------------------
  // Alla tre huvudstegen, med planeringen *fylld* (biljett #19)
  // ------------------------------------------------------------------
  // Processlinjetestet mäter samma tre steg, men på en tom planering. Det är det snällaste
  // läget: steg 5 har inga kopplingar att lista, steg 6 ingen rond att ge en tid, och
  // Balansering ingen förklaring att skriva ut. Här är allt ifyllt och balanserat, alltså det
  // läge planeraren faktiskt arbetar i, och då är innehållet som störst.
  const forePos = await page.evaluate(() => DP.Plan.historik().pos);
  await page.locator('#balansera-knapp').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'balanseringssteget', forePos);
  await vanta(page, () => !!document.querySelector('.bal-frad'), 'förklaringen ritad');
  // Hangaren är den trängsta byggnaden: sex ronder, alltså den längsta listan i steg 6 och
  // det största trädet i Byggnad. Mäts garaget med sina två ronder går testet igenom även om
  // en lista har växt ur sidopanelen.
  await byggnadsval(page, 'hangar');

  for (const steg of ['byggnad', 'planering', 'balansering']) {
    await page.locator('.pl-steg[data-steg="' + steg + '"]').click();
    // Bara ett stegkort kan vara öppet åt gången i flödet. I Planering öppnas steg 6, det
    // längsta: en rad per rond med dagsdel, minuter och uträkningen i klartext. Är det stängt
    // mäts tomrummet i stället, och det är inte vad planeraren ser när hen arbetar.
    if (steg === 'planering') { await oppnaSteg(page, 'Hur lång tid tar ronderna'); }
    await rorelsePaus(page);
    await bild(page, 'etapp5-fylld-' + steg);
    const m = await page.evaluate(stegId => {
      const layout = document.querySelector('.layout').getBoundingClientRect();
      const sido = document.querySelector('#hs-' + stegId);
      return {
        fonster: window.innerHeight,
        // Dokumentet har `overflow: hidden`, så sidan kan inte växa förbi fönstret av sig
        // själv. Det som avgör är om layouten slutar vid kanten eller sticker ut under den.
        layoutBotten: Math.round(layout.bottom),
        dokument: Math.round(document.documentElement.scrollHeight),
        // Varje steg har sin egen panel, och den får scrolla inuti sig: listorna växer med
        // planeringen. Vad som mäts är att den har en rimlig höjd att scrolla *inom*.
        panelKlient: sido.clientHeight
      };
    }, steg);
    kontroll(m.layoutBotten <= m.fonster && m.dokument <= m.fonster,
      'sidan scrollar inte i huvudsteget ' + steg + ' med fylld planering (layouten slutar vid '
      + m.layoutBotten + ', dokumentet är ' + m.dokument + ' av ' + m.fonster + ' px)');
    kontroll(m.panelKlient >= 800,
      'steget ' + steg + ' har plats åt sitt innehåll (' + m.panelKlient + ' px)');
  }

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Etapp 5: huvudflödet för Balansering i den **fristående filen** (biljett #19).
//
// Filen är inte en kopia av index.html: byggskriptet bäddar in all CSS och all JavaScript, och
// gör det genom textersättning. Går en inbäddning fel – en `</script>` i en sträng, en fil som
// inte kom med i skripttaggarnas ordning – fungerar index.html ändå, och felet syns först hos
// användaren. Därför byggs filen om här och prövas som en egen sida.
//
// Testet går igenom huvudflödet och inte varje detalj: de enskilda reglerna är redan prövade mot
// index.html. Vad som prövas här är att *allt är med och hänger ihop* när filen står för sig själv,
// alltså att processlinjen, steg 5 och 6, de tre frågorna, Balansera, flytt för hand och
// markeringen när planeringen ändrats fungerar utan nätverk och utan sidofiler.
// Byggnaden som data i tillståndet (biljett #32, beslut 71 och 73). Byggnadens namn, rum och
// installationer ligger i historikens ögonblicksbilder och ändras bara genom `DP.Plan`.
// Kontrollen är inte att datan går att skriva – det är att **hela vägen ut** följer med:
// modellen, byggnadsträdet och informationskortet ritas om ur den nya datan, och ett ångra
// tar tillbaka både datan och det som visas. Ritas något av dem inte om är felet osynligt
// tills någon tittar, och då står det fel namn på ett rum i modellen.
// Rummets namn som det står i byggnadsträdet. Läses med textContent och inte innerText:
// `byggTrad()` bygger trädet från grunden och stänger då planets dragspel, så noden är där men
// inte synlig – och innerText ger tom sträng för det som inte syns.
// `nyckel` är rummets nyckel (plan + rumsnummer, "01-001"), som trädet sätter i data-rum:
// rumsnumret löper per plan och duger inte som utpekare (beslut 76).
const tradRumNamn = (page, nyckel) => page.evaluate(n =>
  document.querySelector('#trad .rum[data-rum="' + n + '"] .rum-namn').textContent, nyckel);

async function testByggnadenSomData(browser) {
  console.log('Byggnaden som data i tillståndet (beslut 71 och 73)');
  const page = await nySida(browser, URL_INDEX, 'kasern1');
  // Byggnadsträdet och modellen bor i huvudsteget Byggnad, som är stängt från start.
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');

  // Starttillståndet kommer ur datafilen, men läses ur planeringen.
  const start = await page.evaluate(() => {
    const b = DP.Plan.byggnad();
    const r = b.rum[0];
    return { namn: b.namn, rumNamn: r.namn, rumNyckel: DP.rumBeteckning(r), antalRum: b.rum.length };
  });
  kontroll(start.antalRum > 0 && !!start.namn, 'byggnadens data läses ur planeringen (' +
    start.namn + ', ' + start.antalRum + ' rum)');

  // Ingen i appen får läsa byggnadsdata förbi planeringen. `DP.byggnader` finns kvar som källa
  // till starttillståndet, så kontrollen är att ett *ändrat* starttillstånd inte syns: skriver
  // någon läsare direkt ur datafilen hade namnet nedan slagit igenom i modellen och trädet.
  await page.evaluate(() => { DP.byggnader.kasern1.namn = 'FÖRBI PLANERINGEN'; return 1; });
  kontroll(await page.evaluate(() => DP.Plan.byggnad().namn) === start.namn,
    'en ändring direkt i datafilen syns inte – planeringen äger byggnadens data');
  kontroll(!(await page.locator('#trad .sammanfattning').innerText()).includes('FÖRBI PLANERINGEN'),
    'byggnadsträdet läser namnet ur planeringen');
  await page.evaluate(n => { DP.byggnader.kasern1.namn = n; return 1; }, start.namn);

  // Öppna rummets informationskort, så att omritningen av kortet går att se. Planets
  // dragspel i trädet är stängt för alla plan utom 01, så det öppnas först.
  await page.evaluate(nr => {
    const rd = document.querySelector('#trad .rum[data-rum="' + nr + '"]');
    rd.closest('details.plan').open = true;
    return 1;
  }, start.rumNyckel);
  await page.locator('#trad .rum[data-rum="' + start.rumNyckel + '"] summary').click();
  kontroll((await page.locator('#infokort').innerText()).includes(start.rumNamn),
    'informationskortet visar rummets namn ur planeringen (' + start.rumNamn + ')');

  // Ställ planeraren någonstans i modellen: ett släckt plan, en flyttad kamera och en markerad
  // installation. Det är den vyn som ska stå kvar när byggnadens data ändras.
  // Kameran flyger mjukt mellan vyer, så den måste ha landat innan läget läses – annars är
  // det en animering och inte planerarens vy som jämförs.
  await rorelsePaus(page);
  const foreVyn = await page.evaluate(() => {
    DP.viewer.valjInstallation(DP.Plan.signifikanta()[0], false);
    return {
      kamera: DP.viewer.camera.position.toArray().map(v => Math.round(v * 100) / 100),
      slackta: Object.keys(DP.viewer.planSynligt).filter(id => !DP.viewer.planSynligt[id]),
      vald: DP.viewer.valdInst && DP.viewer.valdInst.id
    };
  });
  kontroll(foreVyn.slackta.length > 0 && !!foreVyn.vald,
    'något plan är släckt och en installation markerad före ändringen (släckta: ' +
    foreVyn.slackta.join(', ') + ', vald: ' + foreVyn.vald + ')');

  // Ändringen: ett rums namn, genom planeringens egen väg. Ett steg i historiken som allt annat.
  const fore = await historiklangd(page);
  await page.evaluate(nyckel => {
    DP.Plan.andraByggnad('Döpte om rummet', null, function (b) {
      b.rum.filter(function (r) { return DP.rumBeteckning(r) === nyckel; })[0].namn = 'Provrummet';
    });
    return 1;
  }, start.rumNyckel);
  await stegKlart(page, fore, 'ändrat rumsnamn');
  kontroll(await page.evaluate(() => DP.Plan.historik().lista.slice(-1)[0]) === start.namn + ': Döpte om rummet',
    'ändringen av byggnaden är ett eget steg i historiken, namngivet med byggnaden');

  // Modellen: viewern bygger sitt rumsindex ur byggnadens data, så ett omritat index betyder
  // att hela modellen byggts om på den nya datan.
  kontroll(await page.evaluate(nyckel => DP.viewer.rumIndex[nyckel].namn, start.rumNyckel) === 'Provrummet',
    'modellen är ombyggd på den nya datan');
  // Och planeraren står kvar där hon stod. Ombyggnaden går via `byggOmByggnad` och inte
  // `sattByggnad`: den senare nollställer kamera, plansynlighet och markering med flit, vilket
  // är rätt vid ett byte av byggnad men hade kastat ut planeraren ur sin egen ändring.
  const vyn = await page.evaluate(() => ({
    kamera: DP.viewer.camera.position.toArray().map(v => Math.round(v * 100) / 100),
    slackta: Object.keys(DP.viewer.planSynligt).filter(id => !DP.viewer.planSynligt[id]),
    vald: DP.viewer.valdInst && DP.viewer.valdInst.id
  }));
  kontroll(JSON.stringify(vyn.kamera) === JSON.stringify(foreVyn.kamera),
    'kameran står kvar efter ombyggnaden (' + vyn.kamera.join(', ') + ')');
  kontroll(JSON.stringify(vyn.slackta) === JSON.stringify(foreVyn.slackta),
    'de släckta planen är fortfarande släckta (' + (vyn.slackta.join(', ') || 'inga') + ')');
  kontroll(vyn.vald === foreVyn.vald,
    'den markerade installationen är fortfarande markerad (' + vyn.vald + ')');
  kontroll(await tradRumNamn(page, start.rumNyckel) === 'Provrummet',
    'byggnadsträdet visar det nya rumsnamnet');
  kontroll((await page.locator('#infokort').innerText()).includes('Provrummet'),
    'informationskortet visar det nya rumsnamnet utan att stängas');

  // Ångra går samma väg genom historiken, så omritningen sker av sig själv (beslut 73).
  await angra(page);
  kontroll(await page.evaluate(nyckel => DP.Plan.byggnad().rum.filter(r => DP.rumBeteckning(r) === nyckel)[0].namn, start.rumNyckel) === start.rumNamn,
    'ångra återställer byggnadens data');
  kontroll(await page.evaluate(nyckel => DP.viewer.rumIndex[nyckel].namn, start.rumNyckel) === start.rumNamn,
    'ångra bygger om modellen på den återställda datan');
  kontroll(await tradRumNamn(page, start.rumNyckel) === start.rumNamn,
    'ångra ritar om byggnadsträdet');
  kontroll((await page.locator('#infokort').innerText()).includes(start.rumNamn),
    'ångra ritar om informationskortet');

  // Planeringen rörs inte av en ändring av byggnaden, och byggnadens data rörs inte av
  // planeringen: de två är skilda delar av samma steg.
  await page.evaluate(() => { DP.Plan.andra('Satte besöksfrekvens', function (s) { s.bas = { typ: 'manad' }; }); return 1; });
  kontroll(await page.evaluate(nyckel => DP.Plan.byggnad().rum.filter(r => DP.rumBeteckning(r) === nyckel)[0].namn, start.rumNyckel) === start.rumNamn,
    'en ändring av planeringen rör inte byggnadens data');

  // Byggnadens namn: ändras det ska byggnadsväljaren och rutintillfällenas namn följa med, för
  // namnet är det som skiljer två byggnaders rutintillfällen åt (beslut 103).
  const foreNamn = await historikpos(page);
  await page.evaluate(() => { DP.Plan.andraByggnad('Bytte namn', null, function (b) { b.namn = 'Kasern 9'; }); return 1; });
  await stegKlartPos(page, foreNamn, 'nytt byggnadsnamn');
  kontroll((await page.locator('#byggnad').innerText()).includes('Kasern 9'), 'byggnadsväljaren visar det nya namnet');
  kontroll((await page.evaluate(() => DP.Plan.rutintillfalleNamn('BS', 5))).startsWith('Kasern9-'),
    'rutintillfällets namn följer byggnadens nya namn');
  await angra(page);
  kontroll((await page.locator('#byggnad').innerText()).includes(start.namn), 'ångra ger byggnadsväljaren det gamla namnet');

  // En installation: uppslaget i planeringen ska ge den ändrade versionen, inte en kopia
  // indexet höll från start.
  const instId = await page.evaluate(() => DP.Plan.signifikanta()[0].id);
  // Efter ångran skriver nästa steg över det som låg framför, så historiken blir inte längre –
  // positionen är det som går fram.
  const foreInst = await historikpos(page);
  await page.evaluate(id => {
    DP.Plan.andraByggnad('Bytte fabrikat', null, function (b) {
      b.installationer.filter(function (i) { return i.id === id; })[0].fabrikat = 'Provfabrikat';
    });
    return 1;
  }, instId);
  await stegKlartPos(page, foreInst, 'ändrat fabrikat');
  kontroll(await page.evaluate(id => DP.Plan.inst(id).fabrikat, instId) === 'Provfabrikat',
    'uppslaget av en installation ger den ändrade versionen');
  await page.evaluate(id => { DP.ui.visaInstKort(DP.Plan.inst(id)); return 1; }, instId);
  kontroll((await page.locator('#infokort').innerText()).includes('Provfabrikat'),
    'informationskortet visar installationens nya fabrikat');
  await angra(page);
  kontroll(await page.evaluate(id => DP.Plan.inst(id).fabrikat, instId) !== 'Provfabrikat',
    'ångra återställer installationen');

  await bild(page, 'byggnad-som-data');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Skapa ny byggnad: byggnadsflödet och steg 1 (biljett #34, beslut 69, 103 och 104).
//
// Det som prövas är planerarens väg genom steget och vad som blir kvar i tillståndet: att
// byggnaden faktiskt kommer till, att den syns med sin status, att namnet inte kan krocka med
// ett som finns, att typen står låst efteråt – och att **ångra tar bort byggnaden** (beslut 73).
// Det sista är det som skiljer en byggnad i tillståndet från en i en modulvariabel: ett ångra
// som lämnade kvar en halv byggnad hade gjort historiken osann.
async function testSkapaNyByggnad(browser) {
  console.log('Skapa ny byggnad: byggnadsflödet och steg 1 (beslut 69, 103 och 104)');
  const page = await nySida(browser, URL_INDEX);
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');

  const bf = page.locator('#byggnadsflode');
  // Steglistan har samma form som Planeringens (beslut 107): fyra steg i en lodrät lista.
  const steg = await bf.locator('.steg-kort').count();
  kontroll(steg === 4, 'byggnadsflödet har fyra steg i en lodrät lista (' + steg + ')');
  const titlar = await bf.locator('.steg-titel').allInnerTexts();
  kontroll(titlar.join(' → ') === 'Byggnadstyp och namn → Plan → Rum → Installationer',
    'stegen är Byggnadstyp och namn → Plan → Rum → Installationer (' + titlar.join(', ') + ')');
  // De fyra typbyggnaderna står i listan med sin status (berättelse 7)
  kontroll(await bf.locator('.bf-byggnad').count() === 4,
    'byggnadslistan visar de fyra byggnader som finns');
  kontroll((await bf.locator('.bf-byggnad[data-byggnad="garage"]').innerText()).includes('Klar för Planering'),
    'en färdig byggnad har statusen "Klar för Planering"');

  // ---- Namnet är unikt (beslut 103) ----
  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('.val[data-typ="kasern"]').click();
  await bf.locator('input[data-falt="namn"]').fill('Kasern 1');
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-fel'), 'beskedet om namnet');
  kontroll((await bf.locator('.bf-fel').innerText()).includes('redan en byggnad som heter Kasern 1'),
    'ett namn som redan finns stoppas med ett besked i steg 1');
  kontroll(await bf.locator('button', { hasText: 'Skapa byggnad' }).isDisabled(),
    'knappen Skapa byggnad är avstängd så länge namnet är upptaget');
  // Regeln bor i planeringen och inte i vyn, så att den går att läsa utan DOM (beslut 61).
  // Skillnad på stora och små bokstäver gör inte namnet till ett annat för den som läser en lista.
  kontroll(await page.evaluate(() => DP.Plan.namnTaget('kasern 1')),
    'namnet är upptaget även med annan versalisering');
  kontroll(await page.evaluate(() => !DP.Plan.namnTaget('Kasern 3')), 'ett ledigt namn är ledigt');

  // ---- Skapa byggnaden ----
  const fore = await historiklangd(page);
  await bf.locator('input[data-falt="namn"]').fill('Kasern 3');
  await bf.locator('.val[data-omrade="flygfaltet"]').click();
  await bf.locator('button', { hasText: 'Skapa byggnad' }).click();
  await stegKlart(page, fore, 'skapa byggnad');

  const ny = await page.evaluate(() => {
    const id = DP.Plan.aktivId(), b = DP.Plan.byggnad();
    return {
      id, namn: b.namn, typ: b.typ, omrade: b.omrade, farg: b.farg,
      ordning: DP.Plan.byggnadsordning,
      status: DP.Plan.byggnadStatus(),
      steg: DP.Plan.byggnadsSteg(),
      // Färgen ska vara en som ingen annan byggnad har (berättelse 12)
      andraFarger: DP.Plan.byggnadsordning.filter(x => x !== id).map(x => DP.Plan.byggnad(x).farg),
      text: DP.Plan.historik().lista.slice(-1)[0]
    };
  });
  kontroll(ny.namn === 'Kasern 3' && ny.typ === 'kasern' && ny.omrade === 'flygfaltet',
    'byggnaden fick valt namn, typ och område (' + ny.namn + ', ' + ny.typ + ', ' + ny.omrade + ')');
  kontroll(ny.ordning.length === 5 && ny.ordning[4] === ny.id,
    'byggnaden finns i byggnadsordningen (' + ny.ordning.join(', ') + ')');
  kontroll(ny.andraFarger.indexOf(ny.farg) < 0,
    'byggnaden fick en egen färg som ingen annan har (' + ny.farg + ' mot ' + ny.andraFarger.join(', ') + ')');
  kontroll(ny.status === 'Väntar på inläsningsfil',
    'byggnadslistan visar statusen "Väntar på inläsningsfil" (' + ny.status + ')');
  kontroll(ny.steg[1] === true && ny.steg[2] === false,
    'steg 1 är klart och steg 2 Plan är det inte');
  kontroll(ny.text === 'Skapa byggnad Kasern 3 (kasern)',
    'skapandet är ett steg i historiken med text i klartext ("' + ny.text + '")');
  kontroll((await bf.locator('.bf-byggnad[data-byggnad="' + ny.id + '"]').innerText()).includes('Kasern 3'),
    'den nya byggnaden syns i byggnadslistan');
  // Steg 1 fälls ihop med grön bock när det är klart (samma form som Planering)
  kontroll(await bf.locator('.steg-kort[data-bsteg="1"].klar').count() === 1,
    'steg 1 har grön bock');
  kontroll(await bf.locator('.steg-kort[data-bsteg="1"] .steg-kropp').count() === 0,
    'steg 1 är hopfällt när det är klart');

  // ---- En byggnad utan plan går att visa utan fel ----
  const tom = await page.evaluate(() => ({
    plan: DP.Plan.byggnad().plan.length,
    rum: DP.Plan.byggnad().rum.length,
    modellRum: Object.keys(DP.viewer.rumIndex).length,
    besked: !document.getElementById('tom-byggnad').hidden
  }));
  kontroll(tom.plan === 0 && tom.rum === 0 && tom.modellRum === 0,
    'den nya byggnaden är tom och modellen är ombyggd på den');
  kontroll(tom.besked, 'vyn säger att byggnaden inte har några plan ännu, i stället för en tom ruta');
  await bild(page, 'byggnad-steg1-skapad');

  // ---- Typen är låst när byggnaden skapats (beslut 104) ----
  await bf.locator('.steg-kort[data-bsteg="1"] .steg-huvud').click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="1"] .steg-kropp'),
    'steg 1 öppet igen');
  const kropp1 = await bf.locator('.steg-kort[data-bsteg="1"] .steg-kropp').innerText();
  kontroll(kropp1.includes('låst'), 'steg 1 säger att byggnadstypen är låst');
  kontroll(await bf.locator('.steg-kort[data-bsteg="1"] .val[data-typ]').count() === 0,
    'typen går inte att ändra när byggnaden skapats – inga typval visas');

  // ---- Ångra tar bort byggnaden, gör om skapar den igen (beslut 73) ----
  await angra(page);
  const efterAngra = await page.evaluate(() => ({
    ordning: DP.Plan.byggnadsordning,
    aktiv: DP.Plan.aktivId(),
    aktivFinns: !!DP.Plan.byggnad(),
    ilistan: document.querySelectorAll('#byggnadsflode .bf-byggnad').length
  }));
  kontroll(efterAngra.ordning.length === 4 && efterAngra.ordning.indexOf(ny.id) < 0,
    'ångra tar bort byggnaden (' + efterAngra.ordning.join(', ') + ')');
  kontroll(efterAngra.aktivFinns && efterAngra.ordning.indexOf(efterAngra.aktiv) >= 0,
    'den aktiva byggnaden är en som finns efter ångran (' + efterAngra.aktiv + ')');
  kontroll(efterAngra.ilistan === 4, 'byggnadslistan ritas om utan den borttagna byggnaden');

  await gorOm(page);
  const efterGorOm = await page.evaluate(() => ({
    ordning: DP.Plan.byggnadsordning,
    aktiv: DP.Plan.aktivId(),
    namn: DP.Plan.byggnad().namn
  }));
  kontroll(efterGorOm.ordning.length === 5 && efterGorOm.ordning[4] === ny.id,
    'gör om skapar byggnaden igen (' + efterGorOm.ordning.join(', ') + ')');
  kontroll(efterGorOm.aktiv === ny.id && efterGorOm.namn === 'Kasern 3',
    'den återskapade byggnaden är aktiv och heter som förut');

  // ---- Byter planeraren byggnad mitt i ifyllningen lämnas formuläret ----
  // Formuläret hör till den byggnad hon höll på att skapa. Stod det kvar hade stegen under
  // det varit låsta för en byggnad som är färdig, och "Ny byggnad" legat kvar i listan.
  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('input[data-falt="namn"]').fill('Halvfärdig');
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-ny'), 'raden för den nya byggnaden');
  await bf.locator('.bf-byggnad[data-byggnad="garage"]').click();
  await vanta(page, () => DP.Plan.aktivId() === 'garage', 'byte till Garage');
  kontroll(await bf.locator('.bf-ny').count() === 0,
    'formuläret lämnas när planeraren byter byggnad mitt i ifyllningen');
  kontroll(await bf.locator('.steg-kort[data-bsteg="2"].last').count() === 0,
    'steg 2 är inte längre låst efter bytet – det gäller en byggnad som finns');
  await byggnadsval(page, ny.id);

  // ---- Övriga vyer tål den tomma byggnaden ----
  // Balansering listar alla byggnader och räknar bara på dem som är klara (beslut 39). Den
  // nya byggnaden saknar planering, så den ska stå med som inte klar och inte fälla något.
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'balansering', 'Balansering öppet');
  kontroll(await page.locator('.bal-byggnad[data-byggnad="' + ny.id + '"]').count() === 1,
    'den nya byggnaden står med i Balanseringens byggnadslista');
  kontroll(await page.evaluate(id => DP.Plan.klaraByggnader().indexOf(id) < 0, ny.id),
    'den nya byggnaden räknas inte med i balanseringen – den har ingen planering');
  // Och Planering: steglistan ska rita om sig för en byggnad utan installationer.
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppet');
  kontroll(await page.locator('#flode .steg-kort').count() === 6,
    'Planeringens sex steg ritas även för en byggnad utan installationer');

  // ---- Färgen är alltid en som ingen annan har, också när färglistan tagit slut ----
  // Listan rymmer tio färger. Skapas fler byggnader än så går koden över till att räkna fram
  // nyanser, och löftet gäller fortfarande: två byggnader får aldrig samma färg.
  const farger = await page.evaluate(() => {
    for (let i = 0; i < 14; i++) { DP.Plan.skapaByggnad({ namn: 'Provbyggnad ' + i, typ: 'garage', omrade: 'kasernomradet' }); }
    return DP.Plan.byggnadsordning.map(id => DP.Plan.byggnad(id).farg);
  });
  kontroll(new Set(farger).size === farger.length,
    'alla ' + farger.length + ' byggnader har var sin färg, också bortom färglistans tio');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Ny numrering: plan 01, rum 001, visat 01-001 (biljett #33, beslut 76). Rumsnumret löper per
// plan, så rum 001 finns på varje plan. Det som prövas är inte att siffrorna står rätt i
// datafilen – det är att **utpekandet** håller: två rum med samma nummer på olika plan måste
// gå att välja, gå in i och visa var för sig. Går något uppslag fortfarande på numret ensamt
// pekar det på det första rummet med det numret, och planeraren tittar tyst på fel rum.
async function testRumsnumrering(browser) {
  console.log('Ny numrering: plan 01, rum 001, visat 01-001 (beslut 76)');
  const page = await nySida(browser, URL_INDEX, 'kasern1');
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');

  // ---- Numreringen i datan ----
  const num = await page.evaluate(() => {
    const b = DP.Plan.byggnad();
    const nycklar = {}, dubbletter = [];
    b.rum.forEach(r => {
      const k = DP.rumBeteckning(r);
      if (nycklar[k]) { dubbletter.push(k); }
      nycklar[k] = r.namn;
    });
    return {
      plan: b.plan.map(p => p.id),
      // Rumsnumren är tresiffriga löpnummer, inte plansiffra + löpnummer
      allaTresiffriga: b.rum.every(r => /^\d{3}$/.test(r.nr)),
      // Rum 001 på varje plan: numret ensamt pekar inte ut ett rum
      ettor: b.rum.filter(r => r.nr === '001').map(r => DP.rumBeteckning(r)),
      dubbletter: dubbletter,
      // Installationerna pekar med rummets nyckel, och varje referens träffar ett rum
      hangande: b.installationer.filter(i => !nycklar[i.rum]).length,
      exempel: DP.rumBeteckning(b.rum.filter(r => r.plan === '01' && r.nr === '001')[0])
    };
  });
  kontroll(num.allaTresiffriga, 'alla rumsnummer är löpnummer per plan (001, 002 …)');
  kontroll(num.exempel === '01-001', 'rummet visas som plan + rumsnummer: ' + num.exempel);
  kontroll(num.ettor.length === num.plan.length,
    'rum 001 finns på varje plan, så numret ensamt pekar inte ut ett rum (' + num.ettor.join(', ') + ')');
  kontroll(num.dubbletter.length === 0,
    'plan + rumsnummer är ändå unikt i byggnaden (inga dubbletter bland ' + num.ettor.length + ' ettor)');
  kontroll(num.hangande === 0, 'varje installation pekar på ett rum som finns');

  // ---- Modellen: etiketterna säger 01-001 ----
  const etiketter = await page.evaluate(() => {
    const ut = [];
    Object.keys(DP.viewer.planGrupper).forEach(id => {
      DP.viewer.planGrupper[id].etiketter.children.forEach(s => ut.push(s.userData.rumNyckel));
    });
    return ut;
  });
  kontroll(etiketter.indexOf('00-001') >= 0 && etiketter.indexOf('01-001') >= 0,
    'modellens etiketter bär rummets nyckel, en per plan (' + etiketter.length + ' etiketter)');

  // ---- Trädet: två rum med samma nummer, var för sig ----
  const rader = await page.evaluate(() => [].map.call(
    document.querySelectorAll('#trad .rum'), rd => ({
      nyckel: rd.dataset.rum,
      nr: rd.querySelector('.rum-nr').textContent,
      namn: rd.querySelector('.rum-namn').textContent
    })));
  const ettorITradet = rader.filter(r => /-001$/.test(r.nyckel));
  kontroll(ettorITradet.length === num.plan.length,
    'byggnadsträdet har en egen rad per rum 001, en per plan (' + ettorITradet.length + ' rader)');
  kontroll(ettorITradet.every(r => r.nr === r.nyckel),
    'trädet visar plan + rumsnummer i rumsraden: ' + ettorITradet.map(r => r.nr).join(', '));
  kontroll(new Set(ettorITradet.map(r => r.nyckel)).size === ettorITradet.length,
    'raderna är åtskilda av sina nycklar, inte av sina nummer');

  // De två rummen heter olika saker, så det syns direkt om fel rum visas.
  const kallare = '00-001', entre = '01-001';
  const namn = await page.evaluate(arg => ({
    kallare: DP.viewer.rumIndex[arg.kallare].namn,
    entre: DP.viewer.rumIndex[arg.entre].namn
  }), { kallare, entre });
  kontroll(namn.kallare !== namn.entre,
    'de två rummen 001 har olika namn, så fel rum syns direkt (' + namn.kallare + ' / ' + namn.entre + ')');

  // ---- Informationskortet: var för sig ----
  await page.evaluate(nyckel => {
    const rd = document.querySelector('#trad .rum[data-rum="' + nyckel + '"]');
    rd.closest('details.plan').open = true;
    return 1;
  }, kallare);
  await page.locator('#trad .rum[data-rum="' + kallare + '"] summary').click();
  let kort = await page.locator('#infokort').innerText();
  kontroll(kort.includes(kallare) && kort.includes(namn.kallare),
    'informationskortet visar källarens 00-001 ' + namn.kallare);
  kontroll(!kort.includes(entre),
    'kortet visar inte entréplanets 01-001 samtidigt');

  await page.evaluate(nyckel => {
    const rd = document.querySelector('#trad .rum[data-rum="' + nyckel + '"]');
    rd.closest('details.plan').open = true;
    return 1;
  }, entre);
  await page.locator('#trad .rum[data-rum="' + entre + '"] summary').click();
  kort = await page.locator('#infokort').innerText();
  kontroll(kort.includes(entre) && kort.includes(namn.entre),
    'informationskortet visar entréplanets 01-001 ' + namn.entre);

  // ---- Gå in: de två rummen är skilda mål ----
  await page.evaluate(nyckel => { DP.viewer.gaIn(nyckel); return 1; }, kallare);
  await vanta(page, () => DP.viewer.lage === 'rum', 'inne i ett rum');
  let inne = await page.evaluate(() => ({
    nyckel: DP.rumBeteckning(DP.viewer.aktuelltRum),
    namn: DP.viewer.aktuelltRum.namn,
    text: document.querySelector('#rumlage-namn').textContent
  }));
  kontroll(inne.nyckel === kallare && inne.namn === namn.kallare,
    'Gå in i 00-001 ställer planeraren i källarens rum (' + inne.namn + ')');
  kontroll(inne.text.includes(kallare),
    'rumsläget säger vilket rum det är: ' + inne.text);

  await page.evaluate(nyckel => { DP.viewer.gaIn(nyckel); return 1; }, entre);
  await rorelsePaus(page);
  inne = await page.evaluate(() => ({
    nyckel: DP.rumBeteckning(DP.viewer.aktuelltRum),
    namn: DP.viewer.aktuelltRum.namn,
    text: document.querySelector('#rumlage-namn').textContent
  }));
  kontroll(inne.nyckel === entre && inne.namn === namn.entre,
    'Gå in i 01-001 byter rum trots samma nummer (' + inne.namn + ')');
  kontroll(inne.text.includes(entre), 'rumsläget följer med: ' + inne.text);
  await page.evaluate(() => { DP.viewer.lamnaRum(); return 1; });
  await rorelsePaus(page);

  // ---- Installationskortet: rätt rum av de likanumrerade ----
  // Brandlarmscentralen sitter i 01-001 Entré, brandposten i 00-001 Korridor. Går uppslaget
  // på numret ensamt skulle båda hamna i samma rum.
  const kort2 = await page.evaluate(() => {
    const b = DP.Plan.byggnad();
    const iEntre = b.installationer.filter(i => i.rum === '01-001' && i.signifikant)[0];
    const iKallare = b.installationer.filter(i => i.rum === '00-001' && i.signifikant)[0];
    DP.ui.visaInstKort(iEntre);
    const entre = document.querySelector('#infokort').innerText;
    DP.ui.visaInstKort(iKallare);
    return { entre: entre, kallare: document.querySelector('#infokort').innerText,
      betEntre: iEntre.beteckning, betKallare: iKallare.beteckning };
  });
  kontroll(kort2.entre.includes('01-001 – ' + namn.entre),
    'installationen i 01-001 (' + kort2.betEntre + ') får entréplanets rum på sitt kort');
  kontroll(kort2.kallare.includes('00-001 – ' + namn.kallare),
    'installationen i 00-001 (' + kort2.betKallare + ') får källarens rum på sitt kort');

  // ---- Telefonen: rumsraden i rutintillfället ----
  // Telefonvyn läser rummet ur sitt eget index. Planera och öppna ett rutintillfälle som
  // innehåller en åtgärd på en installation i ett av de likanumrerade rummen.
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppet');
  const f = page.locator('#flode');
  await f.locator('button', { hasText: 'Använd standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.state().kopplingar.length > 0, 'standardplaneringen gjord');
  const telefonRum = await page.evaluate(() => {
    const s = DP.Plan.state();
    // Åtgärden på brandlarmscentralen i 01-001 Entré
    const i = DP.Plan.signifikanta().filter(x => x.rum === '01-001')[0];
    const k = s.kopplingar.filter(x => x.inst === i.id)[0];
    const t = DP.Plan.rutintillfallen().filter(x => x.rond === k.rond)[0];
    DP.Telefon.oppna(t.nyckel);
    return { inst: i.beteckning, nyckel: t.nyckel };
  });
  await vanta(page, () => document.querySelectorAll('.telefon').length > 0, 'telefonvyn öppen');
  const tel = page.locator('.telefon').first();
  await tel.locator('.tf-rad', { hasText: telefonRum.inst }).first().click();
  const telText = await tel.innerText();
  kontroll(telText.includes('01-001 – ' + namn.entre),
    'telefonvyn visar plan + rumsnummer för installationen i 01-001 (' + telefonRum.inst + ')');

  await bild(page, 'rumsnumrering');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

async function testFristaendeFil(browser) {
  console.log('Etapp 5 – den fristående filen');
  // Filen byggs om först, så att testet prövar den kod som ligger i repot och inte en gammal
  // byggd fil. Samma skript som `npm run bygg`, anropat i samma process.
  require('child_process').execFileSync(process.execPath,
    [path.join(ROT, 'verktyg', 'bygg-enfil.js')], { stdio: 'pipe' });
  // En enda fil utan sidoladdningar: har byggskriptet lämnat kvar en referens hade webbläsaren
  // försökt hämta den från disk, och i en kopia på en annan dator inte hittat något.
  const kalla = fs.readFileSync(FIL_DIST, 'utf8');
  kontroll(!/<script src=|<link rel="stylesheet"/.test(kalla),
    'den fristående filen laddar inga sidofiler');

  // Användarens skärm, inte standardhöjden: den fristående filen är den enda vägen in när
  // jobbdatorn spärrar raw.githack.com, så det är där utrymmet ska mätas.
  const page = await nySida(browser, URL_DIST, null, 1200);

  // ---- Planering: standardplanering åt alla fyra, alltså steg 1–6 ifyllda ----
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await page.locator('#balansering button', { hasText: 'Standardplanering för alla' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa planering' }).click();
  await vanta(page, () => DP.Plan.klaraByggnader().length === 4, 'fyra klara byggnader');
  const klara = await page.evaluate(() => ({
    antal: DP.Plan.klaraByggnader().length,
    // Alla sex stegen, för varje byggnad: steg 5 är kopplingarna och steg 6 den planerade tiden.
    steg: DP.Plan.byggnadsordning.map(id => {
      const st = DP.Plan.stegStatus(DP.Plan.stateFor(id), id);
      return [1, 2, 3, 4, 5, 6].every(n => st[n] === true);
    }),
    // Tiden kommer ur tidsschablonen, som ligger i en egen datafil – att den räknat betyder att
    // data/tidsschablon.js kom med i inbäddningen.
    timmar: DP.Plan.tidTimmar('BI', DP.Plan.stateFor('kasern1'), 'kasern1')
  }));
  kontroll(klara.antal === 4 && klara.steg.every(Boolean),
    'alla fyra byggnaderna får alla sex stegen klara i den fristående filen');
  kontroll(klara.timmar > 0,
    'tidsschablonen räknar planerad tid i den fristående filen (' + klara.timmar + ' h)');

  // ---- Processlinjen: de tre huvudstegen går att gå mellan ----
  // Att läsa stegstatusen ur DP.Plan säger bara att *uträkningen* kom med. Processlinjen och
  // stegkorten ritas i vyer.js och flode.js, och en inbäddning som tappat någon av dem hade
  // gått tyst förbi en API-kontroll. Därför klickas stegen fram här.
  const pl = await page.evaluate(() => Array.from(document.querySelectorAll('.pl-steg'))
    .map(s => s.dataset.steg));
  kontroll(JSON.stringify(pl) === JSON.stringify(['byggnad', 'planering', 'balansering']),
    'processlinjen visar de tre huvudstegen i den fristående filen (' + pl.join(' → ') + ')');
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad' && !!document.querySelector('#trad'),
    'Byggnad öppet');
  kontroll(await page.locator('#hs-byggnad #trad').isVisible(),
    'huvudsteget Byggnad öppnas och visar byggnadsträdet');

  // ---- Steg 5 och 6 genom gränssnittet, i den byggnad som har flest ronder ----
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await byggnadsval(page, 'hangar');
  const steg5 = await oppnaSteg(page, 'Koppla åtgärder till installationerna');
  kontroll(steg5.includes('66 av 66'),
    'steg 5 ritas i den fristående filen och säger att hangarens 66 signifikanta '
    + 'installationer alla har en kopplad åtgärd');
  const steg6 = await oppnaSteg(page, 'Hur lång tid tar ronderna');
  kontroll(/6 av 6 ronder/.test(steg6) && /halvdag|heldag|kvartsdag|kort/.test(steg6),
    'steg 6 ritas med sina sex ronder och deras dagsdelar i den fristående filen');
  // Uträkningen i klartext är poängen med steg 6 (beslut 27): den ska stå under varje rond, så
  // att planeraren kan bedöma om förslaget är rimligt i stället för att bara godkänna det.
  kontroll(/installationer? och .* rum att gå igenom →|varv runt huset →/.test(steg6),
    'uträkningen står i klartext under ronderna i den fristående filen');
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'balansering', 'tillbaka i Balansering');

  // ---- Balanseringens tidsaxel: en rad per utförare, hela året ----
  await vanta(page, () => document.querySelectorAll('.bt-utforare').length === 4, 'tidsaxeln med fyra utförare');
  const axel = await page.evaluate(() => ({
    utforare: document.querySelectorAll('.bt-utforare').length,
    brickor: document.querySelectorAll('.bt-bricka').length,
    sistaVeckan: !!document.querySelector('.bt-cell[data-vecka="' + DP.Plan.ANTAL_VECKOR + '"]')
  }));
  kontroll(axel.utforare === 4 && axel.brickor > 0 && axel.sistaVeckan,
    'Balanseringens tidsaxel ritas med fyra utförare, brickor och hela året ('
    + axel.brickor + ' brickor)');

  // ---- De tre frågorna: bekräfta förvalen ----
  for (const n of [1, 2, 3]) {
    await oppnaFraga(page, n);
    const foreHist = await historiklangd(page);
    await page.locator('.bal-fraga[data-fraga="' + n + '"] button[data-godkann]').click();
    await stegKlart(page, foreHist, 'bekräftade fråga ' + n);
  }
  const svarade = await page.evaluate(() => DP.Plan.balanseringStatus());
  kontroll(svarade.omraden && svarade.kapacitet && svarade.veckorUtan,
    'alla tre frågorna går att besvara i den fristående filen');

  // ---- Balansera: ett steg i historiken, jämnare belastning, förklaring i klartext ----
  const foreBal = await page.evaluate(() => ({
    topp: DP.Balansering.belastning(DP.Plan.balanseringsUnderlag()).toppTimmar,
    pos: DP.Plan.historik().pos
  }));
  await page.locator('#balansera-knapp').click();
  await vanta(page, n => DP.Plan.historik().pos > n, 'balanseringssteget', foreBal.pos);
  await vanta(page, () => !!document.querySelector('.bal-frad'), 'förklaringen ritad');
  const efterBal = await page.evaluate(() => ({
    topp: DP.Balansering.belastning(DP.Plan.balanseringsUnderlag()).toppTimmar,
    pos: DP.Plan.historik().pos,
    klar: DP.Plan.balanseringStatus().klar,
    rader: document.querySelectorAll('.bal-frad:not(.niva3)').length
  }));
  kontroll(efterBal.pos === foreBal.pos + 1 && efterBal.klar === true,
    'Balansera blir ett steg i historiken och ger grön bock i den fristående filen');
  kontroll(efterBal.topp < foreBal.topp,
    'toppbelastningen sjunker (' + foreBal.topp + ' h → ' + efterBal.topp + ' h)');
  kontroll(efterBal.rader === 4,
    'förklaringen har en rad per byggnad (' + efterBal.rader + ' rader)');
  await rorelsePaus(page);
  await bild(page, 'etapp5-fristaende-balanserad');

  // ---- Flytt för hand: dra en bricka och svara på vilken nivå flytten gäller ----
  // En månadsrond som ligger minst två veckor in i året, så att målveckan finns både före och
  // efter och frågan får alla tre valen att räkna på.
  const bricka = await valjBricka(page, b => b.freq === 'manad' && b.ordinarie >= 3 && !b.provisorisk);
  kontroll(!!bricka, 'det finns en dragbar månadsbricka i den fristående filen');
  if (bricka) {
    const malVecka = bricka.vecka - 2;
    await dra(page, brickValjare(bricka), cellValjare(bricka, malVecka));
    await vanta(page, () => !!document.querySelector('.ff-val'), 'frågan om de tre nivåerna');
    const alternativ = await page.locator('.ff-val').count();
    kontroll(alternativ === 3,
      'dra och släpp ger frågan om de tre nivåerna i den fristående filen (' + alternativ + ' val)');
    const forePosFlytt = await historikpos(page);
    await page.locator('.ff-val[data-val="tillfalle"]').click();
    await page.locator('.dlg-knappar button', { hasText: 'Flytta' }).click();
    await stegKlartPos(page, forePosFlytt, 'provisorisk flytt för hand');
    const flyttat = await page.evaluate(arg => {
      const t = DP.Plan.rutintillfallen(DP.Plan.stateFor(arg.bid), arg.bid)
        .filter(x => x.rond === arg.rond && x.ordinarieVecka === arg.ordinarie)[0];
      return t && t.provisorisk && t.vecka === arg.mal;
    }, { bid: bricka.byggnad, rond: bricka.rond, ordinarie: bricka.ordinarie, mal: malVecka });
    kontroll(flyttat,
      'den provisoriska flytten landar i planeringen (v. ' + bricka.ordinarie + ' → v. ' + malVecka + ')');
  }

  // ---- Planeringen har ändrats sedan balanseringen ----
  // En ändrad frekvens är en förutsättning balanseringen räknade på, så beskedet ska komma.
  const forePosAndring = await historikpos(page);
  await page.evaluate(() => {
    DP.Plan.vaxlaByggnad('kasern1');
    DP.Plan.andra('Byggnad invändigt varje kvartal', st => {
      const r = st.ronder.filter(x => x.id === 'BI')[0];
      r.freq = { typ: 'kvartal', startManad: null };
      r.foljerBas = false;
    });
  });
  await stegKlartPos(page, forePosAndring, 'frekvensändringen');
  await page.locator('.pl-steg[data-steg="balansering"]').click();
  await vanta(page, () => DP.Plan.balanseringStatus().andrad, 'markeringen om ändrad planering');
  const andrad = await page.evaluate(() => ({
    andrad: DP.Plan.balanseringStatus().andrad,
    antal: DP.Plan.balanseringStatus().andringar.length,
    klar: DP.Plan.balanseringStatus().klar,
    ruta: !!document.querySelector('.bal-andrad')
  }));
  kontroll(andrad.andrad && andrad.antal > 0 && andrad.klar === false && andrad.ruta,
    'markeringen "planeringen har ändrats" visas och tar bort bocken i den fristående filen ('
    + andrad.antal + ' ändring(ar))');
  await bild(page, 'etapp5-fristaende-andrad');

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
    await testForskjutning(browser);
    await testProcesslinjen(browser);
    await testMediaspelaren(browser);
    await testBalanseringensTidsaxel(browser);
    await testBalansera(browser);
    await testVeckorUtanTillsyn(browser);
    await testFlyttForHand(browser);
    await testPlaneringAndratsEfterBalansering(browser);
    await testBalanseringRymsPaSkarmen(browser);
    await testByggnadenSomData(browser);
    await testRumsnumrering(browser);
    await testSkapaNyByggnad(browser);
    await testFristaendeFil(browser);
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
