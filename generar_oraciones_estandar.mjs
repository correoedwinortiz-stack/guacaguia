// ============================================================
//  📻 Generador de ORACIONES ESTÁNDAR (voz de mamá)
//
//  Genera UNA SOLA VEZ los audios de las oraciones genéricas que
//  el motor rota en idle / tras la música, para NO gastar Gradium
//  ni Free.ai en cada ciclo. Resultado:
//     oraciones_estandar/estandar_XX.wav  +  manifest.json
//
//  Uso (fuerza la voz de mamá aunque .env tenga USE_FREE_TTS=true):
//     node generar_oraciones_estandar.mjs        # genera solo los que faltan
//     node generar_oraciones_estandar.mjs --force # regenera TODOS
// ============================================================

// IMPORTANTE: forzar la voz de mamá ANTES de cargar el módulo (por eso la
// importación es dinámica: los `import` estáticos se ejecutarían primero).
process.env.USE_FREE_TTS = 'false';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const oracionesMod = await import('./oraciones.js');
const oraciones    = oracionesMod.default || oracionesMod;
const engineMod    = await import('./prayer-engine-mama.mjs');
const { quitarCierre, leerDuracionWav, esOracionFuerte } = engineMod;

const DIR = path.join(__dirname, 'oraciones_estandar');
fs.mkdirSync(DIR, { recursive: true });

// ── Las 6 oraciones estándar (estilo mamá colombiana, 80-95 palabras) ──────
// OJO: no deben terminar con "En el nombre de Jesús, amén y amén" ni con
// "Amén" suelto: esa frase la pronuncia el video de cierre de la transmisión.
const ORACIONES = [
  {
    tema: 'Bendición para quienes ven la transmisión',
    texto: 'Padre celestial, te damos gracias por este maravilloso tiempo de comunión. Te ruego que bendigas grandemente a todos los que nos acompañan en esta transmisión el día de hoy. Guarda sus hogares de todo peligro, cubre a sus familias bajo tu manto protector y dales la sabiduría que necesitan para afrontar sus batallas diarias con valentía y fe inquebrantable. Que cada corazón que está viendo sienta tu presencia real y tu amor que consuela. Te pedimos que multipliques sus alegrías, que sanes sus heridas y que les des la certeza de que nunca están solos, porque tú caminas a su lado siempre.'
  },
  {
    tema: 'Sanidad para los enfermos',
    texto: 'Señor Jesús, tú que eres el médico de los médicos, hoy te presento a todos los que están atravesando una enfermedad. Toca sus cuerpos con tu poder sanador, restaura cada célula, cada órgano, cada parte de su ser. Que la medicina haga su trabajo y que tu mano divina haga el milagro. Alivia el dolor de quienes sufren, fortalece a los que cuidan de ellos y llena sus hogares de esperanza. Te pedimos fe para esperar en ti, paciencia en los días difíciles y la certeza de que tu plan es de restauración completa. Sana también las heridas del alma, que son las más profundas, y devuélveles la paz.'
  },
  {
    tema: 'Provisión y trabajo',
    texto: 'Padre celestial, hoy te encomiendo a todos los que están buscando trabajo o luchando por el sustento de su familia. Tú conoces cada necesidad antes de que la expresemos. Abre puertas que nadie puede cerrar, provee de maneras que no imaginamos y bendice el trabajo de sus manos. Que llegue la oportunidad esperada, que los salarios sean justos y que nunca falte el pan en sus mesas. Te pedimos que los libres de la angustia y les des creatividad e inteligencia para avanzar. Confiamos en tu provisión abundante, porque tú eres el Dios que alimenta a las aves y viste los lirios del campo, y cuánto más cuidarás de tus hijos.'
  },
  {
    tema: 'Paz y alivio de la ansiedad',
    texto: 'Señor Jesús, te presento a todos los que están cargando ansiedad, miedo y preocupación. Tú dijiste que vengamos a ti los que estamos cansados y cargados, que tú nos darás descanso. Toma de sus hombros ese peso que no pueden llevar. Calma sus pensamientos en medio de la noche, dales un sueño tranquilo y la certeza de que mañana tendrás nuevas misericordias. Que tu paz, esa que sobrepasa todo entendimiento, guarde sus corazones y sus mentes. Enséñales a soltar el control y a descansar en tus promesas. Que sientan que tú estás a cargo, y que eso les baste para vivir serenos.'
  },
  {
    tema: 'Gratitud por las bendiciones',
    texto: 'Padre celestial, hoy quiero darte gracias por las bendiciones que derramas sobre nuestras vidas cada día. Gracias por el alimento en la mesa, por el techo que nos cubre, por la salud, por la familia y los amigos. Gracias por las pequeñas cosas que a veces pasamos por alto: una sonrisa, un abrazo, una palabra de aliento a tiempo. Te pedimos un corazón agradecido que reconozca tu bondad en todo. Que la gratitud sea nuestro lenguaje diario y que, al ser bendecidos, seamos también bendición para los demás. Enséñanos a valorar lo que tenemos mientras trabajamos por lo que soñamos.'
  },
  {
    tema: 'Protección en los viajes',
    texto: 'Padre celestial, te encomiendo a todos los que están en camino, de viaje o emprendiendo algo nuevo. Guárdalos en cada carretera, en cada vuelo, en cada paso que den. Manda tus ángeles para que los acompañen y los protejan de todo peligro. Que lleguen sanos y salvos a sus destinos y que cada viaje sea una oportunidad para ver tu fidelidad. Te pedimos que los rodees con tu presencia, que les des discernimiento en las decisiones y que ningún mal se acerque a sus vidas. Que su regreso a casa sea con alegría y con historias de tu cuidado.'
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

  // Idempotencia: si el audio ya existe y se puede leer su duración, se salta
  // (no se vuelve a gastar TTS). Usa --force para regenerar todos.
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
