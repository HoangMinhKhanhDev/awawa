<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `schools` (
                `id` INT NOT NULL AUTO_INCREMENT,
                `name` VARCHAR(200) NOT NULL,
                `slug` VARCHAR(160) NULL,
                `code` VARCHAR(64) NULL,
                `timezone` VARCHAR(64) NOT NULL DEFAULT \'Asia/Ho_Chi_Minh\',
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_schools_status` (`status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureColumn($pdo, 'schools', 'name', 'VARCHAR(200) NOT NULL DEFAULT \'\'');
        MigrationSchema::ensureColumn($pdo, 'schools', 'slug', 'VARCHAR(160) NULL');
        MigrationSchema::ensureColumn($pdo, 'schools', 'code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureColumn($pdo, 'schools', 'timezone', 'VARCHAR(64) NOT NULL DEFAULT \'Asia/Ho_Chi_Minh\'');
        MigrationSchema::ensureColumn($pdo, 'schools', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'active\'');
        MigrationSchema::ensureColumn($pdo, 'schools', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureColumn($pdo, 'schools', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureIndex($pdo, 'schools', 'idx_schools_status', '`status`');

        $schoolCount = (int) $pdo->query('SELECT COUNT(*) FROM `schools`')->fetchColumn();
        if ($schoolCount === 0) {
            $schoolSlug = strtolower(trim((string) getenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_SLUG')));
            $schoolName = trim((string) getenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_NAME'));
            if ($schoolSlug === '' || $schoolName === '' || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $schoolSlug)) {
                throw new RuntimeException('Set AWAWA_MIGRATION_DEFAULT_SCHOOL_SLUG and AWAWA_MIGRATION_DEFAULT_SCHOOL_NAME before migrating a legacy database with no school.');
            }
            $pdo->prepare('INSERT INTO `schools` (`name`, `slug`, `code`, `timezone`, `status`) VALUES (?, ?, ?, ?, \'active\')')
                ->execute(array($schoolName, $schoolSlug, getenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_CODE') ?: null, getenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_TIMEZONE') ?: 'Asia/Ho_Chi_Minh'));
        }

        $schoolRows = $pdo->query('SELECT `id` FROM `schools` WHERE `slug` IS NULL OR `slug` = \'\'');
        if ($schoolRows === false) {
            throw new RuntimeException('schools could not be read for slug backfill.');
        }
        $schoolSlug = $pdo->prepare('UPDATE `schools` SET `slug` = ? WHERE `id` = ?');
        while (($school = $schoolRows->fetch(PDO::FETCH_ASSOC)) !== false) {
            $id = (int) $school['id'];
            $schoolSlug->execute(array('school-' . $id, $id));
        }
        MigrationSchema::ensureIndex($pdo, 'schools', 'uq_schools_slug', '`slug`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `school_memberships` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `school_id` INT NOT NULL,
                `user_id` INT NOT NULL,
                `role` VARCHAR(32) NOT NULL DEFAULT \'student\',
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `joined_at` DATETIME NULL,
                `left_at` DATETIME NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_school_membership` (`school_id`, `user_id`),
                KEY `idx_school_memberships_user` (`user_id`),
                KEY `idx_school_memberships_status` (`status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'role' => 'VARCHAR(32) NOT NULL DEFAULT \'student\'',
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            'joined_at' => 'DATETIME NULL',
            'left_at' => 'DATETIME NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'school_memberships', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'school_memberships', 'uq_school_membership', '`school_id`, `user_id`');
        MigrationSchema::ensureIndex($pdo, 'school_memberships', 'idx_school_memberships_user', '`user_id`');
        MigrationSchema::ensureIndex($pdo, 'school_memberships', 'idx_school_memberships_status', '`status`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `user_system_roles` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `user_id` INT NOT NULL,
                `role` VARCHAR(32) NOT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `granted_by` INT NULL,
                `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `revoked_at` DATETIME NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_user_system_role` (`user_id`, `role`),
                KEY `idx_user_system_roles_role` (`role`),
                KEY `idx_user_system_roles_status` (`status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            'granted_by' => 'INT NULL',
            'granted_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'revoked_at' => 'DATETIME NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'user_system_roles', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'user_system_roles', 'uq_user_system_role', '`user_id`, `role`');
        MigrationSchema::ensureIndex($pdo, 'user_system_roles', 'idx_user_system_roles_role', '`role`');
        MigrationSchema::ensureIndex($pdo, 'user_system_roles', 'idx_user_system_roles_status', '`status`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `migration_quarantine` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `migration_version` VARCHAR(32) NOT NULL,
                `entity_type` VARCHAR(32) NOT NULL,
                `entity_id` VARCHAR(64) NOT NULL,
                `reason` VARCHAR(64) NOT NULL,
                `payload` LONGTEXT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'open\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `resolved_at` DATETIME NULL,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_migration_quarantine` (`migration_version`, `entity_type`, `entity_id`, `reason`),
                KEY `idx_migration_quarantine_status` (`status`),
                KEY `idx_migration_quarantine_entity` (`entity_type`, `entity_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'open\'',
            'resolved_at' => 'DATETIME NULL',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'migration_quarantine', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'migration_quarantine', 'uq_migration_quarantine', '`migration_version`, `entity_type`, `entity_id`, `reason`');
        MigrationSchema::ensureIndex($pdo, 'migration_quarantine', 'idx_migration_quarantine_status', '`status`');
        MigrationSchema::ensureIndex($pdo, 'migration_quarantine', 'idx_migration_quarantine_entity', '`entity_type`, `entity_id`');

        MigrationSchema::ensureColumn($pdo, 'students', 'active', 'TINYINT NOT NULL DEFAULT 1');
        MigrationSchema::ensureColumn($pdo, 'students', 'school_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'subjects', 'school_id', 'INT NULL');
        MigrationSchema::ensureIndex($pdo, 'students', 'idx_students_school', '`school_id`');
        MigrationSchema::ensureIndex($pdo, 'subjects', 'idx_subjects_school', '`school_id`');
        if (getenv('AWAWA_MIGRATION_ASSIGN_SINGLE_SCHOOL') === '1') {
            $availableSchools = $pdo->query('SELECT `id` FROM `schools` WHERE `status` = \'active\' ORDER BY `id`');
            if ($availableSchools === false) {
                throw new RuntimeException('schools could not be read for single-school assignment.');
            }
            $activeSchoolIds = array_map('intval', $availableSchools->fetchAll(PDO::FETCH_COLUMN));
            if (count($activeSchoolIds) !== 1) {
                throw new RuntimeException('AWAWA_MIGRATION_ASSIGN_SINGLE_SCHOOL=1 requires exactly one active school.');
            }
            $schoolId = $activeSchoolIds[0];
            $pdo->prepare('UPDATE `students` SET `school_id` = ? WHERE `school_id` IS NULL AND `role` <> \'super_admin\'')->execute(array($schoolId));
            $pdo->prepare('UPDATE `subjects` SET `school_id` = ? WHERE `school_id` IS NULL')->execute(array($schoolId));
        }
        if (!MigrationSchema::columnExists($pdo, 'students', 'role')) {
            throw new RuntimeException('students.role is required for the safe membership backfill.');
        }

        $quarantine = $pdo->prepare(
            'INSERT IGNORE INTO `migration_quarantine` (`migration_version`, `entity_type`, `entity_id`, `reason`, `payload`) VALUES (?, ?, ?, ?, ?)'
        );
        $schoolExists = $pdo->prepare('SELECT `id` FROM `schools` WHERE `id` = ? AND (`status` IS NULL OR `status` = \'active\')');
        $membership = $pdo->prepare(
            'INSERT IGNORE INTO `school_memberships` (`school_id`, `user_id`, `role`, `status`) VALUES (?, ?, ?, ?)'
        );
        $students = $pdo->query('SELECT `id`, `school_id`, `role`, `active` FROM `students` WHERE `school_id` IS NOT NULL');
        if ($students === false) {
            throw new RuntimeException('students.school_id could not be read.');
        }
        while (($student = $students->fetch(PDO::FETCH_ASSOC)) !== false) {
            $userId = (int) $student['id'];
            $rawSchoolId = trim((string) $student['school_id']);
            $role = strtolower(trim((string) $student['role']));
            $payload = json_encode(array('user_id' => $userId, 'school_id' => $rawSchoolId, 'role' => $role), JSON_UNESCAPED_UNICODE);
            if ($role === 'super_admin') {
                continue;
            }
            if (!in_array($role, array('admin', 'teacher', 'student'), true)) {
                $quarantine->execute(array('0002_school_memberships', 'student', (string) $userId, 'unsupported_school_role', $payload));
                continue;
            }
            if (!preg_match('/^[1-9][0-9]*$/D', $rawSchoolId)) {
                $quarantine->execute(array('0002_school_memberships', 'student', (string) $userId, 'invalid_school_id', $payload));
                continue;
            }
            $schoolId = (int) $rawSchoolId;
            $schoolExists->execute(array($schoolId));
            if ($schoolExists->fetchColumn() === false) {
                $quarantine->execute(array('0002_school_memberships', 'student', (string) $userId, 'school_not_found_or_inactive', $payload));
                continue;
            }
            $membership->execute(array($schoolId, $userId, $role, (int) $student['active'] === 1 ? 'active' : 'inactive'));
        }

        $missingSchoolUsers = $pdo->query("SELECT `id`, `role` FROM `students` WHERE `school_id` IS NULL AND COALESCE(`role`, 'student') <> 'super_admin'");
        if ($missingSchoolUsers === false) {
            throw new RuntimeException('students without school_id could not be read.');
        }
        while (($student = $missingSchoolUsers->fetch(PDO::FETCH_ASSOC)) !== false) {
            $quarantine->execute(array('0002_school_memberships', 'student', (string) $student['id'], 'missing_school_id', json_encode($student, JSON_UNESCAPED_UNICODE)));
        }

        $superAdmins = $pdo->query('SELECT `id` FROM `students` WHERE `role` = \'super_admin\'');
        if ($superAdmins === false) {
            throw new RuntimeException('students.role could not be read for super_admin backfill.');
        }
        $systemRole = $pdo->prepare(
            'INSERT IGNORE INTO `user_system_roles` (`user_id`, `role`, `status`) VALUES (?, \'super_admin\', \'active\')'
        );
        while (($student = $superAdmins->fetch(PDO::FETCH_ASSOC)) !== false) {
            $systemRole->execute(array((int) $student['id']));
        }
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0002_school_memberships is not reversible because its backfill and quarantine data cannot be reconstructed safely.');
    },
);
