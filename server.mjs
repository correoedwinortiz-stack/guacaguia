import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import https from 'https';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection } from 'tiktok-live-connector';
import { createRequire } from 'module';

import { PrayerEngine } from './prayer-engine-mama.mjs';

const require = createRequire(import.meta.url);
const oraciones = require('./oraciones.js');
const { sintetizarVoz, setEdgeVoice } = oraciones;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── IPs de la red local (para abrir el player/admin desde el celular) ──────
function getLanIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '';
// En la nube, Render/Railway nos dará el puerto en process.env.PORT
const PORT = parseInt(process.env.PORT) || parseInt(process.env.HTTP_PORT) || 3002;

if (!TIKTOK_USERNAME || TIKTOK_USERNAME === 'tu_usuario_de_tiktok') {
  console.error('❌ Falta TIKTOK_USERNAME en el archivo .env. Usando modo simulador.');
}

// ─── Anti-Spam: Cloudflare Turnstile ────────────────────────────────────────
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

// ─── Anti-Spam: Rate Limit por IP ───────────────────────────────────────────
// Cada IP puede enviar como máximo RATE_MAX peticiones en RATE_WINDOW_MS ms.
const RATE_WINDOW_MS = 60_000; // 1 minuto
const RATE_MAX       = 2;      // máximo 2 peticiones por minuto
const ipRateMap = new Map();   // ip → { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = ipRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    ipRateMap.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_MAX;
}

// Limpieza periódica para no acumular IPs antiguas en memoria
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of ipRateMap.entries()) {
    if (now > e.resetAt) ipRateMap.delete(ip);
  }
}, 5 * 60_000);

// ─── Anti-Spam: Filtro de palabras prohibidas (cargado desde archivo) ───────
const BAD_WORDS_FILE = path.join(__dirname, 'palabras_prohibidas.txt');

function cargarPalabrasProhibidas() {
  try {
    const raw = fs.readFileSync(BAD_WORDS_FILE, 'utf-8');
    const palabras = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);
    const escaped = palabras.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
  } catch (e) {
    console.warn('[filtro] No se pudo cargar palabras_prohibidas.txt:', e.message);
    // Regex vacía que nunca da match
    return /(?!)/;
  }
}

let BAD_WORDS = cargarPalabrasProhibidas();
console.log(`🚫 Filtro cargado: ${BAD_WORDS.source.split('|').length} término(s) bloqueado(s).`);

// Recarga automática cuando se guarda el archivo (sin reiniciar el servidor)
fs.watchFile(BAD_WORDS_FILE, { interval: 3000 }, () => {
  BAD_WORDS = cargarPalabrasProhibidas();
  console.log(`🔄 palabras_prohibidas.txt actualizado. Términos: ${BAD_WORDS.source.split('|').length}`);
});

function containsBadWords(text) {
  return BAD_WORDS.test(text);
}

// ─── Anti-Spam: Validar token Cloudflare Turnstile ──────────────────────────
// Las IPs locales (LAN / loopback) se saltan la validación de Cloudflare:
// Turnstile rechaza dominios no registrados (error 110200) y en producción
// la clave está ligada al dominio público, no a IPs privadas.
function isLocalIP(ip) {
  if (!ip) return true;
  const s = ip.replace(/^::ffff:/, ''); // normalizar IPv4-mapped
  return s === '127.0.0.1' || s === '::1' ||
    /^10\./.test(s) ||
    /^192\.168\./.test(s) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(s);
}

function validateTurnstile(token, ip) {
  // Bypass para red local
  if (isLocalIP(ip)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const body = JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip });
    const options = {
      hostname: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data).success === true); }
        catch (_) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// Limpiar archivos huérfanos al arrancar
try {
  const huerfanos = fs.readdirSync(__dirname).filter(f => (f.startsWith('tts_') && (f.endsWith('.wav') || f.endsWith('.mp3'))));
  if (huerfanos.length > 0) {
    huerfanos.forEach(f => fs.unlinkSync(path.join(__dirname, f)));
    console.log(`🧹 ${huerfanos.length} archivo(s) TTS huérfano(s) eliminado(s)`);
  }
} catch (e) { }

