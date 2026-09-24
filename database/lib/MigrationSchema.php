<?php
class MigrationSchema
{
    public static function tableExists(PDO $pdo, $table)
    {
        $statement = $pdo->query('SHOW TABLES');
        if ($statement === false) {
            return false;
        }
        foreach ($statement->fetchAll(PDO::FETCH_NUM) as $row) {
            if (isset($row[0]) && (string) $row[0] === (string) $table) {
                return true;
            }
        }
        return false;
    }

    public static function columnExists(PDO $pdo, $table, $column)
    {
        if (!self::tableExists($pdo, $table)) {
            return false;
        }
        $statement = $pdo->query('SHOW COLUMNS FROM ' . self::identifier($table));
        if ($statement === false) {
            return false;
        }
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (isset($row['Field']) && (string) $row['Field'] === (string) $column) {
                return true;
            }
        }
        return false;
    }

    public static function ensureColumn(PDO $pdo, $table, $column, $definition)
    {
        if (!self::tableExists($pdo, $table)) {
            throw new RuntimeException('Required table is missing: ' . $table);
        }
        if (self::columnExists($pdo, $table, $column)) {
            return false;
        }
        $sql = 'ALTER TABLE ' . self::identifier($table) . ' ADD COLUMN ' . self::identifier($column) . ' ' . $definition;
        $pdo->exec($sql);
        return true;
    }

    public static function indexExists(PDO $pdo, $table, $index)
    {
        if (!self::tableExists($pdo, $table)) {
            return false;
        }
        $statement = $pdo->query('SHOW INDEX FROM ' . self::identifier($table));
        if ($statement === false) {
            return false;
        }
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (isset($row['Key_name']) && (string) $row['Key_name'] === (string) $index) {
                return true;
            }
        }
        return false;
    }

    public static function ensureIndex(PDO $pdo, $table, $index, $definition)
    {
        if (!self::tableExists($pdo, $table)) {
            throw new RuntimeException('Required table is missing: ' . $table);
        }
        if (self::indexExists($pdo, $table, $index)) {
            return false;
        }
        $kind = strpos((string) $index, 'uq_') === 0 ? 'UNIQUE INDEX' : 'INDEX';
        $sql = 'ALTER TABLE ' . self::identifier($table) . ' ADD ' . $kind . ' ' . self::identifier($index) . ' (' . $definition . ')';
        $pdo->exec($sql);
        return true;
    }

    public static function dropUniqueIndexesForColumn(PDO $pdo, $table, $column)
    {
        if (!self::tableExists($pdo, $table)) {
            return array();
        }
        $statement = $pdo->query('SHOW INDEX FROM ' . self::identifier($table));
        if ($statement === false) {
            return array();
        }
        $indexes = array();
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (isset($row['Key_name'], $row['Column_name'], $row['Non_unique']) && (string) $row['Column_name'] === (string) $column && (int) $row['Non_unique'] === 0 && (string) $row['Key_name'] !== 'PRIMARY') {
                $indexes[(string) $row['Key_name']] = true;
            }
        }
        $dropped = array();
        foreach (array_keys($indexes) as $index) {
            $pdo->exec('ALTER TABLE ' . self::identifier($table) . ' DROP INDEX ' . self::identifier($index));
            $dropped[] = $index;
        }
        return $dropped;
    }

    public static function identifier($name)
    {
        if (!is_string($name) || !preg_match('/^[A-Za-z0-9_]+$/', $name)) {
            throw new InvalidArgumentException('Invalid SQL identifier.');
        }
        return '`' . $name . '`';
    }
}
