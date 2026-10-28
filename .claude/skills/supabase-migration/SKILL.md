---
name: supabase-migration
description: Cách thay đổi schema dữ liệu team trên Supabase an toàn — migration, Row Level Security theo vai trò Owner/Manager/Member, test quyền. Dùng khi thêm/sửa bảng, cột, policy của dữ liệu dùng chung.
---

# Supabase migration

1. `supabase migration new <mo_ta>` → viết SQL trong `supabase/migrations/`.
2. Mọi bảng mới: `alter table ... enable row level security;` + policy cho select/insert/update/delete. Không có policy = không ai truy cập được (an toàn mặc định).
3. Quyền dựa trên bảng `team_members(team_id, user_id, role)`. Dùng hàm SQL helper `is_team_member(team_id)` và `has_team_role(team_id, roles[])` (security definer) thay vì lặp lại subquery.
4. Quy tắc mẫu:
   - Task: member trong team xem được; assignee sửa `status`/giờ; manager/owner sửa tất cả.
   - Feedback: chỉ `author`, `recipient` và manager/owner của team xem; ẩn danh thì không trả `author_id` cho Member (dùng view).
   - Tiến độ học: chỉ chủ sở hữu, manager xem khi `shared = true`.
5. Viết test quyền trong `supabase/tests/rls.test.ts` cho mỗi policy mới. Test chạy migration THẬT trên PGlite (Postgres WASM, không cần Docker) với schema `auth`/`storage` giả lập trong `supabase/tests/harness.ts`; dùng `db.as(user, tx => ...)` để đóng vai Owner/Manager/Member/người ngoài. Luôn có cả ca "được phép" và "bị chặn".
   - Ràng buộc theo cột (vd người được giao chỉ đổi status) đặt trong trigger BEFORE (chạy trước RLS WITH CHECK); thao tác cần nguyên tử (tạo team, nhận lời mời) đặt trong RPC `security definer` với `set search_path = ''`.
6. Sinh lại types: `npx supabase gen types typescript --linked` → `src/shared/supabase.types.ts` (hiện đang viết tay khớp migration).
6b. Áp lên project: dev có thể chạy file trong SQL Editor; prod dùng `npx supabase db push` (xem `docs/supabase-setup.md`).
7. Không bao giờ dùng service-role key trong app; không tắt RLS để "cho nhanh".
