/**
 * wiki-only.js  — Fase 2
 * Busca imágenes en Wikipedia para todos los juegos que no tienen imagen
 * (imagen="" e imagen_wiki=""). NO usa RAWG bajo ningún concepto.
 *
 * Debe ejecutarse DESPUÉS de fix-duplicates.js.
 * Uso: node wiki-only.js
 */

const fs    = require("fs");
const path  = require("path");
const https = require("https");

const DATOS_PATH = path.join(__dirname, "datos.json");
const DELAY_MS   = 300;

// Nombres de plataforma para variantes de Wikipedia (exactamente los mismos que en enrich-images.js)
const WIKI_PLATFORM_NAMES = {
    "Mega Drive":      "Sega Genesis game",
    "Master System":   "Master System game",
    "Game Gear":       "Game Gear game",
    "Game Boy":        "Game Boy game",
    "Super Nintendo":  "Super Nintendo game",
    "NES":             "NES game",
    "Nintendo":        "NES game",
    "Neo Geo":         "Neo Geo game",
    "Neo Geo CD":      "Neo Geo game",
    "Saturn":          "Sega Saturn game",
    "PlayStation":     "PlayStation game",
    "3DO":             "3DO game",
    "Jaguar":          "Atari Jaguar game",
    "Lynx":            "Atari Lynx game",
    "Turbo Grafx":     "TurboGrafx-16 game",
    "Mega CD":         "Sega CD game",
    "Mega CD 32X":     "Sega CD game",
    "Mega Drive 32X":  "Sega 32X game",
    "CD-i":            "CD-i game",
};

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function httpsGet(url) {
    return new Promise(resolve => {
        https
            .get(url, { headers: { "User-Agent": "notashobby-enricher/1.0", "Accept": "application/json" } }, res => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    try { resolve({ ok: res.statusCode < 400, body: JSON.parse(data) }); }
                    catch { resolve({ ok: false, body: null }); }
                });
            })
            .on("error", () => resolve({ ok: false, body: null }));
    });
}

/**
 * Busca la imagen en Wikipedia con ~14 variantes de título.
 * Idéntico a fetchFromWikipedia en enrich-images.js.
 */
async function fetchFromWikipedia(nombre, consola, anio) {
    const platformVariant = WIKI_PLATFORM_NAMES[consola] || "";
    const year = parseInt(anio, 10) || null;

    const sinThe      = /^the\s+/i.test(nombre) ? nombre.replace(/^the\s+/i, "") : null;
    const sinSubtitulo = nombre.includes(":")   ? nombre.split(":")[0].trim()
                       : nombre.includes(" - ") ? nombre.split(" - ")[0].trim()
                       : null;

    const variantes = [];
    const bases = [nombre];
    if (sinThe) bases.push(sinThe);
    if (sinSubtitulo && sinSubtitulo !== nombre) bases.push(sinSubtitulo);

    for (const base of bases) {
        if (platformVariant) variantes.push(`${base} (${platformVariant})`);
        if (year)            variantes.push(`${base} (${year} video game)`);
        variantes.push(base);
        variantes.push(`${base} (video game)`);
        variantes.push(`${base} (videogame)`);
        variantes.push(`${base} (arcade game)`);
        if (year)            variantes.push(`${base} (${year} arcade game)`);
    }

    // Eliminar duplicados manteniendo orden
    const vistas = new Set();
    const unicas = variantes.filter(v => { if (vistas.has(v)) return false; vistas.add(v); return true; });

    for (const variante of unicas) {
        const query = encodeURIComponent(variante.replace(/\s+/g, "_"));
        const url   = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;
        const res   = await httpsGet(url);
        if (res.ok && res.body?.thumbnail?.source) return res.body.thumbnail.source;
        await sleep(80);
    }
    return "";
}

async function main() {
    const datos     = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));
    const pendientes = datos.filter(j => j.imagen === "" && j.imagen_wiki === "");

    console.log(`\n📖 Buscando en Wikipedia para ${pendientes.length} juegos sin imagen...\n`);

    let found    = 0;
    let notFound = 0;
    let processed = 0;

    for (let i = 0; i < datos.length; i++) {
        const juego = datos[i];

        // Solo juegos sin imagen ni imagen_wiki
        if (juego.imagen !== "" || juego.imagen_wiki !== "") continue;

        const nombre  = juego["Juego"];
        const consola = juego["Consola"];
        const anio    = juego["Año"];

        process.stdout.write(`[${i + 1}/1492] 🔍 ${nombre} (${consola}, ${anio})... `);

        const imgWiki = await fetchFromWikipedia(nombre, consola, anio);

        if (imgWiki) {
            juego.imagen_wiki = imgWiki;
            found++;
            process.stdout.write(`📖 Wikipedia\n`);
        } else {
            notFound++;
            process.stdout.write(`⚠️  No encontrado\n`);
        }

        processed++;

        // Guardar progreso cada 20 procesados
        if (processed % 20 === 0) {
            fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");
            console.log(`💾 Guardado parcial (${found} encontrados, ${notFound} no encontrados)`);
        }

        await sleep(DELAY_MS);
    }

    // Guardado final
    fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");

    // Estadísticas finales
    const ok   = datos.filter(j => j.imagen && j.imagen.includes("/games/")).length;
    const sc   = datos.filter(j => j.imagen && j.imagen.includes("/screenshots/")).length;
    const wiki = datos.filter(j => j.imagen === "" && j.imagen_wiki !== "").length;
    const nada = datos.filter(j => j.imagen === "" && j.imagen_wiki === "").length;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`✨ ¡Completado!`);
    console.log(`   Wikipedia encontrados: ${found}`);
    console.log(`   No encontrados:        ${notFound}`);
    console.log(`\n📊 Estado final de datos.json:`);
    console.log(`   Portadas /games/:             ${ok}`);
    console.log(`   Screenshots fallback:         ${sc}`);
    console.log(`   Solo Wikipedia (imagen_wiki): ${wiki}`);
    console.log(`   Sin imagen (definitivos):     ${nada}`);
    console.log(`   Total juegos:                 ${datos.length}`);
    console.log(`${"─".repeat(60)}\n`);
}

main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
});
