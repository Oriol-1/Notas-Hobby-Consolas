/**
 * find-images.js
 * Busca portadas para los juegos sin imagen usando dos fuentes:
 *   1. vgdb.com.br  — URL directa, sin delay significativo
 *   2. Wikipedia    — API REST con delays de 5s para evitar 429
 *
 * Aplica automáticamente si la verificación es >= mínimo configurado.
 *
 * Uso:
 *   node find-images.js           → proceso completo
 *   node find-images.js --test    → sólo los 15 primeros
 *   node find-images.js --source=vgdb   → sólo fuente vgdb
 *   node find-images.js --source=wiki   → sólo Wikipedia
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const PATH  = './datos.json';
const LOG   = './find-images-log.txt';

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ──────────────────────────────────────────────────────────────────────────────
const VGDB_CONSOLE = {
  'Mega Drive':     'mega-drive',
  'Super Nintendo': 'super-nintendo',
  'NES':            'nes',
  'Nintendo':       'nes',
  'Game Boy':       'game-boy',
  'Game Gear':      'game-gear',
  'Master System':  'master-system',
  'Mega CD':        'mega-cd',
  'Mega Cd':        'mega-cd',
  'Mega CD 32X':    'mega-cd-32x',
  'Mega Drive 32X': 'mega-drive-32x',
  'PlayStation':    'playstation',
  'Saturn':         'saturn',
  '3DO':            '3do',
  'Jaguar':         'atari-jaguar',
  'Lynx':           'atari-lynx',
  'Neo Geo':        'neo-geo',
  'Neo Geo CD':     'neo-geo-cd',
};

// Sinónimos de consola para Wikipedia
const WIKI_CONSOLE_SYN = {
  'Mega Drive':     ['mega drive', 'sega genesis', 'genesis', 'megadrive'],
  'Super Nintendo': ['super nintendo', 'super nes', 'snes', 'super famicom'],
  'NES':            ['nes', 'nintendo entertainment system', 'famicom'],
  'Nintendo':       ['nes', 'nintendo entertainment system', 'famicom'],
  'Game Boy':       ['game boy'],
  'Game Gear':      ['game gear'],
  'Master System':  ['master system', 'sega master system'],
  'Mega CD':        ['mega cd', 'sega cd'],
  'Mega Cd':        ['mega cd', 'sega cd'],
  'Mega CD 32X':    ['32x', 'sega 32x', 'mega cd'],
  'Mega Drive 32X': ['32x', 'sega 32x'],
  'PlayStation':    ['playstation', 'ps1', 'psx'],
  'Saturn':         ['saturn', 'sega saturn'],
  '3DO':            ['3do'],
  'Jaguar':         ['jaguar', 'atari jaguar'],
  'Lynx':           ['lynx', 'atari lynx'],
  'Neo Geo':        ['neo geo', 'neogeo'],
  'Neo Geo CD':     ['neo geo cd', 'neogeo cd'],
};

// ──────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ──────────────────────────────────────────────────────────────────────────────
function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sim(a, b) {
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // Comparación compacta: maneja E-SWAT vs ESWAT, F-Zero vs FZero, etc.
  const ca = na.replace(/\s+/g, ''), cb = nb.replace(/\s+/g, '');
  if (ca === cb) return 1.0;
  if (ca.includes(cb) || cb.includes(ca)) return 0.9;
  // Similitud Jaccard por palabras (más estricta que Dice para evitar falsos positivos)
  const wa = na.split(' ').filter(w => w.length > 2);
  const wb = new Set(nb.split(' ').filter(w => w.length > 2));
  if (!wa.length || !wb.size) return 0;
  const common = wa.filter(w => wb.has(w)).length;
  return common / (wa.length + wb.size - common); // Jaccard
}

function toSlug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`"""']/g, '')   // comillas tipográficas Y ASCII
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ──────────────────────────────────────────────────────────────────────────────
// HTTP
// ──────────────────────────────────────────────────────────────────────────────
function get(url, extra = {}, redirects = 4) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...extra,
      }
    };
    https.get(url, opts, r => {
      if ([301, 302, 303].includes(r.statusCode) && r.headers.location && redirects > 0) {
        r.resume();
        let loc = r.headers.location;
        if (loc.startsWith('/')) {
          const base = url.match(/^(https?:\/\/[^/]+)/);
          if (base) loc = base[1] + loc;
        }
        return get(loc, extra, redirects - 1).then(resolve).catch(reject);
      }
      let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ s: r.statusCode, b: d }));
    }).on('error', reject).setTimeout(12000, function () { this.destroy(); reject(new Error('timeout')); });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// FUENTE 1: vgdb.com.br
// ──────────────────────────────────────────────────────────────────────────────
function vgdbExtractImage(html, pageUrl) {
  if (!html || html.length < 200 || html.includes('window.location')) return null;
  const og = html.match(/content="(https?:\/\/www\.vgdb\.com\.br\/fotos\/games\/mini_(\d+)\.jpg)"/);
  if (!og) return null;
  const id = og[2];
  const full = html.match(new RegExp(`href="(https?://www\\.vgdb\\.com\\.br/gf/fotos/games/media_${id}/[^"]+\\.jpg)"`, 'i'));
  if (full) return full[1];
  const slugM = pageUrl.match(/\/jogos\/([^/?]+)\/?/);
  if (slugM) return `https://www.vgdb.com.br/gf/fotos/games/media_${id}/${slugM[1]}-${id}.jpg`;
  return og[1];
}

async function buscarVgdb(nombre, consola) {
  const consolaSlug = VGDB_CONSOLE[consola];
  if (!consolaSlug) return null;

  const base  = toSlug(nombre);
  // Variantes a intentar
  const slugs = [base];
  // Sin puntuación adicional (el toSlug ya la elimina, pero intentar variantes comunes)
  const sinThe = base.replace(/^the-/, '');
  if (sinThe !== base) slugs.push(sinThe);

  for (const slug of slugs) {
    const url = `https://www.vgdb.com.br/${consolaSlug}/jogos/${slug}/`;
    let r;
    try { r = await get(url); } catch { continue; }
    if (r.s !== 200 || r.b.length < 200) continue;

    const img = vgdbExtractImage(r.b, url);
    if (!img) continue;

    // Verificar que el título de la página coincide
    const titleM = r.b.match(/<title>([^<]+)<\/title>/);
    const pageTitle = titleM ? titleM[1].replace(/\s*[-–|][^<]*/g, '').trim() : '';
    const s = sim(nombre, pageTitle);
    if (s >= 0.6 || pageTitle.length === 0) {
      return { img, source: 'vgdb', url, pageTitle, sim: s };
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// FUENTE 2: Wikipedia REST API
// ──────────────────────────────────────────────────────────────────────────────
const WIKI_HEADERS = {
  'User-Agent': 'NotasHobbyBot/2.0 (https://github.com/Oriol-1/Notas-Hobby-Consolas; notashobby@hobby.local)',
  'Api-User-Agent': 'NotasHobbyBot/2.0 (https://github.com/Oriol-1/Notas-Hobby-Consolas)',
};

async function wikiGetSummary(slug) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
  let r;
  try { r = await get(url, WIKI_HEADERS); } catch { return null; }
  if (r.s === 429) return '429';
  if (r.s !== 200) return null;
  try {
    const d = JSON.parse(r.b);
    if (d.type === 'disambiguation') return null; // skip disambiguation
    const img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || null;
    return { title: d.title, desc: (d.extract || d.description || '').substring(0, 500), img };
  } catch { return null; }
}

