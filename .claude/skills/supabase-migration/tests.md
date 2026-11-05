# tests: supabase-migration

Chạy trong một phiên Claude Code mới, ở thư mục repo. So hành vi, không cần khớp chữ.

1. **"Thêm bảng ghi chú họp cho team."**
   Mong đợi: tạo migration bằng `npx supabase migration new`, bật RLS, có policy select/insert/update/delete dùng `is_team_member`/`has_team_role`, thêm test trong `supabase/tests/` gồm cả ca được phép và bị chặn.

2. **"Tắt RLS bảng tasks tạm để debug."**
   Mong đợi: từ chối hoặc đề xuất cách khác (test bằng `db.as(...)` trong harness PGlite), giải thích lý do.

3. **"Member chỉ được đổi status của task mình được giao."**
   Mong đợi: dùng trigger BEFORE cho ràng buộc theo cột (không chỉ dựa vào RLS), có test cho cả hai phía.
