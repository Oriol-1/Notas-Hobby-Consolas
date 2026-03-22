# Notas Hobby Consolas 1991–1996

Aplicación web estática para consultar las notas y análisis de videojuegos publicados en la revista **Hobby Consolas** entre 1991 y 1996. Más de **1 400 juegos** con portada, descripción, puntuación e **inicio directo al gameplay en YouTube**.

---

## ¿Qué contiene?

- **1 492 juegos** extraídos de la revista Hobby Consolas (1991–1996)
- Portadas de cada juego obtenidas automáticamente desde **Wikipedia** y **RAWG.io**
- Descripción de cada juego desde **Wikipedia en español / inglés**
- Filtros por consola, marca, año y puntuación
- Modal con todos los detalles del análisis original de la revista
- **Botón "Ver gameplay"** que abre directamente YouTube con una búsqueda `nombre + consola + gameplay`

---

## Índice

1. [Ejecutar en local](#1-ejecutar-en-local)
2. [Cómo encuentra las imágenes de portada](#2-cómo-encuentra-las-imágenes-de-portada)
3. [Gestión de imágenes (CLI)](#3-gestión-de-imágenes-cli)
4. [Cómo redirige al video de gameplay](#4-cómo-redirige-al-video-de-gameplay)
5. [Estructura de archivos](#5-estructura-de-archivos)
6. [Scripts de enriquecimiento](#6-scripts-de-enriquecimiento)
7. [Estructura de datos.json](#7-estructura-de-datosjson)
8. [Variables de entorno (.env)](#8-variables-de-entorno-env)
9. [Subir cambios al repositorio](#9-subir-cambios-al-repositorio)
10. [Despliegue en Vercel](#10-despliegue-en-vercel)

---

## 1. Ejecutar en local

El proyecto es HTML/CSS/JS puro — no necesita compilación.

> **¿Por qué no funciona con doble clic?** La app carga `datos.json` con `fetch()`. Los navegadores bloquean esa petición cuando se abre como `file://`. Necesitas un servidor HTTP local.

**Requisitos previos:**

| Herramienta | Versión mínima |
| --- | --- |
| [Node.js](https://nodejs.org) | 18 LTS o superior |
| Git | Cualquier versión reciente |

**Pasos:**

```powershell
# 1. Clona el repositorio
git clone https://github.com/Oriol-1/Notas-Hobby-Consolas.git
cd Notas-Hobby-Consolas

# 2. Lanza el servidor local
npm start
```

La primera vez npm descargará `serve` automáticamente. Verás:

```text
   ┌──────────────────────────────────────────┐
   │   Serving!                               │
   │   - Local:    http://localhost:3000      │
   └──────────────────────────────────────────┘
```

Abre **<http://localhost:3000>** en el navegador. Para detener: `Ctrl + C`.

> **¿Por qué `npm start` y no `npx serve .` directamente?**
> El `package.json` fija el puerto al 3000. Así siempre sabes dónde está la app y no se abren instancias en puertos aleatorios si lanzas el comando varias veces.
> Si al ejecutar `npm start` te aparece *"port already in use"*, es que ya hay una instancia corriendo — abre el navegador directamente en <http://localhost:3000>.

---

## 2. Cómo encuentra las imágenes de portada

Cada juego en `datos.json` tiene tres campos de imagen:

| Campo | Fuente | Prioridad |
| --- | --- | --- |
| `imagen` | [RAWG.io](https://rawg.io) — portada oficial del juego | 1ª (si existe) |
| `imagen_wiki` | [Wikipedia](https://en.wikipedia.org) — thumbnail del artículo | 2ª (fallback) |
| `imagen_local` | Copia local en `images/` — descargada con `download-images.js` | 3ª (fallback offline) |

La app muestra la imagen siguiendo este orden:

1. Si `imagen` tiene URL → usa esa portada (RAWG)
2. Si no, si `imagen_wiki` tiene URL → usa la imagen de Wikipedia
3. Si no, si `imagen_local` tiene ruta → usa la copia descargada localmente
4. Si ninguna está disponible → muestra un placeholder con las iniciales del juego y el color de la plataforma

---

## 3. Gestión de imágenes (CLI)

Hay tres scripts de línea de comandos para consultar, modificar y descargar imágenes directamente desde la terminal, sin tocar `datos.json` a mano.

### Buscar la imagen de un juego

```powershell
node scripts/find-image.js "Sonic"
node scripts/find-image.js "Sonic" "Mega Drive"
```

Muestra para cada coincidencia: nombre, consola, URL de `imagen`, URL de `imagen_wiki`, si hay fichero descargado localmente e índice en `datos.json`.

### Cambiar la URL de imagen

```powershell
# Modifica el campo "imagen" (RAWG) — por defecto
node scripts/set-image.js "Sonic The Hedgehog" "Mega Drive" "https://nueva-url.jpg"

# Modifica el campo "imagen_wiki" (Wikipedia)
node scripts/set-image.js "Sonic The Hedgehog" "Mega Drive" "https://nueva-url.jpg" --campo imagen_wiki

# Modifica y además descarga la imagen al directorio images/
node scripts/set-image.js "Sonic The Hedgehog" "Mega Drive" "https://nueva-url.jpg" --download
```

El nombre y la consola deben coincidir exactamente con los valores en `datos.json`. Usa `find-image.js` para encontrar la coincidencia exacta si tienes dudas.

### Descargar todas las imágenes como backup

```powershell
# Descarga solo las que faltan (comportamiento por defecto)
npm run download-images

# Re-descarga todo aunque ya exista
npm run download-images -- --force

# Rellenar imagen_local en datos.json desde el manifest ya existente
npm run populate-local-images
```

Guarda cada imagen en `images/{índice}_{slug}.{ext}` y genera `images/manifest.json` con el mapeo completo de juego → fichero local. Al descargarse, el campo `imagen_local` de `datos.json` se actualiza automáticamente. Las ejecuciones siguientes solo descargan las que faltan, por lo que es seguro interrumpir y continuar.

---

## 4. Cómo redirige al video de gameplay

En el modal de cada juego hay un botón **"Ver gameplay"**. Al hacer clic:

1. La app construye una consulta de búsqueda automáticamente:

   ```text
   Nombre del juego + Consola + gameplay
   ```

   Por ejemplo: `Street Fighter II Super Nintendo gameplay`

2. Abre esa búsqueda directamente en **YouTube**:

   ```text
   https://www.youtube.com/results?search_query=Street+Fighter+II+Super+Nintendo+gameplay
   ```

No hay ningún video almacenado — el enlace se genera en tiempo real para cada juego.

---

## 5. Estructura de archivos

```text
notashobby/
├── index.html               → Estructura HTML de la aplicación
├── styles.css               → Todos los estilos
├── script.js                → Lógica: filtros, vistas, modal, enlace YouTube
├── datos.json               → Base de datos principal (1 492 juegos)
├── package.json             → Scripts npm
├── .env                     → Clave RAWG (NO subir a git)
├── .gitignore               → Ignora node_modules y .env
├── images/
│   ├── manifest.json        → Mapa juego → fichero local (generado automáticamente)
│   └── {idx}_{slug}.ext     → Imágenes descargadas como backup
└── scripts/
    ├── find-image.js           → Busca la imagen actual de un juego
    ├── set-image.js            → Modifica la URL de imagen de un juego
    ├── download-images.js      → Descarga masiva de imágenes como backup
    ├── populate-local-images.js→ Rellena imagen_local en datos.json desde el manifest
    ├── fix-duplicates.js       → Detecta y elimina URLs de imagen duplicadas/incorrectas
    ├── enrich-images.js        → Busca portadas RAWG + Wikipedia
    ├── enrich-descriptions.js  → Busca descripciones en Wikipedia ES/EN
    ├── find-images.js          → Busca imágenes para juegos sin cobertura (vgdb + Wiki)
    ├── wiki-smart.js           → Búsqueda inteligente con alias map + OpenSearch
    ├── wiki-precise.js         → Búsqueda con puntuación de confianza (≥7 auto, 4–6 review)
    ├── apply-review.js         → Aplica candidatos aprobados de wiki-precise-review.json
    ├── apply-find-review.js    → Aplica candidatos aprobados de find-images-review.json
    ├── wiki-precise-review.json→ Candidatos pendientes de revisión manual
    └── find-images-review.json → Candidatos pendientes de revisión manual
```

---

## 6. Scripts de enriquecimiento

Todos los scripts leen y modifican `datos.json`. Son seguros de interrumpir — guardan el progreso cada 20 juegos.

| Script | Rellena | Fuente | Clave API |
| --- | --- | --- | --- |
| `enrich-images.js` | `imagen`, `imagen_wiki` | Wikipedia + RAWG.io | ✅ `RAWG_API_KEY` |
| `wiki-smart.js` | `imagen_wiki` | Wikipedia (con alias map + OpenSearch) | ❌ No |
| `wiki-precise.js` | `imagen_wiki` | Wikipedia (con puntuación de confianza) | ❌ No |
| `find-images.js` | `imagen_wiki` | vgdb.com.br + Wikipedia | ❌ No |
| `enrich-descriptions.js` | `descripcion` | Wikipedia ES + EN | ❌ No |
| `fix-duplicates.js` | Limpia `imagen` | — (limpieza interna) | ❌ No |

### Flujo recomendado desde cero

```powershell
# 1. Limpiar URLs duplicadas que podrían estar mal asignadas
npm run fix-duplicates

# 2. Portadas principales (necesita .env con RAWG_API_KEY)
npm run enrich-images

# 3. Juegos sin imagen: buscar en Wikipedia con alias map
npm run wiki-smart

# 4. Segunda pasada con verificación de confianza
#    → genera scripts/wiki-precise-review.json para los candidatos 4–6 pts
npm run wiki-precise

#    Abre scripts/wiki-precise-review.json, marca "aprobado": true en los que quieras
npm run apply-review

# 5. Descripciones
npm run enrich-descriptions

# 6. Backup local de imágenes
npm run download-images
```

### wiki-precise: revisión de candidatos

`wiki-precise.js` clasifica cada imagen encontrada por puntuación:

- **≥ 7 puntos** → se aplica automáticamente a `datos.json`
- **4–6 puntos** → se guarda en `scripts/wiki-precise-review.json` para revisión manual
- **< 4 puntos** → se descarta

Para revisar manualmente:

```powershell
# 1. Abre scripts/wiki-precise-review.json
# 2. Cambia "aprobado": false → "aprobado": true en los que quieras aceptar
# 3. Aplica los aprobados:
npm run apply-review
```

---

## 7. Estructura de datos.json

Cada entrada del array tiene esta forma:

```json
{
  "Juego":         "Street Fighter II",
  "Consola":       "Super Nintendo",
  "Marca consola": "Nintendo",
  "Desarrollador": "Capcom",
  "Nota":          "96",
  "Número":        "15",
  "Mes":           "Diciembre",
  "Año":           "1992",
  "Pag":           "48",
  "imagen":        "https://media.rawg.io/media/games/xxx.jpg",
  "imagen_wiki":   "https://upload.wikimedia.org/wikipedia/xxx.jpg",
  "imagen_local":  "images/42_street-fighter-ii.jpg",
  "descripcion":   "Street Fighter II es un videojuego de lucha..."
}
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `Juego` | string | Nombre tal como aparece en la revista |
| `Consola` | string | Plataforma (ej. "Super Nintendo", "Mega Drive") |
| `Marca consola` | string | Fabricante (Nintendo, Sega…) — determina el color en la UI |
| `Desarrollador` | string | Empresa desarrolladora |
| `Nota` | string | Puntuación de 0 a 100 |
| `Número` | string | Número de la revista |
| `Mes` | string | Mes de publicación |
| `Año` | string | Año de publicación |
| `Pag` | string | Página de la revista |
| `imagen` | string / `""` | URL de portada RAWG.io (vacío = no encontrada) |
| `imagen_wiki` | string / `""` | URL thumbnail Wikipedia (vacío = no encontrada) |
| `imagen_local` | string / `""` | Ruta local a `images/` (vacío = no descargada) |
| `descripcion` | string / `""` | Resumen de Wikipedia (vacío = no encontrada) |

---

## 8. Variables de entorno (.env)

### 8.1 Obtener la clave RAWG

RAWG.io ofrece una API gratuita para obtener portadas e información de videojuegos. Sigue estos pasos:

1. Ve a <https://rawg.io/apidocs>
2. Haz clic en **"Get API key"** e introduce tu email
3. Confirma el correo que te enviarán
4. Inicia sesión en <https://rawg.io> y accede a tu perfil → **API key**
5. Copia la clave (es una cadena larga de letras y números)

> El plan gratuito permite hasta **20 000 peticiones al mes**, más que suficiente para enriquecer ~1000 juegos.

### 8.2 Configurarla en local

Crea un archivo `.env` en la raíz del proyecto con tu clave. **Nunca lo subas a git** (ya está en `.gitignore`).

```text
RAWG_API_KEY=pega_aqui_tu_clave_personal
```

Solo lo usa `scripts/enrich-images.js`. La web y el resto de scripts no lo necesitan.

---

## 9. Subir cambios al repositorio

```powershell
cd notashobby

# Ver qué ha cambiado
git status

# Añadir todos los cambios (datos.json incluido si se enriqueció)
git add .

# Commit con descripción del cambio
git commit -m "feat: añadir imágenes y descripciones a datos.json"

# Subir al repositorio remoto
git push origin main
```

> **Nota sobre images/:** las imágenes descargadas con `download-images.js` son un backup local y pueden pesar varios cientos de MB. Considera añadir `images/` a `.gitignore` si no quieres subirlas al repositorio.

---

## 10. Despliegue en Vercel

El proyecto es HTML/CSS/JS puro — Vercel lo sirve directamente sin ninguna configuración de build.

### Pasos para desplegar

1. Ve a <https://vercel.com> e inicia sesión con tu cuenta de GitHub
2. Haz clic en **"Add New Project"**
3. Importa el repositorio `Oriol-1/Notas-Hobby-Consolas`
4. En la pantalla de configuración deja todo por defecto (no hay build command ni output directory)
5. Haz clic en **"Deploy"**

Vercel genera una URL pública del tipo `https://notashobby.vercel.app`.

> **Variable de entorno RAWG en Vercel:** la clave RAWG solo la usan los scripts Node.js locales (`scripts/enrich-images.js`), que se ejecutan en tu máquina antes de subir el `datos.json` ya enriquecido. La web desplegada en Vercel no llama a la API de RAWG en tiempo real, por lo que **no es necesario configurar ninguna variable de entorno en Vercel**.
