const https = require('https'), fs = require('fs');

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'HobbyConsolasBot/3.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        res(get(r.headers.location)); r.resume(); return;
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ s: r.statusCode, b: d }));
    }).on('error', rej).setTimeout(12000, function () { this.destroy(); });
  });
}

async function summary(slug) {
  try {
    const r = await get('https://en.wikipedia.org/api/rest_v1/page/summary/' + slug);
    if (r.s !== 200) return null;
    const d = JSON.parse(r.b);
    if (d.type === 'disambiguation') return null;
    const img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || null;
    return img ? { title: d.title, desc: d.description || '', img } : null;
  } catch (_) { return null; }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// [slug_encoded, juego exacto en datos.json, consola exacta]
const manual = [
  ['The_Magical_Quest_Starring_Mickey_Mouse',               'The Magical Quest Starring Mickey Mouse', 'Super Nintendo'],
  ['Wario_Blast%3A_Featuring_Bomberman!',                  'Wario Blast',                             'Game Boy'],
  ['Skeleton_Krew',                                        'Skeleton Krew',                           'Mega Drive'],
  ['The_Ren_%26_Stimpy_Show%3A_Stimpy%27s_Invention',     'Ren And Stimpy',                          'Mega Drive'],
  ['Trivial_Pursuit_(video_game)',                         'Trivial Pursuit Genus Edition',           'Master System'],
  ['The_Ottifants',                                        'The Ottifants',                           'Mega Drive'],
  ['The_Ottifants',                                        'Ottifants',                               'Master System'],
  ['The_Ottifants',                                        'Ottifants',                               'Game Gear'],
  ['Val_d%27Is%C3%A8re_Skiing_and_Snowboarding',           "Val d'Isere Championship",                'Super Nintendo'],
  ['Frank_Thomas_Big_Hurt_Baseball',                       'F. Thomas',                               'Super Nintendo'],
  ['Motocross_Championship_(video_game)',                   'Super Motocross',                         'Mega Drive 32X'],
  ['Kick_Off_3%3A_European_Challenge',                     'Kick Off 3 European Challenge',           'Super Nintendo'],
  ['Victory_Boxing_(video_game)',                          'Victory Boxing',                          'Saturn'],
  ['Shockwave_2%3A_Beyond_the_Limit',                      'Shockwave 2',                             '3DO'],
  ['Bram_Stoker%27s_Dracula_(video_game)',                 'Dracula',                                 'Game Boy'],
  ['Jack_Nicklaus%27_Greatest_18_Holes_of_Major_Championship_Golf', 'Jack Nicklaus Golf',            'Game Boy'],
  ['Jack_Nicklaus_Golf_%26_Course_Design%3A_Signature_Edition',     'Jack Nicklaus Power Challenge Golf', 'Mega Drive'],
  ['Wimbledon_(1993_video_game)',                           'Wimbledon',                               'Mega Drive'],
  ['Wimbledon_(Sega_video_game)',                           'Wimbledon',                               'Mega Drive'],
  ['Wimbledon_2_(video_game)',                              'Wimbledon 2',                             'Master System'],
  ['Wimbledon_Championship_Tennis',                        'Wimbledon Championship Tennis',           'Master System'],
  ['Grandslam%3A_The_Tennis_Tournament',                   'Grandslam: The Tennis Tournament',        'Mega Drive'],
  ['4-in-1_Funpak',                                        '4 in 1 Funpak',                           'Game Boy'],
  ['The_Legend_of_Prince_Valiant_(video_game)',             'The Legend of Prince Valiant',            'Game Boy'],
  ['F1_Pole_Position_(Game_Boy)',                           'F-1 Pole Position',                       'Game Boy'],
  ['F-1_Pole_Position_(Game_Boy)',                          'F-1 Pole Position',                       'Game Boy'],
  ['World_Cup_Striker',                                    'World Cup Striker',                       'Super Nintendo'],
  ['Man_Overboard!',                                       'Man Overboard',                           'Mega Drive'],
  ['F-1_Racing%3A_Heavenly_Symphony',                      'F-1 Racing Heavenly Symphony',            'Mega CD'],
  ['Summer_Challenge_(Accolade)',                          'Summer Challenge',                        'Mega Drive'],
  ['World_Champ_(video_game)',                              'World Champ',                             'NES'],
  ['Chessmaster_(series)',                                  'The Chessmaster',                         'Super Nintendo'],
  ['The_Chessmaster',                                      'The Chessmaster',                         'Super Nintendo'],
  ['Phantom_Air_Mission',                                  'Phantom Air Mission',                     'NES'],
  ['Super_Widget',                                         'Super Widget',                            'Super Nintendo'],
  ['Solitaire_Poker',                                      'Solitaire Poker',                         'Game Gear'],
  ['Summer_Challenge',                                     'Summer Challenge',                        'Mega Drive'],
];

async function run() {
  const data = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
  let applied = 0;
  const notFound = [];

  for (const [slug, juego, consola] of manual) {
    const r = await summary(slug);
    await delay(500);
    const e = data.find(j => j.Juego === juego && j.Consola === consola);
    if (!e) { console.log('?? no existe en datos:', juego, consola); continue; }
    if (e.imagen_wiki) continue; // ya tiene
    if (r) {
      e.imagen_wiki = r.img; applied++;
      console.log('✅', juego, '|', consola, '->', r.title);
      console.log('  ', r.img.substring(0, 80));
    } else {
      notFound.push({ juego, consola, slug });
    }
  }

  fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('\n=== Aplicadas:', applied, '===');
  if (notFound.length) {
    console.log('=== No encontradas ===');
    notFound.forEach(x => console.log(' ❌', x.juego, '|', x.consola, '|', x.slug));
  }
}

run().catch(console.error);
