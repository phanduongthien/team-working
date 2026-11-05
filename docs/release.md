# Phát hành & tự cập nhật

App tự cập nhật từ **GitHub Releases** (electron-builder + electron-updater). Đẩy tag `vX.Y.Z` → workflow `.github/workflows/release.yml` build installer Windows và đăng release.

**App đã cài làm gì** (`src/main/update/`):
- Kiểm tra khi mở app và mỗi 2 giờ (tắt được trong *Cài đặt → Cập nhật*). Đọc feed `releases.atom` + `latest.yml`, không gọi REST API nên không vướng giới hạn 60 request/giờ.
- Có bản mới → hộp thoại: phiên bản, ngày, changelog (nội dung Release, hiển thị dạng chữ thuần) và *Cập nhật ngay / Để sau / Bỏ qua phiên bản này*. **Không tự tải** khi người dùng chưa bấm.
- *Cập nhật ngay* → tải nền có tiến trình → hỏi khởi động lại → dừng các lượt chat đang chạy (lưu phần đã nhận) → cài im lặng vào thư mục cũ → mở lại app. Chọn "Để sau" ở bước này thì cài khi thoát app.
- Lần đầu chạy phiên bản mới, app **sao lưu `team-working.db`** vào `%APPDATA%\Team Working\backups\` (giữ 3 bản) trước khi chạy migration.
- **Bản bắt buộc** — tiêu đề Release có `[critical]`, hoặc ghi chú của một bản nằm giữa có `[critical]`: không có nút "Bỏ qua", "Để sau" chỉ hoãn tới lần kiểm tra kế tiếp, có dải cam trên đầu app (bấm = cập nhật).
- **Kênh beta**: máy chọn kênh beta nhận cả GitHub pre-release (tag dạng `v0.5.0-beta.1`); kênh stable chỉ nhận release thường.

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
2. Chọn version theo SemVer từ các commit kể từ tag trước. Bản thử nghiệm cho kênh beta: thêm hậu tố `-beta.N` (vd `0.5.0-beta.1`).
3. Chuyển mục *Unreleased* trong `CHANGELOG.md` sang version mới (`## [x.y.z] - YYYY-MM-DD`), commit. Nội dung mục này là changelog thành viên thấy trong hộp thoại cập nhật — viết cho người dùng đọc.
   - **Bản bắt buộc**: thêm ` [critical]` vào cuối dòng tiêu đề (`## [0.4.1] - 2026-11-20 [critical]`). Workflow tự thêm `[critical]` vào tiêu đề Release và một dòng đánh dấu vào ghi chú. Release đã đăng mà cần chuyển thành bắt buộc: sửa tiêu đề trên GitHub, thêm `[critical]` — app nhận ở lần kiểm tra sau (feed GitHub có thể trễ vài phút).
4. `npm version <x.y.z>` → tạo commit + tag `vX.Y.Z`.
5. Có migration Supabase mới? `npx supabase db push` lên prod **trước**, migration phải tương thích với bản app cũ.
6. `git push origin main --follow-tags` → theo dõi tab Actions → duyệt environment `production` nếu có.
7. Workflow tạo release (ghi chú lấy từ mục tương ứng trong CHANGELOG) rồi tải lên `team-working-x.y.z-setup.exe`, `.blockmap`, `latest.yml`. Kiểm tra: mỗi tag chỉ có **một** release và link `https://github.com/phanduongthien/team-working/releases/download/vX.Y.Z/latest.yml` tải được.

## Chưa ký số (code signing) — ảnh hưởng và cách xử lý

| Tình huống | Ảnh hưởng |
|---|---|
| **Cài lần đầu** (tải `setup.exe` bằng trình duyệt) | SmartScreen hiện *"Windows protected your PC"* → *More info → Run anyway*. Ghi chú điều này trong README/mô tả release. |
| **Cập nhật trong app** | Thường **không** bị SmartScreen chặn: file do electron-updater tải không mang dấu *Mark of the Web*. Antivirus vẫn có thể quét/báo nhầm. |
| **Toàn vẹn bản cập nhật** | Không có chữ ký → app chỉ kiểm tra **sha512 trong `latest.yml`**. Ai chiếm được quyền đăng Release (tài khoản GitHub, token CI) có thể phát tán bản độc tới cả team. |

Giảm rủi ro ngay (miễn phí): bật **2FA** cho mọi tài khoản có quyền ghi repo; giữ environment `production` có *Required reviewer*; chỉ phát hành qua workflow (không tải file lên Release bằng tay).

Muốn hết cảnh báo SmartScreen về lâu dài:
- **Azure Trusted Signing / Artifact Signing** (khoảng 10 USD/tháng): ký trong GitHub Actions, cần xác minh danh tính — kiểm tra điều kiện quốc gia/cá nhân trước khi đăng ký.
- **Chứng chỉ OV/EV** mua từ CA: từ 2024 kể cả EV cũng không được SmartScreen tin ngay, uy tín tích lũy dần theo số lượt tải.
- SignPath Foundation (miễn phí) chỉ dành cho dự án mã nguồn mở có license OSI — repo này đang `UNLICENSED`.

