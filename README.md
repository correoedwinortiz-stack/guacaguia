# 🙏 Generador de Oraciones con la voz de Mamá

Un homenaje especial: una IA que genera oraciones con la voz de tu mamá.

---

## ⚙️ Configuración (una sola vez)

### Paso 1 — Instalar Node.js
Si no lo tienes: https://nodejs.org (descarga la versión LTS)

### Paso 2 — Instalar dependencias
Abre una terminal en esta carpeta y ejecuta:
```bash
npm install
```

### Paso 3 — Obtener API Key de Gemini (GRATIS)
1. Ve a https://aistudio.google.com/apikey
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Create API Key"
4. Copia la clave generada

### Paso 4 — Obtener Token de Hugging Face (GRATIS)
1. Crea cuenta gratis en https://huggingface.co
2. Ve a https://huggingface.co/settings/tokens
3. Haz clic en "New token" → tipo "Read"
4. Copia el token

### Paso 5 — Preparar la voz de tu mamá
- Copia el archivo de audio de tu mamá a esta carpeta
- Renómbralo como `voz_mama.wav` (o ajusta la ruta en .env)
- Recomendado: audio de al menos 1 minuto, sin ruido de fondo
- Si es .mp3, puedes convertirlo en https://cloudconvert.com

### Paso 6 — Configurar el archivo .env
1. Copia el archivo `.env.example` y renómbralo a `.env`
2. Pega tus credenciales:

```
GEMINI_API_KEY=AIza...tu_clave_aqui
HF_TOKEN=hf_...tu_token_aqui
VOICE_SAMPLE_PATH=./voz_mama.wav
```

---

## ▶️ Usar el generador

```bash
node oraciones.js
```

Luego escribe comandos como:

```
/oracion por mis hijos Andres y Pablo que están en el colegio
/oracion de gratitud por las bendiciones recibidas este mes
/oracion por sanidad de mi esposo que está enfermo
/oracion por protección de la familia en los viajes
/oracion de año nuevo para toda la familia
```

---

## 📁 Archivos generados

- `oracion_[timestamp].wav` — Audio de cada oración generada
- `oraciones_guardadas.txt` — Registro escrito de todas las oraciones

---

## ⚠️ Notas importantes

- La primera oración puede tardar 30-60 segundos (el modelo carga en HuggingFace)
- Las siguientes son más rápidas
- Si ves error 503, espera un momento y vuelve a intentar
- Límite gratuito de Gemini: ~1500 oraciones/día (más que suficiente)
- Límite gratuito de HuggingFace: uso razonable diario

---

## 💡 Consejos para mejor calidad de voz

- Usa el fragmento más largo y limpio de audio de tu mamá
- Idealmente que esté orando (mismo tono que quieres recrear)
- Puedes limpiar el ruido gratis en: https://podcast.adobe.com/enhance

---

## 🎙️ Modos de voz (TTS)

El motor de voz se elige con la variable `USE_FREE_TTS` del archivo `.env`:

- `USE_FREE_TTS=true` → voz gratuita de **Edge TTS** (genérica, no necesita llaves).
- Sin `USE_FREE_TTS` (o en `false`) → **voz de mamá**: primero **Gradium** (`GRADIUM_API_KEYS` + `GRADIUM_VOICE_ID`) y, si falla o no está configurado, respaldo automático con **Free.ai** (`FREEAI_API_KEY` + `VOICE_SAMPLE_PATH`, gratis, 30k tokens/día).

---

## 📻 Oraciones estándar (ahorro de Gradium/Free.ai)

Cuando se usa la **voz de mamá** (`USE_FREE_TTS=false`), las oraciones genéricas que suenan en el idle (cada 3 min sin peticiones) y tras cada bloque de música **se generan y sintetizan desde cero cada vez** (1 llamada LLM + 1 llamada TTS → se gastan los créditos de Gradium/Free.ai muy rápido).

Para evitarlo, el motor **rota audios pre-generados** con la voz de mamá desde la carpeta `oraciones_estandar/` (cero llamadas API por oración genérica):

1. **Genera los audios una sola vez** (fuerza la voz de mamá aunque `.env` tenga `USE_FREE_TTS=true`):
   ```bash
   node generar_oraciones_estandar.mjs
   ```
2. Esto crea `oraciones_estandar/estandar_XX.wav` (6 oraciones) + `manifest.json`.
3. El motor los detecta al arrancar y los rota sin repetir. Para desactivar: `USAR_ORACIONES_ESTANDAR=false` en `.env`.

Con `USE_FREE_TTS=true` (Edge TTS, gratis) se sigue generando oraciones frescas siempre.

---

*Hecho con amor para honrar a una mamá que ora. 🙏*
