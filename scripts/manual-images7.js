// Busca en English Wikipedia (Fair Use images) usando imageinfo de en.wikipedia.org
// Muchas portadas de juegos están en Wikipedia EN como "non-free content"
const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/6.0' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      res(get(r.headers.location)); r.resume(); return;
    }
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, b: d }));
  }).on('error', rej).setTimeout(12000, function () { this.destroy(); }));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Usa la API de imageinfo de en.wikipedia (incluye non-free/fair use)
async function enWikiFileUrl(filename) {
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

// Para cada juego, lista de posibles filenames incluyendo non-free content de en.wikipedia
const games = [
  ['The Magical Quest Starring Mickey Mouse', 'Super Nintendo', [
    'The Magical Quest Starring Mickey Mouse SNES.jpg',
    'MagicalQuestSuperNES.jpg',
    'The Magical Quest cover.jpg',
    'Magical Quest SNES.jpg',
    'Magical quest capcom.jpg',
  ]],
  ['Wario Blast', 'Game Boy', [
    'Wario Blast Featuring Bomberman GB.jpg',
    'WarioBlastGB.jpg',
    'Wario Blast cover.jpg',
    'Wario blast boxart.jpg',
    'WarioBlastFFB.jpg',
    'Wario blast featuring bomberman game boy.jpg',
  ]],
  ['Skeleton Krew', 'Mega Drive', [
    'Skeleton Krew cover.jpg',
    'SkeletonKrew.jpg',
    'Skeleton Krew Genesis.jpg',
    'Skeleton krew sega.jpg',
  ]],
  ['Ren And Stimpy', 'Mega Drive', [
    "Ren and Stimpy Stimpy's Invention MD.jpg",
    "RenStimpyStimpysInvention.jpg",
    "Stimpy's Invention cover.jpg",
    "The Ren & Stimpy Show Stimpy's Invention.jpg",
    'Ren & Stimpy Sega Genesis.jpg',
  ]],
  ['The Ottifants', 'Mega Drive', [
    'Ottifants Mega Drive.jpg',
    'TheOttifants.jpg',
    'Ottifants Sega.jpg',
    'The Ottifants Sega Genesis.jpg',
  ]],
  ['Ottifants', 'Master System', [
    'Ottifants Master System.jpg',
    'Ottifants SMS.jpg',
    'TheOttifants SMS.jpg',
  ]],
  ['Ottifants', 'Game Gear', [
    'Ottifants Game Gear.jpg',
    'Ottifants GG.jpg',
    'TheOttifants GG.jpg',
  ]],
  ['Wimbledon', 'Mega Drive', [
    'Wimbledon Sega Game.jpg',
    'Wimbledon MD cover.jpg',
    'WimbledonMD.jpg',
    'Wimbledon Mega Drive cover.jpg',
  ]],
  ['Wimbledon 2', 'Master System', [
    'Wimbledon 2 cover.jpg',
    'Wimbledon2SMS.jpg',
    'Wimbledon 2 SMS.jpg',
  ]],
  ['Wimbledon Championship Tennis', 'Master System', [
    'Wimbledon Championship Tennis cover.jpg',
    'WimbledonChampionshipTennis SMS.jpg',
  ]],
  ['F-1 Racing Heavenly Symphony', 'Mega CD', [
    'F-1 Racing Heavenly Symphony.jpg',
    'F1RacingHeavenlySymphony.jpg',
    'Heavenly Symphony cover.jpg',
    'F1 Heavenly Symphony Sega CD.jpg',
  ]],
  ['Summer Challenge', 'Mega Drive', [
    'Summer Challenge Sega.jpg',
    'Games Summer Challenge.jpg',
    'SummerChallenge.jpg',
    'The Games Summer Challenge cover.jpg',
    'Summer challenge accolade cover.jpg',
  ]],
  ['World Champ', 'NES', [
    'World Champ NES cover.jpg',
    'WorldChampNES.jpg',
    'World Champ Nintendo.jpg',
    'WorldChamp NES.jpg',
  ]],
  ['Solitaire Poker', 'Game Gear', [
    'Solitaire Poker GG.jpg',
    'SolitairePoker.jpg',
    'Solitaire Poker Sega.jpg',
  ]],
  ['4 in 1 Funpak', 'Game Boy', [
    '4-in-1 Funpak cover.jpg',
    '4in1FunPak GB.jpg',
    '4 in 1 Funpak GB.jpg',
  ]],
  ['Victory Boxing', 'Saturn', [
    'Victory Boxing Saturn.jpg',
    'VictoryBoxingSaturn.jpg',
    'Victory Boxing 1994.jpg',
    'Victor Interactive Victory Boxing.jpg',
  ]],
  ['The Chessmaster', 'Super Nintendo', [
    'Chessmaster SNES.jpg',
    'The Chessmaster SNES.jpg',
    'Chessmaster Super Nintendo.jpg',
    'TheChessmaster SNES.jpg',
    'Chessmaster 4000 Turbo cover.jpg',
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
      const url = await enWikiFileUrl(fname);
      await delay(250);
      if (url) { found = { fname, url }; break; }
    }

    if (found) {
      e.imagen_wiki = found.url;
      applied++;
      console.log('✅', juego, '|', consola, '->', found.fname, '->', found.url.substring(0, 80));
    } else {
      notFound.push({ juego, consola });
      process.stdout.write('.');
    }
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\n\n=== Aplicadas:', applied, '===');
  if (notFound.length) {
    console.log('\n=== Sin imagen definitivos ===');
    notFound.forEach(x => console.log(' ❌', x.juego, '|', x.consola));
  }
}

run().catch(console.error);
