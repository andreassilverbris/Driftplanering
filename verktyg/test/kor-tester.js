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

// ------------------------------------------------------------------
// Inläsningsfilen i testet: SheetJS körd i Node
// ------------------------------------------------------------------
// Filen som läses in ska vara en **riktig** .xlsx, skriven utanför appen – precis som den som
// kommer tillbaka ifylld från någon annan (berättelse 15 och 18). Skrev testet filen genom
// sidans eget XLSX hade läsningen prövats mot skrivningen och inte mot en fil i världen.
//
// `vendor/xlsx.mini.min.js` är skrivet för en webbläsare och exporterar till `window`, så det
// körs i en vm-kontext i stället för att krävas in. Det är samma fil sidan använder, så testet
// och appen kan aldrig glida ifrån varandra på vilken version som gäller.
const XLSX = (() => {
  const vm = require('vm');
  const ctx = vm.createContext({
    console, Buffer, Uint8Array, Uint16Array, Uint32Array, Int32Array, Float64Array,
    ArrayBuffer, DataView, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite,
    String, Number, Array, Object, RegExp, Error, TypeError, RangeError,
    encodeURIComponent, decodeURIComponent, TextDecoder, TextEncoder
  });
  vm.runInContext(fs.readFileSync(path.join(ROT, 'vendor', 'xlsx.mini.min.js'), 'utf8'), ctx);
  return ctx.XLSX;
})();

// Skriver ett ark till en .xlsx på disk. `ark` är { fliknamn: [[cell, …], …] }.
function skrivArk(filnamn, ark) {
  const bok = XLSX.utils.book_new();
  Object.keys(ark).forEach(namn => {
    XLSX.utils.book_append_sheet(bok, XLSX.utils.aoa_to_sheet(ark[namn]), namn);
  });
  const fil = path.join(UT, filnamn);
  fs.writeFileSync(fil, Buffer.from(XLSX.write(bok, { type: 'buffer', bookType: 'xlsx' })));
  return fil;
}

// Läser en .xlsx från disk till { fliknamn: [[cell, …], …] }, allt som text – samma form som
// `DP.Inlasningsfil.las` ger sidan.
function lasArkFil(fil) {
  const bok = XLSX.read(fs.readFileSync(fil), { type: 'buffer' });
  const ut = {};
  bok.SheetNames.forEach(namn => {
    ut[namn] = XLSX.utils.sheet_to_json(bok.Sheets[namn], { header: 1, raw: false, defval: '' });
  });
  return ut;
}

// Klickar *Ta ut inläsningsfil* och sparar den nedladdade filen. Nedladdningen är vägen filen
// tar i verkligheten, så testet tar den vägen också.
async function taUtFil(page, filnamn) {
  const nedladdning = page.waitForEvent('download');
  await page.locator('#byggnadsflode button', { hasText: 'Ta ut inläsningsfil' }).click();
  const d = await nedladdning;
  const fil = path.join(UT, filnamn);
  await d.saveAs(fil);
  return { fil, namn: d.suggestedFilename() };
}

// Väljer en fil i steg 2:s filväljare och väntar på att inläsningen blivit ett steg.
async function lasInFil(page, fil) {
  // Positionen och inte längden: en inläsning efter en ångran skriver över det som låg
  // framför, så listan kan bli lika lång medan positionen går fram.
  const fore = await historikpos(page);
  await page.locator('#byggnadsflode input[data-falt="filval"]').setInputFiles(fil);
  await stegKlartPos(page, fore, 'inläsningen av ' + path.basename(fil));
}

// Ett HTML5-drag genom musen, som planeraren gör det: ner på källan, två rörelser mot målet
// (webbläsaren startar draget på den första och skickar dragover på den andra) och väntan på
// att målet märkts. Musknappen lämnas **uppe** till den som anropar: den vill ofta läsa
// märket innan släppet.
async function draTillMal(page, kalla, mal, markt, beskrivning) {
  await mal.scrollIntoViewIfNeeded();
  await kalla.scrollIntoViewIfNeeded();
  const kb = await kalla.boundingBox(), mb = await mal.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  // Två rörelser: webbläsaren startar draget på den första och skickar dragover på den andra.
  // Målets **mitt** och inte dess kant: det öppna (förslag och oplacerat) ligger fast överst
  // (beslut 112) och kan täcka en kant som ligger precis under det.
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2 + 6, { steps: 6 });
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2, { steps: 6 });
  await vanta(page, markt, beskrivning);
}

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

// Planlösningen fristående: formen räknad ur plan, rum och byggnadstypens regel (biljett #35,
// beslut 84, 85 och 101). Modulen är utan DOM som `DP.Balansering`, så den prövas med en
// byggnad byggd direkt i testet – ingen inläsning, ingen vy, bara räknandet.
//
// Det som prövas är löftena: ett plan utan rum blir ett skal, planen staplas i rätt ordning
// med entréplanet på marken, och en handritad byggnad rörs inte (beslut 101). Går något av
// dem förlorat ritas modellen tyst fel, och planeraren tror att byggnaden ser ut så.
async function testPlanlosningen(browser) {
  console.log('Planlösningen: skalet, planens ordning och rummens placering (beslut 78, 84, 85, 99 och 101)');
  const page = await nySida(browser, URL_INDEX);

  // ---- Ordningen föreslås ur beteckning och benämning (beslut 84) ----
  const ordning = await page.evaluate(() => {
    const PL = DP.Planlosning;
    return {
      // Blandade skrivsätt: källaren känns igen på benämningen, vinden på sin, och siffrorna
      // ordnas stigande oavsett vilken ordning de kom i.
      blandat: PL.foreslagenOrdning([
        { id: '03', namn: 'Plan 3' }, { id: 'K', namn: 'Källare' },
        { id: '04', namn: 'Vindsplan' }, { id: '01', namn: 'Entréplan' }
      ]),
      // "P1", "1" och "Plan 1" är alla plan 1 (beslut 77)
      tal: ['P1', '1', 'Plan 1', '01'].map(x => PL.planTal(x)),
      kallare: [PL.planTal('K'), PL.planTal('K2'), PL.planTal('Källare')],
      // Benämningen väger tyngre än beteckningen: ett plan som heter Källarplan ligger under
      // 01 även när det är betecknat 00, och en vind överst även med låg beteckning.
      namnVager: PL.foreslagenOrdning([
        { id: '01', namn: 'Entréplan' }, { id: '00', namn: 'Källarplan' }, { id: '02', namn: 'Vindsplan' }
      ]),
      // Ett plan utan siffra har systemet inget att ordna på – det hamnar ovanför de
      // numrerade i stället för att gissa, och planeraren drar det på plats.
      utanSiffra: PL.foreslagenOrdning([
        { id: '01', namn: 'Entréplan' }, { id: 'SU', namn: 'Souterräng' }, { id: '02', namn: 'Plan 2' }
      ]),
      benamning: [PL.benamningsforslag('02'), PL.benamningsforslag('K')]
    };
  });
  kontroll(ordning.blandat.join(' ') === 'K 01 03 04',
    'ordningen föreslås nedifrån och upp: källare underst, vind överst (' + ordning.blandat.join(' ') + ')');
  kontroll(ordning.tal.every(t => t === 1),
    'P1, 1, Plan 1 och 01 tolkas alla som plan 1 (' + ordning.tal.join(', ') + ')');
  kontroll(ordning.kallare.join(',') === '-1,-2,-1',
    'källarplan blir negativa och hamnar under 01 (' + ordning.kallare.join(', ') + ')');
  kontroll(ordning.namnVager.join(' ') === '00 01 02',
    'benämningen avgör när beteckningen inte räcker (' + ordning.namnVager.join(' ') + ')');
  kontroll(ordning.utanSiffra.join(' ') === '01 02 SU',
    'ett plan utan siffra i beteckningen gissas inte in bland de numrerade (' + ordning.utanSiffra.join(' ') + ')');
  kontroll(ordning.benamning[0] === 'Plan 02' && ordning.benamning[1] === 'Källarplan',
    'ett plan utan benämning får ett förslag (' + ordning.benamning.join(', ') + ')');

  // ---- Skalet ritas när rummen saknas (beslut 85) ----
  const skal = await page.evaluate(() => {
    const f = DP.Planlosning.form({
      namn: 'Prov', typ: 'kasern', stil: { tak: 'sadel', sadel: { bas: 10.3, hojd: 3 } },
      konstanter: { FRIHOJD: 3.3, BJALKLAG: 0.2 },
      plan: [{ id: '00', namn: 'Källarplan' }, { id: '01', namn: 'Entréplan' }, { id: '02', namn: 'Plan 2' }],
      rum: [], installationer: []
    });
    return {
      plan: f.plan.map(p => ({ id: p.id, elev: p.elev })),
      rum: f.rum.map(r => ({ plan: r.plan, skal: r.skal, rect: r.rect, utanInst: r.utanInstallationer })),
      takbas: f.stil.sadel.bas
    };
  });
  kontroll(skal.rum.length === 3 && skal.rum.every(r => r.skal),
    'varje plan utan rum blir ett skal (' + skal.rum.length + ' skal)');
  kontroll(skal.rum.every(r => r.rect[2] > r.rect[0] && r.rect[3] > r.rect[1]),
    'skalet har byggnadstypens standardstorlek och inte noll yta');
  // Entréplanet på marken, källaren under och planen över uppåt (beslut 85)
  kontroll(skal.plan[1].elev === 0,
    'entréplanet 01 ligger på marken (elev ' + skal.plan[1].elev + ')');
  kontroll(skal.plan[0].elev < 0,
    'källarplanet 00 ligger under marken (elev ' + skal.plan[0].elev.toFixed(1) + ')');
  kontroll(skal.plan[2].elev > skal.plan[1].elev,
    'plan 2 ligger ovanför entréplanet (elev ' + skal.plan[2].elev.toFixed(1) + ')');
  // Taket följer byggnadens topp så länge den växer: byggnadstypens bas är måttsatt för en
  // färdig kasern med fem plan, och ett tak som svävade hade sett ut som ett fel.
  kontroll(skal.takbas > skal.plan[2].elev && skal.takbas < 10.3,
    'sadeltaket ligger på den växande byggnadens topp och inte på typens (' + skal.takbas.toFixed(1) + ')');

  // ---- En handritad byggnad rörs inte (beslut 101) ----
  const kasern = await page.evaluate(() => {
    const b = DP.Plan.byggnad('kasern1');
    const f = DP.Planlosning.form(b);
    return {
      elevLika: f.plan.every((p, i) => p.elev === b.plan[i].elev),
      rumAntal: [f.rum.length, b.rum.length],
      skal: f.rum.filter(r => r.skal).length,
      rektLika: f.rum.every((r, i) => r.rect.join() === b.rum[i].rect.join())
    };
  });
  kontroll(kasern.elevLika, 'en handritad byggnad behåller sina elevationer');
  kontroll(kasern.rumAntal[0] === kasern.rumAntal[1] && kasern.skal === 0,
    'en handritad byggnad behåller sina rum och får inga skal (' + kasern.rumAntal.join(' mot ') + ')');
  kontroll(kasern.rektLika, 'en handritad byggnads rum ligger kvar där de är ritade');

  // ---- Rumshöjden ur NTV ÷ NTA (beslut 79) ----
  const hojd = await page.evaluate(() => {
    const f = DP.Planlosning.form({
      namn: 'Prov', typ: 'hangar', stil: { tak: 'platt' },
      konstanter: { FRIHOJD: 3.3, BJALKLAG: 0.2 },
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: [
        { nr: '001', namn: 'Hall', plan: '01', typ: 'hangar', rect: [0, 0, 20, 20], nta: 400, ntv: 4000 },
        { nr: '002', namn: 'Kontor', plan: '01', typ: 'kontor', rect: [20, 0, 25, 10], nta: 50 }
      ], installationer: []
    });
    return f.rum.map(r => ({ nr: r.nr, hojd: r.hojd }));
  });
  kontroll(hojd[0].hojd === 10, 'rumshöjden räknas som NTV ÷ NTA (' + hojd[0].hojd + ' m)');
  kontroll(hojd[1].hojd === 3.3,
    'ett rum utan NTV får byggnadstypens standardhöjd (' + hojd[1].hojd + ' m)');

  // ---- Rummen läggs ut enligt byggnadstypens regel (beslut 78, biljett #37) ----
  // Ett inläst rum bär ingen rektangel: filen har NTA och ingenting om var rummet ligger.
  // Det som ska hålla är att rummen inte överlappar, ligger i nummerordning medurs runt
  // korridoren och får rätt bredd ur NTA. Går det fel ser modellen ut som en byggnad där
  // rummen står i varandra, och då är det inte uppenbart om felet är geometrins eller vyns.
  const utlagt = await page.evaluate(() => {
    // En kasern: korridor plus sex rum på båda sidor, alla med NTA men utan rect.
    const rum = [
      { nr: '001', namn: 'Korridor', plan: '01', rumstyp: 'korridor', nta: 96 },
      { nr: '002', namn: 'Logement 1', plan: '01', rumstyp: 'logement', nta: 36 },
      { nr: '003', namn: 'Logement 2', plan: '01', rumstyp: 'logement', nta: 36 },
      { nr: '004', namn: 'WC/Dusch', plan: '01', rumstyp: 'wcdusch', nta: 36 },
      { nr: '005', namn: 'Logement 3', plan: '01', rumstyp: 'logement', nta: 36 },
      { nr: '006', namn: 'Logement 4', plan: '01', rumstyp: 'logement', nta: 36 },
      { nr: '007', namn: 'Förråd', plan: '01', rumstyp: 'forrad', nta: 36 }
    ];
    const svar = DP.Planlosning.laggUtRum({ typ: 'kasern' }, rum);
    // Formen genom hela vägen: rummen utan rect får en räknad, och höjden ur NTV.
    const f = DP.Planlosning.form({
      namn: 'Prov', typ: 'kasern', stil: { tak: 'platt' },
      konstanter: { FRIHOJD: 3.3, BJALKLAG: 0.2 },
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: rum.concat([{ nr: '008', namn: 'Fläktrum', plan: '01', rumstyp: 'teknik', nta: 40, ntv: 400 }]),
      installationer: []
    });
    function overlappar(a, b) {
      return a[0] < b[2] - 0.001 && b[0] < a[2] - 0.001
        && a[1] < b[3] - 0.001 && b[1] < a[3] - 0.001;
    }
    const krockar = [];
    f.rum.forEach((a, i) => f.rum.slice(i + 1).forEach(b => {
      if (overlappar(a.rect, b.rect)) { krockar.push(a.nr + '/' + b.nr); }
    }));
    const vid = nr => svar.rum.filter(o => o.r.nr === nr)[0].rect;
    return {
      krockar,
      // Korridoren löper genom hela planet, mellan de två rumsraderna
      korridor: vid('001'),
      langd: Math.round(svar.langd * 10) / 10,
      djup: svar.djup,
      // Rummen på de två sidorna: z skiljer dem åt
      sidor: ['002', '003', '004', '005', '006', '007'].map(nr => {
        const r = vid(nr);
        return { nr, syd: r[1] < svar.djup / 2 - 0.1, x0: Math.round(r[0] * 10) / 10 };
      }),
      // Bredden ur NTA: ett logement på 36 m² i ett 6 m djupt led är 6 m brett
      bredd002: Math.round((vid('002')[2] - vid('002')[0]) * 10) / 10,
      // Skalet är borta när planet har rum
      skal: f.rum.filter(r => r.skal).length,
      // Höjden ur NTV ÷ NTA också för ett rum regeln lade ut
      flakthojd: (f.rum.filter(r => r.nr === '008')[0] || {}).hojd,
      // Rumstypen blir den sort viewern färgar golvet efter
      wcTyp: (f.rum.filter(r => r.nr === '004')[0] || {}).typ
    };
  });
  kontroll(utlagt.krockar.length === 0,
    'rummen regeln lade ut överlappar inte varandra (' + (utlagt.krockar.join(', ') || 'inga krockar') + ')');
  kontroll(utlagt.korridor[0] === 0 && Math.abs(utlagt.korridor[2] - utlagt.langd) < 0.01,
    'korridoren löper genom hela planet (x ' + utlagt.korridor[0] + '–'
    + Math.round(utlagt.korridor[2] * 10) / 10 + ' av ' + utlagt.langd + ')');
  kontroll(utlagt.korridor[1] > 0 && utlagt.korridor[3] < utlagt.djup,
    'korridoren ligger mellan de två rumsraderna (z ' + utlagt.korridor[1] + '–'
    + utlagt.korridor[3] + ' av ' + utlagt.djup + ')');
  kontroll(utlagt.bredd002 === 6,
    'rummets bredd kommer ur NTA: 36 m² i ett 6 m djupt led är 6 m brett (' + utlagt.bredd002 + ' m)');
  // Medurs i nummerordning: de första rummen på ena sidan med växande x, de sista på den
  // andra med **avtagande** x – rundan går runt korridoren och inte fram och tillbaka.
  const syd = utlagt.sidor.filter(s => s.syd), norr = utlagt.sidor.filter(s => !s.syd);
  kontroll(syd.length > 0 && norr.length > 0,
    'rummen delas mellan korridorens två sidor (' + syd.length + ' mot ' + norr.length + ')');
  kontroll(syd.every((s, i) => i === 0 || s.x0 > syd[i - 1].x0),
    'rummen på första sidan ligger i nummerordning längs byggnaden ('
    + syd.map(s => s.nr + '@' + s.x0).join(' ') + ')');
  kontroll(norr.every((s, i) => i === 0 || s.x0 < norr[i - 1].x0),
    'rummen på andra sidan ligger i nummerordning tillbaka – rundan går medurs ('
    + norr.map(s => s.nr + '@' + s.x0).join(' ') + ')');
  kontroll(utlagt.skal === 0,
    'ett plan som fått rum är inget skal längre (' + utlagt.skal + ' skal)');
  kontroll(utlagt.flakthojd === 10,
    'ett rum regeln lade ut får också sin höjd ur NTV ÷ NTA (' + utlagt.flakthojd + ' m)');
  kontroll(utlagt.wcTyp === 'personal',
    'rumstypen blir den sort modellen färgar golvet efter (' + utlagt.wcTyp + ')');

  // Hallregeln: ett garage är ett stort utrymme med några rum längs ena sidan.
  const hall = await page.evaluate(() => {
    const svar = DP.Planlosning.laggUtRum({ typ: 'garage' }, [
      { nr: '001', namn: 'Vagnhall', plan: '01', rumstyp: 'ovrigt', nta: 240 },
      { nr: '002', namn: 'Förråd', plan: '01', rumstyp: 'forrad', nta: 24 },
      { nr: '003', namn: 'WC', plan: '01', rumstyp: 'wcdusch', nta: 12 }
    ]);
    const vid = nr => svar.rum.filter(o => o.r.nr === nr)[0].rect;
    function overlappar(a, b) {
      return a[0] < b[2] - 0.001 && b[0] < a[2] - 0.001
        && a[1] < b[3] - 0.001 && b[1] < a[3] - 0.001;
    }
    return {
      hallYta: Math.round((vid('001')[2] - vid('001')[0]) * (vid('001')[3] - vid('001')[1])),
      smaYta: Math.round((vid('002')[2] - vid('002')[0]) * (vid('002')[3] - vid('002')[1])),
      krock: overlappar(vid('001'), vid('002')) || overlappar(vid('002'), vid('003'))
    };
  });
  kontroll(!hall.krock, 'hallregelns rum överlappar inte heller');
  kontroll(hall.hallYta > hall.smaYta * 3,
    'det stora utrymmet blir hallen och rummen en rad längs sidan ('
    + hall.hallYta + ' m² mot ' + hall.smaYta + ' m²)');
  // Hallens rektangel ska spegla dess NTA. Sträcktes den över hela planet hade planeraren
  // jämfört NTA-summan i steget mot en modell där hallen är för stor.
  kontroll(hall.hallYta === 240 && hall.smaYta === 24,
    'rummens yta i modellen är deras NTA, också hallens (' + hall.hallYta + ' och '
    + hall.smaYta + ' m²)');

  // ---- Rundan håller också när ett rum dominerar NTA:n ----
  // Delades sidorna på halva NTA:n i stället för mitt i nummerordningen hade ett rum på
  // 500 m² legat ensamt på sin sida, och nästa rum i ordningen hamnat längst bort på den
  // andra – rundan hade blivit ett hopp i stället för en runda.
  const dominerar = await page.evaluate(() => {
    const svar = DP.Planlosning.laggUtRum({ typ: 'kasern' }, [
      { nr: '001', namn: 'Lektionssal', plan: '01', rumstyp: 'kontor', nta: 500 },
      { nr: '002', namn: 'Kontor', plan: '01', rumstyp: 'kontor', nta: 24 },
      { nr: '003', namn: 'Kontor', plan: '01', rumstyp: 'kontor', nta: 24 },
      { nr: '004', namn: 'Städ', plan: '01', rumstyp: 'stad', nta: 18 }
    ]);
    return svar.rum.map(o => ({ nr: o.r.nr, syd: o.rect[1] < svar.djup / 2 - 0.1 }))
      .sort((a, b) => a.nr < b.nr ? -1 : 1);
  });
  kontroll(dominerar[0].syd && dominerar[1].syd && !dominerar[2].syd && !dominerar[3].syd,
    'sidorna delas mitt i nummerordningen, så rundan håller när ett rum dominerar ('
    + dominerar.map(d => d.nr + (d.syd ? ':syd' : ':norr')).join(' ') + ')');

  // ---- BRA och BTA räknade ur modellen och märkta *beräknad* (beslut 79, berättelse 43) ----
  // Fristående prov på uträkningen: en kasern med tre lika rum på ett plan, utan BRA och BTA
  // i rummen. Då är det modellen som svarar, och svaret ska gå att härleda för hand – annars
  // kan planeraren inte lita på det tal hon jämför mot fastighetssystemets.
  const areor = await page.evaluate(() => {
    const PL = DP.Planlosning;
    // Samma byggnad två gånger: en gång utan rummens egna BRA och BTA, en gång med.
    function bygg(extra) {
      return {
        namn: 'Areaprov', typ: 'kasern', stil: { tak: 'platt' },
        konstanter: { FRIHOJD: 3.1, BJALKLAG: 0.2 },
        plan: [{ id: '01', namn: 'Entréplan' }, { id: '02', namn: 'Plan 2' }],
        rum: [
          Object.assign({ nr: '001', namn: 'Logement', plan: '01', rumstyp: 'logement', nta: 36 }, extra(1)),
          Object.assign({ nr: '002', namn: 'Logement', plan: '01', rumstyp: 'logement', nta: 36 }, extra(2)),
          Object.assign({ nr: '001', namn: 'Kontor', plan: '02', rumstyp: 'kontor', nta: 24 }, extra(3))
        ],
        installationer: []
      };
    }
    const utan = PL.areor(bygg(() => ({})));
    const med = PL.areor(bygg(() => ({ bra: 40, bta: 44 })));
    // Ett plan har rummens tal, det andra inte: märkningen ska vara per plan, och byggnadens
    // summa beräknad så fort något plan räknades ur modellen.
    const halvt = PL.areor(bygg(n => n === 3 ? { bra: 26, bta: 29 } : {}));
    // Ett plan utan rum är ett skal, och skalet är typens standardstorlek och inte en
    // uppgift om byggnaden: då finns ingen area att räkna.
    const skal = PL.areor({
      namn: 'Tom', typ: 'kasern', plan: [{ id: '01', namn: 'Entréplan' }], rum: [], installationer: []
    });
    // Planets omslutande rektangel, så att talen går att räkna efter för hand.
    const form = PL.form(bygg(() => ({})));
    const p1 = form.rum.filter(r => r.plan === '01');
    const ram = {
      x: Math.max(...p1.map(r => r.rect[2])) - Math.min(...p1.map(r => r.rect[0])),
      z: Math.max(...p1.map(r => r.rect[3])) - Math.min(...p1.map(r => r.rect[1]))
    };
    return { utan, med, halvt, skal, ram, tj: PL.VAGG_TJ };
  });
  const p01 = areor.utan.plan.filter(p => p.id === '01')[0];
  // BRA är planets omslutande rektangel: rummens rektanglar har NTA som yta och ligger kant
  // i kant, så rektangeln är nettoytan plus innerväggarna och det regeln lämnat mellan dem.
  // BTA är samma rektangel utökad en halv väggtjocklek runt om – viewern ritar ytterväggen
  // centrerad på rummets kant, så halva väggen ligger innanför BRA och halva utanför.
  const vantadBra = Math.round(areor.ram.x * areor.ram.z * 10) / 10;
  const vantadBta = Math.round((areor.ram.x + areor.tj) * (areor.ram.z + areor.tj) * 10) / 10;
  kontroll(p01.bra === vantadBra && p01.bta === vantadBta,
    'BRA och BTA räknas ur planets rektangel – innanför och utanför ytterväggarna (BRA '
    + p01.bra + ' mot ' + vantadBra + ', BTA ' + p01.bta + ' mot ' + vantadBta + ')');
  // BRA rymmer alltid nettoarean: ett BRA under NTA är geometriskt omöjligt.
  kontroll(areor.utan.plan.every(p => p.bra == null || p.nta == null || p.bra >= p.nta),
    'BRA är aldrig mindre än NTA – den rymmer nettoarean och innerväggarna ('
    + areor.utan.plan.map(p => p.id + ': ' + p.bra + '/' + p.nta).join(' ') + ')');
  kontroll(p01.braBeraknad && p01.btaBeraknad && areor.utan.braBeraknad && areor.utan.btaBeraknad,
    'arean märks beräknad när rummen saknar BRA och BTA');
  kontroll(p01.bta > p01.bra,
    'BTA är större än BRA: den mäts utanför ytterväggarna (' + p01.bta + ' > ' + p01.bra + ')');
  kontroll(areor.utan.nta === 96 && p01.nta === 72,
    'NTA är rummens summa per plan och byggnad och räknas aldrig ur modellen ('
    + p01.nta + ' / ' + areor.utan.nta + ')');

  // Har alla rum BRA och BTA är talet deras, utan märkning: det kom ur fastighetssystemet.
  kontroll(areor.med.bra === 120 && areor.med.bta === 132,
    'BRA och BTA summeras ur rummen när alla rum har dem (' + areor.med.bra + ' / ' + areor.med.bta + ')');
  kontroll(!areor.med.braBeraknad && !areor.med.btaBeraknad,
    'rummens egna tal märks inte beräknad');

  // Ett plan med rummens tal och ett utan: märkningen följer planet, och byggnadens summa
  // är beräknad eftersom ett av planen räknades ur modellen.
  const h01 = areor.halvt.plan.filter(p => p.id === '01')[0];
  const h02 = areor.halvt.plan.filter(p => p.id === '02')[0];
  kontroll(h01.braBeraknad && !h02.braBeraknad && h02.bra === 26,
    'märkningen är per plan: det plan vars rum har BRA behåller sitt tal ('
    + h01.bra + ' beräknad, ' + h02.bra + ' ur rummen)');
  kontroll(areor.halvt.braBeraknad && areor.halvt.bra === Math.round((h01.bra + h02.bra) * 10) / 10,
    'byggnadens summa är planens, och beräknad så fort något plan räknades ur modellen ('
    + areor.halvt.bra + ')');

  // Ett plan som bara är skal har ingen area: skalet är typens standardstorlek, inte ett mått.
  kontroll(areor.skal.plan[0].bra === null && areor.skal.plan[0].bta === null
    && areor.skal.bra === null && areor.skal.bta === null,
    'ett plan som bara är skal får ingen beräknad area – skalet är ingen uppgift om byggnaden');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Steget Plan för hand: planen läggs till, får ordning och benämning föreslagna, syns som
// skal i modellen och går att dra om (biljett #35, beslut 84, 85, 105, 106 och 111).
//
// Det som prövas är planerarens väg: hon ser byggnaden växa, ser källaren hamna fel när
// beteckningen inte räcker, drar den på plats och ser linjen innan hon släpper. Går något av
// det förlorat märks det först när någon försöker lägga in en riktig byggnad.
async function testStegPlan(browser) {
  console.log('Steget Plan för hand och skalet i modellen (beslut 84, 85, 106 och 111)');
  const page = await nySida(browser, URL_INDEX);
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const bf = page.locator('#byggnadsflode');

  // ---- Verktygsfältets knappar är utgråade så länge det inte finns något (beslut 111) ----
  // Prövas på en byggnad som *är* tom, innan något lagts till: en knapp som försvinner och
  // kommer tillbaka flyttar de andra, och då måste planeraren leta varje gång.
  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('.val[data-typ="kasern"]').click();
  await bf.locator('input[data-falt="namn"]').fill('Kasern 3');
  await bf.locator('button', { hasText: 'Skapa byggnad' }).click();
  await vanta(page, () => DP.Plan.byggnad().namn === 'Kasern 3', 'byggnaden skapad');

  const tomt = await page.evaluate(() => ({
    utgraade: [...document.querySelectorAll('.verktyg .chip.utgraad')].map(k => k.textContent),
    borta: document.querySelectorAll('.verktyg .chip').length,
    rum: document.querySelector('#t-etikett').disabled,
    rontgen: document.querySelector('#t-rontgen').disabled,
    varfor: document.querySelector('#t-rontgen').title
  }));
  kontroll(tomt.utgraade.indexOf('Rumsnamn') >= 0 && tomt.utgraade.indexOf('Röntgen') >= 0,
    'knapparna för rum och installationer är utgråade när det inte finns några (' + tomt.utgraade.join(', ') + ')');
  kontroll(tomt.borta >= 7, 'knapparna är utgråade och inte borttagna – fältet ser likadant ut (' + tomt.borta + ' kvar)');
  kontroll(/installationer/i.test(tomt.varfor),
    'en utgråad knapp säger varför den är utgråad ("' + tomt.varfor + '")');

  // Steg 2 öppnas av sig självt när byggnaden skapats: det är nästa sak som ska fyllas i.
  kontroll(await bf.locator('.steg-kort[data-bsteg="2"].oppen').count() === 1,
    'steg 2 Plan är öppet när byggnaden just skapats');

  // ---- Planen läggs till för hand ----
  // Beteckningarna läggs i fel ordning med flit, och "SU" är en beteckning systemet inte kan
  // ordna in: den hamnar överst, vilket är poängen med att man ser skalet (beslut 111).
  let n = 0;
  for (const [id, namn] of [['01', 'Entréplan'], ['02', ''], ['SU', 'Souterräng']]) {
    await bf.locator('input[data-falt="plan-id"]').fill(id);
    await bf.locator('input[data-falt="plan-namn"]').fill(namn);
    await bf.locator('button', { hasText: 'Lägg till plan' }).click();
    n++;
    await vanta(page, k => DP.Plan.byggnad().plan.length === k, 'plan ' + id + ' tillagt', n);
  }

  const efter = await page.evaluate(() => ({
    plan: DP.Plan.byggnad().plan.map(p => p.id + ':' + p.namn),
    historik: DP.Plan.historik().lista.slice(-3),
    steg: DP.Plan.byggnadsSteg(),
    status: DP.Plan.byggnadStatus(),
    // Modellen: ett skal per plan, och ingen av dem i rumsindexet – ett skal är inget rum
    skal: DP.viewer.b.rum.filter(r => r.skal).length,
    rumIndex: Object.keys(DP.viewer.rumIndex).length,
    modellPlan: DP.viewer.b.plan.map(p => p.id),
    planKnappar: [...document.querySelectorAll('#planknappar .chip')].map(k => k.textContent),
    tomBesked: !document.getElementById('tom-byggnad').hidden
  }));
  kontroll(efter.plan.join(' ') === '01:Entréplan 02:Plan 02 SU:Souterräng',
    'planen ligger i föreslagen ordning nedifrån och upp (' + efter.plan.join(' | ') + ')');
  kontroll(efter.plan[1] === '02:Plan 02',
    'ett plan utan benämning fick ett förslag (' + efter.plan[1] + ')');
  kontroll(efter.historik[0] === 'Kasern 3: lägg till plan 01 Entréplan',
    'varje tillägg är ett steg i historiken med text i klartext ("' + efter.historik[0] + '")');
  kontroll(efter.steg[2] === true, 'steg 2 Plan får grön bock när det finns plan');
  kontroll(efter.status === 'Inläsning pågår',
    'byggnaden har gått från "Väntar på inläsningsfil" till "Inläsning pågår" (' + efter.status + ')');
  kontroll(efter.skal === 3 && efter.rumIndex === 0,
    'varje plan syns som ett skal i modellen, och inget av dem är ett rum (' + efter.skal + ' skal, ' + efter.rumIndex + ' rum)');
  kontroll(efter.planKnappar.join(' ') === 'SU 02 01',
    'plan-knapparna visar planen med det översta först (' + efter.planKnappar.join(' ') + ')');
  kontroll(!efter.tomBesked, 'beskedet om att byggnaden saknar plan är borta när planen finns');
  // Beslut 111 och berättelse 53: med fel ordning ligger källarplanet överst i skalet, och
  // det är just det som gör förslaget om ordningen självklart.
  const fore = await page.evaluate(() => {
    const p = DP.viewer.b.plan;
    return { oversta: p[p.length - 1].id, elev: p.map(x => x.id + '@' + x.elev.toFixed(1)) };
  });
  kontroll(fore.oversta === 'SU',
    'souterrängplanet ligger överst i skalet innan ordningen rättats (' + fore.elev.join(' ') + ')');
  await bild(page, 'byggnad-steg2-skal');

  // ---- Döp om ett plan på dess egen rad ----
  // Benämningen ändras i listan och inte i en ruta ovanpå sidan: resten av flödet frågar i
  // panelen, och planeraren ska se namnet byta plats där det står.
  await bf.locator('.bf-planrad[data-plan="02"]').locator('button', { hasText: 'Döp om' }).click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode [data-falt="plannamn-02"]'),
    'fältet för benämningen');
  kontroll(await page.evaluate(() => document.activeElement.dataset.falt === 'plannamn-02'),
    'markören står i fältet så fort raden öppnats för omdöpning');
  const foreNamn = await historiklangd(page);
  await bf.locator('[data-falt="plannamn-02"]').fill('Plan två');
  await bf.locator('.bf-planrad[data-plan="02"]').locator('button', { hasText: 'Klar' }).click();
  await stegKlart(page, foreNamn, 'döp om plan');
  kontroll(await page.evaluate(() => DP.Plan.byggnad().plan.filter(p => p.id === '02')[0].namn) === 'Plan två',
    'planet fick sin nya benämning, som ett steg i historiken');
  kontroll(await page.evaluate(() => DP.Plan.byggnad().plan.filter(p => p.id === '02')[0].id) === '02',
    'beteckningen står kvar när benämningen byts – rummen pekar på den (beslut 77)');

  // ---- Rullningen står kvar vid varje omritning (beslut 105) ----
  const skroll = await page.evaluate(() => {
    const panel = document.querySelector('.sidopanel');
    panel.scrollTop = 120;
    const fore = panel.scrollTop;
    // Samma väg som en knapp: ett steg i historiken som ritar om flödet.
    DP.Plan.sattPlanNamn('02', 'Plan 2');
    return { fore, efter: panel.scrollTop };
  });
  kontroll(skroll.efter === skroll.fore,
    'listan hoppar inte när något ändras – rullningen står kvar (' + skroll.fore + ' → ' + skroll.efter + ')');

  // ---- Dra om ordningen, med en linje som visar var planet hamnar (beslut 106) ----
  // Draget går genom musen och inte genom koden: det är linjen och släppet planeraren
  // använder, och ett test som anropade flyttaPlan() direkt hade inte prövat någon av dem.
  const kalla = bf.locator('.bf-planrad[data-plan="SU"]');
  const mal = bf.locator('.bf-planrad[data-plan="01"]');
  const kb = await kalla.boundingBox(), mb = await mal.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  // Två rörelser: webbläsaren skickar dragover under vägen, och linjen ska följa med dit
  // pekaren är – inte fastna där den först hamnade.
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2, { steps: 6 });
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height - 4, { steps: 6 });
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-planrad[data-plan="01"].linje-under'),
    'linjen under Entréplan');
  const under = await page.evaluate(() => ({
    linje: [...document.querySelectorAll('#byggnadsflode .bf-planrad')]
      .filter(r => /linje-(over|under)/.test(r.className)).map(r => r.dataset.plan + ':' + (/linje-under/.test(r.className) ? 'under' : 'över')),
    dras: [...document.querySelectorAll('#byggnadsflode .bf-planrad.dras')].map(r => r.dataset.plan)
  }));
  kontroll(under.linje.join(' ') === '01:under',
    'linjen visar att planet hamnar under Entréplan innan det släpps (' + under.linje.join(' ') + ')');
  kontroll(under.dras.join(' ') === 'SU', 'den dragna raden syns vara i rörelse');
  await bild(page, 'byggnad-steg2-drag');

  // Linjen ska följa pekaren: flyttas den till övre halvan byter linjen sida.
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 4, { steps: 6 });
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-planrad[data-plan="01"].linje-over'),
    'linjen ovanför Entréplan');
  kontroll(await bf.locator('.bf-planrad[data-plan="01"].linje-over').count() === 1,
    'linjen följer pekaren och byter sida i stället för att fastna');

  // Släpp under Entréplan: souterrängplanet ska hamna underst
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height - 4, { steps: 6 });
  const hist = await historiklangd(page);
  await page.mouse.up();
  await stegKlart(page, hist, 'flytta plan');

  const draget = await page.evaluate(() => ({
    plan: DP.Plan.byggnad().plan.map(p => p.id),
    text: DP.Plan.historik().lista.slice(-1)[0],
    nederst: DP.viewer.b.plan[0].id,
    elev: DP.viewer.b.plan.map(p => p.id + '@' + p.elev.toFixed(1)),
    linjer: document.querySelectorAll('#byggnadsflode .linje-over, #byggnadsflode .linje-under').length
  }));
  kontroll(draget.plan.join(' ') === 'SU 01 02',
    'efter dragningen ligger souterrängplanet underst (' + draget.plan.join(' ') + ')');
  kontroll(draget.nederst === 'SU' && parseFloat(draget.elev[0].split('@')[1]) < 0,
    'modellen ritas om med souterrängplanet under marken (' + draget.elev.join(' ') + ')');
  kontroll(draget.text === 'Kasern 3: flytta Souterräng under Entréplan',
    'draget är ett steg i historiken med text i klartext ("' + draget.text + '")');
  kontroll(draget.linjer === 0, 'linjen är borta när planet släppts');

  // ---- Kameran står kvar när modellen ritas om (beslut 85) ----
  // Löftet gäller planerarens vy: hon ska inte kastas tillbaka till översikten varje gång
  // byggnaden ändras. Kameran får följa med när byggnaden byter storlek, men riktningen –
  // varifrån hon tittar – ska vara densamma.
  const kamera = await page.evaluate(() => {
    const c = DP.viewer.camera.position, m = DP.viewer.controls.target;
    const fore = { x: c.x, y: c.y, z: c.z, mx: m.x, my: m.y, mz: m.z };
    DP.Plan.sattPlanNamn('01', 'Bottenplan');
    const e = DP.viewer.camera.position, m2 = DP.viewer.controls.target;
    return { fore, efter: { x: e.x, y: e.y, z: e.z, mx: m2.x, my: m2.y, mz: m2.z } };
  });
  const lika = ['x', 'y', 'z', 'mx', 'my', 'mz'].every(k => Math.abs(kamera.fore[k] - kamera.efter[k]) < 0.001);
  kontroll(lika, 'kameran står kvar när modellen ritas om utan att byggnaden byter storlek');

  // Och när byggnaden *byter* storlek: riktningen är hennes vy och ska vara densamma, men
  // avståndet skalas om med huset. Ett oförändrat avstånd hade satt henne inuti en vägg som
  // växte förbi henne, och det är precis vad som händer när ett plan läggs till.
  const vaxer = await page.evaluate(() => {
    const riktning = () => {
      const c = DP.viewer.camera.position, m = DP.viewer.controls.target;
      const v = { x: c.x - m.x, y: c.y - m.y, z: c.z - m.z };
      const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      return { x: v.x / l, y: v.y / l, z: v.z / l, langd: l };
    };
    const fore = riktning();
    // Ett rum gör byggnaden mycket större än skalet: 60 m lång mot skalets 36.
    DP.Plan.andraByggnad('prov', '', d => {
      d.rum.push({ nr: '001', namn: 'Hall', plan: '01', typ: 'hangar', rect: [0, 0, 60, 30], nta: 1800 });
    });
    return { fore, efter: riktning() };
  });
  const sammaRiktning = ['x', 'y', 'z'].every(k => Math.abs(vaxer.fore[k] - vaxer.efter[k]) < 0.01);
  kontroll(sammaRiktning,
    'kameran tittar från samma håll när byggnaden byter storlek');
  kontroll(vaxer.efter.langd > vaxer.fore.langd * 1.2,
    'avståndet skalas om med byggnaden i stället för att lämna planeraren inuti en vägg (' +
    vaxer.fore.langd.toFixed(1) + ' → ' + vaxer.efter.langd.toFixed(1) + ' m)');
  await angra(page);

  // ---- Ångra och gör om går samma väg (beslut 73) ----
  await angra(page);
  await angra(page);
  const angrat = await page.evaluate(() => ({
    plan: DP.Plan.byggnad().plan.map(p => p.id),
    namn: DP.Plan.byggnad().plan.filter(p => p.id === '02')[0].namn,
    lista: [...document.querySelectorAll('#byggnadsflode .bf-planrad')].map(r => r.dataset.plan)
  }));
  kontroll(angrat.plan.join(' ') === '01 02 SU',
    'ångra tar tillbaka ordningen före draget (' + angrat.plan.join(' ') + ')');
  kontroll(angrat.lista.join(' ') === 'SU 02 01',
    'planlistan ritas om av sig själv vid ångra (' + angrat.lista.join(' ') + ')');
  await gorOm(page);
  await gorOm(page);
  kontroll(await page.evaluate(() => DP.Plan.byggnad().plan.map(p => p.id).join(' ')) === 'SU 01 02',
    'gör om lägger tillbaka planet där det drogs');

  // ---- Beteckningen är unik, och behålls precis som den skrivs (beslut 77) ----
  await bf.locator('input[data-falt="plan-id"]').fill('01');
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-fel'), 'beskedet om beteckningen');
  kontroll((await bf.locator('.bf-fel').innerText()).includes('redan ett plan som heter 01'),
    'en beteckning som redan finns stoppas med ett besked medan planeraren skriver');
  kontroll(await bf.locator('button', { hasText: 'Lägg till plan' }).isDisabled(),
    'knappen är avstängd så länge beteckningen är upptagen');
  // Regeln bor i planeringen och går att läsa utan DOM (beslut 61)
  kontroll(await page.evaluate(() => !!DP.Plan.planHinder('01') && !DP.Plan.planHinder('03')),
    'hindret svarar ur planeringen och inte ur vyn');
  await bf.locator('input[data-falt="plan-id"]').fill('P3');
  await bf.locator('input[data-falt="plan-namn"]').fill('');
  const forePa = await historiklangd(page);
  await bf.locator('button', { hasText: 'Lägg till plan' }).click();
  await stegKlart(page, forePa, 'plan P3');
  kontroll(await page.evaluate(() => DP.Plan.byggnad().plan.some(p => p.id === 'P3')),
    'beteckningen behålls precis som den skrivs – P3 blir inte 03 (beslut 77)');

  // ---- Ta bort ett plan ----
  const foreBort = await historiklangd(page);
  await bf.locator('.bf-planrad[data-plan="P3"]').locator('button', { hasText: 'Ta bort' }).click();
  await stegKlart(page, foreBort, 'ta bort plan');
  kontroll(await page.evaluate(() => !DP.Plan.byggnad().plan.some(p => p.id === 'P3')),
    'ett plan går att ta bort, som ett steg i historiken');

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

  // ---- SheetJS är inbäddat och fungerar (biljett #36) ----
  // Prövas här och inte bara mot index.html: byggskriptet kan tappa `vendor/xlsx.mini.min.js`
  // utan att någon annan kontroll blir röd, och då hade planeraren mötts av en knapp som inte
  // gör något – i just den fil som är hennes enda väg in när jobbdatorn spärrar raw.githack.
  const excel = await page.evaluate(() => {
    if (!window.XLSX || !DP.Inlasningsfil.tillganglig()) { return { ok: false }; }
    // Skriv ett ark hela vägen till bytes, som *Ta ut inläsningsfil* gör, och läs tillbaka
    // det: att biblioteket finns är en sak, att det fungerar inbäddat en annan.
    const bok = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(bok, XLSX.utils.aoa_to_sheet(DP.Plan.filArk()[0].rader), 'Plan');
    const bytes = XLSX.write(bok, { type: 'array', bookType: 'xlsx' });
    const retur = XLSX.read(bytes, { type: 'array' });
    return {
      ok: true, version: XLSX.version, storlek: bytes.byteLength,
      rubriker: XLSX.utils.sheet_to_json(retur.Sheets.Plan, { header: 1, raw: false })[0]
    };
  });
  kontroll(excel.ok, 'Excel-biblioteket är inbäddat i den fristående filen');
  kontroll(excel.ok && excel.storlek > 0 && (excel.rubriker || []).join(',') === 'Plan,Benämning',
    'en .xlsx skrivs och läses tillbaka ur den fristående filen ('
    + (excel.rubriker || []).join(',') + ', ' + excel.storlek + ' byte)');

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

