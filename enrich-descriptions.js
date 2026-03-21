/**
 * enrich-descriptions.js
 * Script one-time para añadir descripciones a datos.json
 * Fuente 1: Wikipedia en español (sin API key)
 * Fuente 2: Wikipedia en inglés (fallback, sin API key)
 * Uso: node enrich-descriptions.js
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

const DATOS_PATH = path.join(__dirname, "datos.json");
const DELAY_MS   = 300;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
    return new Promise(resolve => {
        const options = {
            headers: {
                "User-Agent": "notashobby-enricher/1.0",
                "Accept":     "application/json",
            },
        };
        https.get(url, options, res => {
            let data = "";
            res.on("data",  chunk => (data += chunk));
            res.on("end",   () => {
                try {
                    resolve({ ok: res.statusCode < 400, body: JSON.parse(data) });
                } catch {
                    resolve({ ok: false, body: null });
                }
            });
        }).on("error", () => resolve({ ok: false, body: null }));
    });
}

/**
 * Limpia el texto de Wikipedia:
 * - Elimina referencias bibliográficas tipo (autor, año)
 * - Trunca a maxChars si es demasiado largo
 */
function limpiarExtract(texto, maxChars = 400) {
    if (!texto) return "";
    let limpio = texto
        .replace(/\s*\([^)]{0,60}\)/g, "")   // elimina paréntesis cortos (refs, años)
        .replace(/\s{2,}/g, " ")
        .trim();
    if (limpio.length > maxChars) {
        const corte = limpio.lastIndexOf(" ", maxChars);
        limpio = limpio.slice(0, corte > 0 ? corte : maxChars) + "…";
    }
    return limpio;
}

async function fetchWikipedia(nombre, lang) {
    // Intenta primero con el nombre directo; si falla prueba con sufijo "(videojuego)"
    const intentos = [
        nombre,
        `${nombre} (videojuego)`,
        `${nombre} (video game)`,
    ];
    for (const intento of intentos) {
        const query = encodeURIComponent(intento.replace(/\s+/g, "_"));
        const url   = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${query}`;
        const res   = await httpsGet(url);
        if (res.ok && res.body?.extract && res.body.type !== "disambiguation") {
            return limpiarExtract(res.body.extract);
        }
        await sleep(80);
    }
    return "";
}

async function main() {
    const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));
    const total = datos.length;
    let esHits   = 0;
    let enHits   = 0;
    let sinDesc  = 0;
    let skipped  = 0;

    console.log(`\n📖 Añadiendo descripciones a ${total} juegos...\n`);

    for (let i = 0; i < datos.length; i++) {
        const juego  = datos[i];
        const nombre = juego["Juego"];

        // Skip si ya tiene descripción con texto real
        if (juego.descripcion && juego.descripcion.trim().length > 10) {
            process.stdout.write(`[${i + 1}/${total}] ⏭  Ya tiene descripción: ${nombre}\n`);
            skipped++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${total}] 🔍 ${nombre}... `);

        // Fuente 1: Wikipedia ES
        let desc = await fetchWikipedia(nombre, "es");
        if (desc) {
            juego.descripcion = desc;
            esHits++;
            process.stdout.write(`✅ Wikipedia ES\n`);
        } else {
            await sleep(80);
            // Fuente 2: Wikipedia EN
            desc = await fetchWikipedia(nombre, "en");
            if (desc) {
                juego.descripcion = desc;
                enHits++;
                process.stdout.write(`📘 Wikipedia EN\n`);
            } else {
                juego.descripcion = "";
                sinDesc++;
                process.stdout.write(`⚠️  Sin descripción\n`);
            }
        }

        // Guardado progresivo cada 20 juegos
        if ((i + 1) % 20 === 0) {
            fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");
            console.log(`\n💾 Guardado parcial (${i + 1}/${total})\n`);
        }

        await sleep(DELAY_MS);
    }

    // Guardado final
    fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");

    console.log(`\n✨ ¡Completado!`);
    console.log(`   Wikipedia ES:   ${esHits} descripciones`);
    console.log(`   Wikipedia EN:   ${enHits} descripciones`);
    console.log(`   Sin descripción: ${sinDesc} juegos`);
    console.log(`   Ya tenían desc:  ${skipped} juegos`);
    console.log(`   Total:           ${total} juegos procesados\n`);
}

main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
});
