// find-missing-images.js — Busca imágenes para los juegos que no tienen ninguna
//
// Filtra los juegos sin imagen_wiki Y sin archivo local descargado.
// Búsqueda Wikipedia con: nombre + consola + año (y hasta 10 variantes).
// Umbral más relajado que wiki-precise (MIN_AUTO=6, MIN_REVIEW=3).
//
// Uso:
//   node scripts/find-missing-images.js           → procesa todos
//   node scripts/find-missing-images.js --test    → solo primeros 10

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE    = path.join(__dirname, '..', 'datos.json');
const IMAGES_DIR   = path.join(__dirname, '..', 'images');
const REVIEW_FILE  = path.join(__dirname, 'missing-images-review.json');

const DELAY_MS   = 800;
const MIN_AUTO   = 6;
const MIN_REVIEW = 3;
const SAVE_EVERY = 10;
const TEST_MODE  = process.argv.includes('--test');
const TEST_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Traducciones de nombres en español → inglés para búsqueda en Wikipedia
// ─────────────────────────────────────────────────────────────────────────────
const SPANISH_TO_ENGLISH = {
  'indiana jones y la ultima cruzada': 'Indiana Jones and the Last Crusade',
  'los pitufos': 'The Smurfs',
  'felix el gato': 'Felix the Cat',
  'mundodisco': 'Discworld',
  'pinocho': 'Pinocchio',
  'la mansion de las almas ocultas': 'Mansion of Hidden Souls',
  'soleil': 'Crusader of Centy',
  'f. thomas': 'Frank Thomas Big Hurt Baseball',
  'invasion alienigena': 'Alien Invaders',
  'formula 1 world championship': 'Formula One World Championship Beyond the Limit',
};

// Mapa consola → nombre Wikipedia
const CONSOLE_WIKI = {
  'NES':            'NES',
  'Mega Drive':     'Sega Genesis',
  'Super Nintendo': 'Super Nintendo',
  'SNES':           'Super Nintendo',
  'Master System':  'Master System',
  'Game Boy':       'Game Boy',
  'Game Gear':      'Game Gear',
  'Mega-CD':        'Sega CD',
  'Mega CD':        'Sega CD',
  'Mega Drive 32X': '32X',
  '32X':            '32X',
  'Lynx':           'Atari Lynx',
  'Game Boy Color': 'Game Boy Color',
  'Saturn':         'Sega Saturn',
  'PlayStation':    'PlayStation',
  'Neo Geo':        'Neo Geo',
  '3DO':            '3DO',
};

// Sinónimos de consola para puntuar artículos
const CONSOLE_SYNONYMS = {
  'NES':            ['nes', 'nintendo entertainment system', 'famicom'],
  'Mega Drive':     ['mega drive', 'sega genesis', 'genesis'],
  'Super Nintendo': ['super nintendo', 'snes', 'super famicom'],
  'SNES':           ['super nintendo', 'snes', 'super famicom'],
  'Master System':  ['master system', 'sega master system'],
  'Game Boy':       ['game boy', 'gameboy', 'gb'],
  'Game Gear':      ['game gear', 'sega game gear'],
  'Mega-CD':        ['mega-cd', 'sega cd', 'mega cd'],
  'Mega CD':        ['mega-cd', 'sega cd', 'mega cd'],
  'Mega Drive 32X': ['32x', 'sega 32x'],
  '32X':            ['32x', 'sega 32x'],
  'Lynx':           ['lynx', 'atari lynx'],
  'Game Boy Color': ['game boy color', 'gbc'],
  'Saturn':         ['saturn', 'sega saturn'],
  'PlayStation':    ['playstation', 'ps1', 'psx'],
  'Neo Geo':        ['neo geo', 'neo-geo'],
  '3DO':            ['3do'],
};

// ─────────────────────────────────────────────────────────────────────────────
function normKey(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HobbyConsolasBot/3.0 (missing-images)' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpsGet(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getWikiSummary(slug) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
    const res = await httpsGet(url);
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    if (data.type === 'disambiguation') return null;
    return data;
  } catch (_) { return null; }
}

