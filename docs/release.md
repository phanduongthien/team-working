# Phát hành & tự cập nhật

App tự cập nhật từ **GitHub Releases** (electron-builder + electron-updater). Đẩy tag `vX.Y.Z` → workflow `.github/workflows/release.yml` build installer Windows và đăng release; app đã cài kiểm tra bản mới lúc mở và mỗi 6 giờ, tải nền rồi hiện "Có bản mới — khởi động lại để cập nhật".

> Repo phải **public** để app của thành viên tải được bản cập nhật mà không cần token. Nếu repo private, cần cơ chế khác (không nhúng token vào app).

## Thiết lập một lần (sau khi tạo repo trên GitHub)

1. **Remote & đẩy code**
   ```powershell
   git remote add origin https://github.com/phanduongthien/team-working.git
   git push -u origin main
   ```
2. **Settings → Secrets and variables → Actions → Secrets**
   | Secret | Dùng ở | Giá trị |
   |---|---|---|
   | `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY` | CI e2e | project dev |
   | `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY` | Release | project prod |

   Chỉ anon/publishable key — **không bao giờ** service-role key. `GITHUB_TOKEN` có sẵn, không cần tạo.
3. **Settings → Environments → New environment `production`**: thêm chính mình làm *Required reviewer* để mỗi lần phát hành phải bấm duyệt (tùy chọn nhưng nên làm). Có thể chuyển 2 secret `PROD_*` vào environment này.
4. **Settings → Branches → Add branch ruleset** cho `main`:
   - Require a pull request before merging (1 approval, require review from Code Owners).
   - Require status checks to pass: `Lint, typecheck, test` (và `E2E smoke (Electron)`).
   - Block force pushes, restrict deletions.
5. `.github/CODEOWNERS` đang để `@phanduongthien` — thêm người duyệt khác nếu cần.
6. Muốn nút "Mở trang tạo issue" chạy ở bản dev: thêm `VITE_GITHUB_REPO=phanduongthien/team-working` vào `.env` (bản release tự điền).

## Project Supabase production

1. Tạo project mới, làm các bước trong `docs/supabase-setup.md` (GitHub provider, Redirect URL `http://127.0.0.1:47823/auth/callback`).
2. Áp schema bằng CLI: `npx supabase link --project-ref <prod-ref>` → `npx supabase db push`.
3. Điền secret `PROD_SUPABASE_*` như trên.

## Mỗi lần phát hành (skill `release-update`)

1. `main` xanh (CI pass).
2. Chọn version theo SemVer từ các commit kể từ tag trước.
3. Chuyển mục *Unreleased* trong `CHANGELOG.md` sang version mới, commit.
4. `npm version <x.y.z>` → tạo commit + tag `vX.Y.Z`.
5. Có migration Supabase mới? `npx supabase db push` lên prod **trước**, migration phải tương thích với bản app cũ.
6. `git push origin main --follow-tags` → theo dõi tab Actions → duyệt environment `production` nếu có.
7. Release được đăng kèm `team-working-x.y.z-setup.exe`, `.blockmap`, `latest.yml` (electron-updater cần cả ba).

**Chưa ký số (code signing):** Windows SmartScreen sẽ cảnh báo lần cài đầu — chọn *More info → Run anyway*. Ghi chú điều này trong mô tả release.

## Build thử trên máy

```powershell
npm run build:win       # dùng .env.production nếu có, không đăng gì lên GitHub
npm run build:win:dev   # trỏ project dev
```

Installer nằm trong `release/<version>/`. Bản build cục bộ không có cấu hình publish nên không tự cập nhật (chỉ ghi cảnh báo vào log).
