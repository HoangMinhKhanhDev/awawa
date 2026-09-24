<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        MigrationSchema::ensureColumn($pdo, 'classes', 'school_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'teams', 'school_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'class_members', 'school_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'team_members', 'school_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'classes', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureColumn($pdo, 'teams', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureIndex($pdo, 'classes', 'idx_classes_school', '`school_id`');
        MigrationSchema::ensureIndex($pdo, 'teams', 'idx_teams_school', '`school_id`');
        MigrationSchema::ensureIndex($pdo, 'class_members', 'idx_class_members_school', '`school_id`');
        MigrationSchema::ensureIndex($pdo, 'team_members', 'idx_team_members_school', '`school_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `class_team_links` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `class_id` INT NOT NULL,
                `team_id` INT NOT NULL,
                `school_id` INT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_class_team_link` (`class_id`, `team_id`),
                KEY `idx_class_team_links_team` (`team_id`),
                KEY `idx_class_team_links_school` (`school_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'school_id' => 'INT NULL',
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'class_team_links', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'class_team_links', 'uq_class_team_link', '`class_id`, `team_id`');
        MigrationSchema::ensureIndex($pdo, 'class_team_links', 'idx_class_team_links_team', '`team_id`');
        MigrationSchema::ensureIndex($pdo, 'class_team_links', 'idx_class_team_links_school', '`school_id`');
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0004_class_team_links is not reversible because class and team mappings are intentionally not inferred.');
    },
);
