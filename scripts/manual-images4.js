// Busca imágenes usando Wikidata (P18 = imagen de cobertura)
const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/5.0' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      res(get(r.headers.location)); r.resume(); return;
    }
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, b: d }));
  }).on('error', rej).setTimeout(12000, function () { this.destroy(); }));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Busca en Wikidata el QID del juego
async function wikidataSearch(query) {
  const url = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search='
    + encodeURIComponent(query) + '&language=en&limit=3&format=json&type=item';
  const r = await get(url);
  if (r.s !== 200) return [];
  const d = JSON.parse(r.b);
  return (d.search || []).map(x => ({ id: x.id, label: x.label, desc: x.description || '' }));
}

// Obtiene P18 (image) de un QID
async function wikidataImage(qid) {
  const url = 'https://www.wikidata.org/w/api.php?action=wbgetclaims&entity='
    + qid + '&property=P18&format=json';
  const r = await get(url);
  if (r.s !== 200) return null;
  const d = JSON.parse(r.b);
  const claims = d.claims && d.claims.P18;
  if (!claims || !claims.length) return null;
  const fileName = claims[0].mainsnak.datavalue && claims[0].mainsnak.datavalue.value;
  if (!fileName) return null;
  // Construir URL de Wikimedia Commons
  const name = fileName.replace(/ /g, '_');
  const md5 = require('crypto').createHash('md5').update(name).digest('hex');
  return 'https://upload.wikimedia.org/wikipedia/commons/' + md5[0] + '/' + md5[0] + md5[1] + '/' + encodeURIComponent(name);
}

// Busca en Wikimedia Commons directamente
async function commonsSearch(query) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch='
    + encodeURIComponent(query) + '&srnamespace=6&srlimit=5&format=json';
  const r = await get(url);
  if (r.s !== 200) return [];
  const d = JSON.parse(r.b);
  return (d.query && d.query.search || []).map(x => x.title);
}

async function commonsFileUrl(fileTitle) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&titles='
    + encodeURIComponent(fileTitle) + '&prop=imageinfo&iiprop=url&format=json';
  const r = await get(url);
  if (r.s !== 200) return null;
  const d = JSON.parse(r.b);
  const pages = d.query && d.query.pages;
  for (const pid of Object.keys(pages || {})) {
    const info = pages[pid].imageinfo;
    if (info && info[0]) return info[0].url;
  }
  return null;
}

// Games to search for
const games = [
  ['The Magical Quest Starring Mickey Mouse', 'Super Nintendo', [
    'Magical Quest Starring Mickey Mouse SNES Capcom',
    'The Magical Quest Mickey Mouse video game',
  ]],
  ['Wario Blast', 'Game Boy',
    ['Wario Blast Featuring Bomberman Game Boy', 'Wario Blast Nintendo']],
  ['Skeleton Krew', 'Mega Drive',
    ['Skeleton Krew Mega Drive Core Design', 'Skeleton Krew video game']],
  ['Ren And Stimpy', 'Mega Drive',
    ["Ren Stimpy Stimpy's Invention Sega Genesis", "Ren Stimpy Sega"]],
  ['The Ottifants', 'Mega Drive',
    ['Ottifants video game Mega Drive', 'Ottifants Sega Genesis']],
  ['Ottifants', 'Master System',
    ['Ottifants Master System Sega', 'The Ottifants game']],
  ['Ottifants', 'Game Gear',
    ['Ottifants Game Gear', 'The Ottifants handheld']],
  ['Wimbledon', 'Mega Drive',
    ['Wimbledon Sega Mega Drive tennis', 'Wimbledon video game 1993']],
  ['Wimbledon 2', 'Master System',
    ['Wimbledon 2 Master System Sega', 'Wimbledon tennis game sequel']],
  ['Wimbledon Championship Tennis', 'Master System',
    ['Wimbledon Championship Tennis Master System', 'Wimbledon Sega game']],
  ['F-1 Racing Heavenly Symphony', 'Mega CD',
    ['F-1 Racing Heavenly Symphony Mega CD', 'F1 Heavenly Symphony Sega game']],
  ['Summer Challenge', 'Mega Drive',
    ['Summer Challenge Accolade Mega Drive athletics', 'Games Summer Challenge Sega']],
  ['World Champ', 'NES',
    ['World Champ NES boxing game', 'World Champ Nintendo boxing']],
  ['Solitaire Poker', 'Game Gear',
    ['Solitaire Poker Game Gear Sega', 'Solitaire Poker handheld']],
  ['4 in 1 Funpak', 'Game Boy',
    ['4 in 1 Funpak Game Boy Sculptured Software', '4-in-1 Fun Pak Nintendo']],
  ['Victory Boxing', 'Saturn',
    ['Victory Boxing Saturn Victor Interactive', 'Victory Boxing 1994 Saturn']],
];

async function findViaWikidata(queries) {
  for (const q of queries) {
    const results = await wikidataSearch(q);
    await delay(400);
    for (const item of results) {
      // Filtrar para juegos de vídeo
      if (item.desc && /video game|game|1992|1993|1994|1995/i.test(item.desc)) {
        const imgUrl = await wikidataImage(item.id);
        await delay(400);
        if (imgUrl) return { source: 'wikidata', id: item.id, label: item.label, img: imgUrl };
      }
    }
  }
  return null;
}

async function findViaCommons(queries) {
  for (const q of queries) {
    const files = await commonsSearch(q);
    await delay(400);
    // Buscar archivos con nombres tipo "cover", "box", "boxart"
    const covers = files.filter(f => /cover|box|art|front|logo/i.test(f));
    const toCheck = covers.length ? covers : files.slice(0, 2);
    for (const f of toCheck) {
      const url = await commonsFileUrl(f);
      await delay(300);
      if (url) return { source: 'commons', file: f, img: url };
    }
  }
  return null;
}

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;
  const notFound = [];

  for (const [juego, consola, queries] of games) {
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e) { console.log('?? no existe:', juego); continue; }
    if (e.imagen_wiki) continue;

    console.log('\n⏳', juego, '|', consola);

    // Intentar Wikidata primero
    let r = await findViaWikidata(queries);
    if (!r) r = await findViaCommons(queries);

    if (r) {
      console.log('✅', juego, '|', consola, '->', r.label || r.file);
      console.log('  ', r.img.substring(0, 90));
      e.imagen_wiki = r.img;
      applied++;
    } else {
      console.log('❌ No encontrado:', juego, '|', consola);
      notFound.push({ juego, consola });
    }
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\n=== Aplicadas:', applied, '===');
  if (notFound.length) {
    console.log('\n=== Sin imagen definitivamente ===');
    notFound.forEach(x => console.log(' ❌', x.juego, '|', x.consola));
  }
}

run().catch(console.error);
