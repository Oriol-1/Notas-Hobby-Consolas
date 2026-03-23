// Prueba muy específica con slugs exactos de Wikipedia y alternativas conocidas
const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/7.0' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      res(get(r.headers.location)); r.resume(); return;
    }
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, b: d }));
  }).on('error', rej).setTimeout(12000, function () { this.destroy(); }));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function summary(title) {
  try {
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'));
    const r = await get(url);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    if (d.type === 'disambiguation') return null;
    const img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || null;
    return img ? { title: d.title, img } : null;
  } catch (_) { return null; }
}

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;

  const tests = [
    // Chessmaster SNES - el nombre exact del juego SNES era diferente
    ['The Chessmaster', 'Super Nintendo', [
      'The Chessmaster 4000 Turbo',
      'Chessmaster 4000 Turbo',
      'Chessmaster (video game)',
      'Chessmaster 2100',
      'Chessmaster 3000',
    ]],
    // Summer Challenge - el nombre completo en inglés
    ['Summer Challenge', 'Mega Drive', [
      'The Games: Summer Challenge',
      'The Games 2: Starring Larry Bird',
      'Games: Summer Challenge',
      'Summer Games (Commodore 64)',
    ]],
    // Wimbledon Championship Tennis fue publicado por Sega en 1992 para SMS y MD
    ['Wimbledon Championship Tennis', 'Master System', [
      'Wimbledon Championship Tennis (1992 video game)',
      'Wimbledon Championship Tennis (Sega)',
      'Wimbledon (Sega Genesis game)',
    ]],
    // Los tres Wimbledon Sega son probablemente artículos separados
    ['Wimbledon', 'Mega Drive', [
      'Wimbledon (1993 video game)',
      'Wimbledon (Sega)',
      'Super Tennis (video game)',
    ]],
    ['Wimbledon 2', 'Master System', [
      'Wimbledon 2: Supreme Gentleman',
      'Wimbledon II',
      'Wimbledon 2 (Master System)',
    ]],
    // Skeleton Krew era un juego de Core Design
    ['Skeleton Krew', 'Mega Drive', [
      'Skeleton Krew',
      'Corpse Killer',
    ]],
    // The Ottifants was a Sega game based on the Otto Waalkes cartoon
    ['The Ottifants', 'Mega Drive', [
      'The Ottifants',
      'Otto Waalkes',
    ]],
    ['Ottifants', 'Master System', [
      'The Ottifants',
    ]],
    ['Ottifants', 'Game Gear', [
      'The Ottifants',
    ]],
    // F-1 Racing Heavenly Symphony es un juego japonés
    ['F-1 Racing Heavenly Symphony', 'Mega CD', [
      'F-1 Racing: Heavenly Symphony',
      'F-1 World Grand Prix (video game)',
      'F-1 Circus',
    ]],
    // World Champ NES - publicado por Video System
    ['World Champ', 'NES', [
      'World Champ (NES)',
      'World Champ (video game)',
      'Video System (developer)',
    ]],
    // Ren And Stimpy - Stimpy's Invention for Sega MD
    ['Ren And Stimpy', 'Mega Drive', [
      "The Ren & Stimpy Show: Stimpy's Invention",
    ]],
    // Victory Boxing Saturn - Victor Interactive 1994
    ['Victory Boxing', 'Saturn', [
      'Victory Boxing (1994 video game)',
      'Victory Boxing (Saturn)',
      'Human Entertainment',
    ]],
  ];

  for (const [juego, consola, titles] of tests) {
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e || e.imagen_wiki) continue;

    for (const t of titles) {
      const r = await summary(t);
      await delay(400);
      if (r) {
        e.imagen_wiki = r.img;
        applied++;
        console.log('✅', juego, '|', consola, '-->', r.title);
        console.log('  ', r.img.substring(0, 90));
        break;
      }
    }
    if (!e.imagen_wiki) process.stdout.write('❌ ' + juego + '\n');
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\nAplicadas:', applied);

  // Recuento final
  const sinImg = data.filter(j => {
    const fw = j.imagen_wiki && j.imagen_wiki.trim();
    const fl = j.imagen_local;
    return !fw && !fl;
  });
  console.log('Total definitivamente sin imagen:', sinImg.length);
  sinImg.forEach(j => console.log(' -', j.Juego, '|', j.Consola));
}

run().catch(console.error);
