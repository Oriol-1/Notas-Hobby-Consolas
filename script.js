document.addEventListener("DOMContentLoaded", () => {
    const tablaJuegos = document.querySelector("#tabla-juegos tbody");
    const headers = document.querySelectorAll("th");
    const searchInput = document.querySelector("#search-input");
    const searchButton = document.querySelector("#search-button");
    // Seleccionamos el elemento del contador
    const contadorTexto = document.querySelector("#contador-juegos");

    let currentSort = {};
    let originalData = [];
    let currentData = []; 

    // Cargar datos desde JSON
    fetch("datos.json")
        .then(response => response.json())
        .then(data => {
            originalData = data;
            currentData = [...data]; 
            renderTable(currentData);
            addSorting(headers);
        });

    // Renderizar tabla
    function renderTable(data) {
        // ACTUALIZACIÓN: Actualiza el contador con el número de elementos del array actual
        if (contadorTexto) {
            contadorTexto.textContent = `Número de juegos: ${data.length}`;
        }

        tablaJuegos.innerHTML = data.map(juego => `
            <tr>
                <td>${juego["Juego"]}</td>
                <td>${juego["Consola"]}</td>
                <td>${juego["Marca consola"]}</td>
                <td>${juego["Desarrollador"]}</td>
                <td>${juego["Número"]}</td>
                <td>${juego["Mes"]}</td>
                <td>${juego["Año"]}</td>
                <td>${juego["Pag"]}</td>
                <td>${juego["Nota"]}</td>
            </tr>
        `).join("");
    }

    // Ordenar columnas
    function addSorting(headers) {
        headers.forEach(header => {
            header.addEventListener("click", () => {
                const column = header.getAttribute("data-column");
                const isDescending = currentSort.column === column && currentSort.order === "asc";

                currentData.sort((a, b) => {
                    const valA = isNaN(a[column]) ? a[column] : parseFloat(a[column]);
                    const valB = isNaN(b[column]) ? b[column] : parseFloat(b[column]);

                    if (valA > valB) return isDescending ? -1 : 1;
                    if (valA < valB) return isDescending ? 1 : -1;
                    return 0;
                });

                currentSort = { column, order: isDescending ? "desc" : "asc" };
                renderTable(currentData);
            });
        });
    }

    // Buscar datos
    function searchTable(query) {
        currentData = originalData.filter(juego =>
            Object.values(juego).some(value =>
                value.toString().toLowerCase().includes(query.toLowerCase())
            )
        );

        renderTable(currentData);
    }

    // Evento de búsqueda
    searchButton.addEventListener("click", () => {
        const query = searchInput.value.trim();
        searchTable(query);
    });

    // Búsqueda con Enter
    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            searchButton.click();
        }
    });
});