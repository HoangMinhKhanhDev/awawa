// Mở tunnel ngrok https cho web (bê nguyên lý từ ichat):
// - token đọc từ %LOCALAPPDATA%\ngrok\ngrok.yml (làm 1 lần, dùng mãi mãi)
// - free plan chỉ 1 tunnel: kill tunnel/process treo trước khi mở mới
// - in ra URL public https (domain tĩnh free) để gửi học sinh
// Chạy: npm run tunnel            (mặc định trỏ vào web :5173)
//       npm run tunnel -- 8765     (trỏ vào API, khi cần debug trực tiếp)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.argv[2] || 5173);
const NGROK_BIN = path.join(__dirname, '..', 'node_modules', 'ngrok', 'bin', process.platform === 'win32' ? 'ngrok.exe' : 'ngrok');
const NGROK_API = 'http://127.0.0.1:4040';
const MAX_RETRIES = 3;
let ngrokProc = null;
let retries = 0;

function fetchJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const lib = require(url.startsWith('https') ? 'https' : 'http');
    const req = lib.request(url, { method, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function killStaleNgrok() {
  try {
    const j = await fetchJson(NGROK_API + '/api/tunnels');
    for (const t of j.tunnels || []) {
      try { await fetchJson(NGROK_API + '/api/tunnels/' + encodeURIComponent(t.name), 'DELETE'); } catch {}
    }
  } catch { /* chưa có agent nào chạy */ }
  await new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? spawn('taskkill', ['/IM', 'ngrok.exe', '/F', '/T'], { windowsHide: true })
      : spawn('pkill', ['-f', 'ngrok'], { windowsHide: true });
    cmd.on('exit', () => resolve());
    cmd.on('error', () => resolve());
  });
}

async function waitForUrl(totalMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < totalMs) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const j = await fetchJson(NGROK_API + '/api/tunnels');
      const https = (j.tunnels || []).find((t) => (t.public_url || '').startsWith('https'));
      if (https) return https.public_url;
      if (j.tunnels && j.tunnels[0] && j.tunnels[0].public_url) return j.tunnels[0].public_url;
    } catch { /* agent chưa sẵn sàng */ }
  }
  return null;
}

async function start() {
  if (!fs.existsSync(NGROK_BIN)) {
    console.error('Không thấy binary ngrok. Chạy: npm install');
    process.exit(1);
  }
  await killStaleNgrok();
  await new Promise((r) => setTimeout(r, 1500));
  // Trỏ thẳng 127.0.0.1 (KHÔNG dùng "localhost"/cổng trần): ngrok trên Windows
  // hay phân giải localhost -> ::1 (IPv6) trong khi backend chỉ nghe IPv4 -> refused.
  ngrokProc = spawn(NGROK_BIN, ['http', '--log=stdout', '--log-format=logfmt', '--log-level=warn', `127.0.0.1:${PORT}`], { windowsHide: true });
  ngrokProc.stdout.on('data', (d) => process.stderr.write(d));
  ngrokProc.stderr.on('data', (d) => process.stderr.write(d));
  ngrokProc.on('exit', (code) => { if (code !== 0 && code !== null) console.error('ngrok thoát, code', code); });

  let url = await waitForUrl();
  if (!url && retries < MAX_RETRIES) {
    retries++;
    console.log(`Chưa thấy URL, thử lại (${retries}/${MAX_RETRIES})...`);
    try { ngrokProc.kill(); } catch {}
    await new Promise((r) => setTimeout(r, 2000));
    return start();
  }
  if (!url) {
    console.error('Không mở được tunnel. Kiểm tra token ở %LOCALAPPDATA%\\ngrok\\ngrok.yml');
    process.exit(1);
  }
  console.log(`\n  Web local:   http://localhost:${PORT}`);
  console.log(`  Public https: ${url}`);
  console.log(`  Gửi link https này cho học sinh (lần đầu bấm "Visit Site" của ngrok).\n`);
  try { fs.writeFileSync(path.join(__dirname, '..', 'public-url.txt'), url + '\n'); } catch {}
  watchdog(url);
}

process.on('SIGINT', () => { try { ngrokProc.kill(); } catch {} process.exit(0); });

const ROOT = path.join(__dirname, '..');

// Đảm bảo backend Python luôn sống (chết thì dựng lại, detached)
async function ensureBackend() {
  try {
    const j = await fetchJson('http://127.0.0.1:8765/api/health');
    if (j && j.status === 'ok') return;
  } catch { /* backend chết hoặc chưa lên */ }
  log('Backend không trả lời, khởi động lại...');
  try {
    const py = spawn('python', ['python-core/main.py', '--host', '0.0.0.0', '--port', '8765', '--static', '../dist'],
      { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true });
    py.unref();
  } catch (e) { log('Không khởi động được backend: ' + e.message); }
}

// Tự canh: mỗi 30s kiểm tra backend + tunnel, chết thì dựng lại.
// (ngrok free thỉnh thoảng rớt session; máy ngủ dậy cũng cần nối lại)
async function watchdog(url) {
  await ensureBackend();
  for (;;) {
    await new Promise((r) => setTimeout(r, 30000));
    await ensureBackend();
    try {
      const j = await fetchJson(NGROK_API + '/api/tunnels');
      const alive = (j.tunnels || []).some((t) => (t.public_url || '').startsWith('https'));
      if (alive) continue;
    } catch { /* agent chết hẳn */ }
    log('Tunnel rớt, dựng lại...');
    try { if (ngrokProc) ngrokProc.kill(); } catch {}
    await killStaleNgrok();
    await new Promise((r) => setTimeout(r, 1500));
    ngrokProc = spawn(NGROK_BIN, ['http', '--log=stdout', '--log-format=logfmt', '--log-level=warn', `127.0.0.1:${PORT}`], { windowsHide: true });
    ngrokProc.stdout.on('data', (d) => process.stderr.write(d));
    ngrokProc.stderr.on('data', (d) => process.stderr.write(d));
    const fresh = await waitForUrl();
    log(fresh ? `Tunnel đã nối lại: ${fresh}` : 'Dựng lại thất bại, sẽ thử tiếp ở vòng sau.');
  }
}

function log(msg) {
  const line = `[${new Date().toLocaleString('vi-VN')}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, 'ngrok.log'), line + '\n'); } catch {}
}

start();
