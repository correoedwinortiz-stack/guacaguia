# 🦜 Las Guacamayas Sabias — Live de Preguntas sobre Convivencia Escolar

Un live interactivo donde **3 guacamayas sabias** responden preguntas de estudiantes sobre el **Manual de Convivencia** de la Escuela Normal de Mariquita. Los estudiantes escriben en el chat y las guacamayas responden con voz, animaciones y consejos basados en el reglamento escolar.

---

## ⚙️ Configuración (una sola vez)

### 1. Instalar Node.js
Si no lo tienes: https://nodejs.org (versión LTS)

### 2. Instalar dependencias
```bash
npm install
```

### 3. Obtener API Keys de IA (GRATIS)
El motor usa varios proveedores con **fallback automático** (si uno falla, usa el siguiente). Con una sola basta:

| Proveedor | Registro gratuito | Modelo |
|-----------|------------------|--------|
| **Groq** | https://console.groq.com/keys | Qwen 3.6 27B |
| **OpenRouter** | https://openrouter.ai/keys | Nemotron 3.5 Lightning |
| **OrcaRouter** | https://orcarouter.ai | Gratuito sin key |

### 4. Configurar `.env`
Renombra `.env.example` a `.env` (o crea uno nuevo):

```env
# API Keys (con una basta)
OPENROUTER_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...

# TikTok Live
TIKTOK_USERNAME=tu_usuario_de_tiktok

# Voz TTS (true = Edge TTS gratis ilimitado)
USE_FREE_TTS=true
```

---

## ▶️ Iniciar el Live

```bash
npm run server
```

Abre en tu navegador:
- **Reproductor (para OBS):** `http://localhost:3002/player`
- **Panel de Control:** `http://localhost:3002/admin`

En celular (misma red WiFi): usa la IP que muestra la consola.

### En Render (producción)
- **Reproductor:** https://oraciones-mama-live.onrender.com/player
- **Panel:** https://oraciones-mama-live.onrender.com/admin

---

## 🧠 Cómo funciona

### Flujo de una pregunta
```
Estudiante escribe en chat → API detecta petición → RAG busca en el Manual de Convivencia
→ IA genera respuesta → Edge TTS sintetiza voz → Guacamaya habla con animación
```

### Animaciones de la guacamaya
| Video | Cuándo se usa |
|-------|---------------|
| `guacamaya_viene` / `guacamaya_va` | Animación de entrada y salida de la oración |
| `guacamaya_habla1` / `habla2` | La guacamaya hablando (con TTS) |
| `guacamaya_habla3` | Declaración de victoria ("En el nombre de Jesús, amén") |
| `guacamaya_pensando` | Mientras la IA genera la respuesta |
| `guacamayas_default1-4` | Animaciones idle (reposo) con sonido contextual |

### Sistema de audio contextual
Cada video idle tiene su propio sonido que se reproduce en loop:
- `guacamaya_vuela.mp3` → para `guacamayas_default4`
- `guacayamas_default2.mp3` → para `guacamayas_default2`
- `guacamaya_vuela2.mp3` → para `guacamaya_va` / `guacamaya_viene` (1 vez)
- `sonido_fondo.mp3` → música ambiental siempre en loop

### Radio ambiental (LofiCafe)
El player incluye un widget flotante de **Lofi CAFÉ** que suena de fondo. Se oculta automáticamente cuando la guacamaya habla (ducking).

---

## 🎙️ Voz TTS

La síntesis de voz usa **Edge TTS** (gratuito, ilimitado, voz colombiana):

- Voz por defecto: `es-CO-SaloméNeural`
- Se puede cambiar desde el Panel de Control
- Fallback automático a `es-CO-SaloméNeural` si la voz seleccionada falla

### Oraciones estándar (ahorro de créditos)
Para las oraciones genéricas idle (reposo), se usan audios pre-generados en `oraciones_estandar/`:

```bash
node generar_oraciones_estandar.mjs   # Genera 6 oraciones estándar
```

---

## 📁 Estructura del proyecto

```
├── server.mjs                 # Servidor HTTP + WebSocket + TikTok Live
├── oraciones.js               # Motor de IA (LLM) + TTS
├── prayer-engine-mama.mjs     # Motor de oraciones (ciclo idle/oración)
├── buscarContexto.js           # RAG: búsqueda en el Manual de Convivencia
├── contexto_guacamayas.txt    # Chunks del Manual de Convivencia
├── guacamayas-player.html     # Player principal (para OBS/celular)
├── admin_guacamayas.html      # Panel de control
├── sonidos/                   # Audios del sistema
├── oraciones_estandar/        # Oraciones pre-generadas (idle)
├── *.mp4                      # Animaciones de la guacamaya (11 videos)
└── manual-de-convivencia-escuela-normal.pdf  # Fuente de conocimiento
```

---

## 🔧 Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `npm run server` | Inicia el servidor completo (Live + Player + API) |
| `npm start` | Modo consola: genera oraciones escribiendo en terminal |
| `node generar_oraciones_estandar.mjs` | Regenera audios de oraciones idle |

---

## 📋 Panel de Control

Desde el panel (`/admin`) puedes:
- Simular peticiones de oración
- Controlar música de fondo
- Cambiar voz TTS en tiempo real
- Ajustar chroma key (fondo verde)
- Activar animaciones manualmente
- Ver estado del motor de oraciones en tiempo real

---

*Hecho con amor para honrar a las guacamayas sabias de Mariquita. 🦜🙏*