/* ─── Cargar Regalos Descubiertos ─────────────────────── */
const REGALOS_DESCUBIERTOS_FILE = path.join(__dirname, 'regalos_descubiertos.json');
let regalosDescubiertos = [];
try {
  if (fs.existsSync(REGALOS_DESCUBIERTOS_FILE)) {
    regalosDescubiertos = JSON.parse(fs.readFileSync(REGALOS_DESCUBIERTOS_FILE, 'utf8'));
  }
} catch (e) {
  console.warn("⚠️ No se pudo cargar regalos_descubiertos.json:", e.message);
}

// Cargar configuración de regalos desde disco
const CONFIG_PATH = path.join(__dirname, 'config.json');
let giftConfig = { giftMap: { zona1: [], zona2: [], zona3: [], zona4: [] }, sfxMap: {}, chatCommands: {}, ttsVoice: 'es-MX-DaliaNeural' };
try {
  if (fs.existsSync(CONFIG_PATH)) {
    giftConfig = { ...giftConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
    if (giftConfig.ttsVoice) setEdgeVoice(giftConfig.ttsVoice);
    console.log('⚙️ Configuración cargada.');
  }
} catch (e) { console.warn('⚠️ No se pudo cargar config.json:', e.message); }

// Cargar listas de música
const PLAYLIST_PATH = path.join(__dirname, 'playlists.json');
let playlistConfig = { source: 'default' };
try {
  if (fs.existsSync(PLAYLIST_PATH)) {
    const data = JSON.parse(fs.readFileSync(PLAYLIST_PATH, 'utf-8'));
    playlistConfig.source = data.source || 'default';
  }
} catch (e) { console.warn('⚠️ No se pudo cargar playlists.json:', e.message); }

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ALABANZA_DIR = path.join(UPLOADS_DIR, 'alabanza');
const ADORACION_DIR = path.join(UPLOADS_DIR, 'adoracion');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(ALABANZA_DIR)) fs.mkdirSync(ALABANZA_DIR);
if (!fs.existsSync(ADORACION_DIR)) fs.mkdirSync(ADORACION_DIR);

let overlayConfig = {
  visible: false,
  instruction: '🙏 Escribe en el chat tu petición de oración',
  chatVisible: true,
  gifts: []
};

function resolveGiftLevel(giftName, diamonds) {
  const map = giftConfig.giftMap || {};
  for (const [nivel, names] of Object.entries(map)) {
    if (names.some(n => n.trim().toLowerCase() === giftName.trim().toLowerCase())) {
      return nivel;
    }
  }
  return 'unmapped';
}

/* ─── Servidor WebSocket ──────────────────────────────── */
const wss = new WebSocketServer({ noServer: true });
console.log(`🔌 WebSocket inicializado (compartiendo puerto)`);
const clientes = new Set();

wss.on('connection', (ws) => {
  clientes.add(ws);
  console.log(`🔌 Navegador conectado (${clientes.size} total)`);
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'prayer_ended') {
        prayerEngine.notifyPrayerEnded(data.username);
      }
    } catch (e) {}

    clientes.forEach(client => {
      if (client !== ws && client.readyState === 1) {
        client.send(message.toString());
      }
    });
  });
  ws.on('close', () => {
    clientes.delete(ws);
    console.log(`🔌 Navegador desconectado (${clientes.size} total)`);
  });
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  clientes.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

const prayerEngine = new PrayerEngine({
  broadcast,
  playAnimation: (id) => broadcast({ type: 'prayer_animation', animation: id })
});
prayerEngine.start();
// Iniciar la música de alabanza por defecto
prayerEngine.startMusicMode('alabanza');

