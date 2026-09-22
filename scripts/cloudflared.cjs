// Tunnel test bằng Cloudflare (thay ngrok):
// - KHÔNG có trang chặn "Visit Site", điện thoại mở link là vào thẳng app
// - free, không cần tài khoản; URL ngẫu nhiên *.trycloudflare.com mỗi lần mở
//   (xem URL trong cửa sổ này hoặc file public-url.txt)
// Chạy: npm run tunnel          (trỏ vào backend+web production :8765)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.argv[2] || 8765);
const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
let child = null;
let publicUrl = null;

function log(msg) {
  const line = `[${new Date().toLocaleString('vi-VN')}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, 'cloudflared.log'), line + '\n'); } catch {}
}

function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = require(url.startsWith('https') ? 'https' : 'http');
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function ensureBackend() {
  try {
    const j = await fetchJson('http://127.0.0.1:8765/api/health');
    if (j && j.status === 'ok') return;
  } catch {}
  log('Backend không trả lời, khởi động lại...');
  try {
    const py = spawn('python', ['python-core/main.py', '--host', '0.0.0.0', '--port', '8765', '--static', '../dist'],
      { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true });
    py.unref();
  } catch (e) { log('Không khởi động được backend: ' + e.message); }
}

function killStale() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? spawn('taskkill', ['/IM', 'cloudflared.exe', '/F', '/T'], { windowsHide: true })
      : spawn('pkill', ['-f', 'cloudflared'], { windowsHide: true });
    cmd.on('exit', () => resolve());
    cmd.on('error', () => resolve());
  });
}

function waitForUrl(totalMs = 60000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - t0 > totalMs) { clearInterval(timer); resolve(null); }
    }, 500);
    const onData = (d) => {
      const s = String(d);
      if (/ERR|error|failed/i.test(s) && /quic|edge|register/i.test(s)) process.stderr.write(s);
      const m = s.match(URL_RE);
      if (m) { clearInterval(timer); resolve(m[0]); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

async function launch() {
  child = spawn(BIN, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { windowsHide: true });
  child.on('exit', (code) => { if (code !== 0 && code !== null) log(`cloudflared thoát, code ${code}`); });
  return waitForUrl();
}

async function watchdog() {
  await ensureBackend();
  for (;;) {
    await new Promise((r) => setTimeout(r, 30000));
    await ensureBackend();
    let ok = false;
    if (child && child.exitCode === null && publicUrl) {
      try {
        const j = await fetchJson(`${publicUrl}/api/health`, 10000);
        ok = j && j.status === 'ok';
      } catch {}
    }
    if (ok) continue;
    log('Tunnel rớt hoặc không thông, dựng lại...');
    try { if (child) child.kill(); } catch {}
    await killStale();
    await new Promise((r) => setTimeout(r, 2000));
    publicUrl = await launch();
    if (publicUrl) {
      log(`Tunnel đã nối lại: ${publicUrl}`);
      try { fs.writeFileSync(path.join(ROOT, 'public-url.txt'), publicUrl + '\n'); } catch {}
    } else log('Dựng lại thất bại, sẽ thử tiếp ở vòng sau.');
  }
}

(async () => {
  if (!fs.existsSync(BIN)) { console.error('Thiếu bin/cloudflared.exe'); process.exit(1); }
  await killStale();
  await new Promise((r) => setTimeout(r, 1500));
  publicUrl = await launch();
  if (!publicUrl) { console.error('Không mở được tunnel.'); process.exit(1); }
  console.log(`\n  Web local:   http://localhost:${PORT}`);
  console.log(`  Public https: ${publicUrl}`);
  console.log(`  Gửi link này cho học sinh (mở là vào thẳng, KHÔNG có trang Visit Site).\n`);
  try { fs.writeFileSync(path.join(ROOT, 'public-url.txt'), publicUrl + '\n'); } catch {}
  watchdog();
})();

process.on('SIGINT', () => { try { child.kill(); } catch {} process.exit(0); });
