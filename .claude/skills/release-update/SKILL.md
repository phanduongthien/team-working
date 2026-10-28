---
name: release-update
description: Quy trình phát hành phiên bản mới của Team Assistant lên GitHub Releases để app của các thành viên tự cập nhật (electron-builder + electron-updater + GitHub Actions). Dùng khi cần release, bump version, hoặc sửa pipeline CI/CD.
---

# Release & auto-update

1. Đảm bảo `main` xanh: lint, typecheck, test, e2e smoke.
2. Chọn version theo SemVer dựa trên commit từ tag trước (`feat` → minor, `fix` → patch, breaking → major).
3. Cập nhật `CHANGELOG.md` (chuyển Unreleased → version mới, viết tiếng Việt dễ hiểu cho người dùng).
4. `npm version <x.y.z>` → tạo commit + tag `vX.Y.Z`; **hỏi người dùng trước khi push**.
5. Push tag (`git push origin main --follow-tags`) → workflow `.github/workflows/release.yml` chạy trên `windows-latest`: kiểm tra tag khớp `package.json`, tạo `.env.production` từ secret `PROD_SUPABASE_*`, `electron-builder --win --publish always` với `GITHUB_TOKEN`.
6. Cấu hình publish GitHub truyền qua `-c.publish.*` trong workflow (chạy bằng `bash` — PowerShell tách sai tham số), **không** để trong `electron-builder.yml` để build cục bộ không cần biết repo. App (`src/main/services/updater.ts`) kiểm tra lúc mở và mỗi 6 giờ, tải nền, hiện `UpdateBanner` "Có bản mới — khởi động lại để cập nhật". Thiết lập repo/secrets/branch protection: `docs/release.md`.
7. Nếu có migration Supabase trong bản này: chạy `supabase db push` **trước** khi publish release, migration phải tương thích ngược với bản app cũ.
8. Code signing: nếu chưa có chứng chỉ, ghi chú trong release rằng Windows SmartScreen có thể cảnh báo.
