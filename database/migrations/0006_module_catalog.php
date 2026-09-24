<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `module_catalog` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `code` VARCHAR(64) NOT NULL,
                `name` VARCHAR(200) NOT NULL,
                `description` TEXT NULL,
                `category` VARCHAR(64) NOT NULL DEFAULT \'learning\',
                `route_slug` VARCHAR(160) NOT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `is_legacy` TINYINT NOT NULL DEFAULT 0,
                `position` INT NOT NULL DEFAULT 0,
                `settings_schema_version` INT UNSIGNED NOT NULL DEFAULT 1,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_module_catalog_code` (`code`),
                UNIQUE KEY `uq_module_catalog_route` (`route_slug`),
                KEY `idx_module_catalog_status_position` (`status`, `position`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'code' => 'VARCHAR(64) NOT NULL',
            'name' => 'VARCHAR(200) NOT NULL',
            'description' => 'TEXT NULL',
            'category' => 'VARCHAR(64) NOT NULL DEFAULT \'learning\'',
            'route_slug' => 'VARCHAR(160) NOT NULL',
            'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            'is_legacy' => 'TINYINT NOT NULL DEFAULT 0',
            'position' => 'INT NOT NULL DEFAULT 0',
            'settings_schema_version' => 'INT UNSIGNED NOT NULL DEFAULT 1',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'module_catalog', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'module_catalog', 'uq_module_catalog_code', '`code`');
        MigrationSchema::ensureIndex($pdo, 'module_catalog', 'uq_module_catalog_route', '`route_slug`');
        MigrationSchema::ensureIndex($pdo, 'module_catalog', 'idx_module_catalog_status_position', '`status`, `position`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `school_modules` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `school_id` INT NOT NULL,
                `module_id` INT UNSIGNED NOT NULL,
                `available` TINYINT NOT NULL DEFAULT 1,
                `default_enabled` TINYINT NOT NULL DEFAULT 1,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_school_module` (`school_id`, `module_id`),
                KEY `idx_school_modules_module` (`module_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'available' => 'TINYINT NOT NULL DEFAULT 1',
            'default_enabled' => 'TINYINT NOT NULL DEFAULT 1',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'school_modules', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'school_modules', 'uq_school_module', '`school_id`, `module_id`');
        MigrationSchema::ensureIndex($pdo, 'school_modules', 'idx_school_modules_module', '`module_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `team_modules` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `team_id` INT NOT NULL,
                `module_id` INT UNSIGNED NOT NULL,
                `enabled` TINYINT NOT NULL DEFAULT 1,
                `position` INT NOT NULL DEFAULT 0,
                `enabled_at` DATETIME NULL,
                `disabled_at` DATETIME NULL,
                `configured_by` INT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_team_module` (`team_id`, `module_id`),
                KEY `idx_team_modules_module` (`module_id`),
                KEY `idx_team_modules_enabled` (`team_id`, `enabled`, `position`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'enabled' => 'TINYINT NOT NULL DEFAULT 1',
            'position' => 'INT NOT NULL DEFAULT 0',
            'enabled_at' => 'DATETIME NULL',
            'disabled_at' => 'DATETIME NULL',
            'configured_by' => 'INT NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'team_modules', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'team_modules', 'uq_team_module', '`team_id`, `module_id`');
        MigrationSchema::ensureIndex($pdo, 'team_modules', 'idx_team_modules_module', '`module_id`');
        MigrationSchema::ensureIndex($pdo, 'team_modules', 'idx_team_modules_enabled', '`team_id`, `enabled`, `position`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `team_module_settings` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `team_id` INT NOT NULL,
                `module_id` INT UNSIGNED NOT NULL,
                `settings_json` LONGTEXT NULL,
                `schema_version` INT UNSIGNED NOT NULL DEFAULT 1,
                `updated_by` INT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_team_module_settings` (`team_id`, `module_id`),
                KEY `idx_team_module_settings_module` (`module_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'settings_json' => 'LONGTEXT NULL',
            'schema_version' => 'INT UNSIGNED NOT NULL DEFAULT 1',
            'updated_by' => 'INT NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'team_module_settings', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'team_module_settings', 'uq_team_module_settings', '`team_id`, `module_id`');
        MigrationSchema::ensureIndex($pdo, 'team_module_settings', 'idx_team_module_settings_module', '`module_id`');

        $catalog = array(
            array('question_bank', 'Ngân hàng câu hỏi', 'Câu hỏi và ngân hàng đề', 'content', 'ngan-hang', 10),
            array('topic_library', 'Chuyên đề', 'Cây chuyên đề và môn học', 'content', 'chuyen-de', 20),
            array('lesson_library', 'Bài học', 'Bài học và nội dung chi tiết', 'content', 'bai-hoc', 30),
            array('assignment_management', 'Bài tập', 'Giao bài, nộp bài và chấm điểm', 'assessment', 'bai-tap', 40),
            array('exam_management', 'Đề kiểm tra', 'Luyện tập, đề thi và kết quả', 'assessment', 'de-thi', 50),
            array('flashcard_learning', 'Flashcard', 'Ôn tập theo Leitner', 'learning', 'flashcard', 60),
            array('material_library', 'Tài liệu', 'Tài liệu học tập của trường', 'content', 'tai-lieu', 70),
            array('progress_tracking', 'Tiến độ và kết quả', 'Tiến độ, báo cáo và xếp hạng', 'insight', 'ket-qua', 80),
            array('notification_center', 'Thông báo', 'Thông báo cá nhân', 'operations', 'thong-bao', 90),
            array('school_management', 'Quản lý trường', 'Năm học, khối, lớp và người dùng', 'administration', 'quan-tri-truong', 100),
            array('team_management', 'Quản lý đội tuyển', 'Đội tuyển, giáo viên và thành viên', 'administration', 'quan-tri-doi', 110),
            array('studio_tools', 'Studio AI', 'Tạo nội dung và đề bằng AI', 'authoring', 'studio', 120),
        );
        $catalogByCode = $pdo->prepare('SELECT `id`, `route_slug` FROM `module_catalog` WHERE `code` = ? LIMIT 1');
        $catalogByRoute = $pdo->prepare('SELECT `id`, `code` FROM `module_catalog` WHERE `route_slug` = ? LIMIT 1');
        $catalogInsert = $pdo->prepare(
            'INSERT INTO `module_catalog` (`code`, `name`, `description`, `category`, `route_slug`, `status`, `is_legacy`, `position`, `settings_schema_version`) VALUES (?, ?, ?, ?, ?, \'active\', 1, ?, 1)'
        );
        foreach ($catalog as $module) {
            $catalogByCode->execute(array($module[0]));
            $codeRow = $catalogByCode->fetch(PDO::FETCH_ASSOC);
            $catalogByRoute->execute(array($module[4]));
            $routeRow = $catalogByRoute->fetch(PDO::FETCH_ASSOC);
            if ($codeRow && (string) $codeRow['route_slug'] !== (string) $module[4]) {
                throw new RuntimeException('Module code is already mapped to another route slug: ' . $module[0]);
            }
            if ($routeRow && (string) $routeRow['code'] !== (string) $module[0]) {
                throw new RuntimeException('Module route slug is already mapped to another code: ' . $module[4]);
            }
            if (!$codeRow) {
                $catalogInsert->execute(array($module[0], $module[1], $module[2], $module[3], $module[4], $module[5]));
            }
        }

        $teamRows = $pdo->query('SELECT `id` FROM `teams` ORDER BY `id`');
        if ($teamRows === false) {
            throw new RuntimeException('teams could not be read while enabling legacy modules.');
        }
        $teamIds = $teamRows->fetchAll(PDO::FETCH_COLUMN);
        $moduleRows = $pdo->query('SELECT `id` FROM `module_catalog` WHERE `is_legacy` = 1 AND `status` = \'active\' ORDER BY `position`');
        if ($moduleRows === false) {
            throw new RuntimeException('module_catalog could not be read while enabling legacy modules.');
        }
        $moduleIds = $moduleRows->fetchAll(PDO::FETCH_COLUMN);
        $enableTeam = $pdo->prepare(
            'INSERT IGNORE INTO `team_modules` (`team_id`, `module_id`, `enabled`, `position`, `enabled_at`)
             VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)'
        );
        foreach ($teamIds as $teamId) {
            foreach ($moduleIds as $position => $moduleId) {
                $enableTeam->execute(array((int) $teamId, (int) $moduleId, ((int) $position + 1) * 10));
            }
        }

        $schoolRows = $pdo->query(
            'SELECT DISTINCT t.`school_id` FROM `teams` t INNER JOIN `schools` s ON s.`id` = t.`school_id` WHERE t.`school_id` IS NOT NULL ORDER BY t.`school_id`'
        );
        if ($schoolRows === false) {
            throw new RuntimeException('school ids could not be read while enabling legacy modules.');
        }
        $schoolIds = $schoolRows->fetchAll(PDO::FETCH_COLUMN);
        $enableSchool = $pdo->prepare(
            'INSERT IGNORE INTO `school_modules` (`school_id`, `module_id`, `available`, `default_enabled`)
             VALUES (?, ?, 1, 1)'
        );
        foreach ($schoolIds as $schoolId) {
            foreach ($moduleIds as $moduleId) {
                $enableSchool->execute(array((int) $schoolId, (int) $moduleId));
            }
        }
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0006_module_catalog is not reversible because catalog and module assignments are operational data.');
    },
);
