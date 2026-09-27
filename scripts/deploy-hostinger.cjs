// Deploy repo Laravel (F:\awawa) lên Hostinger, không cần SSH.
//
// Cách dùng:
//   node scripts/deploy-hostinger.cjs
//   node scripts/deploy-hostinger.cjs --skip-zip     (chỉ chạy migrate + optimize)
//
// Cơ chế: đóng gói source thành zip -> TUS upload lên thư mục gốc -> drop 2 file
// PHP tự xóa (public/_deploy_unzip.php, public/_deploy_upgrade.php) -> gọi qua HTTP
// -> extract, migrate --force, optimize -> xóa file tạm trên server.
//
// LƯU Ý: file .env và thư mục storage KHÔNG nằm trong zip nên không bị ghi đè.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SOURCE = process.env.AWAWA_SOURCE || 'F:/awawa';
const ORIGIN = 'https://awawa.herbspalab.com';
const skipZip = process.argv.includes('--skip-zip');

const php = (filename, body) => {
  const key = crypto.randomBytes(16).toString('hex');
  const local = path.join(os.tmpdir(), filename);
  fs.writeFileSync(local, body.replace('__KEY__', key), 'utf8');
  execFileSync('node', ['scripts/upload-file.cjs', local, 'public/' + filename], { stdio: 'inherit' });
  return key;
};

const unzipKey = php('_deploy_unzip.php', `<?php
$key='__KEY__';
if (!hash_equals($key,(string)($_GET['key']??''))) { http_response_code(403); exit('forbidden'); }
header('Content-Type: application/json; charset=utf-8');
@set_time_limit(600);
$zipPath=__DIR__.'/../awawa-education.zip';
if (!is_file($zipPath)) { http_response_code(500); echo json_encode(array('error'=>'zip missing')); exit; }
$zip=new ZipArchive();
if ($zip->open($zipPath)!==true) { http_response_code(500); echo json_encode(array('error'=>'open')); exit; }
$ok=$zip->extractTo(__DIR__.'/..'); $n=$zip->numFiles; $zip->close();
@unlink($zipPath); @unlink(__FILE__);
echo json_encode(array('ok'=>(bool)$ok,'files'=>$n));
`);

const upgradeKey = php('_deploy_upgrade.php', `<?php
$key='__KEY__';
if (!hash_equals($key,(string)($_GET['key']??''))) { http_response_code(403); exit('forbidden'); }
header('Content-Type: application/json; charset=utf-8');
@set_time_limit(600);
$root=__DIR__.'/..';
// Zip khong ghi de duoc file da xoa khoi repo, nen phai don tay.
$stale=glob($root.'/app/Console/Commands/*.php') ?: array();
$removed=array();
foreach ($stale as $f) {
  $name=basename($f);
  if (in_array($name, array('GenerateArtifactCommand.php','GenerateVapidKeys.php','SendDueReminders.php'), true)) continue;
  if (@unlink($f)) $removed[]=$name;
}
foreach (glob($root.'/bootstrap/cache/*.php') as $x) @unlink($x);
require $root.'/vendor/autoload.php';
try {
  $app=require $root.'/bootstrap/app.php';
  $kernel=$app->make(Illuminate\\Contracts\\Console\\Kernel::class);
  $kernel->bootstrap();
  $s=array();
  $s['migrate']=$kernel->call('migrate',array('--force'=>true));
  $s['optimize']=$kernel->call('optimize');
  $s['migrations']=Illuminate\\Support\\Facades\\DB::table('migrations')->count();
  @unlink(__FILE__);
  echo json_encode(array('ok'=>true,'steps'=>$s,'removed'=>$removed));
} catch (Throwable $e) { http_response_code(500); echo json_encode(array('error'=>get_class($e).': '.$e->getMessage())); }
`);

if (!skipZip) {
  const zip = path.join(os.tmpdir(), 'awawa-education.zip');
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  execFileSync('tar', ['-a', '-c', '-f', zip, '-C', SOURCE,
    '--exclude=node_modules', '--exclude=.git', '--exclude=tests', '--exclude=.env',
    '--exclude=storage', '--exclude=.phpunit.result.cache', '--exclude=deploy', '.'],
    { stdio: 'inherit' });
  console.log('zip_bytes=' + fs.statSync(zip).size);
  execFileSync('node', ['scripts/upload-file.cjs', zip, 'awawa-education.zip'], { stdio: 'inherit' });
  fs.unlinkSync(zip);
}

(async () => {
  const u = await fetch(ORIGIN + '/_deploy_unzip.php?key=' + unzipKey);
  console.log('unzip=' + u.status + ' ' + (await u.text()).slice(0, 200));
  const g = await fetch(ORIGIN + '/_deploy_upgrade.php?key=' + upgradeKey);
  console.log('upgrade=' + g.status + ' ' + (await g.text()).slice(0, 500));
  for (const url of [ORIGIN + '/', ORIGIN + '/login', ORIGIN + '/studio/ai']) {
    const r = await fetch(url, { redirect: 'manual' });
    console.log(r.status, url);
  }
})();
