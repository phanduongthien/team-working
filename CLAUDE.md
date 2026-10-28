# Team Working — hướng dẫn cho Claude Code

App desktop Windows (Electron + React + TypeScript) — trợ lý AI cho học tập, quản lý team, giao việc, feedback, hỗ trợ code & thời gian. AI chạy qua Claude Code CLI đã đăng nhập bằng subscription của từng người dùng.

## Lệnh thường dùng
- `npm run dev` — chạy app ở chế độ dev
- `npm run lint` / `npm run typecheck` / `npm test` — phải pass trước mỗi commit
- `npm run build:win` — build installer Windows
- `npm run db:generate` — sinh migration Drizzle (local SQLite)
- `supabase migration new <tên>` — tạo migration Supabase

## Kiến trúc
- `src/main/` — Electron main process: IPC handlers, `ai/` (AIProvider, ClaudeCliProvider, AnthropicApiProvider), SQLite, notifications, updater.
- `src/preload/` — API có kiểu expose qua `contextBridge`. Renderer không bao giờ truy cập Node trực tiếp.
- `src/renderer/` — React UI. `features/<tên>/` cho từng module, đăng ký trong `features/registry.ts`.
- `src/shared/` — types, zod schemas dùng chung main/renderer.
- `supabase/migrations/` — schema dữ liệu team, **mọi bảng phải bật RLS**.
- `assistant-skills/` — skill dành cho con trợ lý lúc chạy (được copy vào workspace của CLI).

## Quy tắc
- Mọi IPC input validate bằng zod. Không bật `nodeIntegration`.
- Không bao giờ commit secret, API key, service-role key. Dùng `.env.example`.
- Không chia sẻ/đóng gói thông tin đăng nhập Claude; mỗi user dùng tài khoản của chính họ.
- Trợ lý **đề xuất**, người dùng **duyệt**: memory mới, task do AI tạo, thay đổi file code — luôn qua bước xác nhận.
- UI text đi qua i18next (`vi` mặc định). Không hard-code chuỗi tiếng Việt trong component.
- Commit theo Conventional Commits (`feat:`, `fix:`, `docs:`…). Mỗi tính năng mới kèm test.
- Thêm tính năng: dùng skill `add-feature-module`. Gọi Claude: skill `claude-bridge`. Đổi schema team: skill `supabase-migration`. Phát hành: skill `release-update`.
