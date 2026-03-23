const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/3.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        res(get(r.headers.location)); r.resume(); return;
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ s: r.statusCode, b: d }));
    }).on('error', rej).setTimeout(12000, function () { this.destroy(); });
  });
}

async function summaryBySlug(slug) {
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

async function openSearch(q) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' + encodeURIComponent(q) + '&limit=3&format=json';
    const r = await get(url);
    if (r.s !== 200) return [];
    const d = JSON.parse(r.b);
    return (d[1] || []);
  } catch (_) { return []; }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// [juego, consola, [slug1, slug2, ...], openSearchQuery]
const candidates = [
  ['The Magical Quest Starring Mickey Mouse', 'Super Nintendo',
    ['The_Magical_Quest_Starring_Mickey_Mouse', 'Magical_Quest_Starring_Mickey_Mouse'],
    'The Magical Quest Starring Mickey Mouse SNES'],
  ['Wario Blast', 'Game Boy',
    ['Wario_Blast%3A_Featuring_Bomberman%21', 'Wario_Blast:_Featuring_Bomberman!', 'Wario_Blast'],
    'Wario Blast Featuring Bomberman Game Boy'],
  ['Skeleton Krew', 'Mega Drive',
    ['Skeleton_Krew', 'Skeleton_Krew_(video_game)'],
    'Skeleton Krew Mega Drive Core Design'],
  ['Ren And Stimpy', 'Mega Drive',
    ["The_Ren_&_Stimpy_Show:_Stimpy's_Invention", "The_Ren_%26_Stimpy_Show:_Stimpy%27s_Invention"],
    "Ren Stimpy Show Stimpy's Invention Sega"],
  ["Val d'Isère Championship", 'Super Nintendo',
    ["Val_d'Is%C3%A8re_Championship", 'Val_d%27Is%C3%A8re_Skiing_and_Snowboarding', "Val_d'Isere_Championship"],
    "Val d'Isere Championship SNES Loriciel"],
  ['Trivial Pursuit Genus Edition', 'Master System',
    ['Trivial_Pursuit_(video_game)', 'Trivial_Pursuit'],
    'Trivial Pursuit Genus Edition Master System'],
  ['The Ottifants', 'Mega Drive',
    ['The_Ottifants_(video_game)', 'The_Ottifants', 'Ottifants'],
    'Ottifants Mega Drive video game'],
  ['Ottifants', 'Master System',
    ['Ottifants_(video_game)', 'The_Ottifants_(video_game)', 'The_Ottifants'],
    'Ottifants Master System video game'],
  ['Ottifants', 'Game Gear',
    ['Ottifants_(video_game)', 'The_Ottifants_(video_game)', 'The_Ottifants'],
    'Ottifants Game Gear'],
  ['Super Motocross', 'Mega Drive 32X',
    ['Motocross_Championship_(video_game)', 'Motocross_Championship', 'Super_Motocross_32X'],
    'Motocross Championship Sega 32X'],
  ['Kick Off 3 European Challenge', 'Super Nintendo',
    ['Kick_Off_3:_European_Challenge', 'Kick_Off_3_European_Challenge', 'Kick_Off_3'],
    'Kick Off 3 European Challenge Super Nintendo'],
  ['Victory Boxing', 'Saturn',
    ['Victory_Boxing', 'Victory_Boxing_(video_game)', 'Victorious_Boxers'],
    'Victory Boxing Saturn 1995'],
  ['Shockwave 2', '3DO',
    ['Shockwave_2:_Beyond_the_Limit', 'Shockwave_2%3A_Beyond_the_Limit', 'Shockwave_(video_game)'],
    'Shockwave 2 Beyond Limit 3DO'],
  ['Wimbledon', 'Mega Drive',
    ['Wimbledon_(1993_video_game)', 'Wimbledon_(Sega_video_game)', 'Wimbledon_(video_game)'],
    'Wimbledon Sega Mega Drive tennis game'],
  ['Wimbledon 2', 'Master System',
    ['Wimbledon_2_(video_game)', 'Wimbledon_2', 'Wimbledon_Championship_Tennis'],
    'Wimbledon 2 Master System tennis Sega'],
  ['Wimbledon Championship Tennis', 'Master System',
    ['Wimbledon_Championship_Tennis', 'Wimbledon_Championship_Tennis_(video_game)'],
    'Wimbledon Championship Tennis Master System Sega'],
  ['Grandslam: The Tennis Tournament', 'Mega Drive',
    ['Grandslam:_The_Tennis_Tournament', 'Grandslam_The_Tennis_Tournament', 'Grand_Slam_Tennis'],
    'Grandslam Tennis Tournament Mega Drive'],
  ['4 in 1 Funpak', 'Game Boy',
    ['4-in-1_Funpak', '4_in_1_Funpak', 'Battletoads_%26_Double_Dragon'],
    '4 in 1 Fun Pak Game Boy'],
  ['The Legend of Prince Valiant', 'Game Boy',
    ['The_Legend_of_Prince_Valiant_(video_game)', 'The_Legend_of_Prince_Valiant', 'Kingdom_Crusade'],
    'Legend Prince Valiant video game Game Boy'],
  ['World Cup Striker', 'Super Nintendo',
    ['World_Cup_Striker', 'World_Cup_Striker_(video_game)', 'World_Soccer_(video_game)'],
    'World Cup Striker Super Nintendo Imagineer'],
  ['F-1 Racing Heavenly Symphony', 'Mega CD',
    ['F1_Racing_Heavenly_Symphony', 'F-1_Racing_Heavenly_Symphony', 'F-1_Racing%3A_Heavenly_Symphony'],
    'F-1 Racing Heavenly Symphony Mega CD Sega'],
  ['Summer Challenge', 'Mega Drive',
    ['Summer_Challenge_(Accolade)', 'Summer_Challenge_(Accolade_game)', 'The_Games:_Summer_Challenge'],
    'Summer Challenge Accolade Mega Drive athletics'],
  ['World Champ', 'NES',
    ['World_Champ_(video_game)', 'World_Champ', 'World_Champ_(NES)'],
    'World Champ NES boxing 1992'],
  ['The Chessmaster', 'Super Nintendo',
    ['The_Chessmaster', 'The_Chessmaster_(video_game)', 'Chessmaster', 'Chessmaster_(series)'],
    'The Chessmaster SNES Super Nintendo chess'],
  ['Solitaire Poker', 'Game Gear',
    ['Solitaire_Poker', 'Solitaire_Poker_(video_game)'],
    'Solitaire Poker Game Gear Sega'],
  ['Parason Stars', 'Game Boy',
    ['Parason_Stars', 'Parasol_Stars', 'Parasol_Stars:_The_Story_of_Bubble_Bobble_III'],
    'Parasol Stars Game Boy Taito'],
  ['Invasion Alienigena', 'Mega Drive',
    ['Bubsy_(video_game)', 'Bubsy_in_Claws_Encounters_of_the_Furred_Kind'],
    'Bubsy Claws Encounters Mega Drive'],
  ['Solitaire Poker', 'Game Gear',
    ['Solitaire_Poker'],
    null],
];

