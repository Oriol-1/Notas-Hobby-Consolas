/**
 * enrich-images.js
 * Script one-time para añadir imágenes de portada a datos.json
 * Fuente 1: RAWG.io API (requiere clave en .env)
 * Fuente 2: Wikipedia REST API (fallback, sin clave)
 * Uso: node enrich-images.js
 *
 * Sistema de confianza: combina nombre + año + plataforma para evitar imágenes incorrectas.
 * Si la confianza es baja, se deja vacío en lugar de mostrar un juego equivocado.
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

// IDs de plataforma en RAWG.io (https://api.rawg.io/api/platforms?key=...)
const RAWG_PLATFORMS = {
    "Mega Drive":      "3",
    "Master System":   "167",
    "Game Gear":       "35",
    "Game Boy":        "9",
    "Super Nintendo":  "10",
    "NES":             "8",
    "Nintendo":        "8",
    "Neo Geo":         "12",
    "Neo Geo CD":      "12",
    "Saturn":          "59",
    "PlayStation":     "187",
    "3DO":             "82",
    "Jaguar":          "28",
    "Lynx":            "46",
    "Turbo Grafx":     "44",
    "Mega CD":         "3",
    "Mega CD 32X":     "3",
    "Mega Drive 32X":  "3",
    "CD-i":            "",
};

// Puntuación mínima para aceptar un resultado de RAWG como válido.
// Si la puntuación es menor, se intenta Wikipedia o se deja vacío.
const MIN_CONFIDENCE = 3;

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

// Normaliza un nombre para comparación: minúsculas, sin puntuación, sin espacios extra
function normName(str) {
    return (str || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Calcula una puntuación de confianza para un resultado RAWG dado el juego buscado.
 *
 * Nombre  (0-4 pts):
 *   +4 = coincidencia exacta normalizada
 *   +3 = uno contiene al otro
 *   +2 = todas las palabras clave (≥4 letras) del objetivo están en el resultado
 *   +1 = más de la mitad de las palabras clave coinciden
 *    0  = ninguna coincidencia
 *
 * Año  (-1 / 0 / +2 pts):
 *   +2 = el año de lanzamiento en RAWG está dentro de ±2 años del año de la revista
 *    0 = RAWG no tiene fecha de lanzamiento
 *   -1 = el año está fuera del margen de ±2 años
 *
 * Portada (+1 pt):
 *   +1 si la URL de la imagen es /games/ (portada real, no screenshot)
 */
function scoreResult(rawgGame, targetName, magazineYear) {
    let score = 0;

    // ── Puntuación de nombre ─────────────────────────────────────
    const a = normName(rawgGame.name);
    const b = normName(targetName);

    if (a === b) {
        score += 4;
    } else if (a.includes(b) || b.includes(a)) {
        score += 3;
    } else {
        const keywords = b.split(" ").filter(w => w.length >= 4);
        if (keywords.length > 0) {
            const matching = keywords.filter(w => a.includes(w)).length;
            if (matching === keywords.length) score += 2;
            else if (matching > keywords.length / 2) score += 1;
        }
    }

    // ── Puntuación de año ────────────────────────────────────────
    // La revista revisó el juego en `magazineYear`; el juego fue lanzado
    // generalmente hasta 2 años antes. Margen amplio para ports y reediciones.
    if (rawgGame.released) {
        const rawgYear = parseInt(rawgGame.released.slice(0, 4), 10);
        const diff = Math.abs(rawgYear - magazineYear);
        if (diff <= 2) score += 2;
        else           score -= 1;
    }

    // ── Bonus portada real ───────────────────────────────────────
    if (rawgGame.background_image?.includes("/games/")) score += 1;

    return score;
}

/**
 * Busca la imagen del juego en RAWG con sistema de confianza.
 * Devuelve { imagen, confianza } donde confianza es la puntuación obtenida.
 * Si no se supera MIN_CONFIDENCE, imagen queda como "".
 */
async function fetchFromRAWG(nombre, consola, anio) {
    const query = encodeURIComponent(nombre);
    const platformId = RAWG_PLATFORMS[consola] || "";
    const magazineYear = parseInt(anio, 10) || 1993;

    let allResults = [];

    // Búsqueda 1: con filtro de plataforma (más precisa)
    if (platformId) {
        const url = `https://api.rawg.io/api/games?search=${query}&platforms=${platformId}&page_size=8&key=${RAWG_KEY}`;
        const res = await httpsGet(url);
        if (res.ok && res.body?.results?.length) {
            allResults = res.body.results;
        }
        await sleep(150);
    }

    // Búsqueda 2: global sin filtro si la primera no dio resultado suficiente
    if (allResults.length === 0) {
        const url = `https://api.rawg.io/api/games?search=${query}&page_size=8&key=${RAWG_KEY}`;
        const res = await httpsGet(url);
        if (res.ok && res.body?.results?.length) {
            allResults = res.body.results;
        }
    }

    if (allResults.length === 0) return { imagen: "", confianza: 0 };

    // Puntuar todos los resultados y quedarse con el mejor
    const scored = allResults
        .filter(g => g.background_image)
        .map(g => ({ game: g, score: scoreResult(g, nombre, magazineYear) }))
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return { imagen: "", confianza: 0 };

    const best = scored[0];
    if (best.score < MIN_CONFIDENCE) {
        return { imagen: "", confianza: best.score };
    }

    return { imagen: best.game.background_image, confianza: best.score };
}

async function fetchFromWikipedia(nombre) {
    // Prueba con el nombre exacto y con variantes comunes
    const variantes = [
        nombre,
        `${nombre} (video game)`,
        `${nombre} (videogame)`,
    ];
    for (const variante of variantes) {
        const query = encodeURIComponent(variante.replace(/\s+/g, "_"));
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;
        const res = await httpsGet(url);
        if (res.ok && res.body?.thumbnail?.source) return res.body.thumbnail.source;
        await sleep(100);
    }
    return "";
}

