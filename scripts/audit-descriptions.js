/**
 * audit-descriptions.js
 * Clasifica descripciones de datos.json como:
 *   EMPTY     — sin descripción
 *   EN        — texto detectado en inglés
 *   INCORRECT — descripción que no habla del juego
 *   OK        — descripción válida en español
 *
 * Genera scripts/descriptions-audit.json con los juegos a corregir.
 * Uso: node scripts/audit-descriptions.js
 */

const fs   = require("fs");
const path = require("path");

const DATOS_PATH = path.join(__dirname, "..", "datos.json");
const AUDIT_PATH = path.join(__dirname, "descriptions-audit.json");

// ── Señales de texto en inglés ───────────────────────────────
const EN_SIGNALS = [
    " is a ", " is an ", " was a ", " was an ",
    "developed by", "published by", "video game",
    "released in", "first released", "side-scrolling",
    "horizontally scrolling", "vertically scrolling",
    "beat 'em up", "role-playing", "first-person",
    "third-person", "shoot 'em up", "hack and slash",
    "real-time strategy", "turn-based", "game boy",
    "the player", "the game", "players control",
    "players must", "in the game", "gameplay",
];

// ── Señales de texto en español ──────────────────────────────
const ES_SIGNALS = [
    "es un", "es una", "fue un", "fue una",
    "desarrollado por", "publicado por", "videojuego",
    "video juego", "lanzado en", "jugador",
    "juego de", "juego de acción", "juego de plataformas",
    "juego de rol", "juego de lucha", "juego de carreras",
    "juego de deportes", "juego de disparos",
    "plataformas", "acción", "aventura", "consola",
    "pantallas", "niveles", "personaje principal",
    "el jugador", "los jugadores", "el juego permite",
];

// ── Señales de descripción incorrecta (habla de otra cosa) ───
// Si el texto contiene estas frases Y NO menciona el nombre del juego
// probablemente sea incorrecto
const INCORRECT_SIGNALS = [
    // Películas / series
    "película de", "la película", "film de", "director de cine",
    "dirigida por", "dirigido por", "estreno en",
    "recaudó", "nominada al oscar", "nominado al oscar",
    "taquilla", "actores", "protagonizada",
    // Ciudades / geografía
    "ciudad más poblada", "municipio de", "en la provincia",
    "comunidad autónoma", "es la capital", "río que atraviesa",
    "km²", "habitantes", "densidad de población",
    "latitud", "longitud", "cordillera",
    // Personajes / obras culturales
    "creado por stan lee", "personaje de ficción",
    "personaje ficticio", "cómic de marvel", "cómic de dc",
    "historieta", "el deporte del", "artista musical",
    "banda de rock", "banda de música",
    "álbum de", "discografía",
    // En inglés, señales similares
    "is a city", "is a town", "is a municipality",
    "is a film", "is a movie", "directed by",
    "box office", "starred", "the novel",
    "is a fictional", "is a comic", "is a character",
];

function detectarIdioma(texto) {
    if (!texto || texto.trim().length < 10) return "EMPTY";
    const lower = texto.toLowerCase();

    // Contar señales EN vs ES
    const enScore = EN_SIGNALS.filter(s => lower.includes(s)).length;
    const esScore = ES_SIGNALS.filter(s => lower.includes(s)).length;

    if (esScore >= 2) return "OK";
    if (enScore >= 2) return "EN";
    if (esScore === 1) return "OK";
    if (enScore === 1) return "EN";

    // Si no hay señales claras: asumir OK (desc corta, nombres propios, etc.)
    return "OK";
}

// Señales fuertes que indican claramente que SÍ habla de un videojuego
const GAME_POSITIVE_SIGNALS = [
    "videojuego", "video juego", "juego de", "es un juego",
    "jugador", "el jugador", "los jugadores",
    "plataformas", "acción", "lucha", "aventura", "disparos",
    "desarrollado por", "publicado por",
    "video game", "developed by", "published by",
    "platform game", "action game", "the player",
];

function esIncorrecto(juego, texto) {
    if (!texto || texto.trim().length < 10) return false;
    const lower = texto.toLowerCase();

    // Si contiene señales de descripción incorrecta
    const tieneSenal = INCORRECT_SIGNALS.some(s => lower.includes(s));
    if (!tieneSenal) return false;

    // Si el texto tiene señales fuertes de que SÍ es un videojuego → no es incorrecto
    const esJuego = GAME_POSITIVE_SIGNALS.some(s => lower.includes(s));
    if (esJuego) return false;

    // Verificar si el texto menciona variantes del nombre del juego
    const nombre = (juego["Juego"] || "").toLowerCase();
    const palabrasNombre = nombre.split(/[\s:\-.,]+/).filter(p => p.length > 3);

    // Si al menos 1 palabra significativa del nombre aparece en la descripción → puede ser correcto
    const menciona = palabrasNombre.some(p => lower.includes(p));
    if (menciona) return false;

    return true;
}

function clasificar(juego) {
    const texto = juego.descripcion || "";

    if (!texto || texto.trim().length < 10) return "EMPTY";
    if (esIncorrecto(juego, texto)) return "INCORRECT";

    const idioma = detectarIdioma(texto);
    return idioma;
}

// ── Main ─────────────────────────────────────────────────────
const datos = JSON.parse(fs.readFileSync(DATOS_PATH, "utf8"));

const conteo = { OK: 0, EMPTY: 0, EN: 0, INCORRECT: 0 };
const aCorregir = [];

datos.forEach((juego, idx) => {
    const cat = clasificar(juego);
    conteo[cat]++;
    juego._auditIdx   = idx;
    juego._auditCat   = cat;
    if (cat !== "OK") {
        aCorregir.push({
            idx,
            juego:    juego["Juego"],
            consola:  juego["Consola"],
            marca:    juego["Marca consola"],
            anio:     juego["Año"],
            cat,
            descActual: (juego.descripcion || "").slice(0, 100),
        });
    }
});

fs.writeFileSync(AUDIT_PATH, JSON.stringify(aCorregir, null, 2), "utf8");

console.log("\n📊 AUDITORÍA DE DESCRIPCIONES");
console.log("═══════════════════════════════");
console.log(`  Total juegos:     ${datos.length}`);
console.log(`  ✅ OK (español):  ${conteo.OK}`);
console.log(`  🔴 Vacías:        ${conteo.EMPTY}`);
console.log(`  🔵 En inglés:     ${conteo.EN}`);
console.log(`  ⚠️  Incorrectas:  ${conteo.INCORRECT}`);
console.log(`  📋 A corregir:    ${aCorregir.length}`);
console.log(`\n  Guardado en: scripts/descriptions-audit.json\n`);
