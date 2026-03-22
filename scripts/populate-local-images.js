#!/usr/bin/env node
'use strict';

/**
 * populate-local-images.js
 *
 * Lee images/manifest.json y escribe el campo imagen_local en datos.json
 * para todos los juegos que ya tienen imagen descargada en images/.
 * Se puede ejecutar de forma segura múltiples veces (idempotente).
 *
 * Uso: node scripts/populate-local-images.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = path.join(__dirname, '..');
const DATOS_PATH    = path.join(ROOT, 'datos.json');
const MANIFEST_PATH = path.join(ROOT, 'images', 'manifest.json');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('❌ No se encontró images/manifest.json. Ejecuta primero: npm run download-images');
  process.exit(1);
}

const datos    = JSON.parse(fs.readFileSync(DATOS_PATH,    'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

let actualizados = 0;
let yaTeníanCampo = 0;
let archivoNoExiste = 0;

for (const [idxStr, entry] of Object.entries(manifest)) {
  const idx      = Number(idxStr);
  const filePath = path.join(ROOT, 'images', entry.fichero);
  const valor    = `images/${entry.fichero}`;

  if (!fs.existsSync(filePath)) {
    archivoNoExiste++;
    continue;
  }

  if (datos[idx].imagen_local === valor) {
    yaTeníanCampo++;
    continue;
  }

  datos[idx].imagen_local = valor;
  actualizados++;
}

fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 2), 'utf8');

console.log('──────────────────────────────────────────────────');
console.log(`Actualizados  : ${actualizados}`);
console.log(`Ya correctos  : ${yaTeníanCampo}`);
console.log(`Sin archivo   : ${archivoNoExiste}`);
console.log('✅ datos.json actualizado con imagen_local');
