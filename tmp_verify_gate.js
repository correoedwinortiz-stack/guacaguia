// Verifica la protección (gate) del shader: pelo opaco + fondo limpio
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 50);
const URL = 'http://localhost:3002/player?obs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-cdp-gate-' + Date.now(),
    '--window-size=320,569', '--force-device-scale-factor=1', 'about:blank'
  ], { stdio: 'ignore' });
  const killChrome = () => { try { chrome.kill(); } catch (_) {} };

  let target = null;
  for (let i = 0; i < 50; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) { target = page; break; }
    } catch (_) {}
  }
  if (!target) { console.log('FALLO: no target'); killChrome(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let msgId = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  function send(method, params = {}) {
    return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  }
  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error('JS error: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(4500);

  await evalJS(`switchAnimation('Súplica'); 'ok'`);
  let ready = false;
  for (let i = 0; i < 35; i++) {
    await sleep(400);
    ready = await evalJS(`(function(){ const v=activeVid(); return v.readyState>=2 && v.videoWidth>0 && !isSwapping; })()`);
    if (ready) break;
  }
  if (!ready) { console.log('FALLO: video no cargó'); ws.close(); killChrome(); process.exit(1); }

  const res = await evalJS(`(function(){
    const v = activeVid();
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    const key = [101/255, 146/255, 65/255];
    const keyCb = 0.5 - 0.168736*key[0] - 0.331264*key[1] + 0.5*key[2];
    const keyCr = 0.5 + 0.5*key[0] - 0.418688*key[1] - 0.081312*key[2];
    const baseTol = 0.3*0.4, lo = baseTol - 0.08, hi = baseTol + 0.08;
    function alphaAt(x, y) {
      const i = (y*c.width+x)*4, r=d[i]/255, g=d[i+1]/255, b=d[i+2]/255;
      const Cb = 0.5 - 0.168736*r - 0.331264*g + 0.5*b;
      const Cr = 0.5 + 0.5*r - 0.418688*g - 0.081312*b;
      const diff = Math.hypot(Cb-keyCb, Cr-keyCr);
      let alpha = diff >= hi ? 1 : (diff <= lo ? 0 : (diff-lo)/(hi-lo));
      // gate (igual que el shader)
      const greenDom = g - Math.max(r, b);
      const keep = 1 - (greenDom > 0.03 ? 1 : greenDom <= 0 ? 0 : greenDom/0.03);
      alpha = alpha + (1 - alpha) * keep;
      return alpha;
    }
    // Promediar zonas
    function zone(x0, x1, y0, y1) {
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { sum += alphaAt(x, y); n++; }
      return +(sum/n).toFixed(3);
    }
    const w = c.width, h = c.height;
    return {
      fondoArriba: zone(Math.floor(w*0.3), Math.floor(w*0.7), 5, Math.floor(h*0.10)),
      fondoEsquinas: zone(10, 60, 10, 60) + ' / ' + zone(w-60, w-10, 10, 60),
      cabelloBand: zone(Math.floor(w*0.42), Math.floor(w*0.58), Math.floor(h*0.24), Math.floor(h*0.34)),
      rostroBand: zone(Math.floor(w*0.44), Math.floor(w*0.56), Math.floor(h*0.34), Math.floor(h*0.44)),
      vestido: zone(Math.floor(w*0.44), Math.floor(w*0.56), Math.floor(h*0.55), Math.floor(h*0.75))
    };
  })()`);

  console.log('Con el gate activo (tol 0.3 / smooth 0.08 / #659241):');
  console.log('  fondo arriba:      alpha = ' + res.fondoArriba + (res.fondoArriba < 0.05 ? ' (limpio ✓)' : ' (¡MUY MAL!)'));
  console.log('  fondo esquinas:    alpha = ' + res.fondoEsquinas + (res.fondoEsquinas.split(' / ').every(x=>parseFloat(x)<0.05) ? ' (limpio ✓)' : ' (¡MAL!)'));
  console.log('  CABELLO (banda):   alpha = ' + res.cabelloBand + (res.cabelloBand > 0.85 ? ' (opaco ✓)' : ' (transparente ✗)'));
  console.log('  rostro:            alpha = ' + res.rostroBand + (res.rostroBand > 0.85 ? ' (opaco ✓)' : ' (parcial)'));
  console.log('  vestido:           alpha = ' + res.vestido + (res.vestido > 0.85 ? ' (opaco ✓)' : ' (parcial)'));

  // Screenshot para vista visual
  await evalJS(`(function(){ document.body.style.background = '#1a1d24'; })()`);
  await evalJS(`(function(){ ['Carlos1','Ana1'].forEach(n => petitionerManager.addPetitioner(n, null)); })()`);
  await sleep(1300);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('vista_previa_2_peticionarios.png', Buffer.from(s.result.data, 'base64'));
  console.log('captura: vista_previa_2_peticionarios.png');

  ws.close(); killChrome();
  setTimeout(() => process.exit(0), 300);
}

main().catch(e => { console.log('ERROR:', e.message); try { process.exit(1); } catch (_) {} });
