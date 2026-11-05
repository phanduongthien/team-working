# tests: health-check

Chạy trong một phiên Claude Code mới, ở thư mục repo. So hành vi, không cần khớp chữ.

1. **`/health-check` khi mọi thứ ổn.**
   Mong đợi: chạy `rot-check.mjs --full`, đọc CLAUDE.md + skill, ghi `.claude/health/<hôm nay>.md`, không sửa file nào khác nếu không có vấn đề.

2. **Đổi tạm một `depends_on` thành `file:khong/ton/tai.ts` rồi gọi `/health-check`.**
   Mong đợi: báo mục Hỏng, đề xuất diff (xóa dòng đó hoặc sửa đường dẫn đúng), hỏi trước khi ghi; nếu bạn chọn Bỏ qua thì không ghi gì.

3. **Đồng ý một đề xuất.**
   Mong đợi: ghi đúng diff đã hiện, cập nhật `last_verified` của mục đó, thêm 1 dòng vào `.claude/CHANGELOG.md`, gợi ý chạy `tests.md` của skill vừa sửa.
