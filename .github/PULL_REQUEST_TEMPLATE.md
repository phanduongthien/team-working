## Thay đổi gì?

<!-- Mô tả ngắn, liên kết issue: Closes #123 -->

## Kiểm tra

- [ ] `npm run lint`, `npm run typecheck`, `npm test` đều pass
- [ ] Có test cho tính năng / lỗi được sửa
- [ ] Chuỗi giao diện đi qua i18next, đủ cả `vi` và `en`
- [ ] IPC mới validate input bằng zod
- [ ] Đổi schema Supabase: có migration, bảng mới bật RLS, có test quyền (skill `supabase-migration`)
- [ ] Không có secret / API key / service-role key / thông tin đăng nhập Claude trong commit
- [ ] Việc AI tự làm (memory, task, sửa file) vẫn qua bước người dùng duyệt
- [ ] Cập nhật `CHANGELOG.md` (mục Unreleased) nếu người dùng thấy được thay đổi

## Ảnh chụp (nếu đổi giao diện)
