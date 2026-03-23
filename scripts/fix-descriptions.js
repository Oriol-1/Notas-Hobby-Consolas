/**
 * fix-descriptions.js
 * Corrige descripciones vacías, en inglés o incorrectas en datos.json.
 *
 * Estrategia en cascada por juego:
 *   1. Wikipedia ES → nombre directo
 *   2. Wikipedia ES → nombre + "(videojuego)"
 *   3. Wikipedia ES → nombre + "(video game)" traducido
 *   4. Wikipedia EN → mismas variantes
 *   5. Si resultado EN → traducir con MyMemory API (gratuita)
 *   6. Truncar a MAX_CHARS
 *
 * Uso: node scripts/fix-descriptions.js
 * Requiere haber ejecutado audit-descriptions.js antes.
 */

const fs    = require("fs");
const path  = require("path");
const https = require("https");

const DATOS_PATH = path.join(__dirname, "..", "datos.json");
const AUDIT_PATH = path.join(__dirname, "descriptions-audit.json");

const DELAY_MS  = 500;   // entre peticiones Wikipedia
const DELAY_TRANS = 800; // entre peticiones MyMemory
const SAVE_EVERY  = 15;
const MAX_CHARS   = 300; // ≈ 4 líneas

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── HTTP GET helper ──────────────────────────────────────────
function httpsGet(url) {
    return new Promise(resolve => {
        const options = {
            headers: {
                "User-Agent": "notashobby-fixdesc/1.0 (https://github.com/Oriol-1/Notas-Hobby-Consolas)",
                "Accept":     "application/json",
            },
            timeout: 10000,
        };
        const req = https.get(url, options, res => {
            let data = "";
            res.on("data",  chunk => (data += chunk));
            res.on("end",   () => {
                try {
                    resolve({ ok: res.statusCode < 400, status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ ok: false, status: res.statusCode, body: null });
                }
            });
        });
        req.on("error",   () => resolve({ ok: false, body: null }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, body: null }); });
    });
}

// ── Limpieza y truncado ──────────────────────────────────────
function limpiar(texto) {
    if (!texto) return "";
    return texto
        .replace(/\n+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function truncar(texto, max = MAX_CHARS) {
    if (!texto) return "";
    const limpio = limpiar(texto);
    if (limpio.length <= max) return limpio;
    // Cortar en último punto o espacio dentro del límite
    const corteP = limpio.lastIndexOf(".", max);
    const corteE = limpio.lastIndexOf(" ", max);
    const corte  = corteP > max * 0.7 ? corteP + 1 : (corteE > 0 ? corteE : max);
    return limpio.slice(0, corte).trim() + "…";
}

// ── Validar que el extract habla del videojuego ──────────────
function esExtractValido(texto, nombreJuego) {
    if (!texto || texto.length < 30) return false;
    const lower  = texto.toLowerCase();
    const nombre = (nombreJuego || "").toLowerCase();

    // El extract de Wikipedia a veces devuelve artículos de desambiguación o cosas random
    // Señales de que SÍ habla de un videojuego
    const senalesJuego = [
        "videojuego", "video juego", "juego de", "juego para",
        "desarrollado", "publicado", "plataformas", "acción",
        "aventura", "es un juego", "es una continuación",
        "video game", "developed by", "published by",
        "is a game", "platform game", "action game",
        "is a 19", "is a 20", // "is a 1992 ..." etc.
    ];
    const hablaDeJuego = senalesJuego.some(s => lower.includes(s));

    // Señales de que NO habla del juego (ciudad, película, persona...)
    const senalesIncorrectas = [
        "ciudad más poblada", "municipio de", "km²", "habitantes",
        "dirigida por", "dirigido por", "actores", "taquilla",
        "creado por stan lee", "personaje de ficción", "personaje ficticio",
        "is a city", "is a town", "is a film", "is a movie",
        "directed by", "box office", "starred",
    ];
    const esIncorrecto = senalesIncorrectas.some(s => lower.includes(s));

    if (esIncorrecto) return false;
    if (hablaDeJuego) return true;

    // Última comprobación: menciona el nombre del juego
    const palabras = nombre.split(/[\s:\-.,]+/).filter(p => p.length > 3);
    return palabras.some(p => lower.includes(p));
}

// ── Wikipedia: fetch por idioma y slug ───────────────────────
async function fetchWikiSummary(slug, lang) {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug.replace(/\s+/g, "_"))}`;
    const res = await httpsGet(url);
    if (!res.ok || !res.body) return null;
    if (res.body.type === "disambiguation") return null;
    const extract = res.body.extract || "";
    return extract.length > 20 ? extract : null;
}

// ── Traducción MyMemory ──────────────────────────────────────
async function traducir(texto) {
    const input  = truncar(texto, 500); // MyMemory tiene límite de ~500 chars por llamada
    const url    = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(input)}&langpair=en|es`;
    const res    = await httpsGet(url);
    if (!res.ok || !res.body) return null;
    const traducido = res.body?.responseData?.translatedText;
    if (!traducido || traducido.toLowerCase().startsWith("please")) return null; // límite superado
    return traducido;
}

