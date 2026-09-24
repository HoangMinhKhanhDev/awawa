<?php
// Dùng khi test API local mà chưa set environment variables.
// Copy file này thành api/local.php rồi điền thông tin.
// KHÔNG commit local.php (đã có trong .gitignore).
return array(
    'DB_HOST' => 'localhost',
    'DB_NAME' => 'awawa_local',
    'DB_USER' => 'awawa_local',
    'DB_PASS' => 'local-password',
    'API_TOKEN' => '',
    'ALLOWED_ORIGINS' => 'http://localhost:5173,http://127.0.0.1:5173',
    // 'PUBLIC_BASE' => 'https://herbspalab.com',
);
