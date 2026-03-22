// set-image.js — Modifica la URL de imagen de un juego en datos.json
//
// Uso:
//   node scripts/set-image.js "Nombre exacto" "Consola exacta" "https://nueva-url.jpg"
//   node scripts/set-image.js "Nombre exacto" "Consola exacta" "https://nueva-url.jpg" --campo imagen_wiki
//   node scripts/set-image.js "Nombre exacto" "Consola exacta" "https://nueva-url.jpg" --download
//
// Opciones:
//   --campo imagen       Modifica el campo "imagen" (RAWG) — por defecto
//   --campo imagen_wiki  Modifica el campo "imagen_wiki" (Wikipedia)
//   --download           Descarga también la imagen al directorio images/

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

const DATOS_PATH = path.join(__dirname, '..', 'datos.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Uso: node scripts/set-image.js "Nombre exacto" "Consola" "https://url.jpg" [--campo imagen|imagen_wiki] [--download]');
  process.exit(1);
}

const [nombre, consola, urlNueva] = args;
const campoIdx = args.indexOf('--campo');
const campo = campoIdx !== -1 ? args[campoIdx + 1] : 'imagen';
const doDownload = args.includes('--download');

if (!['imagen', 'imagen_wiki'].includes(campo)) {
  console.error(`Campo no válido: "${campo}". Usa "imagen" o "imagen_wiki".`);
  process.exit(1);
}

const datos = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));

const juego = datos.find(
  j => j.Juego.toLowerCase() === nombre.toLowerCase()
    && j.Consola.toLowerCase() === consola.toLowerCase()
);

if (!juego) {
  console.error(`No encontrado en datos.json: "${nombre}" (${consola})`);
  console.error('Usa find-image.js para buscar la coincidencia exacta.');
  process.exit(1);
}

const urlAnterior = juego[campo] || '(vacío)';
juego[campo] = urlNueva;
fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 2), 'utf8');

console.log(`✅ Actualizado: ${juego.Juego} (${juego.Consola})`);
console.log(`   Campo: ${campo}`);
console.log(`   Antes: ${urlAnterior}`);
console.log(`   Ahora: ${urlNueva}`);

if (!doDownload) {
  process.exit(0);
}

// ── Descarga de la imagen ─────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).replace('.', '');
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  } catch (_) { return 'jpg'; }
}

function downloadFile(url, destPath, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Demasiadas redirecciones'));
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NotasHobby/2.0; backup)',
        'Accept': 'image/webp,image/png,image/jpeg,image/*',
        'Referer': 'https://en.wikipedia.org/',
      },
      timeout: 20000,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadFile(res.headers.location, destPath, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const idx = datos.indexOf(juego);
const ext = extFromUrl(urlNueva);
const slug = slugify(juego.Juego);
const destPath = path.join(IMAGES_DIR, `${idx}_${slug}.${ext}`);

console.log(`\nDescargando imagen → ${path.basename(destPath)} ...`);

downloadFile(urlNueva, destPath)
  .then(() => console.log(`✅ Guardada en images/${path.basename(destPath)}`))
  .catch(err => {
    console.error(`❌ Error al descargar: ${err.message}`);
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    process.exit(1);
  });
