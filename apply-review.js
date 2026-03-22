// apply-review.js — Aplica a datos.json los candidatos aprobados de wiki-precise-review.json
//
// Uso:
//   1. Abre wiki-precise-review.json
//   2. Para cada candidato que quieras aceptar, cambia "aprobado": false → "aprobado": true
//   3. Ejecuta: node apply-review.js

const fs = require('fs');

const DATA_FILE   = 'datos.json';
const REVIEW_FILE = 'wiki-precise-review.json';

function main() {
  if (!fs.existsSync(REVIEW_FILE)) {
    console.log(`No existe ${REVIEW_FILE}. Ejecuta primero wiki-precise.js`);
    process.exit(1);
  }

  const data   = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const review = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));

  const approved = review.filter(r => r.aprobado === true);
  if (approved.length === 0) {
    console.log('No hay candidatos marcados como aprobado: true en wiki-precise-review.json');
    process.exit(0);
  }

  console.log(`Aplicando ${approved.length} candidatos aprobados...`);
  let applied = 0;
  let notFound = 0;

  for (const candidate of approved) {
    const entry = data.find(
      j => j.Juego === candidate.Juego
        && j.Consola === candidate.Consola
        && j.Año === candidate.Año
    );
    if (entry) {
      entry.imagen_wiki = candidate.urlImagen;
      applied++;
      console.log(`  ✅ ${candidate.Juego} (${candidate.Consola}, ${candidate.Año}) → ${candidate.wikiTitle}`);
    } else {
      notFound++;
      console.log(`  ⚠️  No encontrado en datos.json: ${candidate.Juego} (${candidate.Consola}, ${candidate.Año})`);
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nAplicados: ${applied} | No encontrados: ${notFound}`);
  console.log('datos.json actualizado.');
}

main();
