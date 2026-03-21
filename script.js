/* ================================================================
   NOTAS HOBBY CONSOLAS — script.js
   Filtros, búsqueda en tiempo real, toggle tabla/cards, lazy loading
   ================================================================ */

document.addEventListener("DOMContentLoaded", () => {

    // ── REFERENCIAS AL DOM ──────────────────────────────────────
    const vistaTarjetas   = document.getElementById("vista-cards");
    const vistaTabla      = document.getElementById("vista-tabla");
    const tablaBody       = document.querySelector("#tabla-juegos tbody");
    const tableHeaders    = document.querySelectorAll("#tabla-juegos th[data-column]");
    const searchInput     = document.getElementById("search-input");
    const resetButton     = document.getElementById("reset-button");
    const contadorTexto   = document.getElementById("contador-juegos");
    const estadoVacio     = document.getElementById("estado-vacio");
    const btnVistaTarjetas = document.getElementById("btn-vista-cards");
    const btnVistaTabla   = document.getElementById("btn-vista-tabla");
    const btnFiltros           = document.getElementById("btn-filtros");
    const panelFiltros         = document.getElementById("panel-filtros");
    const panelFiltrosOverlay  = document.getElementById("panel-filtros-overlay");
    const stickyControls       = document.querySelector(".sticky-controls");
    const filtrosActivos  = document.getElementById("filtros-activos");
    const filtrosBadge    = document.getElementById("filtros-badge");
    const chipsConsola    = document.getElementById("chips-consola");
    const chipsMarca      = document.getElementById("chips-marca");
    const chipsAnio       = document.getElementById("chips-anio");
    const sliderNota      = document.getElementById("slider-nota");
    const notaMinLabel    = document.getElementById("nota-min-label");
    const btnLimpiarFiltros = document.getElementById("btn-limpiar-filtros");
    const btnResetVacio   = document.getElementById("btn-reset-vacio");
    const barraPlataformas   = document.getElementById("barra-plataformas");
    const btnScrollTop        = document.getElementById("btn-scroll-top");

    // ── MODAL REFS ───────────────────────────────────────────────
    const modalJuego        = document.getElementById("modal-juego");
    const modalClose        = document.getElementById("modal-close");
    const modalTitulo       = document.getElementById("modal-titulo");
    const modalDescripcion  = document.getElementById("modal-descripcion");
    const modalDetalles     = document.getElementById("modal-detalles");
    const modalCover        = document.getElementById("modal-cover");
    const modalBadgeConsola = document.getElementById("modal-badge-consola");
    const modalBadgeNota    = document.getElementById("modal-badge-nota");
    const modalYoutube      = document.getElementById("modal-youtube");

    // ── ESTADO GLOBAL ───────────────────────────────────────────
    let originalData = [];
    let currentData  = [];
    let currentSort  = { column: null, order: "asc" };
    let debounceTimer = null;

    const state = {
        query: "",
        consolas: new Set(),
        marcas: new Set(),
        anios: new Set(),
        notaMin: 0,
        vista: localStorage.getItem("hc-vista") || "cards"
    };
    // ── MAPA CONSOLA → MARCA (para coloreado correcto de chips) ─────
    let consolaMarcaMap = {};
    // ── MAPA DE COLORES POR PLATAFORMA ──────────────────────────
    const PLATFORM_COLORS = {
        "sega":       { bg: "#003f7a", class: "sega",       plat: "sega" },
        "nintendo":   { bg: "#7a001a", class: "nintendo",   plat: "nintendo" },
        "atari":      { bg: "#7a2b00", class: "atari",      plat: "atari" },
        "snk":        { bg: "#1a5c1a", class: "neogeo",     plat: "neogeo" },
        "nec":        { bg: "#4a206a", class: "turbografx", plat: "turbografx" },
        "panasonic":  { bg: "#4a1a6a", class: "neogeo",     plat: "neogeo" },  // 3DO
        "philips":    { bg: "#005a5a", class: "turbografx", plat: "turbografx" }, // CD-i
        "sony":       { bg: "#00237a", class: "nintendo",   plat: "nintendo" },  // PlayStation
        "default":    { bg: "#2a3a50", class: "",           plat: "" }
    };

    function getPlatformInfo(marca) {
        const m = (marca || "").toLowerCase();
        if (m.includes("sega"))      return PLATFORM_COLORS["sega"];
        if (m.includes("nintendo"))  return PLATFORM_COLORS["nintendo"];
        if (m.includes("atari"))     return PLATFORM_COLORS["atari"];
        if (m.includes("snk"))       return PLATFORM_COLORS["snk"];
        if (m.includes("nec"))       return PLATFORM_COLORS["nec"];
        if (m.includes("panasonic")) return PLATFORM_COLORS["panasonic"];
        if (m.includes("philips"))   return PLATFORM_COLORS["philips"];
        if (m.includes("sony"))      return PLATFORM_COLORS["sony"];
        return PLATFORM_COLORS["default"];
    }

    // ── CLASES DE NOTA ──────────────────────────────────────────
    function getNotaClass(nota) {
        const n = parseFloat(nota);
        if (isNaN(n))  return "nota-na";
        if (n >= 90)   return "nota-90";
        if (n >= 80)   return "nota-80";
        if (n >= 70)   return "nota-70";
        if (n >= 60)   return "nota-60";
        return "nota-low";
    }

    // ── INICIALES DE PORTADA ────────────────────────────────────
    function getInitials(nombre) {
        return (nombre || "?")
            .split(/\s+/)
            .slice(0, 2)
            .map(w => w[0]?.toUpperCase() || "")
            .join("");
    }

    // ── RESALTADO DE TEXTO ──────────────────────────────────────
    function highlight(text, query) {
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const safeQ   = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return escaped.replace(new RegExp(`(${safeQ})`, "gi"), "<mark>$1</mark>");
    }

    function escapeHtml(str) {
        return (str ?? "")
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ── RENDERIZAR IMAGEN CON FALLBACK EN 3 NIVELES ─────────────
    function buildCardImage(juego) {
        const plat  = getPlatformInfo(juego["Marca consola"]);
        const inits = getInitials(juego["Juego"]);
        const src1  = juego.imagen       || "";
        const src2  = juego.imagen_wiki  || "";
        const hasSrc = src1 || src2;
        const consola = escapeHtml(juego["Consola"] || "");

        const badge = `<span class="card-badge-consola" style="background:${plat.bg};">${consola}</span>`;

        if (hasSrc) {
            return `
            <div class="card-img-wrapper">
                <div class="card-img-skeleton"></div>
                <img class="card-img"
                     src="${escapeHtml(src1 || src2)}"
                     loading="lazy"
                     data-fallback="${src2 && src1 ? escapeHtml(src2) : ""}"
                     data-plat-bg="${plat.bg}"
                     data-inits="${escapeHtml(inits)}"
                     data-consola="${consola}"
                     alt="${escapeHtml(juego["Juego"])}"
                     width="320" height="180"
                     style="opacity:0;"
                     onload="this.style.opacity='1'; this.previousElementSibling&&this.previousElementSibling.classList.contains('card-img-skeleton')&&this.previousElementSibling.remove();"
                     onerror="handleImgError(this)">
                ${badge}
            </div>`;
        }

        return `
        <div class="card-img-wrapper">
            <div class="card-img-placeholder" style="background:${plat.bg};">
                ${inits}
                <span class="ph-label">${consola}</span>
            </div>
            ${badge}
        </div>`;
    }

    // ── RENDERIZAR TARJETAS ─────────────────────────────────────
    function renderCards(data) {
        vistaTarjetas.innerHTML = "";
        const fragment = document.createDocumentFragment();

        data.forEach(juego => {
            const notaClass = getNotaClass(juego["Nota"]);
            const card = document.createElement("div");
            card.className = "game-card";
            card.innerHTML = `
                ${buildCardImage(juego)}
                <div class="card-body">
                    <div class="card-title">${highlight(juego["Juego"], state.query)}</div>
                    <div class="card-meta">${highlight(juego["Desarrollador"] || "", state.query)}</div>
                    <div class="card-footer">
                        <span class="card-anio">${escapeHtml(juego["Mes"] || "")} ${escapeHtml(juego["Año"] || "")}</span>
                        <span class="badge-nota ${notaClass}">${escapeHtml(juego["Nota"] || "—")}</span>
                    </div>
                </div>
            `;
            card.style.cursor = "pointer";
            card.addEventListener("click", () => openModal(juego));
            fragment.appendChild(card);
        });

        vistaTarjetas.appendChild(fragment);
    }

    // ── RENDERIZAR TABLA ────────────────────────────────────────
    function renderTable(data) {
        tablaBody.innerHTML = "";
        const fragment = document.createDocumentFragment();

        data.forEach(juego => {
            const plat = getPlatformInfo(juego["Marca consola"]);
            const notaClass = getNotaClass(juego["Nota"]);
            const hasSrc = juego.imagen || juego.imagen_wiki;
            const inits  = getInitials(juego["Juego"]);

            const imgCell = hasSrc
                ? `<img class="td-thumb"
                        src="${escapeHtml(juego.imagen || juego.imagen_wiki)}"
                        loading="lazy"
                        data-fallback="${juego.imagen_wiki && juego.imagen ? escapeHtml(juego.imagen_wiki) : ""}"
                        data-plat-bg="${plat.bg}"
                        data-inits="${escapeHtml(inits)}"
                        alt="${escapeHtml(juego["Juego"])}" style="opacity:0;"
                        onload="this.style.opacity='1';"
                        onerror="handleImgError(this)">`
                : `<div class="td-thumb-placeholder" style="background:${plat.bg};">${inits}</div>`;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="td-img">${imgCell}</td>
                <td class="td-juego">${highlight(juego["Juego"], state.query)}</td>
                <td>${highlight(juego["Consola"] || "", state.query)}</td>
                <td>${highlight(juego["Marca consola"] || "", state.query)}</td>
                <td>${highlight(juego["Desarrollador"] || "", state.query)}</td>
                <td>${escapeHtml(juego["Número"] || "")}</td>
                <td>${escapeHtml(juego["Mes"] || "")}</td>
                <td>${escapeHtml(juego["Año"] || "")}</td>
                <td>${escapeHtml(juego["Pag"] || "")}</td>
                <td class="td-nota"><span class="badge-nota ${notaClass}">${escapeHtml(juego["Nota"] || "—")}</span></td>
            `;

            tr.style.cursor = "pointer";
            tr.addEventListener("click", () => openModal(juego));
            fragment.appendChild(tr);
        });

        tablaBody.appendChild(fragment);
    }

    // ── HANDLER GLOBAL DE ERROR DE IMAGEN ───────────────────────
    window.handleImgError = function(img) {
        const fallback = img.dataset.fallback;
        if (fallback && img.src !== fallback) {
            img.src = fallback;
            img.dataset.fallback = "";
        } else {
            // Sustituir por placeholder
            const wrapper = img.closest(".card-img-wrapper, .td-img");
            if (!wrapper) { img.remove(); return; }

            const inits    = img.dataset.inits    || getInitials(img.alt || "");
            const platBg   = img.dataset.platBg   || "#1e2d3a";
            const consola  = img.dataset.consola  || "";
            const skeleton = wrapper.querySelector(".card-img-skeleton");
            if (skeleton) skeleton.remove();
            img.remove();

            const placeholder = document.createElement("div");

            if (wrapper.classList.contains("td-img")) {
                placeholder.className = "td-thumb-placeholder";
                placeholder.style.background = platBg;
                placeholder.textContent = inits;
            } else {
                placeholder.className = "card-img-placeholder";
                placeholder.style.background = platBg;
                placeholder.innerHTML = `${inits}<span class="ph-label">${consola}</span>`;
            }

            wrapper.appendChild(placeholder);
        }
    };

    // ── ACTUALIZAR CONTADORES Y ESTADO VACÍO ────────────────────
    function updateUI(data) {
        const n = data.length;
        contadorTexto.textContent = `${n} juego${n !== 1 ? "s" : ""}`;
        // La visibilidad de vistaTarjetas y vistaTabla la gestiona renderAll
        // con style.display para evitar conflictos de especificidad CSS.
    }

    // ── APLICAR FILTROS ─────────────────────────────────────────
    function applyFilters() {
        const q = state.query.toLowerCase().trim();

        currentData = originalData.filter(juego => {
            // Búsqueda de texto
            if (q) {
                const fields = [
                    juego["Juego"], juego["Consola"], juego["Marca consola"],
                    juego["Desarrollador"], juego["Año"], juego["Mes"]
                ];
                const matches = fields.some(f => (f || "").toLowerCase().includes(q));
                if (!matches) return false;
            }

            // Filtro Consola
            if (state.consolas.size && !state.consolas.has(juego["Consola"])) return false;

            // Filtro Marca
            if (state.marcas.size && !state.marcas.has(juego["Marca consola"])) return false;

            // Filtro Año
            if (state.anios.size && !state.anios.has(String(juego["Año"]))) return false;

            // Filtro Nota mínima
            if (state.notaMin > 0) {
                const nota = parseFloat(juego["Nota"]);
                if (isNaN(nota) || nota < state.notaMin) return false;
            }

            return true;
        });

        // Re-aplicar el sort activo para que filtrar nunca rompa el orden de la tabla
        applySortToData(currentData);

        renderAll(currentData);
        updateFiltrosActivos();
        updateBarraConteos();

        if (window.scrollY > 0) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }
    // ── HELPER: RE-APLICAR SORT ACTIVO SOBRE UN ARRAY ───────────────
    function applySortToData(data) {
        if (!currentSort.column) return;
        const col  = currentSort.column;
        const desc = currentSort.order === "desc";
        data.sort((a, b) => {
            const vA = isNaN(a[col]) ? (a[col] || "") : parseFloat(a[col]);
            const vB = isNaN(b[col]) ? (b[col] || "") : parseFloat(b[col]);
            if (vA > vB) return desc ? -1 :  1;
            if (vA < vB) return desc ?  1 : -1;
            return 0;
        });
    }
    // ── RENDER PRINCIPAL ────────────────────────────────────────
    function renderAll(data) {
        const vacio = data.length === 0;

        // Estilo inline (máxima prioridad CSS) para que nunca haya conflicto
        // con reglas como .vista-cards { display: grid } que tienen igual
        // especificidad que [hidden] y ganan por posición en la cascada.
        estadoVacio.hidden = !vacio;
        vistaTarjetas.style.display = (!vacio && state.vista === "cards") ? "grid"  : "none";
        vistaTabla.style.display    = (!vacio && state.vista === "tabla") ? "block" : "none";

        if (state.vista === "cards") renderCards(data);
        else                          renderTable(data);

        updateUI(data);
    }

    // ── FILTROS ACTIVOS (TAGS VISIBLES) ─────────────────────────
    function updateFiltrosActivos() {
        filtrosActivos.innerHTML = "";
        let count = 0;

        const addTag = (label, removeCallback) => {
            count++;
            const div = document.createElement("div");
            div.className = "filtro-tag";
            div.innerHTML = `${escapeHtml(label)} <button title="Quitar filtro" aria-label="Quitar ${escapeHtml(label)}">✕</button>`;
            div.querySelector("button").addEventListener("click", removeCallback);
            filtrosActivos.appendChild(div);
        };

        state.consolas.forEach(c => addTag(c, () => { state.consolas.delete(c); syncChips("consola"); applyFilters(); }));
        state.marcas.forEach(m   => addTag(m, () => { state.marcas.delete(m);   syncChips("marca");   applyFilters(); }));
        state.anios.forEach(a    => addTag(a, () => { state.anios.delete(a);    syncChips("anio");    applyFilters(); }));
        if (state.notaMin > 0)    addTag(`Nota ≥ ${state.notaMin}`, () => {
            state.notaMin = 0;
            sliderNota.value = 0;
            notaMinLabel.textContent = "0";
            notaMinLabel.style.background = "";
            applyFilters();
        });

        filtrosActivos.hidden = count === 0;
        filtrosBadge.textContent = String(count);
        filtrosBadge.hidden = count === 0;

        // Actualizar badges de grupo en el panel
        updateGrupoBadges();
    }

    // ── BADGES DE GRUPO ACTIVOS ─────────────────────────────────
    function updateGrupoBadges() {
        const grupos = [
            { id: "grupo-badge-consola", size: state.consolas.size },
            { id: "grupo-badge-marca",   size: state.marcas.size },
            { id: "grupo-badge-anio",    size: state.anios.size }
        ];
        grupos.forEach(({ id, size }) => {
            const badge = document.getElementById(id);
            if (!badge) return;
            badge.textContent = String(size);
            badge.hidden = size === 0;
        });
    }

    // ── GENERAR CHIPS DINÁMICOS ─────────────────────────────────
    function buildChips(container, valores, stateSet, tipo) {
        container.innerHTML = "";

        const campo = tipo === "consola" ? "Consola" : tipo === "marca" ? "Marca consola" : "Año";
        const countMap = {};
        originalData.forEach(j => {
            const v = String(j[campo] || "");
            if (v) countMap[v] = (countMap[v] || 0) + 1;
        });

        // Año: orden numérico. Resto: alfabético
        const sorted = tipo === "anio"
            ? [...valores].sort((a, b) => parseInt(a) - parseInt(b))
            : [...valores].sort();

        sorted.forEach(val => {
            const chip = document.createElement("button");
            chip.className = "chip" + (stateSet.has(val) ? " active" : "");
            chip.dataset.val = val;

            // Asignar plataforma usando mapa consola→marca para coloreado correcto
            const marcaLookup = tipo === "consola" ? (consolaMarcaMap[val] || val) : val;
            const plat = (tipo === "consola" || tipo === "marca") ? getPlatformInfo(marcaLookup).plat : "";
            if (plat) chip.dataset.plat = plat;

            const count = countMap[val] || 0;
            chip.innerHTML = `${escapeHtml(val)} <span class="chip-count">(${count})</span>`;

            chip.addEventListener("click", () => {
                if (stateSet.has(val)) stateSet.delete(val);
                else                   stateSet.add(val);
                chip.classList.toggle("active");
                if (tipo === "consola") syncBarraPlataformas();
                applyFilters();
            });
            container.appendChild(chip);
        });
    }

    function syncChips(tipo) {
        if (tipo === "consola") {
            chipsConsola.querySelectorAll(".chip").forEach(c => {
                c.classList.toggle("active", state.consolas.has(c.dataset.val));
            });
            syncBarraPlataformas();
        } else if (tipo === "marca") {
            chipsMarca.querySelectorAll(".chip").forEach(c => {
                c.classList.toggle("active", state.marcas.has(c.dataset.val));
            });
        } else if (tipo === "anio") {
            chipsAnio.querySelectorAll(".chip").forEach(c => {
                c.classList.toggle("active", state.anios.has(c.dataset.val));
            });
        }
    }

    // ── TOGGLE PANEL FILTROS ────────────────────────────────────
    function positionPanel() {
        if (stickyControls) {
            const rect = stickyControls.getBoundingClientRect();
            panelFiltros.style.top      = rect.bottom + "px";
            panelFiltros.style.left     = rect.left + "px";
            panelFiltros.style.right    = (window.innerWidth - rect.right) + "px";
            panelFiltros.style.maxHeight = (window.innerHeight - rect.bottom - 12) + "px";
        }
    }

    function togglePanel(force) {
        const willOpen = force !== undefined ? force : panelFiltros.hidden;
        if (willOpen) {
            positionPanel();
            panelFiltros.hidden = false;
            if (panelFiltrosOverlay) panelFiltrosOverlay.hidden = false;
            panelFiltros.classList.remove("panel-closing");
            panelFiltros.classList.add("panel-open");
        } else {
            panelFiltros.classList.remove("panel-open");
            panelFiltros.classList.add("panel-closing");
            panelFiltros.addEventListener("animationend", (e) => {
                if (e.target !== panelFiltros) return;
                panelFiltros.hidden = true;
                if (panelFiltrosOverlay) panelFiltrosOverlay.hidden = true;
                panelFiltros.classList.remove("panel-closing");
            }, { once: true });
        }
        btnFiltros.setAttribute("aria-expanded", String(willOpen));
    }

    btnFiltros.addEventListener("click", () => togglePanel());
    if (panelFiltrosOverlay) {
        panelFiltrosOverlay.addEventListener("click", () => togglePanel(false));
    }

    // Cerrar panel o modal con Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (modalJuego && !modalJuego.hidden) closeModal();
            else if (!panelFiltros.hidden) togglePanel(false);
        }
    });

    // Cerrar modal al hacer click en el overlay
    modalJuego.addEventListener("click", (e) => {
        if (e.target === modalJuego) closeModal();
    });
    modalClose.addEventListener("click", closeModal);

    // ── STICKY CONTROLS: altura del header ─────
    const siteHeader     = document.querySelector(".site-header");

    function updateHeaderHeight() {
        if (siteHeader) {
            document.documentElement.style.setProperty(
                "--header-h",
                siteHeader.offsetHeight + "px"
            );
        }
    }
    function updateStickyControlsHeight() {
        if (stickyControls) {
            document.documentElement.style.setProperty(
                "--sticky-controls-h",
                stickyControls.offsetHeight + "px"
            );
        }
    }
    updateHeaderHeight();
    updateStickyControlsHeight();
    new ResizeObserver(updateHeaderHeight).observe(siteHeader);
    new ResizeObserver(updateStickyControlsHeight).observe(stickyControls);

    // Cerrar el panel de filtros al hacer scroll hacia abajo
    let lastScrollY = window.scrollY;
    let scrollTicking = false;
    window.addEventListener("scroll", () => {
        if (scrollTicking) return;
        scrollTicking = true;
        window.requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;
            // Solo cierra al bajar más de 8px para evitar falsos positivos
            if (currentScrollY > lastScrollY + 8 && !panelFiltros.hidden) {
                togglePanel(false);
            }
            lastScrollY = currentScrollY;
            scrollTicking = false;
        });
    }, { passive: true });

    // ── MODAL: ABRIR Y CERRAR ────────────────────────────────────
    function openModal(juego) {
        const plat = getPlatformInfo(juego["Marca consola"]);
        const notaClass = getNotaClass(juego["Nota"]);
        const src = juego.imagen || juego.imagen_wiki;

        // Portada
        modalCover.innerHTML = "";
        modalCover.classList.remove("cover-placeholder");
        if (src) {
            const img = document.createElement("img");
            img.src = src;
            img.alt = escapeHtml(juego["Juego"]);
            img.loading = "lazy";
            img.onerror = () => {
                if (juego.imagen_wiki && img.src !== juego.imagen_wiki) {
                    img.src = juego.imagen_wiki;
                } else {
                    showCoverPlaceholder(juego);
                }
            };
            modalCover.appendChild(img);
        } else {
            showCoverPlaceholder(juego);
        }

        // Badge consola + nota
        modalBadgeConsola.textContent = juego["Consola"] || juego["Marca consola"] || "";
        modalBadgeConsola.style.background = plat.bg;
        modalBadgeNota.textContent  = juego["Nota"] || "—";
        modalBadgeNota.className    = `badge-nota ${notaClass}`;

        // Título
        modalTitulo.textContent = juego["Juego"] || "";

        // Detalles
        const detalles = [
            { label: "Desarrollador",  value: juego["Desarrollador"] },
            { label: "Consola",        value: juego["Consola"] },
            { label: "Marca",          value: juego["Marca consola"] },
            { label: "Número revista", value: juego["Número"] },
            { label: "Mes",            value: juego["Mes"] },
            { label: "Año",            value: juego["Año"] },
            { label: "Página",         value: juego["Pag"] },
        ].filter(d => d.value);

        modalDetalles.innerHTML = detalles.map(d =>
            `<div class="det-item">
                <span class="det-label">${escapeHtml(d.label)}</span>
                <span class="det-value">${escapeHtml(String(d.value))}</span>
            </div>`
        ).join("");

        // Descripción
        modalDescripcion.textContent = juego.descripcion || "";

        // Botón YouTube
        const q = encodeURIComponent(`${juego["Juego"]} ${juego["Consola"] || ""} gameplay`);
        modalYoutube.href = `https://www.youtube.com/results?search_query=${q}`;

        // Mostrar
        modalJuego.classList.remove("modal-closing");
        modalJuego.hidden = false;
        document.body.style.overflow = "hidden";
    }

    function showCoverPlaceholder(juego) {
        const plat = getPlatformInfo(juego["Marca consola"]);
        modalCover.classList.add("cover-placeholder");
        modalCover.style.background = plat.bg;
        modalCover.textContent = getInitials(juego["Juego"]);
    }

    function closeModal() {
        modalJuego.classList.add("modal-closing");
        const onEnd = () => {
            modalJuego.hidden = true;
            modalJuego.classList.remove("modal-closing");
            document.body.style.overflow = "";
            modalJuego.removeEventListener("animationend", onEnd);
        };
        // Escucha el fin de la animación en el panel interno
        const panel = modalJuego.querySelector(".modal-panel");
        panel.addEventListener("animationend", onEnd, { once: true });
    }

    // ── BARRA RÁPIDA DE PLATAFORMAS ─────────────────────────────
    // Conteo de cuántos juegos de cada consola pasan los filtros ACTUALES (excluyendo filtro de consola)
    function getConsolaCountsFiltered() {
        const counts = {};
        // Filtrar como applyFilters pero sin el filtro de consola
        const q = state.query.toLowerCase().trim();
        originalData.forEach(juego => {
            if (q) {
                const fields = [juego["Juego"], juego["Consola"], juego["Marca consola"],
                               juego["Desarrollador"], juego["Año"], juego["Mes"]];
                if (!fields.some(f => (f || "").toLowerCase().includes(q))) return;
            }
            if (state.marcas.size && !state.marcas.has(juego["Marca consola"])) return;
            if (state.anios.size  && !state.anios.has(String(juego["Año"]))) return;
            if (state.notaMin > 0) {
                const nota = parseFloat(juego["Nota"]);
                if (isNaN(nota) || nota < state.notaMin) return;
            }
            const c = juego["Consola"];
            if (c) counts[c] = (counts[c] || 0) + 1;
        });
        return counts;
    }

    function buildBarraPlataformas(consolas) {
        if (!barraPlataformas) return;
        barraPlataformas.innerHTML = "";

        const conteo = {};
        originalData.forEach(j => {
            const c = j["Consola"];
            if (c) conteo[c] = (conteo[c] || 0) + 1;
        });
        const sorted = [...consolas].sort((a, b) => (conteo[b] || 0) - (conteo[a] || 0));

        const btnTodos = document.createElement("button");
        btnTodos.className = "btn-plat btn-plat-todos" + (state.consolas.size === 0 ? " active" : "");
        btnTodos.dataset.total = String(originalData.length);
        btnTodos.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z"/></svg>
            Todas
            <span class="plat-count">${originalData.length}</span>`;
        btnTodos.addEventListener("click", () => {
            state.consolas.clear();
            syncChips("consola");
            applyFilters();
        });
        barraPlataformas.appendChild(btnTodos);

        sorted.forEach(consola => {
            const marca = consolaMarcaMap[consola] || "";
            const plat  = getPlatformInfo(marca);
            const count = conteo[consola] || 0;

            const btn = document.createElement("button");
            btn.className = "btn-plat" + (state.consolas.has(consola) ? " active" : "");
            btn.dataset.consola = consola;
            btn.dataset.total = String(count);
            btn.style.setProperty("--plat-color", plat.bg);
            btn.innerHTML = `
                <span class="plat-dot" style="background:${plat.bg};"></span>
                ${escapeHtml(consola)}
                <span class="plat-count">${count}</span>`;

            btn.addEventListener("click", () => {
                if (state.consolas.has(consola)) state.consolas.delete(consola);
                else                              state.consolas.add(consola);
                btn.classList.toggle("active", state.consolas.has(consola));
                barraPlataformas.querySelector(".btn-plat-todos")
                    ?.classList.toggle("active", state.consolas.size === 0);
                syncChips("consola");
                applyFilters();
            });
            barraPlataformas.appendChild(btn);
        });

        barraPlataformas.hidden = false;
    }

    // ── ACTUALIZAR CONTADORES DE LA BARRA (tras filtros activos) ─
    function updateBarraConteos() {
        if (!barraPlataformas || barraPlataformas.hidden) return;
        const filteredCounts = getConsolaCountsFiltered();
        barraPlataformas.querySelectorAll(".btn-plat[data-consola]").forEach(btn => {
            const c   = btn.dataset.consola;
            const cnt = filteredCounts[c] || 0;
            const span = btn.querySelector(".plat-count");
            if (span) span.textContent = String(cnt);
            // Deshabilitar visualmente si no hay resultados con ese filtro
            btn.classList.toggle("plat-empty", cnt === 0 && !state.consolas.has(c));
        });
        // Actualizar total en "Todas"
        const todosBtn = barraPlataformas.querySelector(".btn-plat-todos");
        if (todosBtn) {
            const todosSpan = todosBtn.querySelector(".plat-count");
            const total = Object.values(filteredCounts).reduce((s, n) => s + n, 0);
            if (todosSpan) todosSpan.textContent = String(total);
        }
    }

    function syncBarraPlataformas() {
        if (!barraPlataformas) return;
        barraPlataformas.querySelectorAll(".btn-plat[data-consola]").forEach(btn => {
            btn.classList.toggle("active", state.consolas.has(btn.dataset.consola));
        });
        const todosBtn = barraPlataformas.querySelector(".btn-plat-todos");
        if (todosBtn) todosBtn.classList.toggle("active", state.consolas.size === 0);
    }

    // ── SLIDER NOTA ─────────────────────────────────────────────
    const notaGradientBar = document.querySelector(".nota-gradient-bar");

    function updateSliderVisual(n) {
        const pct = n + "%";
        let bg = "var(--hc-blue)";
        if      (n >= 90) bg = "#1b5e20";
        else if (n >= 80) bg = "#2e7d32";
        else if (n >= 70) bg = "#f9a825";
        else if (n >= 60) bg = "#e65100";
        else if (n >  0)  bg = "#c62828";
        notaMinLabel.style.background = bg;
        // Mover indicador sobre la barra de degradado
        if (notaGradientBar) {
            notaGradientBar.style.setProperty("--slider-pct", pct);
            notaGradientBar.style.setProperty("--nota-badge-color", bg);
        }
    }

    sliderNota.addEventListener("input", () => {
        state.notaMin = parseInt(sliderNota.value, 10);
        notaMinLabel.textContent = String(state.notaMin);
        updateSliderVisual(state.notaMin);
        applyFilters();
    });

    // ── LIMPIAR FILTROS ─────────────────────────────────────────
    function limpiarTodo() {
        state.query = "";
        state.consolas.clear();
        state.marcas.clear();
        state.anios.clear();
        state.notaMin = 0;
        searchInput.value = "";
        sliderNota.value = 0;
        notaMinLabel.textContent = "0";
        notaMinLabel.style.background = "";
        updateSliderVisual(0);
        // Resetear ordenamiento — los datos vuelven al orden original
        currentSort = { column: null, order: "asc" };
        tableHeaders.forEach(h => h.removeAttribute("data-order"));
        syncChips("consola");
        syncChips("marca");
        syncChips("anio");
        applyFilters();
    }

    btnLimpiarFiltros.addEventListener("click", limpiarTodo);
    btnResetVacio.addEventListener("click", () => { limpiarTodo(); togglePanel(false); });
    resetButton.addEventListener("click", () => { state.query = ""; searchInput.value = ""; applyFilters(); });

    // ── BÚSQUEDA EN TIEMPO REAL ─────────────────────────────────
    searchInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            state.query = searchInput.value.trim();
            applyFilters();
        }, 200);
    });

    // ── TOGGLE VISTA ────────────────────────────────────────────
    function setVista(vista) {
        state.vista = vista;
        localStorage.setItem("hc-vista", vista);

        btnVistaTarjetas.classList.toggle("active", vista === "cards");
        btnVistaTabla.classList.toggle("active", vista === "tabla");
        btnVistaTarjetas.setAttribute("aria-pressed", String(vista === "cards"));
        btnVistaTabla.setAttribute("aria-pressed", String(vista === "tabla"));

        renderAll(currentData);
    }

    btnVistaTarjetas.addEventListener("click", () => setVista("cards"));
    btnVistaTabla.addEventListener("click", () => setVista("tabla"));

    // ── ORDENAMIENTO DE TABLA ────────────────────────────────────
    tableHeaders.forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.column;
            const isDesc = currentSort.column === col && currentSort.order === "asc";

            currentSort = { column: col, order: isDesc ? "desc" : "asc" };

            // Limpiar indicadores anteriores y activar el nuevo
            tableHeaders.forEach(h => { h.removeAttribute("data-order"); });
            th.setAttribute("data-order", currentSort.order);

            // Reutiliza applySortToData (misma lógica que applyFilters)
            applySortToData(currentData);
            renderTable(currentData);
        });
    });

    // ── CARGA DE DATOS ───────────────────────────────────────────
    fetch("datos.json")
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
            originalData = data;
            currentData  = [...data];

            // Construir mapa consola → marca para coloreado correcto
            data.forEach(j => {
                if (j["Consola"] && j["Marca consola"])
                    consolaMarcaMap[j["Consola"]] = j["Marca consola"];
            });

            // Construir sets de filtros únicos
            const consolas = new Set(data.map(j => j["Consola"]).filter(Boolean));
            const marcas   = new Set(data.map(j => j["Marca consola"]).filter(Boolean));
            const anios    = new Set(data.map(j => String(j["Año"])).filter(Boolean));

            buildBarraPlataformas(consolas);
            buildChips(chipsConsola, consolas, state.consolas, "consola");
            buildChips(chipsMarca,   marcas,   state.marcas,   "marca");
            buildChips(chipsAnio,    anios,    state.anios,    "anio");

            // Aplicar vista guardada en localStorage
            setVista(state.vista);
            applyFilters();
        })
        .catch(err => {
            console.error("Error cargando datos.json:", err);
            contadorTexto.textContent = "Error al cargar los datos";
        });

    // ── BOTÓN SCROLL TO TOP ──────────────────────────────────────
    window.addEventListener("scroll", () => {
        if (btnScrollTop) btnScrollTop.hidden = window.scrollY < 300;
    }, { passive: true });

    if (btnScrollTop) {
        btnScrollTop.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

});