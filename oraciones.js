// ============================================================
//  🙏 Generador de Oraciones con la voz de mamá
//  LLM: OpenRouter (gratis, sin límite diario)
//  TTS: Edge TTS gratuito (USE_FREE_TTS=true) | Gradium (voz clonada)
//       con respaldo automático de Free.ai (gratis, 30k tokens/día)
// ============================================================

require("dotenv").config();
const fetch = require("node-fetch");
const FormData = require("form-data");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

// ── Validar configuración ────────────────────────────────────
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY1 || process.env.GROQ_API_KEY1;
const GRADIUM_KEY    = process.env.GRADIUM_API_KEY;
const GRADIUM_VOICE  = process.env.GRADIUM_VOICE_ID;
const FREEAI_KEY     = process.env.FREEAI_API_KEY;
const VOICE_PATH     = process.env.VOICE_SAMPLE_PATH || "./voz_mama.wav";
const USE_FREE_TTS   = process.env.USE_FREE_TTS; // 'true' | 'false' | 'cascade'

if (!OPENROUTER_KEY || OPENROUTER_KEY.includes("tu_")) {
  console.error("❌  Falta OPENROUTER_API_KEY o GROQ_API_KEY en .env");
  process.exit(1);
}

// Motor TTS de la voz de mamá (solo se valida cuando NO se usa USE_FREE_TTS=true):
//  1) Gradium (GRADIUM_API_KEYS/GRADIUM_API_KEY + GRADIUM_VOICE_ID) — primario
//  2) Free.ai (FREEAI_API_KEY + VOICE_SAMPLE_PATH) — respaldo automático si Gradium falla
// Si ninguno está configurado avisamos y salimos; la voz gratuita de Edge TTS no necesita llaves.
if (USE_FREE_TTS !== 'true' && USE_FREE_TTS !== 'cascade') {
  const gradiumKeys = obtenerGradiumKeys();
  const tieneGradium = gradiumKeys.length > 0 && GRADIUM_VOICE && !GRADIUM_VOICE.includes("tu_");
  const tieneFreeAI  = FREEAI_KEY && !FREEAI_KEY.includes("tu_") && fs.existsSync(path.resolve(VOICE_PATH));

  if (!tieneGradium && !tieneFreeAI) {
    console.error("❌  No hay ningún motor TTS de la voz de mamá configurado.");
    console.error("    Configura GRADIUM_API_KEYS + GRADIUM_VOICE_ID, o FREEAI_API_KEY + VOICE_SAMPLE_PATH en .env");
    console.error("    (o usa USE_FREE_TTS=true para la voz gratuita de Edge TTS)");
    process.exit(1);
  }
  if (!tieneGradium) console.warn("⚠️  Gradium no está configurado; se usará Free.ai como motor de la voz de mamá.");
  if (!tieneFreeAI)  console.warn("⚠️  Free.ai no está configurado; la voz de mamá dependerá solo de Gradium.");
}

