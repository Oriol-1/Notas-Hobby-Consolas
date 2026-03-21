/**
 * enrich-images.js
 * Script one-time para añadir imágenes de portada a datos.json
 * Fuente 1: RAWG.io API (requiere clave en .env)
 * Fuente 2: Wikipedia REST API (fallback, sin clave)
 * Uso: node enrich-images.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// Cargar .env manualmente (sin dependencias externas)
function loadEnv() {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
    }
}

loadEnv();

const RAWG_KEY = process.env.RAWG_API_KEY;
if (!RAWG_KEY) {
    console.error("❌ Falta RAWG_API_KEY en el archivo .env");
    process.exit(1);
}

const DATOS_PATH = path.join(__dirname, "datos.json");
const DELAY_MS = 400;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGet(url) {
    return new Promise((resolve) => {
        const options = {
            headers: {
                "User-Agent": "notashobby-enricher/1.0",
                "Accept": "application/json",
            },
        };
        https
            .get(url, options, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve({ ok: res.statusCode < 400, body: JSON.parse(data) });
                    } catch {
                        resolve({ ok: false, body: null });
                    }
                });
            })
            .on("error", () => resolve({ ok: false, body: null }));
    });
}

async function fetchFromRAWG(nombre, consola) {
    // Busca primero con consola para mayor precisión, luego solo nombre
    const query = encodeURIComponent(nombre);
    const url = `https://api.rawg.io/api/games?search=${query}&page_size=3&key=${RAWG_KEY}`;
    const res = await httpsGet(url);
    if (!res.ok || !res.body?.results?.length) return "";

    // Intenta encontrar el más relevante: el que tenga imagen
    for (const game of res.body.results) {
        if (game.background_image) return game.background_image;
    }
    return "";
}

async function fetchFromWikipedia(nombre) {
    const query = encodeURIComponent(nombre.replace(/\s+/g, "_"));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;
    const res = await httpsGet(url);
    if (!res.ok || !res.body?.thumbnail?.source) return "";
    return res.body.thumbnail.source;
}

async function main() {
    const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));
    const total = datos.length;
    let rawgHits = 0;
    let wikiHits = 0;
    let noImage = 0;

    console.log(`\n🎮 Enriqueciendo ${total} juegos con imágenes...\n`);

    for (let i = 0; i < datos.length; i++) {
        const juego = datos[i];
        const nombre = juego["Juego"];

        // Si ya tiene imagen válida, saltar
        if (juego.imagen && juego.imagen.startsWith("http")) {
            process.stdout.write(`[${i + 1}/${total}] ✅ Ya tiene imagen: ${nombre}\n`);
            continue;
        }

        process.stdout.write(`[${i + 1}/${total}] 🔍 ${nombre}... `);

        // Fuente 1: RAWG
        let imagen = await fetchFromRAWG(nombre, juego["Consola"]);
        if (imagen) {
            juego.imagen = imagen;
            juego.imagen_wiki = "";
            rawgHits++;
            process.stdout.write(`✅ RAWG\n`);
        } else {
            // Fuente 2: Wikipedia
            await sleep(100);
            let imagenWiki = await fetchFromWikipedia(nombre);
            if (imagenWiki) {
                juego.imagen = "";
                juego.imagen_wiki = imagenWiki;
                wikiHits++;
                process.stdout.write(`📖 Wikipedia\n`);
            } else {
                juego.imagen = "";
                juego.imagen_wiki = "";
                noImage++;
                process.stdout.write(`⚠️  Sin imagen\n`);
            }
        }

        // Guardar progreso cada 20 juegos
        if ((i + 1) % 20 === 0) {
            fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");
            console.log(`💾 Guardado parcial (${i + 1}/${total})`);
        }

        await sleep(DELAY_MS);
    }

    // Guardado final
    fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");

    console.log(`\n✨ ¡Completado!`);
    console.log(`   RAWG:       ${rawgHits} imágenes`);
    console.log(`   Wikipedia:  ${wikiHits} imágenes`);
    console.log(`   Sin imagen: ${noImage} juegos`);
    console.log(`   Total:      ${total} juegos procesados\n`);
}

main().catch((err) => {
    console.error("Error fatal:", err);
    process.exit(1);
});
