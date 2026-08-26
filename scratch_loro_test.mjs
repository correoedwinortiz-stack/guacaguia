import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { Communicate } from 'edge-tts-universal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, 'sonidos', 'pruebas_loro');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

const baseAudio = path.join(testDir, 'base_dalia.wav');
const texto = "¡Rroa! Hola a todos, soy una guacamaya probando diferentes voces para ver cuál les gusta más. ¿Qué les parece mi nueva voz?";

async function generarBase() {
  console.log('Generando audio base con Dalia...');
  const comm = new Communicate(texto, { voice: 'es-MX-DaliaNeural', volume: '+100%' });
  const chunks = [];
  for await (const chunk of comm.stream()) {
    if (chunk.type === 'audio') chunks.push(chunk.data);
  }
  fs.writeFileSync(baseAudio, Buffer.concat(chunks));
  console.log('Audio base guardado en:', baseAudio);
}

function aplicarFiltro(nombre, filtro) {
  const output = path.join(testDir, `${nombre}.wav`);
  if (fs.existsSync(output)) fs.unlinkSync(output);
  
  const cmd = `ffmpeg -y -i "${baseAudio}" -af "${filtro}" "${output}"`;
  console.log(`\nAplicando ${nombre}: ${filtro}`);
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`✅ ${nombre} guardado.`);
  } catch (err) {
    console.error(`❌ Error en ${nombre}:`, err.message);
  }
}

async function main() {
  await generarBase();

  // V1: Solo tono más agudo (como ardilla, típico de aves)
  // rubberband=pitch=1.4 sube el tono 1.4 veces
  aplicarFiltro('loro_v1_tono_agudo', 'rubberband=pitch=1.5');

  // V2: Tono agudo + Vibrato rápido (le da un toque tembloroso de ave)
  aplicarFiltro('loro_v2_vibrato', 'rubberband=pitch=1.5,vibrato=f=12:d=0.3');

  // V3: Tono agudo + Flanger (le da una resonancia nasal/metálica como el pico de un loro)
  aplicarFiltro('loro_v3_nasal_flanger', 'rubberband=pitch=1.45,flanger=delay=2:depth=2:regen=50:width=80:speed=2');

  // V4: Tono agudo + Tremolo (cambios de volumen rápidos como si graznara) + EQ para quitar bajos
  aplicarFiltro('loro_v4_tremolo_graznido', 'rubberband=pitch=1.4,tremolo=f=10:d=0.5,highpass=f=400,equalizer=f=3000:width_type=q:w=1:g=5');

  // V5: Uso de asetrate/atempo clásico por si rubberband no da el resultado esperado
  aplicarFiltro('loro_v5_clasico_chipmunk', 'asetrate=48000*1.4,aresample=48000,atempo=1/1.4,highpass=f=300');

  console.log('\n¡Todas las pruebas finalizadas! Revisa la carpeta /sonidos/pruebas_loro/');
}

main().catch(console.error);
