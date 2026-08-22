# 📦 Volúmenes Escombros — PWA de Estimación de Volúmenes y Logística (v2.0.0)

**Volúmenes Escombros** es una Aplicación Web Progresiva (PWA) de alto rendimiento diseñada para la evaluación rápida y precisa en campo del volumen de escombros generado por el colapso o demolición de edificaciones, así como la planificación de la capacidad logística de fletes (camiones de $12\text{ m}^3$).

---

## 🚀 Novedades y Características Principales (v2.0.0)

* **Nuevo Modelo de Cálculo Estructural Integrado:** Incorporación del Factor de Sistema Estructural ($I_{m3}$ o $\varphi$) para reflejar la densidad geométrica y tipología constructiva de la edificación.
* **Componentes Visuales Rediseñados (`card-selector`):** Interfaz táctil de un solo toque con tarjetas tematizadas por color y badges explicativos para parámetros clave:
  * 📘 **Azul:** Índice de Sistema Estructural ($\varphi / I_{m3}$)
  * 📗 **Verde:** Complejidad del Terreno Libre ($\alpha$)
  * 📕 **Rojo:** Factor / % de Esponjamiento ($\beta$)
* **Tooltips Compactos:** Iconos con descripción técnica flotante tipo *hover* en la clasificación de terreno exterior para maximizar la legibilidad en pantallas móviles.
* **Evidencias de Cálculos en Vivo:** Actualización reactiva inmediata en 5 pasos matemáticos al seleccionar o modificar cualquier variable en tiempo real.
* **Procesamiento 100% Offline (PWA):** Operatividad plena sin conexión a internet mediante almacenamiento persistente IndexedDB y Service Workers.
* **Sincronización de Cuadrilla:** Intercambio rápido de datos de jornada mediante JSON nativo y reportes automatizados para WhatsApp.

---

## 📐 Memoria y Fundamento Técnico de Cálculo

El motor de cálculo del sistema se fundamenta en la física de volúmenes de escombros y demolición, combinando la envolvente volumétrica de la edificación, el índice de aporte estructural según la tipología constructiva, la penalización por áreas y obstáculos del entorno exterior, y la tasa de expansión volumétrica por esponjamiento.

```text
+-----------------------------------------------------------------------+
|                         ENTRADAS EN CAMPO                             |
|  - Área Parcela (A_terreno)     - Niveles (N_p, N_s)                  |
|  - Área Huella (A_huella)      - Parámetros (φ = Im3, α, β)           |
+-----------------------------------------------------------------------+
                                   |
                                   v
  [1. Área Libre]      A_ext = max(0, A_terreno - A_huella)
                                   |
                                   v
  [2. Pisos Eq.]       N_eq = (N_p + N_s) * α   -->   N_eq_final = ceil(N_eq)
                                   |
                                   v
  [3. Vol. Compacto]   V_c = A_huella * N_eq_final * φ  (m³)
                                   |
                                   v
  [4. Vol. Suelto]     F_e = 1 + (β / 100)
                       V_s = V_c * F_e                  (m³)
                                   |
                                   v
  [5. Logística]       Viajes = ceil( V_s / 12 m³ )
```

---

### 1. Área Exterior Libre ($A_{\text{ext}}$)
Determina la superficie útil del predio no ocupada por la huella de la estructura principal:
$$A_{\text{ext}} = \max(0, A_{\text{terreno}} - A_{\text{huella}})$$

---

### 2. Número Equivalente de Pisos ($N_{\text{eq}}$)
Modula el total de niveles construidos (pisos sobre rasante $N_p$ y niveles de sótano $N_s$) en función de la complejidad del terreno adyacente ($\alpha$). La penalización o ponderación exterior ajusta la escala del cálculo volumétrico:

$$N_{\text{eq exacto}} = (N_p + N_s) \cdot \alpha$$
$$N_{\text{eq final}} = \lceil N_{\text{eq exacto}} \rceil$$

#### *Factor de Complejidad del Terreno Libre ($\alpha$):*
Pondera los obstáculos, pavimentos e infraestructura existente fuera de la huella:
* **Liviano ($\alpha = 0.12$):** Patios planos, aceras, áreas verdes, grama.
* **Moderado ($\alpha = 0.20$):** Canchas deportivas, brocales, carpetas de asfalto.
* **Pesado ($\alpha = 0.28$):** Piscinas, muros de contención altos, sótanos extendidos.
* **Pesado Superior ($\alpha = 0.30$):** Obras civiles de gran envergadura y densidad de concreto exterior.

---