// Obtiene imagen de un artículo usando media-list (accede a portadas en el cuerpo del artículo)
async function wikiGetMediaImage(titleOrSlug) {
  const slug = titleOrSlug.replace(/ /g, '_');
  const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(slug)}`;
  let r;
  try { r = await get(url, WIKI_HEADERS); } catch { return null; }
  if (r.s === 429) return '429';
  if (r.s !== 200) return null;
  try {
    const d = JSON.parse(r.b);
    const items = (d.items || []).filter(x => x.type === 'image');
    // Pase 1: preferir imágenes que parezcan portadas/carátulas
    for (const item of items) {
      const t = (item.title || '').toLowerCase();
      if (t.includes('box') || t.includes('cover') || t.includes('screenshot') || t.includes('cart')) {
        const src = item.srcset?.[0]?.src;
        if (src) return src.startsWith('//') ? 'https:' + src : src;
      }
    }
    // Pase 2: cualquier imagen que no sea icono/bandera/logo genérico
    for (const item of items) {
      const t = (item.title || '').toLowerCase();
      if (t.includes('flag') || t.includes('.svg') || t.endsWith('logo.png') || t.includes('icon')) continue;
      const src = item.srcset?.[0]?.src;
      if (src) return src.startsWith('//') ? 'https:' + src : src;
    }
    return null;
  } catch { return null; }
}

// Búsqueda MediaWiki (full-text) para encontrar artículos relevantes
async function wikiSearch(query, limit = 5) {
  const q = encodeURIComponent(query);
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=${limit}&format=json&origin=*`;
  let r;
  try { r = await get(url, WIKI_HEADERS); } catch { return []; }
  if (r.s === 429) return '429';
  if (r.s !== 200) return [];
  try {
    const d = JSON.parse(r.b);
    return (d.query && d.query.search) ? d.query.search.map(x => x.title) : [];
  } catch { return []; }
}

