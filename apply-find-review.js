'use strict';
/**
 * apply-find-review.js
 * Revisa find-images-review.json y aplica los candidatos aprobados a datos.json
 * 
 * Uso interactivo: muestra cada candidato con su imagen y consola pregunta si aprobar.
 * Para aprobar todos sin preguntar: node apply-find-review.js --all
 * Para ver la lista sin aplicar nada: node apply-find-review.js --list
 */
const fs = require('fs');
const PATH    = './datos.json';
const REVIEW  = './find-images-review.json';

if (!fs.existsSync(REVIEW)) {
  console.log('No existe find-images-review.json');
  process.exit(0);
}

const datos  = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const items  = JSON.parse(fs.readFileSync(REVIEW, 'utf8'));
const args   = process.argv.slice(2);
const ALL    = args.includes('--all');
const LIST   = args.includes('--list');

if (LIST) {
  console.log(`\nCandidatos para revisión (${items.length}):\n`);
  items.forEach((item, i) => {
    console.log(`[${i + 1}] ${item.juego} (${item.consola})`);
    console.log(`    Wikipedia: ${item.wikiTitle} (pts=${item.pts})`);
    console.log(`    Imagen:    ${item.img}\n`);
  });
  process.exit(0);
}

if (ALL) {
  let applied = 0;
  for (const item of items) {
    datos[item.idx].imagen_wiki = item.img;
    applied++;
    console.log(`✓ ${item.juego} → ${item.wikiTitle} (pts=${item.pts})`);
  }
  fs.writeFileSync(PATH, JSON.stringify(datos, null, 2), 'utf8');
  fs.unlinkSync(REVIEW);
  console.log(`\nAplicados ${applied} candidatos. find-images-review.json eliminado.`);
  process.exit(0);
}

// Modo interactivo: preguntar por cada uno
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function ask(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

(async () => {
  let approved = 0, rejected = 0;
  const pending = [];

  console.log(`\nRevisando ${items.length} candidatos...\n`);
  for (const item of items) {
    console.log(`Juego    : ${item.juego} (${item.consola})`);
    console.log(`Wikipedia: ${item.wikiTitle} (pts=${item.pts})`);
    console.log(`Imagen   : ${item.img}`);
    const resp = await ask('¿Aprobar? [s/n/q]: ');
    if (resp.toLowerCase() === 'q') { pending.push(item); break; }
    if (resp.toLowerCase() === 's') {
      datos[item.idx].imagen_wiki = item.img;
      approved++;
    } else {
      rejected++;
      pending.push(item);
    }
    console.log('');
  }

  rl.close();

  if (approved > 0) {
    fs.writeFileSync(PATH, JSON.stringify(datos, null, 2), 'utf8');
    console.log(`\nGuardados ${approved} candidatos aprobados en datos.json.`);
  }
  if (pending.length > 0) {
    fs.writeFileSync(REVIEW, JSON.stringify(pending, null, 2), 'utf8');
    console.log(`${pending.length} candidatos pendientes en find-images-review.json.`);
  } else if (fs.existsSync(REVIEW)) {
    fs.unlinkSync(REVIEW);
    console.log('find-images-review.json eliminado (todos procesados).');
  }
  console.log(`Aprobados: ${approved} | Rechazados: ${rejected}`);
})();