### 3. Índice de Sistema Estructural ($I_{m3}$ o $\varphi$)
Representa la fracción volumétrica neta de material sólido por cada metro cúbico de volumen envolvente de la edificación. Varía sustancialmente según la densidad de los elementos resistentes (columnas, vigas, muros y losas):

$$I_{m3} \in \{ 0.30, 0.40 \}$$

#### *Clasificación Constructiva:*
* **Aporticado Tradicional ($\varphi = 0.30 \text{ m}^3/\text{m}^3$):**
  Estructura espacial a base de vigas y columnas de concreto armado o acero, losas aligeradas con bloques huecos y cerramientos en mampostería no portante. Genera una mayor proporción de espacios vacíos en el colapso.
* **Monolítico / Tipo Túnel ($\varphi = 0.40 \text{ m}^3/\text{m}^3$):**
  Estructura continua de muros de carga y losas macizas de concreto armado vaciadas en sitio. Presenta una densidad de masa significativamente mayor por unidad de volumen edificado.

---

### 4. Volumen Compactado ($V_c$)
Es el volumen sólido teórico del material colapsado/demolido en su estado consolidado previo al despeje:

$$V_c = A_{\text{huella}} \cdot N_{\text{eq final}} \cdot I_{m3}$$

> **Fundamento TÉCNICO:** El producto $A_{\text{huella}} \cdot N_{\text{eq final}}$ establece la envolvente espacial de referencia de la edificación, sobre la cual se aplica la tasa de ocupación de masa $I_{m3}$ para aislar el volumen real de escombro denso.

---

### 5. Factor de Esponjamiento ($F_e$ / $\beta$) y Volumen Suelto ($V_s$)
Al fracturar y remover los elementos constructivos compactos, estos experimentan un incremento volumétrico debido a la creación de vacíos e intersticios entre fragmentos irregularmente distribuidos (porcentaje de esponjamiento $\beta$):

$$F_e = 1 + \left( \frac{\beta}{100} \right)$$

#### *Valores de Esponjamiento ($\beta$):*
* **Liviano ($\beta = 35\%$ / $F_e = 1.35$):** Mampostería hueca, bloques de arcilla, revestimientos finos.
* **Estándar ($\beta = 42\%$ / $F_e = 1.42$):** Mezcla heterogénea habitual de concreto, mortero y bloques.
* **Pesado ($\beta = 50\%$ / $F_e = 1.50$):** Fragmentos grandes y densos de concreto armado, vigas y muros estructurales.

El **Volumen Suelto o Removible ($V_s$ o $V_e$)** resultante es:
$$V_s = V_c \cdot F_e$$

---

### 6. Estimación de Logística de Fletes
Calcula la flota teórica requerida para el desalojo del sitio utilizando camiones volteo estandarizados de $12\text{ m}^3$:

$$\text{Viajes o Fletes} = \left\lceil \frac{V_s}{12\text{ m}^3} \right\rceil$$

---

## 📊 Ejemplo Numérico de Aplicación

Para un edificio de **3 pisos** con una huella de $200\text{ m}^2$ en una parcela de $500\text{ m}^2$, con sistema **Aporticado Tradicional** ($\varphi = 0.30$), terreno libre **Pesado** ($\alpha = 0.28$) y esponjamiento **Estándar** ($\beta = 42\%$):

1. **Área Libre:** $A_{\text{ext}} = 500 - 200 = 300\text{ m}^2$
2. **Pisos Equivalentes:** $N_{\text{eq}} = 3 \cdot 0.28 = 0.84 \longrightarrow N_{\text{eq final}} = \lceil 0.84 \rceil = 1$
3. **Volumen Compactado:** $V_c = 200 \cdot 1 \cdot 0.30 = 60.0\text{ m}^3$
4. **Factor de Esponjamiento:** $F_e = 1 + (42 / 100) = 1.42$
5. **Volumen Suelto:** $V_s = 60.0 \cdot 1.42 = 85.2\text{ m}^3$
6. **Desalojo Logístico:** \text{Fletes} = \lceil 85.2 / 12 \rceil = 8\text{ viajes}

---

## 🛠️ Estructura del Proyecto

```text
/
├── index.html          # Interfaz de usuario (PWA views, modales y tablas de registros)
├── app.js              # Lógica de la aplicación, motor de cálculos y motor IndexedDB
├── styles.css          # Estilos responsivos, temas de tarjetas y badges paramétricos
├── sw.js               # Service Worker para almacenamiento en caché offline (v2.0.0)
├── manifest.json       # Manifiesto de PWA para instalación en dispositivos móviles
├── novedades.json      # Registro técnico de versiones y cambios del sistema (v2.0.0)
└── icono-192.png       # Icono oficial de la aplicación PWA
```