Khi có chứng chỉ: thêm bước ký vào workflow và `win.signtoolOptions.publisherName` trong `electron-builder.yml` — electron-updater sẽ kiểm tra chữ ký bản cập nhật trước khi cài.

## Thử luồng cập nhật trên máy (không đụng Release thật)

`scripts/mock-update-server.mjs` giả lập server cập nhật. **Không tạo/sửa Release trên GitHub để thử** — repo public, cả team đang dùng.

### Cách 1 — nhanh, không cần cài (thấy hộp thoại, tiến trình tải, banner bắt buộc)

```powershell
npx electron-vite build
# Terminal 1: bản giả 9.9.9, giới hạn 512 KB/s để thấy thanh tiến trình
node scripts/mock-update-server.mjs --version 9.9.9 --kbps 512 --config "$env:TEMP\mmc-update.yml" --notes "<ul><li>Thử thông báo</li></ul>"
# Terminal 2: chạy app với dữ liệu riêng (không đụng dữ liệu thật)
$env:TEAM_WORKING_USER_DATA="$env:TEMP\mmc-test-data"; $env:MMC_UPDATE_CONFIG="$env:TEMP\mmc-update.yml"; npx electron .
```

- Thử bản bắt buộc: thêm `--title "MMC studio 9.9.9 [critical]"` khi chạy server.
- Đã tải một lần thì lần sau tải xong ngay (file nằm trong cache): xóa `%LOCALAPPDATA%\mmc-studio-updater-test` để thấy lại tiến trình.
- Cách này dừng ở bước "Khởi động lại" — file cài là file giả, **đừng bấm Khởi động lại**.
- Test tự động tương đương: `npm run test:e2e` (file `tests/e2e/update.spec.ts`).

### Cách 2 — đầy đủ tới bước cài (cài bản cũ, thấy thông báo bản mới, khởi động lại)

⚠️ Cài đè lên MMC studio đang cài trên máy (dữ liệu ở `%APPDATA%\Team Working\` được giữ và tự sao lưu, nhưng nên tự copy thư mục đó ra chỗ khác trước). Làm trên nhánh riêng, không commit thay đổi version.

1. **Build bản "cũ"** trỏ tới server giả lập:
   ```powershell
   npm run build
   npx electron-builder --win --publish never -c.publish.provider=generic -c.publish.url=http://127.0.0.1:8765/
   ```
   Cài `release\<version>\team-working-<version>-setup.exe`.
2. **Build bản "mới"**: tăng version tạm thời (vd `npm version 0.3.1 --no-git-tag-version`), chạy lại 2 lệnh trên. Sau đó trả lại version cũ: `git checkout package.json package-lock.json`.
3. **Phục vụ bản mới**:
   ```powershell
   node scripts/mock-update-server.mjs --dir release\0.3.1 --kbps 2048 --notes "<ul><li>Bản thử cập nhật</li></ul>"
   ```
   (thêm `--title "MMC studio 0.3.1 [critical]"` để thử bản bắt buộc)
4. Mở app đã cài → thấy hộp thoại bản 0.3.1 → *Cập nhật ngay* → *Khởi động lại* → app mở lại, *Cài đặt → Cập nhật* hiện "Đang dùng phiên bản 0.3.1"; lịch sử chat còn nguyên; có file sao lưu trong `%APPDATA%\Team Working\backups\`.
5. Xong thì cài lại bản chính thức mới nhất từ Releases (bản thử trỏ server giả lập sẽ không tự cập nhật từ GitHub), và xóa các file trong `%LOCALAPPDATA%\team-working-updater\pending\` — bản đã cài dùng chung thư mục cache này.

> Không cần cài mà vẫn thử được bản đóng gói: sau bước 1, chạy thẳng `release\<version>\win-unpacked\MMC studio.exe` (đặt `$env:TEAM_WORKING_USER_DATA` sang thư mục tạm để không đụng dữ liệu thật) với server giả lập ở chế độ file giả (không `--dir`) — thấy được tới bước "Đã tải xong", đừng bấm Khởi động lại. Nhớ dọn thư mục `pending` như trên.

### Thử kênh beta với GitHub thật

Chỉ làm khi trưởng nhóm đã duyệt: tạo tag `vX.Y.Z-beta.N` → workflow tạo **pre-release** (kênh stable không nhận). Máy thử chọn *Cài đặt → Cập nhật → Thử nghiệm (beta)* rồi *Kiểm tra ngay*.

## Build thử trên máy

```powershell
npm run build:win       # dùng .env.production nếu có, không đăng gì lên GitHub
npm run build:win:dev   # trỏ project dev
```

Installer nằm trong `release/<version>/`. Bản build cục bộ không có cấu hình publish nên không tự cập nhật (chỉ ghi cảnh báo vào log).
