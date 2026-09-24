<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

require dirname(__DIR__, 2) . '/api/config.php';
require_once __DIR__ . '/../lib/Migrator.php';

$command = isset($argv[1]) ? (string) $argv[1] : '';
if ($command === '' || in_array($command, array('status', 'migrate', 'rollback-last'), true) === false || count($argv) > 2) {
    fwrite(STDERR, "Usage: php database/bin/migrate.php status|migrate|rollback-last\n");
    exit(2);
}

try {
    if (!defined('DB_NAME') || !defined('DB_USER') || DB_NAME === '' || DB_USER === '') {
        throw new RuntimeException('Database configuration is incomplete. Set DB_NAME and DB_USER in the environment.');
    }
    $migrator = new Migrator(db(), dirname(__DIR__) . '/migrations');
    if ($command === 'status') {
        $result = $migrator->status();
    } elseif ($command === 'migrate') {
        $result = $migrator->migrate();
    } else {
        $result = $migrator->rollbackLast();
    }
    echo json_encode(array('command' => $command, 'result' => $result), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Migration failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}
