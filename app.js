let currentPhotoTarget = '';

function volverASeleccionFallas() {
    cerrarModal('modalGestionFallas');
    abrirModalSeleccionFallas();
}

function abrirMenuFoto(target) {
    currentPhotoTarget = target;
    const prevId = target === 'Frente' ? 'prevFrente' : 'prevRespaldo';
    const imgPreview = document.getElementById(prevId);
    const btnEliminar = document.getElementById('btnMenuEliminarFoto');

    if (imgPreview && imgPreview.src && imgPreview.src.startsWith("data:")) {
        btnEliminar.style.display = "flex";
    } else {
        btnEliminar.style.display = "none";
    }

    document.getElementById('modalMenuFoto').style.display = 'flex';
}

function cerrarMenuFoto() {
    document.getElementById('modalMenuFoto').style.display = 'none';
}

function seleccionarFoto(origen) {
    cerrarMenuFoto();
    if (origen === 'camara') {
        document.getElementById('file' + currentPhotoTarget + 'Camara').click();
    } else if (origen === 'galeria') {
        document.getElementById('file' + currentPhotoTarget + 'Galeria').click();
    } else if (origen === 'eliminar') {
        eliminarFotoForm(currentPhotoTarget);
    }
}

const DB_NAME = "VolumenesEscombrosDB";
const DB_VERSION = 1;
let db;

const request = indexedDB.open(DB_NAME, DB_VERSION);
request.onerror = e => console.error("Error DB:", e);

async function verificarNovedades() {
    const cachedVersion = localStorage.getItem('app_version') || 'v1.0';
    const versionEl = document.getElementById('app-version-text');
    if (versionEl) versionEl.textContent = cachedVersion;

    try {
        const response = await fetch('./novedades.json?v=' + Date.now());
        if (!response.ok) return;
        
        const data = await response.json();
        const version = data.version || cachedVersion;

        if (cachedVersion !== version) {
            localStorage.setItem('app_version', version);
            if (versionEl) versionEl.textContent = version;
        }

        const lastVersion = localStorage.getItem('last_version_seen');
        if (lastVersion !== version) {
            document.getElementById('novedadesTitle').innerText = data.titulo || "🚀 ¡Novedades!";
            
            const ul = document.getElementById('novedadesList');
            ul.innerHTML = "";
            if (data.cambios) {
                data.cambios.forEach(cambio => {
                    const li = document.createElement('li');
                    li.style.marginBottom = "8px";
                    li.innerHTML = cambio.replace(/^(.*?):/, '<b>$1:</b>');
                    ul.appendChild(li);
                });
            }
            
            localStorage.setItem('last_version_seen', version);
            abrirModal("modalNovedades");
        }
    } catch (err) {
        console.log("No se pudo obtener el historial de novedades:", err);
    }
}

document.addEventListener('DOMContentLoaded', verificarNovedades);

request.onsuccess = e => {
    db = e.target.result;
    inicializarFechaHoy();
    cargarTabla();
    vincularEventosBotonCuadrilla();
};

request.onupgradeneeded = e => {
    const dbInstance = e.target.result;
    if (!dbInstance.objectStoreNames.contains("inspecciones")) {
        dbInstance.createObjectStore("inspecciones", { keyPath: "id", autoIncrement: true });
    }
    if (!dbInstance.objectStoreNames.contains("configuracion")) {
        dbInstance.createObjectStore("configuracion", { keyPath: "fecha" });
    }
};

let cuadrillaPressTimer;
let isLongPress = false;
let activeRecordId = null;
let fechaActual = ""; 
let inspectoresActuales = []; 
let callesExistentes = new Set();

/* ==========================================================================
   MOTOR DE CÁLCULO TÉCNICO (Especificación Matemática)
   ========================================================================== */
function calcularMetricaVolumen(datos) {
    const A_terreno = parseFloat(datos.aTerreno) || 0;
    const A_huella = parseFloat(datos.aHuella) || 0;
    const N_p = parseInt(datos.nPisos) || 0;
    const N_s = parseInt(datos.nSotanos) || 0;
    const A_sot_ext = parseFloat(datos.aSotExt) || 0;
    const alpha = parseFloat(datos.clasificacionTerreno) || 0.12;

    const I_m3 = 0.30;       // Índice de generación (m³/m²)
    const F_e = 1.40;        // Factor de Esponjamiento (40%)
    const I_global = I_m3 * F_e; // 0.42 m³/m²
    const C_camion = 12.0;   // Capacidad predeterminada del camión (m³)

    // Paso 1: Cálculo del Área Exterior Libre
    let A_ext_libre = A_terreno - A_huella - A_sot_ext;
    if (A_ext_libre < 0) A_ext_libre = 0;

    // Paso 2: Determinación del Neq Exacto y Redondeo Ceil
    let termSotanoExt = A_huella > 0 ? (A_sot_ext * N_s) / A_huella : 0;
    let termTerrenoLibre = A_huella > 0 ? (A_ext_libre / A_huella) * alpha : 0;

    const Neq_exacto = (N_p + N_s) + termSotanoExt + termTerrenoLibre;
    const Neq_final = Math.ceil(Neq_exacto);

    // Paso 3: Cálculo del Volumen Total Suelto (Ve)
    const Ve = A_huella * Neq_final * I_global;

    // Paso 4: Logística de Transporte (Viajes)
    const N_viajes = Math.ceil(Ve / C_camion);

    return {
        A_ext_libre: A_ext_libre.toFixed(2),
        Neq_exacto: Neq_exacto.toFixed(2),
        Neq_final: Neq_final,
        Ve: Ve.toFixed(1),
        N_viajes: N_viajes,
        I_global: I_global.toFixed(2)
    };
}

