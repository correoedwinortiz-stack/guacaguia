# 🙏 Generador de Oraciones con la voz de Mamá

Un homenaje especial: una IA que genera oraciones con la voz de tu mamá y las transmite en un Live de TikTok.

---

## ⚙️ Configuración (una sola vez)

### Paso 1 — Instalar Node.js
Si no lo tienes: https://nodejs.org (descarga la versión LTS)

### Paso 2 — Instalar dependencias
Abre una terminal en esta carpeta y ejecuta:
```bash
npm install
```

### Paso 3 — Obtener API Keys de IA (GRATIS)
El motor usa varios proveedores de IA para mayor disponibilidad (con fallback automático). No necesitas todos, con uno basta:
1. **Groq**: Crea una cuenta gratis y obtén tu API Key en https://console.groq.com/keys
2. **OpenRouter**: Crea una cuenta gratis y obtén tu API Key en https://openrouter.ai/keys

### Paso 4 — Configurar el archivo .env
1. Renombra tu archivo `.env.example` a `.env` (o crea uno nuevo si no existe).
2. Pega tus credenciales:

```env
GROQ_API_KEY=gsk_...tu_clave_aqui
OPENROUTER_API_KEY=sk-or-v1-...tu_clave_aqui

# TikTok Live
TIKTOK_USERNAME=tu_usuario_de_tiktok

# Configuración de voz (true para usar la voz gratis de Microsoft Edge)
USE_FREE_TTS=true
```

---

## ▶️ Usar el Live Stream (Servidor Web y TikTok)

Para iniciar el servidor que se conecta a TikTok y maneja las peticiones en vivo:

```bash
npm run server
```

Luego abre en tu navegador:
- **Reproductor (para capturar en OBS):** `http://localhost:3002/player`
- **Panel de Control:** `http://localhost:3002/admin`

*(También puedes abrir el Panel de Control desde tu celular ingresando a la IP que te muestre la consola, si estás en la misma red WiFi).*

---

### Usar solo el generador por consola (Pruebas)

Si solo quieres generar audios escribiendo en la terminal:

```bash
npm start
```
Luego escribe comandos como:
`/oracion por mis hijos Andres y Pablo que están en el colegio`

---

## 🎙️ Modos de voz (TTS)

El motor de voz se elige con la variable `USE_FREE_TTS` del archivo `.env`:

- `USE_FREE_TTS=true` → voz gratuita de **Edge TTS** (genérica, no necesita llaves, acento colombiano disponible).
- Sin `USE_FREE_TTS` (o en `false`) → **voz de mamá**: primero intenta con **Gradium** (`GRADIUM_API_KEYS` + `GRADIUM_VOICE_ID`) y, si falla o no está configurado, usa el respaldo automático con **Free.ai** (`FREEAI_API_KEY` + `VOICE_SAMPLE_PATH`, gratis, 30k tokens/día).

---

## 📻 Oraciones estándar (ahorro de Gradium/Free.ai)

Cuando se usa la **voz clonada de mamá** (`USE_FREE_TTS=false`), las oraciones genéricas que suenan en reposo (idle, cada 3 min) y tras cada bloque de música **se generan y sintetizan desde cero cada vez** (gastando créditos de la API).

Para evitarlo, el motor **rota audios pre-generados** con la voz de mamá desde la carpeta `oraciones_estandar/` (cero llamadas API por oración genérica):

1. **Genera los audios una sola vez** (fuerza la voz clonada aunque `.env` tenga `USE_FREE_TTS=true`):
   ```bash
   node generar_oraciones_estandar.mjs
   ```
2. Esto crea `oraciones_estandar/estandar_XX.wav` (6 oraciones) + `manifest.json`.
3. El motor los detecta al arrancar y los rota sin repetir. Para desactivar esto: pon `USAR_ORACIONES_ESTANDAR=false` en `.env`.

*Nota: Con `USE_FREE_TTS=true` (Edge TTS, que es ilimitado y gratis) el sistema ignora esto y sigue generando oraciones frescas y únicas siempre.*

---

*Hecho con amor para honrar a una mamá que ora. 🙏*
