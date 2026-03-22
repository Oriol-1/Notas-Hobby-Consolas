/**
 * fix-duplicates.js  — Fase 1
 * Detecta URLs de `imagen` que están asignadas a múltiples juegos CON DISTINTOS nombres.
 * Eso indica que RAWG asignó una portada genérica incorrecta a varios juegos.
 *
 * Lógica:
 *   - Si varios juegos comparten URL pero tienen el MISMO nombre → legítimo (mismo juego, distintas consolas)
 *   - Si varios juegos comparten URL y tienen NOMBRES DISTINTOS    → error: se borran todas esas imágenes
 *
 * Uso: node fix-duplicates.js
 */

const fs   = require("fs");
const path = require("path");

const DATOS_PATH = path.join(__dirname, "..", "datos.json");

function normName(str) {
    return (str || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));

// ── Agrupar por URL del campo `imagen` (ignorar vacíos) ──────────────────────
const byUrl = new Map();
for (const juego of datos) {
    const url = juego.imagen;
    if (!url || url === "") continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(juego);
}

let grupoProblemCount = 0;
let cleanedCount      = 0;
let legitimateCount   = 0;

console.log("\n🔍 Analizando URLs de imagen duplicadas...\n");

for (const [url, grupo] of byUrl.entries()) {
    if (grupo.length < 2) continue;  // URL única → OK

    // Obtener nombres normalizados únicos del grupo
    const nombresNorm = new Set(grupo.map(j => normName(j["Juego"])));

    if (nombresNorm.size === 1) {
        // Todos tienen el mismo nombre de juego (distintas consolas / ediciones) → legítimo
        legitimateCount++;
        const consolasStr = grupo.map(j => j["Consola"]).join(", ");
        console.log(`✅ Legítimo — "${grupo[0]["Juego"]}" en [${consolasStr}]`);
        continue;
    }

    // Nombres distintos → imagen incorrecta para todos
    grupoProblemCount++;
    const urlCorta = url.split("/").pop();
    console.log(`\n🔴 DUPLICADO INCORRECTO — ${urlCorta}`);
    for (const j of grupo) {
        console.log(`   ❌  ${j["Juego"].padEnd(50)} | ${j["Consola"].padEnd(20)} | ${j["Año"]}`);
        j.imagen      = "";
        j.imagen_wiki = "";
        cleanedCount++;
    }
}

// ── Guardar ──────────────────────────────────────────────────────────────────
fs.writeFileSync(DATOS_PATH, JSON.stringify(datos, null, 4), "utf8");

// ── Estadísticas finales ──────────────────────────────────────────────────────
const ok   = datos.filter(j => j.imagen && j.imagen.includes("/games/")).length;
const sc   = datos.filter(j => j.imagen && j.imagen.includes("/screenshots/")).length;
const wiki = datos.filter(j => j.imagen === "" && j.imagen_wiki !== "").length;
const nada = datos.filter(j => j.imagen === "" && j.imagen_wiki === "").length;

console.log(`\n${"─".repeat(60)}`);
console.log(`✨ Limpieza completada:`);
console.log(`   Grupos legítimos saltados:   ${legitimateCount}`);
console.log(`   Grupos con error detectados:  ${grupoProblemCount}`);
console.log(`   Juegos con imagen borrada:    ${cleanedCount}`);
console.log(`\n📊 Estado de datos.json:`);
console.log(`   Portadas /games/:             ${ok}`);
console.log(`   Screenshots fallback:         ${sc}`);
console.log(`   Solo Wikipedia (imagen_wiki): ${wiki}`);
console.log(`   Sin imagen (pendientes):      ${nada}`);
console.log(`   Total juegos:                 ${datos.length}`);
console.log(`${"─".repeat(60)}\n`);
