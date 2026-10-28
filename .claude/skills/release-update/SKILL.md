---
name: release-update
description: Quy trình phát hành phiên bản mới của Team Assistant lên GitHub Releases để app của các thành viên tự cập nhật (electron-builder + electron-updater + GitHub Actions). Dùng khi cần release, bump version, hoặc sửa pipeline CI/CD.
---

# Release & auto-update

1. Đảm bảo `main` xanh: lint, typecheck, test, e2e smoke.
2. Chọn version theo SemVer dựa trên commit từ tag trước (`feat` → minor, `fix` → patch, breaking → major).
3. Cập nhật `CHANGELOG.md` (chuyển Unreleased → version mới, viết tiếng Việt dễ hiểu cho người dùng).
4. `npm version <x.y.z>` → tạo commit + tag `vX.Y.Z`; **hỏi người dùng trước khi push**.
5. Push tag → workflow `.github/workflows/release.yml` chạy trên `windows-latest`: build, `electron-builder --win --publish always` với `GH_TOKEN` từ GitHub Secrets.
6. `electron-builder.yml`: `publish: { provider: github, owner, repo }`, target `nsis`. App gọi `autoUpdater.checkForUpdatesAndNotify()` lúc khởi động và mỗi 6 giờ; hiện thông báo "Có bản mới — khởi động lại để cập nhật".
7. Nếu có migration Supabase trong bản này: chạy `supabase db push` **trước** khi publish release, migration phải tương thích ngược với bản app cũ.
8. Code signing: nếu chưa có chứng chỉ, ghi chú trong release rằng Windows SmartScreen có thể cảnh báo.
