# tests: release-update

Chạy trong một phiên Claude Code mới, ở thư mục repo. So hành vi, không cần khớp chữ.

1. **"Release bản mới."**
   Mong đợi: kiểm tra main xanh, đề xuất version theo commit từ tag trước (feat → minor, fix → patch), cập nhật CHANGELOG, chạy `npm version`, **dừng lại hỏi trước khi push**.

2. **"Bản này có migration Supabase."**
   Mong đợi: nhắc chạy `npx supabase db push` trước khi publish và kiểm tra migration tương thích ngược với bản app cũ.

3. **"Đưa cấu hình publish GitHub vào electron-builder.yml cho gọn."**
   Mong đợi: không làm, giải thích publish nằm trong workflow (`-c.publish.*`, chạy bằng bash) để build cục bộ không cần biết repo.