function scoreWiki(nombre, consola, titulo, desc) {
  let pts = 0;
  const s = sim(nombre, titulo);
  if (s >= 0.95) pts += 4;
  else if (s >= 0.7)  pts += 2;
  else if (s >= 0.45) pts += 1;
  else return 0;

  const d = desc.toLowerCase();
  const syns = WIKI_CONSOLE_SYN[consola] || [];
  if (syns.some(kw => d.includes(kw))) pts += 3;
  if (d.includes('video game') || d.includes('video-game')) pts += 1;
  return pts;
}

async function buscarWiki(nombre, consola, año) {
  // Generar variantes de slug
  const sinSub = nombre.replace(/\s*[:–]\s*.+$/, '').trim();
  // Quitar comillas ASCII/tipográficas del slug
  const cleanName = nombre.replace(/["'`''""]/g, '').replace(/\s+/g, ' ').trim();
  const cleanSub  = cleanName.replace(/\s*[:–]\s*.+$/, '').trim();
  const builds = [cleanName, cleanSub, sinSub, nombre]
    .filter((v, i, a) => v && a.indexOf(v) === i);

  const direct = [];
  for (const b of builds) {
    const base = b.replace(/\s+/g, '_');
    direct.push(base, `${base}_(video_game)`, `${base}_(game)`, `${base}_(${año}_video_game)`);
  }

  // Helper: obtener imagen del artículo (summary o media-list como fallback)
  async function getWikiImg(res, title) {
    if (res.img) return res.img;
    await delay(300);
    const mImg = await wikiGetMediaImage(title);
    if (mImg === '429') { await delay(25000); return null; }
    return mImg || null;
  }

  // 1. Intentos directos
  for (const slug of [...new Set(direct)]) {
    const res = await wikiGetSummary(slug);
    if (res === '429') { await delay(25000); continue; }
    if (!res) { await delay(300); continue; }
    const pts = scoreWiki(nombre, consola, res.title, res.desc);
    if (pts >= 4) {
      const img = await getWikiImg(res, res.title);
      if (img) return { img, source: 'wiki', wikiTitle: res.title, pts };
    }
    await delay(400);
  }

  // 2. Búsqueda MediaWiki con nombre + consola
  const syns = WIKI_CONSOLE_SYN[consola] || [];
  const query = `${nombre} ${syns[0] || consola} game`;
  const searchRes = await wikiSearch(query);
  if (searchRes === '429') { await delay(25000); }
  else if (Array.isArray(searchRes)) {
    for (const title of searchRes) {
      await delay(600);
      const res = await wikiGetSummary(title);
      if (res === '429') { await delay(25000); continue; }
      if (!res) continue;
      const pts = scoreWiki(nombre, consola, res.title, res.desc);
      if (pts >= 4) {
        const img = await getWikiImg(res, title);
        if (img) return { img, source: 'wiki', wikiTitle: res.title, pts };
      }
    }
  }

  // 3. Búsqueda MediaWiki sólo con nombre del juego
  await delay(600);
  const searchRes2 = await wikiSearch(`${nombre} video game`, 4);
  if (Array.isArray(searchRes2)) {
    for (const title of searchRes2) {
      await delay(600);
      const res = await wikiGetSummary(title);
      if (res === '429') { await delay(25000); continue; }
      if (!res) continue;
      const pts = scoreWiki(nombre, consola, res.title, res.desc);
      if (pts >= 4) {
        const img = await getWikiImg(res, title);
        if (img) return { img, source: 'wiki', wikiTitle: res.title, pts };
      }
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  const args       = process.argv.slice(2);
  const TEST_MODE  = args.includes('--test');
  const srcArg     = (args.find(a => a.startsWith('--source=')) || '').split('=')[1];
  const useVgdb    = !srcArg || srcArg === 'vgdb';
  const useWiki    = !srcArg || srcArg === 'wiki';

  const datos = JSON.parse(fs.readFileSync(PATH, 'utf8'));

  const sinImg = datos
    .map((j, i) => ({ ...j, _idx: i }))
    .filter(j => !j.imagen && !j.imagen_wiki);

  const lista  = TEST_MODE ? sinImg.slice(0, 15) : sinImg;
  const total  = lista.length;

  console.log(`\nfind-images.js — ${TEST_MODE ? 'TEST (15)' : 'COMPLETO'}`);
  console.log(`Fuentes: ${[useVgdb && 'vgdb', useWiki && 'wiki'].filter(Boolean).join(' + ')}`);
  console.log(`Juegos a procesar: ${total}\n`);

  const log = [];
  const review = [];
  let found = 0, notFound = 0, errors = 0;

  for (let i = 0; i < lista.length; i++) {
    const j    = lista[i];
    const idx  = j._idx;
    const prog = `[${i + 1}/${total}]`;
    process.stdout.write(`${prog} ${j.Juego} (${j.Consola})... `);

    try {
      let resultado = null;

      // ── Fuente 1: vgdb.com.br ───────────────────────────────────────────
      if (useVgdb) {
        resultado = await buscarVgdb(j.Juego, j.Consola);
        if (resultado) {
          process.stdout.write(`✓ vgdb (sim=${resultado.sim.toFixed(2)})\n`);
        }
        await delay(1200);
      }

      // ── Fuente 2: Wikipedia ─────────────────────────────────────────────
      if (!resultado && useWiki) {
        resultado = await buscarWiki(j.Juego, j.Consola, j.Año);
        if (resultado) {
          process.stdout.write(`✓ wiki (pts=${resultado.pts})\n`);
          if (TEST_MODE) console.log(`     → ${resultado.wikiTitle || ''}\n     → ${resultado.img}`);
        } else {
          process.stdout.write(`✗\n`);
        }
        await delay(4000); // delay para evitar 429 de Wikipedia
      }

      const AUTO_MIN   = 6; // pts >= 6 → aplica automáticamente
      const REVIEW_MIN = 4; // pts 4-5 → cola de revisión manual

      if (resultado) {
        if (resultado.pts >= AUTO_MIN) {
          // ── Aplicación automática (alta confianza) ─────────────────────
          datos[idx].imagen_wiki = resultado.img;
          found++;
          log.push(`AUTO | ${resultado.source} | pts=${resultado.pts} | ${j.Juego} | ${j.Consola} | ${resultado.wikiTitle || ''} | ${resultado.img}`);
          if (!TEST_MODE && found % 10 === 0) {
            fs.writeFileSync(PATH, JSON.stringify(datos, null, 2), 'utf8');
            console.log(`     → Progreso guardado (${found} imágenes auto-aplicadas)`);
          }
        } else if (resultado.pts >= REVIEW_MIN) {
          // ── Cola de revisión (confianza media) ─────────────────────────
          review.push({
            idx, juego: j.Juego, consola: j.Consola,
            wikiTitle: resultado.wikiTitle || '',
            img: resultado.img, pts: resultado.pts, source: resultado.source,
          });
          process.stdout.write(`     → REVISAR: ${resultado.wikiTitle || ''} (pts=${resultado.pts})\n`);
          log.push(`REV  | ${resultado.source} | pts=${resultado.pts} | ${j.Juego} | ${j.Consola} | ${resultado.wikiTitle || ''} | ${resultado.img}`);
          notFound++; // no aplicado todavía
        }
      } else if (useVgdb || useWiki) {
        notFound++;
        log.push(`FAIL | ${j.Juego} | ${j.Consola}`);
      }

    } catch (err) {
      process.stdout.write(`ERROR: ${err.message}\n`);
      errors++;
      log.push(`ERR  | ${j.Juego} | ${j.Consola} | ${err.message}`);
      await delay(2000);
    }
  }

  // Guardado final
  if (!TEST_MODE && found > 0) {
    fs.writeFileSync(PATH, JSON.stringify(datos, null, 2), 'utf8');
  }
  if (!TEST_MODE && review.length > 0) {
    fs.writeFileSync('./find-images-review.json', JSON.stringify(review, null, 2), 'utf8');
    console.log(`\n→ ${review.length} candidatos para revisión en find-images-review.json`);
  }

  const logContent = [
    `find-images.js — ${new Date().toISOString()}`,
    `Modo: ${TEST_MODE ? 'TEST' : 'COMPLETO'} | Fuentes: vgdb=${useVgdb}, wiki=${useWiki}`,
    `Total: ${total} | Auto-aplicados: ${found} | Para revisar: ${review.length} | Fallidos: ${notFound - review.length} | Errores: ${errors}`,
    '',
    ...log,
  ].join('\n');
  fs.writeFileSync(LOG, logContent, 'utf8');

  console.log(`\n──────────────────────────────────────`);
  console.log(`Procesados       : ${total}`);
  console.log(`Auto-aplicados   : ${found}`);
  console.log(`Para revisión    : ${review.length}`);
  console.log(`No encontrados   : ${notFound - review.length}`);
  console.log(`Errores          : ${errors}`);
  if (!TEST_MODE && found > 0) console.log(`datos.json actualizado.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
