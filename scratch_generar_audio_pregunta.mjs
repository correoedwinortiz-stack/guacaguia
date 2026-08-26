import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.USE_FREE_TTS = 'false';

import oracionesMod from './oraciones.js';
const oraciones = oracionesMod.default || oracionesMod;

oraciones.setEdgeVoice('es-MX-DaliaNeural');

const filePath = path.join(__dirname, 'sonidos', 'nueva_pregunta.wav');

(async () => {
  try {
    console.log('Generando audio...');
    await oraciones.sintetizarVoz('¡Rroa! Hay una nueva pregunta.', filePath);
    console.log('✅ Generado en:', filePath);
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
