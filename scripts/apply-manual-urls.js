const data = require('./datos.json'), fs = require('fs');
const updates = [
  ['World Champ',                   'NES',           'https://storage.googleapis.com/images.pricecharting.com/AMIfv97oq9gdN63LXkopn1S3WoDrZBmCejkRi6BPHZQxqoE10Wmjx0rT8ZXvIOGmJgvpIYYlxfTxPOSj69sRROjbqB5vu7oNr3y0dH8tJSPPz-qqQKodEV5NsjLYh3-xqPlpyoA7wygLZQYGkjWDkPThY-dASjYmyQ/240.jpg'],
  ['Wimbledon Championship Tennis', 'Master System', 'https://cdn.mobygames.com/covers/5740153-wimbledon-championship-tennis-sega-master-system-front-cover.jpg'],
  ['Wimbledon 2',                   'Master System', 'https://segaretro.org/images/f/ff/WimbledonII_title.png'],
  ['Summer Challenge',              'Mega Drive',    'http://segaretro.org/images/a/a9/SummerChallenge_title.png'],
  ['Wimbledon',                     'Mega Drive',    'https://www.retroplace.com/pics/smd/packshots/38949--sega-sports-1-super-monaco-wimbledon-ultimate-soccer.png'],
  ['Ren And Stimpy',                'Mega Drive',    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEih2P0TGWSj_QFEOLmydsqerVys0CIlTkvgnXv2ygLW-VqsKF5J73CjKIe89FgPeQqAEREAPfYQZ5iKu4WjqOak4KaDgFcXSMNSynzJVBIN25_1rrSLbpg1A67epSZH-50LEy2LRYexWERG/s1600/1240858282-00.jpg'],
  ['F-1 Racing Heavenly Symphony',  'Mega CD',       'https://segaretro.org/images/1/1d/Formulaone_beyondthelimit_titlescreen.png'],
  ['Skeleton Krew',                 'Mega Drive',    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjCpcJxV61g0Fju1e7VlRlQC1Ra5ILXyF4u00e1nxsuM42hoH0Zs9dzvgbJ_CfHNz76wnqkXf-2MVz2T_DuO3hDE13NnOTBnaWlpgGpl_5cAtvrd4M0flPWXPOS25Hh_idw_6cT_Um_R2BJ/s1600/skeleton-krew-cover.jpg'],
  ['4 in 1 Funpak',                 'Game Boy',      'https://www.game-boy-database.com/vizu/23.jpg'],
  ['Victory Boxing',                'Saturn',        'https://www.retroplace.com/pics/saturn/packshots/51211--victory-boxing.png'],
];
updates.forEach(([j, c, url]) => {
  const e = data.find(x => x.Juego === j && x.Consola === c);
  if (e) { e.imagen_wiki = url; console.log('OK', j, '|', c); }
  else console.log('?? no encontrado:', j, c);
});
fs.writeFileSync('datos.json', JSON.stringify(data, null, 2), 'utf8');
console.log('Guardado.');