function generarNotaCampo125(r, calc) {
    // Genera una cadena formateada restringida estrictamente a <= 125 caracteres
    const nota = `Parc ${r.aTerreno}m2; Prin (${r.nPisos}P+${r.nSotanos}S)=${r.aHuella}m2, Ext(a=${r.clasificacionTerreno}). Neq=${calc.Neq_final}. Vol=${calc.Ve}m3 (${r.aHuella}x${calc.Neq_final}x${calc.I_global}).`;
    return nota.length > 125 ? nota.substring(0, 125) : nota;
}

/* ==========================================================================
   GESTIÓN DE DÍAS Y CONFIGURACIÓN
   ========================================================================== */
function inicializarFechaHoy() {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    fechaActual = `${year}-${month}-${day}`;
    document.getElementById("filterDate").value = fechaActual;
    comprobarConfiguracionFecha(fechaActual);
}

function cambiarFechaActiva() {
    fechaActual = document.getElementById("filterDate").value;
    comprobarConfiguracionFecha(fechaActual);
    cargarTabla();
}

function comprobarConfiguracionFecha(fecha, callback) {
    if (!db) return;
    const transaction = db.transaction(["configuracion"], "readonly");
    const store = transaction.objectStore("configuracion");
    const requestGet = store.get(fecha);

    requestGet.onsuccess = e => {
        const config = e.target.result;
        if (config) {
            inspectoresActuales = config.inspectores || [];
            if (callback) callback(true);
        } else {
            buscarUltimaConfiguracion(fecha, callback);
        }
    };
    requestGet.onerror = () => {
        if (callback) callback(false);
    };
}

function buscarUltimaConfiguracion(fechaDestino, callback) {
    const transaction = db.transaction(["configuracion"], "readonly");
    const store = transaction.objectStore("configuracion");
    const requestCursor = store.openCursor(null, "prev");

    requestCursor.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
            const ultimaConfig = cursor.value;
            const nuevaConfig = {
                fecha: fechaDestino,
                grupo: ultimaConfig.grupo,
                coordinador: ultimaConfig.coordinador || "",
                parroquia: ultimaConfig.parroquia,
                inspectores: ultimaConfig.inspectores,
                mostrarCertificado: ultimaConfig.mostrarCertificado !== undefined ? ultimaConfig.mostrarCertificado : true
            };

            const writeTrans = db.transaction(["configuracion"], "readwrite");
            const writeStore = writeTrans.objectStore("configuracion");
            writeStore.put(nuevaConfig).onsuccess = () => {
                inspectoresActuales = nuevaConfig.inspectores;
                mostrarToast("📋 Copiado equipo de trabajo anterior");
                if (callback) callback(true);
            };
        } else {
            inspectoresActuales = [];
            if (callback) callback(false);
        }
    };
    requestCursor.onerror = () => {
        inspectoresActuales = [];
        if (callback) callback(false);
    };
}

function vincularEventosBotonCuadrilla() {
    const btnCuadrilla = document.getElementById("btnDatosCuadrilla");
    if (!btnCuadrilla) return;

    const iniciarPresionCuadrilla = () => {
        isLongPress = false;
        cuadrillaPressTimer = setTimeout(() => {
            isLongPress = true;
            abrirModal("modalSincronizacion");
        }, 1200); 
    };

    const cancelarPresionCuadrilla = () => clearTimeout(cuadrillaPressTimer);

    const ejecutarClicCuadrilla = () => {
        clearTimeout(cuadrillaPressTimer);
        if (!isLongPress) {
            mostrarConfiguracion();
        }
    };

    btnCuadrilla.addEventListener("touchstart", iniciarPresionCuadrilla, { passive: true });
    btnCuadrilla.addEventListener("touchend", ejecutarClicCuadrilla);
    btnCuadrilla.addEventListener("touchmove", cancelarPresionCuadrilla, { passive: true });

    btnCuadrilla.addEventListener("mousedown", iniciarPresionCuadrilla);
    btnCuadrilla.addEventListener("mouseup", ejecutarClicCuadrilla);
    btnCuadrilla.addEventListener("mouseleave", cancelarPresionCuadrilla);
}

function renderizarListaInspectores() {
    const contenedor = document.getElementById("lstInspectores");
    if (!contenedor) return;
    contenedor.innerHTML = "";
    inspectoresActuales.forEach((ins, idx) => {
        const div = document.createElement("div");
        div.className = "inspector-row";
        div.innerHTML = `
            <span>👤 ${ins}</span>
            <button type="button" class="btn-icon" style="color:red;" onclick="eliminarInspectorTemporal(${idx})">❌</button>
        `;
        contenedor.appendChild(div);
    });
}