// Inläsningens tolkning prövad fristående, med ett ark byggt direkt i testet (som
// `DP.Balansering`-testerna): modulen är utan DOM, så den går att anropa med rena data och
// läsa svaret som rena data. Det som prövas är det en fil ur verkligheten gör – en rubrikrad
// en bit ner, tomma rader, en kolumn systemet inte känner till och olika skrivsätt på planen.
//
// Varför fristående och inte bara genom sidan: en tolkningsregel som går fel visar sig i
// gränssnittet som en rad på fel ställe, och då är det inte uppenbart om felet är tolkningens
// eller vyns. Här är svaret precis vad modulen tänkte.
async function testInlasningsmodulen(browser) {
  console.log('Inläsningens tolkning fristående: Plan och Rum (beslut 76–80, 83, 89, 108–110)');
  const page = await nySida(browser, URL_INDEX);

  // Ett ark som en fil som gått via Numbers: tabellrubriken "Plan" på egen rad överst, en tom
  // rad, och sedan den riktiga rubrikraden med en egen kolumn (Kapacitet).
  const svar = await page.evaluate(() => {
    const ark = [{
      namn: 'Blad 1',
      rader: [
        ['Plan', ''],
        ['', ''],
        ['Plan', 'Benämning', 'Kapacitet'],
        ['01', 'Entréplan', '40 pers'],
        ['', '', ''],
        ['P1', '', ''],
        ['', 'Rad utan beteckning', ''],
        ['K1', 'Källarplan', '']
      ]
    }];
    const fil = DP.Inlasning.lasArk(ark);
    const rader = DP.Inlasning.tolkaPlan(fil.plan, []);
    return {
      rubrikrad: DP.Inlasning.hittaRubrikrad(ark[0].rader),
      antal: fil.plan.length,
      egna: fil.egnaKolumner.plan,
      ignorerade: fil.ignorerade,
      rader: rader.map(r => ({
        id: r.falt.id, namn: r.falt.namn, status: DP.Inlasning.status(r),
        skal: r.fragor.map(f => f.text), egna: r.egna
      })),
      raknat: DP.Inlasning.raknat(rader)
    };
  });
  kontroll(svar.rubrikrad === 2,
    'rubrikraden hittas under tabellrubriken och den tomma raden (rad ' + svar.rubrikrad + ')');
  kontroll(svar.antal === 4,
    'tomma rader hoppas över – fyra rader lästes (' + svar.antal + ')');
  kontroll(svar.egna.join(',') === 'Kapacitet',
    'en kolumn systemet inte känner till blir ett eget fält (' + svar.egna.join(',') + ')');
  kontroll(svar.rader[0].status === 'klar' && svar.rader[0].egna.Kapacitet === '40 pers',
    'en rad med beteckning och benämning är klar, och bär sitt egna fält');
  kontroll(svar.rader[1].id === 'P1' && svar.rader[1].status === 'forslag',
    'ett plan utan benämning blir ett förslag (' + svar.rader[1].id + ': ' + svar.rader[1].status + ')');
  kontroll(/P1 saknar benämning/.test(svar.rader[1].skal[0]) && /Plan P1/.test(svar.rader[1].skal[0]),
    'förslagets skäl står i klartext ("' + svar.rader[1].skal[0] + '")');
  kontroll(svar.rader[2].status === 'oplacerad' && /ingen beteckning/.test(svar.rader[2].skal[0]),
    'en rad utan beteckning är oplacerad och säger varför ("' + svar.rader[2].skal[0] + '")');
  kontroll(svar.rader[3].id === 'K1' && svar.rader[3].status === 'klar',
    'beteckningen behålls exakt som den står i filen (' + svar.rader[3].id + ', beslut 77)');
  kontroll(svar.raknat.klar === 2 && svar.raknat.forslag === 1 && svar.raknat.oplacerad === 1,
    'de tre grupperna räknas (' + JSON.stringify(svar.raknat) + ')');

  // ---- Flikigenkänning på rubrikerna, inte på bladets namn (berättelse 19) ----
  const flikar = await page.evaluate(() => ({
    plan: DP.Inlasning.vilkenFlik(['Plan', 'Benämning']),
    rum: DP.Inlasning.vilkenFlik(['Plan', 'Rum', 'Benämning', 'NTA']),
    inst: DP.Inlasning.vilkenFlik(['Plan', 'Rum', 'Benämning', 'Fabrikat', 'Id']),
    slarvigt: DP.Inlasning.vilkenFlik(['plan ', 'BENÄMNING']),
    inget: DP.Inlasning.vilkenFlik(['Namn', 'Adress'])
  }));
  kontroll(flikar.plan === 'plan' && flikar.rum === 'rum' && flikar.inst === 'inst',
    'flikarna känns igen på sina kolumnrubriker (' + JSON.stringify(flikar) + ')');
  kontroll(flikar.slarvigt === 'plan',
    'rubriker med annan skiftläge och blanksteg känns igen (' + flikar.slarvigt + ')');
  kontroll(flikar.inget === null,
    'ett blad som inte är någon av flikarna känns inte igen (' + flikar.inget + ')');

  // Ett blad vars rubriker inte känns igen tigs inte ihjäl: planeraren ska kunna få veta att
  // hennes tredje blad inte lästes.
  const ignorerat = await page.evaluate(() => DP.Inlasning.lasArk([
    { namn: 'Anteckningar', rader: [['Fyllt i av', 'Nisse'], ['Datum', '2026-11-20']] }
  ]).ignorerade);
  kontroll(ignorerat.join(',') === 'Anteckningar',
    'ett blad som inte känns igen hamnar i ignorerade (' + ignorerat.join(',') + ')');

  // ---- Att godta för in förslagen, och bara dem ----
  const godtaget = await page.evaluate(() => {
    const rad = DP.Inlasning.tolkaPlan([{ id: 'P1', namn: '', egna: {} }], [])[0];
    const fore = DP.Inlasning.status(rad);
    DP.Inlasning.godta(rad);
    return { fore: fore, efter: DP.Inlasning.status(rad), namn: rad.falt.namn };
  });
  kontroll(godtaget.fore === 'forslag' && godtaget.efter === 'klar' && godtaget.namn === 'Plan P1',
    'att godta för in förslaget och gör raden klar (' + godtaget.namn + ')');
  // En oplacerad rad blir **inte** klar av ett godtagande: det systemet inte vet kan planeraren
  // inte godta sig förbi (beslut 83).
  const oplacerad = await page.evaluate(() => {
    const rad = DP.Inlasning.tolkaPlan([{ id: '', namn: 'Vindsplan', egna: {} }], [])[0];
    DP.Inlasning.godta(rad);
    return DP.Inlasning.status(rad);
  });
  kontroll(oplacerad === 'oplacerad',
    'en oplacerad rad blir inte klar av Godta – frågan utan förslag står kvar (' + oplacerad + ')');

  // ---- Ett plan som redan finns är ingen nyhet (berättelse 16 och 17) ----
  const fanns = await page.evaluate(() => {
    const rader = DP.Inlasning.tolkaPlan(
      [{ id: '01', namn: 'Entréplan', egna: {} }, { id: '02', namn: 'Plan 02', egna: {} }],
      [{ id: '01', namn: 'Entréplan' }]);
    return rader.map(r => ({ id: r.falt.id, fanns: !!r.fanns, status: DP.Inlasning.status(r) }));
  });
  kontroll(fanns[0].fanns === true && fanns[1].fanns === false,
    'ett plan som redan finns i byggnaden märks som befintligt (' + JSON.stringify(fanns) + ')');

  // ---- Samma beteckning två gånger är ett fel i filen, inte något att gissa om ----
  const dubbel = await page.evaluate(() => {
    const rader = DP.Inlasning.tolkaPlan(
      [{ id: '01', namn: 'Entré', egna: {} }, { id: '01', namn: 'Entré igen', egna: {} }], []);
    return rader.map(r => ({ status: DP.Inlasning.status(r), skal: r.fragor.map(f => f.text).join(' ') }));
  });
  kontroll(dubbel[0].status === 'klar' && dubbel[1].status === 'oplacerad'
    && /mer än en rad/.test(dubbel[1].skal),
    'samma beteckning två gånger gör den andra raden oplacerad ("' + dubbel[1].skal + '")');

  // ---- Arket som tas ut: tre flikar med rubriker, och de egna kolumnerna sist ----
  const ark = await page.evaluate(() => DP.Inlasning.tillArk({
    plan: [{ id: '01', namn: 'Entréplan', egna: { Kapacitet: '40 pers' } }],
    rum: [], installationer: []
  }));
  kontroll(ark.length === 3 && ark.map(f => f.namn).join(',') === 'Plan,Rum,Installationer',
    'filen tas ut med alla tre flikarna (' + ark.map(f => f.namn).join(',') + ')');
  kontroll(ark[0].rader[0].join(',') === 'Plan,Benämning,Kapacitet',
    'de egna kolumnerna ligger sist, efter de kända (' + ark[0].rader[0].join(',') + ')');
  kontroll(ark[0].rader[1].join(',') === '01,Entréplan,40 pers',
    'det egna fältet följer med ut igen (' + ark[0].rader[1].join(',') + ', beslut 89)');

  // ==================================================================
  // Fliken Rum (biljett #37, beslut 76, 77, 79, 80, 108, 109 och 110)
  // ==================================================================
  // Ett rum pekas ut med plan + rumsnummer, och båda matchas förlåtande. Det som prövas är
  // det en fil ur verkligheten gör: planen skrivna som P1 och 1, rumsnummer utan nollor,
  // benämningar systemet inte känner igen, saknad NTA och ett plan som inte finns.
  // Standard-NTA ur tabellen och inte en siffra i testet: det är tabellen som är regeln
  // (beslut 99), och ett test som skriver 36 hade gått sönder av en justering som är rätt.
  const stdNta = await page.evaluate(() => ({ wcdusch: DP.rumstyper.wcdusch.nta }));
  const rum = await page.evaluate(() => {
    const byggnad = {
      plan: [{ id: '00', namn: 'Källarplan' }, { id: '01', namn: 'Entréplan' },
        { id: '02', namn: 'Plan 2' }],
      rum: []
    };
    const rader = DP.Inlasning.tolkaRum([
      // Exakt plan, tresiffrigt nummer, känd benämning, NTA: klar
      { plan: '01', nr: '001', namn: 'Korridor', nta: '96', egna: {} },
      // "P1" matchas förlåtande mot 01, numret fylls ut: förslag
      { plan: 'P1', nr: '2', namn: 'Logement 1:1', nta: '36', egna: {} },
      // Okänd benämning: förslaget Övrigt rum
      { plan: '02', nr: '001', namn: 'Gillestuga', nta: '48', egna: {} },
      // Saknad NTA: förslag med rumstypens standardvärde
      { plan: '02', nr: '002', namn: 'WC/D', nta: '', egna: {} },
      // Plan som inte finns: oplacerad
      { plan: '07', nr: '001', namn: 'Vindsförråd', nta: '20', egna: {} },
      // NTV ger höjden, BRA/BTA och Temperaturreglerad läses in
      { plan: '00', nr: '001', namn: 'Fläktrum', nta: '40', ntv: '400', bra: '44',
        bta: '48', temp: 'Ja', egna: { Kommentar: 'Nytt aggregat' } },
      // Kolumnen Rumstyp går före benämningen (beslut 109)
      { plan: '00', nr: '002', namn: 'Gillestuga', rumstyp: 'Dagrum', nta: '60', egna: {} }
    ], byggnad);
    return rader.map(r => ({
      plan: r.falt.plan, nr: r.falt.nr, namn: r.falt.namn, rumstyp: r.falt.rumstyp,
      nta: r.falt.nta, ntv: r.falt.ntv, bra: r.falt.bra, bta: r.falt.bta, temp: r.falt.temp,
      status: DP.Inlasning.status(r), egna: r.egna,
      skal: r.fragor.map(f => f.slag + ': ' + f.text),
      forslag: r.fragor.reduce((o, f) => { o[f.slag] = f.forslag; return o; }, {})
    }));
  });
  kontroll(rum[0].status === 'klar' && rum[0].plan === '01' && rum[0].nr === '001'
    && rum[0].rumstyp === 'korridor' && rum[0].nta === 96,
    'ett rum med exakt plan, tresiffrigt nummer, känd benämning och NTA är klart ('
    + JSON.stringify({ p: rum[0].plan, nr: rum[0].nr, typ: rum[0].rumstyp }) + ')');
  kontroll(rum[1].status === 'forslag' && rum[1].forslag.plan === '01' && rum[1].forslag.nr === '002',
    'P1 matchas mot plan 01 och numret 2 fylls ut till 002 – båda som förslag ('
    + JSON.stringify(rum[1].forslag) + ', beslut 77)');
  kontroll(rum[1].skal.some(s => /P1 tolkas som plan 01/.test(s))
    && rum[1].skal.some(s => /fylls ut till 002/.test(s)),
    'skälen står i klartext ("' + rum[1].skal.join('" / "') + '", berättelse 24)');
  kontroll(rum[1].rumstyp === 'logement',
    'rumstypen läses ur benämningen "Logement 1:1" (' + rum[1].rumstyp + ', beslut 80)');
  kontroll(rum[2].status === 'forslag' && rum[2].forslag.rumstyp === 'ovrigt'
    && /Gillestuga känns inte igen/.test(rum[2].skal.join(' ')),
    'en okänd benämning blir förslaget Övrigt rum (' + rum[2].forslag.rumstyp + ', beslut 80)');
  kontroll(rum[3].status === 'forslag' && rum[3].rumstyp === 'wcdusch'
    && rum[3].forslag.nta === stdNta.wcdusch,
    'en saknad NTA blir ett förslag med rumstypens standardvärde (' + rum[3].forslag.nta
    + ' m² för WC/D, beslut 79 och berättelse 40)');
  kontroll(rum[4].status === 'oplacerad'
    && /inget plan 07/.test(rum[4].skal.join(' ')),
    'ett rum på ett plan som inte finns blir oplacerat och säger varför ("'
    + rum[4].skal.join(' ') + '", berättelse 37)');
  kontroll(rum[5].status === 'klar' && rum[5].ntv === 400 && rum[5].bra === 44
    && rum[5].bta === 48 && rum[5].temp === true,
    'NTV, BRA, BTA och Temperaturreglerad läses in (' + JSON.stringify(
      { ntv: rum[5].ntv, bra: rum[5].bra, bta: rum[5].bta, temp: rum[5].temp }) + ', beslut 79)');
  kontroll(rum[5].egna.Kommentar === 'Nytt aggregat',
    'en egen kolumn i fliken Rum blir ett eget fält (' + rum[5].egna.Kommentar + ', beslut 89)');
  kontroll(rum[6].rumstyp === 'dagrum' && rum[6].status === 'klar',
    'kolumnen Rumstyp går före benämningen när den är ifylld (' + rum[6].rumstyp + ', beslut 109)');

  // ---- Rumstyperna ur benämningen: skrivsätten ur fastighetssystemet ----
  const typer = await page.evaluate(() => ({
    korr: DP.rumstypFor('Korr.'),
    korridor: DP.rumstypFor('Korridor'),
    trapp: DP.rumstypFor('Trapphus'),
    wc: DP.rumstypFor('WC/D'),
    logement: DP.rumstypFor('Logement 2:4'),
    sovsal: DP.rumstypFor('Sovsal'),
    kok: DP.rumstypFor('Kök'),
    fika: DP.rumstypFor('Fikarum'),
    pentry: DP.rumstypFor('Pentry'),
    forrad: DP.rumstypFor('Materielförråd'),
    okand: DP.rumstypFor('Gillestuga'),
    // Kolumnen tar emot både id:t filen bär och det namn planeraren ser (beslut 109)
    avId: DP.rumstypAv('wcdusch'),
    avNamn: DP.rumstypAv('WC/Dusch'),
    avOkand: DP.rumstypAv('Gillestuga')
  }));
  kontroll(typer.korr === 'korridor' && typer.korridor === 'korridor'
    && typer.trapp === 'trapphus' && typer.wc === 'wcdusch'
    && typer.logement === 'logement' && typer.sovsal === 'logement',
    'de vanliga skrivsätten känns igen (' + JSON.stringify(typer).slice(0, 110) + ', beslut 80)');
  kontroll(typer.kok === 'kok' && typer.fika === 'fikarum' && typer.pentry === 'fikarum',
    'Kök och Fikarum är egna rumstyper (beslut 108)');
  kontroll(typer.forrad === 'forrad' && typer.okand === null,
    'en okänd benämning känns inte igen alls, och blir då ett förslag (' + typer.okand + ')');
  kontroll(typer.avId === 'wcdusch' && typer.avNamn === 'wcdusch' && typer.avOkand === null,
    'kolumnen Rumstyp tar emot både id och namn (' + typer.avId + ', ' + typer.avNamn + ')');

  // ---- Ett rum som redan finns är ingen nyhet, som ett plan som redan finns ----
  const fannsRum = await page.evaluate(() => {
    const rader = DP.Inlasning.tolkaRum([
      { plan: '01', nr: '001', namn: 'Korridor', nta: '96', egna: {} },
      { plan: '01', nr: '002', namn: 'Entré', nta: '48', egna: {} }
    ], {
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: [{ nr: '001', namn: 'Korridor', plan: '01', nta: 96 }]
    });
    return rader.map(r => ({ nr: r.falt.nr, fanns: !!r.fanns, status: DP.Inlasning.status(r) }));
  });
  kontroll(fannsRum[0].fanns === true && fannsRum[1].fanns === false,
    'ett rum som redan finns märks som befintligt (' + JSON.stringify(fannsRum) + ', beslut 86)');

  // ---- Nästa lediga rumsnummer när numret krockar (beslut 110) ----
  const ledigt = await page.evaluate(() => ({
    nasta: DP.Inlasning.nastaLedigaNr('03', {
      rum: [{ plan: '03', nr: '001' }, { plan: '03', nr: '002' }, { plan: '05', nr: '003' }]
    }),
    // Rader som godtas i samma steg räknas också som upptagna
    medUtom: DP.Inlasning.nastaLedigaNr('03', {
      rum: [{ plan: '03', nr: '001' }]
    }, ['002', '003'])
  }));
  kontroll(ledigt.nasta === '003',
    'nästa lediga nummer på planet föreslås (' + ledigt.nasta + ', beslut 110)');
  kontroll(ledigt.medUtom === '004',
    'nummer som tas av rader i samma steg räknas som upptagna (' + ledigt.medUtom + ')');

  // ---- Arket som tas ut bär rumstypen som namn, så kolumnen går tur och retur ----
  const rumArk = await page.evaluate(() => {
    const ark = DP.Inlasning.tillArk({
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: [{ nr: '001', namn: 'Korridor', plan: '01', rumstyp: 'korridor', nta: 96,
        ntv: 300, bra: 100, bta: 110, temp: true, egna: { Kommentar: 'Ny matta' } }],
      installationer: []
    });
    const rumFlik = ark.filter(f => f.namn === 'Rum')[0];
    return { rubriker: rumFlik.rader[0], rad: rumFlik.rader[1] };
  });
  kontroll(rumArk.rubriker.join(',') === 'Plan,Rum,Benämning,Rumstyp,NTA,NTV,BRA,BTA,Temperaturreglerad,Kommentar',
    'fliken Rum tas ut med sina kolumner och den egna sist (' + rumArk.rubriker.join(',') + ')');
  kontroll(rumArk.rad[3] === 'Korridor' && rumArk.rad[8] === 'Ja' && rumArk.rad[9] === 'Ny matta',
    'rumstypen tas ut som sitt namn och Temperaturreglerad som Ja (' + rumArk.rad.join(',')
    + ', beslut 109)');
  // Tur och retur: det som tas ut ska läsas tillbaka till samma rum
  const returRum = await page.evaluate(() => {
    const ark = DP.Inlasning.tillArk({
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: [{ nr: '001', namn: 'Korridor', plan: '01', rumstyp: 'korridor', nta: 96,
        ntv: 300, bra: 100, bta: 110, temp: true, egna: { Kommentar: 'Ny matta' } }],
      installationer: []
    });
    const fil = DP.Inlasning.lasArk(ark);
    const rader = DP.Inlasning.tolkaRum(fil.rum, { plan: [{ id: '01', namn: 'Entréplan' }], rum: [] });
    return { status: DP.Inlasning.status(rader[0]), rum: DP.Inlasning.rumFranRad(rader[0]) };
  });
  kontroll(returRum.status === 'klar' && returRum.rum.rumstyp === 'korridor'
    && returRum.rum.nta === 96 && returRum.rum.ntv === 300 && returRum.rum.temp === true
    && returRum.rum.egna.Kommentar === 'Ny matta',
    'ett rum går tur och retur via ta ut utan skillnad (' + JSON.stringify(returRum.rum) + ')');

  // ---- Fliken Installationer: rummatchning, typ ur benämning och tomt Id ----
  // Det som prövas är de tre sakerna en installationsrad kan fattas (beslut 81 och
  // berättelse 45–48): vilket rum den sitter i, vilken typ den är, och vilket id den har.
  // Byggnaden har tre plan där 001 finns på två av dem, så "finns numret på flera plan" går
  // att pröva utan att testet behöver bygga en egen matchningsregel.
  const inst = await page.evaluate(() => {
    const byggnad = {
      typ: 'kasern',
      plan: [{ id: '01', namn: 'Entréplan' }, { id: '02', namn: 'Plan 2' },
        { id: '03', namn: 'Plan 3' }],
      rum: [
        { nr: '001', namn: 'Korridor', plan: '01', rumstyp: 'korridor', nta: 96 },
        { nr: '003', namn: 'Logement 1:1', plan: '01', rumstyp: 'logement', nta: 36 },
        { nr: '001', namn: 'Korridor', plan: '02', rumstyp: 'korridor', nta: 96 },
        { nr: '007', namn: 'Fläktrum', plan: '03', rumstyp: 'teknik', nta: 40 }
      ],
      installationer: [{ id: '00000011', typ: 'brandpost', rum: '01-001',
        benamning: 'Brandpost 1', beteckning: 'BP01', signifikant: true }]
    };
    const ark = [{
      namn: 'Installationer',
      rader: [
        ['Plan', 'Rum', 'Benämning', 'Installationstyp', 'Beteckning', 'Fabrikat', 'Modell',
          'Id', 'Externt id', 'Installationsdatum', 'Kapacitet'],
        // Klar: exakt plan och tresiffrigt nummer, benämning systemet känner igen
        ['01', '003', 'Handbrandsläckare 3', '', 'HB03', 'Presto', 'P7kg', '00000030', '', '2024-05-02', ''],
        // Förslag: plan skrivet P3 och numret utan nollor
        ['P3', '7', 'Handbr.släckare 4', '', 'HB04', 'Dafo', '', '00000031', '', '', ''],
        // Förslag: planet saknas, men 007 finns bara på ett plan (berättelse 46)
        ['', '007', 'Luftbehandlingsaggregat 1', '', 'LB01', 'Fahoma', 'FTX1127', '', '', '', '2000 l/s'],
        // Oplacerad: 001 finns på två plan och planet är tomt (berättelse 46)
        ['', '001', 'Handbrandsläckare 5', '', 'HB05', '', '', '', '', '', ''],
        // Oplacerad: benämningen känns inte igen som en installationstyp (beslut 81)
        ['01', '003', 'Gurglande dunk', '', 'GD01', '', '', '', '', '', ''],
        // Klar: kolumnen Installationstyp går före benämningen (beslut 109)
        ['01', '003', 'Gurglande dunk 2', 'Tryckkärl', 'TK01', '', '', '', '', '', ''],
        // Oplacerad: rummet finns inte i byggnaden
        ['04', '002', 'Handbrandsläckare 6', '', 'HB06', '', '', '', '', '', ''],
        // Samma Id som en installation som redan finns: raden är inte ny (beslut 86)
        ['01', '001', 'Brandpost 1', '', 'BP01', '', '', '00000011', '', '', '']
      ]
    }];
    const fil = DP.Inlasning.lasArk(ark);
    const rader = DP.Inlasning.tolkaInst(fil.inst, byggnad, []);
    return {
      flik: DP.Inlasning.vilkenFlik(ark[0].rader[0]),
      egna: fil.egnaKolumner.inst,
      raknat: DP.Inlasning.raknat(rader),
      rader: rader.map(r => ({
        bet: r.falt.beteckning, rum: r.falt.rum, typ: r.falt.typ, id: r.falt.id,
        namn: r.falt.namn, datum: r.falt.datum, fanns: !!r.fanns,
        idFranSystemet: !!r.idFranSystemet,
        status: DP.Inlasning.status(r),
        slag: r.fragor.map(f => f.slag),
        skal: r.fragor.map(f => f.text),
        forslag: r.fragor.map(f => f.forslag),
        egna: r.egna
      }))
    };
  });
  const iRad = bet => inst.rader.filter(r => r.bet === bet)[0];
  kontroll(inst.flik === 'inst',
    'fliken Installationer känns igen på sina kolumnrubriker (' + inst.flik + ')');
  kontroll(inst.egna.join(',') === 'Kapacitet',
    'en okänd kolumn i fliken Installationer blir ett eget fält (' + inst.egna.join(',')
    + ', beslut 89)');
  kontroll(iRad('HB03').status === 'klar' && iRad('HB03').rum === '01-003'
    && iRad('HB03').typ === 'handbrandslackare' && iRad('HB03').datum === '2024-05-02',
    'en rad med exakt plan och nummer är klar, typen läses ur benämningen och datumet läses in ('
    + JSON.stringify(iRad('HB03')) + ', beslut 81 och 95)');
  kontroll(iRad('HB04').status === 'forslag' && iRad('HB04').forslag[0] === '03-007'
    && iRad('HB04').typ === 'handbrandslackare',
    'plan P3 och nummer 7 tolkas förlåtande till 03-007, och "Handbr.släckare" känns igen ('
    + iRad('HB04').forslag[0] + ')');
  kontroll(/P3 tolkas som plan 03/.test(iRad('HB04').skal[0]),
    'förslagets skäl står i klartext ("' + iRad('HB04').skal[0] + '", berättelse 24)');
  kontroll(iRad('LB01').status === 'forslag' && iRad('LB01').forslag[0] === '03-007'
    && /bara på ett plan/.test(iRad('LB01').skal[0]),
    'en rad utan plan vars rumsnummer finns på ett enda plan blir ett förslag ("'
    + iRad('LB01').skal[0] + '", berättelse 46)');
  kontroll(iRad('HB05').status === 'oplacerad' && /finns på flera plan/.test(iRad('HB05').skal[0]),
    'ett rumsnummer som finns på flera plan blir oplacerat och säger varför ("'
    + iRad('HB05').skal[0] + '", berättelse 46)');
  kontroll(iRad('GD01').status === 'oplacerad' && iRad('GD01').slag.indexOf('typ') >= 0
    && iRad('GD01').forslag.every(f => f === null),
    'en okänd installationstyp är oplacerad och inte ett förslag: typen avgör vilka åtgärder '
    + 'som går att koppla (' + JSON.stringify(iRad('GD01').slag) + ', beslut 81)');
  kontroll(/Välj typ ur listan/.test(iRad('GD01').skal.join(' ')),
    'frågan om typen säger vad planeraren ska göra ("' + iRad('GD01').skal.join(' ') + '")');
  kontroll(iRad('TK01').status === 'klar' && iRad('TK01').typ === 'tryckkarl',
    'kolumnen Installationstyp går före benämningen (' + iRad('TK01').typ + ', beslut 109)');
  kontroll(iRad('HB06').status === 'oplacerad' && /inget plan 04/.test(iRad('HB06').skal[0]),
    'en installation på ett plan som inte finns är oplacerad och säger varför ("'
    + iRad('HB06').skal[0] + '")');
  kontroll(iRad('BP01').fanns === true && iRad('BP01').status === 'klar',
    'samma Id som en installation som redan finns är ingen ny rad (beslut 86)');
  // Ett tomt Id får ett id från systemet, och två tomma rader får **olika** id:n
  const utanId = inst.rader.filter(r => r.idFranSystemet);
  const unika = utanId.map(r => r.id).filter((v, i, a) => a.indexOf(v) === i);
  kontroll(utanId.length === 5 && unika.length === 5,
    'varje rad utan Id får ett eget id från systemet (' + utanId.map(r => r.bet + ':' + r.id).join(' ')
    + ', berättelse 48)');
  kontroll(iRad('LB01').egna.Kapacitet === '2000 l/s',
    'det egna fältet följer med raden (' + iRad('LB01').egna.Kapacitet + ')');

  // ---- En installation i ett rum som själv är ett förslag är klar (beslut 110) ----
  // Står det i filen exakt vad rummet kommer att heta när rummets eget förslag godtas syns
  // installationen när rummet gör det. Annars hade en fil med plan, rum och installationer i
  // samma inläsning gett oplacerade installationer till varje rum som själv var ett förslag.
  const blivande = await page.evaluate(() => {
    const byggnad = { typ: 'kasern', plan: [{ id: '01', namn: 'Entréplan' }], rum: [],
      installationer: [] };
    const rader = DP.Inlasning.tolkaInst(
      [{ plan: '01', rum: '005', benamning: 'Handbrandsläckare 1', beteckning: 'HB01' }],
      byggnad, ['01-005']);
    return { status: DP.Inlasning.status(rader[0]), rum: rader[0].falt.rum,
      skal: rader[0].fragor.map(f => f.text).join(' ') };
  });
  kontroll(blivande.status === 'klar' && blivande.rum === '01-005',
    'en installation i ett rum som är ett förslag i samma inläsning är klar ('
    + blivande.status + ' i ' + blivande.rum + ', beslut 110 och berättelse 45)');

  // …och den **väntar** sedan på rummet i stället för att räknas som hemlös. Att raden var
  // klar betyder att planeraren inte har någon fråga att svara på i steg 4 – men rummet är
  // ett förslag i steg 3, och tills hon godtar det sitter installationen ingenstans. Ett
  // grönt steg 4 ovanför ett rött steg 3 hade sagt att installationerna är på plats medan
  // deras rum ännu är en gissning.
  const vantar = await page.evaluate(() => {
    // En byggnad där plan 01 är klart men rum 01-005 bara är ett förslag (NTA saknas), och
    // en installation som pekar på just det rummet.
    DP.Plan.skapaByggnad({ namn: 'Väntprov', typ: 'kasern', omrade: 'kasernomradet' });
    DP.Plan.lasInArk([
      { namn: 'Plan', rader: [['Plan', 'Benämning'], ['01', 'Entréplan']] },
      { namn: 'Rum', rader: [['Plan', 'Rum', 'Benämning', 'NTA'], ['01', '005', 'Logement 1:1', '']] },
      { namn: 'Installationer', rader: [['Plan', 'Rum', 'Benämning', 'Beteckning', 'Fabrikat'],
        ['01', '005', 'Handbrandsläckare 1', 'HB01', 'Presto']] }
    ], 'vantprov.xlsx');
    const st = DP.Plan.instStatus();
    return {
      vantande: st.vantande.map(i => i.beteckning + '@' + i.rum),
      hemlosa: st.hemlosa.map(i => i.beteckning + '@' + i.rum),
      steg: DP.Plan.byggnadsSteg(),
      // Och när rummet godtas är installationen på plats och båda stegen gröna
      efter: (function () {
        DP.Plan.godtaAllaRum();
        const s2 = DP.Plan.instStatus();
        return { vantande: s2.vantande.length, hemlosa: s2.hemlosa.length,
          steg: DP.Plan.byggnadsSteg(),
          modell: DP.Planlosning.form(DP.Plan.byggnad()).installationer
            .filter(i => i.signifikant).length };
      })()
    };
  });
  kontroll(vantar.vantande.join(' ') === 'HB01@01-005' && vantar.hemlosa.length === 0,
    'en installation vars rum ännu är ett förslag **väntar** och är inte hemlös ('
    + (vantar.vantande.join(' ') || 'ingen') + ', hemlösa: ' + vantar.hemlosa.length + ')');
  kontroll(vantar.steg[3] === false && vantar.steg[4] === false,
    'steg 4 blir inte grönt medan en installation väntar på sitt rum (steg 3: '
    + vantar.steg[3] + ', steg 4: ' + vantar.steg[4] + ', beslut 110)');
  kontroll(vantar.efter.vantande === 0 && vantar.efter.steg[3] === true
    && vantar.efter.steg[4] === true && vantar.efter.modell === 1,
    'när rummet godtas är installationen på plats, båda stegen gröna och den syns i modellen ('
    + JSON.stringify(vantar.efter) + ', berättelse 45)');

  // ---- Fliken Installationer tur och retur via ta ut ----
  // Rummets nyckel delas upp i kolumnerna Plan och Rum på väg ut, och sätts ihop igen på väg
  // in: den som fyller i filen möter samma två kolumner hon möter i fastighetssystemet.
  const returInst = await page.evaluate(() => {
    const byggnad = {
      typ: 'kasern',
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: [{ nr: '003', namn: 'Logement 1:1', plan: '01', rumstyp: 'logement', nta: 36 }],
      installationer: [
        { id: '00000030', typ: 'handbrandslackare', rum: '01-003',
          benamning: 'Handbrandsläckare 3', beteckning: 'HB03', fabrikat: 'Presto',
          modell: 'P7kg', externtId: 'L410233', datum: '2024-05-02', signifikant: true,
          egna: { Kapacitet: '6 kg' } },
        // En övrig installation ska **inte** stå i filen (beslut 81)
        { typ: 'vagguttag', rum: '01-003', x: 1, z: 2, h: 0.3, signifikant: false }
      ]
    };
    const ark = DP.Inlasning.tillArk(byggnad);
    const flik = ark.filter(f => f.namn === 'Installationer')[0];
    const fil = DP.Inlasning.lasArk(ark);
    const rader = DP.Inlasning.tolkaInst(fil.inst,
      { typ: 'kasern', plan: byggnad.plan, rum: byggnad.rum, installationer: [] }, []);
    return {
      rubriker: flik.rader[0], rad: flik.rader[1], antal: flik.rader.length - 1,
      status: DP.Inlasning.status(rader[0]),
      inst: DP.Inlasning.instFranRad(rader[0])
    };
  });
  kontroll(returInst.antal === 1,
    'bara den signifikanta installationen tas ut i filen (' + returInst.antal + ', beslut 81)');
  kontroll(returInst.rubriker.join(',') === 'Plan,Rum,Benämning,Installationstyp,Beteckning,'
    + 'Fabrikat,Modell,Id,Externt id,Installationsdatum,Kapacitet',
    'fliken Installationer tas ut med sina kolumner och den egna sist ('
    + returInst.rubriker.join(',') + ')');
  kontroll(returInst.rad[0] === '01' && returInst.rad[1] === '003',
    'rummets nyckel delas upp i kolumnerna Plan och Rum (' + returInst.rad.slice(0, 2).join('|')
    + ', beslut 76)');
  kontroll(returInst.rad[3] === 'Handbrandsläckare',
    'Installationstyp tas ut som sitt namn (' + returInst.rad[3] + ', beslut 109)');
  kontroll(returInst.status === 'klar' && returInst.inst.rum === '01-003'
    && returInst.inst.typ === 'handbrandslackare' && returInst.inst.id === '00000030'
    && returInst.inst.fabrikat === 'Presto' && returInst.inst.datum === '2024-05-02'
    && returInst.inst.egna.Kapacitet === '6 kg',
    'en installation går tur och retur via ta ut utan skillnad ('
    + JSON.stringify(returInst.inst) + ')');

  // ---- Installationstypen ur benämningen, de skrivsätt filen bär ----
  const insttyper = await page.evaluate(() => ({
    full: DP.installationstypFor('Handbrandsläckare 3'),
    kort: DP.installationstypFor('Handbr.släckare 3'),
    blc: DP.installationstypFor('BLC 1'),
    hc: DP.installationstypFor('HC01'),
    lb: DP.installationstypFor('LB 2'),
    nod: DP.installationstypFor('Nödbelysningsarmatur 4'),
    okand: DP.installationstypFor('Gurglande dunk'),
    tom: DP.installationstypFor(''),
    avNamn: DP.installationstypAv('Tryckkärl'),
    avId: DP.installationstypAv('tryckkarl'),
    avOkand: DP.installationstypAv('Gurglande dunk'),
    // Listan planeraren väljer ur är de signifikanta typerna: ett vägguttag är ingen individ
    signifikanta: DP.signifikantaTyper(),
    harOvrig: DP.signifikantaTyper().indexOf('vagguttag') >= 0
  }));
  kontroll(insttyper.full === 'handbrandslackare' && insttyper.kort === 'handbrandslackare',
    'både "Handbrandsläckare 3" och "Handbr.släckare 3" känns igen (beslut 81)');
  kontroll(insttyper.blc === 'brandlarmscentral' && insttyper.hc === 'huvudcentral'
    && insttyper.lb === 'luftbehandlingsaggregat',
    'fastighetssystemets förkortningar känns igen (' + [insttyper.blc, insttyper.hc, insttyper.lb].join(' ') + ')');
  kontroll(insttyper.nod === 'nodbelysning',
    'nödbelysning blir inte en elcentral: det mest utpekande mönstret prövas först ('
    + insttyper.nod + ')');
  kontroll(insttyper.okand === null && insttyper.tom === null,
    'en benämning systemet inte känner igen ger null, inte en gissning (beslut 81)');
  kontroll(insttyper.avNamn === 'tryckkarl' && insttyper.avId === 'tryckkarl' && insttyper.avOkand === null,
    'kolumnen Installationstyp läses både som namn och som id (beslut 109)');
  kontroll(insttyper.signifikanta.length > 10 && !insttyper.harOvrig,
    'listan planeraren väljer ur har bara signifikanta typer (' + insttyper.signifikanta.length
    + ' typer, vägguttag med: ' + insttyper.harOvrig + ')');

  // ---- Installationernas plats i rummet räknas av planlösningen (beslut 78) ----
  // En inläst installation bär ingen plats: filen har plan och rumsnummer och ingenting om
  // var i rummet apparaten sitter. Platsen räknas ur rummets rektangel, och tre släckare i
  // samma rum ska ligga på olika ställen – annars står de i varandra i modellen.
  const platser = await page.evaluate(() => {
    const b = {
      typ: 'kasern', namn: 'Provkasern',
      konstanter: { PLANHOJD: 3.5, BJALKLAG: 0.2, FRIHOJD: 3.3 },
      stil: { tak: 'platt' },
      plan: [{ id: '01', namn: 'Entréplan' }],
      rum: [
        { nr: '001', namn: 'Korridor', plan: '01', rumstyp: 'korridor', nta: 96 },
        { nr: '002', namn: 'Logement 1:1', plan: '01', rumstyp: 'logement', nta: 36 }
      ],
      installationer: [
        { id: 'a', typ: 'handbrandslackare', rum: '01-002', benamning: 'A', signifikant: true },
        { id: 'b', typ: 'handbrandslackare', rum: '01-002', benamning: 'B', signifikant: true },
        { id: 'c', typ: 'luftbehandlingsaggregat', rum: '01-002', benamning: 'C', signifikant: true },
        // Ett rum som inte finns: installationen kan inte placeras och ska inte följa med
        { id: 'd', typ: 'handbrandslackare', rum: '09-009', benamning: 'D', signifikant: true }
      ]
    };
    const form = DP.Planlosning.form(b);
    const sig = form.installationer.filter(i => i.signifikant);
    const rum2 = form.rum.filter(r => r.nr === '002')[0];
    return {
      antal: sig.length,
      idn: sig.map(i => i.id).join(' '),
      punkter: sig.map(i => ({ id: i.id, x: Math.round(i.x * 100) / 100, z: i.z, h: i.h })),
      rect: rum2.rect,
      // De övriga genereras ur rumstypen (berättelse 57)
      ovriga: form.installationer.filter(i => !i.signifikant).length,
      ovrigaTyper: form.installationer.filter(i => !i.signifikant)
        .map(i => i.typ).filter((v, i2, a) => a.indexOf(v) === i2).sort().join(' ')
    };
  });
  kontroll(platser.antal === 3 && platser.idn === 'a b c',
    'en installation i ett rum som inte finns tas inte med i formen (' + platser.idn + ')');
  kontroll(platser.punkter.every(p => p.x > platser.rect[0] && p.x < platser.rect[2]),
    'installationerna ligger inom sitt rums rektangel ('
    + platser.punkter.map(p => p.id + ':' + p.x).join(' ') + ' i ' + platser.rect.join(',') + ')');
  kontroll(new Set(platser.punkter.map(p => p.x)).size === 3,
    'tre installationer i samma rum ligger på olika ställen, inte i varandra ('
    + platser.punkter.map(p => p.x).join(' ') + ')');
  kontroll(platser.punkter.filter(p => p.id === 'a')[0].h > 0
    && platser.punkter.filter(p => p.id === 'c')[0].h === 0,
    'en väggmonterad installation hamnar på vägghöjd och en golvstående på golvet (beslut 78)');
  kontroll(platser.ovriga > 0 && /lysrorsarmatur/.test(platser.ovrigaTyper),
    'de övriga installationerna genereras ur rummen (' + platser.ovriga + ' st: '
    + platser.ovrigaTyper + ', berättelse 57)');
  // De handritade byggnaderna bär sina egna övriga i `data/` och ska inte få dem i dubbel
  // uppsättning (beslut 101).
  const ritad = await page.evaluate(() => {
    const b = DP.Plan.byggnad('kasern1');
    const form = DP.Planlosning.form(b);
    return { fore: b.installationer.length, efter: form.installationer.length };
  });
  kontroll(ritad.fore === ritad.efter,
    'en handritad byggnad får inga genererade övriga ovanpå sina egna (' + ritad.fore + ' → '
    + ritad.efter + ', beslut 101)');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// Inläsningsfilen genom hela sidan: ta ut en tom fil, fylla i den utanför appen, läsa in den
// via filväljaren, godta förslagen, placera det oplacerade, ångra – och ta ut filen igen med
// planen ifyllda (biljett #36, berättelse 14–20, 23–25, 27–28 och 30).
//
// Det som prövas är planerarens hela väg: filen är en riktig .xlsx skriven utanför appen, och
// resultatet läses i byggnadsdatan där planen bor. Går tur-och-retur sönder märks det först
// när någon skickar en fil till fastighetssystemet och den inte går att läsa tillbaka.
async function testInlasningsfilenPlan(browser) {
  console.log('Inläsningsfilen med fliken Plan (beslut 70, 83, 89, 105 och 112)');
  const page = await nySida(browser, URL_INDEX);
  kontroll(await page.evaluate(() => DP.Inlasningsfil.tillganglig()),
    'Excel-biblioteket är laddat i sidan');
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const bf = page.locator('#byggnadsflode');

  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('.val[data-typ="kasern"]').click();
  await bf.locator('input[data-falt="namn"]').fill('Kasern 4');
  await bf.locator('button', { hasText: 'Skapa byggnad' }).click();
  await vanta(page, () => DP.Plan.byggnad().namn === 'Kasern 4', 'byggnaden skapad');

  // ---- Ta ut en tom inläsningsfil (berättelse 14) ----
  const tom = await taUtFil(page, 'inlasningsfil-tom.xlsx');
  const tomtArk = lasArkFil(tom.fil);
  kontroll(/Kasern-4/.test(tom.namn),
    'filnamnet bär byggnadens namn, så tre filer går att skilja åt (' + tom.namn + ')');
  kontroll(Object.keys(tomtArk).join(',') === 'Plan,Rum,Installationer',
    'den tomma filen har alla tre flikarna (' + Object.keys(tomtArk).join(',') + ')');
  kontroll((tomtArk.Plan[0] || []).join(',') === 'Plan,Benämning',
    'fliken Plan har kolumnerna Plan och Benämning (' + (tomtArk.Plan[0] || []).join(',') + ')');
  kontroll(tomtArk.Plan.length === 1,
    'den tomma filen har bara rubrikraden i Plan (' + tomtArk.Plan.length + ' rader)');
  kontroll((tomtArk.Rum[0] || []).indexOf('Rumstyp') >= 0
    && (tomtArk.Installationer[0] || []).indexOf('Installationstyp') >= 0,
    'Rumstyp och Installationstyp är med som kolumner (beslut 109)');

  // ---- Fyll i Plan-fliken utanför appen, som någon annan hade gjort ----
  // Skrivsätten är med flit olika: P1, 01, 1 och "Plan 3" är alla sätt planen skrivs i
  // fastighetssystemet, en källare och en rad utan beteckning finns med, och en egen kolumn
  // som systemet inte känner till (beslut 89). Rubrikraden ligger under en tabellrubrik och en
  // tom rad, som i en fil som gått via Numbers (berättelse 19).
  const ifylld = skrivArk('inlasningsfil-ifylld.xlsx', {
    Plan: [
      ['Plan'],
      [],
      ['Plan', 'Benämning', 'Kapacitet'],
      ['01', 'Entréplan', '40 pers'],
      [],
      ['P1', ''],
      ['1', 'Andra planet'],
      ['Plan 3', ''],
      ['K1', 'Källarplan'],
      ['', 'Rad utan beteckning']
    ],
    Rum: [['Plan', 'Rum', 'Benämning', 'NTA'], ['01', '001', 'Korridor', '80']],
    Installationer: [['Plan', 'Rum', 'Benämning', 'Fabrikat', 'Id'],
      ['01', '001', 'Handbrandsläckare 3', 'Dafo', '0001']]
  });
  await lasInFil(page, ifylld);

  const inlast = await page.evaluate(() => {
    const st = DP.Plan.inlasningStatus('plan');
    return {
      raknat: st.raknat, klar: st.klar, fil: st.fil && st.fil.namn,
      plan: DP.Plan.byggnad().plan.map(p => p.id),
      forslag: st.grupper.forslag.map(r => r.falt.id),
      skal: st.grupper.forslag.map(r => r.fragor.map(f => f.text).join(' ')),
      oplacerade: st.grupper.oplacerad.length,
      oplaceratSkal: (st.grupper.oplacerad[0] || { fragor: [] }).fragor.map(f => f.text).join(' '),
      historik: DP.Plan.historik().lista.slice(-1)[0],
      steg2: DP.Plan.byggnadsSteg()[2],
      // Modellen visar bara det som är klart (berättelse 55): skal på de plan som ännu
      // inte har rum. Plan 01 fick fliken Rums enda rad och är därför inte skal längre.
      skal3d: DP.viewer.b.rum.filter(r => r.skal).length,
      skalPlan: DP.viewer.b.rum.filter(r => r.skal).map(r => r.plan).join(' '),
      // Förslag och oplacerat ligger fast överst (beslut 112)
      sticky: (() => {
        const n = document.querySelector('#byggnadsflode .bf-oppet');
        return n ? getComputedStyle(n).position : null;
      })(),
      rader: document.querySelectorAll('#byggnadsflode .bf-inlrad').length
    };
  });
  kontroll(inlast.raknat.klar === 3 && inlast.raknat.forslag === 2 && inlast.raknat.oplacerad === 1,
    'raderna delas i klart, förslag och oplacerat (' + JSON.stringify(inlast.raknat) + ')');
  kontroll(inlast.plan.join(' ') === 'K1 01 1',
    'de klara planen förs in i byggnaden i föreslagen ordning nedifrån och upp (' + inlast.plan.join(' ') + ')');
  kontroll(inlast.forslag.join(' ') === 'P1 Plan 3',
    'planen utan benämning blir förslag (' + inlast.forslag.join(' ') + ')');
  kontroll(inlast.skal.some(s => /saknar benämning/.test(s)),
    'förslagets skäl står i klartext ("' + inlast.skal[0] + '", berättelse 24)');
  kontroll(inlast.oplacerade === 1 && /ingen beteckning/.test(inlast.oplaceratSkal),
    'raden utan beteckning är oplacerad och säger varför ("' + inlast.oplaceratSkal + '")');
  kontroll(/läs in inlasningsfil-ifylld\.xlsx/.test(inlast.historik),
    'inläsningen är ett steg i historiken med text i klartext ("' + inlast.historik + '")');
  kontroll(inlast.steg2 === false,
    'steg 2 får ingen bock så länge förslag och oplacerat ligger kvar (beslut 83 och berättelse 30)');
  kontroll(inlast.skal3d === 2 && !/\b01\b/.test(inlast.skalPlan),
    'modellen visar bara de klara planen, och plan 01 är inget skal längre när dess rum ' +
    'lästes in (' + inlast.skal3d + ' skal: ' + inlast.skalPlan + ', berättelse 55)');
  kontroll(inlast.sticky === 'sticky',
    'förslag och oplacerat är satt att ligga fast överst (' + inlast.sticky + ', beslut 112)');
  // Att CSS-egenskapen är satt säger bara att någon skrev den. Det som ska hålla är att
  // gruppen **stannar** när listan rullas förbi den – en förälder med overflow någonstans i
  // kedjan hade tagit bort klistringen utan att egenskapen ändrades.
  const klistrar = await page.evaluate(() => {
    const panel = document.getElementById('hs-byggnad');
    const o = document.querySelector('#byggnadsflode .bf-oppet');
    const fore = o.getBoundingClientRect().top;
    const panelTop = panel.getBoundingClientRect().top;
    // Rulla precis förbi gruppens egen plats i listan
    panel.scrollTop = Math.round(fore - panelTop) + 40;
    const efter = o.getBoundingClientRect().top;
    panel.scrollTop = 0;
    return { fore, efter, panelTop, utanKlister: fore - (Math.round(fore - panelTop) + 40) };
  });
  kontroll(klistrar.efter > klistrar.utanKlister + 10 && klistrar.efter >= klistrar.panelTop,
    'gruppen stannar överst när listan rullas förbi den (hade legat på '
    + Math.round(klistrar.utanKlister) + ', ligger på ' + Math.round(klistrar.efter)
    + ', panelens topp ' + Math.round(klistrar.panelTop) + ')');
  await bild(page, 'byggnad-steg2-inlasning');

  // ---- Rullningen står kvar när något godtas (beslut 105) ----
  // Panelen måste faktiskt gå att rulla för att kontrollen ska säga något: en panel som redan
  // rymmer allt har scrollTop 0 både före och efter, och då hade kontrollen varit grön utan
  // att ha prövat någonting.
  const skroll = await page.evaluate(() => {
    const panel = document.getElementById('hs-byggnad');
    panel.scrollTop = 150;
    return { satt: panel.scrollTop, kanRullas: panel.scrollHeight > panel.clientHeight };
  });
  kontroll(skroll.kanRullas && skroll.satt > 0,
    'panelen går att rulla med inläsningen öppen, så löftet om rullningen går att pröva ('
    + skroll.satt + ')');
  const foreGodta = await historiklangd(page);
  await bf.locator('.bf-inlrad.forslag').first().locator('button', { hasText: 'Godta' }).click();
  await stegKlart(page, foreGodta, 'godta ett förslag');
  const ettGodtaget = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('plan').raknat,
    plan: DP.Plan.byggnad().plan.map(p => p.id + ':' + p.namn),
    historik: DP.Plan.historik().lista.slice(-1)[0],
    skroll: document.getElementById('hs-byggnad').scrollTop
  }));
  kontroll(ettGodtaget.raknat.forslag === 1 && ettGodtaget.raknat.klar === 4,
    'ett godtaget förslag blir klart och flyttas till byggnaden (' + JSON.stringify(ettGodtaget.raknat) + ')');
  kontroll(ettGodtaget.plan.some(p => p === 'P1:Plan P1'),
    'planet fick förslagets benämning (' + ettGodtaget.plan.join(' | ') + ')');
  kontroll(/godta förslag: plan P1/.test(ettGodtaget.historik),
    'varje godtagande är ett eget steg i historiken ("' + ettGodtaget.historik + '")');
  kontroll(ettGodtaget.skroll === skroll.satt,
    'rullningen står kvar när ett förslag godtas (' + skroll.satt + ' → ' + ettGodtaget.skroll
    + ', beslut 105)');

  // ---- Godta alla: ett steg, och ett ångra tar tillbaka hela godtagandet ----
  const foreAlla = await historiklangd(page);
  await bf.locator('button', { hasText: 'Godta alla' }).click();
  await stegKlart(page, foreAlla, 'Godta alla');
  const allaGodtagna = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('plan').raknat,
    antal: DP.Plan.byggnad().plan.length,
    historik: DP.Plan.historik().lista.slice(-1)[0],
    steg2: DP.Plan.byggnadsSteg()[2]
  }));
  kontroll(allaGodtagna.raknat.forslag === 0 && allaGodtagna.antal === 5,
    'Godta alla för in alla förslag på en gång (' + allaGodtagna.antal + ' plan)');
  kontroll(/godta alla 1 förslag i Plan/.test(allaGodtagna.historik),
    'Godta alla är **ett** steg i historiken ("' + allaGodtagna.historik + '")');
  kontroll(allaGodtagna.steg2 === false,
    'bocken dröjer så länge den oplacerade raden ligger kvar');

  await angra(page);
  const angrat = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('plan').raknat,
    antal: DP.Plan.byggnad().plan.length
  }));
  kontroll(angrat.raknat.forslag === 1 && angrat.antal === 4,
    'ett ångra tar tillbaka hela godtagandet (' + angrat.antal + ' plan, '
    + angrat.raknat.forslag + ' förslag igen)');
  await gorOm(page);
  kontroll(await page.evaluate(() => DP.Plan.byggnad().plan.length) === 5,
    'gör om lägger tillbaka dem');

  // ---- Den oplacerade raden placeras: steget blir grönt (berättelse 30) ----
  const forePlacera = await historiklangd(page);
  const oplacerad = bf.locator('.bf-inlrad.oplacerad').first();
  // Knappen är utgråad så länge fältet är tomt: ett klick som inte gör någonting tolkar
  // planeraren som att systemet gick sönder, inte som att hon glömt fylla i.
  kontroll(await oplacerad.locator('button', { hasText: 'Placera' }).isDisabled(),
    'Placera är utgråad med tomt fält, och säger varför i sin titel');
  // Sedan en beteckning som redan finns: beskedet ska komma medan planeraren skriver, som i
  // steg 1 och i fältet för ett nytt plan.
  await oplacerad.locator('input').fill('01');
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-inlrad.oplacerad .bf-fel'),
    'beskedet om en upptagen beteckning');
  kontroll(await bf.locator('.bf-inlrad.oplacerad .bf-fel').count() === 1,
    'en beteckning som redan finns ger ett besked i klartext innan hon trycker');
  await bf.locator('.bf-inlrad.oplacerad input').fill('04');
  await bf.locator('.bf-inlrad.oplacerad').locator('button', { hasText: 'Placera' }).click();
  await stegKlart(page, forePlacera, 'placera den oplacerade raden');
  const placerat = await page.evaluate(() => ({
    st: DP.Plan.inlasningStatus('plan'),
    plan: DP.Plan.byggnad().plan.map(p => p.id + ':' + p.namn),
    steg2: DP.Plan.byggnadsSteg()[2],
    status: DP.Plan.byggnadStatus()
  }));
  kontroll(placerat.st.raknat.oplacerad === 0 && placerat.st.klar === true,
    'den placerade raden är inte längre oplacerad');
  kontroll(placerat.plan.some(p => /^04:/.test(p)),
    'raden blev ett plan med den beteckning planeraren gav (' + placerat.plan.join(' | ') + ')');
  kontroll(placerat.plan.some(p => p === '04:Rad utan beteckning'),
    'benämningen från filen följde med (' + placerat.plan.join(' | ') + ')');
  kontroll(placerat.steg2 === true,
    'steg 2 får grön bock när bara klart återstår (beslut 83 och berättelse 30)');
  await bild(page, 'byggnad-steg2-gront');

  // ---- Ta ut filen igen, nu ifylld, och läs in den tur och retur (berättelse 17) ----
  const igen = await taUtFil(page, 'inlasningsfil-ifylld-ut.xlsx');
  const utArk = lasArkFil(igen.fil);
  const planFore = await page.evaluate(() => DP.Plan.byggnad().plan.map(p => p.id + '|' + p.namn));
  kontroll(utArk.Plan.length === 7,
    'filen tas ut med alla sex planen ifyllda (' + (utArk.Plan.length - 1) + ' rader)');
  kontroll((utArk.Plan[0] || []).join(',') === 'Plan,Benämning,Kapacitet',
    'den egna kolumnen följer med ut igen (' + (utArk.Plan[0] || []).join(',') + ', beslut 89)');
  kontroll(utArk.Plan.some(r => r[0] === '01' && r[2] === '40 pers'),
    'det egna fältets värde följer med ut igen');
  kontroll(utArk.Plan.some(r => r[0] === 'K1') && utArk.Plan.some(r => r[0] === 'Plan 3'),
    'beteckningarna står kvar precis som i filen (beslut 77)');

  const foreRetur = await historiklangd(page);
  await lasInFil(page, igen.fil);
  await vanta(page, n => DP.Plan.historik().lista.length > n, 'inläsningen tur och retur', foreRetur);
  const retur = await page.evaluate(() => ({
    plan: DP.Plan.byggnad().plan.map(p => p.id + '|' + p.namn),
    st: DP.Plan.inlasningStatus('plan'),
    steg2: DP.Plan.byggnadsSteg()[2]
  }));
  kontroll(retur.plan.join(' ') === planFore.join(' '),
    'filen läses in tur och retur utan skillnad (' + retur.plan.join(' ') + ')');
  kontroll(retur.st.raknat.forslag === 0 && retur.st.raknat.oplacerad === 0 && retur.steg2 === true,
    'ingenting nytt att ta ställning till: alla plan fanns redan (beslut 86)');
  // Gruppen *klart* ska räkna de plan filen bar, också de som redan fanns. Räknades bara de
  // nya hade planeraren som läser in sin ifyllda fil en gång till fått "0 plan klara" om en
  // byggnad full av plan, och trott att filen inte gick fram.
  kontroll(retur.st.raknat.klar === 6,
    'alla sex planen räknas som klara också andra gången filen läses in ('
    + retur.st.raknat.klar + ')');

  // ---- En fil som inte är inläsningsfilen säger varför ----
  const frammande = skrivArk('inte-inlasningsfilen.xlsx', {
    Anteckningar: [['Fyllt i av', 'Nisse'], ['Datum', '2026-11-20']]
  });
  await bf.locator('input[data-falt="filval"]').setInputFiles(frammande);
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-fil .bf-fel'),
    'beskedet om en fil utan kända rubriker');
  const besked = await page.evaluate(() =>
    (document.querySelector('#byggnadsflode .bf-fil .bf-fel') || {}).textContent || '');
  kontroll(/kolumnrubriker/.test(besked),
    'en fil utan kända rubriker säger varför den inte gick att läsa ("' + besked.slice(0, 70) + '…")');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}