// ── Llamadas a LLMs ──────────────────────────────────────────
async function callGroq(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function callMistral(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`Mistral HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function callOpenRouter(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`OpenRouter HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

// ── Generar oración con Fallback ──────────────────────────
async function generarOracion(motivo) {
  const messages = [
    {
      role: "system",
      content: `Eres una madre cristiana colombiana que ora con profunda fe, amor y ternura.
Instrucciones estrictas:
- Responde ÚNICAMENTE en español de Colombia, con ortografía impecable. Prohibido usar palabras en otros idiomas.
- Empieza SIEMPRE con "Padre celestial" o "Señor Jesús"
- Tono cálido, como una madre orando por sus seres queridos
- Menciona nombres o situaciones específicas del motivo
- Incluye referencias bíblicas de forma natural y fluida
- Termina la oración con una petición o bendición final cálida y natural. PROHIBIDO usar la frase "En el nombre de Jesús, amén y amén" ni "Amén" al final (esa frase la pronuncia el video de cierre de la transmisión).
- Longitud: MÍNIMO 80, MÁXIMO 95 PALABRAS. Es CRÍTICO que la oración sea lo suficientemente larga y detallada.
- SOLO texto plano: sin asteriscos, guiones, números ni símbolos`
    },
    { role: "user", content: `Crea una oración para: ${motivo}` }
  ];

  const k1   = process.env.GROQ_API_KEY1 || process.env.GROQ_API_KEY; // Support old and new keys
  const k2   = process.env.GROQ_API_KEY2;
  const k3   = process.env.GROQ_API_KEY3;
  const kmis = process.env.MISTRAL_API_KEY;
  const kor1 = process.env.OPENROUTER_API_KEY1 || process.env.OPENROUTER_API_KEY;
  const kor2 = process.env.OPENROUTER_API_KEY2;

  if (k1)   { try { return await callGroq(k1,       messages); } catch(e) { console.warn('⚠️ Groq1 falló:', e.message); } }
  if (k2)   { try { return await callGroq(k2,       messages); } catch(e) { console.warn('⚠️ Groq2 falló:', e.message); } }
  if (k3)   { try { return await callGroq(k3,       messages); } catch(e) { console.warn('⚠️ Groq3 falló:', e.message); } }
  if (kmis) { try { return await callMistral(kmis,  messages); } catch(e) { console.warn('⚠️ Mistral falló:', e.message); } }
  if (kor1) { try { return await callOpenRouter(kor1, messages); } catch(e) { console.warn('⚠️ OpenRouter1 falló:', e.message); } }
  if (kor2) { try { return await callOpenRouter(kor2, messages); } catch(e) { console.warn('⚠️ OpenRouter2 falló:', e.message); } }

  throw new Error('Todos los LLMs fallaron en la escalera de fallback');
}

let currentEdgeVoice = "es-CO-SalomeNeural";
function setEdgeVoice(voice) {
  if (voice) currentEdgeVoice = voice;
}

// ── Edge TTS — puro Node.js (edge-tts-universal, sin Python) ───────────────
// Voz de respaldo: si la voz elegida falla, se reintenta con esta.
const VOZ_BASE_EDGE = 'es-CO-SalomeNeural';

async function sintetizarConPythonEdge(texto, outputPath) {
  // Intentar primero con la voz elegida; si falla, reintentar con la voz base.
  const vocesAProbar = [currentEdgeVoice];
  if (currentEdgeVoice !== VOZ_BASE_EDGE) vocesAProbar.push(VOZ_BASE_EDGE);

  let ultimoError = null;
  for (const voz of vocesAProbar) {
    if (voz !== vocesAProbar[0]) {
      console.warn(`⚠️ Voz "${currentEdgeVoice}" falló. Reintentando con la voz base (${voz})...`);
    }
    try {
      await sintetizarConEdgeNode(voz, texto, outputPath);
      return outputPath;
    } catch (err) {
      ultimoError = err;
      try { fs.unlinkSync(outputPath); } catch (_) {} // borrar salida parcial
    }
  }
  throw ultimoError;
}

async function sintetizarConEdgeNode(voz, texto, outputPath) {
  const { Communicate } = require('edge-tts-universal');
  const comm = new Communicate(texto, { voice: voz });
  const chunks = [];
  for await (const chunk of comm.stream()) {
    if (chunk.type === 'audio') chunks.push(chunk.data);
  }
  const buf = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, buf);
  if (buf.length === 0) {
    throw new Error(`edge-tts-universal (${voz}) no generó audio`);
  }
}

// ── Llaves de Gradium (escalera) ──────────────────────────────────────────
// Recolecta las llaves en orden: GRADIUM_API_KEYS (separadas por coma),
// o las numeradas GRADIUM_API_KEY1..9, o la singular GRADIUM_API_KEY.
function obtenerGradiumKeys() {
  const keys = [];
  if (process.env.GRADIUM_API_KEYS) {
    for (const k of process.env.GRADIUM_API_KEYS.split(",")) {
      const t = k.trim();
      if (t && !t.includes("tu_")) keys.push(t);
    }
  } else {
    for (let i = 1; i <= 9; i++) {
      const k = (process.env[`GRADIUM_API_KEY${i}`] || "").trim();
      if (k && !k.includes("tu_")) keys.push(k);
    }
    const singular = (process.env.GRADIUM_API_KEY || "").trim();
    if (singular && !singular.includes("tu_")) keys.push(singular);
  }
  return keys;
}

// ── Arreglar cabecera WAV ────────────────────────────────────────────────
// Algunos servicios (Gradium/Free.ai) devuelven WAV con tamaños de cabecera
// sin rellenar: 0xFFFFFFFF en el tamaño RIFF y en el chunk 'data' (escriben el
// valor al final pero nunca lo actualizan). El audio es correcto, pero las
// duraciones parseadas y algunos navegadores fallan. Aquí se parchea la
// cabecera con los tamaños REALES del archivo. No hace nada si no es WAV.
function arreglarCabeceraWav(filePath) {
  try {
    const b = fs.readFileSync(filePath);
    if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') return filePath;

    let off = 12;
    let dataOffset = -1;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const sz = b.readUInt32LE(off + 4);
      if (id === 'data') { dataOffset = off; break; }
      off += 8 + sz + (sz % 2);
    }
    if (dataOffset === -1) return filePath;

    const realDataSize = b.length - (dataOffset + 8);
    const realRiffSize = b.length - 8;
    const needsPatch = b.readUInt32LE(dataOffset + 4) !== realDataSize || b.readUInt32LE(4) !== realRiffSize;
    if (needsPatch) {
      b.writeUInt32LE(realDataSize, dataOffset + 4);
      b.writeUInt32LE(realRiffSize, 4);
      fs.writeFileSync(filePath, b);
      console.log("   🛠️  Cabecera WAV corregida (tamaños reales parcheados)");
    }
  } catch (_) { /* no es un WAV válido o no se pudo escribir: ignorar */ }
  return filePath;
}