function agregarInspectorNavegacion() {
    const input = document.getElementById("txtNewInspector");
    const nombre = input.value.trim();
    if (nombre) {
        inspectoresActuales.push(nombre);
        input.value = "";
        renderizarListaInspectores();
    }
}

function eliminarInspectorTemporal(idx) {
    inspectoresActuales.splice(idx, 1);
    renderizarListaInspectores();
}

function mostrarConfiguracion() {
    document.getElementById("configForm").reset();
    if (!db) {
        renderizarListaInspectores();
        document.getElementById("viewMain").classList.remove("active");
        document.getElementById("viewConfig").classList.add("active");
        return;
    }

    const transaction = db.transaction(["configuracion"], "readonly");
    const store = transaction.objectStore("configuracion");
    store.get(fechaActual).onsuccess = e => {
        const config = e.target.result;
        if (config) {
            document.getElementById("cfgGrupo").value = config.grupo || "";
            document.getElementById("cfgCoordinador").value = config.coordinador || "";
            document.getElementById("cfgParroquia").value = config.parroquia || "";
            document.getElementById("cfgMostrarCertificado").checked = config.mostrarCertificado !== undefined ? config.mostrarCertificado : true;
            inspectoresActuales = config.inspectores || [];
        } else {
            inspectoresActuales = [];
            document.getElementById("cfgMostrarCertificado").checked = true;
        }
        renderizarListaInspectores();
    };
    document.getElementById("viewMain").classList.remove("active");
    document.getElementById("viewConfig").classList.add("active");
}

function guardarConfiguracion(e) {
    e.preventDefault();
    const grupo = document.getElementById("cfgGrupo").value.trim();
    const coordinador = document.getElementById("cfgCoordinador").value.trim();
    const parroquia = document.getElementById("cfgParroquia").value.trim();
    const mostrarCertificado = document.getElementById("cfgMostrarCertificado").checked;

    if (inspectoresActuales.length === 0) {
        alert("⚠️ Debe agregar al menos un inspector al equipo de trabajo.");
        return;
    }

    const configObject = {
        fecha: fechaActual,
        grupo,
        coordinador,
        parroquia,
        inspectores: inspectoresActuales,
        mostrarCertificado
    };

    const transaction = db.transaction(["configuracion"], "readwrite");
    const store = transaction.objectStore("configuracion");
    store.put(configObject).onsuccess = () => {
        mostrarToast("✅ Configuración guardada");
        comprobarConfiguracionFecha(fechaActual);
        regresarPrincipal();
    };
}

/* ==========================================================================
   FORMULARIO Y SELECCIÓN DE COMPLEJIDAD
   ========================================================================== */
// Reescritura limpia de selección de complejidad
function seleccionarComplejidad(elemento) {
    const botones = document.querySelectorAll('#grupoComplejidad .btn-complejidad');
    botones.forEach(btn => btn.classList.remove('active'));

    elemento.classList.add('active');
    const valorAlfa = elemento.getAttribute('data-value');
    document.getElementById('clasificacionTerreno').value = valorAlfa;
    
    // Disparo inmediato de la reactividad
    calcularEvidenciasEnVivo();
}

function intentarNuevaInspeccion() {
    comprobarConfiguracionFecha(fechaActual, (configurada) => {
        if (configurada) {
            mostrarFormulario();
        } else {
            alert("⚠️ Debe configurar el equipo de trabajo antes de registrar inspecciones.");
            mostrarConfiguracion();
        }
    });
}

