const https = require('https');
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, {headers:{'User-Agent':'Mozilla/5.0'}}, r => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d))}catch(e){res(d)} });
    }).on('error', rej);
  });
}
async function main() {
  // Buscar el archivo de imagen de portada SMS directamente en Wikipedia/Commons
  const candidates = [
    'Paperboy_SMS_cover.jpg',
    'Paperboy_cover_SMS.jpg',
    'Paperboy_Master_System_box.jpg',
    'Paperboy_Home_Conversions.jpg',
    'Paperboy_home.jpg',
    'PaperboySMS.jpg',
    'Paperboy_SMSbox.jpg',
    'Paperboy_Sega_Master.jpg',
    'Paperboy_SegaMasterSystem.jpg',
    'Paperboy_home_versions.jpg',
    'Paperboy_cover.jpg',
    'Paperboy_NES.jpg',
    'PaperboyNES.jpg',
    'Paperboy_NESbox.jpg',
    'Paperboy_box.jpg',
    'Paperboy_boxart.jpg',
    'Paperboy_coverart.jpg',
  ];
  const titles = candidates.map(f => 'File:' + f).join('|');
  const r = await get('https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(titles) + '&prop=imageinfo&iiprop=url&iilimit=1&format=json');
  const pages2 = Object.values(r.query.pages);
  pages2.forEach(p => {
    const url = p.imageinfo && p.imageinfo[0] && p.imageinfo[0].url;
    if (url) console.log('FOUND:', p.title, '->', url);
  });

  // También buscar por opensearch
  const os = await get('https://en.wikipedia.org/w/api.php?action=opensearch&search=Paperboy+video+game&limit=10&format=json');
  console.log('\nOpenSearch resultados:');
  (os[1] || []).forEach(t => console.log(' -', t));

  // Buscar específicamente la imagen en la infobox del artículo principal
  const sum = await get('https://en.wikipedia.org/api/rest_v1/page/summary/Paperboy_(video_game)');
  console.log('\nSummary lead image:', sum.originalimage && sum.originalimage.source);
}
main().catch(e=>console.error('ERR:', e.message));
