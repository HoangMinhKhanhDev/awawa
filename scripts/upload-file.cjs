// Upload một file lên website Hostinger qua TUS (dùng cho migrate/backup một lần).
// Dùng: node scripts/upload-file.cjs <file> <remote-path>
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const username = process.env.HOSTINGER_USERNAME || 'u670570555';
const domain = process.env.HOSTINGER_DOMAIN || 'awawa.herbspalab.com';

function getUrl() {
  for (let i = 0; i < 4; i++) {
    try {
      const out = execSync(
        `node scripts/hostinger-call.cjs hosting_generateUploadURLV1 username=${username},domain=${domain}`,
        { encoding: 'utf8', env: { ...process.env, HOSTINGER_CALL_LIMIT: '1000000' } },
      );
      const text = JSON.parse(out).result.content[0].text;
      return JSON.parse(text);
    } catch {}
  }
  throw new Error('Không lấy được upload URL Hostinger.');
}

const file = process.argv[2];
const remote = process.argv[3] || path.basename(file);
if (!file || !fs.existsSync(file)) throw new Error('File không tồn tại: ' + file);

const upload = getUrl();
const headers = [
  '-H', 'X-Auth: ' + upload.auth_key,
  '-H', 'X-Auth-Rest: ' + upload.rest_auth_key,
  '-H', 'Tus-Resumable: 1.0.0',
];
const url = upload.url + '/' + remote + '?override=true';
const size = fs.statSync(file).size;
execFileSync('curl.exe', [...headers, '-s', '-o', 'NUL', '-X', 'POST', url, '-H', 'Upload-Length: ' + size, '-H', 'Upload-Offset: 0']);
execFileSync('curl.exe', [...headers, '-s', '-o', 'NUL', '-X', 'PATCH', url, '-H', 'Content-Type: application/offset+octet-stream', '-H', 'Upload-Offset: 0', '--data-binary', '@' + file]);
console.log('uploaded', remote);
