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
