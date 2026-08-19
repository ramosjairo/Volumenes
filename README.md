# 📦 Volúmenes Escombros — PWA de Estimación de Volúmenes y Logística

**Volúmenes Escombros** es una Aplicación Web Progresiva (PWA) diseñada para el cálculo rápido en campo de áreas, volúmenes sueltos y compactados de escombros, así como la estimación de logística de fletes para inspecciones de terrenos y edificaciones.

---

## 🚀 Características Principales

* **Cálculo Dinámico e Inmediato:** Ajuste en tiempo real de volúmenes ($V_c$ y $V_s$) al modificar cualquier parámetro de entrada o el porcentaje de esponjamiento.
* **Procesamiento Offline (PWA):** Funciona totalmente sin conexión a internet mediante IndexedDB y Service Workers.
* **Evidencias de Cálculos:** Desglose transparente en 5 pasos clave dentro del formulario.
* **Generación de Comentarios:** Generación y sobrescritura automática de notas de campo breves para copiar al portapapeles.
* **Gestión de Inspecciones:** Registro por Manzana/Sector y Parcela/Edificación con soporte para captura de fotografías de fachada y detalle.
* **Sincronización de Cuadrilla:** Exportación e importación rápida de jornadas mediante código JSON y WhatsApp.

---

## 📐 Memoria Técnica de Cálculo

El sistema utiliza un modelo matemático parametrizado para estimar la cantidad de escombros y la logística requerida en camiones de $12\text{ m}^3$:

### 1. Área Exterior Libre ($A_{\text{ext}}$)
Calcula la superficie de terreno no ocupada por la huella de la edificación:
$$A_{\text{ext}} = \max(0, A_{\text{terreno}} - A_{\text{huella}})$$

### 2. Número Equivalente de Pisos ($N_{\text{eq}}$)
Pondera el total de niveles (pisos sobre nivel $N_p$ y sótanos $N_s$) según la complejidad visual del terreno exterior ($\alpha$):
$$N_{\text{eq exacto}} = (N_p + N_s) \cdot \alpha$$
$$N_{\text{eq final}} = \lceil N_{\text{eq exacto}} \rceil$$

*Donde $\alpha$ varía según el tipo de terreno:*
* **Liviano ($\alpha = 0.12$):** Patios planos, aceras, grama.
* **Moderado ($\alpha = 0.20$):** Canchas, brocales, asfalto.
* **Pesado ($\alpha = 0.28$):** Piscinas, muros altos, sótanos extendidos.
* **Pesado Superior ($\alpha = 0.30$):** Estructuras de gran envergadura.

### 3. Volumen Compactado ($V_c$)
Estima el volumen consolidado del material antes de la remoción:
$$V_c = A_{\text{huella}} \cdot N_{\text{eq final}}$$

### 4. Factor de Esponjamiento ($F_e$)
Convierte el porcentaje de expansión del material ($\%_{\text{esponjamiento}}$) ingresado en la app en un factor decimal:
$$F_e = 1 + \left( \frac{\%_{\text{esponjamiento}}}{100} \right)$$

### 5. Volumen Suelto ($V_s$ o $V_e$) y Logística
Aplica el factor de expansión sobre el volumen compacto para obtener el volumen real movilizado y los fletes requeridos:
$$V_s = V_c \cdot F_e$$
$$\text{Viajes} = \left\lceil \frac{V_s}{12\text{ m}^3} \right\rceil$$

---

## 🛠️ Estructura del Proyecto

```text
/
├── index.html          # Interfaz principal (PWA views, modales y tablas)
├── app.js              # Lógica de la aplicación, IndexedDB y cálculos
├── styles.css          # Estilos responsivos y temas de interfaz
├── manifest.json       # Configuración PWA para instalación móvil
├── novedades.json      # Control de versiones y changelog técnico
└── icono-192.png       # Icono de la aplicación PWA