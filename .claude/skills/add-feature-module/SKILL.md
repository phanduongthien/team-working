---
name: add-feature-module
description: Cách thêm một tính năng mới vào Team Assistant theo kiến trúc module (UI, store, IPC, migration, test, đăng ký registry). Dùng khi người dùng hoặc thành viên team muốn thêm/phát triển tính năng mới.
---

# Thêm feature module

1. Hỏi rõ: tính năng làm gì, ai dùng (Owner/Manager/Member), dữ liệu local hay team, cần AI không.
2. Tạo `src/renderer/src/features/<ten-tinh-nang>/` (xem `features/chat` làm mẫu):
   - `index.ts` — export `FeatureDefinition` `{ id, titleKey, icon, route, roles, component, i18n, nav, setup? }` (`id` cũng là namespace i18n; `setup` chạy một lần lúc app khởi động, ví dụ đăng ký listener IPC)
   - `components/`, `store.ts` (Zustand), `api.ts` (gọi preload/Supabase), `i18n/vi.json`, `i18n/en.json`
   - `__tests__/`
3. Nếu cần main process: `src/main/features/<ten>/ipc.ts`, schema zod trong `src/shared/`, expose qua preload với tên có namespace (`window.api.<ten>.*`).
4. Dữ liệu local → bảng Drizzle mới + `npm run db:generate`. Dữ liệu team → skill `supabase-migration`.
5. Cần AI → dùng `AIProvider` (skill `claude-bridge`); nếu cần hành vi riêng, thêm skill vào `assistant-skills/<ten>/SKILL.md`.
6. Đăng ký trong `src/renderer/src/features/registry.ts` — **đây là chỗ duy nhất** chạm vào lõi. Test `features/__tests__/i18n-keys.test.ts` bắt buộc `vi.json`/`en.json` có cùng bộ khóa.
7. Chạy `npm run lint && npm run typecheck && npm test`, chạy thử app.
8. Cập nhật `CHANGELOG.md` mục Unreleased; commit `feat(<ten>): ...`; mở PR theo template.

Không sửa module của người khác trong cùng PR trừ khi bắt buộc — ghi rõ lý do trong PR.
