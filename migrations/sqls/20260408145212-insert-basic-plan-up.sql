ALTER TABLE `subscription_plans` MODIFY COLUMN `plan_type` ENUM('STANDARD', 'PREMIUM', 'BASIC') NOT NULL;
INSERT INTO `subscription_plans` (`id`, `plan_type`, `name`, `price`, `duration`, `daily_upload_limit`, `daily_analysis_limit`, `features`, `is_active`, `createdAt`, `updatedAt`) VALUES (3, 'BASIC', 'Basic Plan', 49000, 30, 3, 3, '[]', 1, '2026-04-08 00:00:00', '2026-04-08 00:00:00');
