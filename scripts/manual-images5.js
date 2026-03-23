// Buscar imágenes por nombres de archivo específicos conocidos en Wikimedia Commons
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

async function commonsFileUrl(filename) {
  try {
    const fileTitle = filename.startsWith('File:') ? filename : 'File:' + filename;
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&titles='
      + encodeURIComponent(fileTitle) + '&prop=imageinfo&iiprop=url&format=json';
    const r = await get(url);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    const pages = d.query && d.query.pages;
    for (const pid of Object.keys(pages || {})) {
      if (pid === '-1') return null; // file not found
      const info = pages[pid].imageinfo;
      if (info && info[0]) return info[0].url;
    }
    return null;
  } catch (_) { return null; }
}

// For each game, try a list of potential Commons file names
const games = [
  ['The Magical Quest Starring Mickey Mouse', 'Super Nintendo', [
    'The Magical Quest Starring Mickey Mouse.jpg',
    'Magical Quest Starring Mickey Mouse.jpg',
    'MagicalQuestSNES.jpg',
    'Magical Quest cover.jpg',
    'Magical quest snes boxart.png',
  ]],
  ['Wario Blast', 'Game Boy', [
    'Wario Blast Featuring Bomberman.jpg',
    'Wario Blast cover.jpg',
    'WarioBlast.jpg',
    'Wario blast featuring bomberman boxart.png',
    'Wario Blast Featuring Bomberman! North American box art.jpg',
  ]],
  ['Skeleton Krew', 'Mega Drive', [
    'Skeleton Krew.jpg',
    'SkeletonKrew.jpg',
    'Skeleton Krew Megadrive.jpg',
    'Skeleton krew.jpg',
  ]],
  ['Ren And Stimpy', 'Mega Drive', [
    "Ren and Stimpy Stimpy's Invention.jpg",
    "Stimpy's Invention.jpg",
    'Ren Stimpy Stimpys Invention cover.jpg',
    "The Ren & Stimpy Show- Stimpy's Invention coverart.png",
  ]],
  ['The Ottifants', 'Mega Drive', [
    'The Ottifants.jpg',
    'Ottifants.jpg',
    'Ottifants Mega Drive.jpg',
    'The Ottifants MD.jpg',
  ]],
  ['Ottifants', 'Master System', [
    'The Ottifants.jpg',
    'Ottifants.jpg',
    'Ottifants Master System.jpg',
  ]],
  ['Ottifants', 'Game Gear', [
    'The Ottifants.jpg',
    'Ottifants.jpg',
    'Ottifants Game Gear.jpg',
  ]],
  ['Wimbledon', 'Mega Drive', [
    'Wimbledon game.jpg',
    'Wimbledon Sega.jpg',
    'Wimbledon Mega Drive.jpg',
    'Wimbledon 1993 game.jpg',
    'Wimbledon (Sega).jpg',
  ]],
  ['Wimbledon 2', 'Master System', [
    'Wimbledon 2.jpg',
    'Wimbledon 2 game.jpg',
    'Wimbledon 2 Master System.jpg',
  ]],
  ['Wimbledon Championship Tennis', 'Master System', [
    'Wimbledon Championship Tennis.jpg',
    'Wimbledon Championship Tennis Master System.jpg',
    'WimbledonChampionshipTennis.jpg',
  ]],
  ['F-1 Racing Heavenly Symphony', 'Mega CD', [
    'F-1 Racing Heavenly Symphony.jpg',
    'F1 Racing Heavenly Symphony Mega CD.jpg',
    'Heavenly Symphony.jpg',
    'F1HeavenlySymphony.jpg',
  ]],
  ['Summer Challenge', 'Mega Drive', [
    'Summer Challenge.jpg',
    'The Games Summer Challenge.jpg',
    'Summer Challenge Accolade.jpg',
    'The Games Summer Challenge cover.jpg',
  ]],
  ['World Champ', 'NES', [
    'World Champ NES.jpg',
    'World Champ.jpg',
    'WorldChamp.jpg',
    'World Champ boxing NES.jpg',
  ]],
  ['Solitaire Poker', 'Game Gear', [
    'Solitaire Poker.jpg',
    'Solitaire Poker Game Gear.jpg',
    'SolitairePoker.jpg',
  ]],
  ['4 in 1 Funpak', 'Game Boy', [
    '4-in-1 Funpak.jpg',
    '4 in 1 Funpak.jpg',
    '4in1FunPak.jpg',
    '4-in-1 Fun Pak.jpg',
  ]],
  ['Victory Boxing', 'Saturn', [
    'Victory Boxing.jpg',
    'Victory Boxing Saturn.jpg',
    'VictoryBoxing.jpg',
    'Victory Boxing 1994.jpg',
  ]],
];

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;
  const notFound = [];

  for (const [juego, consola, filenames] of games) {
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e) { console.log('?? no existe:', juego); continue; }
    if (e.imagen_wiki) continue;

    let found = null;
    for (const fname of filenames) {
      const url = await commonsFileUrl(fname);
      await delay(250);
      if (url) { found = { fname, url }; break; }
    }

    if (found) {
      e.imagen_wiki = found.url;
      applied++;
      console.log('✅', juego, '|', consola, '->', found.fname);
    } else {
      notFound.push({ juego, consola });
      console.log('❌', juego, '|', consola);
    }
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\n=== Aplicadas:', applied, '===');
  if (notFound.length) {
    console.log('\n=== Sin imagen ===');
    notFound.forEach(x => console.log(' ❌', x.juego, '|', x.consola));
  }
}

run().catch(console.error);