/* ─── Cola de Reacciones (regalos, compartidos, seguidores, likes, saludos) ─ */
// Las reacciones se procesan UNA a la vez y espaciadas para que las animaciones
// y audios NO se sobrepongan en el reproductor. Además serializa la generación
// TTS (evita golpear Gradium con peticiones simultáneas → menos errores 429).
let reactionQueue = Promise.resolve();
let reactionQueueLen = 0;
const REACTION_GAP_MS = 4000;   // separación entre reacciones
const REACTION_QUEUE_MAX = 12;  // respaldo máximo; lo que exceda se descarta

function enqueueReaction(task) {
  if (reactionQueueLen >= REACTION_QUEUE_MAX) {
    console.warn('⚠️ Cola de reacciones llena, descartando una reacción');
    return;
  }
  reactionQueueLen++;
  reactionQueue = reactionQueue.then(async () => {
    try { await task(); }
    catch (e) { console.error('❌ Reacción falló:', e.message); }
    reactionQueueLen--;
    await new Promise(r => setTimeout(r, REACTION_GAP_MS));
  });
  return reactionQueue;
}

/* ─── Lógica de Regalos y Reacciones ──────────────────────────── */
async function procesarRegalo(nivelRegalo, username, repeatCount = 1, image = '') {
  let texto = '';
  const animation = 'guacamaya_viene'; // TODOS los regalos → guacamaya_viene.mp4

  const timesTxt = repeatCount > 1 ? `, ${repeatCount} veces` : '';

  if (nivelRegalo === 'unmapped') {
    texto = `Dios te bendiga ${username}`;
  } else if (nivelRegalo === 'zona1') {
    texto = `Gracias por tu ofrenda, ${username}, tu petición es prioridad.`;
  } else if (nivelRegalo.startsWith('zona')) {
    texto = `Bendiciones por ese regalo, ${username}${timesTxt}.`;
  } else {
    texto = `Dios te bendiga ${username}`;
  }

  broadcast({ type: 'popup_message', text: texto });

  // Encadenado: la animación + audio del saludo salen de a uno, sin sobreponerse.
  enqueueReaction(async () => {
    if (prayerEngine.isBusy()) return;

    const fileName = `tts_${crypto.randomBytes(4).toString('hex')}.wav`;
    const filePath = path.join(__dirname, fileName);
    try {
      await sintetizarVoz(texto, filePath);
      broadcast({ type: 'puppy_event', animation, url: `/${fileName}`, loops: repeatCount, image, nivel: nivelRegalo });
      setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) { } }, 60000);
    } catch (err) {
      console.error('Error generando TTS saludo:', err);
      broadcast({ type: 'puppy_event', animation, loops: repeatCount, image, nivel: nivelRegalo });
    }
  });
}

