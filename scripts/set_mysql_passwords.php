<?php
// Sinh password_hash PHP password_hash() cho 3 tài khoản demo — chạy 1 lần CLI hoặc qua URL tạm.
// php scripts/set_mysql_passwords.php
// Cần env DB_* đã set (hoặc api/local.php).
require __DIR__ . '/../api/config.php';

$accounts = array(
  array('phone' => '0900000000', 'pw' => 'Adm@123456', 'role' => 'admin'),
  array('phone' => '0900000001', 'pw' => 'Gv@123456', 'role' => 'teacher'),
  array('phone' => '0911111111', 'pw' => 'Hs@123456', 'role' => 'student'),
);

foreach ($accounts as $a) {
  $h = password_hash($a['pw'], PASSWORD_DEFAULT);
  $st = db()->prepare('UPDATE students SET password_hash=?, active=1 WHERE phone=?');
  $st->execute(array($h, $a['phone']));
  $n = $st->rowCount();
  echo $a['role'] . ' phone=' . $a['phone'] . ' updated=' . $n . PHP_EOL;
}
echo "OK\n";
