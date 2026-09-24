<?php
if (PHP_SAPI !== 'cli') {
    exit(1);
}

require_once dirname(__DIR__, 2) . '/database/lib/Migrator.php';

$directory = dirname(__DIR__, 2) . '/database/migrations';
$files = glob($directory . '/*.php');
if ($files === false) {
    fwrite(STDERR, "Migration contract failed: migration directory is not readable.\n");
    exit(1);
}

$errors = array();
$migrations = array();
foreach ($files as $path) {
    $version = Migrator::versionFromFilename($path);
    if ($version === null) {
        $errors[] = 'Invalid migration filename: ' . basename($path);
        continue;
    }
    if (isset($migrations[$version])) {
        $errors[] = 'Duplicate migration version: ' . $version;
        continue;
    }
    $migrations[$version] = $path;
}
ksort($migrations, SORT_STRING);

$expectedSequence = 1;
foreach ($migrations as $version => $path) {
    $sequence = (int) substr($version, 0, 4);
    if ($sequence !== $expectedSequence) {
        $errors[] = 'Non-contiguous migration version: ' . $version;
    }
    ++$expectedSequence;
    try {
        $checksum = Migrator::checksumForFile($path);
        if (!preg_match('/^[a-f0-9]{64}$/', $checksum)) {
            $errors[] = 'Invalid checksum: ' . $version;
        }
    } catch (Throwable $exception) {
        $errors[] = $version . ': ' . $exception->getMessage();
    }
    $definition = require $path;
    if (!is_array($definition) || !isset($definition['up'], $definition['down']) || !is_callable($definition['up']) || !is_callable($definition['down'])) {
        $errors[] = 'Migration must expose callable up and down handlers: ' . $version;
    }
}

if (count($migrations) === 0) {
    $errors[] = 'No migrations were found.';
}
if (count($errors) > 0) {
    foreach ($errors as $error) {
        fwrite(STDERR, $error . PHP_EOL);
    }
    exit(1);
}

echo 'Migration contract OK: ' . count($migrations) . " migrations.\n";
