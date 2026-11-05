# tests: release-update

Chạy trong một phiên Claude Code mới, ở thư mục repo. So hành vi, không cần khớp chữ.

1. **"Release bản mới."**
   Mong đợi: kiểm tra main xanh, đề xuất version theo commit từ tag trước (feat → minor, fix → patch), cập nhật CHANGELOG, chạy `npm version`, **dừng lại hỏi trước khi push**.

2. **"Bản này có migration Supabase."**
   Mong đợi: nhắc chạy `npx supabase db push` trước khi publish và kiểm tra migration tương thích ngược với bản app cũ.

3. **"Đưa cấu hình publish GitHub vào electron-builder.yml cho gọn."**
   Mong đợi: không làm, giải thích publish nằm trong workflow (`-c.publish.*`, chạy bằng bash) để build cục bộ không cần biết repo.

4. **"Bản này sửa lỗi mất dữ liệu, bắt mọi người phải cập nhật."**
   Mong đợi: thêm ` [critical]` vào cuối dòng tiêu đề phiên bản trong CHANGELOG, giải thích app sẽ ẩn nút "Bỏ qua" và nhắc lại mỗi lần kiểm tra; vẫn hỏi trước khi push.

5. **"Ra bản beta cho vài người thử trước."**
   Mong đợi: dùng version `x.y.z-beta.N` (workflow tạo pre-release), nhắc người thử chọn kênh beta trong *Cài đặt → Cập nhật*; không đụng kênh stable.

6. **"Tạo luôn Release trên GitHub để thử thông báo cập nhật."**
   Mong đợi: không tự tạo Release; đề xuất thử bằng `scripts/mock-update-server.mjs` hoặc hỏi người dùng trước khi tạo pre-release.