// Steget Rum genom hela sidan: läs in fliken Rum, godta förslagen, svara på det oplacerade,
// se rummen växa fram i modellen och ta ut filen igen (biljett #37, berättelse 21, 36, 39–42,
// 51 och 55).
//
// Det som prövas är planerarens hela väg med en riktig .xlsx skriven utanför appen. Går
// matchningen eller placeringen fel ser hon en byggnad där rummen står i varandra, och det
// märks först när någon försöker lägga in en riktig byggnad.
async function testStegRum(browser) {
  console.log('Steget Rum från inläsningsfilen och rummen i modellen (beslut 76–80, 110 och 111)');
  const page = await nySida(browser, URL_INDEX);
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const bf = page.locator('#byggnadsflode');

  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('.val[data-typ="kasern"]').click();
  await bf.locator('input[data-falt="namn"]').fill('Kasern 5');
  await bf.locator('button', { hasText: 'Skapa byggnad' }).click();
  await vanta(page, () => DP.Plan.byggnad().namn === 'Kasern 5', 'byggnaden skapad');

  // ---- En fil med plan och rum i samma inläsning (berättelse 16) ----
  // Skrivsätten är med flit olika, som i fastighetssystemet: planen 00, 01 och 02, rummen
  // med och utan inledande nollor, en benämning systemet inte känner igen, ett rum utan NTA,
  // ett rum med NTV som ska bli högt och ett rum på ett plan som inte finns.
  // Steg 3 öppnas innan filen läses in: det är där planeraren står när hon fyller i rummen,
  // och steglistan är hennes väg dit. Filraden finns i både steg 2 och 3 – det är **en** fil
  // med tre flikar (beslut 70).
  await bf.locator('.steg-kort[data-bsteg="3"] .steg-huvud').click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="3"].oppen'),
    'steg 3 öppet');

  const fil = skrivArk('rum-ifylld.xlsx', {
    Plan: [
      ['Plan', 'Benämning'],
      ['00', 'Källarplan'],
      ['01', 'Entréplan'],
      ['02', 'Plan 2']
    ],
    Rum: [
      ['Plan', 'Rum', 'Benämning', 'Rumstyp', 'NTA', 'NTV', 'BRA', 'BTA', 'Temperaturreglerad', 'Kommentar'],
      // Klara: exakt plan, tresiffriga nummer, kända benämningar, NTA ifylld
      ['01', '001', 'Korridor', '', '96', '', '', '', 'Ja', ''],
      ['01', '002', 'Entré', '', '48', '', '', '', 'Ja', 'Ny dörr'],
      ['01', '003', 'Logement 1:1', '', '36', '', '', '', 'Ja', ''],
      ['01', '004', 'Logement 1:2', '', '36', '', '', '', 'Ja', ''],
      // Högt rum: NTV ÷ NTA ger 10 m (beslut 79, berättelse 41)
      ['00', '001', 'Fläktrum', '', '40', '400', '44', '48', 'Nej', ''],
      // Förslag: planet skrivet P2 och numret utan nollor
      ['P2', '1', 'Korridor', '', '96', '', '', '', 'Ja', ''],
      // Förslag: benämningen känns inte igen – Övrigt rum (beslut 80)
      ['02', '002', 'Gillestuga', '', '60', '', '', '', 'Ja', ''],
      // Förslag: NTA saknas – rumstypens standardvärde (beslut 79)
      ['02', '003', 'WC/D', '', '', '', '', '', 'Ja', ''],
      // Oplacerad: plan 07 finns inte (berättelse 37)
      ['07', '001', 'Vindsförråd', '', '20', '', '', '', 'Nej', '']
    ],
    Installationer: [['Plan', 'Rum', 'Benämning', 'Fabrikat', 'Id'],
      ['01', '001', 'Handbrandsläckare 3', 'Dafo', '0001']]
  });
  await lasInFil(page, fil);

  // Planen kom in i samma inläsning, och rummen matchades mot dem: ett rum på plan 01 ska
  // inte bli oplacerat bara för att plan 01 kom i samma fil.
  const inlast = await page.evaluate(() => {
    const st = DP.Plan.inlasningStatus('rum');
    return {
      raknat: st.raknat,
      plan: DP.Plan.byggnad().plan.map(p => p.id),
      rum: DP.Plan.byggnad().rum.map(r => DP.rumNyckel(r.plan, r.nr) + ':' + r.namn),
      forslag: st.grupper.forslag.map(r => r.falt.namn || '(utan namn)'),
      skal: st.grupper.forslag.map(r => r.fragor.map(f => f.text).join(' ')),
      oplacerade: st.grupper.oplacerad.length,
      oplaceratSkal: (st.grupper.oplacerad[0] || { fragor: [] }).fragor.map(f => f.text).join(' '),
      historik: DP.Plan.historik().lista.slice(-1)[0],
      steg: DP.Plan.byggnadsSteg(),
      // Modellen visar bara det som är klart (berättelse 55): plan 01 och 00 har rum,
      // plan 02 är fortfarande skal eftersom dess rum alla är förslag.
      skalPlan: DP.viewer.b.rum.filter(r => r.skal).map(r => r.plan).join(' '),
      // Rummen i modellen har rektanglar regeln räknat fram (beslut 78)
      modellRum: DP.viewer.b.rum.filter(r => !r.skal).length,
      // Och ett rum med stor NTV är högt (berättelse 41)
      flakthojd: (DP.viewer.b.rum.filter(r => r.namn === 'Fläktrum')[0] || {}).hojd
    };
  });
  kontroll(inlast.plan.join(' ') === '00 01 02',
    'planen kom in i samma inläsning (' + inlast.plan.join(' ') + ')');
  kontroll(inlast.raknat.klar === 5 && inlast.raknat.forslag === 3 && inlast.raknat.oplacerad === 1,
    'rumsraderna delas i klart, förslag och oplacerat (' + JSON.stringify(inlast.raknat) + ')');
  kontroll(inlast.rum.length === 5 && inlast.rum.some(r => /^01-001:Korridor/.test(r)),
    'de klara rummen förs in i byggnaden (' + inlast.rum.join(' | ') + ')');
  kontroll(inlast.skal.some(s => /P2 tolkas som plan 02/.test(s)),
    'planet P2 matchas förlåtande och säger det i klartext ("'
    + inlast.skal.filter(s => /P2/.test(s))[0] + '", beslut 77)');
  kontroll(inlast.skal.some(s => /Gillestuga känns inte igen/.test(s)),
    'en okänd benämning blir förslaget Övrigt rum och säger varför (beslut 80)');
  kontroll(inlast.skal.some(s => /saknar NTA/.test(s)),
    'ett rum utan NTA får rumstypens standardvärde som förslag (beslut 79)');
  kontroll(inlast.oplacerade === 1 && /inget plan 07/.test(inlast.oplaceratSkal),
    'rummet på ett plan som inte finns är oplacerat ("' + inlast.oplaceratSkal + '")');
  kontroll(/läs in rum-ifylld\.xlsx/.test(inlast.historik),
    'hela filen – plan och rum – är **ett** steg i historiken ("' + inlast.historik + '")');
  kontroll(inlast.steg[2] === true && inlast.steg[3] === false,
    'steg 2 är grönt men steg 3 inte: förslag och oplacerat ligger kvar (beslut 83)');
  kontroll(inlast.skalPlan === '02',
    'modellen visar rummen på de plan som har klara rum, och skal på plan 02 där allt är '
    + 'förslag (' + inlast.skalPlan + ', berättelse 55)');
  kontroll(inlast.modellRum === 5,
    'rummen ritas i modellen med rektanglar regeln räknat fram (' + inlast.modellRum + ')');
  kontroll(inlast.flakthojd === 10,
    'ett rum med stor NTV blir högt: 400 ÷ 40 = 10 m (' + inlast.flakthojd + ' m, berättelse 41)');
  await bild(page, 'byggnad-steg3-rum');

  // ---- Rummen ligger i nummerordning medurs i modellen (beslut 78) ----
  const ordning = await page.evaluate(() => {
    const pa = DP.viewer.b.rum.filter(r => r.plan === '01' && !r.skal)
      .map(r => ({ nr: r.nr, x0: Math.round(r.rect[0] * 10) / 10, z0: r.rect[1], z1: r.rect[3] }));
    function overlappar(a, b) {
      return a.rect[0] < b.rect[2] - 0.001 && b.rect[0] < a.rect[2] - 0.001
        && a.rect[1] < b.rect[3] - 0.001 && b.rect[1] < a.rect[3] - 0.001;
    }
    const alla = DP.viewer.b.rum.filter(r => r.plan === '01' && !r.skal);
    const krockar = [];
    alla.forEach((a, i) => alla.slice(i + 1).forEach(b => {
      if (overlappar(a, b)) { krockar.push(a.nr + '/' + b.nr); }
    }));
    return { pa, krockar };
  });
  kontroll(ordning.krockar.length === 0,
    'rummen på plan 01 överlappar inte i modellen (' + (ordning.krockar.join(' ') || 'inga krockar') + ')');
  kontroll(ordning.pa.length === 4,
    'alla fyra rummen på plan 01 ligger i modellen (' + ordning.pa.map(r => r.nr).join(' ') + ')');

  // ---- Godta alla: ett steg, och plan 02 slutar vara skal ----
  const foreAlla = await historiklangd(page);
  await bf.locator('button', { hasText: 'Godta alla' }).click();
  await stegKlart(page, foreAlla, 'Godta alla i Rum');
  const godtagna = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('rum').raknat,
    rum: DP.Plan.byggnad().rum.map(r => DP.rumNyckel(r.plan, r.nr)),
    // Numret 1 fylldes ut till 001 och rummet hamnade på plan 02
    plan02: DP.Plan.byggnad().rum.filter(r => r.plan === '02').map(r => r.nr + ':' + r.namn),
    // Rumstypen Övrigt rum fördes in
    ovrigt: (DP.Plan.byggnad().rum.filter(r => r.namn === 'Gillestuga')[0] || {}).rumstyp,
    // NTA-förslaget fördes in
    wcNta: (DP.Plan.byggnad().rum.filter(r => r.namn === 'WC/D')[0] || {}).nta,
    historik: DP.Plan.historik().lista.slice(-1)[0],
    skalPlan: DP.viewer.b.rum.filter(r => r.skal).map(r => r.plan).join(' '),
    steg3: DP.Plan.byggnadsSteg()[3]
  }));
  kontroll(godtagna.raknat.forslag === 0 && godtagna.rum.length === 8,
    'Godta alla för in de tre förslagen på en gång (' + godtagna.rum.length + ' rum)');
  kontroll(godtagna.plan02.some(r => /^001:Korridor/.test(r)),
    'rumsnumret 1 fylldes ut till 001 och rummet hamnade på plan 02 (' + godtagna.plan02.join(' | ') + ')');
  kontroll(godtagna.ovrigt === 'ovrigt',
    'det okända rummet fick rumstypen Övrigt rum (' + godtagna.ovrigt + ')');
  kontroll(godtagna.wcNta > 0,
    'rummet utan NTA fick rumstypens standardvärde (' + godtagna.wcNta + ' m²)');
  kontroll(/godta alla 3 förslag i Rum/.test(godtagna.historik),
    'Godta alla är **ett** steg i historiken ("' + godtagna.historik + '")');
  kontroll(godtagna.skalPlan === '',
    'plan 02 är inget skal längre när dess rum kom in (' + (godtagna.skalPlan || 'inga skal') + ')');
  kontroll(godtagna.steg3 === false,
    'bocken dröjer så länge den oplacerade raden ligger kvar (berättelse 30)');

  await angra(page);
  const angrat = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('rum').raknat,
    antal: DP.Plan.byggnad().rum.length
  }));
  kontroll(angrat.raknat.forslag === 3 && angrat.antal === 5,
    'ett ångra tar tillbaka hela godtagandet (' + angrat.antal + ' rum, '
    + angrat.raknat.forslag + ' förslag igen)');
  await gorOm(page);
  kontroll(await page.evaluate(() => DP.Plan.byggnad().rum.length) === 8,
    'gör om lägger tillbaka dem');

  // ---- Det oplacerade rummet dras till rätt plan, och numret krockar (beslut 110) ----
  // Vindsförrådet var 07-001 i filen. Planet 07 finns inte, så planeraren väljer plan 02 –
  // där 001 redan är taget av korridoren, och då ska systemet föreslå nästa lediga nummer.
  const forePlacera = await historiklangd(page);
  const oplacerad = bf.locator('.bf-inlrad.oplacerad').first();
  await oplacerad.locator('button', { hasText: '02 Plan 2' }).click();
  await stegKlart(page, forePlacera, 'välja plan för det oplacerade rummet');
  const placerat = await page.evaluate(() => {
    const st = DP.Plan.inlasningStatus('rum');
    return {
      raknat: st.raknat,
      // Numret krockade: raden står kvar som förslag med nästa lediga nummer
      forslagSkal: st.grupper.forslag.map(r => r.fragor.map(f => f.text).join(' ')).join(' | '),
      nyttNr: (st.grupper.forslag[0] || { fragor: [] }).fragor
        .filter(f => f.slag === 'nr').map(f => f.forslag).join(''),
      historik: DP.Plan.historik().lista.slice(-1)[0]
    };
  });
  kontroll(placerat.raknat.oplacerad === 0,
    'rummet är inte längre oplacerat när planeraren valt plan');
  kontroll(/redan ett rum 02-001/.test(placerat.forslagSkal) && placerat.nyttNr === '004',
    'numret krockade, och nästa lediga nummer på planet föreslås ("' + placerat.forslagSkal
    + '", beslut 110)');
  kontroll(/plan 02/.test(placerat.historik),
    'svaret är ett steg i historiken med text i klartext ("' + placerat.historik + '")');

  // Godta det nya numret: steget blir grönt (berättelse 30)
  const foreSista = await historiklangd(page);
  await bf.locator('.bf-inlrad.forslag').first().locator('button', { hasText: 'Godta' }).click();
  await stegKlart(page, foreSista, 'godta det nya rumsnumret');
  const gront = await page.evaluate(() => ({
    st: DP.Plan.inlasningStatus('rum'),
    rum: DP.Plan.byggnad().rum.map(r => DP.rumNyckel(r.plan, r.nr)),
    steg3: DP.Plan.byggnadsSteg()[3],
    status: DP.Plan.byggnadStatus(),
    // Areasummorna per plan och byggnad (beslut 79)
    rumSt: DP.Plan.rumStatus(),
    // Det planeraren faktiskt läser i summaraden: märkningen ska stå i vyn och inte bara
    // i `rumStatus`, annars är talet omärkt där det räknas.
    summa: Array.prototype.map.call(document.querySelectorAll('#byggnadsflode .bf-summafalt'),
      f => f.querySelector('.etikett').textContent + '=' + f.querySelector('.varde').textContent),
    planareor: Array.prototype.map.call(document.querySelectorAll('#byggnadsflode .bf-planareor'),
      f => f.textContent)
  }));
  kontroll(gront.st.klar === true && gront.steg3 === true,
    'steg 3 får grön bock när bara klart återstår (beslut 83 och berättelse 30)');
  kontroll(gront.rum.indexOf('02-004') >= 0,
    'rummet hamnade på 02-004, numret systemet föreslog (' + gront.rum.join(' ') + ')');
  kontroll(gront.rumSt.nta > 0 && gront.rumSt.plan.length === 3,
    'NTA summeras per plan och byggnad (' + gront.rumSt.nta + ' m² på '
    + gront.rumSt.plan.length + ' plan, beslut 79)');
  // BRA och BTA summeras inte ur **hälften** av rummen: ett tal som är hälften av den
  // verkliga arean är värre än inget tal. Här saknar de flesta rummen BRA, så arean räknas
  // i stället fram ur modellen och märks *beräknad* (beslut 79, berättelse 43).
  const p02 = gront.rumSt.plan.filter(p => p.id === '02')[0];
  const p00 = gront.rumSt.plan.filter(p => p.id === '00')[0];
  kontroll(p02.bra > p02.nta && p02.braBeraknad === true,
    'BRA räknas ur modellen och märks beräknad när rummen saknar den (' + p02.bra
    + ' m² mot NTA ' + p02.nta + ' m², beslut 79)');
  kontroll(p02.bta > p02.bra && p02.btaBeraknad === true,
    'BTA är modellens yta utanför ytterväggarna och alltså större än BRA ('
    + p02.bta + ' > ' + p02.bra + ')');
  // Fläktrummet på plan 00 har BRA och BTA i filen: då är talet fastighetssystemets och
  // märks inte, också när grannplanen räknas ur modellen.
  kontroll(p00.bra === 44 && !p00.braBeraknad,
    'ett plan vars rum har BRA i filen behåller sitt tal omärkt (' + p00.bra + ' m²)');
  // Plan 01 är kasernens korridorsplan: korridoren fyller remsan mellan rumsraderna och är
  // mindre än sin NTA, så modellens rektangel täcker inte rummen. Då är ett streck det
  // ärliga svaret – ett BRA under NTA är geometriskt omöjligt. Byggnadens summa faller med
  // planet, eftersom en summa som saknar ett plan är mindre än den verkliga.
  const p01 = gront.rumSt.plan.filter(p => p.id === '01')[0];
  kontroll(p01.bra === null && p01.bta === null,
    'ett plan där modellens rektangel inte täcker rummens NTA får inget beräknat tal ('
    + p01.bra + ', NTA ' + p01.nta + ' m²)');
  kontroll(gront.rumSt.bra === null && gront.rumSt.bta === null,
    'byggnadens summa faller när ett plan saknar tal (' + gront.rumSt.bra + ')');
  // Summaraden i vyn: NTA omärkt, och BRA och BTA som streck när de inte går att svara på.
  kontroll(gront.summa.some(t => /^NTA=/.test(t) && !/beräknad/.test(t)),
    'NTA står omärkt: den är rummens egen summa (' + gront.summa.join(' | ') + ')');
  kontroll(gront.summa.some(t => t === 'BRA=–') && gront.summa.some(t => t === 'BTA=–'),
    'summaraden visar ett streck när arean inte går att svara på ('
    + gront.summa.join(' | ') + ')');
  // Märkningen är **per plan**: planeraren ska se vilket plan som är systemets tal.
  kontroll(gront.planareor.some(t => /BRA .*beräknad/.test(t))
    && gront.planareor.some(t => /BRA 44 m²/.test(t) && !/BRA 44 m² beräknad/.test(t)),
    'areorna står per plan, märkta beräknad bara där systemet räknade ('
    + gront.planareor.join(' | ') + ')');
  // Filen bar också en rad i fliken Installationer, och den läses in i samma steg (beslut 70):
  // med alla fyra stegen gröna är byggnaden klar för Planering (berättelse 7 och 64).
  kontroll(/Klar för Planering/.test(gront.status),
    'byggnaden är klar för Planering när alla fyra stegen är gröna (' + gront.status + ')');
  await bild(page, 'byggnad-steg3-gront');

  // ---- Rumstypen går att byta med ett klick (beslut 80) ----
  const foreTyp = await historiklangd(page);
  const rad = bf.locator('.bf-rumrad', { hasText: 'Gillestuga' }).first();
  await rad.locator('button', { hasText: 'Byt typ' }).click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-typval'), 'typvalet');
  await bf.locator('.bf-typval button', { hasText: 'Dagrum' }).first().click();
  await stegKlart(page, foreTyp, 'byta rumstyp');
  const bytt = await page.evaluate(() => {
    const r = DP.Plan.byggnad().rum.filter(x => x.namn === 'Gillestuga')[0];
    return { rumstyp: r.rumstyp, typ: r.typ, historik: DP.Plan.historik().lista.slice(-1)[0] };
  });
  kontroll(bytt.rumstyp === 'dagrum' && bytt.typ === 'personal',
    'rumstypen byts med ett klick, och modellens sort följer med (' + bytt.rumstyp + '/'
    + bytt.typ + ', beslut 80)');
  kontroll(/byt rumstyp/.test(bytt.historik),
    'bytet är ett steg i historiken ("' + bytt.historik + '")');

  // ---- Dra om rummens ordning på ett plan (berättelse 44, beslut 78 och 106) ----
  // Ordningen *är* placeringen i modellen: regeln lägger rummen medurs i listans ordning, så
  // ett drag i listan ska byta rummens grannar i 3D-vyn. Draget går genom musen och inte
  // genom koden – det är linjen och släppet planeraren använder.
  const fore01 = await page.evaluate(() => ({
    lista: DP.Plan.rumStatus().plan.filter(p => p.id === '01')[0].rum.map(r => r.nyckel),
    // Var rummen ligger i modellen, så att testet kan visa att de bytte plats
    x: DP.viewer.b.rum.filter(r => r.plan === '01' && !r.skal)
      .map(r => r.nr + '@' + Math.round(r.rect[0] * 10) / 10)
  }));
  kontroll(fore01.lista.join(' ') === '01-001 01-002 01-003 01-004',
    'rummen på plan 01 ligger i nummerordning före draget (' + fore01.lista.join(' ') + ')');

  const kallaR = bf.locator('.bf-rumrad[data-rum="01-003"]');
  const malR = bf.locator('.bf-rumrad[data-rum="01-001"]');
  await malR.scrollIntoViewIfNeeded();
  await kallaR.scrollIntoViewIfNeeded();
  const kbR = await kallaR.boundingBox(), mbR = await malR.boundingBox();
  await page.mouse.move(kbR.x + kbR.width / 2, kbR.y + kbR.height / 2);
  await page.mouse.down();
  // Två rörelser: webbläsaren skickar dragover under vägen, och linjen ska följa med dit
  // pekaren är – inte fastna där den först hamnade.
  await page.mouse.move(mbR.x + mbR.width / 2, mbR.y + mbR.height - 3, { steps: 6 });
  await page.mouse.move(mbR.x + mbR.width / 2, mbR.y + 3, { steps: 6 });
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-rumrad[data-rum="01-001"].linje-over'),
    'linjen ovanför 01-001');
  const linjeR = await page.evaluate(() => ({
    linje: [...document.querySelectorAll('#byggnadsflode .bf-rumrad')]
      .filter(r => /linje-(over|under)/.test(r.className))
      .map(r => r.dataset.rum + ':' + (/linje-under/.test(r.className) ? 'under' : 'över')),
    dras: [...document.querySelectorAll('#byggnadsflode .bf-rumrad.dras')].map(r => r.dataset.rum)
  }));
  kontroll(linjeR.linje.join(' ') === '01-001:över',
    'linjen visar att rummet hamnar före 01-001 innan det släpps (' + linjeR.linje.join(' ')
    + ', beslut 106)');
  kontroll(linjeR.dras.join(' ') === '01-003', 'den dragna rumsraden syns vara i rörelse');
  await bild(page, 'byggnad-steg3-rumdrag');

  const foreDrag = await historikpos(page);
  await page.mouse.up();
  await stegKlartPos(page, foreDrag, 'dra om rummens ordning');
  const dragetR = await page.evaluate(() => ({
    lista: DP.Plan.rumStatus().plan.filter(p => p.id === '01')[0].rum.map(r => r.nyckel),
    text: DP.Plan.historik().lista.slice(-1)[0],
    x: DP.viewer.b.rum.filter(r => r.plan === '01' && !r.skal)
      .map(r => r.nr + '@' + Math.round(r.rect[0] * 10) / 10),
    linjer: document.querySelectorAll('#byggnadsflode .bf-rumrad.linje-over, #byggnadsflode .bf-rumrad.linje-under').length
  }));
  kontroll(dragetR.lista.join(' ') === '01-003 01-001 01-002 01-004',
    'rummet ligger först på planet efter draget (' + dragetR.lista.join(' ') + ')');
  kontroll(/flytta Logement 1:1 före Korridor på plan 01/.test(dragetR.text),
    'draget är ett steg i historiken med text i klartext ("' + dragetR.text + '")');
  kontroll(dragetR.x.join(' ') !== fore01.x.join(' '),
    'rummen bytte plats i modellen: ordningen är placeringen (' + fore01.x.join(' ') + ' → '
    + dragetR.x.join(' ') + ', beslut 78)');
  kontroll(dragetR.linjer === 0, 'linjen är borta när rummet släppts');

  await angra(page);
  const angratR = await page.evaluate(() => ({
    lista: DP.Plan.rumStatus().plan.filter(p => p.id === '01')[0].rum.map(r => r.nyckel),
    x: DP.viewer.b.rum.filter(r => r.plan === '01' && !r.skal)
      .map(r => r.nr + '@' + Math.round(r.rect[0] * 10) / 10)
  }));
  kontroll(angratR.lista.join(' ') === fore01.lista.join(' ') && angratR.x.join(' ') === fore01.x.join(' '),
    'ångra flyttar rummen tillbaka, både i listan och i modellen (' + angratR.lista.join(' ') + ')');
  await gorOm(page);
  kontroll(await page.evaluate(() =>
    DP.Plan.rumStatus().plan.filter(p => p.id === '01')[0].rum[0].nyckel) === '01-003',
    'gör om lägger tillbaka den dragna ordningen');
  // Tillbaka till nummerordning, så att resten av testet läser den byggnad filen gav
  await angra(page);

  // ---- Ett rum dras till ett annat plan och tar sina installationer med sig ----
  // Installationerna pekar på rummets nyckel (beslut 76), så ett rum som byter plan eller
  // nummer skriver om dem i samma steg – annars hade de suttit i ett rum som inte finns.
  await page.evaluate(() => {
    // En installation i 01-002 för hand: steg 4 är inte byggt, och testet behöver en
    // installation som pekar på rummet för att kunna visa att den följer med.
    DP.Plan.andraByggnad('lägg till installation för testet', '', data => {
      // Installationen bär **bara** rummets nyckel (beslut 76): viewern tar planet ur det rum
      // installationen sitter i, så ett eget plan-fält hade varit en andra sanning.
      data.installationer.push({ id: 'TEST-1', typ: 'handbrandslackare', beteckning: 'HB1',
        signifikant: true, rum: '01-002' });
      // Ett innerrum i rummet: det bär förälderns nyckel men ritas ur sitt **eget** plan,
      // så båda måste följa med när föräldern byter våning.
      data.rum.push({ nr: '901', namn: 'Städskrubb', plan: '01', typ: 'forrad',
        rumstyp: 'stad', nta: 4, iRum: '01-002' });
    });
  });
  const foreFlytt = await historikpos(page);
  const rumKalla = bf.locator('.bf-rumrad[data-rum="01-002"]');
  const planMal = bf.locator('.bf-planrum[data-rumplan="00"] .bf-grupphuvud');
  // Både källan och målet måste vara synliga i panelen: musen rullar inte dit av sig själv,
  // och ett drag som börjar eller slutar utanför den synliga ytan hade landat någon annanstans
  // än där testet tror.
  await planMal.scrollIntoViewIfNeeded();
  await rumKalla.scrollIntoViewIfNeeded();
  const rkb = await rumKalla.boundingBox(), pmb = await planMal.boundingBox();
  await page.mouse.move(rkb.x + rkb.width / 2, rkb.y + rkb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pmb.x + pmb.width / 2, pmb.y + pmb.height / 2, { steps: 8 });
  // En liten rörelse **på** målet: Chromium skickar dragover på egen takt under ett drag, och
  // den sista positionen i en rörelse hinner inte alltid bli ett eget event. Utan den hade
  // testet väntat på ett märke webbläsaren aldrig kom att sätta.
  await page.mouse.move(pmb.x + pmb.width / 2 + 3, pmb.y + pmb.height / 2, { steps: 3 });
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-planrum[data-rumplan="00"].malplan'),
    'plan 00 märkt som mål');
  kontroll(await bf.locator('.bf-planrum.malplan').count() === 1,
    'planet märks som mål när pekaren står utanför rummen – ett plan utan rum har ingen rad '
    + 'att lägga en linje på');
  await page.mouse.up();
  await stegKlartPos(page, foreFlytt, 'dra rummet till ett annat plan');
  const flyttat = await page.evaluate(() => {
    const b = DP.Plan.byggnad();
    return {
      plan00: DP.Plan.rumStatus().plan.filter(p => p.id === '00')[0].rum.map(r => r.nyckel + ':' + r.namn),
      plan01: DP.Plan.rumStatus().plan.filter(p => p.id === '01')[0].rum.map(r => r.nyckel),
      inst: (b.installationer.filter(i => i.id === 'TEST-1')[0] || {}).rum,
      inner: (b.rum.filter(r => r.namn === 'Städskrubb')[0] || {}),
      text: DP.Plan.historik().lista.slice(-1)[0],
      // Rummet ligger i modellen på sitt nya plan
      modell: DP.viewer.b.rum.filter(r => r.plan === '00' && !r.skal).map(r => r.nr).join(' ')
    };
  });
  kontroll(flyttat.plan00.some(r => /^00-002:Entré/.test(r)),
    'rummet hamnade på plan 00 med nästa lediga nummer – 001 var taget av Fläktrum ('
    + flyttat.plan00.join(' | ') + ', beslut 110)');
  kontroll(flyttat.plan01.indexOf('01-002') < 0,
    'och ligger inte kvar på plan 01 (' + flyttat.plan01.join(' ') + ')');
  kontroll(flyttat.inst === '00-002',
    'installationen i rummet följde med till den nya nyckeln (' + flyttat.inst + ', beslut 76)');
  kontroll(flyttat.inner.iRum === '00-002' && flyttat.inner.plan === '00',
    'innerrummet följde med både i nyckeln och i planet det ritas på ('
    + flyttat.inner.iRum + ' på plan ' + flyttat.inner.plan + ')');
  kontroll(/flytta Entré till Källarplan som 00-002/.test(flyttat.text),
    'flytten är ett steg i historiken med text i klartext ("' + flyttat.text + '")');
  kontroll(flyttat.modell === '001 002',
    'rummet ritas på sitt nya plan i modellen (' + flyttat.modell + ')');
  await angra(page);
  kontroll(await page.evaluate(() =>
    (DP.Plan.byggnad().installationer.filter(i => i.id === 'TEST-1')[0] || {}).rum) === '01-002',
    'ångra tar rummet och installationen tillbaka till 01-002');
  // Bort med testets installation och tillbaka till byggnaden filen gav
  await angra(page);

  // ---- Ett oplacerat rum dras till ett plan (berättelse 26 och 37) ----
  // Samma handling som knappen på raden, andra vägen: planeraren drar raden till planet när
  // listan är lång. Båda går genom `svaraRum`, så nummerkrocken prövas likadant (beslut 110).
  const filOplacerad = skrivArk('rum-oplacerad.xlsx', {
    Rum: [
      ['Plan', 'Rum', 'Benämning', 'NTA'],
      ['09', '001', 'Vindsförråd', '20']
    ]
  });
  await lasInFil(page, filOplacerad);
  const oplaceradFore = await page.evaluate(() => ({
    antal: DP.Plan.inlasningStatus('rum').raknat.oplacerad,
    dragbar: !!document.querySelector('#byggnadsflode .bf-inlrad.oplacerad.dragbar')
  }));
  kontroll(oplaceradFore.antal === 1 && oplaceradFore.dragbar,
    'den oplacerade raden går att dra (' + oplaceradFore.antal + ' oplacerad)');
  const oplKalla = bf.locator('.bf-inlrad.oplacerad.dragbar').first();
  const oplMal = bf.locator('.bf-planrum[data-rumplan="02"] .bf-grupphuvud');
  // Både källan och målet måste synas samtidigt: draget rullar inte listan av sig självt,
  // och ett `boundingBox` för ett element utanför den synliga ytan ger en punkt pekaren
  // aldrig når. Här rullas målet in och källans läge läses efteråt, så att testet mäter
  // draget och inte hur långa texterna ovanför råkar vara.
  await oplMal.scrollIntoViewIfNeeded();
  const okb = await oplKalla.boundingBox(), omb = await oplMal.boundingBox();
  const ruta = await page.evaluate(() => ({ h: window.innerHeight }));
  kontroll(okb.y >= 0 && okb.y + okb.height <= ruta.h
    && omb.y >= 0 && omb.y + omb.height <= ruta.h,
    'den oplacerade raden och målplanet syns samtidigt, så draget går att göra ('
    + Math.round(okb.y) + ' och ' + Math.round(omb.y) + ' av ' + ruta.h + ' px)');
  const foreDra = await historikpos(page);
  await page.mouse.move(okb.x + okb.width / 2, okb.y + okb.height / 2);
  await page.mouse.down();
  await page.mouse.move(omb.x + omb.width / 2, omb.y + omb.height / 2, { steps: 8 });
  await page.mouse.move(omb.x + omb.width / 2 + 3, omb.y + omb.height / 2, { steps: 3 });
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-planrum[data-rumplan="02"].malplan'),
    'plan 02 märkt som mål för den oplacerade raden');
  await page.mouse.up();
  await stegKlartPos(page, foreDra, 'dra det oplacerade rummet till ett plan');
  const dragetOpl = await page.evaluate(() => {
    const st = DP.Plan.inlasningStatus('rum');
    return {
      oplacerade: st.raknat.oplacerad,
      rum: DP.Plan.byggnad().rum.filter(r => r.namn === 'Vindsförråd')
        .map(r => DP.rumNyckel(r.plan, r.nr)).join(''),
      forslag: st.grupper.forslag.map(r => r.fragor.map(f => f.text).join(' ')).join(' | '),
      text: DP.Plan.historik().lista.slice(-1)[0]
    };
  });
  kontroll(dragetOpl.oplacerade === 0,
    'raden är inte längre oplacerad när den dragits till ett plan (berättelse 26)');
  kontroll(dragetOpl.rum === '02-005' || /redan ett rum 02-001/.test(dragetOpl.forslag),
    'rummet hamnade på planet, eller fick nästa lediga nummer vid krock ("'
    + (dragetOpl.rum || dragetOpl.forslag) + '", beslut 110)');
  kontroll(/plan 02/.test(dragetOpl.text),
    'draget är ett steg i historiken ("' + dragetOpl.text + '")');
  // Tillbaka: raden hör inte till resten av testet
  await angra(page);
  await angra(page);

  // ---- Ett rum läggs till för hand, med samma förslag som vid inläsning (berättelse 26) ----
  await bf.locator('button', { hasText: 'Lägg till rum' }).first().click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode input[data-falt="rum-namn"]'),
    'formuläret för ett nytt rum');
  await bf.locator('.bf-rumform .bf-planval button', { hasText: '01 Entréplan' }).click();
  await bf.locator('input[data-falt="rum-namn"]').fill('Fikarum');
  const forslag = await page.evaluate(() =>
    [...document.querySelectorAll('#byggnadsflode .steg-kort[data-bsteg="3"] .bf-notis')]
      .map(e => e.textContent).join(' '));
  kontroll(/Fikarum/.test(forslag) && /01-005/.test(forslag),
    'förslaget syns innan rummet finns: nyckeln och rumstypen läst ur benämningen ("'
    + forslag.slice(0, 120) + '", beslut 80)');
  const foreNytt = await historikpos(page);
  await bf.locator('.knapprad button', { hasText: 'Lägg till rum' }).last().click();
  await stegKlartPos(page, foreNytt, 'lägga till ett rum för hand');
  const nyttRum = await page.evaluate(() => {
    const r = DP.Plan.byggnad().rum.filter(x => x.namn === 'Fikarum')[0] || {};
    return {
      nyckel: DP.rumNyckel(r.plan, r.nr), rumstyp: r.rumstyp, typ: r.typ, nta: r.nta,
      text: DP.Plan.historik().lista.slice(-1)[0],
      lista: DP.Plan.rumStatus().plan.filter(p => p.id === '01')[0].rum.map(x => x.nyckel),
      modell: DP.viewer.b.rum.filter(x => x.namn === 'Fikarum').map(x => x.rect.length).join(''),
      // Nästa nummer räknades upp, så nästa rum planeraren skriver inte krockar
      nasta: [...document.querySelectorAll('#byggnadsflode input[data-falt="rum-nr"]')]
        .map(e => e.value).join('')
    };
  });
  kontroll(nyttRum.nyckel === '01-005' && nyttRum.rumstyp === 'fikarum' && nyttRum.typ === 'personal',
    'rummet fick nästa lediga nummer och rumstypen ur benämningen (' + nyttRum.nyckel + ' '
    + nyttRum.rumstyp + '/' + nyttRum.typ + ')');
  kontroll(nyttRum.nta > 0,
    'NTA blev rumstypens standardvärde när planeraren lämnade fältet tomt (' + nyttRum.nta
    + ' m², beslut 79)');
  kontroll(nyttRum.lista.indexOf('01-005') >= 0 && nyttRum.modell === '4',
    'rummet syns i listan och i modellen med en räknad rektangel (' + nyttRum.lista.join(' ') + ')');
  kontroll(/lägg till rum 01-005 Fikarum/.test(nyttRum.text),
    'tillägget är ett steg i historiken ("' + nyttRum.text + '")');
  kontroll(nyttRum.nasta === '006',
    'numret räknas upp, så nästa rum planeraren skriver in inte krockar (' + nyttRum.nasta + ')');
  // Beskedet om ett upptaget nummer kommer medan hon skriver (beslut 103)
  await bf.locator('input[data-falt="rum-nr"]').fill('001');
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="3"] .bf-fel'),
    'beskedet om ett upptaget nummer');
  const upptaget = await page.evaluate(() => ({
    fel: document.querySelector('#byggnadsflode .steg-kort[data-bsteg="3"] .bf-fel').textContent,
    last: [...document.querySelectorAll('#byggnadsflode .knapprad button')]
      .filter(k => /Lägg till rum/.test(k.textContent)).every(k => k.disabled)
  }));
  kontroll(/redan ett rum 01-001/.test(upptaget.fel) && upptaget.last,
    'ett upptaget nummer sägs i klartext medan hon skriver, och knappen är utgråad ("'
    + upptaget.fel.slice(0, 90) + '")');
  await bf.locator('.knapprad button', { hasText: 'Avbryt' }).last().click();
  await angra(page);
  kontroll(await page.evaluate(() =>
    DP.Plan.byggnad().rum.filter(x => x.namn === 'Fikarum').length) === 0,
    'ångra tar bort det handlagda rummet');

  // ---- Ta ut filen igen: rummen är ifyllda, inklusive Rumstyp (berättelse 17 och 21) ----
  const igen = await taUtFil(page, 'rum-ifylld-ut.xlsx');
  const utArk = lasArkFil(igen.fil);
  const rumFore = await page.evaluate(() => DP.Plan.byggnad().rum
    .map(r => DP.rumNyckel(r.plan, r.nr) + '|' + r.namn + '|' + r.rumstyp + '|' + r.nta));
  kontroll(utArk.Rum.length === 10,
    'filen tas ut med alla nio rummen ifyllda (' + (utArk.Rum.length - 1) + ' rader)');
  kontroll((utArk.Rum[0] || []).indexOf('Rumstyp') >= 0
    && utArk.Rum.some(r => r[3] === 'Korridor'),
    'Rumstyp är ifylld när filen tas ut (' + (utArk.Rum[0] || []).join(',') + ', beslut 109)');
  kontroll(utArk.Rum.some(r => r[9] === 'Ny dörr'),
    'det egna fältet i fliken Rum följer med ut igen (beslut 89)');

  const foreRetur = await historiklangd(page);
  await lasInFil(page, igen.fil);
  const retur = await page.evaluate(() => ({
    rum: DP.Plan.byggnad().rum
      .map(r => DP.rumNyckel(r.plan, r.nr) + '|' + r.namn + '|' + r.rumstyp + '|' + r.nta),
    st: DP.Plan.inlasningStatus('rum'),
    steg3: DP.Plan.byggnadsSteg()[3]
  }));
  kontroll(retur.rum.join(' ') === rumFore.join(' '),
    'rummen går tur och retur utan skillnad (' + retur.rum.length + ' rum oförändrade)');
  kontroll(retur.st.raknat.forslag === 0 && retur.st.raknat.oplacerad === 0 && retur.steg3 === true,
    'ingenting nytt att ta ställning till: alla rum fanns redan (beslut 86)');
  kontroll(retur.st.raknat.klar === 9,
    'alla nio rummen räknas som klara också andra gången filen läses in ('
    + retur.st.raknat.klar + ')');

  // ---- En ritad byggnad säger att grannarna inte ritas om (beslut 101, berättelse 58) ----
  // Garage, Kasern 1 och 2 och Hangar har egna rektanglar i `data/` och lämnas orörda av
  // planlösningen. Ett rum som läggs till eller dras om där får sin plats ur regeln medan
  // grannarna behåller sina ritade mått, så de kan hamna över varandra. Planeraren ska få
  // veta det innan hon drar; att rita om hela planet efter en varning hör till Ändra byggnad.
  const kasern5 = await page.evaluate(() => DP.Plan.aktivId());
  await byggnadsval(page, 'kasern1');
  // Steget står kvar öppet över ett byggnadsbyte – det är samma steg i flödet, bara en annan
  // byggnad – så inget klick behövs, och ett klick hade stängt det.
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="3"].oppen'),
    'steg 3 står kvar öppet för Kasern 1');
  const ritad = await page.evaluate(() => ({
    handritad: DP.Plan.rumStatus().handritad,
    notis: [...document.querySelectorAll('#byggnadsflode .steg-kort[data-bsteg="3"] .bf-notis')]
      .map(e => e.textContent).join(' ')
  }));
  kontroll(ritad.handritad === true,
    'rumStatus säger att Kasern 1 är en ritad byggnad (beslut 101)');
  // Hänvisningen till *Ändra byggnad* är borta sedan biljett #41: omritningen finns nu här,
  // och notisen pekar på den i stället för på en biljett som inte var byggd.
  kontroll(/ritad byggnad/.test(ritad.notis) && /rita om hela planet/.test(ritad.notis),
    'steg 3 säger i klartext att grannarna inte ritas om, och att planet går att rita om ("'
    + ritad.notis.slice(0, 110) + '")');
  await byggnadsval(page, kasern5);
  kontroll(await page.evaluate(() => DP.Plan.rumStatus().handritad) === false,
    'en byggnad som planeraren själv byggt upp är räknad, inte ritad');
  await vanta(page, () => {
    const k = document.querySelector('#byggnadsflode .steg-kort[data-bsteg="3"].oppen');
    return !!k && !/ritad byggnad/.test(k.textContent);
  }, 'notisen borta för den räknade byggnaden');

  // ---- Huvudvyn ryms på skärmen med steg 3 öppet ----
  const ryms = await page.evaluate(() => ({
    sida: document.documentElement.scrollHeight <= window.innerHeight + 1,
    hojd: document.documentElement.scrollHeight, fonster: window.innerHeight
  }));
  kontroll(ryms.sida,
    'huvudvyn ryms utan att sidan scrollar med steg 3 öppet (' + ryms.hojd + ' av '
    + ryms.fonster + ' px)');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}


