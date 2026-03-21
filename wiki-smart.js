// wiki-smart.js — Búsqueda inteligente de imágenes en Wikipedia
// Estrategias: 1) Alias map, 2) Variantes directas con consola+marca+año,
//              3) OpenSearch con dimensiones, 4) OpenSearch solo nombre
// Solo procesa juegos con imagen="" AND imagen_wiki=""

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'datos.json';
const DELAY_MS = 700;
const SAVE_EVERY = 20;

// ──────────────────────────────────────────────
// ALIAS MAP: nombre_normalizado → slug Wikipedia
// ──────────────────────────────────────────────
const ALIAS_MAP = {
  // Smurfs
  'los pitufos': 'The_Smurfs_(video_game)',
  'los pitufos (mega drive)': 'The_Smurfs_(video_game)',
  'los pitufos (game boy)': 'The_Smurfs_(1994_video_game)',
  'los pitufos (nes)': 'The_Smurfs_(video_game)',
  'the smurfs': 'The_Smurfs_(video_game)',
  // Disney
  'el rey leon': 'The_Lion_King_(video_game)',
  'the lion king': 'The_Lion_King_(video_game)',
  'aladdin': 'Aladdin_(1993_Sega_video_game)',
  'aladdin (snes)': 'Aladdin_(1993_Capcom_video_game)',
  'the jungle book': 'The_Jungle_Book_(video_game)',
  'el libro de la selva': 'The_Jungle_Book_(video_game)',
  'the little mermaid': 'The_Little_Mermaid_(video_game)',
  'la sirenita': 'The_Little_Mermaid_(video_game)',
  'beauty and the beast': 'Beauty_and_the_Beast_(video_game)',
  'la bella y la bestia': 'Beauty_and_the_Beast_(video_game)',
  'the rescuers down under': 'The_Rescuers_Down_Under_(video_game)',
  // Mickey
  'mickey mania': 'Mickey_Mania',
  'mickey mania (mega drive)': 'Mickey_Mania',
  'mickey mania (snes)': 'Mickey_Mania',
  'mickey mania (game boy)': 'Mickey_Mania',
  'world of illusion starring mickey mouse': 'World_of_Illusion_Starring_Mickey_Mouse',
  'land of illusion starring mickey mouse': 'Land_of_Illusion_Starring_Mickey_Mouse',
  'legend of illusion starring mickey mouse': 'Legend_of_Illusion_Starring_Mickey_Mouse',
  // Contra
  'probotector': 'Probotector',
  'probotector 2': 'Contra:_The_Alien_Wars',
  'probotector ii: return of evil forces': 'Contra_(video_game)',
  'super probotector: alien rebels': 'Contra_III:_The_Alien_Wars',
  'contra: the alien wars': 'Contra:_The_Alien_Wars',
  'contra iii: the alien wars': 'Contra_III:_The_Alien_Wars',
  // Dragon Ball
  'dragon ball z 3': 'Dragon_Ball_Z:_Super_Butōden_3',
  'dragon ball z: super butoden 3': 'Dragon_Ball_Z:_Super_Butōden_3',
  'dragon ball z 2': 'Dragon_Ball_Z:_Super_Butōden_2',
  'dragon ball z: super butoden 2': 'Dragon_Ball_Z:_Super_Butōden_2',
  'dragon ball z': 'Dragon_Ball_Z:_Super_Butōden',
  'dragon ball z: super butoden': 'Dragon_Ball_Z:_Super_Butōden',
  'dragon ball z: legendary super warriors': 'Dragon_Ball_Z:_Legendary_Super_Warriors',
  'dragon ball z: the legendary super warriors': 'Dragon_Ball_Z:_Legendary_Super_Warriors',
  // Sonic
  'sonic chaos': 'Sonic_the_Hedgehog_Chaos',
  'sonic the hedgehog chaos': 'Sonic_the_Hedgehog_Chaos',
  'sonic triple trouble': 'Sonic_the_Hedgehog:_Triple_Trouble',
  'sonic the hedgehog: triple trouble': 'Sonic_the_Hedgehog:_Triple_Trouble',
  'sonic blast': 'Sonic_Blast',
  'sonic labyrinth': 'Sonic_Labyrinth',
  'sonic drift': 'Sonic_Drift',
  'sonic drift 2': 'Sonic_Drift_2',
  'sonic spinball': 'Sonic_the_Hedgehog_Spinball',
  'sonic the hedgehog spinball': 'Sonic_the_Hedgehog_Spinball',
  'dr robotnik mean bean machine': "Dr._Robotnik's_Mean_Bean_Machine",
  'dr. robotnik mean bean machine': "Dr._Robotnik's_Mean_Bean_Machine",
  // Wario
  'wario blast': 'Wario_Blast:_Featuring_Bomberman!',
  'wario blast: featuring bomberman!': 'Wario_Blast:_Featuring_Bomberman!',
  // Ninja Gaiden
  'shadow warriors': 'Ninja_Gaiden_(NES_video_game)',
  'ninja gaiden': 'Ninja_Gaiden_(NES_video_game)',
  // Dino Dini
  "dino dini's soccer": "Dino_Dini's_Soccer",
  'dino dinis soccer': "Dino_Dini's_Soccer",
  'dino dini soccer': "Dino_Dini's_Soccer",
  // Micro Machines
  'micro machines 2': 'Micro_Machines_2:_Turbo_Tournament',
  'micro machines 2: turbo tournament': 'Micro_Machines_2:_Turbo_Tournament',
  'micro machines 96': "Micro_Machines_V3",
  // Another World
  'another world': 'Another_World_(video_game)',
  'out of this world': 'Another_World_(video_game)',
  // Discworld
  'mundodisco': 'Discworld_(video_game)',
  'discworld': 'Discworld_(video_game)',
  // SNES shooters
  'super aleste': 'Space_Megaforce',
  'space megaforce': 'Space_Megaforce',
  // Power Strike
  'power strike ii': 'GG_Aleste_II',
  'gg aleste ii': 'GG_Aleste_II',
  'gg aleste': 'GG_Aleste',
  // Desert Demolition
  'desert demolition': 'Desert_Demolition_Starring_Road_Runner_and_Wile_E._Coyote',
  'desert demolition starring road runner and wile e. coyote': 'Desert_Demolition_Starring_Road_Runner_and_Wile_E._Coyote',
  // Mansion of Hidden Souls
  'la mansion de las almas ocultas': 'Mansion_of_Hidden_Souls',
  'mansion of hidden souls': 'Mansion_of_Hidden_Souls',
  // Asterix
  'asterix y el poder de los dioses': 'Astérix_&_Obélix',
  'asterix & obelix': 'Astérix_&_Obélix',
  // Tintin
  'tintin en el tibet': 'Tintin_in_Tibet_(video_game)',
  'tintin in tibet': 'Tintin_in_Tibet_(video_game)',
  // Skeleton Krew
  'skeleton krew': 'Skeleton_Krew',
  // Cannon Fodder
  'cannon fodder': 'Cannon_Fodder_(video_game)',
  // Psycho Pinball
  'psycho pinball': 'Psycho_Pinball',
  // Shining Force
  'shining force cd': 'Shining_Force_CD',
  // Olympic Games / Summer Games
  'olympic summer games': 'Olympic_Summer_Games_(video_game)',
  'olympic games': 'Olympic_Summer_Games_(video_game)',
  // Theme Park
  'theme park': 'Theme_Park_(video_game)',
  // Brutal: Paws of Fury
  'brutal: paws of fury': 'Brutal:_Paws_of_Fury',
  'brutal paws of fury': 'Brutal:_Paws_of_Fury',
  // Judge Dredd
  'judge dredd': 'Judge_Dredd_(video_game)',
  // Batman
  'batman returns': 'Batman_Returns_(video_game)',
  'batman forever': 'Batman_Forever_(video_game)',
  // Captain America
  'captain america and the avengers': 'Captain_America_and_the_Avengers',
  'capitan america y los vengadores': 'Captain_America_and_the_Avengers',
  // Goofy's Hysterical History Tour
  "goofy's hysterical history tour": "Goofy's_Hysterical_History_Tour",
  'goofy hysterical history tour': "Goofy's_Hysterical_History_Tour",
  // Quackshot  
  'quackshot starring donald duck': 'QuackShot',
  'quackshot': 'QuackShot',
  // Donald Duck – Deep Duck Trouble
  'deep duck trouble starring donald duck': 'Deep_Duck_Trouble_Starring_Donald_Duck',
  'deep duck trouble': 'Deep_Duck_Trouble_Starring_Donald_Duck',
  // TaleSpin
  'talespin': 'TaleSpin_(video_game)',
  'tale spin': 'TaleSpin_(video_game)',
  // Chip 'n Dale / Rescue Rangers
  "chip 'n dale: rescue rangers": "Chip_%27n_Dale_Rescue_Rangers_(video_game)",
  'chip n dale rescue rangers': "Chip_%27n_Dale_Rescue_Rangers_(video_game)",
  // DuckTales
  'ducktales': 'DuckTales_(video_game)',
  'ducktales 2': 'DuckTales_2',
  // Darkwing Duck
  'darkwing duck': 'Darkwing_Duck_(video_game)',
  // Gargoyles
  'gargoyles': 'Gargoyles_(video_game)',
  // Animaniacs
  'animaniacs': 'Animaniacs_(video_game)',
  // Tiny Toon Adventures
  'tiny toon adventures: buster busts loose': 'Tiny_Toon_Adventures:_Buster_Busts_Loose!',
  'tiny toon adventures': 'Tiny_Toon_Adventures_(NES_video_game)',
  // Ren & Stimpy
  "the ren & stimpy show: stimpy's invention": "The_Ren_&_Stimpy_Show:_Stimpy's_Invention",
  "ren & stimpy: stimpy's invention": "The_Ren_&_Stimpy_Show:_Stimpy's_Invention",
  // Beavis and Butt-head
  'beavis and butt-head': 'Beavis_and_Butt-Head_(video_game)',
  // Earthworm Jim
  'earthworm jim 2': 'Earthworm_Jim_2',
  'earthworm jim': 'Earthworm_Jim_(video_game)',
  // Cool Spot
  'cool spot': 'Cool_Spot_(video_game)',
  // Bubba N Stix
  'bubba n stix': 'Bubba_N_Stix',
  // Toy Story
  'toy story': 'Toy_Story_(video_game)',
  // Pocahontas
  'pocahontas': 'Pocahontas_(video_game)',
  // Hercules
  'hercules': 'Hercules_(video_game)',
  // Tarzan
  'tarzan': 'Tarzan_(1999_video_game)',
  // FIFA
  'fifa international soccer': 'FIFA_International_Soccer',
  'fifa soccer 95': 'FIFA_Soccer_95',
  'fifa soccer 96': 'FIFA_Soccer_96',
  // NBA
  'nba live 95': 'NBA_Live_95',
  'nba live 96': 'NBA_Live_96',
  'nba jam': 'NBA_Jam_(video_game)',
  'nba jam tournament edition': 'NBA_Jam_Tournament_Edition',
  // NHL
  'nhl hockey': 'NHL_Hockey_(video_game)',
  'nhl 94': 'NHL_94',
  'nhl 95': 'NHL_95',
  'nhl 96': 'NHL_96',
  // Madden NFL
  'madden nfl 95': 'Madden_NFL_95',
  'madden nfl 96': 'Madden_NFL_96',
  // Tecmo
  'tecmo super bowl': 'Tecmo_Super_Bowl',
  // Sensible Soccer
  'sensible soccer': 'Sensible_Soccer',
  'international sensible soccer': 'Sensible_Soccer',
  // Striker
  'striker': 'Striker_(video_game)',
  // International Superstar Soccer
  'international superstar soccer': 'International_Superstar_Soccer',
  // Pele Soccer
  "pele's soccer": "Pelé's_Soccer",
  // Golden Axe
  'golden axe': 'Golden_Axe_(video_game)',
  'golden axe ii': 'Golden_Axe_II',
  'golden axe iii': 'Golden_Axe_III',
  // Streets of Rage
  'streets of rage': 'Streets_of_Rage_(video_game)',
  'bare knuckle': 'Streets_of_Rage_(video_game)',
  'bare knuckle ii': 'Streets_of_Rage_2',
  'bare knuckle iii': 'Streets_of_Rage_3',
  // Mortal Kombat
  'mortal kombat': 'Mortal_Kombat_(video_game)',
  'mortal kombat ii': 'Mortal_Kombat_II',
  'mortal kombat 3': 'Mortal_Kombat_3',
  // Street Fighter
  'street fighter ii': 'Street_Fighter_II:_The_World_Warrior',
  "street fighter ii': champion edition": "Street_Fighter_II'_Champion_Edition",
  'super street fighter ii': 'Super_Street_Fighter_II',
  'street fighter ii turbo: hyper fighting': 'Street_Fighter_II_Turbo:_Hyper_Fighting',
  // Virtua Fighter
  'virtua fighter': 'Virtua_Fighter_(video_game)',
  // Tekken
  'tekken': 'Tekken_(video_game)',
  // King of Fighters
  'the king of fighters 94': 'The_King_of_Fighters_94',
  'the king of fighters 95': 'The_King_of_Fighters_95',
  // Fatal Fury
  'fatal fury: king of fighters': 'Fatal_Fury:_King_of_Fighters',
  'fatal fury 2': 'Fatal_Fury_2',
  'fatal fury special': 'Fatal_Fury_Special',
  // Samurai Shodown
  'samurai shodown': 'Samurai_Shodown_(video_game)',
  'samurai spirits': 'Samurai_Shodown_(video_game)',
  // World Heroes
  'world heroes': 'World_Heroes',
  'world heroes 2': 'World_Heroes_2',
  // Primal Rage
  'primal rage': 'Primal_Rage',
  // Eternal Champions
  'eternal champions': 'Eternal_Champions',
  // Killer Instinct
  'killer instinct': 'Killer_Instinct_(1994_video_game)',
  // Donkey Kong Country
  'donkey kong country': 'Donkey_Kong_Country',
  'donkey kong country 2': "Donkey_Kong_Country_2:_Diddy's_Kong_Quest",
  // Super Mario
  'super mario world': 'Super_Mario_World',
  'super mario kart': 'Super_Mario_Kart',
  'super mario all-stars': 'Super_Mario_All-Stars',
  // Mega Man
  'mega man x': 'Mega_Man_X',
  'mega man x2': 'Mega_Man_X2',
  'mega man x3': 'Mega_Man_X3',
  // Castlevania
  'castlevania: vampire kiss': 'Castlevania:_Vampire%27s_Kiss',
  "castlevania: vampire's kiss": "Castlevania:_Vampire's_Kiss",
  // Zelda
  'the legend of zelda: a link to the past': 'The_Legend_of_Zelda:_A_Link_to_the_Past',
  // Metroid
  'super metroid': 'Super_Metroid',
  // Yoshi
  "yoshi's island": "Super_Mario_World_2:_Yoshi's_Island",
  "super mario world 2: yoshi's island": "Super_Mario_World_2:_Yoshi's_Island",
  // Kirby
  "kirby's dream land 3": "Kirby's_Dream_Land_3",
  "kirby's dream land 2": "Kirby's_Dream_Land_2",
  "kirby's dream course": "Kirby's_Dream_Course",
  "kirby super star": "Kirby_Super_Star",
  // F-Zero
  'f-zero': 'F-Zero_(video_game)',
  // StarFox
  'star fox': 'Star_Fox_(video_game)',
  'starwing': 'Star_Fox_(video_game)',
  // Pilotwings
  'pilotwings': 'Pilotwings_(video_game)',
  // International games
  "alien 3": 'Alien_3_(video_game)',
  'alien3': 'Alien_3_(video_game)',
  // Flashback
  'flashback': 'Flashback_(1992_video_game)',
  'flashback: the quest for identity': 'Flashback_(1992_video_game)',
  // Turrican
  'super turrican': 'Super_Turrican',
  'mega turrican': 'Mega_Turrican',
  // Lemmings
  'lemmings': 'Lemmings_(video_game)',
  // Pong / Tetris
  'tetris': 'Tetris_(Game_Boy_video_game)',
  // Road Rash
  'road rash': 'Road_Rash_(video_game)',
  'road rash ii': 'Road_Rash_II',
  'road rash iii': 'Road_Rash_3',
  // Ecco
  'ecco the dolphin': 'Ecco_the_Dolphin',
  'ecco: the tides of time': 'Ecco:_The_Tides_of_Time',
  // Comix Zone
  'comix zone': 'Comix_Zone',
  // Vectorman
  'vectorman': 'Vectorman',
  'vectorman 2': 'Vectorman_2',
  // Toejam & Earl
  'toejam & earl': 'ToeJam_&_Earl',
  'toejam and earl': 'ToeJam_&_Earl',
  'toejam & earl in panic on funkotron': 'ToeJam_&_Earl_in_Panic_on_Funkotron',
  // Altered Beast
  'altered beast': 'Altered_Beast',
  // Splatterhouse
  'splatterhouse 2': 'Splatterhouse_2',
  'splatterhouse 3': 'Splatterhouse_3',
  // Shining
  'shining force': 'Shining_Force',
  'shining force ii': 'Shining_Force_II',
  'shining in the darkness': 'Shining_in_the_Darkness',
  // Phantasy Star
  'phantasy star iv': 'Phantasy_Star_IV:_The_End_of_the_Millennium',
  'phantasy star iii': 'Phantasy_Star_III:_Generations_of_Doom',
  // Sonic
  'sonic the hedgehog': 'Sonic_the_Hedgehog_(8-bit_video_game)',
  'sonic the hedgehog 2 (game gear)': 'Sonic_the_Hedgehog_2_(8-bit_video_game)',
  // Bomberman
  'mega bomberman': 'Mega_Bomberman',
  'super bomberman': 'Super_Bomberman',
  'super bomberman 2': 'Super_Bomberman_2',
  // Pac-Man
  'pac-man 2: the new adventures': 'Pac-Man_2:_The_New_Adventures',
  // Virtual Bart
  'virtual bart': 'Virtual_Bart',
  // Bart vs. Space Mutants
  'bart vs. the space mutants': "Bart_vs._the_Space_Mutants",
  // Home Alone
  'home alone': 'Home_Alone_(video_game)',
  'home alone 2: lost in new york': 'Home_Alone_2:_Lost_in_New_York_(video_game)',
  // Jurassic Park
  'jurassic park': 'Jurassic_Park_(video_game)',
  // Terminator
  'the terminator': 'The_Terminator_(video_game)',
  // Robocop
  'robocop versus the terminator': 'RoboCop_versus_The_Terminator_(video_game)',
  'robocop vs terminator': 'RoboCop_versus_The_Terminator_(video_game)',
  'robocop vs. terminator': 'RoboCop_versus_The_Terminator_(video_game)',
  // Hook
  'hook': 'Hook_(video_game)',
  // Wayne's World
  "wayne's world": "Wayne's_World_(video_game)",
  // Ghostbusters
  'ghostbusters': 'Ghostbusters_(1984_video_game)',
  // Indiana Jones
  'indiana jones greatest adventures': "Indiana_Jones'_Greatest_Adventures",
  "indiana jones' greatest adventures": "Indiana_Jones'_Greatest_Adventures",
  // Die Hard
  'die hard': 'Die_Hard_(video_game)',
  // Air Cavalry
  'air cavalry': 'Air_Cavalry_(video_game)',
  // Castlevania specific
  'super castlevania iv': 'Super_Castlevania_IV',
  'castlevania iv': 'Super_Castlevania_IV',
  // Contra Hard Corps
  'contra: hard corps': 'Contra:_Hard_Corps',
  'contra hard corps': 'Contra:_Hard_Corps',
  // RoboCop
  'robocop 3': 'RoboCop_3_(video_game)',
};

