# Đóng góp cho Team Working

Cảm ơn bạn muốn cùng làm app! Tài liệu này giúp bạn chạy dự án, thêm tính năng và gửi PR.

## Chuẩn bị

1. Node.js 24 trở lên, Git, Windows 10/11.
2. Claude Code CLI đã đăng nhập bằng **tài khoản của chính bạn** (`irm https://claude.ai/install.ps1 | iex`, rồi chạy `claude` để đăng nhập). App không bao giờ đóng gói hay chia sẻ thông tin đăng nhập Claude — xem `docs/claude-usage-policy.md`.
3. Clone repo, rồi:

   ```powershell
   npm install
   copy .env.example .env   # điền URL + anon key của project Supabase dev (hỏi người quản lý)
   npm run dev
   ```

   Không có `.env` app vẫn chạy được phần offline (chat, trí nhớ, thời gian); các trang team sẽ báo chưa cấu hình. Chi tiết Supabase: `docs/supabase-setup.md`.

## Quy trình làm việc

- Nhánh `main` được bảo vệ: mọi thay đổi đi qua Pull Request, CI xanh và ít nhất 1 người duyệt.
- Tạo nhánh từ `main`: `feat/<tên-ngắn>`, `fix/<tên-ngắn>`, `docs/<tên-ngắn>`.
- Commit theo [Conventional Commits](https://www.conventionalcommits.org/): `feat(learning): thêm flashcard`, `fix(chat): …`, `docs: …`, `chore: …`. Viết tiếng Việt hoặc tiếng Anh đều được.
- Trước khi đẩy code:

  ```powershell
  npm run lint
  npm run typecheck
  npm test          # gồm cả test RLS Supabase (PGlite, không cần Docker)
  npm run test:e2e  # build + Playwright cho Electron
  ```

- Mở PR và điền checklist trong mẫu. Liên kết issue bằng `Closes #số`.

## Thêm tính năng mới

Mỗi tính năng là một module trong `src/renderer/src/features/<tên>/` (giao diện, store, i18n, test) và được đăng ký ở **một chỗ duy nhất**: `features/registry.ts`. Nếu cần quyền theo vai trò, khai báo `roles` trong `FeatureDefinition` (rỗng = ai cũng thấy).

Dùng Claude Code trong repo để làm nhanh — các skill dự án nằm ở `.claude/skills/`:

| Việc | Skill |
| --- | --- |
| Thêm tính năng (UI, IPC, migration, test, đăng ký) | `add-feature-module` |
| Code gọi AI (Claude CLI / API) | `claude-bridge` |
| Đổi schema dữ liệu team trên Supabase | `supabase-migration` |
| Phát hành phiên bản | `release-update` |

Quy tắc bắt buộc (xem thêm `CLAUDE.md`):

- Mọi IPC input validate bằng zod; renderer không truy cập Node trực tiếp (`nodeIntegration` luôn tắt).
- Chuỗi giao diện đi qua i18next, có đủ `vi.json` và `en.json` (test sẽ báo nếu thiếu khóa).
- Bảng Supabase mới **phải bật RLS** và có test quyền cho Owner / Manager / Member. App không bao giờ dùng service-role key.
- Trợ lý chỉ **đề xuất**; memory mới, task do AI tạo, thay đổi file code luôn qua bước người dùng duyệt.
- Không commit secret, API key, `.env`. Thêm biến mới vào `.env.example`.

## Thêm skill cho trợ lý

Skill lúc chạy nằm ở `assistant-skills/<tên>/SKILL.md` và được chèn vào system prompt theo chế độ hội thoại. Viết ngắn gọn, nói rõ định dạng đầu ra (thường là một khối JSON) và viết test cho phần parse ở `src/main/assistant/__tests__/`.

## Báo lỗi & đề xuất

Trong app: **Góp ý & báo lỗi** (thanh bên) hoặc **Cài đặt → Gửi báo lỗi**. Trợ lý giúp chuẩn hóa nội dung, bạn duyệt rồi mở trang tạo issue trên GitHub. Hoặc tạo issue trực tiếp bằng các mẫu có sẵn.