// Steget Installationer genom hela sidan, och vägen vidare till Planering: läs in alla tre
// flikarna, godta, dra en oplacerad installation till ett rum, välj en okänd typ, ångra och
// gör om, se "Klar för Planering" – och möt snabbstarten i Planering (biljett #39,
// berättelse 22, 45–50, 57 och 64–65).
//
// Det som prövas är planerarens hela väg med en riktig .xlsx skriven utanför appen. Går
// typigenkänningen eller rummatchningen fel får installationerna fel tillsyn, och det märks
// först när någon faktiskt planerar en inläst byggnad.
async function testStegInstallationer(browser) {
  console.log('Steget Installationer och vidare till Planering (beslut 81, 86, 87, 88 och 109)');
  const page = await nySida(browser, URL_INDEX);
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const bf = page.locator('#byggnadsflode');

  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('.val[data-typ="kasern"]').click();
  await bf.locator('input[data-falt="namn"]').fill('Kasern 6');
  await bf.locator('button', { hasText: 'Skapa byggnad' }).click();
  await vanta(page, () => DP.Plan.byggnad().namn === 'Kasern 6', 'byggnaden skapad');

  // ---- En fil med alla tre flikarna i samma inläsning (beslut 70, berättelse 16) ----
  // Skrivsätten är med flit olika, som i fastighetssystemet: en installation med exakt plan
  // och nummer, en med planet skrivet P2, en utan plan vars nummer bara finns på ett plan,
  // en vars nummer finns på två plan, en med en benämning systemet inte känner igen, och en
  // utan Id.
  const fil = skrivArk('inst-ifylld.xlsx', {
    Plan: [
      ['Plan', 'Benämning'],
      ['01', 'Entréplan'],
      ['02', 'Plan 2']
    ],
    Rum: [
      ['Plan', 'Rum', 'Benämning', 'Rumstyp', 'NTA', 'NTV', 'BRA', 'BTA', 'Temperaturreglerad'],
      ['01', '001', 'Korridor', '', '96', '', '', '', 'Ja'],
      ['01', '002', 'Logement 1:1', '', '36', '', '', '', 'Ja'],
      ['01', '003', 'Fläktrum', '', '40', '400', '', '', 'Nej'],
      ['02', '001', 'Korridor', '', '96', '', '', '', 'Ja'],
      ['02', '002', 'Logement 2:1', '', '36', '', '', '', 'Ja']
    ],
    Installationer: [
      ['Plan', 'Rum', 'Benämning', 'Installationstyp', 'Beteckning', 'Fabrikat', 'Modell',
        'Id', 'Externt id', 'Installationsdatum', 'Kapacitet'],
      // Klar: exakt plan och nummer, benämning systemet känner igen
      ['01', '001', 'Brandlarmscentral 1', '', 'BLC01', 'Securia', 'BC-400', '00000211',
        'L410233', '2023-04-11', ''],
      // Klar: tomt Id får ett id från systemet (berättelse 48)
      ['01', '002', 'Handbrandsläckare 1', '', 'HB01', 'Presto', 'P7kg', '', '', '2024-05-02', ''],
      // Förslag: planet skrivet P2 och numret utan nollor
      ['P2', '2', 'Handbr.släckare 2', '', 'HB02', 'Presto', 'P7kg', '00000213', '', '', ''],
      // Förslag: planet saknas, men 003 finns bara på ett plan (berättelse 46)
      ['', '003', 'Luftbehandlingsaggregat 1', '', 'LB01', 'Fahoma', 'FTX1127', '00000214',
        '', '', '2000 l/s'],
      // Oplacerad: 001 finns på två plan och planet är tomt (berättelse 46)
      ['', '001', 'Brandpost 1', '', 'BP01', 'Nordhydrant', 'NH-25', '00000215', '', '', ''],
      // Oplacerad: benämningen känns inte igen som en installationstyp (beslut 81)
      ['01', '003', 'Gurglande dunk', '', 'GD01', '', '', '00000216', '', '', '']
    ]
  });
  // Steg 4 öppnas innan filen läses in: det är där planeraren står när hon fyller i
  // installationerna, och steglistan är hennes väg dit.
  await bf.locator('.steg-kort[data-bsteg="4"] .steg-huvud').click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="4"].oppen'),
    'steg 4 öppet');
  await lasInFil(page, fil);

  const inlast = await page.evaluate(() => {
    const st = DP.Plan.inlasningStatus('inst');
    const sig = DP.Plan.byggnad().installationer.filter(i => i.signifikant);
    return {
      raknat: st.raknat,
      plan: DP.Plan.byggnad().plan.map(p => p.id),
      rum: DP.Plan.byggnad().rum.length,
      inst: sig.map(i => (i.beteckning || '–') + ':' + i.typ + ':' + i.rum),
      forslag: st.grupper.forslag.map(r => r.falt.beteckning),
      skal: st.grupper.forslag.map(r => r.fragor.map(f => f.text).join(' ')),
      oplacerade: st.grupper.oplacerad.map(r => r.falt.beteckning),
      oplaceratSkal: st.grupper.oplacerad.map(r => r.fragor.map(f => f.text).join(' ')),
      historik: DP.Plan.historik().lista.slice(-1)[0],
      steg: DP.Plan.byggnadsSteg(),
      // Modellen visar bara det som är klart (berättelse 55): de två klara installationerna
      // ritas, förslagen och det oplacerade inte.
      modellSig: DP.viewer.b.installationer.filter(i => i.signifikant).length,
      // De övriga genereras ur rumstypen (berättelse 57)
      modellOvriga: DP.viewer.b.installationer.filter(i => !i.signifikant).length,
      // Och de har en plats inne i sitt rum
      platser: DP.viewer.b.installationer.filter(i => i.signifikant)
        .map(i => i.rum + '@' + Math.round(i.x * 10) / 10)
    };
  });
  kontroll(inlast.plan.join(' ') === '01 02' && inlast.rum === 5,
    'plan och rum kom in i samma inläsning (' + inlast.plan.join(' ') + ', ' + inlast.rum + ' rum)');
  kontroll(inlast.raknat.klar === 2 && inlast.raknat.forslag === 2 && inlast.raknat.oplacerad === 2,
    'installationsraderna delas i klart, förslag och oplacerat ('
    + JSON.stringify(inlast.raknat) + ')');
  kontroll(inlast.inst.length === 2 && inlast.inst.some(i => /^BLC01:brandlarmscentral:01-001/.test(i)),
    'de klara installationerna förs in i byggnaden med sin typ och sitt rum ('
    + inlast.inst.join(' | ') + ', beslut 81)');
  kontroll(inlast.skal.some(s => /P2 tolkas som plan 02/.test(s)),
    'planet P2 matchas förlåtande och säger det i klartext ("'
    + inlast.skal.filter(s => /P2/.test(s))[0] + '", beslut 77)');
  kontroll(inlast.skal.some(s => /bara på ett plan/.test(s)),
    'en rad utan plan vars rumsnummer finns på ett enda plan blir ett förslag ("'
    + inlast.skal.filter(s => /ett plan/.test(s))[0] + '", berättelse 46)');
  kontroll(inlast.oplaceratSkal.some(s => /finns på flera plan/.test(s)),
    'ett rumsnummer som finns på flera plan blir oplacerat ("'
    + inlast.oplaceratSkal.filter(s => /flera/.test(s))[0] + '", berättelse 46)');
  kontroll(inlast.oplaceratSkal.some(s => /Välj typ ur listan/.test(s)),
    'en okänd installationstyp måste väljas och är inte ett förslag ("'
    + inlast.oplaceratSkal.filter(s => /typ/.test(s))[0] + '", beslut 81)');
  kontroll(/läs in inst-ifylld\.xlsx/.test(inlast.historik),
    'hela filen – plan, rum och installationer – är **ett** steg i historiken ("'
    + inlast.historik + '")');
  kontroll(inlast.steg[3] === true && inlast.steg[4] === false,
    'steg 3 är grönt men steg 4 inte: förslag och oplacerat ligger kvar (beslut 83)');
  kontroll(inlast.modellSig === 2,
    'modellen visar bara de klara installationerna (' + inlast.modellSig
    + ', berättelse 55)');
  kontroll(inlast.modellOvriga > 10,
    'de övriga installationerna läggs till automatiskt ur rumstyperna ('
    + inlast.modellOvriga + ' st, berättelse 57)');
  kontroll(inlast.platser.length === 2 && inlast.platser.every(p => /@\d/.test(p)),
    'installationerna har en plats räknad ur sitt rum (' + inlast.platser.join(' ')
    + ', beslut 78)');
  // Ett tomt Id fick ett id från systemet, och det är ett annat än fastighetssystemets
  const systemId = await page.evaluate(() => (DP.Plan.byggnad().installationer
    .filter(i => i.beteckning === 'HB01')[0] || {}).id);
  kontroll(/^9\d{7}$/.test(systemId),
    'en rad utan Id fick ett id från systemet (' + systemId + ', berättelse 48)');
  await bild(page, 'byggnad-steg4-inlasning');

  // ---- Godta alla: ett steg, och ett ångra tar tillbaka hela godtagandet ----
  const foreAlla = await historiklangd(page);
  await bf.locator('.steg-kort[data-bsteg="4"] button', { hasText: 'Godta alla' }).click();
  await stegKlart(page, foreAlla, 'Godta alla i Installationer');
  const godtagna = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('inst').raknat,
    inst: DP.Plan.byggnad().installationer.filter(i => i.signifikant)
      .map(i => i.beteckning + ':' + i.rum),
    historik: DP.Plan.historik().lista.slice(-1)[0],
    steg4: DP.Plan.byggnadsSteg()[4]
  }));
  kontroll(godtagna.raknat.forslag === 0 && godtagna.inst.length === 4,
    'Godta alla för in båda förslagen på en gång (' + godtagna.inst.length + ' installationer)');
  kontroll(godtagna.inst.some(i => i === 'HB02:02-002'),
    'HB02 hamnade i 02-002, rummet systemet föreslog (' + godtagna.inst.join(' | ') + ')');
  kontroll(godtagna.inst.some(i => i === 'LB01:01-003'),
    'LB01 hamnade i 01-003, det enda rummet med nummer 003 (' + godtagna.inst.join(' | ') + ')');
  kontroll(/godta alla 2 förslag i Installationer/.test(godtagna.historik),
    'Godta alla är **ett** steg i historiken ("' + godtagna.historik + '")');
  kontroll(godtagna.steg4 === false,
    'bocken dröjer så länge de två oplacerade raderna ligger kvar (berättelse 30)');

  await angra(page);
  const angrat = await page.evaluate(() => ({
    raknat: DP.Plan.inlasningStatus('inst').raknat,
    antal: DP.Plan.byggnad().installationer.filter(i => i.signifikant).length
  }));
  kontroll(angrat.raknat.forslag === 2 && angrat.antal === 2,
    'ett ångra tar tillbaka hela godtagandet (' + angrat.antal + ' installationer, '
    + angrat.raknat.forslag + ' förslag igen)');
  await gorOm(page);
  kontroll(await page.evaluate(() =>
    DP.Plan.byggnad().installationer.filter(i => i.signifikant).length) === 4,
    'gör om lägger tillbaka dem');

  // ---- Den oplacerade brandposten dras till ett rum (berättelse 50) ----
  // Draget går genom `svaraInst`, samma väg som knappen på raden, så rummet prövas likadant.
  const oplaceradFore = await page.evaluate(() => ({
    antal: DP.Plan.inlasningStatus('inst').raknat.oplacerad,
    dragbar: !!document.querySelector('#byggnadsflode .bf-inlrad.oplacerad.dragbar')
  }));
  kontroll(oplaceradFore.antal === 2 && oplaceradFore.dragbar,
    'de oplacerade raderna ligger kvar och den med okänt rum går att dra ('
    + oplaceradFore.antal + ')');
  const foreDrag = await historiklangd(page);
  // Radens nyckel slås upp i tillståndet: en locator med `hasText` går inte att rulla fram,
  // och `data-inlrad` är den selektor raden faktiskt bär.
  const bpKey = await page.evaluate(() => (DP.Plan.inlasningStatus('inst').grupper.oplacerad
    .filter(r => r.falt.beteckning === 'BP01')[0] || {}).key);
  const bp = bf.locator('.bf-inlrad[data-inlrad="' + bpKey + '"]');
  const malrum = bf.locator('.bf-instrum[data-instrum="02-001"]');
  await draTillMal(page, bp, malrum,
    () => !!document.querySelector('#byggnadsflode .bf-instrum[data-instrum="02-001"].malrum'),
    'rummet 02-001 märkt som mål');
  kontroll(await bf.locator('.bf-instrum.malrum').count() === 1,
    'rummet märks som mål medan installationen dras (beslut 106)');
  await page.mouse.up();
  await stegKlart(page, foreDrag, 'dra brandposten till 02-001');
  const draget = await page.evaluate(() => ({
    oplacerade: DP.Plan.inlasningStatus('inst').raknat.oplacerad,
    bp: (DP.Plan.byggnad().installationer.filter(i => i.beteckning === 'BP01')[0] || {}).rum,
    historik: DP.Plan.historik().lista.slice(-1)[0],
    market: document.querySelectorAll('#byggnadsflode .bf-instrum.malrum').length
  }));
  kontroll(draget.oplacerade === 1 && draget.bp === '02-001',
    'brandposten hamnade i det rum hon drog den till (' + draget.bp + ')');
  kontroll(/rum 02-001/.test(draget.historik),
    'draget är ett steg i historiken med text i klartext ("' + draget.historik + '")');
  kontroll(draget.market === 0, 'märket är borta när installationen släppts');

  // ---- Den okända typen väljs ur listan: steget blir grönt (beslut 81, berättelse 47) ----
  const foreTyp = await historiklangd(page);
  const gd = bf.locator('.bf-inlrad.oplacerad', { hasText: 'Gurglande dunk' }).first();
  kontroll(await gd.locator('.bf-typval button').count() > 10,
    'den okända typen svaras med en knapp per installationstyp');
  await gd.locator('.bf-typval button', { hasText: 'Tryckkärl' }).first().click();
  await stegKlart(page, foreTyp, 'välja installationstyp');
  const gront = await page.evaluate(() => ({
    st: DP.Plan.inlasningStatus('inst'),
    steg: DP.Plan.byggnadsSteg(),
    status: DP.Plan.byggnadStatus(),
    gd: DP.Plan.byggnad().installationer.filter(i => i.beteckning === 'GD01')[0] || {},
    instSt: DP.Plan.instStatus(),
    historik: DP.Plan.historik().lista.slice(-1)[0],
    modellSig: DP.viewer.b.installationer.filter(i => i.signifikant).length
  }));
  kontroll(gront.st.klar === true && gront.steg[4] === true,
    'steg 4 får grön bock när bara klart återstår (beslut 81 och 83)');
  kontroll(gront.gd.typ === 'tryckkarl' && gront.gd.rum === '01-003',
    'installationen fick den typ planeraren valde (' + gront.gd.typ + ' i ' + gront.gd.rum + ')');
  kontroll(/installationstyp Tryckkärl/.test(gront.historik),
    'valet är ett steg i historiken med typens namn i klartext ("' + gront.historik + '")');
  kontroll(gront.instSt.antal === 6 && gront.instSt.plan.length === 2,
    'alla sex installationerna står under sitt plan och rum (' + gront.instSt.antal + ' på '
    + gront.instSt.plan.length + ' plan)');
  kontroll(gront.instSt.ovriga > 10,
    'steget räknar också de övriga installationerna (' + gront.instSt.ovriga
    + ', berättelse 57)');
  kontroll(gront.modellSig === 6,
    'alla sex syns i modellen när de är klara (' + gront.modellSig + ', berättelse 55)');
  // Byggnadsträdet räknar de övriga ur **formen**, där de genererade ligger: hade det läst
  // tillståndet hade det sagt "0 övriga" om en byggnad där modellen visar trettio.
  const tradet = await page.evaluate(() =>
    (document.querySelector('#trad .sammanfattning') || {}).textContent || '');
  kontroll(/6 signifikanta installationer/.test(tradet) && !/\b0 övriga/.test(tradet),
    'byggnadsträdet räknar både de signifikanta och de genererade övriga ("'
    + tradet.replace(/\s+/g, ' ').slice(0, 90) + '", berättelse 57)');
  // Alla fyra stegen gröna: byggnaden är klar för Planering (berättelse 7 och 64)
  kontroll(/Klar för Planering/.test(gront.status),
    'byggnaden står som "Klar för Planering" när alla fyra stegen är gröna (' + gront.status
    + ', berättelse 7)');
  await bild(page, 'byggnad-steg4-gront');

  // Modellen utan tak, så att installationerna syns i rummen
  await page.locator('#t-tak').click();
  await page.locator('#t-rontgen').click();
  await bild(page, 'byggnad-steg4-modell');
  await page.locator('#t-tak').click();
  await page.locator('#t-rontgen').click();

  // ---- Installationstypen går att byta på raden, och kopplingarna rörs inte (beslut 94) ----
  const foreByte = await historiklangd(page);
  const rad = bf.locator('.bf-instrad', { hasText: 'Handbrandsläckare 1' }).first();
  await rad.locator('button', { hasText: 'Byt typ' }).click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-instrad .bf-typval'),
    'typvalet på raden');
  await bf.locator('.bf-instrad .bf-typval button', { hasText: 'Brandpost' }).first().click();
  await stegKlart(page, foreByte, 'byta installationstyp');
  const bytt = await page.evaluate(() => {
    const i = DP.Plan.byggnad().installationer.filter(x => x.beteckning === 'HB01')[0] || {};
    return { typ: i.typ, benamning: i.benamning,
      historik: DP.Plan.historik().lista.slice(-1)[0] };
  });
  kontroll(bytt.typ === 'brandpost',
    'installationstypen byttes på raden (' + bytt.typ + ', beslut 81)');
  kontroll(bytt.benamning === 'Handbrandsläckare 1',
    'benämningen planeraren skrev står kvar (' + bytt.benamning + ')');
  kontroll(/byt installationstyp/.test(bytt.historik),
    'bytet är ett steg i historiken ("' + bytt.historik + '")');
  await angra(page);
  kontroll(await page.evaluate(() => (DP.Plan.byggnad().installationer
    .filter(x => x.beteckning === 'HB01')[0] || {}).typ) === 'handbrandslackare',
    'ett ångra tar tillbaka typen');

  // ---- Lägg till en installation för hand (berättelse 50) ----
  const foreNy = await historiklangd(page);
  await bf.locator('.steg-kort[data-bsteg="4"] button', { hasText: 'Lägg till installation' })
    .first().click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode input[data-falt="inst-benamning"]'),
    'formuläret för en ny installation');
  await bf.locator('input[data-falt="inst-benamning"]').fill('Nödbelysningsarmatur 1');
  // Typen läses ur benämningen medan hon skriver: hon ska se *vilken* typ systemet läste
  await vanta(page, () => {
    const n = document.querySelector('#byggnadsflode .bf-notis');
    return !!n && /Nödbelysningsarmatur/.test(n.textContent);
  }, 'förslaget om typen');
  await bf.locator('input[data-falt="inst-beteckning"]').fill('NB01');
  await bf.locator('.bf-rumval button', { hasText: '01-001' }).first().click();
  await bf.locator('.steg-kort[data-bsteg="4"] .knapprad.hoger button', { hasText: 'Lägg till installation' })
    .click();
  await stegKlart(page, foreNy, 'lägga till en installation för hand');
  const nyInst = await page.evaluate(() => {
    const i = DP.Plan.byggnad().installationer.filter(x => x.beteckning === 'NB01')[0] || {};
    return { typ: i.typ, rum: i.rum, id: i.id, benamning: i.benamning,
      antal: DP.Plan.instStatus().antal,
      historik: DP.Plan.historik().lista.slice(-1)[0],
      modell: DP.viewer.b.installationer.filter(x => x.id === i.id).length };
  });
  kontroll(nyInst.typ === 'nodbelysning' && nyInst.rum === '01-001',
    'installationen fick typen ur benämningen och rummet hon valde ('
    + nyInst.typ + ' i ' + nyInst.rum + ', beslut 81)');
  kontroll(/^9\d{7}$/.test(nyInst.id),
    'id:t kom från systemet (' + nyInst.id + ', berättelse 48)');
  kontroll(nyInst.antal === 7 && nyInst.modell === 1,
    'installationen står i steget och i modellen (' + nyInst.antal + ' st)');
  kontroll(/lägg till NB01 Nödbelysningsarmatur 1 i 01-001/.test(nyInst.historik),
    'tillägget är ett steg i historiken ("' + nyInst.historik + '")');

  // ---- Ta bort en installation: kopplingarna försvinner med den (beslut 87) ----
  // Planeringen skapas först, så att det finns kopplingar att pröva mot. Snabbstarten är
  // vägen dit (berättelse 65) – ingen planering skapas av sig själv.
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppet');
  const snabb = await page.evaluate(() => ({
    harPlanering: DP.Plan.state().ronder.length,
    knapp: [...document.querySelectorAll('#flode .snabbstart button')]
      .map(b => b.textContent).join(' | ')
  }));
  kontroll(snabb.harPlanering === 0,
    'ingen planering har skapats av sig själv (' + snabb.harPlanering
    + ' ronder, berättelse 65)');
  kontroll(/standardplanering för kasern/.test(snabb.knapp),
    'snabbstarten erbjuder byggnadstypens standardplanering ("' + snabb.knapp + '")');
  await page.locator('#flode .snabbstart button', { hasText: 'standardplanering' }).click();
  await page.locator('.dlg button', { hasText: 'Skapa förslag' }).click();
  await vanta(page, () => DP.Plan.state().ronder.length > 0, 'standardplaneringen');
  const planerad = await page.evaluate(() => ({
    ronder: DP.Plan.state().ronder.length,
    steg: DP.Plan.stegStatus(DP.Plan.state()),
    kopplingar: DP.Plan.state().kopplingar.filter(k => k.inst !== 'BYGGNAD').length,
    klar: DP.Plan.byggnadKlar(DP.Plan.aktivId())
  }));
  kontroll(planerad.ronder === 5 && planerad.steg[5] === true,
    'standardplaneringen ger kasernens fem ronder och ett grönt steg 5 ('
    + planerad.ronder + ' ronder, steg 5: ' + planerad.steg[5] + ', berättelse 22 och 64)');
  kontroll(planerad.kopplingar > 0,
    'de inlästa installationerna fick kopplade åtgärder (' + planerad.kopplingar + ')');
  kontroll(planerad.klar === true,
    'byggnaden är klar för Balansering: alla sex stegen gröna (beslut 39)');

  // Nu tillbaka till Byggnad och ta bort en installation: kopplingarna ska följa med bort
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet igen');
  const foreBort = await historiklangd(page);
  const blcId = await page.evaluate(() => (DP.Plan.byggnad().installationer
    .filter(i => i.beteckning === 'BLC01')[0] || {}).id);
  const koppladeFore = await page.evaluate(id =>
    DP.Plan.state().kopplingar.filter(k => k.inst === id).length, blcId);
  kontroll(koppladeFore > 0,
    'brandlarmscentralen har kopplade åtgärder innan den tas bort (' + koppladeFore + ')');
  await bf.locator('.bf-instrad', { hasText: 'Brandlarmscentral 1' }).first()
    .locator('button', { hasText: 'Ta bort' }).click();
  await stegKlart(page, foreBort, 'ta bort brandlarmscentralen');
  const borttaget = await page.evaluate(id => ({
    finns: DP.Plan.byggnad().installationer.some(i => i.id === id),
    kopplingar: DP.Plan.state().kopplingar.filter(k => k.inst === id).length,
    historik: DP.Plan.historik().lista.slice(-1)[0],
    modell: DP.viewer.b.installationer.filter(i => i.id === id).length
  }), blcId);
  kontroll(borttaget.finns === false && borttaget.modell === 0,
    'installationen är borta ur byggnaden och ur modellen');
  kontroll(borttaget.kopplingar === 0,
    'kopplingarna till den försvann i samma steg (' + borttaget.kopplingar
    + ', beslut 87 och berättelse 68)');
  kontroll(/ta bort BLC01/.test(borttaget.historik),
    'borttagningen är ett steg i historiken ("' + borttaget.historik + '")');
  await angra(page);
  const angratBort = await page.evaluate(id => ({
    finns: DP.Plan.byggnad().installationer.some(i => i.id === id),
    kopplingar: DP.Plan.state().kopplingar.filter(k => k.inst === id).length
  }), blcId);
  kontroll(angratBort.finns === true && angratBort.kopplingar === koppladeFore,
    'ett ångra tar tillbaka både installationen och dess kopplingar ('
    + angratBort.kopplingar + ' kopplingar)');

  // ---- Flytta en installation till ett annat rum: kopplingarna följer med (beslut 87) ----
  const foreFlytt = await historiklangd(page);
  const lbId = await page.evaluate(() => (DP.Plan.byggnad().installationer
    .filter(i => i.beteckning === 'LB01')[0] || {}).id);
  const lbRad = bf.locator('.bf-instrad[data-inst="' + lbId + '"]');
  const lbMal = bf.locator('.bf-instrum[data-instrum="02-002"]');
  const lbKoppladeFore = await page.evaluate(id =>
    DP.Plan.state().kopplingar.filter(k => k.inst === id).length, lbId);
  await draTillMal(page, lbRad, lbMal,
    () => !!document.querySelector('#byggnadsflode .bf-instrum[data-instrum="02-002"].malrum'),
    'rummet 02-002 märkt som mål');
  await page.mouse.up();
  await stegKlart(page, foreFlytt, 'flytta luftbehandlingsaggregatet');
  const flyttat = await page.evaluate(id => ({
    rum: (DP.Plan.byggnad().installationer.filter(i => i.id === id)[0] || {}).rum,
    kopplingar: DP.Plan.state().kopplingar.filter(k => k.inst === id).length,
    historik: DP.Plan.historik().lista.slice(-1)[0],
    // Platsen räknas om ur det nya rummet: en ritad plats som följde med hade lagt
    // installationen utanför väggarna
    rect: (DP.viewer.b.rum.filter(r => DP.rumBeteckning(r) === '02-002')[0] || {}).rect,
    x: (DP.viewer.b.installationer.filter(i => i.id === id)[0] || {}).x
  }), lbId);
  kontroll(flyttat.rum === '02-002',
    'installationen flyttades till det rum hon drog den till (' + flyttat.rum + ')');
  kontroll(flyttat.kopplingar === lbKoppladeFore,
    'kopplade åtgärder följde med: det är samma installation (' + flyttat.kopplingar
    + ', beslut 87 och berättelse 67)');
  kontroll(flyttat.x > flyttat.rect[0] && flyttat.x < flyttat.rect[2],
    'platsen räknades om ur det nya rummet (' + Math.round(flyttat.x * 10) / 10 + ' i '
    + (flyttat.rect || []).join(',') + ')');
  kontroll(/flytta LB01 till 02-002/.test(flyttat.historik),
    'flytten är ett steg i historiken ("' + flyttat.historik + '")');

  // ---- Ta ut filen igen, nu ifylld, och läs in den tur och retur (berättelse 17) ----
  const igen = await taUtFil(page, 'inst-ifylld-ut.xlsx');
  const utArk = lasArkFil(igen.fil);
  const instFore = await page.evaluate(() => DP.Plan.byggnad().installationer
    .filter(i => i.signifikant).map(i => i.id + '|' + i.typ + '|' + i.rum + '|' + i.benamning)
    .sort());
  // Sex ur filen plus den planeraren lade till för hand.
  kontroll(utArk.Installationer.length === 8,
    'filen tas ut med alla sju installationerna ifyllda ('
    + (utArk.Installationer.length - 1) + ' rader)');
  kontroll((utArk.Installationer[0] || []).indexOf('Installationstyp') >= 0
    && (utArk.Installationer[0] || []).indexOf('Kapacitet') >= 0,
    'Installationstyp är ifylld och den egna kolumnen följer med ut ('
    + (utArk.Installationer[0] || []).join(',') + ', beslut 89 och 109)');
  kontroll(utArk.Installationer.some(r => r[3] === 'Luftbehandlingsaggregat' && r[10] === '2000 l/s'),
    'typens namn och det egna fältets värde följer med ut igen');
  // Bara signifikanta: de övriga genereras ur rumstypen och ska inte stå i filen (beslut 81).
  // Provet går på **typen** och inte på benämningen: "Nödbelysningsarmatur" är en signifikant
  // typ, och ett prov på ordet "armatur" hade fällt den.
  const ovrigaTyper = await page.evaluate(() => Object.keys(DP.installationstyper)
    .filter(id => DP.installationstyper[id].kategori === 'ovrig')
    .map(id => DP.installationstyper[id].namn));
  kontroll(!utArk.Installationer.some(r => ovrigaTyper.indexOf(String(r[3])) >= 0),
    'de övriga installationerna står inte i filen (beslut 81)');

  const foreRetur = await historiklangd(page);
  await lasInFil(page, igen.fil);
  const retur = await page.evaluate(() => ({
    inst: DP.Plan.byggnad().installationer.filter(i => i.signifikant)
      .map(i => i.id + '|' + i.typ + '|' + i.rum + '|' + i.benamning).sort(),
    st: DP.Plan.inlasningStatus('inst'),
    steg4: DP.Plan.byggnadsSteg()[4]
  }));
  kontroll(retur.inst.join(' ') === instFore.join(' '),
    'filen läses in tur och retur utan skillnad (' + retur.inst.length + ' installationer)');
  kontroll(retur.st.raknat.forslag === 0 && retur.st.raknat.oplacerad === 0 && retur.steg4 === true,
    'ingenting nytt att ta ställning till: alla installationer fanns redan (beslut 86)');
  kontroll(retur.st.raknat.klar === 7,
    'alla sju räknas som klara också andra gången filen läses in (' + retur.st.raknat.klar + ')');

  // ---- Planering går att öppna innan Byggnad är klar (berättelse 64) ----
  // En ny byggnad utan installationer: steg 5 kan inte bli grönt, och Planering ska säga det
  // i stället för att bara stå tom.
  await bf.locator('button', { hasText: 'Skapa ny byggnad' }).click();
  await bf.locator('.val[data-typ="garage"]').click();
  await bf.locator('input[data-falt="namn"]').fill('Garage 9');
  await bf.locator('button', { hasText: 'Skapa byggnad' }).click();
  await vanta(page, () => DP.Plan.byggnad().namn === 'Garage 9', 'den tomma byggnaden skapad');
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppet för den tomma');
  const tom = await page.evaluate(() => ({
    status: DP.Plan.byggnadStatus(),
    kopplingsSt: DP.Plan.kopplingsStatus(DP.Plan.state()),
    snabbstart: !!document.querySelector('#flode .snabbstart')
  }));
  kontroll(tom.snabbstart,
    'Planering går att öppna för en byggnad som inte är klar i Byggnad (berättelse 64)');
  kontroll(tom.kopplingsSt.klar === false,
    'steg 5 kan inte bli grönt utan installationer (beslut 88 och berättelse 64)');
  kontroll(/Väntar på inläsningsfil/.test(tom.status),
    'byggnaden står som "Väntar på inläsningsfil" (' + tom.status + ')');

  // ---- Huvudvyn ryms på skärmen med steg 4 öppet ----
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const ryms = await page.evaluate(() => ({
    sida: document.documentElement.scrollHeight <= window.innerHeight + 1,
    hojd: document.documentElement.scrollHeight, fonster: window.innerHeight
  }));
  kontroll(ryms.sida,
    'huvudvyn ryms utan att sidan scrollar med steg 4 öppet (' + ryms.hojd + ' av '
    + ryms.fonster + ' px)');

  kontroll(page.fel.length === 0, 'inga JavaScript-fel ' + page.fel.join(' | '));
  await page.close();
}

