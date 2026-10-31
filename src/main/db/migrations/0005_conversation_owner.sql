ALTER TABLE `conversations` ADD `owner` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
CREATE INDEX `conversations_owner_idx` ON `conversations` (`owner`);--> statement-breakpoint
-- Máy đã có tài khoản nhận dữ liệu 'local' (trí nhớ, hồ sơ) → lịch sử chat cũ cũng thuộc tài khoản đó.
UPDATE `conversations` SET `owner` = (
  SELECT json_extract(`value`, '$') FROM `settings` WHERE `key` = 'account.localClaimedBy'
) WHERE EXISTS (
  SELECT 1 FROM `settings` WHERE `key` = 'account.localClaimedBy' AND json_extract(`value`, '$') IS NOT NULL
);
