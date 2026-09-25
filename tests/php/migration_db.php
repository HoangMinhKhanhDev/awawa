<?php
if (PHP_SAPI !== 'cli') exit(1);

$dbName = (string) getenv('DB_NAME');
if ($dbName === '' || stripos($dbName, 'test') === false) {
    fwrite(STDERR, "DB_NAME must contain test.\n");
    exit(2);
}

$host = getenv('DB_HOST') ?: '127.0.0.1';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS');
if ($pass === false) $pass = '';

$pdo = new PDO(
    'mysql:host=' . $host . ';dbname=' . $dbName . ';charset=utf8mb4',
    $user,
    $pass,
    array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC)
);

$schema = file_get_contents(dirname(__DIR__, 2) . '/api/schema_mysql.sql');
if ($schema === false) throw new RuntimeException('schema_mysql.sql could not be read.');
$pdo->exec($schema);

$pdo->exec("INSERT INTO subjects (id,name,code) VALUES ('toan','Toán','toan')");
$pdo->exec("INSERT INTO school_years (name,start_date,end_date,is_current) VALUES ('2026-2027','2026-09-01','2027-06-30',1)");
$pdo->exec("INSERT INTO grades (school_year_id,name,code) VALUES (1,'Lớp 10','10')");
$pdo->exec("INSERT INTO classes (name,join_code) VALUES ('10A','TEST10A')");
$pdo->exec("INSERT INTO teams (school_year_id,grade_id,subject_id,name,join_code) VALUES (1,1,'toan','Đội Toán','TESTTEAM')");
$users = array(
    array('Admin', 'admin', '0900000001'),
    array('Giáo viên', 'teacher', '0900000002'),
    array('Học sinh', 'student', '0900000003'),
    array('Super', 'super_admin', '0900000004'),
);
foreach ($users as $userRow) {
    $pdo->prepare('INSERT INTO students (name,role,phone,active) VALUES (?,?,?,1)')->execute($userRow);
}
$pdo->exec("INSERT INTO team_members (team_id,user_id,member_role,joined_at) VALUES (1,2,'coach',NOW()),(1,3,'student',NOW())");
$pdo->exec('INSERT INTO class_members (class_id,user_id,joined_at) VALUES (1,3,NOW())');

putenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_SLUG=thuong-cho');
putenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_NAME=Trường Chở');
putenv('AWAWA_MIGRATION_ASSIGN_SINGLE_SCHOOL=1');
putenv('MIGRATION_ALLOW_ROLLBACK=0');

require_once dirname(__DIR__, 2) . '/database/lib/Migrator.php';
$migrator = new Migrator($pdo, dirname(__DIR__, 2) . '/database/migrations');
$first = $migrator->migrate();
$second = $migrator->migrate();
if (count($first) !== 11 || count($second) !== 0) throw new RuntimeException('Migration sequence is not idempotent.');

$checks = array(
    'schools' => 1,
    'school_memberships' => 3,
    'user_system_roles' => 1,
    'class_team_links' => 0,
    'team_memberships' => 2,
    'module_catalog' => 12,
    'team_modules' => 12,
    'school_modules' => 12,
    'file_assets' => 0,
);
foreach ($checks as $table => $expected) {
    $actual = (int) $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
    if ($actual !== $expected) throw new RuntimeException($table . ' expected ' . $expected . ', found ' . $actual . '.');
}
$legacyMembers = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'team_members'")->fetchColumn();
if ((int) $legacyMembers !== 0) throw new RuntimeException('Legacy team_members table still exists after consolidation.');

$membershipRoles = $pdo->query("SELECT GROUP_CONCAT(`role` ORDER BY `role`) FROM `school_memberships`")->fetchColumn();
if ($membershipRoles !== 'admin,student,teacher') throw new RuntimeException('School membership roles are invalid: ' . $membershipRoles);
$openQuarantine = (int) $pdo->query("SELECT COUNT(*) FROM `migration_quarantine` WHERE `status` = 'open'")->fetchColumn();
if ($openQuarantine !== 0) throw new RuntimeException('Unexpected migration quarantine rows: ' . $openQuarantine);

echo "Migration database contract OK.\n";
