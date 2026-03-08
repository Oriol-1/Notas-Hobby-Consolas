document.addEventListener("DOMContentLoaded", () => {
    const tablaJuegos = document.querySelector("#tabla-juegos tbody");
    const headers = document.querySelectorAll("th");
    const searchInput = document.querySelector("#search-input");
    const searchButton = document.querySelector("#search-button");
    const resetButton = document.querySelector("#reset-button"); 
    const contadorTexto = document.querySelector("#contador-juegos");

    let currentSort = {};
    let originalData = [];
    let currentData = []; 

    // Función para aplicar el color de fondo dinámico según la nota
    function obtenerEstiloNota(notaValor) {
        const nota = parseFloat(notaValor);
        
        // Si la celda está vacía o no es un número, no aplicamos color
        if (isNaN(nota)) return ""; 

        if (nota >= 90) {
            return "background-color: #b2fab4; color: black;"; // Verde clarito
        } else if (nota >= 80) {
            return "background-color: #388e3c; color: white;"; // Verde oscuro
        } else if (nota >= 70) {
            return "background-color: #fff59d; color: black;"; // Amarillo
        } else if (nota >= 60) {
            return "background-color: #ffcc80; color: black;"; // Naranja
        } else {
            return "background-color: #e53935; color: white;"; // Rojo (59 o inferior)
        }
    }

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
        if (contadorTexto) {
            contadorTexto.textContent = `Número de juegos: ${data.length}`;
        }

        // Aplicamos el color azul grisáceo a la primera celda y la función de notas a la última
        tablaJuegos.innerHTML = data.map(juego => `
            <tr>
                <td style="background-color: #b0c4de; color: black; ">${juego["Juego"]}</td>
                <td>${juego["Consola"]}</td>
                <td>${juego["Marca consola"]}</td>
                <td>${juego["Desarrollador"]}</td>
                <td>${juego["Número"]}</td>
                <td>${juego["Mes"]}</td>
                <td>${juego["Año"]}</td>
                <td>${juego["Pag"]}</td>
                <td style="${obtenerEstiloNota(juego["Nota"])}">${juego["Nota"]}</td>
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

    // Evento para reiniciar la búsqueda
    resetButton.addEventListener("click", () => {
        searchInput.value = ""; 
        currentData = [...originalData]; 
        renderTable(currentData); 
        currentSort = {}; 
    });
});