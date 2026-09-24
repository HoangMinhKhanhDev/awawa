<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `audit_events` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `request_id` VARCHAR(64) NULL,
                `actor_user_id` INT NULL,
                `actor_role` VARCHAR(32) NULL,
                `school_id` INT NULL,
                `team_id` INT NULL,
                `action` VARCHAR(128) NOT NULL,
                `resource_type` VARCHAR(64) NULL,
                `resource_id` VARCHAR(128) NULL,
                `decision` VARCHAR(20) NOT NULL,
                `reason` VARCHAR(1000) NULL,
                `metadata` LONGTEXT NULL,
                `ip_hash` CHAR(64) NULL,
                `user_agent_hash` CHAR(64) NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_audit_events_actor` (`actor_user_id`, `created_at`),
                KEY `idx_audit_events_school` (`school_id`, `created_at`),
                KEY `idx_audit_events_team` (`team_id`, `created_at`),
                KEY `idx_audit_events_resource` (`resource_type`, `resource_id`),
                KEY `idx_audit_events_action` (`action`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'request_id' => 'VARCHAR(64) NULL',
            'actor_user_id' => 'INT NULL',
            'actor_role' => 'VARCHAR(32) NULL',
            'school_id' => 'INT NULL',
            'team_id' => 'INT NULL',
            'action' => 'VARCHAR(128) NOT NULL',
            'resource_type' => 'VARCHAR(64) NULL',
            'resource_id' => 'VARCHAR(128) NULL',
            'decision' => 'VARCHAR(20) NOT NULL',
            'reason' => 'VARCHAR(1000) NULL',
            'metadata' => 'LONGTEXT NULL',
            'ip_hash' => 'CHAR(64) NULL',
            'user_agent_hash' => 'CHAR(64) NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'audit_events', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'audit_events', 'idx_audit_events_actor', '`actor_user_id`, `created_at`');
        MigrationSchema::ensureIndex($pdo, 'audit_events', 'idx_audit_events_school', '`school_id`, `created_at`');
        MigrationSchema::ensureIndex($pdo, 'audit_events', 'idx_audit_events_team', '`team_id`, `created_at`');
        MigrationSchema::ensureIndex($pdo, 'audit_events', 'idx_audit_events_resource', '`resource_type`, `resource_id`');
        MigrationSchema::ensureIndex($pdo, 'audit_events', 'idx_audit_events_action', '`action`, `created_at`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `break_glass_grants` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `user_id` INT NOT NULL,
                `school_id` INT NOT NULL,
                `reason` VARCHAR(1000) NOT NULL,
                `granted_by` INT NULL,
                `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `expires_at` DATETIME NOT NULL,
                `revoked_at` DATETIME NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_break_glass_user_school` (`user_id`, `school_id`, `status`, `expires_at`),
                KEY `idx_break_glass_school` (`school_id`, `status`, `expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'user_id' => 'INT NOT NULL',
            'school_id' => 'INT NOT NULL',
            'reason' => 'VARCHAR(1000) NOT NULL',
            'granted_by' => 'INT NULL',
            'granted_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'expires_at' => 'DATETIME NOT NULL',
            'revoked_at' => 'DATETIME NULL',
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'break_glass_grants', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'break_glass_grants', 'idx_break_glass_user_school', '`user_id`, `school_id`, `status`, `expires_at`');
        MigrationSchema::ensureIndex($pdo, 'break_glass_grants', 'idx_break_glass_school', '`school_id`, `status`, `expires_at`');
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0007_audit_break_glass is not reversible because audit events and access grants are operational records.');
    },
);
