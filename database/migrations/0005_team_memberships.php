<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        MigrationSchema::ensureColumn($pdo, 'team_members', 'school_id', 'INT NULL');
        MigrationSchema::ensureIndex($pdo, 'team_members', 'idx_team_members_school', '`school_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `team_memberships` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `legacy_id` INT NULL,
                `team_id` INT NOT NULL,
                `user_id` INT NOT NULL,
                `school_id` INT NULL,
                `role` VARCHAR(20) NOT NULL DEFAULT \'student\',
                `access` VARCHAR(10) NOT NULL DEFAULT \'include\',
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `source_class_id` INT NULL,
                `joined_at` DATETIME NULL,
                `left_at` DATETIME NULL,
                `source` VARCHAR(32) NOT NULL DEFAULT \'legacy\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_team_membership_legacy` (`legacy_id`),
                UNIQUE KEY `uq_team_membership` (`team_id`, `user_id`, `role`),
                KEY `idx_team_memberships_user` (`user_id`),
                KEY `idx_team_memberships_school` (`school_id`),
                KEY `idx_team_memberships_status` (`status`),
                KEY `idx_team_memberships_source_class` (`source_class_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'legacy_id' => 'INT NULL',
            'school_id' => 'INT NULL',
            'role' => 'VARCHAR(20) NOT NULL DEFAULT \'student\'',
            'access' => 'VARCHAR(10) NOT NULL DEFAULT \'include\'',
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            'source_class_id' => 'INT NULL',
            'joined_at' => 'DATETIME NULL',
            'left_at' => 'DATETIME NULL',
            'source' => 'VARCHAR(32) NOT NULL DEFAULT \'legacy\'',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'team_memberships', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'team_memberships', 'uq_team_membership_legacy', '`legacy_id`');
        MigrationSchema::ensureIndex($pdo, 'team_memberships', 'uq_team_membership', '`team_id`, `user_id`, `role`');
        MigrationSchema::ensureIndex($pdo, 'team_memberships', 'idx_team_memberships_user', '`user_id`');
        MigrationSchema::ensureIndex($pdo, 'team_memberships', 'idx_team_memberships_school', '`school_id`');
        MigrationSchema::ensureIndex($pdo, 'team_memberships', 'idx_team_memberships_status', '`status`');
        MigrationSchema::ensureIndex($pdo, 'team_memberships', 'idx_team_memberships_source_class', '`source_class_id`');

        $quarantine = $pdo->prepare(
            'INSERT IGNORE INTO `migration_quarantine` (`migration_version`, `entity_type`, `entity_id`, `reason`, `payload`) VALUES (?, ?, ?, ?, ?)'
        );
        $rows = $pdo->query('SELECT tm.`id`, tm.`team_id`, tm.`user_id`, tm.`school_id`, tm.`member_role`, t.`school_id` AS `team_school_id`, t.`id` AS `resolved_team_id`, u.`id` AS `resolved_user_id` FROM `team_members` tm LEFT JOIN `teams` t ON t.`id` = tm.`team_id` LEFT JOIN `students` u ON u.`id` = tm.`user_id`');
        if ($rows === false) {
            throw new RuntimeException('team_members could not be read for validation.');
        }
        $validGroups = array();
        while (($membership = $rows->fetch(PDO::FETCH_ASSOC)) !== false) {
            $legacyId = (int) $membership['id'];
            $role = strtolower(trim((string) $membership['member_role']));
            $role = $role === '' ? 'student' : $role;
            $payload = json_encode(array(
                'legacy_id' => $legacyId,
                'team_id' => $membership['team_id'],
                'user_id' => $membership['user_id'],
                'role' => $role,
            ), JSON_UNESCAPED_UNICODE);
            if (!in_array($role, array('student', 'coach'), true)) {
                $quarantine->execute(array('0005_team_memberships', 'team_member', (string) $legacyId, 'unsupported_membership_role', $payload));
                continue;
            }
            if (!$membership['resolved_team_id'] || !$membership['resolved_user_id']) {
                $quarantine->execute(array('0005_team_memberships', 'team_member', (string) $legacyId, 'membership_owner_not_found', $payload));
                continue;
            }
            $schoolId = $membership['school_id'] !== null && $membership['school_id'] !== '' ? (int) $membership['school_id'] : (int) $membership['team_school_id'];
            if ($schoolId > 0 && $membership['team_school_id'] !== null && $schoolId !== (int) $membership['team_school_id']) {
                $quarantine->execute(array('0005_team_memberships', 'team_member', (string) $legacyId, 'membership_school_mismatch', $payload));
                continue;
            }
            $group = (int) $membership['team_id'] . ':' . (int) $membership['user_id'] . ':' . $role;
            if (isset($validGroups[$group])) {
                $quarantine->execute(array('0005_team_memberships', 'team_member', (string) $legacyId, 'duplicate_effective_membership', $payload));
                continue;
            }
            $validGroups[$group] = true;
        }

        $pdo->exec(
            'INSERT IGNORE INTO `team_memberships` (`legacy_id`, `team_id`, `user_id`, `school_id`, `role`, `access`, `status`, `source_class_id`, `joined_at`, `left_at`, `source`)
             SELECT tm.`id`, tm.`team_id`, tm.`user_id`, COALESCE(NULLIF(tm.`school_id`, 0), t.`school_id`),
                    COALESCE(NULLIF(tm.`member_role`, \'\'), \'student\'), \'include\',
                    CASE WHEN tm.`left_at` IS NULL OR tm.`left_at` = \'\' THEN \'active\' ELSE \'inactive\' END,
                    NULL, tm.`joined_at`, tm.`left_at`, \'team_members\'
             FROM `team_members` tm INNER JOIN `teams` t ON t.`id` = tm.`team_id` INNER JOIN `students` u ON u.`id` = tm.`user_id`
             WHERE (tm.`member_role` IS NULL OR tm.`member_role` = \'\' OR tm.`member_role` IN (\'student\', \'coach\'))
               AND (tm.`school_id` IS NULL OR tm.`school_id` = 0 OR t.`school_id` IS NULL OR tm.`school_id` = t.`school_id`)'
        );

        $expected = count($validGroups);
        $actual = (int) $pdo->query('SELECT COUNT(*) FROM `team_memberships` WHERE `source` = \'team_members\'')->fetchColumn();
        if ($actual < $expected) {
            throw new RuntimeException('team_memberships backfill is incomplete: expected at least ' . $expected . ' rows, found ' . $actual . '.');
        }
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0005_team_memberships is not reversible because the authoritative membership copy cannot be safely reconstructed from legacy data.');
    },
);