function mostrarFormulario(idEdit = null) {
    document.getElementById("inspeccionForm").reset();
    document.getElementById("editId").value = "";
    document.getElementById("txtNombre").value = "";
    document.getElementById("txtComentarios").value = "";
    
    document.getElementById("prevFrente").style.display = "none";
    document.getElementById("prevFrente").src = "";
    document.getElementById("prevFrente").closest('.photo-uploader').classList.remove('photo-loaded');
    document.getElementById("fileFrenteCamara").value = "";
    document.getElementById("fileFrenteGaleria").value = "";
    
    document.getElementById("prevRespaldo").style.display = "none";
    document.getElementById("prevRespaldo").src = "";
    document.getElementById("prevRespaldo").closest('.photo-uploader').classList.remove('photo-loaded');
    document.getElementById("fileRespaldoCamara").value = "";
    document.getElementById("fileRespaldoGaleria").value = "";

    actualizarDatalistCalles();

    if (idEdit) {
        document.getElementById("formTitle").innerText = "Editar Volumen";
        document.getElementById("editId").value = idEdit;
        
        const transaction = db.transaction(["inspecciones"], "readonly");
        const store = transaction.objectStore("inspecciones");
        store.get(Number(idEdit)).onsuccess = e => {
            const r = e.target.result;
            if (r) {
                document.getElementById("txtCalle").value = r.calle || "";
                document.getElementById("txtEdificio").value = r.edificio || "";
                document.getElementById("txtNombre").value = r.nombre || "";
                document.getElementById("aTerreno").value = r.aTerreno || 0;
                document.getElementById("aHuella").value = r.aHuella || 0;
                document.getElementById("nPisos").value = r.nPisos || 0;
                document.getElementById("nSotanos").value = r.nSotanos || 0;
                document.getElementById("aSotExt").value = r.aSotExt || 0;
                
                const valorAlfa = r.clasificacionTerreno || "0.12";
                document.getElementById("clasificacionTerreno").value = valorAlfa;
                document.querySelectorAll('#grupoComplejidad .btn-complejidad').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-value') === valorAlfa);
                });

                document.getElementById("txtComentarios").value = r.comentarios || "";
                
                if (r.fotoFrente) {
                    document.getElementById("prevFrente").src = r.fotoFrente;
                    document.getElementById("prevFrente").style.display = "block";
                    document.getElementById("prevFrente").closest('.photo-uploader').classList.add('photo-loaded');
                }
                if (r.fotoRespaldo) {
                    document.getElementById("prevRespaldo").src = r.fotoRespaldo;
                    document.getElementById("prevRespaldo").style.display = "block";
                    document.getElementById("prevRespaldo").closest('.photo-uploader').classList.add('photo-loaded');
                }

                const calc = calcularMetricaVolumen(r);
                ultimaNotaGenerada = generarNotaCampo125(r, calc);
                
                calcularEvidenciasEnVivo();
            }
        };
    } else {
        document.getElementById("formTitle").innerText = "Nuevo Volumen";
        document.getElementById("clasificacionTerreno").value = "0.12";
        document.querySelectorAll('#grupoComplejidad .btn-complejidad').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === "0.12");
        });
        
        ultimaNotaGenerada = "";
        calcularEvidenciasEnVivo();
    }

    document.getElementById("viewMain").classList.remove("active");
    document.getElementById("viewForm").classList.add("active");
}

function regresarPrincipal() {
    document.getElementById("viewForm").classList.remove("active");
    document.getElementById("viewConfig").classList.remove("active");
    document.getElementById("viewMain").classList.add("active");
}

