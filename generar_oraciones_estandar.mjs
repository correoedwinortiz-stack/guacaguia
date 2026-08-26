// ============================================================
//  📻 Generador de ORACIONES ESTÁNDAR (voz Dalia-MX)
//
//  Genera UNA SOLA VEZ los audios de los mensajes genéricos que
//  el motor rota en idle para promover autocuidado, autoestima,
//  sana convivencia, identidad y prevención del abuso.
//
//  Uso:
//     node generar_oraciones_estandar.mjs        # genera solo los que faltan
//     node generar_oraciones_estandar.mjs --force # regenera TODOS
// ============================================================

process.env.USE_FREE_TTS = 'false';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const oracionesMod = await import('./oraciones.js');
const oraciones    = oracionesMod.default || oracionesMod;
const engineMod    = await import('./prayer-engine-mama.mjs');
const { quitarCierre, leerDuracionWav, esOracionFuerte } = engineMod;

// Forzar voz Dalia-MX para todas las oraciones estándar
oraciones.setEdgeVoice('es-MX-DaliaNeural');

const DIR = path.join(__dirname, 'oraciones_estandar');
fs.mkdirSync(DIR, { recursive: true });

// ── 10 mensajes: prevención del abuso, autocuidado, autoestima, convivencia, identidad ──
const ORACIONES = [
  {
    tema: 'Prevención del abuso',
    texto: 'Amigas y amigos, nadie tiene derecho a tocar tu cuerpo sin tu permiso, ni a hacerte sentir miedo o vergüenza. Si alguien te hace sentir incómodo o te pide guardar secretos que te duelen, habla con un adulto de confianza de inmediato. Tu seguridad es lo más importante y no estás solo ni sola.'
  },
  {
    tema: 'Autocuidado personal',
    texto: 'Cuidarte a ti mismo es el primer paso para cuidar a los demás. Dormir bien, alimentarte, hacer ejercicio y tomarte momentos para descansar no son lujos, son necesidades. Cuando te cuidas, tienes más energía, mejor ánimo y puedes dar lo mejor de ti en la escuela y en casa.'
  },
  {
    tema: 'Construir tu autoestima',
    texto: 'Tú tienes un valor enorme que no depende de tus notas, de tu ropa ni de lo que otros piensen. Cada vez que te hablas con respeto, que intentas algo nuevo o que reconoces tus propios logros, estás fortaleciendo tu autoestima. Trátate con la misma amabilidad que le darías a tu mejor amigo.'
  },
  {
    tema: 'Sana convivencia escolar',
    texto: 'Una escuela donde todos nos sentimos seguros empieza con pequeñas acciones diarias. Saludar con una sonrisa, escuchar cuando alguien habla, no burlarse de los errores ajenos y pedir las cosas con respeto, son hábitos que transforman el ambiente. La convivencia sana se construye entre todos, un detalle a la vez.'
  },
  {
    tema: 'Identidad y diversidad',
    texto: 'Cada persona es única y eso es algo hermoso. Tus gustos, tu forma de hablar, tu historia y tu familia hacen parte de quién eres. Respetar la identidad de los demás, incluso cuando es diferente a la tuya, nos enriquece a todos. La diversidad no es un problema, es la mayor riqueza de nuestra comunidad.'
  },
  {
    tema: 'Pedir ayuda es valiente',
    texto: 'A veces pensamos que pedir ayuda es señal de debilidad, pero en realidad es una de las decisiones más valientes que puedes tomar. Si algo te preocupa, si te sientes triste o si algo no está bien en casa o en la escuela, habla con un maestro, un orientador o un familiar de confianza. No tienes que cargarlo solo.'
  },
  {
    tema: 'Límites y respeto',
    texto: 'Conocer y respetar los límites propios y ajenos es fundamental para vivir en comunidad. Tú tienes derecho a decir no cuando algo te incomoda, y ese no merece ser respetado siempre. Del mismo modo, cuando alguien dice no, debemos aceptarlo con gracia. Los límites son la base del respeto verdadero entre las personas.'
  },
  {
    tema: 'Emociones y manejo del enojo',
    texto: 'El enojo, la tristeza y el miedo son emociones normales que todos sentimos. Lo que importa es qué hacemos con ellas. Antes de reaccionar cuando estás enojado, respira profundo, cuenta hasta diez y piensa en cómo expresar lo que sientes sin lastimar a nadie. Tus emociones tienen un mensaje importante, escúchalas.'
  },
  {
    tema: 'Redes de apoyo',
    texto: 'Nadie está diseñado para estar solo. Tener personas de confianza en tu vida, ya sea un amigo, un familiar o un maestro, hace que los momentos difíciles sean más fáciles de superar. Cultiva esas relaciones con honestidad y cariño. Una red de apoyo sólida es uno de los tesoros más valiosos que puedes tener.'
  },
  {
    tema: 'Orgullo de ser quien eres',
    texto: 'Siéntete orgulloso de quien eres hoy, con tus logros y también con tus áreas de mejora. Crecer implica equivocarse y aprender. Cada error es una lección y cada esfuerzo cuenta. No te compares con los demás, enfócate en tu propio camino. Eres suficiente, eres capaz y tienes un lugar único e importante en este mundo.'
  }
];

// ── Generar audios + manifest ───────────────────────────────
const FORCE = process.argv.includes('--force');
const manifest = [];
let generadas = 0;
let saltadas = 0;
let falladas = 0;

for (let i = 0; i < ORACIONES.length; i++) {
  const { tema, texto } = ORACIONES[i];
  const textoLimpio = quitarCierre(texto);
  const file = `estandar_${String(i + 1).padStart(2, '0')}.wav`;
  const filePath = path.join(DIR, file);

  const existente = !FORCE && fs.existsSync(filePath) ? leerDuracionWav(filePath) : null;
  if (existente) {
    console.log(`\n(${i + 1}/${ORACIONES.length}) ${tema} — ⏭️ ya existe (${(existente / 1000).toFixed(1)}s), se omite. Usa --force para regenerar.`);
    saltadas++;
    manifest.push({ file, tema, text: textoLimpio, audioDurMs: existente, estDurMs: Math.round(textoLimpio.split(/\s+/).length / 165 * 60 * 1000), isStrong: esOracionFuerte(textoLimpio) });
    continue;
  }

  console.log(`\n(${i + 1}/${ORACIONES.length}) ${tema}`);
  try {
    await oraciones.sintetizarVoz(textoLimpio, filePath);
    const wordCount  = textoLimpio.split(/\s+/).length;
    const estDurMs   = Math.round(wordCount / 165 * 60 * 1000);
    const audioDurMs = leerDuracionWav(filePath) || estDurMs;
    manifest.push({ file, tema, text: textoLimpio, audioDurMs, estDurMs, isStrong: esOracionFuerte(textoLimpio) });
    generadas++;
    console.log(`   ✅ ${file} — ${(audioDurMs / 1000).toFixed(1)}s — ${wordCount} palabras`);
  } catch (err) {
    falladas++;
    console.error(`   ❌ Falló ${file}: ${err.message}`);
  }
}

fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\n🎉 ${manifest.length} oraciones estándar listas en ${DIR}/ (${generadas} generadas, ${saltadas} omitidas, ${falladas} falladas)`);
if (falladas > 0) process.exitCode = 1;
