-- Tìm kiếm toàn văn tin nhắn, không phân biệt dấu ("hoc" khớp "học").
-- Bảng FTS tự lưu nội dung, khóa bằng message_id (không dựa vào rowid vì VACUUM có thể đổi rowid).
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
	content,
	message_id UNINDEXED,
	conversation_id UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `messages_fts` (content, message_id, conversation_id)
	SELECT content, id, conversation_id FROM `messages`;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai` AFTER INSERT ON `messages` BEGIN
	INSERT INTO `messages_fts` (content, message_id, conversation_id) VALUES (new.content, new.id, new.conversation_id);
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad` AFTER DELETE ON `messages` BEGIN
	DELETE FROM `messages_fts` WHERE message_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au` AFTER UPDATE OF content ON `messages` BEGIN
	DELETE FROM `messages_fts` WHERE message_id = old.id;
	INSERT INTO `messages_fts` (content, message_id, conversation_id) VALUES (new.content, new.id, new.conversation_id);
END;
