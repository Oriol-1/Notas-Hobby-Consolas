// Usa la API prop=pageimages de MediaWiki para encontrar imágenes en artículos
// que la REST API no devuelve thumbnail
const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/4.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        res(get(r.headers.location)); r.resume(); return;
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ s: r.statusCode, b: d }));
    }).on('error', rej).setTimeout(12000, function () { this.destroy(); });
  });
}

// MediaWiki prop=pageimages (también busca imágenes dentro del artículo)
async function pageImages(title) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&titles='
      + encodeURIComponent(title) + '&prop=pageimages&pithumbsize=600&format=json';
    const r = await get(url);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    const pages = d.query && d.query.pages;
    if (!pages) return null;
    for (const pid of Object.keys(pages)) {
      if (pid === '-1') return null; // missing
      const p = pages[pid];
      if (p.thumbnail) return p.thumbnail.source;
    }
    return null;
  } catch (_) { return null; }
}

// MediaWiki prop=images (lista TODAS las imágenes del artículo, devuelve el primer [[File:...]])
async function allImages(title) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&titles='
      + encodeURIComponent(title) + '&prop=images&imlimit=10&format=json';
    const r = await get(url);
    if (r.s !== 200) return [];
    const d = JSON.parse(r.b);
    const pages = d.query && d.query.pages;
    if (!pages) return [];
    for (const pid of Object.keys(pages)) {
      if (pid === '-1') return [];
      const imgs = (pages[pid].images || [])
        .map(i => i.title)
        .filter(t => /\.(jpg|jpeg|png|webp)/i.test(t) && !/logo|icon|stub|commons|wikipe/i.test(t));
      return imgs;
    }
    return [];
  } catch (_) { return []; }
}

async function imageInfo(fileTitle) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&titles='
      + encodeURIComponent(fileTitle) + '&prop=imageinfo&iiprop=url&format=json';
    const r = await get(url);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    const pages = d.query && d.query.pages;
    if (!pages) return null;
    for (const pid of Object.keys(pages)) {
      const info = pages[pid].imageinfo;
      if (info && info[0]) return info[0].url;
    }
    return null;
  } catch (_) { return null; }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Para cada juego: lista de posibles títulos de Wikipedia a probar
const targets = [
  ['The Magical Quest Starring Mickey Mouse', 'Super Nintendo', [
    'The Magical Quest Starring Mickey Mouse',
    'Magical_Quest_Starring_Mickey_Mouse',
  ]],
  ['Wario Blast', 'Game Boy', [
    'Wario Blast: Featuring Bomberman!',
    'Wario Blast',
  ]],
  ['Skeleton Krew', 'Mega Drive', [
    'Skeleton Krew',
    'Skeleton Krew (video game)',
  ]],
  ['Ren And Stimpy', 'Mega Drive', [
    "The Ren & Stimpy Show: Stimpy's Invention",
    "Ren & Stimpy: Stimpy's Invention",
  ]],
  ['The Ottifants', 'Mega Drive', [
    'The Ottifants',
    'Ottifants',
    'The Ottifants (video game)',
  ]],
  ['Ottifants', 'Master System', [
    'The Ottifants',
    'Ottifants',
  ]],
  ['Ottifants', 'Game Gear', [
    'The Ottifants',
    'Ottifants',
  ]],
  ['Wimbledon', 'Mega Drive', [
    'Wimbledon (1993 video game)',
    'Wimbledon (Sega video game)',
    'Sega Sports',
  ]],
  ['Wimbledon 2', 'Master System', [
    'Wimbledon 2 (video game)',
    'Wimbledon (1993 video game)',
  ]],
  ['Wimbledon Championship Tennis', 'Master System', [
    'Wimbledon Championship Tennis',
    'Wimbledon Championship Tennis (video game)',
  ]],
  ['F-1 Racing Heavenly Symphony', 'Mega CD', [
    'F-1 Racing: Heavenly Symphony',
    'Heavenly Symphony',
    'F1 Racing Heavenly Symphony',
  ]],
  ['Summer Challenge', 'Mega Drive', [
    'Summer Challenge (video game)',
    'The Games: Summer Challenge',
    'Summer Challenge',
  ]],
  ['World Champ', 'NES', [
    'World Champ (video game)',
    'World Champ',
  ]],
  ['The Chessmaster', 'Super Nintendo', [
    'The Chessmaster',
    'Chessmaster',
    'Chessmaster (series)',
  ]],
  ['Solitaire Poker', 'Game Gear', [
    'Solitaire Poker',
  ]],
  ['4 in 1 Funpak', 'Game Boy', [
    '4-in-1 Funpak',
    '4 in 1 Funpak',
    '4-in-1 Fun Pak',
  ]],
  ['Victory Boxing', 'Saturn', [
    'Victory Boxing (1994 video game)',
    'Victory Boxing (video game)',
    'Victory Boxing',
  ]],
  ['World Cup Striker', 'Super Nintendo', [
    'World Cup Striker',
    'Striker (video game)',
    'World Cup Striker (video game)',
  ]],
  ['Shockwave 2', '3DO', [
    'Shockwave 2: Beyond the Limit',
    'Shockwave 2',
    'Shockwave Assault',
  ]],
];

async function findImg(titles) {
  for (const title of titles) {
    // intento 1: pageimages thumbnail
    let img = await pageImages(title);
    await delay(400);
    if (img) return { title, img };
    // intento 2: lista de imágenes del artículo
    const imgs = await allImages(title);
    await delay(400);
    if (imgs.length) {
      const url = await imageInfo(imgs[0]);
      await delay(400);
      if (url) return { title, img: url };
    }
  }
  return null;
}

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;
  const notFound = [];

  for (const [juego, consola, titles] of targets) {
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e) { console.log('?? no existe:', juego, consola); continue; }
    if (e.imagen_wiki) continue;

    const r = await findImg(titles);
    if (r) {
      e.imagen_wiki = r.img;
      applied++;
      console.log('✅', juego, '|', consola, '->', r.title);
      console.log('  ', r.img.substring(0, 90));
    } else {
      notFound.push({ juego, consola });
      console.log('❌', juego, '|', consola);
    }
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\n=== Aplicadas:', applied, '===');
  if (notFound.length) {
    console.log('\n=== Sin imagen definitivamente ===');
    notFound.forEach(x => console.log(' ❌', x.juego, '|', x.consola));
  }
}

run().catch(console.error);