async function tryGame(juego, consola, slugs, query) {
  // Try direct slugs
  for (const slug of slugs) {
    const r = await summaryBySlug(slug);
    await delay(400);
    if (r) return r;
  }
  // Try OpenSearch if provided
  if (query) {
    const results = await openSearch(query);
    await delay(400);
    for (const title of results) {
      const slug = encodeURIComponent(title.replace(/ /g, '_'));
      const r = await summaryBySlug(slug);
      await delay(400);
      if (r) return r;
    }
  }
  return null;
}

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;
  const notFound = [];
  const seen = new Set();

  for (const [juego, consola, slugs, query] of candidates) {
    const key = juego + '|' + consola;
    if (seen.has(key)) continue; // evitar duplicar si aparece 2 veces
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e) { console.log('?? no existe en datos:', juego, consola); continue; }
    if (e.imagen_wiki) { seen.add(key); continue; } // ya tiene

    const r = await tryGame(juego, consola, slugs, query);
    if (r) {
      e.imagen_wiki = r.img; applied++;
      seen.add(key);
      console.log('✅', juego, '|', consola, '->', r.title);
      console.log('  ', r.img.substring(0, 90));
    } else {
      seen.add(key);
      notFound.push({ juego, consola });
    }
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\n=== Aplicadas:', applied, '===');
  if (notFound.length) {
    console.log('\n=== Sin imagen (definitivos) ===');
    notFound.forEach(x => console.log(' ❌', x.juego, '|', x.consola));
  }
}

run().catch(console.error);
