// ============================================================
//  🦜 Generador de Respuestas con las Guacamayas
//  LLM: OpenRouter (gratis)
//  TTS: Edge TTS (Voz femenina)
// ============================================================

require("dotenv").config();
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY1 || process.env.GROQ_API_KEY1;

if (!OPENROUTER_KEY || OPENROUTER_KEY.includes("tu_")) {
  console.error("❌  Falta OPENROUTER_API_KEY o GROQ_API_KEY en .env");
  process.exit(1);
}

// ── Llamadas a LLMs ──────────────────────────────────────────
async function callOpenRouter(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nvidia/nemotron-3.5-lightning:free",
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`OpenRouter HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function callGroq(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen/qwen3.6-27b", // Modelo activo soportado por Groq
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function callOrcaRouter(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://api.orcarouter.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "orcarouter/free",
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`OrcaRouter HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function callMistral(apiKey, messages, maxTokens = 600) {
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "open-mistral-7b",
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`Mistral HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function generarOracion(motivo) {
  const { buscarContexto } = require('./buscarContexto');
  const { contexto, chunksUsados, keywordsDetectadas } = buscarContexto(motivo);
  
  console.log(`\n[RAG] Keywords: [${keywordsDetectadas.join(', ')}] | Chunks: ${chunksUsados.map(c => c.seccion).join(' / ')}`);
  
  let contextText = contexto || "Manual de Convivencia: Principios de respeto, disciplina, amor al prójimo y responsabilidad.";

  const messages = [
    {
      role: "system",
      content: `Eres la GuacaGuía, que conoce, comprende y vive el Manual de Convivencia. Respondes con una sola voz amable y entusiasta.
Instrucciones estrictas:
- Responden a las preguntas o peticiones basándose estrictamente en las reglas, artículos y sanciones de los fragmentos proporcionados del Manual de Convivencia.
- Tono amigable, sabio y dispuesto a dar buenos consejos a los estudiantes.
- NO eres una persona orando, eres un grupo de aves guacamayas dando consejos escolares. NO uses lenguaje religioso, rezos ni digas amén.
- FRAGMENTOS RELEVANTES DEL MANUAL DE CONVIVENCIA: 
${contextText}
- Obligatorio: SIEMPRE INICIA tu respuesta con la frase "¡Rroa!" como sonido de guacamaya.
- Termina siempre con un buen consejo de convivencia.
- Longitud: MÍNIMO 40, MÁXIMO 80 PALABRAS.
- FORMATO OBLIGATORIO: SOLO texto plano para ser leído en voz alta por TTS.
  NUNCA uses: asteriscos (*), negrita (**), hashes (#), guiones de lista, ni ningun simbolo de formato Markdown.
  Ejemplo MAL: El **PI** es un *proyecto*.
  Ejemplo BIEN: El PI es un proyecto.`
    },
    { role: "user", content: `Responde o da un consejo para: ${motivo}` }
  ];

  const korca = process.env.ORCAROUTER_API_KEY;
  const kor1 = process.env.OPENROUTER_API_KEY1 || process.env.OPENROUTER_API_KEY;
  const kor2 = process.env.OPENROUTER_API_KEY2;
  const kgroq1 = process.env.GROQ_API_KEY1 || process.env.GROQ_API_KEY4;
  const kgroq2 = process.env.GROQ_API_KEY2;
  const kmistral = process.env.MISTRAL_API_KEY;

  // Función auxiliar para limpiar la respuesta del LLM para TTS
  const cleanAndValidate = (res) => {
    if (!res) throw new Error("Texto vacío");
    
    // Eliminar bloques completos <think>...</think>
    let cleaned = res.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    // Si el modelo se cortó por max_tokens antes de cerrar el </think>,
    // eliminamos desde el <think> huérfano en adelante.
    const orphanIndex = cleaned.toLowerCase().indexOf('<think>');
    if (orphanIndex !== -1) {
      cleaned = cleaned.substring(0, orphanIndex).trim();
    }
    
    // 2) Eliminar formato Markdown para que el TTS no lea "asterisco"
    cleaned = cleaned.replace(/\*{1,3}([^*]+?)\*{1,3}/g, '$1');  // *italica* y **negrita**
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');                 // ## encabezados
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');                  // `inline code`
    cleaned = cleaned.replace(/^---+$/gm, '');                      // --- horizontal rules
    cleaned = cleaned.replace(/^\s*[•\-]\s+/gm, '');              // list markers
    cleaned = cleaned.replace(/\n{2,}/g, '\n').replace(/  +/g, ' ').trim();
    
    if (!cleaned) throw new Error("Texto vacío después de limpiar");
    return cleaned;
  };

  // Priorizamos OrcaRouter si la llave está configurada
  if (korca) { try { return cleanAndValidate(await callOrcaRouter(korca, messages)); } catch(e) { console.warn('⚠️ OrcaRouter falló:', e.message); } }
  if (kgroq1) { try { return cleanAndValidate(await callGroq(kgroq1, messages)); } catch(e) { console.warn('⚠️ Groq1 falló:', e.message); } }
  if (kgroq2) { try { return cleanAndValidate(await callGroq(kgroq2, messages)); } catch(e) { console.warn('⚠️ Groq2 falló:', e.message); } }
  if (kmistral) { try { return cleanAndValidate(await callMistral(kmistral, messages)); } catch(e) { console.warn('⚠️ Mistral falló:', e.message); } }
  if (kor1) { try { return cleanAndValidate(await callOpenRouter(kor1, messages)); } catch(e) { console.warn('⚠️ OpenRouter1 falló:', e.message); } }
  if (kor2) { try { return cleanAndValidate(await callOpenRouter(kor2, messages)); } catch(e) { console.warn('⚠️ OpenRouter2 falló:', e.message); } }


  throw new Error('Todos los LLMs fallaron');
}

let currentEdgeVoice = "es-MX-DaliaNeural";
function setEdgeVoice(voice) {
  if (voice) currentEdgeVoice = voice;
}

async function sintetizarConEdgeNode(voz, texto, outputPath) {
  const { Communicate } = require('edge-tts-universal');
  const { execSync } = require('child_process');
  const path = require('path');
  const os = require('os');

  const comm = new Communicate(texto, { voice: voz, volume: '+100%' });
  const chunks = [];
  for await (const chunk of comm.stream()) {
    if (chunk.type === 'audio') chunks.push(chunk.data);
  }
  const buf = Buffer.concat(chunks);
  if (buf.length === 0) {
    throw new Error(`edge-tts-universal (${voz}) no generó audio`);
  }

  // Guardar archivo original en temp
  const tempFile = path.join(os.tmpdir(), `base_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);
  fs.writeFileSync(tempFile, buf);

  try {
    // Aplicar filtro de loro (v1: tono agudo)
    const cmd = `ffmpeg -y -i "${tempFile}" -af "rubberband=pitch=1.5" "${outputPath}"`;
    execSync(cmd, { stdio: 'pipe' });
  } finally {
    try { fs.unlinkSync(tempFile); } catch (e) {}
  }
}

async function sintetizarVoz(texto, outputPath) {
  console.log(`🎙️  Sintetizando con Edge TTS (${currentEdgeVoice})...`);
  try {
    await sintetizarConEdgeNode(currentEdgeVoice, texto, outputPath);
    return { path: outputPath, ttsProvider: 'edge' };
  } catch (err) {
    console.warn(`⚠️ Voz "${currentEdgeVoice}" falló. Reintentando con voz base (es-MX-DaliaNeural)...`);
    try {
      await sintetizarConEdgeNode('es-MX-DaliaNeural', texto, outputPath);
      return { path: outputPath, ttsProvider: 'edge' };
    } catch(e2) {
      throw new Error(`Edge TTS falló: ${e2.message}`);
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
