// Obtiene el wikitext de artículos y busca referencias a imágenes (File: o Image:)
const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/5.0' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      res(get(r.headers.location)); r.resume(); return;
    }
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, b: d }));
  }).on('error', rej).setTimeout(12000, function () { this.destroy(); }));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function getWikitext(title) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&titles='
    + encodeURIComponent(title) + '&prop=revisions&rvprop=content&rvslots=main&format=json';
  const r = await get(url);
  if (r.s !== 200) return null;
  const d = JSON.parse(r.b);
  const pages = d.query && d.query.pages;
  for (const pid of Object.keys(pages || {})) {
    if (pid === '-1') return null;
    const rev = pages[pid].revisions;
    if (rev && rev[0] && rev[0].slots && rev[0].slots.main) return rev[0].slots.main['*'];
  }
  return null;
}

async function commonsFileUrl(filename) {
  try {
    const fileTitle = filename.startsWith('File:') ? filename : 'File:' + filename;
    const url = 'https://en.wikipedia.org/w/api.php?action=query&titles='
      + encodeURIComponent(fileTitle) + '&prop=imageinfo&iiprop=url&format=json';
    const r = await get(url);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    const pages = d.query && d.query.pages;
    for (const pid of Object.keys(pages || {})) {
      if (pid === '-1') return null;
      const info = pages[pid].imageinfo;
      if (info && info[0]) return info[0].url;
    }
    return null;
  } catch (_) { return null; }
}

function extractImages(wikitext) {
  const fileRe = /\[\[(?:File|Image):([^\|\]]+)/gi;
  const images = [];
  let m;
  while ((m = fileRe.exec(wikitext)) !== null) {
    const fname = m[1].trim();
    if (/\.(jpg|jpeg|png|gif|svg|webp)/i.test(fname)) {
      images.push(fname);
    }
  }
  return [...new Set(images)];
}

async function tryArticle(title) {
  const wikitext = await getWikitext(title);
  if (!wikitext) return null;
  const images = extractImages(wikitext);
  console.log('  Found', images.length, 'images in article:', title);
  images.forEach(i => console.log('    -', i));
  for (const img of images) {
    const url = await commonsFileUrl(img);
    await delay(300);
    if (url) return { title, img, url };
  }
  return null;
}

// Articles that exist on Wikipedia but have no thumbnail
const articlesWithImages = [
  ['The Magical Quest Starring Mickey Mouse', 'Super Nintendo', [
    'The Magical Quest Starring Mickey Mouse',
  ]],
  ['Wario Blast', 'Game Boy', [
    'Wario Blast: Featuring Bomberman!',
  ]],
];

// Games still missing - try specific Commons search terms
const missingGames = [
  ['Skeleton Krew', 'Mega Drive'],
  ['Ren And Stimpy', 'Mega Drive'],
  ['The Ottifants', 'Mega Drive'],
  ['Ottifants', 'Master System'],
  ['Ottifants', 'Game Gear'],
  ['Wimbledon', 'Mega Drive'],
  ['Wimbledon 2', 'Master System'],
  ['Wimbledon Championship Tennis', 'Master System'],
  ['F-1 Racing Heavenly Symphony', 'Mega CD'],
  ['Summer Challenge', 'Mega Drive'],
  ['World Champ', 'NES'],
  ['Solitaire Poker', 'Game Gear'],
  ['4 in 1 Funpak', 'Game Boy'],
  ['Victory Boxing', 'Saturn'],
];

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;

  // 1. Try to extract images from existing Wikipedia articles
  for (const [juego, consola, titles] of articlesWithImages) {
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e || e.imagen_wiki) continue;
    console.log('\n⏳', juego, '|', consola);
    for (const t of titles) {
      const r = await tryArticle(t);
      await delay(300);
      if (r) {
        e.imagen_wiki = r.url;
        applied++;
        console.log('✅', juego, '|', consola, '->', r.img);
        break;
      }
    }
    if (!e.imagen_wiki) console.log('❌', juego, '|', consola, '- no images in article');
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\nAplicadas esta ronda:', applied);
  
  console.log('\n=== Estado final sin imagen ===');
  missingGames.forEach(([j, c]) => {
    const e = data.find(x => x.Juego === j && x.Consola === c);
    if (e && !e.imagen_wiki) console.log(' ❌', j, '|', c);
  });
}

run().catch(console.error);