/* ─── Servidor HTTP ───────────────────────────────────── */
const httpServer = http.createServer(async (req, res) => {
  const urlBase = req.url.split('?')[0];

  if (urlBase === '/' || urlBase === '/player') {
    const htmlPath = path.join(__dirname, 'guacamayas-player.html');
    if (!fs.existsSync(htmlPath)) { res.writeHead(404); res.end('guacamayas-player.html no encontrado'); return; }
    // Inyectar el Site Key de Turnstile para que el frontend lo use al renderizar el captcha
    const html = fs.readFileSync(htmlPath, 'utf-8')
      .replace('__TURNSTILE_SITE_KEY__', TURNSTILE_SITE_KEY);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  
  if (urlBase === '/admin') {
    const htmlPath = path.join(__dirname, 'admin_guacamayas.html');
    if (!fs.existsSync(htmlPath)) { res.writeHead(404); res.end('admin_guacamayas.html no encontrado'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(htmlPath));
    return;
  }

  if (urlBase === '/manifest.json') {
    const mPath = path.join(__dirname, 'manifest.json');
    if (fs.existsSync(mPath)) {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Access-Control-Allow-Origin': '*' });
      res.end(fs.readFileSync(mPath));
    } else {
      res.writeHead(404); res.end('manifest.json no encontrado');
    }
    return;
  }

  if (req.url.endsWith('.html')) {
    const filePath = path.join(__dirname, req.url.split('?')[0]);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // Sonidos MP3 de la carpeta /sonidos
  if (req.url.startsWith('/sonidos/') && req.url.endsWith('.mp3')) {
    const fileName = decodeURIComponent(req.url.slice(1)); // quita el /
    const filePath = path.join(__dirname, fileName);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Sonido no encontrado'); return; }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Videos MP4 separados
  if (urlBase.endsWith('.mp4')) {
    const videoName = decodeURIComponent(urlBase.slice(1));
    const filePath = path.join(__dirname, videoName);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Video no encontrado'); return; }
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // Archivos JSON
  const urlPathJson = decodeURIComponent(req.url.split('?')[0]);
  if (urlPathJson.endsWith('.json')) {
    const filePath = path.join(__dirname, urlPathJson);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // Audios
  if (req.url.split('?')[0].endsWith('.mp3') || req.url.split('?')[0].endsWith('.wav')) {
    const filePath = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Audio no encontrado'); return; }
    
    const stat = fs.statSync(filePath);
    // Detectar el tipo REAL por el contenido: edge-tts (USE_FREE_TTS) genera MP3
    // aunque el archivo se llame .wav (nombres heredados del flujo Gradium).
    let contentType = 'audio/mpeg';
    try {
      const head = fs.readFileSync(filePath, { encoding: 'latin1' }).slice(0, 4);
      if (head === 'RIFF') contentType = 'audio/wav';
    } catch (_) {
      contentType = filePath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
    }
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // Imágenes
  const urlPath = req.url.split('?')[0];
  if (urlPath.match(/\.(webp|png|jpg|jpeg|gif|ico)$/i)) {
    const filePath = path.join(__dirname, decodeURIComponent(urlPath));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(urlPath).toLowerCase();
      const contentType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.ico' ? 'image/x-icon' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // APIs Engine
  if (req.url === '/api/prayer-status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(prayerEngine.getStatus()));
    return;
  }

  if (req.url === '/api/prayer-generic' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        prayerEngine.triggerGeneric(data.tema || null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  if (req.url === '/api/prayer-clear' && req.method === 'POST') {
    prayerEngine.clearQueue();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.url === '/api/prayer-simulate' && req.method === 'POST') {
    // Obtener IP real (Render usa proxy, la IP real viene en x-forwarded-for)
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const username = (data.username || 'Visitante').trim().slice(0, 30);
        const peticion = (data.peticion || '').trim().slice(0, 200);
        const token    = data.turnstileToken || '';

        // 1) Rate Limit por IP
        if (!checkRateLimit(ip)) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'rate_limit', message: 'Espera un momento antes de enviar otra petición.' }));
          return;
        }

        // 2) Filtro de palabras prohibidas
        if (containsBadWords(peticion) || containsBadWords(username)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'bad_words', message: 'Tu mensaje contiene palabras no permitidas.' }));
          return;
        }

        // 3) Validación Cloudflare Turnstile
        const turnstileOk = await validateTurnstile(token, ip);
        if (!turnstileOk) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'captcha', message: 'Verificación de seguridad fallida. Intenta de nuevo.' }));
          return;
        }

        // ✅ Todo OK: encolar la petición de oración
        // Nota: prayerEngine.receiveChatMessage ya hace broadcast({ type: 'prayer_queued', username, ... })
        // NO duplicar el broadcast aquí o se pisará el nombre.
        prayerEngine.receiveChatMessage(username, `/oracion ${peticion}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, username, peticion }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  // ── Admin: Login (valida contraseña desde .env) ──────────────────────────────
  if (req.url === '/api/admin/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');
        const correctPassword = process.env.ADMIN_PASSWORD || 'admin';
        if (password === correctPassword) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Contraseña incorrecta.' }));
        }
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  // ── Admin: Actualizar Manual de Convivencia desde URL ─────────────────────────
  if (req.url === '/api/admin/update-manual' && req.method === 'POST') {
    // Verificar contraseña via header Authorization
    const adminPwd = process.env.ADMIN_PASSWORD || 'admin';
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${adminPwd}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'No autorizado.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { url: pdfUrl } = JSON.parse(body || '{}');
        if (!pdfUrl || !pdfUrl.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Debes proporcionar una URL del PDF.' }));
          return;
        }
        // Iniciar procesamiento sin bloquear la respuesta HTTP
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Procesando PDF... sigue el progreso en la consola del servidor.' }));

        // Ejecutar en background
        const { createRequire } = await import('module');
        const req2 = createRequire(import.meta.url);
        const { extractPdf } = req2('./extract_pdf.js');
        try {
          broadcast({ type: 'admin_log', level: 'info', msg: `🔄 Actualizando Manual desde: ${pdfUrl}` });
          const result = await extractPdf(pdfUrl.trim(), {
            onLog: (msg) => {
              console.log('[update-manual]', msg);
              broadcast({ type: 'admin_log', level: 'ok', msg });
            }
          });
          broadcast({ type: 'admin_log', level: 'ok', msg: `✅ Manual actualizado: ${result.chunks} chunks generados. El RAG ya está activo con el nuevo manual.` });
          console.log('[update-manual] ✅ Completado. El RAG recargará automáticamente en los próximos segundos.');
        } catch (err) {
          console.error('[update-manual] Error:', err.message);
          broadcast({ type: 'admin_log', level: 'error', msg: `❌ Error al procesar PDF: ${err.message}` });
        }
      } catch (e) { console.error('[update-manual]', e.message); }
    });
    return;
  }

  // ── Simular Petición desde el ADMIN (Sin Captcha ni Rate Limit) ─────────────
  if (req.url === '/api/admin/prayer-simulate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const username = (data.username || 'Admin').trim().slice(0, 30);
        const peticion = (data.peticion || '').trim().slice(0, 200);
        // prayer-engine ya hace broadcast de prayer_queued con username
        prayerEngine.receiveChatMessage(username, `/oracion ${peticion}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, username, peticion }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  // ── Ping keep-alive (para monitorear desde otra VM) ──────────────────────
  if (req.url === '/ping' && req.method === 'GET') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconocida';
    const hora = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
    console.log(`🏓 [${hora}] PING recibido desde IP: ${ip}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Admin Config
  if (req.url === '/admin/music' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (data.action === 'start') {
          let customUrl = null;
          const dir = path.join(UPLOADS_DIR, data.type);
          const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3')) : [];
          if (data.file && files.includes(data.file)) {
            customUrl = path.join(dir, data.file); // canción elegida explícitamente en el panel
          } else if (playlistConfig.source === 'custom' && files.length > 0) {
            customUrl = path.join(dir, files[Math.floor(Math.random() * files.length)]);
          }
          prayerEngine.startMusicMode(data.type, customUrl);
        } else if (data.action === 'stop') {
          prayerEngine.stopMusicMode();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }



  if (urlBase === '/api/stream-audio' && req.method === 'GET') {

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const audioPath = parsedUrl.searchParams.get('path');
    if (!audioPath || !fs.existsSync(audioPath)) {
      res.writeHead(404); res.end('Audio no encontrado'); return;
    }
    const stat = fs.statSync(audioPath);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(audioPath).pipe(res);
    return;
  }

  if (urlBase === '/api/playlists' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const alabanzaFiles = fs.existsSync(ALABANZA_DIR) ? fs.readdirSync(ALABANZA_DIR).filter(f => f.toLowerCase().endsWith('.mp3')) : [];
    const adoracionFiles = fs.existsSync(ADORACION_DIR) ? fs.readdirSync(ADORACION_DIR).filter(f => f.toLowerCase().endsWith('.mp3')) : [];
    res.end(JSON.stringify({ source: playlistConfig.source, alabanza: alabanzaFiles, adoracion: adoracionFiles }));
    return;
  }

  if (urlBase === '/api/playlists' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (data.source) playlistConfig.source = data.source;
        fs.writeFileSync(PLAYLIST_PATH, JSON.stringify(playlistConfig, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  // Subir archivo de música (alabanza / adoración)
  if (urlBase === '/api/upload-music' && req.method === 'POST') {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const type = parsedUrl.searchParams.get('type');
    const name = path.basename(parsedUrl.searchParams.get('name') || '');
    if (!type || !name || (type !== 'alabanza' && type !== 'adoracion') || !name.toLowerCase().endsWith('.mp3')) {
      res.writeHead(400); res.end('Invalid params'); return;
    }
    const dest = path.join(UPLOADS_DIR, type, name);
    const writeStream = fs.createWriteStream(dest);
    writeStream.on('error', (err) => {
      console.error('❌ Error escribiendo archivo subido:', err.message);
      if (!res.headersSent) { res.writeHead(500); res.end('Write error'); }
    });
    req.on('error', (err) => {
      console.error('❌ Error en petición de subida:', err.message);
      writeStream.destroy();
    });
    req.pipe(writeStream);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, file: name }));
    });
    return;
  }

  // Eliminar archivo de música
  if (urlBase === '/api/delete-music' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (data.type && data.name) {
          const file = path.join(UPLOADS_DIR, data.type, path.basename(data.name));
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  if (req.url === '/admin/chroma' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        broadcast({ type: 'chroma_update', color: data.color, tolerance: data.tolerance, smoothing: data.smoothing });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  if (req.url === '/api/overlay' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(overlayConfig));
    return;
  }

  if (req.url === '/admin/overlay' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        overlayConfig = { ...overlayConfig, ...data };
        broadcast({ type: 'overlay_update', ...overlayConfig });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  if (req.url === '/api/get-gift-config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(giftConfig));
    return;
  }

  if (req.url === '/api/save-gift-config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        giftConfig = data;
        if (giftConfig.ttsVoice) setEdgeVoice(giftConfig.ttsVoice);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(giftConfig, null, 2), 'utf-8');
        broadcast({ type: 'config_updated' });
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  if (req.url === '/api/get-discovered-gifts' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(regalosDescubiertos));
    return;
  }

  if (req.url.startsWith('/play/') && !req.url.startsWith('/play/category')) {
    const animId = decodeURIComponent(req.url.split('/play/')[1]);
    // fast:true → el player responde de inmediato (tope corto) en vez de
    // esperar la pose base del video actual (los botones del admin se sienten
    // responsivos; el idle del motor usa el corte invisible por pose base).
    broadcast({ type: 'prayer_animation', animation: animId, fast: true });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, animation: animId }));
    return;
  }

  if (urlBase === '/api/network' && req.method === 'GET') {
    const ips = getLanIPs();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      lanIPs: ips,
      httpPort: PORT,
      wsPort: PORT,
      playerUrls: ips.map(ip => `http://${ip}:${PORT}/player`),
      adminUrls: ips.map(ip => `http://${ip}:${PORT}/admin`)
    }));
    return;
  }

  res.writeHead(404); res.end('404');
});

httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🙏 Oraciones Mamá Live`);
  console.log(`   Reproductor  → http://localhost:${PORT}/player`);
  console.log(`   Reproductor OBS → http://localhost:${PORT}/player?obs`);
  console.log(`   Admin        → http://localhost:${PORT}/admin`);
  const ips = getLanIPs();
  if (ips.length > 0) {
    console.log(`\n📱 Abre el reproductor desde tu celular (misma red WiFi):`);
    ips.forEach(ip => {
      console.log(`   📺 Player → http://${ip}:${PORT}/player`);
      console.log(`   🎛️ Admin  → http://${ip}:${PORT}/admin`);
    });
  }
  console.log('');
});

/* ─── Conexión a TikTok Live ─────────────────────────── */
if (TIKTOK_USERNAME && TIKTOK_USERNAME !== 'tu_usuario_de_tiktok') {
  const connection = new TikTokLiveConnection(TIKTOK_USERNAME, {
    processInitialData: false,
    enableWebsocketUpgrade: true,
  });

  const getUniqueId = (data) => (data.user || {}).displayId || 'anon';
  const getAvatarUrl = (data) => (data.user || {}).avatarThumb?.urlList?.[0] || '';

  connection.on('connected', () => {
    console.log(`\n✅ Conectado al LIVE de @${TIKTOK_USERNAME}`);
  });

  connection.on('gift', (data) => {
    const giftName = data.giftName ?? data.gift?.name ?? 'Desconocido';
    const diamonds = data.diamondCount ?? data.gift?.diamondCount ?? 0;
    const username = getUniqueId(data);
    const repeatEnd = data.repeatEnd ?? true;
    const repeatCount = data.repeatCount ?? 1;
    const giftType = data.giftType ?? 1;
    const giftId = data.giftId ?? data.gift?.gift_id ?? data.gift?.id;
    const image = data.giftPictureUrl ?? data.gift?.image?.urlList?.[0] ?? data.gift?.image?.url_list?.[0] ?? data.gift?.icon?.url_list?.[0] ?? data.gift?.icon?.urlList?.[0] ?? '';

    if (giftId && giftId !== 'undefined') {
      const idStr = String(giftId);
      if (!regalosDescubiertos.some(r => String(r.id) === idStr)) {
        regalosDescubiertos.push({ id: idStr, nombre: giftName, monedas: diamonds, imagen: image });
        fs.writeFileSync(REGALOS_DESCUBIERTOS_FILE, JSON.stringify(regalosDescubiertos, null, 2), 'utf8');
        console.log(`🆕 Nuevo regalo: ${giftName} (ID: ${idStr})`);
      }
      if (overlayConfig.priorityGiftId && idStr === overlayConfig.priorityGiftId) {
        prayerEngine.grantPriority(username);
      }
    }

    if (giftType === 1 && !repeatEnd) return;

    const nivel = resolveGiftLevel(giftName, diamonds);
    console.log(`🎁 ${giftName} (💎${diamonds} x${repeatCount}) de @${username} → ${nivel}`);
    procesarRegalo(nivel, username, repeatCount, image);
  });

  let likeCounter = 0;
  connection.on('like', async (data) => {
    const likes = typeof data.likeCount === 'number' ? data.likeCount : 1;
    const username = getUniqueId(data) || 'Alguien';
    likeCounter += likes;

    if (likeCounter >= 100) {
      likeCounter = likeCounter % 100;
      const texto = `Dios te bendiga por compartir ${username}`;
      broadcast({ type: 'popup_message', text: texto });

      if (prayerEngine.justFinishedPrayer()) return; // sin saludos justo tras una oración

      enqueueReaction(async () => {
        if (prayerEngine.isBusy()) return;

        const fileName = `tts_like_${crypto.randomBytes(4).toString('hex')}.wav`;
        const filePath = path.join(__dirname, fileName);
        try {
          await sintetizarVoz(texto, filePath);
          broadcast({ type: 'puppy_event', animation: 'guacamaya_viene', url: `/${fileName}` });
          setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) { } }, 60000);
        } catch (err) {
          broadcast({ type: 'puppy_event', animation: 'guacamaya_viene' });
        }
      });
    }
  });

  connection.on('follow', async (data) => {
    const username = getUniqueId(data) || 'Alguien';
    console.log(`🏃 Nuevo seguidor: @${username}`);
    const texto = `Gracias por seguirme ${username}`;
    
    broadcast({ type: 'popup_message', text: texto });

    if (prayerEngine.justFinishedPrayer()) return; // sin saludos justo tras una oración

    enqueueReaction(async () => {
      if (prayerEngine.isBusy()) return;

      const fileName = `tts_follow_${crypto.randomBytes(4).toString('hex')}.wav`;
      const filePath = path.join(__dirname, fileName);
      try {
        await sintetizarVoz(texto, filePath);
        broadcast({ type: 'puppy_event', animation: 'guacamaya_viene', url: `/${fileName}` });
        setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) { } }, 60000);
      } catch (err) {
        broadcast({ type: 'puppy_event', animation: 'guacamaya_viene' });
      }
    });
  });

  // Saludo por compartir: UNA sola vez por usuario y por directo (vive mientras
  // el proceso del server esté arriba; se reinicia al reiniciar el server para
  // un nuevo directo). Los compartidos repetidos del mismo usuario se omiten
  // por completo (sin popup ni TTS).
  const greetedShares = new Set();
  connection.on('share', async (data) => {
    const username = getUniqueId(data) || 'Alguien';
    if (greetedShares.has(username)) {
      console.log(`📤 Compartido repetido de @${username} → saludo omitido (ya saludó)`);
      return;
    }
    greetedShares.add(username);
    console.log(`📤 Nuevo compartido: @${username}`);
    const texto = `Gracias por compartir la transmisión ${username}`;

    broadcast({ type: 'popup_message', text: texto });

    if (prayerEngine.justFinishedPrayer()) return; // sin saludos justo tras una oración

    enqueueReaction(async () => {
      if (prayerEngine.isBusy()) return;

      const fileName = `tts_share_${crypto.randomBytes(4).toString('hex')}.wav`;
      const filePath = path.join(__dirname, fileName);
      try {
        await sintetizarVoz(texto, filePath);
        broadcast({ type: 'puppy_event', animation: 'guacamaya_viene', url: `/${fileName}` });
        setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) { } }, 60000);
      } catch (err) {
        broadcast({ type: 'puppy_event', animation: 'guacamaya_viene' });
      }
    });
  });

  connection.on('chat', async (data) => {
    const msg = data.comment || data.content || '';
    const username = getUniqueId(data) || data.user?.uniqueId || 'Alguien';
    const avatar = getAvatarUrl(data);

    // Oraciones
    // Filtro de palabras prohibidas: ignorar mensajes irrespetuosos de TikTok
    if (containsBadWords(msg) || containsBadWords(username)) {
      console.log(`🚫 Mensaje bloqueado de @${username}: contiene términos no permitidos.`);
      return;
    }

    const handled = prayerEngine.receiveChatMessage(username, msg, avatar);
    // prayer-engine ya hace broadcast de prayer_queued con username
    if (handled) {
      return;
    }

    // Saludos
    const regexSaludo = /\b(hola|holis|buenas|saludos|hi|hello|bendiciones)\b/i;
    if (regexSaludo.test(msg)) {
      if (prayerEngine.justFinishedPrayer()) return; // sin saludos justo tras una oración

      enqueueReaction(async () => {
        if (prayerEngine.isBusy()) return;
        const texto = `Bendiciones ${username}`;
        const fileName = `tts_saludo_${crypto.randomBytes(4).toString('hex')}.wav`;
        const filePath = path.join(__dirname, fileName);
        try {
          await sintetizarVoz(texto, filePath);
          broadcast({ type: 'puppy_event', animation: 'guacamaya_viene', url: `/${fileName}` });
          setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) { } }, 60000);
        } catch (err) {
          broadcast({ type: 'puppy_event', animation: 'guacamaya_viene' });
        }
      });
    }
  });

  let lastMemberJoin = 0;
  let memberCount = 0;
  connection.on('member', (data) => {
    const now = Date.now();
    if (now - lastMemberJoin > 5000) {
      lastMemberJoin = now;
      memberCount++;
      const username = getUniqueId(data) || 'Alguien';
      if (memberCount % 10 === 0) {
        enqueueReaction(() => { broadcast({ type: 'puppy_event', animation: 'guacamayas_default1' }); });
      }
    }
  });

  connection.on('disconnected', () => {
    console.log('\n⚠️ Desconectado de TikTok. Reconectando en 30s...');
    setTimeout(() => {
      connection.connect().catch(e => console.error("Error al reconectar:", e.message));
    }, 30000);
  });

  connection.on('error', (err) => {
    console.error('❌ Error TikTok:', err.message || err);
  });

  connection.connect().catch(err => {
    console.error(`❌ Error al conectar a TikTok: ${err.message}`);
  });

} else {
  console.log('\n⚠️ Modo simulador (sin TikTok). Prueba usando el panel admin.\n');
}

process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  wss.close();
  httpServer.close();
  process.exit(0);
});