async function main() {
    const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));
    const total = datos.length;
    let rawgHits = 0;
    let wikiHits = 0;
    let noImage = 0;
    let skipped = 0;

    console.log(`\n🎮 Enriqueciendo ${total} juegos con imágenes...\n`);

    for (let i = 0; i < datos.length; i++) {
        const juego = datos[i];
        const nombre  = juego["Juego"];
        const consola = juego["Consola"];
        const anio    = juego["Año"];

        // Saltar si ya tiene una portada confirmada (/games/)
        // Las URLs /screenshots/ se reprocesarán para buscar portada real
        if (juego.imagen && juego.imagen.includes("/games/")) {
            process.stdout.write(`[${i + 1}/${total}] ✅ Portada OK: ${nombre}\n`);
            skipped++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${total}] 🔍 ${nombre} (${consola}, ${anio})... `);

        // Fuente 1: RAWG con sistema de confianza
        const { imagen, confianza } = await fetchFromRAWG(nombre, consola, anio);

        if (imagen) {
            juego.imagen      = imagen;
            juego.imagen_wiki = "";
            rawgHits++;
            process.stdout.write(`✅ RAWG (confianza: ${confianza})\n`);
        } else {
            // Fuente 2: Wikipedia como fallback
            if (confianza > 0) {
                process.stdout.write(`⚠️  RAWG confianza baja (${confianza}) → Wikipedia... `);
            }
            await sleep(100);
            const imagenWiki = await fetchFromWikipedia(nombre);
            if (imagenWiki) {
                juego.imagen      = "";
                juego.imagen_wiki = imagenWiki;
                wikiHits++;
                process.stdout.write(`📖 Wikipedia\n`);
            } else {
                juego.imagen      = "";
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
    console.log(`   Portada ya OK (saltadas): ${skipped}`);
    console.log(`   RAWG (nuevas portadas):   ${rawgHits}`);
    console.log(`   Wikipedia:                ${wikiHits}`);
    console.log(`   Sin imagen:               ${noImage}`);
    console.log(`   Total procesados:         ${total}\n`);
}

main().catch((err) => {
    console.error("Error fatal:", err);
    process.exit(1);
});

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

// IDs de plataforma en RAWG.io
// https://api.rawg.io/api/platforms?key=...
const RAWG_PLATFORMS = {
    "Mega Drive":      "3",
    "Master System":   "167",
    "Game Gear":       "35",
    "Game Boy":        "9",
    "Super Nintendo":  "10",
    "NES":             "8",
    "Nintendo":        "8",
    "Neo Geo":         "12",
    "Neo Geo CD":      "12",
    "Saturn":          "59",
    "PlayStation":     "187",
    "3DO":             "82",
    "Jaguar":          "28",
    "Lynx":            "46",
    "Turbo Grafx":     "44",
    "Mega CD":         "3",
    "Mega CD 32X":     "3",
    "Mega Drive 32X":  "3",
    "CD-i":            "",
};

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

// Comprueba si el nombre del juego en RAWG coincide razonablemente con el buscado
function isNameMatch(rawgName, targetName) {
    const norm = str => str.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const a = norm(rawgName);
    const b = norm(targetName);
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    // Coincidencia de palabras clave (mínimo 4 letras)
    const words = b.split(" ").filter(w => w.length >= 4);
    return words.length > 0 && words.every(w => a.includes(w));
}

// Devuelve la mejor imagen de un array de resultados RAWG priorizando /games/ sobre /screenshots/
function bestImage(results, nombreBuscado) {
    // 1. Coincidencia exacta de nombre con URL de portada
    for (const g of results)
        if (g.background_image?.includes("/games/") && isNameMatch(g.name, nombreBuscado))
            return g.background_image;
    // 2. Coincidencia exacta de nombre con cualquier URL
    for (const g of results)
        if (g.background_image && isNameMatch(g.name, nombreBuscado))
            return g.background_image;
    // 3. Primera URL de portada sin validar nombre
    for (const g of results)
        if (g.background_image?.includes("/games/"))
            return g.background_image;
    // 4. Cualquier imagen disponible
    for (const g of results)
        if (g.background_image) return g.background_image;
    return "";
}

async function fetchFromRAWG(nombre, consola) {
    const query = encodeURIComponent(nombre);
    const platformId = RAWG_PLATFORMS[consola] || "";

    // Intento 1: buscar con filtro de plataforma
    if (platformId) {
        const url = `https://api.rawg.io/api/games?search=${query}&platforms=${platformId}&page_size=5&key=${RAWG_KEY}`;
        const res = await httpsGet(url);
        if (res.ok && res.body?.results?.length) {
            const img = bestImage(res.body.results, nombre);
            if (img) return img;
        }
        await sleep(150);
    }

    // Intento 2: búsqueda global sin filtro de plataforma (con validación de nombre)
    const urlGlobal = `https://api.rawg.io/api/games?search=${query}&page_size=5&key=${RAWG_KEY}`;
    const resGlobal = await httpsGet(urlGlobal);
    if (!resGlobal.ok || !resGlobal.body?.results?.length) return "";
    return bestImage(resGlobal.body.results, nombre);
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

        // Saltar solo si ya tiene una portada correcta (/games/)
        // Las URLs /screenshots/ se reprocesarán para buscar una portada mejor
        if (juego.imagen && juego.imagen.includes("/games/")) {
            process.stdout.write(`[${i + 1}/${total}] ✅ Ya tiene portada: ${nombre}\n`);
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
