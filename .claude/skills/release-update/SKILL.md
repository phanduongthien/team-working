---
name: release-update
description: Quy trình phát hành phiên bản mới của MMC studio lên GitHub Releases để app của các thành viên tự cập nhật (electron-builder + electron-updater + GitHub Actions). Dùng khi cần release, bump version, hoặc sửa pipeline CI/CD.
metadata:
  last_verified: 2026-11-05
  review_every_days: 30
  depends_on:
    - file:.github/workflows/release.yml
    - file:electron-builder.yml
    - file:src/main/services/updater.ts
    - file:src/main/update/controller.ts
    - file:src/main/update/policy.ts
    - file:scripts/mock-update-server.mjs
    - file:docs/release.md
    - file:CHANGELOG.md
    - npm:electron-builder
    - npm:electron-updater
    - cmd:git
    - url:https://github.com/phanduongthien/team-working/releases
---

# Release & auto-update

1. Đảm bảo `main` xanh: lint, typecheck, test, e2e smoke.
2. Chọn version theo SemVer dựa trên commit từ tag trước (`feat` → minor, `fix` → patch, breaking → major). Bản thử nghiệm: hậu tố `-beta.N` (vd `0.5.0-beta.1`) → workflow tạo **pre-release**, chỉ máy chọn kênh beta nhận.
3. Cập nhật `CHANGELOG.md` (chuyển Unreleased → `## [x.y.z] - YYYY-MM-DD`, viết tiếng Việt dễ hiểu cho người dùng) — nội dung này là changelog thành viên đọc trong hộp thoại cập nhật. Bản **bắt buộc** (sửa lỗi nghiêm trọng): thêm ` [critical]` cuối dòng tiêu đề đó → workflow gắn `[critical]` vào tiêu đề Release; app ẩn nút "Bỏ qua", nhắc lại mỗi lần kiểm tra, hiện dải cam.
4. `npm version <x.y.z>` → tạo commit + tag `vX.Y.Z`; **hỏi người dùng trước khi push**.
5. Push tag (`git push origin main --follow-tags`) → workflow `.github/workflows/release.yml` chạy trên `windows-latest`: kiểm tra tag khớp `package.json`, tạo `.env.production` từ secret `PROD_SUPABASE_*`, tạo Release từ mục CHANGELOG, `electron-builder --win --publish always` với `GITHUB_TOKEN`.
6. Cấu hình publish GitHub truyền qua `-c.publish.*` trong workflow (chạy bằng `bash` — PowerShell tách sai tham số), **không** để trong `electron-builder.yml` để build cục bộ không cần biết repo. App (`src/main/update/`) kiểm tra lúc mở và mỗi 2 giờ, **không tự tải**: hỏi *Cập nhật ngay / Để sau / Bỏ qua phiên bản này*, tải nền có tiến trình rồi hỏi khởi động lại; sao lưu DB lần đầu chạy bản mới. Thiết lập repo/secrets/branch protection: `docs/release.md`.
7. Nếu có migration Supabase trong bản này: chạy `npx supabase db push` **trước** khi publish release, migration phải tương thích ngược với bản app cũ.
8. Code signing: nếu chưa có chứng chỉ, ghi chú trong release rằng Windows SmartScreen có thể cảnh báo.
9. Không tự tạo, sửa hay publish Release, không push `main` khi người dùng chưa đồng ý — repo public và cả team đang tự cập nhật từ đó, một Release lỗi ảnh hưởng mọi người. Thử luồng cập nhật bằng `scripts/mock-update-server.mjs` (`docs/release.md`, mục "Thử luồng cập nhật trên máy") hoặc pre-release đã được người dùng duyệt.