// ── Sintetizar con Gradium (voz clonada de mamá) ──────────────────────────
async function sintetizarConGradium(texto, outputPath) {
  console.log("🎙️  Sintetizando con la voz de mamá (Gradium)...");

  // Construir la "escalera" de llaves
  const keys = obtenerGradiumKeys();

  if (keys.length === 0) {
    throw new Error("❌ No hay ninguna GRADIUM_API_KEY configurada en tu .env (usa GRADIUM_API_KEYS o GRADIUM_API_KEY1..9)");
  }

  let ultimoError = null;

  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    if (keys.length > 1) {
      console.log(`    Probando llave ${i + 1} de ${keys.length}...`);
    }

    const response = await fetch("https://api.gradium.ai/api/post/speech/tts", {
      method: "POST",
      headers: {
        "x-api-key": currentKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texto,
        voice_id: GRADIUM_VOICE,
        output_format: "wav",
        only_audio: true,
        language: "es",
        json_config: JSON.stringify({
          rewrite_rules: "es",
          cfg_coef: 3.0
        })
      })
    });

    if (response.ok) {
      const audioBuffer = await response.buffer();
      fs.writeFileSync(outputPath, audioBuffer);
      arreglarCabeceraWav(outputPath); // Gradium deja tamaños 0xFFFFFFFF
      return outputPath; // Éxito total
    }

    const errText = await response.text();
    ultimoError = new Error(`Gradium ${response.status}: ${errText}`);

    if ([401, 402, 403, 429].includes(response.status)) {
      console.log(`⚠️   La llave ${i + 1} falló (Sin saldo o límite alcanzado). Saltando a la siguiente...`);
      continue;
    }
    throw ultimoError;
  }
  throw new Error(`❌ Todas las llaves fallaron. Último error: ${ultimoError.message}`);
}