// ──────────────────────────────────────────────
// Utilidades
// ──────────────────────────────────────────────
function normKey(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/[^a-z0-9\s]/g, ' ')     // símbolo → espacio
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/1.0 (research project)' } }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (loc) return resolve(httpsGet(loc));
        }
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', err => reject(err));
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ──────────────────────────────────────────────
// API Wikipedia REST — por slug exacto
// ──────────────────────────────────────────────
async function wikiImageBySlug(slug) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
    const res = await httpsGet(url);
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    if (data.thumbnail && data.thumbnail.source) {
      return data.thumbnail.source;
    }
  } catch (_) {}
  return null;
}

// ──────────────────────────────────────────────
// API Wikipedia OpenSearch — búsqueda libre
// ──────────────────────────────────────────────
async function wikiOpenSearch(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json`;
    const res = await httpsGet(url);
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body);
    // data[1] = títulos, data[3] = URLs de páginas
    const titles = data[1] || [];
    return titles;
  } catch (_) {}
  return [];
}

// Mapa de consola a nombre Wikipedia típico
const CONSOLE_WIKI_MAP = {
  'Mega Drive': 'Mega Drive',
  'Master System': 'Master System',
  'Game Gear': 'Game Gear',
  'Game Boy': 'Game Boy',
  'SNES': 'Super Nintendo',
  'NES': 'NES',
  'Neo Geo': 'Neo Geo',
  'Saturn': 'Sega Saturn',
  'PlayStation': 'PlayStation',
  'Mega-CD': 'Sega CD',
  '32X': '32X',
  'Game Boy Color': 'Game Boy Color',
};

// ──────────────────────────────────────────────
// Estrategia 2: variantes directas (slug URL)
// ──────────────────────────────────────────────
function buildSlugVariants(nombre, consola, anio, marca) {
  const n = nombre.trim();
  const consolaWiki = CONSOLE_WIKI_MAP[consola] || consola;
  const variants = [];

  // Exacto con paréntesis de plataforma
  variants.push(`${n} (${consolaWiki} video game)`);
  variants.push(`${n} (${consolaWiki})`);
  // Exacto con paréntesis de año
  if (anio) {
    variants.push(`${n} (${anio} video game)`);
    variants.push(`${n} (${anio})`);
  }
  // Solo "video game"
  variants.push(`${n} (video game)`);
  // Solo el nombre
  variants.push(n);
  // Nombre con marca (ej. "Sega")
  if (marca) {
    variants.push(`${n} (${marca})`);
  }
  // Nombre con año y consola
  if (anio) {
    variants.push(`${n} (${anio} ${consolaWiki} video game)`);
  }

  // Reemplazar espacios por guion bajo (Wikipedia slug)
  return variants.map(v => v.replace(/ /g, '_'));
}

// ──────────────────────────────────────────────
// Función principal: busca imagen para un juego
// ──────────────────────────────────────────────
async function findWikiImage(nombre, consola, anio, marca) {
  const key = normKey(nombre);
  const keyConsola = normKey(`${nombre} ${consola}`);

  // ── ESTRATEGIA 1: Alias map (nombre exacto) ──
  if (ALIAS_MAP[key]) {
    const img = await wikiImageBySlug(ALIAS_MAP[key]);
    await sleep(DELAY_MS);
    if (img) return { url: img, strategy: 'alias' };
  }
  // Alias con consola incluida en clave
  if (ALIAS_MAP[keyConsola]) {
    const img = await wikiImageBySlug(ALIAS_MAP[keyConsola]);
    await sleep(DELAY_MS);
    if (img) return { url: img, strategy: 'alias+console' };
  }

  // ── ESTRATEGIA 2: Variantes directas de slug ──
  const slugs = buildSlugVariants(nombre, consola, anio, marca);
  for (const slug of slugs) {
    const img = await wikiImageBySlug(slug);
    await sleep(DELAY_MS);
    if (img) return { url: img, strategy: `slug:${slug}` };
  }

  // ── ESTRATEGIA 3: OpenSearch con dimensiones ──
  const consolaWiki = CONSOLE_WIKI_MAP[consola] || consola;
  const queries3 = [
    `${nombre} ${consolaWiki} video game`,
    `${nombre} ${marca} ${consolaWiki}`,
    `${nombre} ${consolaWiki} ${anio}`,
  ];
  for (const q of queries3) {
    const titles = await wikiOpenSearch(q);
    await sleep(DELAY_MS);
    for (const title of titles) {
      // Filtro: el título debe contener el nombre del juego (o parte)
      const normTitle = normKey(title);
      const normNombre = normKey(nombre);
      // Palabras significativas del nombre (>3 chars)
      const words = normNombre.split(' ').filter(w => w.length > 3);
      const match = words.length === 0 || words.some(w => normTitle.includes(w));
      if (!match) continue;
      // Evitar páginas que no son del juego
      if (/film|movie|pelicula|book|novel|musician|politician|actor/.test(normTitle)) continue;
      const slug = title.replace(/ /g, '_');
      const img = await wikiImageBySlug(slug);
      await sleep(DELAY_MS);
      if (img) return { url: img, strategy: `opensearch3:${title}` };
    }
  }

  // ── ESTRATEGIA 4: OpenSearch solo nombre + "video game" ──
  const titles4 = await wikiOpenSearch(`${nombre} video game`);
  await sleep(DELAY_MS);
  for (const title of titles4) {
    const normTitle = normKey(title);
    const normNombre = normKey(nombre);
    const words = normNombre.split(' ').filter(w => w.length > 3);
    const match = words.length === 0 || words.some(w => normTitle.includes(w));
    if (!match) continue;
    if (/film|movie|pelicula|book|novel|musician|politician|actor/.test(normTitle)) continue;
    const slug = title.replace(/ /g, '_');
    const img = await wikiImageBySlug(slug);
    await sleep(DELAY_MS);
    if (img) return { url: img, strategy: `opensearch4:${title}` };
  }

  return null;
}

// ──────────────────────────────────────────────
// Bucle principal
// ──────────────────────────────────────────────
async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  const pending = data.filter(j => j.imagen === '' && j.imagen_wiki === '');
  console.log(`Juegos pendientes sin imagen: ${pending.length}`);

  let found = 0;
  let notFound = 0;
  let processed = 0;

  for (const juego of pending) {
    processed++;
    const progress = `[${processed}/${pending.length}]`;
    const label = `${juego.Juego} (${juego.Consola})`;

    try {
      const result = await findWikiImage(juego.Juego, juego.Consola, juego.Año, juego['Marca consola']);
      if (result) {
        // Actualizar en data original
        const entry = data.find(j => j.Juego === juego.Juego && j.Consola === juego.Consola);
        if (entry) {
          entry.imagen_wiki = result.url;
          found++;
          console.log(`${progress} ✓ ${label} [${result.strategy}]`);
        }
      } else {
        notFound++;
        console.log(`${progress} ✗ ${label}`);
      }
    } catch (err) {
      notFound++;
      console.log(`${progress} ERR ${label}: ${err.message}`);
    }

    // Guardar cada SAVE_EVERY juegos
    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`  → Guardado. Encontrados: ${found}, Sin imagen: ${notFound}`);
    }
  }

  // Guardado final
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('\n=== RESUMEN FINAL ===');
  console.log(`Encontrados: ${found}`);
  console.log(`No encontrados: ${notFound}`);
  console.log(`Total procesados: ${processed}`);
}

main().catch(console.error);