function procesarImagen(input, idPreview) {
    const file = input.files[0];
    const preview = document.getElementById(idPreview);
    const uploaderDiv = input.closest('.photo-uploader');

    if (!file) {
        preview.style.display = "none";
        preview.src = "";
        if (uploaderDiv) uploaderDiv.classList.remove('photo-loaded');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const maxDimension = 1280;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
            
            preview.src = dataUrl;
            preview.style.display = "block";
            if (uploaderDiv) uploaderDiv.classList.add('photo-loaded');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function eliminarFotoForm(target) {
    const img = document.getElementById("prev" + target);
    if (img) {
        img.src = "";
        img.style.display = "none";

        const uploader = img.closest('.photo-uploader');
        if (uploader) uploader.classList.remove('photo-loaded');

        document.getElementById('file' + target + 'Camara').value = "";
        document.getElementById('file' + target + 'Galeria').value = "";

        mostrarToast("🗑️ Imagen eliminada");
    }
}

function descargarFotoDetalle(id, tipo) {
    const transaction = db.transaction(["inspecciones"], "readonly");
    const store = transaction.objectStore("inspecciones");
    store.get(Number(id)).onsuccess = e => {
        const r = e.target.result;
        if (!r) return;
        const src = tipo === 'Frente' ? r.fotoFrente : r.fotoRespaldo;
        const numFoto = tipo === 'Frente' ? 1 : 2;
        descargarImagen(src, r.edificio, numFoto);
    };
}

function descargarImagen(dataUrl, edificioNombre, numFoto) {
    if (!dataUrl || !dataUrl.startsWith("data:")) return;

    let yymmdd = "";
    if (fechaActual && fechaActual.includes("-")) {
        const partes = fechaActual.split("-");
        yymmdd = `${partes[0].slice(-2)}${partes[1]}${partes[2]}`;
    } else {
        const hoy = new Date();
        yymmdd = `${hoy.getFullYear().toString().slice(-2)}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
    }

    const edifStr = (edificioNombre || "Edificacion").trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    const nombreArchivo = `${yymmdd}_${edifStr}_Foto${numFoto}.jpg`;

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    mostrarToast("💾 Foto guardada");
}

function actualizarDatalistCalles() {
    const datalist = document.getElementById("listaCalles");
    if (!datalist) return;
    datalist.innerHTML = "";
    callesExistentes.forEach(calle => {
        const option = document.createElement("option");
        option.value = calle;
        datalist.appendChild(option);
    });
}

function guardarFormulario(e) {
    e.preventDefault();
    const editId = document.getElementById("editId").value;
    const calle = document.getElementById("txtCalle").value.trim();
    const edificio = document.getElementById("txtEdificio").value.trim();
    const nombre = document.getElementById("txtNombre").value.trim();
    
    const aTerreno = parseFloat(document.getElementById("aTerreno").value) || 0;
    const aHuella = parseFloat(document.getElementById("aHuella").value) || 0;
    const nPisos = parseInt(document.getElementById("nPisos").value) || 0;
    const nSotanos = parseInt(document.getElementById("nSotanos").value) || 0;
    const aSotExt = parseFloat(document.getElementById("aSotExt").value) || 0;
    const clasificacionTerreno = document.getElementById("clasificacionTerreno").value;
    const comentarios = document.getElementById("txtComentarios").value.trim();

    const fotoFrente = document.getElementById("prevFrente").src.startsWith("data:") ? document.getElementById("prevFrente").src : null;
    const fotoRespaldo = document.getElementById("prevRespaldo").src.startsWith("data:") ? document.getElementById("prevRespaldo").src : null;

    const registro = {
        fecha: fechaActual, 
        calle,
        edificio,
        nombre,
        aTerreno,
        aHuella,
        nPisos,
        nSotanos,
        aSotExt,
        clasificacionTerreno,
        color: "Verde",
        comentarios,
        fotoFrente,
        fotoRespaldo
    };

    const transaction = db.transaction(["inspecciones"], "readwrite");
    const store = transaction.objectStore("inspecciones");

    if (editId) {
        registro.id = Number(editId);
        store.put(registro).onsuccess = () => {
            mostrarToast("✅ Registro actualizado");
            regresarPrincipal();
            cargarTabla();
        };
    } else {
        store.add(registro).onsuccess = () => {
            mostrarToast("✅ Registro guardado");
            regresarPrincipal();
            cargarTabla();
        };
    }
}

/* ==========================================================================
   VISUALIZACIÓN Y RESULTADOS
   ========================================================================== */
function cargarTabla() {
    const tbody = document.getElementById("listaVolumenesBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    callesExistentes.clear();

    if (!db) return;

    const transaction = db.transaction(["inspecciones"], "readonly");
    const store = transaction.objectStore("inspecciones");
    const requestGetAll = store.getAll();
    
    requestGetAll.onsuccess = function(event) {
        const registros = event.target.result || [];

        for (let i = registros.length - 1; i >= 0; i--) {
            const r = registros[i];
            if (r.calle && r.calle.trim() !== "") {
                callesExistentes.add(r.calle.trim());
            }
        }

        registros.forEach(r => {
            if (r.fecha === fechaActual) {
                const tr = document.createElement("tr");
                tr.dataset.id = r.id;
                tr.className = "row-verde";

                const calc = calcularMetricaVolumen(r);

                tr.innerHTML = `
                    <td class="col-calle" title="${r.calle}">${r.calle}</td>
                    <td>${r.edificio}</td>
                    <td style="text-align: center; font-weight: bold; color: #2e7d32;">${calc.Ve} m³</td>
                    <td style="text-align: center; padding: 2px;">
                        <button class="btn-dots" onclick="lanzarMenuOpciones(event, ${r.id})">⋮</button>
                    </td>
                `;
                
                tbody.appendChild(tr);
            }
        });

        actualizarDatalistCalles();
    };
}

/* ==========================================================================
   ACTUALIZACIÓN REACTIVA (EVIDENCIAS + CADENA RESUMIDA AUTOMÁTICA)
   ========================================================================== */

//let ultimaNotaGenerada = "";

function calcularEvidenciasEnVivo() {
    const datos = {
        aTerreno: document.getElementById("aTerreno")?.value || 0,
        aHuella: document.getElementById("aHuella")?.value || 0,
        nPisos: document.getElementById("nPisos")?.value || 0,
        nSotanos: document.getElementById("nSotanos")?.value || 0,
        aSotExt: document.getElementById("aSotExt")?.value || 0,
        clasificacionTerreno: document.getElementById("clasificacionTerreno")?.value || "0.12"
    };

    const calc = calcularMetricaVolumen(datos);

    // 1. Actualizar las Evidencias en pantalla
    if (document.getElementById("lblAext")) document.getElementById("lblAext").innerText = calc.A_ext_libre;
    if (document.getElementById("lblNeqExacto")) document.getElementById("lblNeqExacto").innerText = calc.Neq_exacto;
    if (document.getElementById("lblNeqFinal")) document.getElementById("lblNeqFinal").innerText = calc.Neq_final;
    if (document.getElementById("lblVe")) document.getElementById("lblVe").innerText = calc.Ve;
    if (document.getElementById("lblViajes")) document.getElementById("lblViajes").innerText = calc.N_viajes;

    // 2. Forzar la actualización directa del comentario
    actualizarComentarioAutomatico(datos, calc);
}

function actualizarComentarioAutomatico(datos, calc) {
    const txtArea = document.getElementById("txtComentarios");
    if (!txtArea) return;

    const nuevaNota = generarNotaCampo125(datos, calc);

    // Si no se ha guardado una nota previa en el dataset del elemento, la inicializamos
    if (!txtArea.dataset.ultimaNota) {
        txtArea.dataset.ultimaNota = "";
    }

    const notaAnterior = txtArea.dataset.ultimaNota;
    const valorActual = txtArea.value;

    // Si está vacío, o si el contenido es idéntico a la nota anterior, reemplazamos 100%
    if (valorActual.trim() === "" || valorActual === notaAnterior) {
        txtArea.value = nuevaNota;
    } else if (valorActual.startsWith(notaAnterior)) {
        // Preservar texto extra que el usuario haya redactado al final
        const textoExtra = valorActual.substring(notaAnterior.length);
        txtArea.value = nuevaNota + textoExtra;
    }

    // Guardar la nueva nota generada en el dataset del DOM
    txtArea.dataset.ultimaNota = nuevaNota;
}


function verDetalleInspeccion(id) {
    const transaction = db.transaction(["inspecciones"], "readonly");
    const store = transaction.objectStore("inspecciones");
    store.get(id).onsuccess = e => {
        const r = e.target.result;
        if (!r) return;

        const calc = calcularMetricaVolumen(r);
        const nota125 = generarNotaCampo125(r, calc);

        document.getElementById("detTitle").innerText = `${r.calle} | ${r.edificio}`;

        let htmlFotos = "";
        if (r.fotoFrente || r.fotoRespaldo) {
            htmlFotos = `<p style="font-size:0.75rem; color:#666; text-align:center; margin-top:8px; margin-bottom: 2px;">🔍 Toca una imagen para ampliar</p>`;
            htmlFotos += `<div class="detail-photos">`;
            if (r.fotoFrente) {
                htmlFotos += `<div style="display:flex; flex-direction:column; gap:4px;">
                    <strong>Fachada:</strong>
                    <img src="${r.fotoFrente}" onclick="abrirZoom(this)">
                    <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 0.8rem; border: 1px solid #ccc;" onclick="descargarFotoDetalle('${r.id}', 'Frente')">💾 Guardar foto</button>
                </div>`;
            }
            if (r.fotoRespaldo) {
                htmlFotos += `<div style="display:flex; flex-direction:column; gap:4px;">
                    <strong>Detalle:</strong>
                    <img src="${r.fotoRespaldo}" onclick="abrirZoom(this)">
                    <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 0.8rem; border: 1px solid #ccc;" onclick="descargarFotoDetalle('${r.id}', 'Respaldo')">💾 Guardar foto</button>
                </div>`;
            }
            htmlFotos += `</div>`;
        }

        let htmlComentarios = r.comentarios ? `<p style="margin-top:8px;"><strong>Comentarios:</strong><br><span style="white-space: pre-line; color:#444;">${r.comentarios}</span></p>` : "";

        document.getElementById("detBody").innerHTML = `
            <div style="background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
                <p style="margin:0; font-size: 1.1rem; color: #1b5e20;"><strong>📊 Volumen Suelto ($V_e$):</strong> ${calc.Ve} m³</p>
                <p style="margin:4px 0 0 0; font-size: 0.95rem;"><strong>🚚 Fletes Estimados:</strong> ${calc.N_viajes} viajes (12m³)</p>
                <p style="margin:4px 0 0 0; font-size: 0.9rem;"><strong>🏢 $N_{eq}$ Ajustado:</strong> ${calc.Neq_final} (${calc.Neq_exacto} exacto)</p>
            </div>

            <p><strong>Manzana/Sector:</strong> ${r.calle} | <strong>Parcela:</strong> ${r.edificio}</p>
            <p><strong>Área Terreno:</strong> ${r.aTerreno || 0} m² | <strong>Huella:</strong> ${r.aHuella || 0} m²</p>
            <p><strong>Ext. Libre:</strong> ${calc.A_ext_libre} m² (α = ${r.clasificacionTerreno || "0.12"})</p>
            <p><strong>Pisos:</strong> ${r.nPisos || 0} | <strong>Sótanos:</strong> ${r.nSotanos || 0} | <strong>Sót. Ext:</strong> ${r.aSotExt || 0} m²</p>
            
            <div style="margin-top: 10px; padding: 8px; background: #f5f5f5; border-radius: 6px; font-size: 0.8rem;">
                <strong>📋 Nota Corta (Copiar):</strong>
                <p id="txtNota125" style="margin: 4px 0; font-family: monospace; color: #333;">${nota125}</p>
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; margin-top: 4px;" onclick="copiarNotaCampo('${nota125}')">📋 Copiar Nota de Campo</button>
            </div>

            ${htmlComentarios}
            ${htmlFotos}
        `;
        abrirModal("modalDetalles");
    };
}

function copiarNotaCampo(texto) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(texto).then(() => {
            mostrarToast("📋 Nota copiada al portapapeles");
        });
    } else {
        mostrarToast("📋 " + texto);
    }
}

function abrirZoom(elementoImg) {
    if (!elementoImg || !elementoImg.src) return;
    const modal = document.getElementById("modalZoom");
    const imgZoomed = document.getElementById("imgZoomed");
    imgZoomed.src = elementoImg.src;
    modal.style.display = "flex";
}

function cerrarZoom() { document.getElementById("modalZoom").style.display = "none"; }

function lanzarMenuOpciones(event, id) {
    if (event) event.stopPropagation();
    activeRecordId = id;
    
    const transaction = db.transaction(["inspecciones"], "readonly");
    const store = transaction.objectStore("inspecciones");
    store.get(id).onsuccess = e => {
        const r = e.target.result;
        if (r) {
            document.getElementById("menuTargetText").innerText = `${r.calle} - ${r.edificio}`;
            
            document.getElementById("btnMenuResumen").onclick = () => {
                cerrarModal("modalMenu");
                verDetalleInspeccion(id);
            };
            document.getElementById("btnMenuEditar").onclick = () => {
                cerrarModal("modalMenu");
                mostrarFormulario(id);
            };
            document.getElementById("btnMenuEliminar").onclick = () => {
                cerrarModal("modalMenu");
                eliminarRegistro(id);
            };
            abrirModal("modalMenu");
        }
    };
}

function eliminarRegistro(id) {
    if (confirm("¿Seguro que deseas eliminar este registro?")) {
        const transaction = db.transaction(["inspecciones"], "readwrite");
        const store = transaction.objectStore("inspecciones");
        store.delete(id).onsuccess = () => {
            mostrarToast("🗑️ Registro eliminado");
            cargarTabla();
        };
    }
}

function compartirOEnviarReporte() {
    const configTrans = db.transaction(["configuracion"], "readonly");
    const configStore = configTrans.objectStore("configuracion");
    
    configStore.get(fechaActual).onsuccess = e => {
        const config = e.target.result;
        if (!config) {
            alert("⚠️ Primero debe configurar el equipo de trabajo para este día.");
            return;
        }

        const insTrans = db.transaction(["inspecciones"], "readonly");
        const insStore = insTrans.objectStore("inspecciones");
        
        insStore.getAll().onsuccess = event => {
            const registros = event.target.result.filter(r => r.fecha === fechaActual);
            if (registros.length === 0) {
                mostrarToast("⚠️ No hay registros hoy.");
                return;
            }

            let rStr = `📝 *REPORTE DE VOLÚMENES Y FLETES*\n`;
            const partesFecha = fechaActual.split("-");
            const fechaFormateada = `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}`;
            
            rStr += `Fecha: ${fechaFormateada}\n`;
            rStr += `Grupo: ${config.grupo}\n`;
            rStr += `Parroquia: ${config.parroquia}\n`;
            rStr += `====================\n`;

            let volTotal = 0;
            let viajesTotales = 0;

            registros.forEach(r => {
                const calc = calcularMetricaVolumen(r);
                volTotal += parseFloat(calc.Ve);
                viajesTotales += calc.N_viajes;
                rStr += `🟢 *${r.calle}* - ${r.edificio} | Vol: ${calc.Ve}m³ (${calc.N_viajes} viajes)\n`;
            });

            rStr += `\n*TOTAL VOLUMEN: ${volTotal.toFixed(1)} m³*\n`;
            rStr += `*TOTAL FLETES (12m³): ${viajesTotales} viajes*\n`;
            rStr += `====================\n`;
            rStr += `Coordinador: ${config.coordinador || 'N/A'}\n`;
            rStr += `Inspectores:\n` + config.inspectores.join("\n");

            if (navigator.share) {
                navigator.share({ title: `Reporte Volúmenes ${fechaFormateada}`, text: rStr })
                .then(() => mostrarToast("✅ Reporte Compartido"))
                .catch(err => console.log("Compartir cancelado:", err));
            } else {
                navigator.clipboard.writeText(rStr).then(() => {
                    mostrarToast("✅ Reporte Copiado");
                }).catch(() => alert("Error al copiar texto."));
            }
        };
    };
}        

function confirmarReiniciarDia() {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const hoyStr = `${year}-${month}-${day}`;

    if (fechaActual === hoyStr) {
        alert("Ya se encuentra trabajando en la fecha del día de hoy.");
        return;
    }

    if (confirm(`¿Desea cambiar la fecha de trabajo al día de hoy (${day}/${month}/${year})?`)) {
        fechaActual = hoyStr;
        document.getElementById("filterDate").value = fechaActual;
        comprobarConfiguracionFecha(fechaActual);
        cargarTabla();
        mostrarToast("🔄 Cambiado al día actual");
    }
}

function copiarComentarios() {
    const txtArea = document.getElementById('txtComentarios');
    const texto = txtArea.value.trim();

    if (!texto) {
        mostrarToast("⚠️ El campo de observaciones está vacío");
        return;
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(texto).then(() => {
            mostrarToast("📋 Observaciones copiadas");
        }).catch(() => {
            txtArea.select();
            document.execCommand("copy");
            mostrarToast("📋 Observaciones copiadas");
        });
    } else {
        txtArea.select();
        document.execCommand("copy");
        mostrarToast("📋 Observaciones copiadas");
    }
}

function descargarJSONLocalmente(blob, nombre) {
    const lnk = document.createElement("a");
    lnk.download = nombre;
    lnk.href = URL.createObjectURL(blob);
    document.body.appendChild(lnk);
    lnk.click();
    document.body.removeChild(lnk);
    mostrarToast("📥 Archivo guardado con éxito.");
}

function exportarDataJSONPorEmail() {
    if (!db) return;
    cerrarModal("modalSincronizacion");
    
    const exportData = { inspecciones: [], configuraciones: [] };
    const tx = db.transaction(["inspecciones", "configuracion"], "readonly");
    
    tx.objectStore("inspecciones").getAll().onsuccess = e => { exportData.inspecciones = e.target.result; };
    tx.objectStore("configuracion").getAll().onsuccess = e => { exportData.configuraciones = e.target.result; };

    tx.oncomplete = () => {
        const jsonString = JSON.stringify(exportData);
        const blob = new Blob([jsonString], { type: "application/json" });
        descargarJSONLocalmente(blob, `DATA_VOLUMENES_${fechaActual}.json`);
    };
}

function exportarJornadaWhatsApp() {
    if (!db) return;
    cerrarModal("modalSincronizacion");
    
    const tx = db.transaction(["inspecciones", "configuracion"], "readonly");
    let dataInspecciones = [];
    let parametrosConfig = null;
    
    tx.objectStore("inspecciones").getAll().onsuccess = e => { dataInspecciones = e.target.result; };
    tx.objectStore("configuracion").get(fechaActual).onsuccess = e => { parametrosConfig = e.target.result; };

    tx.oncomplete = () => {
        parametrosConfig = parametrosConfig || { grupo: "No registrado", inspectores: ["No registrado"] };
        const grupo = parametrosConfig.grupo || "No registrado";
        
        const jsonStr = JSON.stringify(dataInspecciones);
        const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));
        
        const mensajeTexto = `📊 *REPORTE DE VOLÚMENES*\n📅 *Fecha:* ${fechaActual}\n👥 *Grupo:* ${grupo}\n\nDATA_CUADRILLA_${base64Data}`;
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensajeTexto)}`;
        window.open(whatsappUrl, '_blank');
    };
}

async function importarJornadaPortapapeles() {
    cerrarModal("modalSincronizacion");
    try {
        const text = await navigator.clipboard.readText();
        if (!text.includes("DATA_CUADRILLA_")) {
            alert("⚠️ Texto no contiene datos válidos.");
            return;
        }
        
        const bloqueCodificado = text.split("DATA_CUADRILLA_")[1].trim();
        const jsonStr = decodeURIComponent(escape(atob(bloqueCodificado)));
        const dataInspecciones = JSON.parse(jsonStr);

        const tx = db.transaction(["inspecciones"], "readwrite");
        const storeIns = tx.objectStore("inspecciones");
        
        storeIns.getAll().onsuccess = ev => {
            const existentes = ev.target.result;
            let agregados = 0;

            dataInspecciones.forEach(nueva => {
                const esDuplicado = existentes.some(ext => 
                    ext.fecha === nueva.fecha &&
                    ext.calle.trim().toLowerCase() === nueva.calle.trim().toLowerCase() &&
                    ext.edificio.trim().toLowerCase() === nueva.edificio.trim().toLowerCase()
                );

                if (!esDuplicado) {
                    delete nueva.id; 
                    storeIns.add(nueva);
                    agregados++;
                }
            });

            tx.oncomplete = () => {
                alert(`📊 Importación Completada:\n• Registros nuevos: ${agregados}`);
                cargarTabla();
            };
        };
    } catch (err) {
        console.error(err);
        alert("❌ Error al leer del portapapeles.");
    }
}

function importarDataJSON(input) {
    const file = input.files[0];
    if (!file) return;
    cerrarModal("modalSincronizacion");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const dataImportada = JSON.parse(e.target.result);
            const tx = db.transaction(["inspecciones", "configuracion"], "readwrite");
            const storeIns = tx.objectStore("inspecciones");
            const storeCfg = tx.objectStore("configuracion");

            if (dataImportada.configuraciones) {
                dataImportada.configuraciones.forEach(cfg => storeCfg.put(cfg));
            }

            if (dataImportada.inspecciones) {
                dataImportada.inspecciones.forEach(nueva => {
                    delete nueva.id;
                    storeIns.add(nueva);
                });
            }

            tx.oncomplete = () => {
                alert("📊 Sincronización JSON Exitosa");
                input.value = "";
                comprobarConfiguracionFecha(fechaActual);
                cargarTabla();
            };
        } catch (err) {
            alert("❌ Error crítico al leer el archivo JSON.");
        }
    };
    reader.readAsText(file);
}

function eliminarTodoElHistorialDB() {
    if (confirm("⚠️ ¿Desea eliminar la base de datos completa?")) {
        const trans1 = db.transaction(["inspecciones"], "readwrite").objectStore("inspecciones").clear();
        const trans2 = db.transaction(["configuracion"], "readwrite").objectStore("configuracion").clear();
        trans1.onsuccess = trans2.onsuccess = () => {
            alert("🧹 Base de Datos limpiada.");
            window.location.reload();
        };
    }
}

function abrirModal(id) { document.getElementById(id).style.display = "flex"; }
function cerrarModal(id) { document.getElementById(id).style.display = "none"; }
function mostrarToast(msg) {
    const toast = document.getElementById("toast");
    toast.innerText = msg;
    toast.style.opacity = "1";
    setTimeout(() => toast.style.opacity = "0", 2500);
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(reg => console.log('Service Worker registrado:', reg.scope))
            .catch(err => console.error('Error Service Worker:', err));
    });
}