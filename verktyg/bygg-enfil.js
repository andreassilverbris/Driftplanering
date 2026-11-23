/*
 * Bygger en fristående HTML-fil där all CSS och JavaScript ligger inbäddad.
 * Filen kan öppnas direkt från datorn utan webbserver eller nätverk.
 *
 *   node verktyg/bygg-enfil.js   ->  dist/driftplanering.html
 */
const fs = require('fs');
const path = require('path');

const rot = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(rot, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, fil) =>
  '<style>\n' + fs.readFileSync(path.join(rot, fil), 'utf8') + '\n</style>');

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, fil) =>
  '<script>\n' + fs.readFileSync(path.join(rot, fil), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>');

fs.mkdirSync(path.join(rot, 'dist'), { recursive: true });
fs.writeFileSync(path.join(rot, 'dist', 'driftplanering.html'), html);
console.log('dist/driftplanering.html', Math.round(html.length / 1024) + ' kB');
