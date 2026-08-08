// Mide la transparencia del cabello de la mujer y la dominancia de verde
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9380 + Math.floor(Math.random() * 50);
const URL = 'http://localhost:3002/player?obs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-cdp-hair-' + Date.now(),
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
    const lo = 0.3*0.4 - 0.08, hi = 0.3*0.4 + 0.08;
    // Localizar la silueta de la mujer (pixeles lejos del verde del fondo) y flood-fill desde el centro
    const maskArr = new Uint8Array(c.width * c.height);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y*c.width+x)*4, r=d[i], g=d[i+1], b=d[i+2];
      if (Math.hypot(r-101, g-146, b-65) > 45) maskArr[y*c.width+x] = 1;
    }
    const seen = new Uint8Array(c.width * c.height);
    const stack = [((c.height>>1)*c.width) + (c.width>>1)];
    seen[stack[0]] = 1;
    let bMinY = c.height, bMaxY = 0, bMinX = c.width, bMaxX = 0;
    while (stack.length) {
      const p = stack.pop();
      const px = p % c.width, py = (p / c.width) | 0;
      if (py < bMinY) bMinY = py; if (py > bMaxY) bMaxY = py;
      if (px < bMinX) bMinX = px; if (px > bMaxX) bMaxX = px;
      const nb = [[px-1,py],[px+1,py],[px,py-1],[px,py+1]];
      for (const [nx,ny] of nb) {
        if (nx<0||ny<0||nx>=c.width||ny>=c.height) continue;
        const np = ny*c.width+nx;
        if (!seen[np] && maskArr[np]) { seen[np]=1; stack.push(np); }
      }
    }
    // Cabeza: primer 12% del cuerpo (desde bMinY)
    const headH = Math.floor((bMaxY-bMinY)*0.12);
    const y0 = bMinY, y1 = bMinY + headH;
    const x0 = bMinX, x1 = bMaxX;
    // bbox para reportar
    const bbox = { top: (bMinY/c.height*100).toFixed(1), bottom: ((1-bMaxY/c.height)*100).toFixed(1), w: ((bMaxX-bMinX)/c.width*100).toFixed(1) };
    let semi = 0, opaque = 0, transparent = 0, n = 0;
    let avgAlpha = 0, minAlpha = 1;
    const greens = [];
    const colors = [];
    for (let y = y0; y < y1; y += 4) {
      for (let x = x0; x < x1; x += 4) {
        const i = (y*c.width+x)*4, r=d[i]/255, g=d[i+1]/255, b=d[i+2]/255;
        const Cb = 0.5 - 0.168736*r - 0.331264*g + 0.5*b;
        const Cr = 0.5 + 0.5*r - 0.418688*g - 0.081312*b;
        const diff = Math.hypot(Cb-keyCb, Cr-keyCr);
        let alpha = 0;
        if (diff >= hi) alpha = 1;
        else if (diff > lo) alpha = (diff - lo) / (hi - lo);
        const greenDom = g - Math.max(r, b); // dominancia de verde (negativo = no verde)
        n++;
        avgAlpha += alpha;
        if (alpha < minAlpha) minAlpha = alpha;
        if (alpha < 0.5) transparent++;
        else if (alpha < 0.95) semi++;
        else opaque++;
        greens.push(greenDom);
        if (n <= 14) colors.push('rgb(' + Math.round(r*255) + ',' + Math.round(g*255) + ',' + Math.round(b*255) + ') a=' + alpha.toFixed(2) + ' gDom=' + greenDom.toFixed(3));
      }
    }
    greens.sort((a,b)=>a-b);
    return {
      bbox, n, avgAlpha: +(avgAlpha/n).toFixed(3), minAlpha: +minAlpha.toFixed(3),
      transparentPct: +(transparent/n*100).toFixed(1),
      semiPct: +(semi/n*100).toFixed(1),
      opaquePct: +(opaque/n*100).toFixed(1),
      greenDomP50: +greens[Math.floor(greens.length*0.5)].toFixed(3),
      greenDomP90: +greens[Math.floor(greens.length*0.9)].toFixed(3),
      colors
    };
  })()`);

  console.log('SILUETA mujer: top ' + res.bbox.top + '%, bottom ' + res.bbox.bottom + '%, ancho ' + res.bbox.w + '%');
  console.log('ZONA DEL CABELLO (primer 12% del cuerpo) con tol 0.3 / smooth 0.08:');
  console.log('  n=' + res.n, 'alphaPromedio=' + res.avgAlpha, 'alphaMin=' + res.minAlpha);
  console.log('  transparentes(<0.5): ' + res.transparentPct + '% | semitransparentes: ' + res.semiPct + '% | opacos: ' + res.opaquePct + '%');
  console.log('  dominancia verde en la zona: p50=' + res.greenDomP50 + ' p90=' + res.greenDomP90 + ' (negativo = pelo/ropa, positivo = fondo verde)');
  console.log('  muestras:', res.colors.join(' | '));

  ws.close(); killChrome();
  setTimeout(() => process.exit(0), 300);
}

main().catch(e => { console.log('ERROR:', e.message); try { process.exit(1); } catch (_) {} });
