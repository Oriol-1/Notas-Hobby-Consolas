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
    const envPath = path.join(__dirname, "..", ".env");
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

const DATOS_PATH = path.join(__dirname, "..", "datos.json");
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
// 4 = el nombre del juego en RAWG debe contener o ser contenido por el nombre buscado.
// Esto evita falsos positivos donde RAWG devuelve un juego con nombre parecido pero incorrecto.
const MIN_CONFIDENCE = 4;
// Umbral cuando la búsqueda usó filtro de plataforma confirmado
const MIN_CONFIDENCE_WITH_PLATFORM = 3;

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
 * Genera variantes del nombre del juego para maximizar las posibilidades
 * de encontrar el resultado correcto en RAWG.
 */
function getSearchVariants(nombre, consola, marca) {
    const variants = [nombre];

    // Sin artículo "The" al inicio (e.g. "The Ninja" → "Ninja")
    if (/^the\s+/i.test(nombre)) {
        variants.push(nombre.replace(/^the\s+/i, ""));
    }

    // Solo la parte antes de ":" — quitar subtítulo
    if (nombre.includes(":")) {
        variants.push(nombre.split(":")[0].trim());
    }

    // Solo la parte antes de " - " — subtítulo alternativo
    if (nombre.includes(" - ")) {
        variants.push(nombre.split(" - ")[0].trim());
    }

    // Nombre + marca del fabricante (e.g. "Gauntlet Sega") → ayuda a desambiguar
    if (marca && marca.trim()) {
        variants.push(`${nombre} ${marca.trim()}`);
    }

    // Nombre + consola corta (e.g. "R-Type Genesis", "Pacman Game Boy")
    const consolaShort = consola
        .replace("Super Nintendo", "SNES")
        .replace("Master System", "")
        .replace("Mega Drive", "Genesis")
        .replace("Game Boy", "Game Boy")
        .trim();
    if (consolaShort && consolaShort !== nombre) {
        variants.push(`${nombre} ${consolaShort}`.trim());
    }

    return [...new Set(variants)]; // eliminar duplicados
}

/**
 * Busca la imagen del juego en RAWG con sistema de confianza y múltiples variantes.
 * Devuelve { imagen, confianza, fallback } donde confianza es la puntuación obtenida.
 * Si no se supera el umbral mínimo, imagen queda como "" y fallback tiene el candidato.
 */
async function fetchFromRAWG(nombre, consola, anio, marca) {
    const platformId = RAWG_PLATFORMS[consola] || "";
    const magazineYear = parseInt(anio, 10) || 1993;
    const variants = getSearchVariants(nombre, consola, marca);

    let bestScored = null;
    let usedPlatformFilter = false;

    for (const variant of variants) {
        const query = encodeURIComponent(variant);
        let results = [];
        let withPlatform = false;

        // Búsqueda con filtro de plataforma (más precisa)
        if (platformId) {
            const url = `https://api.rawg.io/api/games?search=${query}&platforms=${platformId}&page_size=10&key=${RAWG_KEY}`;
            const res = await httpsGet(url);
            if (res.ok && res.body?.results?.length) {
                results = res.body.results;
                withPlatform = true;
            }
            await sleep(150);
        }

        // Búsqueda global sin filtro si la anterior no dio resultado
        if (results.length === 0) {
            const url = `https://api.rawg.io/api/games?search=${query}&page_size=10&key=${RAWG_KEY}`;
            const res = await httpsGet(url);
            if (res.ok && res.body?.results?.length) {
                results = res.body.results;
            }
            await sleep(100);
        }

        if (results.length === 0) continue;

        const scored = results
            .filter(g => g.background_image)
            .map(g => ({ game: g, score: scoreResult(g, nombre, magazineYear) }))
            .sort((a, b) => b.score - a.score);

        if (scored.length === 0) continue;

        const candidate = scored[0];
        if (!bestScored || candidate.score > bestScored.score) {
            bestScored = candidate;
            usedPlatformFilter = withPlatform;
        }

        // Si ya tenemos confianza suficiente, no seguimos probando variantes
        if (bestScored.score >= MIN_CONFIDENCE) break;

        await sleep(100);
    }

    if (!bestScored) return { imagen: "", confianza: 0, fallback: "" };

    // Umbral dinámico: si buscamos con filtro de plataforma confirmado,
    // aceptamos confianza 2 (nombre coincide razonablemente + plataforma correcta)
    const threshold = usedPlatformFilter ? MIN_CONFIDENCE_WITH_PLATFORM : MIN_CONFIDENCE;

    if (bestScored.score < threshold) {
        return { imagen: "", confianza: bestScored.score, fallback: bestScored.game.background_image };
    }

    return { imagen: bestScored.game.background_image, confianza: bestScored.score, fallback: "" };
}

// Nombres de plataforma para variantes de Wikipedia
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

