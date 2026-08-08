/**
 * prayer-engine-mama.js
 * Motor de oraciones IA para Live TikTok — Mamá Colombiana
 *
 * Integra con server.mjs mediante:
 *   - WebSocket broadcast para enviar eventos al prayer-player.html
 *   - Gradium TTS (vía oraciones.js) para síntesis de voz
 *   - Groq API (vía oraciones.js)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const oraciones = require('./oraciones.js'); // Importar el script original
const { generarOracion, sintetizarVoz } = oraciones;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Animaciones (nombres de archivo MP4 sin extensión) ────────────────────────
const ANIMATIONS = {
  PRAYING_COMMON: ['Súplica', 'Súplica', 'Súplica', 'Manos al pecho'],
  VICTORY:   ['Ambos brazos alzados'],
  // Ojo: TODOS los nombres deben coincidir con un archivo .mp4 existente en la carpeta.
  IDLE:      ['Respiración calmada', 'Asentir suavemente', 'Cabeza ladeada', 'Manos entrelazadas al frente', 'Respiración visible'],
  ADORACION: ['Una mano alzada con vaivén', 'Ambas manos alzadas con vaivén'],
  CANTANDO:  ['Aplaudiendo al ritmo', 'Puño en alto al ritmo'],
};

// El video de cierre "Declaración de victoria" ya incluye el audio de la frase
// "En el nombre de Jesús, amén y amén" sincronizado con la animación. Por eso
// el texto TTS NO debe contener esa frase (si la IA la escribe de todos modos,
// se elimina aquí): el cierre lo pronuncia el video, no la voz.
function quitarCierre(texto) {
  if (!texto) return texto;
  let t = texto.trim();

  // 1) ¿El texto termina con "amén" / "amén y amén"? Si sí, casi seguro que la
  //    frase "en el nombre de Jesús..." que haya cerca del final es el cierre
  //    (aunque sea largo). Si no termina con amén, solo se elimina la frase si
  //    le siguen pocas palabras (cierre típico corto), para no truncar oraciones
  //    donde la IA la menciona a mitad.
  const terminaAmen = /am[eé]n\s*[.,;:]?\s*$/i.test(t);

  const reFrase = /en\s+el\s+nombre\s+de\s+(jes[úu]s|jesucristo|nuestro\s+se[ñn]or\s+jes[úu]s)/gi;
  let match;
  let ultimoIdx = -1;
  while ((match = reFrase.exec(t)) !== null) ultimoIdx = match.index;
  if (ultimoIdx !== -1) {
    const palabrasResto = t.slice(ultimoIdx).split(/\s+/).filter(Boolean).length;
    if (palabrasResto <= 8 || terminaAmen) {
      t = t.slice(0, ultimoIdx);
    }
  }

  // 2) Quitar "amén" / "amén y amén" sueltos al FINAL.
  t = t.replace(/\s*(am[eé]n\s+y\s+am[eé]n|am[eé]n)\s*[.,;:]?\s*$/i, '');

  // 3) Limpiar puntuación final duplicada y espacios.
  t = t.replace(/[\s.,;:]+$/, '').replace(/\s{2,}/g, ' ').trim();
  return t ? `${t}.` : texto;
}

// Video de cierre según el modo de voz:
//  - USE_FREE_TTS=true  → Edge TTS (voz de Salomé) → "Declaracion de victoria salome"
//  - USE_FREE_TTS=false → Voz clonada (Gradium)    → "Declaración de victoria"
function closingVideoName() {
  return process.env.USE_FREE_TTS === 'true' ? 'Declaracion de victoria salome' : 'Declaración de victoria';
}

// Lee la duración REAL de un archivo WAV parseando su cabecera (RIFF).
// Devuelve ms, o null si no es un WAV válido (p. ej. USE_FREE_TTS genera MP3).
function leerDuracionWav(filePath) {
  try {
    const b = fs.readFileSync(filePath);
    if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') return null;
    let off = 12, sampleRate = 0, channels = 0, bits = 0, dataSize = 0;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const sz = b.readUInt32LE(off + 4);
      // Los campos del chunk 'fmt ' arrancan en off+8 (tras 'fmt ' + tamaño):
      //  +0 formato | +2 canales | +4 sampleRate | +8 byteRate | +12 blockAlign | +14 bits
      if (id === 'fmt ') { sampleRate = b.readUInt32LE(off + 12); channels = b.readUInt16LE(off + 10); bits = b.readUInt16LE(off + 22); }
      if (id === 'data') { dataSize = sz; break; }
      off += 8 + sz + (sz % 2);
    }
    if (!sampleRate || !channels || !bits || !dataSize) return null;
    // Algunos servicios (Gradium/Free.ai) dejan 0xFFFFFFFF en el tamaño del
    // chunk 'data' (escriben el valor al final pero no lo actualizan). En ese
    // caso se calcula el tamaño real hasta el final del archivo.
    const headerBytes = off + 8;
    if (dataSize > b.length - headerBytes) dataSize = b.length - headerBytes;
    return Math.round((dataSize / (sampleRate * channels * (bits / 8))) * 1000);
  } catch (_) { return null; }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Palabras clave de oraciones "fuertes" (batalla espiritual, sanidad, milagro...)
const STRONG_KEYWORDS = /fuerza|poder|libera|sangre|enemigo|guerra|victoria|victorios|vence|rompe|cadena|fuerte|batalla|triunfo|libertad|derrota|atadur|temor|sanidad|milagro/i;
function esOracionFuerte(texto) {
  return STRONG_KEYWORDS.test(texto || '');
}


// ── Detector de petición de oración en chat ───────────────────────────────────
const PRAYER_REGEX = /^\/?(oraci[oó]n|ora\b|oro\s+por|intercede\s+por|pido|reza|por\s+favor\s+or[ae](?:ci[oó]n)?\s+por|petición|peticion)/i;

function esPeticionOracion(msg) {
  return PRAYER_REGEX.test(msg.trim());
}

function extraerPeticion(msg) {
  return msg.replace(PRAYER_REGEX, '').trim();
}

// ── Clase principal PrayerEngine ──────────────────────────────────────────────
export { quitarCierre, leerDuracionWav, esOracionFuerte };

export class PrayerEngine {
  constructor({ broadcast, playAnimation }) {
    this.broadcast      = broadcast;
    this.playAnimation  = playAnimation;

    this.queue          = [];
    this.isProcessing   = false;
    this.idleTimer      = null;
    this.idleInterval   = 3 * 60 * 1000;
    this.totalReceived  = 0;
    this.totalProcessed = 0;
    this.maxQueueSize   = 20;

    this.musicMode      = false;
    this.musicType      = 'alabanza';
    this.musicUrl       = null;   // último URL de música (para re-sync del player)
    this.musicTimer     = null;
    this.priorityUsers  = new Set();
    this.lastPrayerEndedAt = 0;   // momento en que terminó la última oración

    // Oraciones estándar: audios pre-generados con la voz de mamá que se rotan
    // en las oraciones genéricas (idle / tras la música) para NO gastar
    // Gradium/Free.ai en cada ciclo. Se cargan desde oraciones_estandar/manifest.json.
    this.standardEnabled = (process.env.USAR_ORACIONES_ESTANDAR || 'true') !== 'false';
    this.standardPrayers = [];
    this.lastStandardIdx = -1;
    try {
      const manifestPath = path.join(__dirname, 'oraciones_estandar', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (Array.isArray(data) && data.length > 0) {
          this.standardPrayers = data;
          console.log(`📻 ${data.length} oraciones estándar cargadas (${this.standardEnabled ? 'se usarán en genéricas con voz de mamá' : 'desactivadas: USAR_ORACIONES_ESTANDAR=false'})`);
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudo cargar oraciones_estandar/manifest.json:', e.message);
    }
  }

  startMusicMode(type = 'alabanza', customUrl = null) {
    this.musicMode = true;
    this.musicType = type;
    this._cancelIdle();
    
    const duration = Math.floor(Math.random() * 120000) + 180000;
    console.log(`🎵 Modo Música INICIADO (${type}).`);
    
    const musicUrl = customUrl || `/${type}.mp3`;
    this.musicUrl = musicUrl;
    this.broadcast({ type: 'music_start', musicType: type, url: musicUrl });

    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = setTimeout(() => {
      console.log(`⏳ Tiempo de música terminado. Lanzando oración genérica.`);
      this.triggerGeneric();
    }, duration);
  }

  stopMusicMode() {
    this.musicMode = false;
    this.musicUrl = null;
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.broadcast({ type: 'music_stop' });
    this._scheduleIdle();
    console.log(`⏹️ Modo Música DETENIDO.`);
  }

  isBusy() {
    return this.isProcessing || this.queue.length > 0;
  }

  start() {
    console.log('🙏 PrayerEngine Mamá iniciado');
    this._scheduleIdle();
  }

  receiveChatMessage(username, msg, avatar = '') {
    if (!esPeticionOracion(msg)) return false;

    if (this.queue.length >= this.maxQueueSize && !this.priorityUsers.has(username)) {
      console.log(`⚠️ Cola llena (${this.maxQueueSize}), descartando petición de @${username}`);
      return false;
    }

    const peticion = extraerPeticion(msg);
    const item = { username, peticion, tipo: 'petition', avatar };
    
    this.totalReceived++;

    if (this.priorityUsers.has(username)) {
      this.queue.unshift(item);
      this.priorityUsers.delete(username);
      console.log(`🚀 Petición PRIORITARIA #${this.totalReceived} encolada al FRENTE de @${username}`);
    } else {
      this.queue.push(item);
      console.log(`🙏 Petición #${this.totalReceived} encolada de @${username}: "${peticion}"`);
    }

    this.broadcast({ type: 'prayer_queued', username, avatar, queueLength: this.queue.length });

    if (!this.isProcessing) this._processNext();
    return true;
  }

  grantPriority(username) {
    const index = this.queue.findIndex(item => item.username === username);
    if (index !== -1) {
      const [item] = this.queue.splice(index, 1);
      this.queue.unshift(item);
    } else {
      this.priorityUsers.add(username);
    }
  }

  triggerGeneric(tema = null) {
    tema = tema || "bendición para todas las familias que están viendo";
    this.queue.push({ username: null, peticion: null, tipo: 'generic', tema });
    if (!this.isProcessing) this._processNext();
  }

  // Elige al azar una oración estándar sin repetir la última que sonó.
  _pickStandardPrayer() {
    const n = this.standardPrayers.length;
    if (n === 0) return null;
    if (n === 1) return this.standardPrayers[0];
    let idx = this.lastStandardIdx;
    while (idx === this.lastStandardIdx) idx = Math.floor(Math.random() * n);
    this.lastStandardIdx = idx;
    return this.standardPrayers[idx];
  }

  async _processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      if (this.musicMode) {
        this.broadcast({ type: 'music_volume', volume: 1.0 });
        this.broadcast({ type: 'music_start', musicType: this.musicType, url: null });
        
        const duration = Math.floor(Math.random() * 120000) + 180000;
        if (this.musicTimer) clearTimeout(this.musicTimer);
        this.musicTimer = setTimeout(() => {
          this.triggerGeneric();
        }, duration);
      } else {
        this._scheduleIdle();
      }
      return;
    }

    this.isProcessing = true;
    this._cancelIdle();

    const item = this.queue.shift();
    this.totalProcessed++;

    try {
      await this._processPrayer(item);
    } catch (err) {
      console.error('❌ Error procesando oración:', err.message);
    }

    await new Promise(r => setTimeout(r, 1200));
    this._processNext();
  }

  async _processPrayer(item) {
    const { username, peticion, tipo, tema } = item;
    console.log(`\n▶ Procesando oración [${tipo}]${username ? ` — @${username}` : ''}`);

    if (this.musicMode) {
      this.broadcast({ type: 'music_volume', volume: 0.12 });
    }

    this.broadcast({ type: 'prayer_start' });

    // ── Oraciones estándar ──────────────────────────────────────────────────
    // Cuando la voz de mamá es la TTS (USE_FREE_TTS no es 'true'), las oraciones
    // genéricas (idle / tras la música) rotan audios PRE-GENERADOS en disco:
    // cero llamadas a la IA (Groq) y cero a Gradium/Free.ai. Las peticiones de
    // usuarios SIEMPRE se generan en vivo (son únicas).
    let estandarItem = null;
    if (tipo !== 'petition' && this.standardEnabled && this.standardPrayers.length > 0 && process.env.USE_FREE_TTS !== 'true') {
      const pick = this._pickStandardPrayer();
      if (pick && fs.existsSync(path.join(__dirname, 'oraciones_estandar', pick.file))) {
        estandarItem = pick;
      }
    }

    let textoOracion = "";
    let audioUrl     = null;    // URL del audio (estándar) o null → se genera TTS
    let audioRealMs  = null;    // duración real conocida (estándar) o null

    if (estandarItem) {
      textoOracion = estandarItem.text;
      audioUrl     = `/oraciones_estandar/${estandarItem.file}`;
      audioRealMs  = estandarItem.audioDurMs || null;
      console.log(`📻 Oración estándar (sin API, solo disco): ${estandarItem.file} — "${textoOracion.slice(0, 70)}..."`);
    } else {
      try {
        let motivo = "";
        if (tipo === 'petition') {
           motivo = username ? `el usuario ${username} y su petición: ${peticion || 'por su vida'}` : peticion;
        } else {
           motivo = tema;
        }

        textoOracion = await generarOracion(motivo);
        if (!textoOracion) throw new Error('IA devolvió texto vacío');
        console.log(`📝 Oración generada:\n${textoOracion}\n`);
      } catch (err) {
        console.error('⚠️ IA falló, usando respaldo:', err.message);
        textoOracion = username
          ? `Padre celestial, hoy me presento delante de ti para pedirte especialmente por la vida de ${username}. Tú conoces las profundidades de su corazón, sus angustias y sus más grandes necesidades. Te ruego que lo llenes de tu infinita paz, que derrames sobre su casa abundantes bendiciones y que tu Espíritu Santo lo guíe en cada paso que dé de ahora en adelante.`
          : `Padre celestial, te damos gracias por este maravilloso tiempo de comunión. Te ruego que bendigas grandemente a todos los que nos acompañan en esta transmisión el día de hoy. Guarda sus hogares de todo peligro, cubre a sus familias bajo tu manto protector y dales la sabiduría que necesitan para afrontar sus batallas diarias con valentía y fe inquebrantable.`;
      }

      // Normalizar el cierre: garantiza que el audio termine SIEMPRE con
      // "En el nombre de Jesús, amén y amén" (la IA a veces omite el "y amén").
      // El cierre "En el nombre de Jesús..." lo pronuncia el video de victoria:
      // se elimina del texto TTS para que la voz no repita la frase.
      textoOracion = quitarCierre(textoOracion);
    }

    const fileName = `tts_prayer_${crypto.randomBytes(4).toString('hex')}.wav`;
    const filePath = path.join(__dirname, fileName);

    try {
      if (!estandarItem) {
        await sintetizarVoz(textoOracion, filePath);
        setTimeout(() => { try { fs.unlinkSync(filePath); } catch(_) {} }, 90_000);
      }

      // Edge TTS Salome (colombiano) ~ 165 palabras por minuto. El estimado
      // SIEMPRE se recalcula del texto (barato y no depende de datos de disco).
      const wordCount     = textoOracion.split(/\s+/).length;
      const estDurMs      = Math.round(wordCount / 165 * 60 * 1000);
      // Duración REAL del audio: para las estándar viene en el manifest; para
      // las generadas se parsea el WAV. Si no se puede leer (MP3), se estima.
      const wavDurMs     = estandarItem ? audioRealMs : leerDuracionWav(filePath);
      const audioDurMs   = wavDurMs || estDurMs;
      // Safety timeout: el player manda prayer_ended ~4.5s después del audio
      // (mientras reproduce el video de victoria). Con duración real bastan 8s;
      // con la estimación (MP3) damos más margen por si la voz es más lenta.
      const safetyMs = audioDurMs + (wavDurMs ? 8000 : 15000);
      console.log(`⏱️ Audio: ${(audioDurMs/1000).toFixed(1)}s (estimado ${(estDurMs/1000).toFixed(1)}s) | timeout motor: ${(safetyMs/1000).toFixed(1)}s`);

      const isStrong = estandarItem ? !!estandarItem.isStrong : esOracionFuerte(textoOracion);

      // Ya NO se envía closingOffsetMs: el texto TTS no contiene la frase de
      // cierre (la pronuncia el video de victoria), así que el player muestra
      // la victoria cuando el audio TERMINA. El video de cierre depende del
      // modo de voz (Edge TTS → Salomé; clonada → original).
      this.broadcast({
        type:            'execute_prayer',
        url:             estandarItem ? audioUrl : `/${fileName}`,
        username:        username || null,
        text:            textoOracion,
        isStrong:        isStrong,
        estDurMs:        estDurMs,
        audioDurMs:      audioDurMs,
        closingVideo:    closingVideoName(),
      });

      // Esperamos que el cliente mande 'prayer_ended' cuando terminó su coreografía.
      // Si no llega en el tiempo de safety, avanzamos de todas formas.
      await new Promise(resolve => {
        this._prayerResolve = resolve;
        this._prayerTimeout = setTimeout(() => {
          console.warn('⚠️ prayer_ended no llegó a tiempo, avanzando...');
          this.lastPrayerEndedAt = Date.now();
          this._prayerResolve = null;
          resolve();
        }, safetyMs);
      });
      this._prayerResolve = null;

    } catch (err) {
      console.error('⚠️ TTS falló:', err.message);
      this.lastPrayerEndedAt = Date.now();
      await new Promise(r => setTimeout(r, 5000));
    }

    const nextItem = this.queue[0] || null;
    this.broadcast({
      type: 'prayer_done',
      username: item.username || null,
      nextUsername: nextItem ? nextItem.username : null,
    });
  }

  _sendAnimation(animId, speed = 1.0) {
    console.log(`🎬 Animación Mamá: ${animId} (x${speed})`);
    this.broadcast({ type: 'prayer_animation', animation: animId, speed });
  }

  _scheduleIdle() {
    this._cancelIdle();
    this.idleTimer = setTimeout(() => {
      if (!this.isProcessing && this.queue.length === 0) {
        console.log('⏰ Timer idle: generando oración genérica automática');
        this.triggerGeneric();
      }
    }, this.idleInterval);

    // Rotar animaciones de reposo cada 12 segundos mientras está en idle (no
    // durante oraciones o música). Intervalo mayor que antes (8s) para que el
    // player tenga margen de esperar la pose base del video (loop de ~8s) y el
    // corte sea invisible; además reduce la frecuencia de cambios en reposo.
    this.idleAnimTimer = setInterval(() => {
      if (this.isProcessing || this.musicMode) return;  // Nunca durante oraciones o música
      let pick = pickRandom(ANIMATIONS.IDLE);
      while (pick === this.lastIdleAnim && ANIMATIONS.IDLE.length > 1) {
        pick = pickRandom(ANIMATIONS.IDLE);
      }
      this.lastIdleAnim = pick;
      this._sendAnimation(pick);
    }, 12000);
  }

  _cancelIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.idleAnimTimer) clearInterval(this.idleAnimTimer);
    this.idleAnimTimer = null;
  }

  getStatus() {
    return {
      isProcessing:   this.isProcessing,
      queueLength:    this.queue.length,
      queue:          this.queue.map(i => ({ username: i.username, tipo: i.tipo })),
      totalReceived:  this.totalReceived,
      totalProcessed: this.totalProcessed,
      musicMode:      this.musicMode,
      musicType:      this.musicType,
      musicUrl:       this.musicUrl,
      standardEnabled: this.standardEnabled,
      standardCount:  this.standardPrayers.length,
    };
  }

  clearQueue() {
    this.queue = [];
    console.log('🗑️ Cola de oraciones limpiada');
  }

  setIdleInterval(ms) {
    this.idleInterval = ms;
    if (!this.isProcessing) this._scheduleIdle();
  }

  notifyPrayerEnded(username) {
    if (this._prayerResolve) {
      console.log(`✅ Reproductor terminó la oración de ${username || 'genérica'}`);
      clearTimeout(this._prayerTimeout);
      this.lastPrayerEndedAt = Date.now();
      this._prayerResolve();
      this._prayerResolve = null;
      this._prayerTimeout = null;
    }
  }

  // ¿La última oración terminó hace menos de `graceMs` milisegundos?
  // Sirve para que los saludos/seguidores/likes NO interrumpan el regreso
  // al loop de música/adoración justo después de una oración.
  justFinishedPrayer(graceMs = 10000) {
    return (Date.now() - this.lastPrayerEndedAt) < graceMs;
  }
}
