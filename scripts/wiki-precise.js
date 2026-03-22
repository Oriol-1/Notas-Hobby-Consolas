// wiki-precise.js — Búsqueda precisa de imágenes Wikipedia con verificación de identidad
//
// Mejora sobre wiki-smart.js: antes de aceptar cualquier imagen, verifica que el
// artículo encontrado sea realmente el juego correcto mediante un sistema de
// puntuación basado en nombre + consola + año extraídos del propio artículo.
//
// Umbrales:
//   ≥ 7 pts → imagen aceptada, se guarda en datos.json automáticamente
//   4–6 pts → imagen candidata, se guarda en wiki-precise-review.json para revisión
//   < 4 pts → descartada, continúa con la siguiente estrategia
//
// Uso:
//   node wiki-precise.js          → procesa todos los juegos sin imagen
//   node wiki-precise.js --test   → procesa solo los primeros 10 (modo prueba)

const fs   = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE    = path.join(__dirname, '..', 'datos.json');
const REVIEW_FILE  = path.join(__dirname, 'wiki-precise-review.json');
const LOG_FILE     = path.join(__dirname, 'wiki-precise-log.txt');
const DELAY_MS     = 750;
const SAVE_EVERY   = 20;
const MIN_AUTO     = 7;   // puntos mínimos para aplicar automáticamente
const MIN_REVIEW   = 4;   // puntos mínimos para guardar como candidato

const TEST_MODE  = process.argv.includes('--test');
const TEST_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS MAP: nombre_normalizado → slug Wikipedia (heredado de wiki-smart.js)
// ─────────────────────────────────────────────────────────────────────────────
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
  'micro machines 96': 'Micro_Machines_V3',
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
  // Olympic Games
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
  // Goofy
  "goofy's hysterical history tour": "Goofy's_Hysterical_History_Tour",
  'goofy hysterical history tour': "Goofy's_Hysterical_History_Tour",
  // Quackshot
  'quackshot starring donald duck': 'QuackShot',
  'quackshot': 'QuackShot',
  // Donald Duck
  'deep duck trouble starring donald duck': 'Deep_Duck_Trouble_Starring_Donald_Duck',
  'deep duck trouble': 'Deep_Duck_Trouble_Starring_Donald_Duck',
  // TaleSpin
  'talespin': 'TaleSpin_(video_game)',
  'tale spin': 'TaleSpin_(video_game)',
  // Chip 'n Dale
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
  'castlevania: vampire kiss': "Castlevania:_Vampire's_Kiss",
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
  'kirby super star': 'Kirby_Super_Star',
  // F-Zero
  'f-zero': 'F-Zero_(video_game)',
  // StarFox
  'star fox': 'Star_Fox_(video_game)',
  'starwing': 'Star_Fox_(video_game)',
  // Pilotwings
  'pilotwings': 'Pilotwings_(video_game)',
  // Alien 3
  'alien 3': 'Alien_3_(video_game)',
  'alien3': 'Alien_3_(video_game)',
  // Flashback
  'flashback': 'Flashback_(1992_video_game)',
  'flashback: the quest for identity': 'Flashback_(1992_video_game)',
  // Turrican
  'super turrican': 'Super_Turrican',
  'mega turrican': 'Mega_Turrican',
  // Lemmings
  'lemmings': 'Lemmings_(video_game)',
  // Tetris
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
  // ToeJam & Earl
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
  // Sonic (8-bit)
  'sonic the hedgehog': 'Sonic_the_Hedgehog_(8-bit_video_game)',
  'sonic the hedgehog 2 (game gear)': 'Sonic_the_Hedgehog_2_(8-bit_video_game)',
  // Bomberman
  'mega bomberman': 'Mega_Bomberman',
  'super bomberman': 'Super_Bomberman',
  'super bomberman 2': 'Super_Bomberman_2',
  // Pac-Man
  'pac-man 2: the new adventures': 'Pac-Man_2:_The_New_Adventures',
  // Bart
  'virtual bart': 'Virtual_Bart',
  'bart vs. the space mutants': 'Bart_vs._the_Space_Mutants',
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
  'robocop 3': 'RoboCop_3_(video_game)',
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
  // Castlevania
  'super castlevania iv': 'Super_Castlevania_IV',
  'castlevania iv': 'Super_Castlevania_IV',
  // Contra Hard Corps
  'contra: hard corps': 'Contra:_Hard_Corps',
  'contra hard corps': 'Contra:_Hard_Corps',
};

