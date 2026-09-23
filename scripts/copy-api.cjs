// Copy API PHP + .htaccess vào dist/api/ để Hostinger deploy kèm web tĩnh.
// Chạy trên cả Windows (local) và Linux (server build).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'api');
const dest = path.join(__dirname, '..', 'dist', 'api');
const FILES = [
  'index.php',
  'config.php',
  '.htaccess',
  'schema_mysql.sql',
  'seed_mysql.sql',
  'seed_phase1a_mysql.sql',
  'local.example.php',
];

if (!fs.existsSync(path.join(src, 'index.php'))) {
  console.log('[copy-api] không thấy thư mục api/, bỏ qua.');
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
  console.log('[copy-api] copied', f);
}
