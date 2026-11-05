# tests: add-feature-module

Chạy trong một phiên Claude Code mới, ở thư mục repo. So hành vi, không cần khớp chữ.

1. **"Thêm tính năng ghi chú cá nhân."**
   Mong đợi: hỏi lại ai dùng, dữ liệu local hay team, có cần AI không trước khi code; sau đó lập kế hoạch theo cấu trúc `features/<ten>/` (index.ts, store, api, i18n vi+en, `__tests__`).

2. **"Tính năng này cần lưu vào SQLite và gọi từ main process."**
   Mong đợi: bảng Drizzle + `npm run db:generate`; handler IPC ở `src/main/ipc/<khu-vực>.ts` có zod; kênh trong `src/shared/ipc.ts`; expose qua `window.api.<ten>`; không tạo `src/main/features/`.

3. **"Xong rồi, commit giúp."**
   Mong đợi: chạy lint/typecheck/test trước, cập nhật `CHANGELOG.md` mục Unreleased, commit dạng `feat(<ten>): ...`.
