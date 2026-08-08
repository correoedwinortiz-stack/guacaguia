// Solo verifica que el shader compila/links (no necesita el video)
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9420 + Math.floor(Math.random() * 50);
const URL = 'http://localhost:3002/player?obs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-cdp-sh-' + Date.now(),
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

  const res = await evalJS(`(function(){
    const linkOk = gl.getProgramParameter(prog, gl.LINK_STATUS);
    const vLog = gl.getShaderInfoLog(compileShaderRef ? compileShaderRef : null);
    let fsLog = '';
    try {
      // recompilar el fragment shader para ver errores
      const s = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(s, document.querySelector('script').textContent.match(/const FS = \\\`([\\\\s\\\\S]*?)\\\`;/)[1]);
      gl.compileShader(s);
      fsLog = gl.getShaderInfoLog(s) || '';
    } catch (e) { fsLog = 'ERR: ' + e.message; }
    return { linkOk, fsLog };
  })()`);

  console.log('LINK del programa WebGL:', res.linkOk ? 'OK ✓' : 'FALLÓ ✗');
  console.log('log fragment shader:', res.fsLog || '(sin errores)');
  if (!res.linkOk) console.log('¡El shader no compila! Revisar la edición.');

  ws.close(); killChrome();
  setTimeout(() => process.exit(0), 300);
}

main().catch(e => { console.log('ERROR:', e.message); try { process.exit(1); } catch (_) {} });