// ── Sintetizar con Free.ai (voz de mamá, respaldo automático) ─────────────
// Sistema usado en oraciones-mama2: clona la voz a partir de VOICE_SAMPLE_PATH
// (voz_mama.wav) y devuelve una URL de audio que luego descargamos.
// Gratis: 30k tokens/día, sin tarjeta → https://free.ai
async function sintetizarConFreeAI(texto, outputPath) {
  console.log("🎙️  Sintetizando con la voz de mamá (Free.ai)...");
  if (!FREEAI_KEY || FREEAI_KEY.includes("tu_")) {
    throw new Error("❌ Falta FREEAI_API_KEY en .env (regístrate gratis en https://free.ai)");
  }
  if (!fs.existsSync(path.resolve(VOICE_PATH))) {
    throw new Error(`❌ No se encontró el audio de la voz en: ${VOICE_PATH}. Configura VOICE_SAMPLE_PATH en .env`);
  }

  console.log("   -> Enviando texto + voz de muestra a Free.ai (puede tardar 1-2 minutos)...");

  const form = new FormData();
  form.append("text", texto);
  form.append("audio", fs.createReadStream(path.resolve(VOICE_PATH)), {
    filename: path.basename(VOICE_PATH),
    contentType: VOICE_PATH.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav"
  });

  // Timeout para que el servidor NUNCA se quede colgado esperando a Free.ai
  const controller = new AbortController();
  let timer = null;
  const armarTimeout = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), ms);
  };
  armarTimeout(150000); // la clonación puede tardar 1-2 minutos
  try {
    const response = await fetch("https://api.free.ai/v1/voice/clone/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FREEAI_KEY}`,
        ...form.getHeaders()
      },
      body: form,
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401) throw new Error("Free.ai: API key inválida. Verifica FREEAI_API_KEY en .env");
      if (response.status === 429) throw new Error("Free.ai: límite diario alcanzado (30k tokens/día). Vuelve mañana.");
      throw new Error(`Free.ai ${response.status}: ${err}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error(`Free.ai: respuesta inesperada (no es JSON), HTTP ${response.status}`);
    }
    if (!data.audio_url) {
      throw new Error("Free.ai: No se recibió la URL del audio en la respuesta.");
    }

    console.log("   -> ¡Audio generado! Descargando archivo...");
    armarTimeout(60000); // la descarga tiene su propio margen de 60s
    const audioRes = await fetch(data.audio_url, { signal: controller.signal });
    if (!audioRes.ok) throw new Error("Free.ai: Error al descargar el audio generado.");

    const audioBuffer = await audioRes.buffer();
    fs.writeFileSync(outputPath, audioBuffer);
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("Free.ai: el audio descargado está vacío");
    }
    arreglarCabeceraWav(outputPath); // si el audio es WAV con cabecera corrupta
    return outputPath;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Free.ai: la síntesis tardó demasiado (timeout de 150s). Inténtalo de nuevo.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Sintetizar voz: Edge TTS | Free.ai | Gradium | cascade ──────────────────
// Retorna { path: string, ttsProvider: 'cloned' | 'edge' }
//  - ttsProvider='cloned'  → video cierre "Declaración de victoria"
//  - ttsProvider='edge'    → video cierre "Declaracion de victoria salome"
async function sintetizarVoz(texto, outputPath) {

  // ── Modo cascade: Gradium → Free.ai → Edge TTS ─────────────────────────────
  if (USE_FREE_TTS === 'cascade') {
    // 1) Gradium (más rápido)
    try {
      await sintetizarConGradium(texto, outputPath);
      console.log('✅ [cascade] Voz sintetizada con Gradium');
      return { path: outputPath, ttsProvider: 'cloned' };
    } catch (e1) {
      console.warn(`⚠️  [cascade] Gradium falló: ${e1.message} → intentando Free.ai...`);
    }
    // 2) Free.ai
    try {
      await sintetizarConFreeAI(texto, outputPath);
      console.log('✅ [cascade] Voz sintetizada con Free.ai');
      return { path: outputPath, ttsProvider: 'cloned' };
    } catch (e2) {
      console.warn(`⚠️  [cascade] Free.ai falló: ${e2.message} → usando Edge TTS de respaldo...`);
    }
    // 3) Edge TTS (último recurso)
    console.log(`🎙️  [cascade] Sintetizando con Edge TTS (${currentEdgeVoice})...`);
    await sintetizarConPythonEdge(texto, outputPath);
    return { path: outputPath, ttsProvider: 'edge' };
  }

  // ── Modo true: solo Edge TTS ────────────────────────────────────────────────
  if (USE_FREE_TTS === 'true') {
    console.log(`🎙️  Sintetizando con la voz gratuita (Edge TTS Python - ${currentEdgeVoice})...`);
    try {
      await sintetizarConPythonEdge(texto, outputPath);
      return { path: outputPath, ttsProvider: 'edge' };
    } catch (err) {
      console.error("❌ Falló Edge TTS:", err.message);
      throw err;
    }
  }

  // ── Modo false (por defecto): Gradium → Free.ai ─────────────────────────────
  try {
    await sintetizarConGradium(texto, outputPath);
    return { path: outputPath, ttsProvider: 'cloned' };
  } catch (gradiumErr) {
    console.warn(`⚠️  Gradium falló: ${gradiumErr.message}`);
    console.warn("    Intentando con Free.ai como respaldo...");
    try {
      await sintetizarConFreeAI(texto, outputPath);
      return { path: outputPath, ttsProvider: 'cloned' };
    } catch (freeAiErr) {
      throw new Error(`❌ Gradium y Free.ai fallaron. Último error: ${freeAiErr.message}`);
    }
  }
}

// ── Contador de créditos Gradium ─────────────────────────────
// 1 crédito = 1 caracter. Tier gratis: 45,000 créditos/mes
function registrarUso(texto) {
  const archivo = "./gradium_uso.txt";
  const chars = texto.length;
  let total = chars;
  if (fs.existsSync(archivo)) {
    total += parseInt(fs.readFileSync(archivo, "utf8") || "0");
  }
  fs.writeFileSync(archivo, String(total));
  return { usado: total, porcentaje: Math.round((total / 45000) * 100) };
}

// ── Guardar registro escrito ─────────────────────────────────
function guardarRegistro(motivo, texto) {
  const fecha = new Date().toLocaleString("es-CO");
  const entrada = `\n${"─".repeat(60)}\n📅 ${fecha}\n🙏 Motivo: ${motivo}\n\n${texto}\n`;
  fs.appendFileSync("./oraciones_guardadas.txt", entrada, "utf8");
}

// ── Reproducir audio en Windows ─────────────────────────────
function reproducirAudio(filePath) {
  const absolutePath = path.resolve(filePath);
  try {
    execSync(
      `powershell -c "Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]'${absolutePath}'); $p.Play(); Start-Sleep -s 180"`,
      { stdio: "ignore" }
    );
  } catch {
    console.log(`\n🔊  Abre el audio manualmente: ${absolutePath}`);
  }
}

// ── Flujo completo ───────────────────────────────────────────
async function procesarOracion(motivo) {
  try {
    // 1. Generar texto
    console.log("\n✍️  Generando oración...");
    const texto = await generarOracion(motivo);

    console.log("\n─────────────────────────────────────────");
    console.log("📖  ORACIÓN:\n");
    console.log(texto);
    console.log("─────────────────────────────────────────");

    // Mostrar uso de créditos
    const { usado, porcentaje } = registrarUso(texto);
    console.log(`\n📊  Gradium: ${usado}/45,000 créditos usados este mes (${porcentaje}%)`);
    if (usado > 40000) console.log("⚠️   Cerca del límite mensual gratuito.");

    // 2. Guardar registro
    guardarRegistro(motivo, texto);

    // 3. Sintetizar
    const timestamp = Date.now();
    const audioPath = `./oracion_${timestamp}.wav`;
    await sintetizarVoz(texto, audioPath);
    console.log(`\n✅  Audio guardado: ${audioPath}`);

    // 4. Reproducir
    console.log("🔊  Reproduciendo...\n");
    reproducirAudio(audioPath);

  } catch (err) {
    console.error("\n❌  Error:", err.message);
    if (err.message.includes("429")) {
      console.log("    Límite alcanzado. Espera unos minutos.");
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────
function mostrarBienvenida() {
  console.clear();
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     🙏  Oraciones con la voz de Mamá  🙏     ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  /oracion [motivo]  →  Genera una oración    ║");
  console.log("║  /salir             →  Cerrar                ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  Ejemplos:                                   ║");
  console.log("║  /oracion por mis hijos Andres y Pablo       ║");
  console.log("║  /oracion por sanidad de mi esposo           ║");
  console.log("║  /oracion de gratitud por las bendiciones    ║");
  console.log("║  /oracion por proteccion en los viajes       ║");
  console.log("╚══════════════════════════════════════════════╝\n");
}

async function main() {
  mostrarBienvenida();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "👉  " });
  rl.prompt();
  rl.on("line", async (linea) => {
    const input = linea.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "/salir" || input === "/exit") {
      console.log("\n🙏  Que Dios te bendiga. Hasta pronto.\n");
      process.exit(0);
    }
    if (input.startsWith("/oracion ")) {
      const motivo = input.replace("/oracion ", "").trim();
      rl.pause();
      await procesarOracion(motivo);
      rl.resume();
      rl.prompt();
    } else if (input === "/oracion") {
      console.log("⚠️   Escribe el motivo: /oracion por mis hijos\n");
      rl.prompt();
    } else {
      console.log("⚠️   Usa /oracion [motivo] o /salir\n");
      rl.prompt();
    }
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  generarOracion,
  sintetizarVoz,
  setEdgeVoice
};