// ─────────────────────────────────────────────────────────────────────────────
// SINÓNIMOS DE CONSOLA para verificación de artículos
// ─────────────────────────────────────────────────────────────────────────────
const CONSOLE_SYNONYMS = {
  'NES':           ['nes', 'nintendo entertainment system', 'famicom', 'family computer'],
  'Mega Drive':    ['mega drive', 'sega genesis', 'genesis', 'mega-drive'],
  'SNES':          ['snes', 'super nintendo', 'super nintendo entertainment system', 'super nes', 'super famicom'],
  'Master System': ['master system', 'sega master system', 'mark iii'],
  'Game Boy':      ['game boy', 'gameboy', 'gb'],
  'Game Gear':     ['game gear', 'sega game gear'],
  'Mega-CD':       ['mega-cd', 'sega cd', 'sega-cd', 'mega cd'],
  '32X':           ['32x', 'sega 32x', 'mega drive 32x', 'mega 32x'],
  'Lynx':          ['lynx', 'atari lynx'],
  'Game Boy Color':['game boy color', 'game boy colour', 'gbc'],
  'Saturn':        ['saturn', 'sega saturn'],
  'PlayStation':   ['playstation', 'ps1', 'psx', 'sony playstation'],
  'Neo Geo':       ['neo geo', 'neo-geo', 'snk neo geo'],
};

// Mapa simple para construir variantes de slug
const CONSOLE_WIKI_LABEL = {
  'NES':           'NES',
  'Mega Drive':    'Sega Genesis',
  'SNES':          'Super Nintendo',
  'Master System': 'Master System',
  'Game Boy':      'Game Boy',
  'Game Gear':     'Game Gear',
  'Mega-CD':       'Sega CD',
  '32X':           '32X',
  'Lynx':          'Atari Lynx',
  'Game Boy Color':'Game Boy Color',
  'Saturn':        'Sega Saturn',
  'PlayStation':   'PlayStation',
  'Neo Geo':       'Neo Geo',
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────
function normKey(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'HobbyConsolasBot/2.0 (research; wiki-precise)' } },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const loc = res.headers.location;
            if (loc) return resolve(httpsGet(loc));
          }
          resolve({ status: res.statusCode, body: data });
        });
      }
    );
    req.on('error', err => reject(err));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtener resumen completo de un artículo Wikipedia (title + description + extract + thumbnail)
// ─────────────────────────────────────────────────────────────────────────────
async function getWikiSummary(slug) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
    const res = await httpsGet(url);
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    // Descartar páginas de desambiguación
    if (data.type === 'disambiguation') return null;
    return data;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE PUNTUACIÓN: ¿este artículo Wikipedia es el juego correcto?