// ── Estrategia completa para un juego ────────────────────────
async function obtenerDescripcion(juego) {
    const nombre  = juego["Juego"]    || "";
    const consola = juego["Consola"]  || "";
    const anio    = juego["Año"]      || "";

    // Variantes ES a intentar
    const slugsES = [
        nombre,
        `${nombre} (videojuego)`,
        `${nombre} (${consola})`,
        `${nombre} (${anio})`,
        `${nombre} (video game)`,
    ];

    // Variantes EN a intentar
    const slugsEN = [
        nombre,
        `${nombre} (video game)`,
        `${nombre} (${consola})`,
        `${nombre} (${anio} video game)`,
    ];

    // 1. Intentar Wikipedia ES
    for (const slug of slugsES) {
        if (!slug.trim()) continue;
        const extract = await fetchWikiSummary(slug, "es");
        await sleep(DELAY_MS);
        if (extract && esExtractValido(extract, nombre)) {
            return { texto: truncar(extract), fuente: "ES", slug };
        }
    }

    // 2. Intentar Wikipedia EN → traducir
    for (const slug of slugsEN) {
        if (!slug.trim()) continue;
        const extract = await fetchWikiSummary(slug, "en");
        await sleep(DELAY_MS);
        if (extract && esExtractValido(extract, nombre)) {
            // Traducir
            const traducido = await traducir(extract);
            await sleep(DELAY_TRANS);
            if (traducido) {
                return { texto: truncar(traducido), fuente: "EN→ES", slug };
            }
            // Si falla la traducción, guardar EN sin traducir (mejor que nada)
            return { texto: truncar(extract), fuente: "EN", slug };
        }
    }

    return null;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
    if (!fs.existsSync(AUDIT_PATH)) {
        console.error("❌ No se encontró descriptions-audit.json. Ejecuta primero audit-descriptions.js");
        process.exit(1);
    }

    const datos    = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));
    const auditList = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
    const total    = auditList.length;

    const stats = { ES: 0, "EN→ES": 0, EN: 0, sinResultado: 0, omitidos: 0 };

    console.log(`\n🔧 Corrigiendo ${total} descripciones...\n`);

    for (let i = 0; i < auditList.length; i++) {
        const entry = auditList[i];
        const juego = datos[entry.idx];

        if (!juego) {
            console.log(`[${i + 1}/${total}] ⚠️  Índice ${entry.idx} no válido — omitido`);
            stats.omitidos++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${total}] [${entry.cat}] ${entry.juego} (${entry.consola})... `);

        const resultado = await obtenerDescripcion(juego);

        if (resultado) {
            juego.descripcion = resultado.texto;
            stats[resultado.fuente] = (stats[resultado.fuente] || 0) + 1;
            process.stdout.write(`✅ ${resultado.fuente} → "${resultado.texto.slice(0, 60)}…"\n`);
        } else {
            if (entry.cat === "EMPTY") {
                juego.descripcion = "";
            }
            // INCORRECT o EN sin resultado: dejar vacío mejor que descripción incorrecta
            if (entry.cat === "INCORRECT") {
                juego.descripcion = "";
            }
            stats.sinResultado++;
            process.stdout.write(`⚠️  Sin resultado\n`);
        }

        // Guardado progresivo
        if ((i + 1) % SAVE_EVERY === 0) {
            fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");
            console.log(`\n💾 Guardado parcial (${i + 1}/${total})\n`);
        }
    }

    // Guardado final
    fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");

    console.log(`\n✨ ¡Completado!`);
    console.log(`   Wikipedia ES:        ${stats.ES}`);
    console.log(`   Wikipedia EN→ES:     ${stats["EN→ES"]}`);
    console.log(`   Wikipedia EN (crudo): ${stats.EN}`);
    console.log(`   Sin resultado:        ${stats.sinResultado}`);
    console.log(`   Omitidos:             ${stats.omitidos}`);
    console.log(`   Total procesados:     ${total}\n`);
}

main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
});
