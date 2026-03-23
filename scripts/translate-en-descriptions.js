/**
 * translate-en-descriptions.js
 * Segunda pasada: traduce al español las descripciones que quedaron en inglés.
 *
 * Usa la API no oficial de Google Translate (sin clave, amplio límite).
 * Uso: node scripts/translate-en-descriptions.js
 */

const fs    = require("fs");
const path  = require("path");
const https = require("https");

const DATOS_PATH = path.join(__dirname, "..", "datos.json");
const AUDIT_PATH = path.join(__dirname, "descriptions-audit.json");

const DELAY_MS  = 400;  // entre peticiones de traducción
const SAVE_EVERY = 20;
const MAX_CHARS  = 300;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
    return new Promise(resolve => {
        const options = {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json,*/*",
            },
            timeout: 12000,
        };
        const req = https.get(url, options, res => {
            let data = "";
            res.on("data",  chunk => (data += chunk));
            res.on("end",   () => {
                try {
                    resolve({ ok: res.statusCode < 400, status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ ok: false, status: res.statusCode, body: null, raw: data });
                }
            });
        });
        req.on("error",   () => resolve({ ok: false, body: null }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, body: null }); });
    });
}

function limpiar(texto) {
    if (!texto) return "";
    return texto.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function truncar(texto, max = MAX_CHARS) {
    if (!texto) return "";
    const limpio = limpiar(texto);
    if (limpio.length <= max) return limpio;
    const corteP = limpio.lastIndexOf(".", max);
    const corteE = limpio.lastIndexOf(" ", max);
    const corte  = corteP > max * 0.7 ? corteP + 1 : (corteE > 0 ? corteE : max);
    return limpio.slice(0, corte).trim() + "…";
}

// Google Translate API no oficial
async function traducirGoogle(texto) {
    const input = truncar(texto, 500);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(input)}`;
    const res = await httpsGet(url);
    if (!res.ok || !res.body) return null;
    try {
        // La respuesta es un array anidado: [[["texto traducido","original"...],...],...]
        const partes = res.body[0];
        if (!Array.isArray(partes)) return null;
        const traducido = partes.map(p => p[0]).filter(Boolean).join("");
        return traducido.trim() || null;
    } catch {
        return null;
    }
}

// Detecta si el texto parece estar en inglés
function esIngles(texto) {
    if (!texto) return false;
    const lower = texto.toLowerCase();
    const senialesEN = [
        " is a ", " is an ", " was ", " were ", " had ", " has ",
        "developed by", "published by", "a video game", "video game",
        "released", "the game", "platform game", "fighting game",
        "action game", "the player", "players can",
    ];
    return senialesEN.some(s => lower.includes(s));
}

async function main() {
    const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));

    // Construir lista de índices con descripciones en inglés
    const aTraducir = [];
    for (let i = 0; i < datos.length; i++) {
        const d = datos[i].descripcion || "";
        if (d && esIngles(d)) {
            aTraducir.push(i);
        }
    }

    console.log(`\n🔵 Entradas con descripción en inglés: ${aTraducir.length}`);
    console.log("🌐 Iniciando traducciones con Google Translate...\n");

    let ok = 0, error = 0, omitidos = 0;

    for (let n = 0; n < aTraducir.length; n++) {
        const idx = aTraducir[n];
        const juego = datos[idx];
        const nombre = juego["Juego"] || "";
        const consola = juego["Consola"] || "";
        const descOriginal = juego.descripcion;

        process.stdout.write(`[${n + 1}/${aTraducir.length}] ${nombre} (${consola})... `);

        await sleep(DELAY_MS);

        const traducido = await traducirGoogle(descOriginal);

        if (traducido && traducido.length > 20 && !esIngles(traducido)) {
            datos[idx].descripcion = truncar(traducido);
            console.log(`✅ → "${datos[idx].descripcion.substring(0, 60)}…"`);
            ok++;
        } else if (traducido && traducido === descOriginal) {
            console.log(`⏭  Sin cambio (misma cadena)`);
            omitidos++;
        } else {
            console.log(`❌ Sin resultado`);
            error++;
        }

        // Guardar parcial
        if ((n + 1) % SAVE_EVERY === 0) {
            fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 2));
            console.log(`\n💾 Guardado parcial (${n + 1}/${aTraducir.length})\n`);
        }
    }

    // Guardado final
    fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 2));

    console.log(`\n✅ ¡Completado!`);
    console.log(`   Traducidos:    ${ok}`);
    console.log(`   Sin resultado: ${error}`);
    console.log(`   Omitidos:      ${omitidos}`);
    console.log(`   Total:         ${aTraducir.length}`);
}

main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
});
