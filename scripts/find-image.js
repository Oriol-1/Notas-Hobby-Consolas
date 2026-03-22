// find-image.js — Busca y muestra la información de imagen de un juego
//
// Uso:
//   node scripts/find-image.js "Nombre del juego"
//   node scripts/find-image.js "Nombre del juego" "Consola"
//
// Ejemplos:
//   node scripts/find-image.js "Sonic"
//   node scripts/find-image.js "Sonic the Hedgehog" "Mega Drive"

'use strict';

const fs   = require('fs');
const path = require('path');

const DATOS_PATH = path.join(__dirname, '..', 'datos.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images');

const [, , queryNombre, queryConsola] = process.argv;

if (!queryNombre) {
  console.error('Uso: node scripts/find-image.js "Nombre del juego" [Consola]');
  process.exit(1);
}

const datos = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));

// Búsqueda case-insensitive y parcial por nombre, opcionalmente filtrada por consola
const normQ = queryNombre.toLowerCase();
const normC = queryConsola ? queryConsola.toLowerCase() : null;

const resultados = datos.filter(j => {
  const nombreOk = j.Juego.toLowerCase().includes(normQ);
  const consolaOk = normC ? j.Consola.toLowerCase().includes(normC) : true;
  return nombreOk && consolaOk;
});

if (resultados.length === 0) {
  console.log(`No se encontraron juegos que contengan "${queryNombre}"${queryConsola ? ` en ${queryConsola}` : ''}.`);
  process.exit(0);
}

// Construir nombre de fichero local para saber si está descargado
function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function localImagePath(idx, juego) {
  const slug = slugify(juego);
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  for (const ext of exts) {
    const p = path.join(IMAGES_DIR, `${idx}_${slug}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

console.log(`\nResultados para "${queryNombre}"${queryConsola ? ` [${queryConsola}]` : ''}: ${resultados.length} juego(s)\n`);

for (const j of resultados) {
  const idx = datos.indexOf(j);
  const local = localImagePath(idx, j.Juego);

  console.log(`  Juego     : ${j.Juego}`);
  console.log(`  Consola   : ${j.Consola} (${j['Marca consola']}) — ${j.Año}`);
  console.log(`  imagen    : ${j.imagen    || '(vacío)'}`);
  console.log(`  imagen_wiki: ${j.imagen_wiki || '(vacío)'}`);
  console.log(`  Local     : ${local ? path.relative(path.join(__dirname, '..'), local) : '(no descargada)'}`);
  console.log(`  Índice    : ${idx}`);
  console.log('');
}
