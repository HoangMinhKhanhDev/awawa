// Copy API PHP + .htaccess vào dist/api/ để Hostinger deploy kèm web tĩnh.
// Chạy trên cả Windows (local) và Linux (server build).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'api');
const dest = path.join(__dirname, '..', 'dist', 'api');
const DIRECTORIES = ['lib'];
const FILES = [
  'index.php',
  'config.php',
  '.htaccess',
  'routes_v2.php',
  'storage/.htaccess',
];

if (!fs.existsSync(path.join(src, 'index.php'))) {
  console.log('[copy-api] không thấy thư mục api/, bỏ qua.');
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  const target = path.join(dest, f);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(src, f), target);
  console.log('[copy-api] copied', f);
}
for (const directory of DIRECTORIES) {
  const source = path.join(src, directory);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(dest, directory), { recursive: true });
  console.log('[copy-api] copied', `${directory}/`);
}
const rootHtaccess = path.join(__dirname, '..', '.htaccess');
if (fs.existsSync(rootHtaccess)) {
  fs.copyFileSync(rootHtaccess, path.join(dest, '..', '.htaccess'));
  console.log('[copy-api] copied .htaccess');
}
const databaseSource = path.join(__dirname, '..', 'database');
if (fs.existsSync(databaseSource)) {
  fs.cpSync(databaseSource, path.join(dest, '..', 'database'), { recursive: true });
  console.log('[copy-api] copied database/');
}

function phpString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function envValue(key, fallback = '') {
  const value = process.env[key];
  if (!value || /^\*+$/.test(value)) return fallback;
  return value;
}

const localConfig = {
  DB_HOST: envValue('DB_HOST', 'localhost'),
  DB_NAME: envValue('DB_NAME'),
  DB_USER: envValue('DB_USER'),
  DB_PASS: envValue('DB_PASS'),
  API_TOKEN: envValue('API_TOKEN'),
  TEACHER_CODE: envValue('TEACHER_CODE'),
  AGNES_API_KEY: envValue('AGNES_API_KEY'),
  AGNES_BASE_URL: envValue('AGNES_BASE_URL', 'https://apihub.agnes-ai.com/v1'),
  AGNES_DEFAULT_MODEL: envValue('AGNES_DEFAULT_MODEL', 'agnes-2.5-flash'),
  PUBLIC_BASE: envValue('PUBLIC_BASE'),
};
const missing = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'].filter((key) => !localConfig[key]);
if (missing.length === 0) {
  const entries = Object.entries(localConfig).filter(([, value]) => value !== '');
  const body = entries.map(([key, value]) => `  '${key}' => ${phpString(value)},`).join('\n');
  fs.writeFileSync(path.join(dest, 'local.php'), `<?php\nreturn array(\n${body}\n);\n`, 'utf8');
  console.log('[copy-api] generated local.php from build env (keys: ' + entries.map(([key]) => key).join(',') + ')');
} else {
  console.log('[copy-api] local.php not generated (missing env: ' + missing.join(',') + ')');
}
