// download-images.js — Descarga masiva de imágenes de portada como backup local
//
// Uso:
//   node scripts/download-images.js               → descarga las que faltan
//   node scripts/download-images.js --force        → re-descarga todas, incluso si ya existen
//
// Resultado:
//   • Guarda las imágenes en images/{idx}_{slug}.{ext}
//   • Genera images/manifest.json con el mapeo juego → fichero local
//
// Estrategia anti rate-limiting:
//   • 600 ms entre peticiones (Wikipedia permite ~100 req/min por IP)
//   • Reintentos automáticos con backoff exponencial (3 intentos)
//   • En 429 espera el tiempo indicado en Retry-After o 30s
//   • Guarda progreso cada 20 descargas (reanudable si se interrumpe)

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

const DATOS_PATH    = path.join(__dirname, '..', 'datos.json');
const IMAGES_DIR    = path.join(__dirname, '..', 'images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

const args  = process.argv.slice(2);
const FORCE = args.includes('--force');

const DELAY_MS      = 600;   // pausa base entre descargas
const MAX_RETRIES   = 3;     // reintentos por imagen
const RETRY_BASE_MS = 3000;  // backoff: 3s, 6s, 12s
const RATE_LIMIT_MS = 30000; // espera en caso de 429

// ── Utilidades ────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).replace('.', '').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  } catch (_) { return 'jpg'; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Descarga una URL a destPath siguiendo redirecciones.
 * Lanza un error enriquecido con { status } en >= 400.
 */
function downloadFile(url, destPath, redirects = 0) {
  if (redirects > 5) return Promise.reject(Object.assign(new Error('Demasiadas redirecciones'), { status: 0 }));
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NotasHobby/2.0; backup)',
        'Accept': 'image/webp,image/png,image/jpeg,image/*',
        'Accept-Encoding': 'identity',
        'Referer': 'https://en.wikipedia.org/',
      },
      timeout: 20000,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadFile(res.headers.location, destPath, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        const retryAfter = res.headers['retry-after']
          ? parseInt(res.headers['retry-after'], 10) * 1000
          : null;
        const err = Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode, retryAfter });
        reject(err);
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { try { fs.unlinkSync(destPath); } catch (_) {} reject(err); });
    });
    req.on('error', err => { try { fs.unlinkSync(destPath); } catch (_) {} reject(err); });
    req.on('timeout', () => { req.destroy(); reject(Object.assign(new Error('Timeout'), { status: 0 })); });
  });
}

/**
 * Descarga con reintentos y backoff exponencial.
 * En 429 respeta Retry-After o espera RATE_LIMIT_MS.
 */
async function downloadWithRetry(url, destPath, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await downloadFile(url, destPath);
      return true; // éxito
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;

      if (err.status === 429) {
        const waitMs = err.retryAfter || RATE_LIMIT_MS;
        process.stdout.write(`\n  ⏳ Rate limit (429). Esperando ${(waitMs / 1000).toFixed(0)}s...`);
        await sleep(waitMs);
        process.stdout.write(` Reintentando [${attempt}/${MAX_RETRIES}] ${label} ... `);
      } else if (!isLast) {
        const waitMs = RETRY_BASE_MS * attempt;
        await sleep(waitMs);
        process.stdout.write(`reintento ${attempt + 1} ... `);
      } else {
        return err.message; // devuelve el error como string
      }
    }
  }
  return 'Máximo de reintentos alcanzado';
}

// ── Programa principal ────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const datos = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));
  let datosModificados = false;

  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : {};

  const total = datos.length;
  let descargadas = 0;
  let saltadas    = 0;
  let sinImagen   = 0;
  const errores   = [];

  // Calcular cuántas quedan pendientes para mostrar progreso real
  const pendientes = datos.filter((j, i) => {
    const url = j.imagen || j.imagen_wiki || '';
    if (!url) return false;
    const ext  = extFromUrl(url);
    const slug = slugify(j.Juego);
    const dest = path.join(IMAGES_DIR, `${i}_${slug}.${ext}`);
    return FORCE || (!manifest[i] && !fs.existsSync(dest));
  }).length;

  console.log(`\n📦 Descarga de imágenes — ${total} juegos totales`);
  console.log(`   Modo: ${FORCE ? 'FORZAR (re-descarga todo)' : 'SOLO FALTANTES'}`);
  console.log(`   Pendientes: ${pendientes} | Ya descargadas: ${total - pendientes}\n`);

  let contador = 0; // contador de las pendientes reales

  for (let idx = 0; idx < datos.length; idx++) {
    const j   = datos[idx];
    const url = j.imagen || j.imagen_wiki || '';

    if (!url) { sinImagen++; continue; }

    const ext      = extFromUrl(url);
    const slug     = slugify(j.Juego);
    const nombre   = `${idx}_${slug}.${ext}`;
    const destPath = path.join(IMAGES_DIR, nombre);

    // Saltar si ya está en manifest Y el fichero existe
    if (!FORCE && manifest[idx] && fs.existsSync(destPath)) {
      saltadas++;
      continue;
    }

    contador++;
    process.stdout.write(`[${contador}/${pendientes}] ${j.Juego} (${j.Consola}) ... `);

    const result = await downloadWithRetry(url, destPath, j.Juego);

    if (result === true) {
      manifest[idx] = { juego: j.Juego, consola: j.Consola, fichero: nombre, url };
      datos[idx].imagen_local = `images/${nombre}`;
      datosModificados = true;
      descargadas++;
      console.log('✅');
    } else {
      errores.push({ idx, juego: j.Juego, consola: j.Consola, url, error: result });
      console.log(`❌ ${result}`);
    }

    // Guardar manifest y datos cada 20 descargas
    if ((descargadas + errores.length) % 20 === 0) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
      if (datosModificados) {
        fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 2), 'utf8');
        datosModificados = false;
      }
    }

    await sleep(DELAY_MS);
  }

  // Guardar manifest y datos final
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 2), 'utf8');

  const totalDescargadas = Object.keys(manifest).length;
  console.log('\n──────────────────────────────────────────────────');
  console.log(`Nuevas descargadas : ${descargadas}`);
  console.log(`Ya existían        : ${saltadas}`);
  console.log(`Sin imagen en DB   : ${sinImagen}`);
  console.log(`Errores            : ${errores.length}`);
  console.log(`Total en backup    : ${totalDescargadas} / ${total - sinImagen}`);
  console.log(`Manifest           : images/manifest.json`);

  if (errores.length > 0) {
    console.log('\n⚠️  Juegos con error (puedes reintentar con: npm run download-images):');
    for (const e of errores) {
      console.log(`  [${e.idx}] ${e.juego} (${e.consola}): ${e.error}`);
    }
  } else {
    console.log('\n🎉 ¡Todas las imágenes descargadas correctamente!');
  }
}

main().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
