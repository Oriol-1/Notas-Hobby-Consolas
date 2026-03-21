# Notas Hobby Consolas 1991–1996

Aplicación web estática que permite consultar, filtrar y explorar las notas de videojuegos publicadas en la revista **Hobby Consolas** entre 1991 y 1996. Cada juego tiene portada, descripción y acceso directo a gameplay en YouTube.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalación y primer arranque](#2-instalación-y-primer-arranque)
3. [Ejecutar el proyecto en local](#3-ejecutar-el-proyecto-en-local)
4. [Estructura de archivos](#4-estructura-de-archivos)
5. [Rellenar la información que falta en datos.json](#5-rellenar-la-información-que-falta-en-datosjson)
   - [5.1 Imágenes de portada](#51-imágenes-de-portada-enrich-imagesjs)
   - [5.2 Descripciones](#52-descripciones-enrich-descriptionsjs)
   - [5.3 Orden recomendado](#53-orden-recomendado)
6. [Estructura de datos.json](#6-estructura-de-datosjson)
7. [Variables de entorno (.env)](#7-variables-de-entorno-env)
   - [7.1 Obtener la clave RAWG](#71-obtener-la-clave-rawg)
   - [7.2 Configurarla en local](#72-configurarla-en-local)
8. [Subir cambios al repositorio](#8-subir-cambios-al-repositorio)
9. [Despliegue en Vercel](#9-despliegue-en-vercel)

---

## 1. Requisitos

| Herramienta | Versión mínima | Para qué se usa |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 18 LTS o superior | Scripts de enriquecimiento + servidor local |
| npm | Incluido con Node.js | Instalar `serve` |
| Git | Cualquier versión reciente | Control de versiones |

Comprueba que lo tienes instalado:

```powershell
node -v
npm -v
git --version
```

---

## 2. Instalación y primer arranque

```powershell
# 1. Clona el repositorio
git clone https://github.com/bodickerdev/notashobby.git
cd notashobby

# 2. Crea el archivo de variables de entorno
#    (necesario solo para el script de imágenes)
New-Item .env
Add-Content .env "RAWG_API_KEY=tu_clave_aqui"
```

> La clave RAWG.io es gratuita. Regístrate en <https://rawg.io/apidocs> y copia tu clave personal.

---

## 3. Ejecutar el proyecto en local

El proyecto es HTML/CSS/JS puro — no necesita compilación. Solo hace falta un servidor HTTP local para que el `fetch()` de `datos.json` funcione correctamente.

```powershell
# Desde la carpeta del proyecto
npx serve . --listen 3000
```

Abre el navegador en: **<http://localhost:3000>**

> `npx serve` no requiere instalación previa; npm lo descarga automáticamente la primera vez.

---

## 4. Estructura de archivos

```text
notashobby/
├── index.html              → Estructura HTML de la aplicación
├── styles.css              → Todos los estilos (diseño glassmorphism)
├── script.js               → Toda la lógica (filtros, vistas, modal)
├── datos.json              → Base de datos principal (~1000 juegos)
├── enrich-images.js        → Script Node.js: rellena portadas en datos.json
├── enrich-descriptions.js  → Script Node.js: rellena descripciones en datos.json
├── .env                    → Variables de entorno (clave RAWG) — NO subir a git
├── .gitignore              → Ignora node_modules y .env
└── images/                 → Carpeta de imágenes locales (si las hubiera)
```

---

## 5. Rellenar la información que falta en datos.json

`datos.json` es el corazón de la aplicación. Cada juego tiene hasta **12 campos**. Los que pueden estar vacíos son `imagen`, `imagen_wiki` y `descripcion`. Los scripts de enriquecimiento los rellenan automáticamente consultando APIs públicas.

### 5.1 Imágenes de portada (`enrich-images.js`)

**Qué hace:**

- Consulta la API de [RAWG.io](https://rawg.io/apidocs) para obtener la portada oficial del juego → campo `imagen`
- Si RAWG no encuentra nada, consulta Wikipedia en inglés → campo `imagen_wiki`
- Salta los juegos que ya tienen imagen (reanudable si se interrumpe)
- Guarda progresivamente cada 20 juegos para no perder datos

**Requisito previo:** tener la clave `RAWG_API_KEY` en el archivo `.env`

```powershell
# Desde la carpeta del proyecto
node enrich-images.js
```

**Tiempo estimado:** ~7–10 minutos para ~1000 juegos (delay de 400 ms entre llamadas para respetar los límites de la API)

**Resultado en datos.json:**

```json
{
  "imagen":       "https://media.rawg.io/media/games/xxx.jpg",
  "imagen_wiki":  "https://upload.wikimedia.org/wikipedia/xxx.jpg"
}
```

---

### 5.2 Descripciones (`enrich-descriptions.js`)

**Qué hace:**

- Consulta Wikipedia en **español** para obtener un resumen del juego → campo `descripcion`
- Si Wikipedia ES no tiene el juego, prueba con **Wikipedia en inglés** como fallback
- Prueba automáticamente con el nombre exacto y con sufijos como "(videojuego)" / "(video game)"
- Salta los juegos que ya tienen descripción (reanudable si se interrumpe)
- Guarda progresivamente cada 20 juegos

**No requiere API key** — usa la API REST pública de Wikipedia

```powershell
# Desde la carpeta del proyecto
node enrich-descriptions.js
```

**Tiempo estimado:** ~5–8 minutos para ~1000 juegos (delay de 300 ms entre llamadas)

**Resultado en datos.json:**

```json
{
  "descripcion": "Street Fighter II es un videojuego de lucha desarrollado por Capcom..."
}
```

Si Wikipedia no encuentra el juego, el campo queda como `""` (cadena vacía) — el modal simplemente no muestra la sección de descripción.

---

### 5.3 Orden recomendado

Si partes desde cero (datos.json sin imágenes ni descripciones):

```powershell
# Paso 1: rellenar imágenes (necesita .env con RAWG_API_KEY)
node enrich-images.js

# Paso 2: rellenar descripciones (sin API key)
node enrich-descriptions.js
```

Ambos scripts son **idempotentes**: si los ejecutas dos veces, solo procesan los juegos que aún no tienen datos. Puedes interrumpirlos y reanudarlos sin perder lo ya guardado.

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
| `Juego` | string | Nombre del juego tal como aparece en la revista |
| `Consola` | string | Modelo de consola (ej. "Super Nintendo") |
| `Marca consola` | string | Fabricante (Nintendo, Sega, etc.) — usado para colores en la UI |
| `Desarrollador` | string | Empresa desarrolladora |
| `Nota` | string | Puntuación de 0 a 100 |
| `Número` | string | Número de la revista |
| `Mes` | string | Mes de publicación |
| `Año` | string | Año de publicación |
| `Pag` | string | Página de la revista |
| `imagen` | string / `""` | URL de portada de RAWG.io |
| `imagen_wiki` | string / `""` | URL de portada de Wikipedia |
| `descripcion` | string / `""` | Resumen obtenido de Wikipedia |

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
