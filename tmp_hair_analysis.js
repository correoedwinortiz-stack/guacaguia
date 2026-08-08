// Analiza la banda del cabello: fondo vs sujeto, dominancia de verde, alpha con gate
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9440 + Math.floor(Math.random() * 50);
const URL = 'http://localhost:3002/player?obs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-cdp-ha-' + Date.now(),
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
  await sleep(4000);

  // 1) LINK del shader
  const link = await evalJS(`(function(){ return gl.getProgramParameter(prog, gl.LINK_STATUS); })()`);
  console.log('LINK del programa WebGL:', link ? 'OK ✓ (el shader compila)' : 'FALLÓ ✗');

  // 2) Análisis del cabello (sin necesidad de video — usa el frame si cargó)
  const videoOk = await evalJS(`(function(){ const v=activeVid(); return v.readyState>=2 && v.videoWidth>0; })()`);
  if (!videoOk) { console.log('(video no cargó en esta ejecución — se omite el análisis de píxeles)'); ws.close(); killChrome(); setTimeout(() => process.exit(0), 300); return; }

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
    function computeAlpha(r, g, b, gateTh) {
      const Cb = 0.5 - 0.168736*r - 0.331264*g + 0.5*b;
      const Cr = 0.5 + 0.5*r - 0.418688*g - 0.081312*b;
      const diff = Math.hypot(Cb-keyCb, Cr-keyCr);
      let alpha = diff >= hi ? 1 : (diff <= lo ? 0 : (diff-lo)/(hi-lo));
      const greenDom = g - Math.max(r, b);
      const keep = greenDom > gateTh ? 0 : greenDom <= 0 ? 1 : 1 - greenDom/gateTh;
      alpha = alpha + (1-alpha)*keep;
      return { alpha, greenDom, diff };
    }
    // Banda del cabello (x 40-60%, y 23-35%)
    const x0=Math.floor(c.width*0.40), x1=Math.floor(c.width*0.60), y0=Math.floor(c.height*0.23), y1=Math.floor(c.height*0.35);
    let subject=0, bg=0, subAlpha03=0, subAlpha08=0, subGreen=0;
    let bgAlpha03=0, bgAlpha08=0;
    const greenDoms = [];
    for (let y=y0;y<y1;y+=2) for (let x=x0;x<x1;x+=2){
      const i=(y*c.width+x)*4, r=d[i]/255, g=d[i+1]/255, b=d[i+2]/255;
      const isBg = Math.hypot(r*255-101, g*255-146, b*255-65) < 45;
      const a03 = computeAlpha(r,g,b,0.03).alpha, a08 = computeAlpha(r,g,b,0.08).alpha;
      if (isBg) { bg++; bgAlpha03+=a03; bgAlpha08+=a08; }
      else { subject++; subAlpha03+=a03; subAlpha08+=a08; greenDoms.push(g - Math.max(r,b)); }
    }
    greenDoms.sort((a,b)=>a-b);
    return {
      subject, bg,
      subAlpha03avg: +(subAlpha03/subject).toFixed(3),
      subAlpha08avg: +(subAlpha08/subject).toFixed(3),
      bgAlpha03avg: +(bgAlpha03/bg).toFixed(3),
      bgAlpha08avg: +(bgAlpha08/bg).toFixed(3),
      subGreenP10: +greenDoms[Math.floor(greenDoms.length*0.1)].toFixed(3),
      subGreenP50: +greenDoms[Math.floor(greenDoms.length*0.5)].toFixed(3),
      subGreenP90: +greenDoms[Math.floor(greenDoms.length*0.9)].toFixed(3)
    };
  })()`);

  console.log('Banda del cabello (x 40-60%, y 23-35%):');
  console.log('  píxeles: sujeto=' + res.subject + ', fondo=' + res.bg + ' (' + (res.bg/(res.subject+res.bg)*100).toFixed(0) + '% fondo en la banda)');
  console.log('  SUJETO (cabello): alpha con gate 0.03 = ' + res.subAlpha03avg + ' | con gate 0.08 = ' + res.subAlpha08avg);
  console.log('  FONDO en banda:  alpha con gate 0.03 = ' + res.bgAlpha03avg + ' | con gate 0.08 = ' + res.bgAlpha08avg);
  console.log('  dominancia verde del cabello: p10=' + res.subGreenP10 + ' p50=' + res.subGreenP50 + ' p90=' + res.subGreenP90);
  console.log('  (si p90 > 0.03, parte del cabello es verdoso — por spill — y el gate 0.03 lo keyea)');

  ws.close(); killChrome();
  setTimeout(() => process.exit(0), 300);
}

main().catch(e => { console.log('ERROR:', e.message); try { process.exit(1); } catch (_) {} });
