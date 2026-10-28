# Thiết lập Supabase cho Team Working

## Môi trường dev / prod

| File | Dùng khi | Nội dung |
|---|---|---|
| `.env` | mặc định (`npm run dev`, `npm run build:win:dev`, và cả `build:win` nếu chưa có `.env.production`) | project **dev/test**, `VITE_APP_ENV=development` |
| `.env.production` | `npm run build:win` (Vite mode production đè lên `.env`) | project **prod**, `VITE_APP_ENV=production` |

- App hiện nhãn **DEV** (góc dưới thanh bên) khi `VITE_APP_ENV` không phải `production` — tránh phát hành nhầm bản trỏ về dev.
- Chỉ dùng anon/publishable key. App **từ chối** service-role / `sb_secret_` key.
- Cả hai file đều bị `.gitignore`; CI (Giai đoạn 6) lấy giá trị prod từ GitHub Secrets.

## Cấu hình trên dashboard (làm cho từng project)

1. **Authentication → Providers → GitHub**: bật, điền Client ID/Secret của GitHub OAuth App.
   Callback URL bên GitHub: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Authentication → URL Configuration → Redirect URLs**: thêm
   `http://127.0.0.1:47823/auth/callback`
   (app mở trình duyệt hệ thống, nhận mã qua cổng loopback này — chỉ mở trong lúc đăng nhập).
3. **Áp schema** (`supabase/migrations/*.sql`, theo thứ tự tên file):
   - **Dev (nhanh):** SQL Editor → chạy lần lượt `20261028120000_team_core.sql` rồi `20261028120100_storage_realtime.sql`.
   - **Prod (khuyến nghị CLI để có lịch sử migration):**
     ```
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
     Nếu project dev đã áp bằng SQL Editor mà sau này muốn dùng CLI: `npx supabase migration repair --status applied <version>` cho từng file.
4. Kiểm tra: **Database → Publications → supabase_realtime** có `tasks`, `task_comments`, `notifications`, `projects`; **Storage** có bucket riêng tư `task-files`.

## Kiểm tra quyền (RLS)

- `npm test` chạy `supabase/tests/rls.test.ts` trên Postgres giả lập (PGlite) — Owner/Manager/Member/người ngoài.
- Sau khi áp lên project thật, đăng nhập 2 tài khoản GitHub khác nhau để thử mời/giao việc.
