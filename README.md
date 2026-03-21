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
3. [Cómo redirige al video de gameplay](#3-cómo-redirige-al-video-de-gameplay)
4. [Estructura de archivos](#4-estructura-de-archivos)
5. [Scripts de enriquecimiento](#5-scripts-de-enriquecimiento)
6. [Estructura de datos.json](#6-estructura-de-datosjson)
7. [Variables de entorno (.env)](#7-variables-de-entorno-env)
8. [Subir cambios al repositorio](#8-subir-cambios-al-repositorio)
9. [Despliegue en Vercel](#9-despliegue-en-vercel)

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
npx serve .
```

La primera vez npm descargará `serve` automáticamente. Verás:

```text
   ┌──────────────────────────────────────────┐
   │   Serving!                               │
   │   - Local:    http://localhost:3000      │
   └──────────────────────────────────────────┘
```

Abre **<http://localhost:3000>** en el navegador. Para detener: `Ctrl + C`.

---

## 2. Cómo encuentra las imágenes de portada

Cada juego en `datos.json` tiene dos campos de imagen:

| Campo | Fuente | Prioridad |
| --- | --- | --- |
| `imagen` | [RAWG.io](https://rawg.io) — portada oficial del juego | 1ª (si existe) |
| `imagen_wiki` | [Wikipedia](https://en.wikipedia.org) — thumbnail del artículo | 2ª (fallback) |

La app muestra la imagen siguiendo este orden:
1. Si `imagen` tiene URL → usa esa portada (RAWG)
2. Si no, si `imagen_wiki` tiene URL → usa la imagen de Wikipedia
3. Si ambas están vacías → muestra un placeholder con las iniciales del juego y el color de la plataforma

### Cómo se rellenan automáticamente

Tres scripts de Node.js buscan y guardan las imágenes en `datos.json`:

| Script | Qué busca | Estrategia |
| --- | --- | --- |
| `enrich-images.js` | Portadas RAWG + Wikipedia | Wikipedia primero (más fiable para retro), RAWG como alternativa |
| `wiki-only.js` | Solo Wikipedia | Búsqueda directa por nombre + consola |
| `wiki-smart.js` | Solo Wikipedia (inteligente) | **Alias map** (200+ entradas para títulos españoles/localizados) + OpenSearch con nombre, consola, marca y año |

#### Por qué existe `wiki-smart.js`

Muchos juegos de los 90 tienen títulos localizados en España distintos al nombre inglés de Wikipedia. Por ejemplo:

| Título en la revista | Artículo en Wikipedia |
| --- | --- |
| Los Pitufos | The Smurfs (video game) |
| El Rey León | The Lion King (video game) |
| Probotector 2 | Contra: The Alien Wars |
| Super Aleste | Space Megaforce |
| Mundodisco | Discworld (video game) |

`wiki-smart.js` incluye un **alias map** con más de 200 entradas que traduce el título español/localizado al slug exacto de Wikipedia antes de hacer la búsqueda. Si el alias no basta, usa la **Wikipedia OpenSearch API** con las 4 dimensiones del juego: nombre + consola + marca + año.

#### Ejecutar los scripts (solo si quieres re-enriquecer)

```powershell
# Requiere RAWG_API_KEY en .env (ver sección 7)
node enrich-images.js

# Wikipedia pura — no necesita clave
node wiki-only.js
node wiki-smart.js
```

> Los scripts son **reanudables**: si los interrumpes con `Ctrl + C`, la próxima vez continuarán donde lo dejaron.

---

## 3. Cómo redirige al video de gameplay

En el modal de cada juego hay un botón **"Ver gameplay"**. Al hacer clic:

1. La app construye una consulta de búsqueda automáticamente:
   ```
   Nombre del juego + Consola + gameplay
   ```
   Por ejemplo: `Street Fighter II Super Nintendo gameplay`

2. Abre esa búsqueda directamente en **YouTube**:
   ```
   https://www.youtube.com/results?search_query=Street+Fighter+II+Super+Nintendo+gameplay
   ```

No hay ningún video almacenado — el enlace se genera en tiempo real para cada juego. Así siempre apunta a los videos más recientes disponibles en YouTube.

---

## 4. Estructura de archivos

```text
notashobby/
├── index.html               → Estructura HTML de la aplicación
├── styles.css               → Todos los estilos (diseño glassmorphism)
├── script.js                → Lógica: filtros, vistas, modal, enlace YouTube
├── datos.json               → Base de datos principal (1 492 juegos)
├── enrich-images.js         → Script: busca portadas RAWG + Wikipedia
├── enrich-descriptions.js   → Script: busca descripciones en Wikipedia ES/EN
├── wiki-only.js             → Script: busca portadas solo en Wikipedia
├── wiki-smart.js            → Script: búsqueda inteligente con alias map + OpenSearch
├── fix-duplicates.js        → Script: detecta y elimina URLs duplicadas/incorrectas
├── .env                     → Clave RAWG (NO subir a git)
└── .gitignore               → Ignora node_modules y .env
```

---

## 5. Scripts de enriquecimiento

Todos los scripts leen y modifican `datos.json`. Son seguros de interrumpir — guardan el progreso cada 20 juegos.

| Script | Rellena | Fuente | Clave API |
| --- | --- | --- | --- |
| `enrich-images.js` | `imagen`, `imagen_wiki` | Wikipedia + RAWG.io | ✅ `RAWG_API_KEY` |
| `wiki-only.js` | `imagen_wiki` | Wikipedia | ❌ No |
| `wiki-smart.js` | `imagen_wiki` | Wikipedia (con alias map + OpenSearch) | ❌ No |
| `enrich-descriptions.js` | `descripcion` | Wikipedia ES + EN | ❌ No |
| `fix-duplicates.js` | Limpia `imagen` | — (limpieza interna) | ❌ No |

### Flujo recomendado desde cero

```powershell
# 1. Portadas principales (necesita .env con RAWG_API_KEY)
node enrich-images.js

# 2. Limpiar posibles portadas incorrectas asignadas por RAWG
node fix-duplicates.js

# 3. Recuperar portadas que siguen vacías usando solo Wikipedia
node wiki-smart.js

# 4. Descripciones (no necesita clave)
node enrich-descriptions.js
```

---

## 6. Estructura de datos.json

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
| `descripcion` | string / `""` | Resumen de Wikipedia (vacío = no encontrada) |

> **Regla de protección:** si `imagen=""` e `imagen_wiki!=""`, esa imagen fue corregida manualmente y los scripts nunca la sobreescriben.

---

## 7. Variables de entorno (.env)

### 7.1 Obtener la clave RAWG

RAWG.io ofrece una API gratuita para obtener portadas e información de videojuegos. Sigue estos pasos:

1. Ve a <https://rawg.io/apidocs>
2. Haz clic en **"Get API key"** e introduce tu email
3. Confirma el correo que te enviarán
4. Inicia sesión en <https://rawg.io> y accede a tu perfil → **API key**
5. Copia la clave (es una cadena larga de letras y números)

> El plan gratuito permite hasta **20 000 peticiones al mes**, más que suficiente para enriquecer ~1000 juegos.

### 7.2 Configurarla en local

Crea un archivo `.env` en la raíz del proyecto con tu clave. **Nunca lo subas a git** (ya está en `.gitignore`).

```text
RAWG_API_KEY=pega_aqui_tu_clave_personal
```

Verificación rápida — si el archivo está bien, este comando debe imprimir tu clave:

```powershell
Get-Content .env
```

Solo lo usa `enrich-images.js`. La web y `enrich-descriptions.js` no lo necesitan.

---

## 8. Subir cambios al repositorio

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

> **Importante:** `datos.json` puede pesar varios MB tras el enriquecimiento. Si el repositorio tiene límite de tamaño, considera comprimir imágenes o usar Git LFS.

---

## 9. Despliegue en Vercel

El proyecto es HTML/CSS/JS puro — Vercel lo sirve directamente sin ninguna configuración de build.

### Pasos para desplegar

1. Ve a <https://vercel.com> e inicia sesión con tu cuenta de GitHub
2. Haz clic en **"Add New Project"**
3. Importa el repositorio `bodickerdev/notashobby`
4. En la pantalla de configuración deja todo por defecto (no hay build command ni output directory)
5. Haz clic en **"Deploy"**

Vercel genera una URL pública del tipo `https://notashobby.vercel.app`.

### Variable de entorno RAWG en Vercel

> **Importante:** la clave RAWG solo la usan los scripts Node.js locales (`enrich-images.js`), que se ejecutan en tu máquina **antes** de subir el `datos.json` ya enriquecido. La web desplegada en Vercel **no llama a la API de RAWG en tiempo real**, por lo que **no es necesario configurar ninguna variable de entorno en Vercel**.

El flujo correcto es:

```text
[Local] node enrich-images.js   → enriquece datos.json usando RAWG
[Local] git add datos.json
[Local] git push origin main
[Vercel] despliega automáticamente con datos.json ya completo
```

Si en el futuro quisieras añadir una función serverless que llame a RAWG desde Vercel, los pasos serían:

1. En el dashboard de Vercel entra en tu proyecto → **Settings** → **Environment Variables**
2. Haz clic en **"Add"**
3. Rellena:
   - **Name:** `RAWG_API_KEY`
   - **Value:** tu clave personal
   - **Environment:** Production (y opcionalmente Preview y Development)
4. Haz clic en **"Save"**
5. Vuelve a desplegar (Vercel → **Deployments** → **Redeploy**) para que la variable quede activa

> Las variables de entorno en Vercel son privadas y nunca aparecen en el código fuente público.
