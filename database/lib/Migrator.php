<?php
require_once __DIR__ . '/MigrationSchema.php';

class Migrator
{
    const TRACKING_TABLE = 'schema_migrations';
    const DEFAULT_LOCK = 'awawa:migrations';

    private $pdo;
    private $migrationPath;
    private $lockName;
    private static $loadedMigrations = array();

    public function __construct(PDO $pdo, $migrationPath = null, $lockName = null)
    {
        $this->pdo = $pdo;
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->migrationPath = $migrationPath === null ? dirname(__DIR__) . '/migrations' : rtrim((string) $migrationPath, '/\\');
        $this->lockName = $lockName === null ? self::DEFAULT_LOCK : (string) $lockName;
        if ($this->lockName === '' || strlen($this->lockName) > 64) {
            throw new InvalidArgumentException('The migration lock name must be between 1 and 64 characters.');
        }
    }

    public static function versionFromFilename($filename)
    {
        $filename = basename((string) $filename);
        if (!preg_match('/^(\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*)\.php$/', $filename, $matches)) {
            return null;
        }
        return $matches[1];
    }

    public static function checksumForFile($path)
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new RuntimeException('Migration file is not readable: ' . $path);
        }
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException('Migration file could not be read: ' . $path);
        }
        $normalized = str_replace(array("\r\n", "\r"), "\n", $contents);
        return hash('sha256', $normalized);
    }

    public function migrations()
    {
        return $this->discoverMigrations();
    }

    public function status()
    {
        return $this->withLock(function () {
            $this->ensureTrackingTable();
            $migrations = $this->discoverMigrations();
            $applied = $this->appliedRows();
            $this->validateState($migrations, $applied);
            $rows = array();
            foreach ($migrations as $migration) {
                $version = $migration['version'];
                $record = isset($applied[$version]) ? $applied[$version] : null;
                $rows[] = array(
                    'version' => $version,
                    'checksum' => $migration['checksum'],
                    'status' => $record === null ? 'pending' : (string) $record['status'],
                    'execution_ms' => $record === null ? null : (int) $record['execution_ms'],
                    'started_at' => $record === null ? null : $record['started_at'],
                    'applied_at' => $record === null ? null : $record['applied_at'],
                    'error' => $record === null ? null : $record['error'],
                    'applied' => $record !== null && (string) $record['status'] === 'completed',
                    'pending' => $record === null,
                );
            }
            return $rows;
        });
    }

    public function migrate()
    {
        return $this->withLock(function () {
            $this->ensureTrackingTable();
            $migrations = $this->discoverMigrations();
            $applied = $this->appliedRows();
            $this->validateState($migrations, $applied);
            $results = array();
            foreach ($migrations as $migration) {
                $version = $migration['version'];
                if (isset($applied[$version])) {
                    continue;
                }
                $definition = $this->loadMigration($migration);
                $started = microtime(true);
                $this->pdo->prepare(
                    'INSERT INTO `' . self::TRACKING_TABLE . '` (`version`, `checksum`, `status`, `execution_ms`, `started_at`) VALUES (?, ?, \'running\', 0, CURRENT_TIMESTAMP)'
                )->execute(array($version, $migration['checksum']));
                try {
                    call_user_func($definition['up'], $this->pdo);
                    $executionMs = max(0, (int) round((microtime(true) - $started) * 1000));
                    $this->pdo->prepare(
                        'UPDATE `' . self::TRACKING_TABLE . '` SET `status` = \'completed\', `execution_ms` = ?, `applied_at` = CURRENT_TIMESTAMP, `error` = NULL WHERE `version` = ?'
                    )->execute(array($executionMs, $version));
                } catch (Throwable $exception) {
                    try {
                        $this->pdo->prepare(
                            'UPDATE `' . self::TRACKING_TABLE . '` SET `status` = \'failed\', `execution_ms` = ?, `error` = ? WHERE `version` = ?'
                        )->execute(array(max(0, (int) round((microtime(true) - $started) * 1000)), substr($exception->getMessage(), 0, 4000), $version));
                    } catch (Throwable $ignored) {
                    }
                    throw $exception;
                }
                $results[] = array(
                    'version' => $version,
                    'checksum' => $migration['checksum'],
                    'status' => 'completed',
                    'execution_ms' => $executionMs,
                    'applied' => true,
                );
                $applied[$version] = array(
                    'version' => $version,
                    'checksum' => $migration['checksum'],
                    'status' => 'completed',
                    'execution_ms' => $executionMs,
                    'started_at' => date('Y-m-d H:i:s'),
                    'applied_at' => date('Y-m-d H:i:s'),
                    'error' => null,
                );
            }
            return $results;
        });
    }

    public function rollbackLast()
    {
        if (getenv('MIGRATION_ALLOW_ROLLBACK') !== '1') {
            throw new RuntimeException('Rollback is disabled. Set MIGRATION_ALLOW_ROLLBACK=1 to enable it.');
        }
        return $this->withLock(function () {
            $this->ensureTrackingTable();
            $migrations = $this->discoverMigrations();
            $applied = $this->appliedRows();
            $this->validateState($migrations, $applied);
            if (count($applied) === 0) {
                throw new RuntimeException('There is no applied migration to roll back.');
            }
            $statement = $this->pdo->query(
                'SELECT `version`, `checksum`, `status`, `execution_ms`, `started_at`, `applied_at`, `error` FROM `' . self::TRACKING_TABLE . '` WHERE `status` = \'completed\' ORDER BY `version` DESC LIMIT 1'
            );
            $latest = $statement === false ? false : $statement->fetch(PDO::FETCH_ASSOC);
            if (!is_array($latest) || !isset($latest['version'])) {
                throw new RuntimeException('The latest applied migration could not be read.');
            }
            $byVersion = array();
            foreach ($migrations as $migration) {
                $byVersion[$migration['version']] = $migration;
            }
            $version = (string) $latest['version'];
            if (!isset($byVersion[$version])) {
                throw new RuntimeException('The latest applied migration is not present on disk: ' . $version);
            }
            $definition = $this->loadMigration($byVersion[$version]);
            call_user_func($definition['down'], $this->pdo);
            $delete = $this->pdo->prepare('DELETE FROM `' . self::TRACKING_TABLE . '` WHERE `version` = ?');
            $delete->execute(array($version));
            return array(
                'version' => $version,
                'rolled_back' => true,
            );
        });
    }

    public function rollback_last()
    {
        return $this->rollbackLast();
    }

    public function rollbackLastMigration()
    {
        return $this->rollbackLast();
    }

    private function withLock(callable $callback)
    {
        $acquired = false;
        try {
            $this->acquireLock();
            $acquired = true;
            return $callback();
        } finally {
            if ($acquired) {
                $this->releaseLock();
            }
        }
    }

    private function acquireLock()
    {
        $statement = $this->pdo->query('SELECT GET_LOCK(' . $this->pdo->quote($this->lockName) . ', 15)');
        $row = $statement === false ? false : $statement->fetch(PDO::FETCH_NUM);
        if (!is_array($row) || !isset($row[0]) || (int) $row[0] !== 1) {
            throw new RuntimeException('Could not acquire the database migration lock.');
        }
    }

    private function releaseLock()
    {
        try {
            $this->pdo->query('SELECT RELEASE_LOCK(' . $this->pdo->quote($this->lockName) . ')');
        } catch (Throwable $ignored) {
        }
    }

    private function ensureTrackingTable()
    {
        $sql = 'CREATE TABLE IF NOT EXISTS `' . self::TRACKING_TABLE . '` (
            `version` VARCHAR(191) NOT NULL,
            `checksum` CHAR(64) NOT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT \'completed\',
            `execution_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `started_at` DATETIME NULL,
            `applied_at` DATETIME NULL,
            `error` TEXT NULL,
            PRIMARY KEY (`version`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $this->pdo->exec($sql);
        foreach (array('version', 'checksum', 'status', 'execution_ms', 'started_at', 'applied_at', 'error') as $column) {
            if (!MigrationSchema::columnExists($this->pdo, self::TRACKING_TABLE, $column)) {
                throw new RuntimeException('The migration tracking table is missing column: ' . $column);
            }
        }
    }

    private function discoverMigrations()
    {
        if (!is_dir($this->migrationPath)) {
            throw new RuntimeException('Migration directory is missing: ' . $this->migrationPath);
        }
        $files = glob($this->migrationPath . '/*.php');
        if ($files === false) {
            throw new RuntimeException('Migration directory could not be read: ' . $this->migrationPath);
        }
        if (count($files) === 0) {
            throw new RuntimeException('No migration files were found.');
        }
        $migrations = array();
        $seen = array();
        foreach ($files as $path) {
            $version = self::versionFromFilename($path);
            if ($version === null) {
                throw new RuntimeException('Invalid migration filename: ' . basename($path));
            }
            if (isset($seen[$version])) {
                throw new RuntimeException('Duplicate migration version: ' . $version);
            }
            $seen[$version] = true;
            $migrations[] = array(
                'version' => $version,
                'path' => $path,
                'checksum' => self::checksumForFile($path),
            );
        }
        usort($migrations, function ($left, $right) {
            return strcmp($left['version'], $right['version']);
        });
        foreach ($migrations as $index => $migration) {
            $expectedSequence = $index + 1;
            $actualSequence = (int) substr($migration['version'], 0, 4);
            if ($actualSequence !== $expectedSequence) {
                throw new RuntimeException('Migration versions must be contiguous and start at 0001.');
            }
        }
        return $migrations;
    }

    private function loadMigration(array $migration)
    {
        $path = $migration['path'];
        if (isset(self::$loadedMigrations[$path])) {
            return self::$loadedMigrations[$path];
        }
        $definition = require $path;
        if (!is_array($definition) || !isset($definition['up'], $definition['down']) || !is_callable($definition['up']) || !is_callable($definition['down'])) {
            throw new RuntimeException('Migration must return callable up and down handlers: ' . $migration['version']);
        }
        self::$loadedMigrations[$path] = $definition;
        return $definition;
    }

    private function appliedRows()
    {
        $statement = $this->pdo->query('SELECT `version`, `checksum`, `status`, `execution_ms`, `started_at`, `applied_at`, `error` FROM `' . self::TRACKING_TABLE . '` ORDER BY `version` ASC');
        if ($statement === false) {
            throw new RuntimeException('The migration tracking table could not be read.');
        }
        $rows = array();
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!isset($row['version'])) {
                throw new RuntimeException('The migration tracking table contains an invalid row.');
            }
            $version = (string) $row['version'];
            if (self::versionFromFilename($version . '.php') !== $version) {
                throw new RuntimeException('The migration tracking table contains an invalid version: ' . $version);
            }
            $status = strtolower(trim((string) (isset($row['status']) ? $row['status'] : 'completed')));
            if (!in_array($status, array('running', 'completed', 'failed'), true)) {
                throw new RuntimeException('Migration tracking table contains an invalid status for: ' . $version);
            }
            if ($status !== 'completed') {
                throw new RuntimeException('Migration requires operator recovery before retry: ' . $version . ' (' . $status . ')');
            }
            $checksum = strtolower(trim((string) (isset($row['checksum']) ? $row['checksum'] : '')));
            if (!preg_match('/^[a-f0-9]{64}$/', $checksum)) {
                throw new RuntimeException('The migration tracking table contains an invalid checksum for: ' . $version);
            }
            $row['version'] = $version;
            $row['checksum'] = $checksum;
            $rows[$version] = $row;
        }
        return $rows;
    }

    private function validateState(array $migrations, array $applied)
    {
        $byVersion = array();
        foreach ($migrations as $migration) {
            $byVersion[$migration['version']] = $migration;
        }
        $ordered = array();
        foreach ($applied as $version => $row) {
            if (!isset($byVersion[$version])) {
                throw new RuntimeException('An applied migration is missing on disk: ' . $version);
            }
            if (!hash_equals($byVersion[$version]['checksum'], (string) $row['checksum'])) {
                throw new RuntimeException('Migration checksum mismatch: ' . $version);
            }
            $ordered[] = $version;
        }
        $expected = array();
        foreach ($migrations as $migration) {
            if (!isset($applied[$migration['version']])) {
                break;
            }
            $expected[] = $migration['version'];
        }
        if ($ordered !== $expected) {
            throw new RuntimeException('Applied migrations are not a contiguous migration sequence.');
        }
    }
}