async function wikiOpenSearch(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=6&format=json`;
    const res = await httpsGet(url);
    if (res.status !== 200) return [];
    return JSON.parse(res.body)[1] || [];
  } catch (_) { return []; }
}

async function wikiFullText(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&srnamespace=0&format=json`;
    const res = await httpsGet(url);
    if (res.status !== 200) return [];
    const d = JSON.parse(res.body);
    return ((d.query && d.query.search) || []).map(r => r.title);
  } catch (_) { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Puntuación del artículo
// ─────────────────────────────────────────────────────────────────────────────
function scoreArticle(summary, nombre, consola, anio) {
  if (!summary) return 0;

  const normNom  = normKey(nombre);
  const normTit  = normKey(summary.title || '');
  const normDesc = normKey(summary.description || '');
  const normExt  = normKey((summary.extract || '').slice(0, 800));
  const full     = normDesc + ' ' + normExt;

  let score = 0;

  // Nombre en título
  const exactRx = new RegExp('^' + normNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s*\\(|$)');
  if (exactRx.test(normTit)) {
    score += 4;
  } else {
    const words = normNom.split(' ').filter(w => w.length > 3);
    if (words.length > 0) {
      const matched = words.filter(w => normTit.includes(w));
      if (matched.length === words.length) score += 2;
      else if (matched.length / words.length >= 0.5) score += 1;
    }
  }

  // Consola en descripción/extracto
  const syns = CONSOLE_SYNONYMS[consola] || [normKey(consola)];
  if (syns.some(s => normDesc.includes(s))) score += 3;
  else if (syns.some(s => normExt.includes(s))) score += 2;

  // Año ±1
  if (anio) {
    const yr = parseInt(anio, 10);
    if ([yr - 1, yr, yr + 1].some(y => full.includes(String(y)))) score += 2;
  }

  // "video game"
  if (full.includes('video game')) score += 1;

  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluar un título candidato
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateTitle(title, nombre, consola, anio) {
  // Descartar páginas claramente no relacionadas
  const low = title.toLowerCase();
  if (/\b(film|movie|novel|book|album|song|band|musician|politician|actor|actress)\b/.test(low)) return null;

  const summary = await getWikiSummary(title.replace(/ /g, '_'));
  await sleep(DELAY_MS);
  if (!summary) return null;

  const imageUrl = (summary.originalimage && summary.originalimage.source)
    || (summary.thumbnail && summary.thumbnail.source)
    || null;
  if (!imageUrl) return null;

  const score = scoreArticle(summary, nombre, consola, anio);
  if (score < MIN_REVIEW) return null;

  return {
    url: imageUrl,
    score,
    wikiTitle: summary.title,
    wikiDescription: summary.description || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda principal para un juego
// ─────────────────────────────────────────────────────────────────────────────
async function findImage(nombre, consola, anio) {
  const cw = CONSOLE_WIKI[consola] || consola;
  const normNom = normKey(nombre);

  // Nombre en inglés si existe traducción
  const engName = SPANISH_TO_ENGLISH[normNom] || nombre;

  // Construir lista de variantes de búsqueda directa por slug
  const slugVariants = [];
  for (const n of [...new Set([engName, nombre])]) {
    slugVariants.push(`${n} (${anio} ${cw} video game)`.replace(/ /g,'_'));
    slugVariants.push(`${n} (${cw} video game)`.replace(/ /g,'_'));
    slugVariants.push(`${n} (${cw})`.replace(/ /g,'_'));
    slugVariants.push(`${n} (${anio} video game)`.replace(/ /g,'_'));
    slugVariants.push(`${n} (video game)`.replace(/ /g,'_'));
    slugVariants.push(n.replace(/ /g,'_'));
  }

  for (const slug of slugVariants) {
    const summary = await getWikiSummary(slug);
    await sleep(DELAY_MS);
    if (!summary) continue;
    const imageUrl = (summary.originalimage && summary.originalimage.source)
      || (summary.thumbnail && summary.thumbnail.source)
      || null;
    if (!imageUrl) continue;
    const score = scoreArticle(summary, engName, consola, anio);
    if (score >= MIN_REVIEW) {
      return { url: imageUrl, score, wikiTitle: summary.title, wikiDescription: summary.description || '', strategy: `slug:${slug}` };
    }
  }

  // Búsquedas por texto completo: nombre + consola + año
  const searchQueries = [
    `"${engName}" ${cw} video game ${anio}`,
    `"${engName}" ${cw} video game`,
    `${engName} ${cw} ${anio}`,
    `${engName} video game ${anio}`,
  ];
  if (engName !== nombre) {
    searchQueries.push(`"${nombre}" ${cw} video game ${anio}`);
    searchQueries.push(`${nombre} video game`);
  }

  for (const q of searchQueries) {
    const titles = await wikiFullText(q);
    await sleep(DELAY_MS);
    for (const t of titles) {
      const res = await evaluateTitle(t, engName, consola, anio);
      if (res) return { ...res, strategy: `fulltext:${q}` };
    }
  }

  // OpenSearch
  const osQueries = [
    `${engName} ${cw} video game`,
    `${engName} ${cw} ${anio}`,
    `${engName} video game`,
  ];
  for (const q of osQueries) {
    const titles = await wikiOpenSearch(q);
    await sleep(DELAY_MS);
    for (const t of titles) {
      const res = await evaluateTitle(t, engName, consola, anio);
      if (res) return { ...res, strategy: `opensearch:${q}` };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Juegos sin imagen_wiki Y sin archivo local en disco
  const pending = data.filter(j => {
    const tieneWiki  = j.imagen_wiki && j.imagen_wiki.trim();
    const tieneLocal = j.imagen_local && fs.existsSync(path.join(IMAGES_DIR, path.basename(j.imagen_local)));
    return !tieneWiki && !tieneLocal;
  });

  const total = TEST_MODE ? Math.min(TEST_LIMIT, pending.length) : pending.length;
  const queue = pending.slice(0, total);

  console.log(`\n=== find-missing-images.js${TEST_MODE ? ' [MODO PRUEBA]' : ''} ===`);
  console.log(`Juegos sin imagen: ${pending.length} | Procesando: ${total}\n`);

  // Si ya existe un fichero de revisión previo, cargarlo
  let reviewList = [];
  if (fs.existsSync(REVIEW_FILE)) {
    try { reviewList = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8')); } catch (_) {}
    // Evitar duplicados
    const reviewed = new Set(reviewList.map(r => `${r.Juego}|${r.Consola}|${r.Año}`));
    queue.forEach((j, i) => {
      if (reviewed.has(`${j.Juego}|${j.Consola}|${j.Año}`)) queue[i] = null;
    });
    queue.filter(Boolean);
  }

  let countAuto   = 0;
  let countReview = 0;
  let countNone   = 0;
  let processed   = 0;

  // Lista final para mostrar al usuario
  const noEncontrados = [];

  for (const juego of queue) {
    if (!juego) continue;
    processed++;
    const label = `[${processed}/${total}] ${juego.Juego} (${juego.Consola}, ${juego.Año})`;

    try {
      const result = await findImage(juego.Juego, juego.Consola, juego.Año);

      if (result && result.score >= MIN_AUTO) {
        const entry = data.find(j => j.Juego === juego.Juego && j.Consola === juego.Consola && j.Año === juego.Año);
        if (entry) entry.imagen_wiki = result.url;
        countAuto++;
        console.log(`✅ AUTO (${result.score}pts) ${label}`);
        console.log(`   → ${result.wikiTitle} | ${result.wikiDescription}`);
        console.log(`   → ${result.url}`);

      } else if (result && result.score >= MIN_REVIEW) {
        reviewList.push({
          Juego: juego.Juego,
          Consola: juego.Consola,
          Año: juego.Año,
          puntuacion: result.score,
          wikiTitle: result.wikiTitle,
          wikiDescription: result.wikiDescription,
          urlImagen: result.url,
          estrategia: result.strategy,
          aprobado: false,
        });
        countReview++;
        console.log(`🔍 REVISIÓN (${result.score}pts) ${label}`);
        console.log(`   → ${result.wikiTitle} | ${result.wikiDescription}`);
        console.log(`   → ${result.url}`);

      } else {
        countNone++;
        noEncontrados.push(`${juego.Juego} | ${juego.Consola} | ${juego.Año}`);
        console.log(`❌ NO ENCONTRADO ${label}`);
      }
    } catch (err) {
      countNone++;
      noEncontrados.push(`${juego.Juego} | ${juego.Consola} | ${juego.Año}`);
      console.log(`⚠️  ERROR ${label}: ${err.message}`);
    }

    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
      fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewList, null, 2), 'utf8');
      console.log(`  ── Guardado parcial [${processed}/${total}] ──`);
    }
  }

  // Guardado final
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewList, null, 2), 'utf8');

  console.log('\n=== RESUMEN ===');
  console.log(`✅ Encontradas y aplicadas (≥${MIN_AUTO}pts): ${countAuto}`);
  console.log(`🔍 Para revisar manualmente (${MIN_REVIEW}-${MIN_AUTO-1}pts): ${countReview}`);
  console.log(`❌ No encontradas: ${countNone}`);

  if (noEncontrados.length > 0) {
    console.log('\n=== JUEGOS SIN IMAGEN ENCONTRADA ===');
    noEncontrados.forEach(n => console.log('  -', n));
  }
  console.log(`\nCandidatos pendientes de revisión: ${REVIEW_FILE}`);
}

main().catch(console.error);