async function fetchFromWikipedia(nombre, consola, anio) {
    const platformVariant = WIKI_PLATFORM_NAMES[consola] || "";
    const year = parseInt(anio, 10) || null;

    // Nombre sin "The" al inicio
    const sinThe = /^the\s+/i.test(nombre) ? nombre.replace(/^the\s+/i, "") : null;
    // Solo parte antes de ":" o " - "
    const sinSubtitulo = nombre.includes(":") ? nombre.split(":")[0].trim()
                       : nombre.includes(" - ") ? nombre.split(" - ")[0].trim()
                       : null;

    // Construir lista de variantes ordenadas de más a menos específicas
    const variantes = [];

    const bases = [nombre];
    if (sinThe) bases.push(sinThe);
    if (sinSubtitulo && sinSubtitulo !== nombre) bases.push(sinSubtitulo);

    for (const base of bases) {
        // 1. Nombre + plataforma específica (más preciso)
        if (platformVariant) variantes.push(`${base} (${platformVariant})`);
        // 2. Nombre + año
        if (year) variantes.push(`${base} (${year} video game)`);
        // 3. Nombre exacto
        variantes.push(base);
        // 4. Genéricos
        variantes.push(`${base} (video game)`);
        variantes.push(`${base} (videogame)`);
        // 5. Variantes de época arcade (muchos eran ports)
        variantes.push(`${base} (arcade game)`);
        if (year) variantes.push(`${base} (${year} arcade game)`);
    }

    // Eliminar duplicados manteniendo orden
    const vistas = new Set();
    const unicas = variantes.filter(v => { if (vistas.has(v)) return false; vistas.add(v); return true; });

    for (const variante of unicas) {
        const query = encodeURIComponent(variante.replace(/\s+/g, "_"));
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;
        const res = await httpsGet(url);
        if (res.ok && res.body?.thumbnail?.source) return res.body.thumbnail.source;
        await sleep(80);
    }
    return "";
}

async function main() {
    const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));
    const total = datos.length;
    let rawgHits = 0;
    let wikiHits = 0;
    let screenshotHits = 0;
    let noImage = 0;
    let skipped = 0;

    console.log(`\n🎮 Enriqueciendo ${total} juegos con imágenes...\n`);

    for (let i = 0; i < datos.length; i++) {
        const juego = datos[i];
        const nombre  = juego["Juego"];
        const consola = juego["Consola"];
        const anio    = juego["Año"];
        const marca   = juego["Marca consola"] || "";

        // Saltar si ya tiene una portada real (/games/) — confiar en la asignación previa
        if (juego.imagen && juego.imagen.includes("/games/")) {
            process.stdout.write(`[${i + 1}/${total}] ✅ Portada OK: ${nombre}\n`);
            skipped++;
            continue;
        }

        // Proteger correcciones manuales: imagen vacía + imagen_wiki ya establecida
        // Estas fueron corregidas a mano y no deben tocarse
        if (juego.imagen === "" && juego.imagen_wiki && juego.imagen_wiki !== "") {
            process.stdout.write(`[${i + 1}/${total}] 🔒 Protegida (manual): ${nombre}\n`);
            skipped++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${total}] 🔍 ${nombre} (${consola}, ${anio})... `);

        // ── Fuente 1: Wikipedia (primero — más fiable para juegos retro clásicos) ─────
        const imagenWiki = await fetchFromWikipedia(nombre, consola, anio);
        if (imagenWiki) {
            juego.imagen      = "";
            juego.imagen_wiki = imagenWiki;
            wikiHits++;
            process.stdout.write(`📖 Wikipedia\n`);
            await sleep(DELAY_MS);
            continue;
        }

        // ── Fuente 2: RAWG con umbral estricto (≥4 = nombre debe coincidir claramente) ─
        const { imagen, confianza, fallback } = await fetchFromRAWG(nombre, consola, anio, marca);

        if (imagen) {
            juego.imagen = imagen;
            // No tocar imagen_wiki — puede tener una imagen de Wikipedia ya encontrada
            rawgHits++;
            process.stdout.write(`✅ RAWG (confianza: ${confianza})\n`);
        } else if (fallback && confianza >= 3) {
            // Fuente 3: captura de RAWG — solo si la coincidencia de nombre es razonable
            juego.imagen = fallback;
            // No tocar imagen_wiki — puede tener una imagen de Wikipedia ya encontrada
            screenshotHits++;
            process.stdout.write(`🖼️  Captura RAWG fallback (confianza: ${confianza})\n`);
        } else {
            // Limpiar screenshot antigua si ya no encontramos nada mejor
            if (juego.imagen && juego.imagen.includes("/screenshots/")) {
                juego.imagen = "";
            }
            // No tocar imagen_wiki — puede tener una imagen de Wikipedia ya encontrada
            noImage++;
            process.stdout.write(`⚠️  Sin imagen (RAWG confianza: ${confianza})\n`);
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
    console.log(`   RAWG (portadas /games/):   ${rawgHits}`);
    console.log(`   Wikipedia:                 ${wikiHits}`);
    console.log(`   Capturas fallback RAWG:    ${screenshotHits}`);
    console.log(`   Sin imagen:                ${noImage}`);
    console.log(`   Total procesados:          ${total}\n`);
}

main().catch((err) => {
    console.error("Error fatal:", err);
    process.exit(1);
});
