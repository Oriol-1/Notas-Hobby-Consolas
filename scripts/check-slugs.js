const https = require('https');
function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'Bot/1.0' } }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, b: d }));
  }).on('error', rej));
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function summary(t) {
  const enc = t.replace(/ /g, '_');
  const r = await get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(enc));
  if (r.s !== 200) return null;
  const d = JSON.parse(r.b);
  const img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || null;
  return { title: d.title, type: d.type, desc: d.description || '', img };
}
async function run() {
  const checks = [
    'The Games: Summer Challenge',
    'Skeleton Crew (video game)',
    'F-1 Racing: Heavenly Symphony',
    "The Ren & Stimpy Show: Stimpy's Invention",
    'Victory Boxing',
    '4-in-1 Fun Pak',
    'Wimbledon (video game)',
    'The Ottifants (video game)',
    'Solitaire Poker (video game)',
    'World Champ (NES)',
    'World Champ (boxing)',
  ];
  for (const s of checks) {
    const r = await summary(s);
    await delay(300);
    if (r) console.log('"' + s + '" ->', r.title, '| img:', r.img ? 'YES ' + r.img.substring(0, 60) : 'NO', '| type:', r.type);
    else console.log('"' + s + '" -> 404');
  }
}
run().catch(console.error);
