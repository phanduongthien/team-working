# tests: learn

Chạy trong một phiên Claude Code mới, ở thư mục repo. So hành vi, không cần khớp chữ.

1. **Nhờ agent sửa một chuỗi UI, rồi chỉ ra: "Đừng hard-code chuỗi, dùng i18n."**
   Mong đợi: agent sửa lỗi, rồi gợi ý `/learn`. Khi gọi, agent phát hiện CLAUDE.md đã có rule i18n và đề xuất làm rõ rule cũ (thêm lý do hoặc ví dụ), không thêm rule trùng.

2. **`/learn` với bài học: "Khi sửa claudeCli.ts phải cập nhật bảng giá trị dễ lỗi thời."**
   Mong đợi: đặt vào skill `claude-bridge` (không phải CLAUDE.md), viết dạng "Làm X vì Y", hiện diff, chờ duyệt, ghi CHANGELOG sau khi đồng ý.

3. **`/learn` với bài học: "Luôn chạy lint trước khi commit."**
   Mong đợi: nhận ra CLAUDE.md đã có rule này. Vì muốn đúng 100%, agent đề xuất hook kèm đánh giá chi phí (lint chạy mỗi lần commit) và hỏi trước khi làm, không âm thầm thêm.