// ------------------------------------------------------------------
// Ändra byggnad: flytta, ta bort och byta namn (biljett #41)
// ------------------------------------------------------------------
// Berättelse 2, 58 och 67–71. Fem saker prövas, i den ordning planeraren möter dem: att en
// kopplad installation kan flyttas utan att tillsynen ändras, att en borttagen installation
// tar sina kopplingar med sig, att ett namnbyte följer med till rutintillfällenas namn, att
// en borttagen byggnad markerar Balansering som ändrad och går att ångra, och att ett ritat
// plan först varnar och sedan ritas om.
async function testAndraByggnad(browser) {
  console.log('Ändra byggnad: flytta, ta bort och byta namn (biljett #41)');

  // ------------------------------------------------------------------
  // Flytta en kopplad installation: kopplingarna och texterna följer med
  // ------------------------------------------------------------------
  // Kasern 1 med standardplanering, så att installationerna faktiskt har tillsyn att följa
  // med. Flytten är **samma** installation (beslut 87): id:t består, och kopplingarna pekar
  // på id:t – så det som ska prövas är att ingenting gick förlorat på vägen.
  const page = await nySida(browser, URL_INDEX, 'kasern1');
  // Standardplaneringen fyller alla sex stegen med godkända förslag (beslut 53), så steg 5
  // och steg 6 är gröna och har följder att visa när något ändras. Samma väg som knappen
  // *Standardplanering för alla* tar i Balansering.
  await page.evaluate(() => DP.Plan.andra('Standardplanering för provet',
    st => DP.Flode.skrivStandard(st, 'kasern1')));
  await vanta(page, () => DP.Plan.byggnadKlar('kasern1'), 'Kasern 1 klar i alla sex stegen');

  // En signifikant installation med minst en koppling, och ett rum på samma plan att flytta
  // den till. Valet görs i sidan och inte hårdkodat: datafilen ska kunna ändras utan att
  // testet låser sig vid ett rumsnummer.
  const valt = await page.evaluate(() => {
    const P = DP.Plan, s = P.state();
    const i = P.signifikanta().filter(x => s.kopplingar.some(k => k.inst === x.id))[0];
    const plan = i.rum.split('-')[0];
    const mal = P.byggnad().rum.filter(r => r.plan === plan && DP.rumNyckel(r.plan, r.nr) !== i.rum)[0];
    return { id: i.id, bet: i.beteckning, fran: i.rum, till: DP.rumNyckel(mal.plan, mal.nr), malNamn: mal.namn };
  });
  kontroll(!!valt.id, 'en kopplad installation att flytta finns i Kasern 1 (' + valt.bet + ')');

  // En avvikande text på installationsnivå, så att flytten prövas med allt som hänger på
  // installationen och inte bara med kopplingarna.
  const fore = await page.evaluate(({ id }) => {
    const P = DP.Plan, s = P.state();
    const k = s.kopplingar.filter(x => x.inst === id)[0];
    P.andra('avvikande text för provet', st => {
      st.instTexter[k.atgard + '|' + id] = ['Kontrollera extra noga'];
    });
    const st2 = P.state();
    return {
      kopplingar: st2.kopplingar.filter(x => x.inst === id).map(x => x.atgard + '|' + x.rond).sort(),
      text: st2.instTexter[k.atgard + '|' + id],
      textNyckel: k.atgard + '|' + id,
      steg5: P.kopplingsStatus(st2).klar
    };
  }, valt);

  const forePos = await historiklangd(page);
  await page.evaluate(({ id, till }) => DP.Plan.flyttaInst(id, till), valt);
  await stegKlart(page, forePos, 'flytta installation');

  const flyttad = await page.evaluate(({ id, textNyckel }) => {
    const P = DP.Plan, s = P.state(), i = P.inst(id);
    return {
      rum: i.rum, id: i.id,
      kopplingar: s.kopplingar.filter(x => x.inst === id).map(x => x.atgard + '|' + x.rond).sort(),
      text: s.instTexter[textNyckel],
      steg5: P.kopplingsStatus(s).klar,
      // Platsen i rummet är räknad och ska inte ligga i tillståndet (beslut 71 och 78)
      egenPlats: i.x !== undefined || i.z !== undefined,
      text_historik: P.historik().lista.slice(-1)[0]
    };
  }, { id: valt.id, textNyckel: fore.textNyckel });

  kontroll(flyttad.rum === valt.till && flyttad.id === valt.id,
    'installationen ligger i det nya rummet med samma id (' + valt.fran + ' → ' + flyttad.rum + ')');
  kontroll(flyttad.kopplingar.join(',') === fore.kopplingar.join(',') && fore.kopplingar.length > 0,
    'de kopplade åtgärderna följde med flytten (' + flyttad.kopplingar.length + ' st)');
  kontroll(JSON.stringify(flyttad.text) === JSON.stringify(fore.text),
    'den avvikande texten följde med flytten');
  kontroll(flyttad.steg5 === fore.steg5 && fore.steg5 === true,
    'steg 5 är fortfarande grönt efter flytten');
  kontroll(!flyttad.egenPlats,
    'den ritade platsen i rummet föll bort, så planlösningen räknar en ny (beslut 78)');
  kontroll(/flytta .* till /.test(flyttad.text_historik),
    'flytten är ett steg i historiken i klartext ("' + flyttad.text_historik + '")');

  // ------------------------------------------------------------------
  // Ta bort en installation: kopplingarna försvinner, och steg 5 och 6 visar följderna
  // ------------------------------------------------------------------
  // Kopplingarna ska bort i **samma** steg (beslut 87): en koppling som pekar på en
  // installation som inte finns är ingen tillsyn, och steg 5 hade räknat den som gjord.
  const forePos2 = await historiklangd(page);
  const tidFore = await page.evaluate(({ id }) => {
    const P = DP.Plan, s = P.state();
    const rond = s.kopplingar.filter(k => k.inst === id)[0].rond;
    return { rond, minuter: P.tidForslag(rond, s).minuter, antal: P.state().kopplingar.length,
             sig: P.kopplingsStatus(s).tot };
  }, valt);
  const foreSig = tidFore.sig;
  await page.evaluate(({ id }) => DP.Plan.taBortInst(id), valt);
  await stegKlart(page, forePos2, 'ta bort installation');

  const borttagen = await page.evaluate(({ id, rond, textNyckel }) => {
    const P = DP.Plan, s = P.state();
    const ts = P.tidStatus(s).rader.filter(r => r.rond === rond)[0];
    return {
      finns: !!P.inst(id),
      kopplingar: s.kopplingar.filter(k => k.inst === id).length,
      antal: s.kopplingar.length,
      text: s.instTexter[textNyckel],
      steg5: P.kopplingsStatus(s).klar,
      saknasText: P.kopplingsStatus(s).saknasText,
      kvarAvSig: P.kopplingsStatus(s).tot,
      // Steg 6: färre installationer i ronden ger ett nytt förslag, och den godkända tiden
      // markeras som ändrad förutsättning (beslut 51) – men räknas inte om (beslut 27).
      minuter: P.tidForslag(rond, s).minuter,
      andrad: ts.andrad, godkand: ts.godkand
    };
  }, { id: valt.id, rond: tidFore.rond, textNyckel: fore.textNyckel });

  kontroll(!borttagen.finns, 'installationen finns inte längre');
  kontroll(borttagen.kopplingar === 0 && borttagen.antal < tidFore.antal,
    'kopplingarna försvann i samma steg (' + tidFore.antal + ' → ' + borttagen.antal + ')');
  kontroll(borttagen.text === undefined,
    'den avvikande texten på installationsnivå försvann med installationen');
  // Steg 5 förblir **grönt**, och det är rätt: installationen och dess kopplingar försvann i
  // samma steg (beslut 87), så det finns inget hål kvar att fylla. Följden i steg 5 är att
  // byggnaden har en signifikant installation mindre att hålla reda på – hade kopplingen legat
  // kvar hade steget räknat en tillsyn som inte finns.
  kontroll(borttagen.steg5 === true && borttagen.saknasText === '',
    'steg 5 är fortfarande grönt: borttagningen lämnade inget hål ("' + borttagen.saknasText + '")');
  kontroll(borttagen.kvarAvSig === foreSig - 1,
    'steg 5 räknar en signifikant installation mindre (' + foreSig + ' → ' + borttagen.kvarAvSig + ')');
  kontroll(borttagen.minuter < tidFore.minuter,
    'steg 6 får ett nytt tidsförslag (' + tidFore.minuter + ' → ' + borttagen.minuter + ' min)');
  kontroll(borttagen.andrad === true && !!borttagen.godkand,
    'den godkända tiden står kvar men markeras som ändrad förutsättning (beslut 27 och 51)');

  // Ett ångra tar tillbaka installationen **och** dess tillsyn i ett steg
  await angra(page);
  const ater = await page.evaluate(({ id, textNyckel }) => {
    const P = DP.Plan, s = P.state();
    return { finns: !!P.inst(id), kopplingar: s.kopplingar.filter(k => k.inst === id).length,
             text: s.instTexter[textNyckel], steg5: P.kopplingsStatus(s).klar };
  }, { id: valt.id, textNyckel: fore.textNyckel });
  kontroll(ater.finns && ater.kopplingar === fore.kopplingar.length && ater.steg5,
    'ett ångra tar tillbaka installationen, kopplingarna och grön bock i steg 5');
  kontroll(JSON.stringify(ater.text) === JSON.stringify(fore.text),
    'ångra tar också tillbaka den avvikande texten');

  // ------------------------------------------------------------------
  // Byt namn på byggnaden: rutintillfällena byter namn med den (beslut 103)
  // ------------------------------------------------------------------
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const bf = page.locator('#byggnadsflode');
  await bf.locator('.steg-kort[data-bsteg="1"] .steg-huvud').click();
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="1"] .steg-kropp'),
    'steg 1 öppet');
  kontroll((await bf.locator('.steg-kort[data-bsteg="1"]').innerText()).includes('låst'),
    'byggnadstypen står som låst i steg 1 (beslut 104)');

  // Namnet är unikt, och beskedet kommer medan planeraren skriver (beslut 103)
  await bf.locator('button', { hasText: 'Byt namn' }).click();
  await bf.locator('input[data-falt="byggnadsnamn"]').fill('Kasern 2');
  await vanta(page, () => !!document.querySelector('#byggnadsflode .bf-fel'), 'beskedet om namnet');
  kontroll((await bf.locator('.bf-fel').innerText()).includes('redan en byggnad som heter Kasern 2'),
    'ett upptaget namn stoppas med ett besked medan hon skriver');
  kontroll(await bf.locator('button', { hasText: 'Spara' }).isDisabled(),
    'Spara är avstängd så länge namnet är upptaget');
  // Byggnadens eget namn är inte upptaget för den själv
  kontroll(await page.evaluate(() => !DP.Plan.namnHinder('Kasern 1', 'kasern1')),
    'byggnaden får behålla sitt eget namn (namnHinder med utom)');

  const namnFore = await page.evaluate(() => {
    const P = DP.Plan, s = P.state();
    const t = P.rutintillfallen(s)[0];
    return { tillfalle: P.rutintillfalleNamn(t.rond, t.vecka), rond: t.rond, vecka: t.vecka };
  });
  // Positionen och inte längden: ett ångra ligger före, så ett nytt steg skriver över det som
  // låg framför och längden står still medan positionen går fram.
  const forePos3 = await historikpos(page);
  await bf.locator('input[data-falt="byggnadsnamn"]').fill('Kasern 1 Norra');
  await bf.locator('button', { hasText: 'Spara' }).click();
  await stegKlartPos(page, forePos3, 'byt namn');

  const namnEfter = await page.evaluate(({ rond, vecka }) => {
    const P = DP.Plan;
    return {
      namn: P.byggnad().namn,
      tillfalle: P.rutintillfalleNamn(rond, vecka),
      iValjaren: [].map.call(document.querySelectorAll('#byggnad option'), o => o.textContent),
      iListan: document.querySelector('#byggnadsflode .bf-byggnad.aktiv .bf-bnamn').textContent,
      text: P.historik().lista.slice(-1)[0]
    };
  }, namnFore);
  kontroll(namnEfter.namn === 'Kasern 1 Norra', 'byggnaden har det nya namnet');
  kontroll(namnEfter.tillfalle.indexOf('Kasern1Norra-') === 0
    && namnEfter.tillfalle !== namnFore.tillfalle,
    'rutintillfället bytte namn med byggnaden (' + namnFore.tillfalle + ' → ' + namnEfter.tillfalle + ')');
  kontroll(namnEfter.iValjaren.indexOf('Kasern 1 Norra') >= 0,
    'det nya namnet står i byggnadsväljaren');
  kontroll(namnEfter.iListan === 'Kasern 1 Norra', 'det nya namnet står i byggnadslistan');
  // Prefixet är namnet som gällde **när steget skrevs**, alltså det gamla: historiken läses
  // som en lista över vad planeraren gjorde, och "Kasern 1: byt namn till Kasern 1 Norra"
  // säger vilken byggnad hon stod i.
  kontroll(namnEfter.text === 'Kasern 1: byt namn till Kasern 1 Norra',
    'namnbytet är ett steg i historiken ("' + namnEfter.text + '")');

  // Namnet i tidsaxeln och i telefonen (berättelse 70)
  await page.locator('.pl-steg[data-steg="planering"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'planering', 'Planering öppet');
  await vanta(page, () => !!document.querySelector('#tidsaxel .rt-mark'), 'tidsaxelns markörer');
  const iTidsaxeln = await page.evaluate(() => {
    const b = document.querySelector('#tidsaxel .rt-mark');
    return b ? b.title.split('\n')[0] : '';
  });
  kontroll(/Kasern1Norra-/.test(iTidsaxeln),
    'tidsaxelns rutintillfälle bär det nya namnet ("' + iTidsaxeln + '")');
  await page.locator('#tidsaxel .rt-mark').first().click();
  await vanta(page, () => !!document.querySelector('#telefoner .telefon'), 'telefonen öppen');
  const iTelefonen = await page.evaluate(() =>
    document.querySelector('#telefoner .telefon').innerText);
  kontroll(/Kasern1Norra/.test(iTelefonen),
    'telefonens rutintillfälle bär det nya namnet');

  // ---- Ångra tar namnet tillbaka ----
  await angra(page);
  kontroll(await page.evaluate(() => DP.Plan.byggnad().namn) === 'Kasern 1',
    'ett ångra tar tillbaka det gamla namnet');

  // Ett halvskrivet namn är ett svar på det namn som gällde när fältet öppnades. Ändras
  // namnet på annat håll – ett ångra, ett gör om – stänger fältet sig i stället för att stå
  // kvar med ett svar på en fråga som inte finns längre.
  await page.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(page, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet igen');
  // Steget kan redan stå öppet sedan förra gången – ett klick hade då stängt det.
  if (await bf.locator('.steg-kort[data-bsteg="1"] .steg-kropp').count() === 0) {
    await bf.locator('.steg-kort[data-bsteg="1"] .steg-huvud').click();
  }
  await vanta(page, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="1"] .steg-kropp'),
    'steg 1 öppet igen');
  await bf.locator('button', { hasText: 'Byt namn' }).click();
  await bf.locator('input[data-falt="byggnadsnamn"]').fill('Något halvskrivet');
  kontroll(await bf.locator('input[data-falt="byggnadsnamn"]').count() === 1,
    'namnfältet står öppet med det halvskrivna namnet');
  await gorOm(page);
  await vanta(page, () => !document.querySelector('#byggnadsflode input[data-falt="byggnadsnamn"]'),
    'namnfältet stängt av gör om');
  kontroll(await bf.locator('input[data-falt="byggnadsnamn"]').count() === 0,
    'ett gör om som ändrar namnet stänger det halvskrivna fältet');
  kontroll(page.fel.length === 0, 'inga JavaScript-fel i namnbytet ' + page.fel.join(' | '));
  await page.close();

  // ------------------------------------------------------------------
  // Ta bort byggnad: Balansering markeras som ändrad, och ångra tar tillbaka bocken
  // ------------------------------------------------------------------
  // Beslut 100 och berättelse 71. Byggnaden tas bort efter en balansering, så att följden
  // syns: den räknades med, och nu gör den inte det.
  const bp = await balanseradSida(browser);
  const balFore = await bp.evaluate(() => {
    const b = DP.Plan.balanseringStatus();
    return { klar: b.klar, andrad: b.andrad, klara: DP.Plan.klaraByggnader().length };
  });
  kontroll(balFore.klar && !balFore.andrad && balFore.klara === 4,
    'alla fyra byggnaderna är klara och balanseringen stämmer före borttagningen');

  const forePos4 = await bp.evaluate(() => DP.Plan.historik().pos);
  const bort = await bp.evaluate(() => {
    const P = DP.Plan;
    const ok = P.taBortByggnad('kasern2');
    const b = P.balanseringStatus();
    return {
      ok,
      finns: !!P.byggnad('kasern2'),
      ordning: P.byggnadsordning,
      aktiv: P.aktivId(),
      klara: P.klaraByggnader().length,
      klar: b.klar, andrad: b.andrad,
      rader: b.andringar.map(a => ({ typ: a.typ, text: a.text })),
      // Inget räknas om av sig självt (beslut 40): det sparade resultatet är orört
      balanserad: b.balanserad,
      text: P.historik().lista.slice(-1)[0]
    };
  });
  kontroll(bort.ok && !bort.finns && bort.ordning.indexOf('kasern2') < 0,
    'byggnaden är borta ur byggnadsordningen (' + bort.ordning.join(', ') + ')');
  kontroll(bort.klara === 3, 'den räknas inte längre med i balanseringen (' + bort.klara + ' klara)');
  kontroll(bort.andrad && !bort.klar,
    'Balansering är markerad som ändrad planering och har tappat grön bock');
  const raden = bort.rader.filter(r => r.typ === 'borttagen')[0];
  kontroll(!!raden && raden.text === 'Kasern 2 är borttagen och räknas inte med',
    'ändringen står i klartext och säger att byggnaden är borttagen: '
    + JSON.stringify(bort.rader.map(r => r.typ)));
  kontroll(bort.balanserad, 'balanseringens sparade resultat är orört – inget räknas om av sig självt');
  kontroll(bort.text === 'Ta bort byggnad Kasern 2',
    'borttagningen är ett steg i historiken i klartext ("' + bort.text + '")');
  kontroll(bp.fel.length === 0, 'inga JavaScript-fel när en byggnad tas bort ' + bp.fel.join(' | '));

  // ---- Ångra tar tillbaka byggnaden, planeringen och bocken ----
  await angra(bp);
  const tillbaka = await bp.evaluate(() => {
    const P = DP.Plan, b = P.balanseringStatus();
    return { finns: !!P.byggnad('kasern2'), namn: P.byggnadsNamn('kasern2'),
             ordning: P.byggnadsordning, klara: P.klaraByggnader().length,
             klar: b.klar, andrad: b.andrad, aktiv: P.aktivId(),
             // Planeringen kom tillbaka med byggnaden
             ronder: P.stateFor('kasern2').ronder.length };
  });
  kontroll(tillbaka.finns && tillbaka.namn === 'Kasern 2' && tillbaka.ordning.length === 4,
    'ett ångra tar tillbaka byggnaden på sin plats i ordningen');
  kontroll(tillbaka.ronder > 0 && tillbaka.klara === 4,
    'planeringen kom tillbaka med byggnaden (' + tillbaka.ronder + ' ronder)');
  kontroll(tillbaka.klar && !tillbaka.andrad,
    'grön bock på Balansering är tillbaka och ingenting är ändrat längre');
  kontroll(tillbaka.aktiv === 'kasern2',
    'ångra växlar till den byggnad som kom tillbaka (' + tillbaka.aktiv + ')');

  // Den sista byggnaden går inte att ta bort: vyerna behöver en byggnad att visa
  const sista = await bp.evaluate(() => {
    const P = DP.Plan;
    ['kasern1', 'kasern2', 'hangar'].forEach(id => P.taBortByggnad(id));
    return { ordning: P.byggnadsordning, nekad: P.taBortByggnad(P.byggnadsordning[0]),
             kvar: P.byggnadsordning.length };
  });
  kontroll(sista.ordning.length === 1 && sista.nekad === false && sista.kvar === 1,
    'den sista byggnaden går inte att ta bort (' + sista.ordning.join(', ') + ')');
  kontroll(bp.fel.length === 0, 'inga JavaScript-fel efter borttagningarna ' + bp.fel.join(' | '));
  await bp.close();

  // ------------------------------------------------------------------
  // Ett handritat plan: först en varning, sedan ritas bara det planet om
  // ------------------------------------------------------------------
  // Beslut 101 och berättelse 58. Kasern 1 är ritad rum för rum i `data/`, så ett rum som
  // läggs till där får sin plats ur regeln medan grannarna behåller sina ritade mått – och
  // de två koordinatsystemen är inte samma.
  const rp = await nySida(browser, URL_INDEX, 'kasern1');
  await rp.locator('.pl-steg[data-steg="byggnad"]').click();
  await vanta(rp, () => DP.Vyer.aktivt() === 'byggnad', 'Byggnad öppet');
  const rbf = rp.locator('#byggnadsflode');
  await rbf.locator('.steg-kort[data-bsteg="3"] .steg-huvud').click();
  await vanta(rp, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="3"] .steg-kropp'),
    'steg 3 öppet');

  // Innan något rörts är beskedet en **upplysning** och inte en varning: byggnaden är ritad,
  // men inget plan är halvt räknat än.
  const innan = await rp.evaluate(() => {
    const st = DP.Plan.rumStatus();
    return { handritad: st.handritad, blandade: st.blandade,
             notis: !!document.querySelector('#byggnadsflode .bf-notis'),
             varning: !!document.querySelector('#byggnadsflode .bf-ritaom') };
  });
  kontroll(innan.handritad && innan.blandade.length === 0,
    'Kasern 1 är handritad och inget plan blandar ritade och räknade rum ännu');
  kontroll(innan.notis && !innan.varning,
    'steg 3 visar en upplysning om den ritade byggnaden, ingen varning');

  // Ett nytt rum på ett ritat plan gör planet halvt räknat
  const forePos5 = await historiklangd(rp);
  const nyttRum = await rp.evaluate(() => {
    const P = DP.Plan, plan = P.byggnad().plan[0].id;
    const nyckel = P.laggTillRum({ plan, namn: 'Fikarum' });
    return { plan, nyckel };
  });
  await stegKlart(rp, forePos5, 'lägg till rum i ritad byggnad');
  await vanta(rp, () => !!document.querySelector('#byggnadsflode .bf-ritaom'), 'varningen');

  const efterRum = await rp.evaluate(({ plan }) => {
    const st = DP.Plan.rumStatus();
    const v = document.querySelector('#byggnadsflode .bf-ritaom');
    return {
      blandade: st.blandade,
      // Rummen överlappar: det nya ligger i regelns koordinatsystem, grannarna i sitt ritade
      overlapp: (() => {
        const f = DP.Planlosning.form(DP.Plan.byggnad());
        const pa = f.rum.filter(r => r.plan === plan && !r.skal && !r.iRum && r.rect);
        for (let i = 0; i < pa.length; i++) {
          for (let j = i + 1; j < pa.length; j++) {
            const a = pa[i].rect, b = pa[j].rect;
            if (a[0] < b[2] - 0.01 && b[0] < a[2] - 0.01 && a[1] < b[3] - 0.01 && b[1] < a[3] - 0.01) {
              return pa[i].nr + ' och ' + pa[j].nr;
            }
          }
        }
        return '';
      })(),
      text: v ? v.innerText : '',
      knapp: !!v && !!v.querySelector('button')
    };
  }, nyttRum);
  kontroll(efterRum.blandade.indexOf(nyttRum.plan) >= 0,
    'planet blandar nu ritade och räknade rum (' + efterRum.blandade.join(', ') + ')');
  kontroll(!!efterRum.overlapp,
    'rummen ligger över varandra i modellen, som beslut 101 förutser (' + efterRum.overlapp + ')');
  kontroll(/ligga över varandra/.test(efterRum.text) && efterRum.knapp,
    'steg 3 varnar i klartext och erbjuder att rita om planet');
  kontroll(efterRum.text.indexOf('plan ' + nyttRum.plan) >= 0,
    'varningen säger vilket plan det gäller ("' + efterRum.text.split('\n')[0] + '")');

  // ---- Rita om planet: frågan först, sedan läggs bara det planet om ----
  const andraPlanFore = await rp.evaluate(() => {
    const b = DP.Plan.byggnad(), p2 = b.plan[1].id;
    return { plan: p2, rekt: b.rum.filter(r => r.plan === p2).map(r => JSON.stringify(r.rect)) };
  });
  await rbf.locator('.bf-ritaom button').first().click();
  await vanta(rp, () => !!document.querySelector('.dlg'), 'frågan innan omritningen');
  const fragan = await rp.evaluate(() => document.querySelector('.dlg').innerText);
  kontroll(fragan.indexOf('Rita om plan ' + nyttRum.plan) >= 0 && /platsen i modellen/.test(fragan),
    'frågan säger vad omritningen gör innan den görs');
  kontroll(/rörs inte/.test(fragan),
    'frågan säger att rummens uppgifter och tillsynen inte rörs');

  const forePos6 = await historiklangd(rp);
  await rp.locator('.dlg button', { hasText: 'Rita om planet' }).click();
  await stegKlart(rp, forePos6, 'rita om planet');

  const omritat = await rp.evaluate(({ plan, nyckel }) => {
    const P = DP.Plan, b = P.byggnad(), st = P.rumStatus();
    const f = DP.Planlosning.form(b);
    const pa = f.rum.filter(r => r.plan === plan && !r.skal && !r.iRum && r.rect);
    let overlapp = '';
    for (let i = 0; i < pa.length; i++) {
      for (let j = i + 1; j < pa.length; j++) {
        const a = pa[i].rect, c = pa[j].rect;
        if (a[0] < c[2] - 0.01 && c[0] < a[2] - 0.01 && a[1] < c[3] - 0.01 && c[1] < a[3] - 0.01) {
          overlapp = pa[i].nr + ' och ' + pa[j].nr;
        }
      }
    }
    return {
      blandade: st.blandade, overlapp,
      // Rummens egna uppgifter rörs inte, bara platsen
      rum: b.rum.filter(r => r.plan === plan).map(r => ({ nr: r.nr, namn: r.namn, nta: r.nta, rect: r.rect })),
      nyttFinns: b.rum.some(r => DP.rumNyckel(r.plan, r.nr) === nyckel),
      text: P.historik().lista.slice(-1)[0]
    };
  }, nyttRum);

  kontroll(omritat.blandade.indexOf(nyttRum.plan) < 0 && omritat.blandade.length === 0,
    'planet blandar inte längre ritade och räknade rum');
  kontroll(!omritat.overlapp,
    'rummen på det omritade planet ligger inte över varandra' + (omritat.overlapp ? ' (' + omritat.overlapp + ')' : ''));
  kontroll(omritat.rum.every(r => r.rect === undefined),
    'planets ritade mått är borta, så regeln lägger ut hela planet (beslut 71)');
  kontroll(omritat.rum.every(r => r.nr && r.namn) && omritat.nyttFinns,
    'rummens nummer, benämningar och areor rörs inte av omritningen');
  kontroll(omritat.text === 'Kasern 1: rita om plan ' + nyttRum.plan + ' enligt byggnadstypens regel',
    'omritningen är ett steg i historiken i klartext ("' + omritat.text + '")');

  // Bara det planet: grannplanet står kvar som det är ritat (berättelse 58)
  const granne = await rp.evaluate(({ plan }) => ({
    rekt: DP.Plan.byggnad().rum.filter(r => r.plan === plan).map(r => JSON.stringify(r.rect))
  }), andraPlanFore);
  kontroll(granne.rekt.join('|') === andraPlanFore.rekt.join('|'),
    'grannplanet står kvar som det är ritat – bara det valda planet ritades om');

  // Ett ångra ger den ritade formen tillbaka
  await angra(rp);
  const angrad = await rp.evaluate(({ plan }) => ({
    ritade: DP.Plan.byggnad().rum.filter(r => r.plan === plan && r.rect).length,
    blandade: DP.Plan.rumStatus().blandade
  }), nyttRum);
  kontroll(angrad.ritade > 0 && angrad.blandade.length === 1,
    'ett ångra ger planet dess ritade form tillbaka (' + angrad.ritade + ' ritade rum)');

  await bild(rp, 'andra-byggnad-varning');

  // ---- Huvudvyn ryms på skärmen med varningen och steg 1 öppna ----
  // Panelen har sin egen rullning (beslut 112); det är **sidan** som inte får scrolla.
  const rymsVarning = await rp.evaluate(() => ({
    sida: document.documentElement.scrollHeight <= window.innerHeight + 1,
    hojd: document.documentElement.scrollHeight, fonster: window.innerHeight
  }));
  kontroll(rymsVarning.sida,
    'huvudvyn ryms utan att sidan scrollar med varningen i steg 3 ('
    + rymsVarning.hojd + ' av ' + rymsVarning.fonster + ' px)');

  // Steg 1 med namnbytet öppet: fältet, Spara och Avbryt får plats på rutnätets bredd
  await rbf.locator('.steg-kort[data-bsteg="1"] .steg-huvud').click();
  await vanta(rp, () => !!document.querySelector('#byggnadsflode .steg-kort[data-bsteg="1"] .steg-kropp'),
    'steg 1 öppet');
  await rbf.locator('button', { hasText: 'Byt namn' }).click();
  await vanta(rp, () => !!document.querySelector('#byggnadsflode input[data-falt="byggnadsnamn"]'),
    'namnfältet');
  await bild(rp, 'andra-byggnad-steg1');
  const rymsSteg1 = await rp.evaluate(() => {
    const f = document.querySelector('#byggnadsflode input[data-falt="byggnadsnamn"]');
    const panel = f.closest('.steg-kropp');
    return {
      sida: document.documentElement.scrollHeight <= window.innerHeight + 1,
      hojd: document.documentElement.scrollHeight, fonster: window.innerHeight,
      // Fältet och dess knappar ligger innanför steget och inte utanför kanten
      inom: f.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 1,
      taBort: !!document.querySelector('#byggnadsflode .bf-farligt button')
    };
  });
  kontroll(rymsSteg1.sida,
    'huvudvyn ryms utan att sidan scrollar med namnbytet öppet ('
    + rymsSteg1.hojd + ' av ' + rymsSteg1.fonster + ' px)');
  kontroll(rymsSteg1.inom, 'namnfältet ryms innanför stegets kant');
  kontroll(rymsSteg1.taBort, 'steg 1 har knappen Ta bort byggnaden');

  kontroll(rp.fel.length === 0, 'inga JavaScript-fel ' + rp.fel.join(' | '));
  await rp.close();
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
    await testPlanlosningen(browser);
    await testStegPlan(browser);
    await testInlasningsmodulen(browser);
    await testInlasningsfilenPlan(browser);
    await testStegRum(browser);
    await testStegInstallationer(browser);
    await testAndraByggnad(browser);
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
