<?php
// Cấu hình API — đọc từ Environment variables trong hPanel
// (Websites → herbaspalab.com → Environment variables).
// Khi chạy local mà chưa set env, copy api/local.example.php → api/local.php.
if (is_file(__DIR__ . '/local.php')) {
    $local = require __DIR__ . '/local.php';
    if (is_array($local)) {
        foreach ($local as $k => $v) {
            if (getenv($k) === false) putenv("$k=$v");
        }
    }
}

function envv($key, $default = '') {
    $v = getenv($key);
    return ($v === false || $v === null || $v === '') ? $default : $v;
}

define('DB_HOST', envv('DB_HOST', 'localhost'));
define('DB_NAME', envv('DB_NAME', ''));
define('DB_USER', envv('DB_USER', ''));
define('DB_PASS', envv('DB_PASS', ''));
// Token chia sẻ: nếu để trống = mở như bản LAN (tiện test).
// Nên đặt 1 chuỗi ngẫu nhiên, frontend gửi kèm header X-Api-Token.
define('API_TOKEN', envv('API_TOKEN', ''));
define('UPLOAD_DIR', envv('UPLOAD_DIR', __DIR__ . '/../uploads'));
define('PUBLIC_BASE', envv('PUBLIC_BASE', '')); // VD: https://herbspalab.com — để trống = tự đoán
define('MAX_UPLOAD_MB', (int)envv('MAX_UPLOAD_MB', '5'));

function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (DB_NAME === '' || DB_USER === '') {
        jerr('Chưa cấu hình database (DB_NAME/DB_USER trong Environment variables).', 500);
    }
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => true,
        )
    );
    return $pdo;
}

function j($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jerr($msg, $code = 400) {
    j(array('error' => $msg), $code);
}

function body() {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw === '' ? '{}' : $raw, true);
    return is_array($d) ? $d : array();
}

function check_token($path) {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') return;
    if ($path === '/health') return; // cho widget trạng thái kiểm tra không cần token
    if (API_TOKEN === '') return;    // chưa đặt token = mở (chế độ test)
    $got = $_SERVER['HTTP_X_API_TOKEN'] ?? '';
    if (!hash_equals(API_TOKEN, (string)$got)) jerr('Sai API token.', 403);
}
