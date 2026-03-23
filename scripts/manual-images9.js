// Intento final: busca con múltiples estrategias los juegos que quedan
const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/8.0' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      res(get(r.headers.location)); r.resume(); return;
    }
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, b: d }));
  }).on('error', rej).setTimeout(12000, function () { this.destroy(); }));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function summary(slug) {
  try {
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + slug;
    const r = await get(url);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    if (d.type === 'disambiguation') return null;
    const img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || null;
    return img ? { title: d.title, img } : null;
  } catch (_) { return null; }
}

// Última lista de slugs/títulos muy específicos a probar
const finalAttempts = [
  // Wimbledon Championship Tennis - Sega 1992
  ['Wimbledon Championship Tennis', 'Master System', [
    'Wimbledon_Championship_Tennis_%281992_video_game%29',
    'Wimbledon_%281992_video_game%29',
    'Super_Tennis_%28Sega%29',
    'Final_Match_Tennis',
  ]],
  // Wimbledon - Sega 1993 for MD/MS
  ['Wimbledon', 'Mega Drive', [
    'Wimbledon_%281993_video_game%29',
    'Super_Tennis_Champions',
    'Advantage_Tennis',
  ]],
  // Wimbledon 2 - Master System sequel
  ['Wimbledon 2', 'Master System', [
    'Wimbledon_2%3A_Return_of_the_Champions',
    'Wimbledon_2_Return_of_the_Champions',
    'Wimbledon_II',
    'Super_Tennis_%28Master_System%29',
  ]],
  // Ottifants - might have article at "The Ottifants (video game)"
  ['Ottifants', 'Master System', [
    'Ottifants_%28video_game%29',
    'The_Ottifants_%28game%29',
  ]],
  ['Ottifants', 'Game Gear', [
    'Ottifants_%28video_game%29',
  ]],
  // Skeleton Krew - Core Design 1994 MD/32X game
  ['Skeleton Krew', 'Mega Drive', [
    'Skeleton_Krew_%28video_game%29',
    'Skeleton_Krew_%28game%29',
  ]],
  // Ren And Stimpy MD - Stimpy's Invention
  ['Ren And Stimpy', 'Mega Drive', [
    'The_Ren_%26_Stimpy_Show%3A_Stimpy%27s_Invention',
    'Ren_%26_Stimpy%3A_Stimpy%27s_Invention',
  ]],
  // F-1 Racing Heavenly Symphony Mega CD
  ['F-1 Racing Heavenly Symphony', 'Mega CD', [
    'F-1_Racing%3A_Heavenly_Symphony',
    'F-1_Racing_-_Heavenly_Symphony',
    'Heavenly_Symphony_%28video_game%29',
    'F1_Racing_Heavenly_Symphony',
  ]],
  // Summer Challenge MD - Accolade athletics 1992
  ['Summer Challenge', 'Mega Drive', [
    'The_Games%3A_Summer_Challenge',
    'The_Games%3A_Summer_Challenge_%28video_game%29',
    'Summer_Games_%28Commodore_64%29',
    'Summer_Challenge_%28video_game%29',
  ]],
  // World Champ NES - Video System boxing 1992
  ['World Champ', 'NES', [
    'World_Champ_%28NES%29',
    'World_Champ_%28Video_System%29',
  ]],
  // 4 in 1 Funpak GB
  ['4 in 1 Funpak', 'Game Boy', [
    '4-in-1_Funpak_%28Game_Boy%29',
    '4_in_1_Funpak',
    'Fun_Pak_%28video_game%29',
    'Quattro_Sports',
  ]],
  // Solitaire Poker GG
  ['Solitaire Poker', 'Game Gear', [
    'Solitaire_Poker_%28Sega%29',
    'Poker_Face_Paul_%27s_Solitaire',
  ]],
  // Victory Boxing Saturn - Victor Interactive 1994
  ['Victory Boxing', 'Saturn', [
    'Victory_Boxing_%281994%29',
    'Power_Athletes_%28video_game%29',
    'Full_Contact_%28video_game%29',
  ]],
];

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;

  for (const [juego, consola, slugs] of finalAttempts) {
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e || e.imagen_wiki) continue;

    for (const slug of slugs) {
      const r = await summary(slug);
      await delay(400);
      if (r) {
        e.imagen_wiki = r.img;
        applied++;
        console.log('✅', juego, '|', consola, '-->', r.title);
        console.log('  ', r.img.substring(0, 90));
        break;
      }
    }
    if (!e.imagen_wiki) console.log('❌', juego, '|', consola);
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\nAplicadas:', applied);

  const sinImg = data.filter(j => {
    const fw = j.imagen_wiki && j.imagen_wiki.trim();
    const fl = j.imagen_local && j.imagen_local.trim();
    return !fw && !fl;
  });
  console.log('\nTotal definitivamente sin imagen:', sinImg.length);
  sinImg.forEach(j => console.log(' -', j.Juego, '|', j.Consola));
}

run().catch(console.error);