//
// Puntuación máxima: 10
//   Nombre exacto en título:          +4
//   Nombre parcial en título:         +2
//   Consola/sinónimo en descripción   +3
//     o en extracto:                  +2
//   Año ±1 en descripción/extracto:   +2
//   "video game" en descripción:      +1
// ─────────────────────────────────────────────────────────────────────────────
function scoreArticle(summary, nombre, consola, anio) {
  if (!summary) return { score: 0, reasons: [] };

  const normNom  = normKey(nombre);
  const normTit  = normKey(summary.title || '');
  const normDesc = normKey(summary.description || '');
  const normExt  = normKey((summary.extract || '').slice(0, 600));

  const reasons = [];
  let score = 0;

  // ── Nombre en título ──
  // Exacto: el título es igual al nombre, o el nombre seguido solo de un calificador
  // entre paréntesis como "(video game)", "(1991)" etc.
  // NO se considera exacto si el título añade un número/romano secuencial (Shadow of the Beast III ≠ Shadow of the Beast)
  const exactWithQualifier = new RegExp(
    '^' + normNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\('
  );
  const isExact = normTit === normNom || exactWithQualifier.test(normTit);
  if (isExact) {
    score += 4;
    reasons.push('nombre exacto en título');
  } else {
    // Palabras significativas del nombre (>3 chars)
    const words = normNom.split(' ').filter(w => w.length > 3);
    if (words.length > 0) {
      const matchedWords = words.filter(w => normTit.includes(w));
      const matchRatio = matchedWords.length / words.length;
      // El título no debe ser mucho más largo que el nombre buscado (evita falsos positivos)
      const titleWords = normTit.split(' ').filter(w => w.length > 2);
      const nameWords  = normNom.split(' ').filter(w => w.length > 2);
      const lengthRatio = titleWords.length / Math.max(nameWords.length, 1);

      if (matchRatio === 1 && lengthRatio <= 1.8) {
        // Todas las palabras coinciden y el título no es excesivamente más largo
        score += 2;
        reasons.push('nombre parcial (todas las palabras) en título');
      } else if (matchRatio >= 0.6 && lengthRatio <= 2.5) {
        score += 1;
        reasons.push(`nombre parcial (${matchedWords.length}/${words.length} palabras) en título`);
      }
    }
  }

  // ── Consola en descripción o extracto ──
  const synonyms = (CONSOLE_SYNONYMS[consola] || [normKey(consola)]);
  const inDesc = synonyms.some(s => normDesc.includes(s));
  const inExt  = synonyms.some(s => normExt.includes(s));
  if (inDesc) {
    score += 3;
    reasons.push(`consola "${consola}" en descripción`);
  } else if (inExt) {
    score += 2;
    reasons.push(`consola "${consola}" en extracto`);
  }

  // ── Año en descripción o extracto ──
  if (anio) {
    const yr = parseInt(anio, 10);
    const yearsToCheck = [yr - 1, yr, yr + 1].map(String);
    const hasYear = yearsToCheck.some(y =>
      normDesc.includes(y) || normExt.includes(y)
    );
    if (hasYear) {
      score += 2;
      reasons.push(`año ${anio} (±1) en artículo`);
    }
  }

  // ── "video game" en descripción ──
  if (normDesc.includes('video game') || normDesc.includes('videogame') || normDesc.includes('video games')) {
    score += 1;
    reasons.push('"video game" en descripción');
  }

  return { score, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda OpenSearch Wikipedia
// ─────────────────────────────────────────────────────────────────────────────
async function wikiOpenSearch(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json`;
    const res = await httpsGet(url);
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body);
    return (data[1] || []);
  } catch (_) {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda MediaWiki Full-Text (más precisa que OpenSearch)
// ─────────────────────────────────────────────────────────────────────────────
async function wikiFullTextSearch(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&srnamespace=0&format=json`;
    const res = await httpsGet(url);
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body);
    return ((data.query && data.query.search) || []).map(r => r.title);
  } catch (_) {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Construir variantes de slug para búsqueda directa
// ─────────────────────────────────────────────────────────────────────────────
function buildSlugVariants(nombre, consola, anio, marca) {
  const n  = nombre.trim();
  const cw = CONSOLE_WIKI_LABEL[consola] || consola;
  const variants = [];

  if (anio) variants.push(`${n} (${anio} ${cw} video game)`);
  variants.push(`${n} (${cw} video game)`);
  variants.push(`${n} (${cw})`);
  if (anio) variants.push(`${n} (${anio} video game)`);
  if (anio) variants.push(`${n} (${anio})`);
  variants.push(`${n} (video game)`);
  if (marca) variants.push(`${n} (${marca} video game)`);
  variants.push(n);

  return variants.map(v => v.replace(/ /g, '_'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluar un slug candidato con verificación de identidad
// Devuelve { url, score, reasons, title, description } o null si no supera MIN_REVIEW
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateSlug(slug, nombre, consola, anio) {
  const summary = await getWikiSummary(slug);
  await sleep(DELAY_MS);
  if (!summary) return null;

  const imageUrl = (summary.originalimage && summary.originalimage.source)
    || (summary.thumbnail && summary.thumbnail.source)
    || null;
  if (!imageUrl) return null;

  const { score, reasons } = scoreArticle(summary, nombre, consola, anio);
  if (score < MIN_REVIEW) return null;

  return {
    url: imageUrl,
    score,
    reasons,
    wikiTitle: summary.title || slug,
    wikiDescription: summary.description || ''
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluar lista de títulos candidatos (del OpenSearch / Full-Text)
// Filtra primero los claramente erróneos y luego verifica con scoring
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateTitles(titles, nombre, consola, anio) {
  const normNom = normKey(nombre);
  const words   = normNom.split(' ').filter(w => w.length > 3);

  for (const title of titles) {
    const normTitle = normKey(title);

    // Filtro rápido: al menos una palabra significativa debe estar en el título
    if (words.length > 0 && !words.some(w => normTitle.includes(w))) continue;

    // Excluir páginas claramente no relacionadas
    if (/\b(film|movie|novel|book|album|song|musician|politician|actor|actress|footballer|director)\b/.test(normTitle)) continue;

    const slug = title.replace(/ /g, '_');
    const result = await evaluateSlug(slug, nombre, consola, anio);
    if (result) return { ...result, strategy: `title:${title}` };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BÚSQUEDA PRINCIPAL — 5 estrategias en cascada
// ─────────────────────────────────────────────────────────────────────────────
async function findPreciseImage(nombre, consola, anio, marca) {
  const key         = normKey(nombre);
  const keyConsola  = normKey(`${nombre} ${consola}`);
  const cw          = CONSOLE_WIKI_LABEL[consola] || consola;

  // ── Estrategia 1: Alias map (slugs verificados manualmente, confianza total) ──
  for (const k of [keyConsola, key]) {
    if (ALIAS_MAP[k]) {
      const summary = await getWikiSummary(ALIAS_MAP[k]);
      await sleep(DELAY_MS);
      if (summary) {
        const imageUrl = (summary.originalimage && summary.originalimage.source)
          || (summary.thumbnail && summary.thumbnail.source)
          || null;
        if (imageUrl) {
          // Los alias son entradas verificadas manualmente → confianza máxima
          return {
            url: imageUrl,
            score: 10,
            reasons: ['alias map (entrada verificada manualmente)'],
            wikiTitle: summary.title || ALIAS_MAP[k],
            wikiDescription: summary.description || '',
            strategy: `alias:${k}`
          };
        }
      }
    }
  }

  // ── Estrategia 2: Variantes directas de slug ──
  const slugs = buildSlugVariants(nombre, consola, anio, marca);
  for (const slug of slugs) {
    const result = await evaluateSlug(slug, nombre, consola, anio);
    if (result) return { ...result, strategy: `slug:${slug}` };
  }

  // ── Estrategia 3: MediaWiki Full-Text Search (consola + año) ──
  const ftQueries = [
    `"${nombre}" ${cw} video game ${anio}`,
    `"${nombre}" ${cw} video game`,
    `${nombre} ${cw} ${anio} video game`,
  ];
  for (const q of ftQueries) {
    const titles = await wikiFullTextSearch(q);
    await sleep(DELAY_MS);
    const result = await evaluateTitles(titles, nombre, consola, anio);
    if (result) return { ...result, strategy: `fulltext:${q}` };
  }

  // ── Estrategia 4: OpenSearch con consola/marca/año ──
  const osQueries = [
    `${nombre} ${cw} video game`,
    `${nombre} ${marca} ${cw}`,
    `${nombre} ${cw} ${anio}`,
  ];
  for (const q of osQueries) {
    const titles = await wikiOpenSearch(q);
    await sleep(DELAY_MS);
    const result = await evaluateTitles(titles, nombre, consola, anio);
    if (result) return { ...result, strategy: `opensearch:${q}` };
  }

  // ── Estrategia 5: OpenSearch genérico "video game" ──
  const titles5 = await wikiOpenSearch(`${nombre} video game`);
  await sleep(DELAY_MS);
  const result5 = await evaluateTitles(titles5, nombre, consola, anio);
  if (result5) return { ...result5, strategy: `opensearch-generic:${nombre}` };

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bucle principal
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Cargar candidatos previos si existen
  let reviewList = [];
  if (fs.existsSync(REVIEW_FILE)) {
    try { reviewList = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8')); } catch (_) {}
  }

  const pending = data.filter(j => !j.imagen && !j.imagen_wiki);
  const total   = TEST_MODE ? Math.min(TEST_LIMIT, pending.length) : pending.length;
  const queue   = pending.slice(0, total);

  console.log(`\n=== wiki-precise.js${TEST_MODE ? ' [MODO PRUEBA]' : ''} ===`);
  console.log(`Juegos sin imagen: ${pending.length} | Procesando: ${total}\n`);

  const logLines = [`=== wiki-precise.js ${new Date().toISOString()} ===`, `Procesando: ${total} juegos\n`];

  let countAuto   = 0; // aplicados automáticamente (≥7 pts)
  let countReview = 0; // para revisión manual (4–6 pts)
  let countNone   = 0; // no encontrado
  let processed   = 0;

  for (const juego of queue) {
    processed++;
    const label = `${juego.Juego} (${juego.Consola}, ${juego.Año})`;
    const progress = `[${processed}/${total}]`;

    try {
      const result = await findPreciseImage(
        juego.Juego, juego.Consola, juego.Año, juego['Marca consola']
      );

      if (result && result.score >= MIN_AUTO) {
        // ── Auto-aplicar ──
        const entry = data.find(j => j.Juego === juego.Juego && j.Consola === juego.Consola && j.Año === juego.Año);
        if (entry) entry.imagen_wiki = result.url;
        countAuto++;
        const line = `${progress} ✅ AUTO (${result.score}pts) ${label}\n   Artículo: "${result.wikiTitle}" — ${result.wikiDescription}\n   Imagen: ${result.url}\n   Razones: ${result.reasons.join(', ')}\n   Estrategia: ${result.strategy}`;
        console.log(line);
        logLines.push(line);

      } else if (result && result.score >= MIN_REVIEW) {
        // ── Guardar para revisión manual ──
        reviewList.push({
          Juego: juego.Juego,
          Consola: juego.Consola,
          Año: juego.Año,
          puntuacion: result.score,
          wikiTitle: result.wikiTitle,
          wikiDescription: result.wikiDescription,
          urlImagen: result.url,
          razones: result.reasons,
          estrategia: result.strategy,
          aprobado: false  // el usuario debe cambiar a true para aplicar
        });
        countReview++;
        const line = `${progress} 🔍 REVISIÓN (${result.score}pts) ${label}\n   Artículo: "${result.wikiTitle}" — ${result.wikiDescription}\n   Imagen: ${result.url}\n   Razones: ${result.reasons.join(', ')}`;
        console.log(line);
        logLines.push(line);

      } else {
        // ── No encontrado ──
        countNone++;
        const line = `${progress} ❌ NO ENCONTRADO ${label}`;
        console.log(line);
        logLines.push(line);
      }
    } catch (err) {
      countNone++;
      const line = `${progress} ⚠️  ERROR ${label}: ${err.message}`;
      console.log(line);
      logLines.push(line);
    }

    // Guardar cada SAVE_EVERY juegos
    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
      fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewList, null, 2), 'utf8');
      console.log(`  → Guardado parcial. Auto: ${countAuto} | Revisión: ${countReview} | Sin imagen: ${countNone}`);
      logLines.push(`  → Guardado parcial [${processed}/${total}]`);
    }
  }

  // Guardado final
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewList, null, 2), 'utf8');

  const summary = [
    '',
    '=== RESUMEN FINAL ===',
    `✅ Aplicadas automáticamente (≥${MIN_AUTO} pts): ${countAuto}`,
    `🔍 Para revisión manual  (${MIN_REVIEW}–${MIN_AUTO - 1} pts): ${countReview}`,
    `❌ No encontradas:                              ${countNone}`,
    `Total procesados: ${processed}`,
    '',
    `Candidatos de revisión guardados en: ${REVIEW_FILE}`,
    `Log guardado en: ${LOG_FILE}`,
  ];
  summary.forEach(l => console.log(l));
  logLines.push(...summary);

  fs.writeFileSync(LOG_FILE, logLines.join('\n'), 'utf8');
}

main().catch(console.error);
