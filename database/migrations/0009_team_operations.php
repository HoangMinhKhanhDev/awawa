<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        MigrationSchema::ensureColumn($pdo, 'assignments', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'published\'');
        MigrationSchema::ensureColumn($pdo, 'assignments', 'module_code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureColumn($pdo, 'assignments', 'audience_mode', 'VARCHAR(20) NOT NULL DEFAULT \'team\'');
        MigrationSchema::ensureColumn($pdo, 'assignments', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureColumn($pdo, 'submissions', 'team_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'submissions', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'draft\'');
        MigrationSchema::ensureColumn($pdo, 'submissions', 'graded_by', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'submissions', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureIndex($pdo, 'submissions', 'idx_submissions_team', '`team_id`, `status`');
        MigrationSchema::ensureColumn($pdo, 'exams', 'team_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'exams', 'module_code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureColumn($pdo, 'exams', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'published\'');
        MigrationSchema::ensureColumn($pdo, 'exams', 'created_by', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'exams', 'published_at', 'DATETIME NULL');
        MigrationSchema::ensureColumn($pdo, 'exams', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        MigrationSchema::ensureIndex($pdo, 'exams', 'idx_exams_team_status', '`team_id`, `status`, `id`');
        MigrationSchema::ensureColumn($pdo, 'attempts', 'team_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'attempts', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'submitted\'');
        MigrationSchema::ensureColumn($pdo, 'attempts', 'started_at', 'DATETIME NULL');
        MigrationSchema::ensureColumn($pdo, 'attempts', 'submitted_at', 'DATETIME NULL');
        MigrationSchema::ensureIndex($pdo, 'attempts', 'idx_attempts_team_user', '`team_id`, `student_id`, `created_at`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `assignment_class_targets` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `assignment_id` INT NOT NULL,
                `class_id` INT NOT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_assignment_class_target` (`assignment_id`, `class_id`),
                KEY `idx_assignment_class_targets_class` (`class_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'assignment_class_targets', 'uq_assignment_class_target', '`assignment_id`, `class_id`');
        MigrationSchema::ensureIndex($pdo, 'assignment_class_targets', 'idx_assignment_class_targets_class', '`class_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `assignment_recipients` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `assignment_id` INT NOT NULL,
                `team_id` INT NOT NULL,
                `user_id` INT NOT NULL,
                `source` VARCHAR(20) NOT NULL DEFAULT \'team\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_assignment_recipient` (`assignment_id`, `user_id`),
                KEY `idx_assignment_recipients_team_user` (`team_id`, `user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'assignment_recipients', 'uq_assignment_recipient', '`assignment_id`, `user_id`');
        MigrationSchema::ensureIndex($pdo, 'assignment_recipients', 'idx_assignment_recipients_team_user', '`team_id`, `user_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `exam_items` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `exam_id` INT NOT NULL,
                `source_question_id` INT NULL,
                `position` INT NOT NULL,
                `qtype` VARCHAR(32) NOT NULL DEFAULT \'trac_nghiem\',
                `content_snapshot` MEDIUMTEXT NOT NULL,
                `options_snapshot` MEDIUMTEXT NULL,
                `answer_key` MEDIUMTEXT NULL,
                `explanation` MEDIUMTEXT NULL,
                `points` DECIMAL(10,2) NOT NULL DEFAULT 1,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_exam_item_position` (`exam_id`, `position`),
                KEY `idx_exam_items_question` (`source_question_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'exam_items', 'uq_exam_item_position', '`exam_id`, `position`');
        MigrationSchema::ensureIndex($pdo, 'exam_items', 'idx_exam_items_question', '`source_question_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `attempt_items` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `attempt_id` BIGINT UNSIGNED NOT NULL,
                `exam_item_id` BIGINT UNSIGNED NULL,
                `question_id` INT NULL,
                `position` INT NOT NULL,
                `user_answer` MEDIUMTEXT NULL,
                `is_correct` TINYINT NULL,
                `awarded_points` DECIMAL(10,2) NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_attempt_item_position` (`attempt_id`, `position`),
                KEY `idx_attempt_items_question` (`question_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'attempt_items', 'uq_attempt_item_position', '`attempt_id`, `position`');
        MigrationSchema::ensureIndex($pdo, 'attempt_items', 'idx_attempt_items_question', '`question_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `team_lesson_progress` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `team_id` INT NOT NULL,
                `user_id` INT NOT NULL,
                `lesson_id` INT NOT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'completed\',
                `completed_at` DATETIME NULL,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_team_lesson_progress` (`team_id`, `user_id`, `lesson_id`),
                KEY `idx_team_lesson_progress_user` (`user_id`, `status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'team_lesson_progress', 'uq_team_lesson_progress', '`team_id`, `user_id`, `lesson_id`');
        MigrationSchema::ensureIndex($pdo, 'team_lesson_progress', 'idx_team_lesson_progress_user', '`user_id`, `status`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `team_flashcard_progress` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `team_id` INT NOT NULL,
                `user_id` INT NOT NULL,
                `card_id` INT NOT NULL,
                `box` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                `last_reviewed_at` DATETIME NULL,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_team_flashcard_progress` (`team_id`, `user_id`, `card_id`),
                KEY `idx_team_flashcard_progress_user` (`user_id`, `box`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'team_flashcard_progress', 'uq_team_flashcard_progress', '`team_id`, `user_id`, `card_id`');
        MigrationSchema::ensureIndex($pdo, 'team_flashcard_progress', 'idx_team_flashcard_progress_user', '`user_id`, `box`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `file_assets` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `school_id` INT NULL,
                `team_id` INT NULL,
                `uploader_user_id` INT NOT NULL,
                `owner_type` VARCHAR(32) NOT NULL,
                `owner_id` VARCHAR(128) NOT NULL,
                `storage_key` VARCHAR(190) NOT NULL,
                `original_name` VARCHAR(255) NOT NULL,
                `mime_type` VARCHAR(160) NOT NULL,
                `size_bytes` BIGINT UNSIGNED NOT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT \'active\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_file_assets_storage` (`storage_key`),
                KEY `idx_file_assets_scope` (`school_id`, `team_id`, `status`),
                KEY `idx_file_assets_owner` (`owner_type`, `owner_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        MigrationSchema::ensureIndex($pdo, 'file_assets', 'uq_file_assets_storage', '`storage_key`');
        MigrationSchema::ensureIndex($pdo, 'file_assets', 'idx_file_assets_scope', '`school_id`, `team_id`, `status`');
        MigrationSchema::ensureIndex($pdo, 'file_assets', 'idx_file_assets_owner', '`owner_type`, `owner_id`');

        $pdo->exec('UPDATE submissions s INNER JOIN assignments a ON a.id=s.assignment_id SET s.team_id=a.team_id WHERE s.team_id IS NULL');
        $pdo->exec('UPDATE attempts a INNER JOIN exams e ON e.id=a.exam_id SET a.team_id=e.team_id WHERE a.team_id IS NULL');

        $quarantine = $pdo->prepare(
            'INSERT IGNORE INTO `migration_quarantine` (`migration_version`, `entity_type`, `entity_id`, `reason`, `payload`) VALUES (?, ?, ?, ?, ?)'
        );
        foreach (array('assignments' => 'missing_team_id', 'exams' => 'missing_team_id', 'attempts' => 'missing_team_id') as $table => $reason) {
            $rows = $pdo->query("SELECT `id` FROM `$table` WHERE `team_id` IS NULL OR `team_id` <= 0");
            if ($rows === false) throw new RuntimeException($table . ' could not be read for team quarantine.');
            while (($row = $rows->fetch(PDO::FETCH_ASSOC)) !== false) {
                $quarantine->execute(array('0009_team_operations', $table, (string) $row['id'], $reason, json_encode($row, JSON_UNESCAPED_UNICODE)));
            }
        }

        $pdo->exec(
            'INSERT IGNORE INTO team_lesson_progress (team_id,user_id,lesson_id,status,completed_at) SELECT tm.team_id,lc.student_id,lc.lesson_id,\'completed\',lc.completed_at FROM lesson_completions lc INNER JOIN team_memberships tm ON tm.user_id=lc.student_id AND tm.role=\'student\' AND tm.access=\'include\' AND tm.status=\'active\' AND tm.left_at IS NULL WHERE (SELECT COUNT(*) FROM team_memberships x WHERE x.user_id=lc.student_id AND x.role=\'student\' AND x.access=\'include\' AND x.status=\'active\' AND x.left_at IS NULL)=1'
        );
        if (MigrationSchema::tableExists($pdo, 'flashcard_progress')) {
            $pdo->exec(
                'INSERT IGNORE INTO team_flashcard_progress (team_id,user_id,card_id,box,last_reviewed_at) SELECT tm.team_id,fp.student_id,fp.card_id,fp.box,fp.last_reviewed_at FROM flashcard_progress fp INNER JOIN team_memberships tm ON tm.user_id=fp.student_id AND tm.role=\'student\' AND tm.access=\'include\' AND tm.status=\'active\' AND tm.left_at IS NULL WHERE (SELECT COUNT(*) FROM team_memberships x WHERE x.user_id=fp.student_id AND x.role=\'student\' AND x.access=\'include\' AND x.status=\'active\' AND x.left_at IS NULL)=1'
            );
        }

        $exams = $pdo->query('SELECT id, question_ids FROM exams');
        if ($exams === false) throw new RuntimeException('exams could not be read for item snapshot.');
        $item = $pdo->prepare('INSERT IGNORE INTO exam_items (exam_id,source_question_id,position,qtype,content_snapshot,options_snapshot,answer_key,explanation,points) VALUES (?,?,?,?,?,?,?,?,?)');
        while (($exam = $exams->fetch(PDO::FETCH_ASSOC)) !== false) {
            $ids = json_decode((string) $exam['question_ids'], true);
            if (!is_array($ids)) {
                $quarantine->execute(array('0009_team_operations', 'exams', (string) $exam['id'], 'invalid_question_ids_json', json_encode($exam, JSON_UNESCAPED_UNICODE)));
                continue;
            }
            $position = 0;
            foreach ($ids as $questionId) {
                $position++;
                $questionId = (int) $questionId;
                $question = $questionId > 0 ? $pdo->prepare('SELECT * FROM questions WHERE id=?') : null;
                if (!$question) {
                    $quarantine->execute(array('0009_team_operations', 'exams', (string) $exam['id'], 'invalid_question_id', json_encode(array('position' => $position, 'question_id' => $questionId), JSON_UNESCAPED_UNICODE)));
                    continue;
                }
                $question->execute(array($questionId));
                $snapshot = $question->fetch(PDO::FETCH_ASSOC);
                if (!$snapshot) {
                    $quarantine->execute(array('0009_team_operations', 'exams', (string) $exam['id'], 'question_not_found', json_encode(array('position' => $position, 'question_id' => $questionId), JSON_UNESCAPED_UNICODE)));
                    continue;
                }
                $item->execute(array((int) $exam['id'], $questionId, $position, (string) $snapshot['qtype'], (string) $snapshot['content'], $snapshot['options'], $snapshot['correct_answer'], $snapshot['explanation'], (float) $snapshot['score']));
            }
        }
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0009_team_operations is not reversible because progress and assessment snapshots require operator review.');
    },
);
