# PROMPT GỬI CHO CLAUDE CODE

> Cách dùng: tạo một thư mục dự án mới (ví dụ `team-assistant`), copy **toàn bộ** nội dung bộ kit này vào (gồm `CLAUDE.md`, `.claude/skills/`, `assistant-skills/`), `git init`, mở Claude Code trong thư mục đó rồi dán phần dưới đường kẻ.

---

Bạn là kỹ sư phần mềm chính của dự án. Hãy xây dựng một **ứng dụng desktop Windows** tên tạm là **"Team Assistant"** — một trợ lý AI chạy bằng Claude, phục vụ việc học, quản lý tiến độ team, giao việc, feedback và hỗ trợ công việc (code, quản lý thời gian).

Trước khi bắt đầu, hãy đọc `CLAUDE.md` và các skill trong `.claude/skills/` (đặc biệt `claude-bridge`, `add-feature-module`). Thư mục `assistant-skills/` là các skill mà **chính con trợ lý** sẽ dùng khi chạy — đóng gói chúng vào app.

## 1. Mục tiêu sản phẩm

Một app desktop cài trên Windows (file `.exe` installer), mỗi thành viên trong team cài trên máy mình, đăng nhập vào workspace chung của team, chat với trợ lý AI có trí nhớ về mình, và quản lý công việc của team.

## 2. Ràng buộc kỹ thuật quan trọng: dùng Claude subscription

- App **không** gọi API bằng key chung. Thay vào đó, app gọi **Claude Code CLI đã cài sẵn trên máy người dùng**, đã đăng nhập bằng **tài khoản Claude (Pro/Max) của chính người đó**, ở chế độ headless:
  `claude -p "<prompt>" --output-format stream-json --verbose [--resume <session_id>] [--append-system-prompt "<...>"]`
- Mỗi thành viên dùng **subscription của riêng họ**. Tuyệt đối không chia sẻ/đóng gói thông tin đăng nhập, không proxy một tài khoản cho nhiều người.
- Viết lớp trừu tượng `AIProvider` với 2 implementation:
  1. `ClaudeCliProvider` (mặc định) — spawn `claude` CLI, parse stream-json, hỗ trợ hủy (abort), resume session.
  2. `AnthropicApiProvider` (dự phòng) — dùng `@anthropic-ai/sdk` với API key do người dùng tự nhập, lưu bằng Windows Credential Manager (`keytar` hoặc `safeStorage` của Electron). Dùng model mới nhất (tra skill `claude-api` để lấy đúng model ID).
- Khi khởi động: kiểm tra `claude --version`; nếu chưa cài hoặc chưa đăng nhập thì hiện màn hình hướng dẫn cài Claude Code và chạy `claude` để login.
- **Hãy kiểm tra lại điều khoản sử dụng hiện hành của Anthropic** về việc dùng subscription với ứng dụng tự xây và ghi tóm tắt vào `docs/claude-usage-policy.md`. Nếu cách nào vi phạm thì báo tôi trước khi làm.

## 3. Tech stack (đề xuất — nếu có lý do tốt hơn thì đề xuất trước khi đổi)

- **Electron + React + TypeScript + Vite** (electron-vite), UI: **Tailwind CSS + shadcn/ui**, state: Zustand, data fetching: TanStack Query.
- **Dữ liệu cá nhân (local)**: SQLite (`better-sqlite3`) + Drizzle ORM — lịch sử chat, trí nhớ, cài đặt, time tracking offline.
- **Dữ liệu team (dùng chung)**: **Supabase** (Postgres + Auth + Realtime + Row Level Security). Tất cả bảng team phải có RLS policy.
- **Đóng gói & cập nhật**: `electron-builder` (NSIS installer cho Windows) + `electron-updater` tự cập nhật từ **GitHub Releases**.
- **CI/CD**: GitHub Actions — lint + typecheck + test cho mọi PR; build & publish release khi push tag `v*`.
- Test: Vitest (unit), Playwright for Electron (e2e smoke test).
- Bảo mật Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, mọi IPC đi qua `preload` với API có kiểu, validate input bằng `zod`.

## 4. Tính năng

### 4.1 Chat với trợ lý
- Nhiều cuộc hội thoại, sidebar danh sách, tìm kiếm, đổi tên, ghim, xóa.
- Streaming phản hồi, render Markdown, highlight code, nút copy code, đính kèm file/ảnh.
- Nút dừng phản hồi; tiếp tục hội thoại bằng `--resume`.
- Chọn "chế độ" hội thoại: Học tập / Code / Quản lý dự án / Tự do — mỗi chế độ ứng với một skill trong `assistant-skills/`.

### 4.2 Trí nhớ (ghi nhớ context của người dùng)
- **Hồ sơ cá nhân**: tên, vai trò, mục tiêu học tập, kỹ năng, sở thích, cách muốn được trả lời.
- **Memory items**: các sự thật ngắn mà trợ lý học được ("đang học React", "deadline đồ án ngày 15/12"...). Sau mỗi hội thoại, trợ lý **đề xuất** memory mới → người dùng duyệt/sửa/xóa trước khi lưu. Không tự lưu âm thầm.
- Màn hình "Trợ lý nhớ gì về tôi" để xem, sửa, xóa, xuất (export JSON).
- Khi chat: chọn các memory liên quan (keyword + gần đây; sau này có thể nâng cấp lên embedding) và chèn vào system prompt. Có giới hạn token.
- Trí nhớ cá nhân lưu **local**; người dùng có thể chọn đồng bộ lên Supabase (mặc định tắt).

### 4.3 Cá nhân hóa trợ lý
- Đổi **tên trợ lý**, avatar (chọn sẵn hoặc upload), **tính cách/giọng điệu** (thân thiện, nghiêm túc, hài hước, ngắn gọn…), ngôn ngữ mặc định (Tiếng Việt/English).
- Tên + tính cách được chèn vào system prompt; UI hiển thị tên mới ở mọi nơi.
- Theme sáng/tối, màu nhấn.

### 4.4 Học tập
- Tạo **lộ trình học** (learning path) theo mục tiêu: trợ lý chia thành các bước, có deadline.
- Theo dõi tiến độ từng bước, ghi chú, tài liệu.
- Trợ lý tạo **quiz/flashcard** từ nội dung đang học, ghi lại kết quả để ôn lại chỗ yếu.
- Manager có thể xem tiến độ học của thành viên (nếu thành viên cho phép chia sẻ).

### 4.5 Quản lý team, dự án và giao việc
- Workspace/Team, mời thành viên bằng email hoặc mã mời. Vai trò: **Owner, Manager, Member**.
- **Dự án**: tên, mô tả, mục tiêu, thời hạn, thành viên, trạng thái.
- **Nhiệm vụ**: tiêu đề, mô tả, người được giao, người giao, ưu tiên, deadline, ước lượng giờ, trạng thái (Todo / In progress / Review / Done / Blocked), subtask, bình luận, file đính kèm.
- Giao diện **Kanban** + **danh sách** + **lịch/timeline**.
- **Dashboard tiến độ**: % hoàn thành theo dự án và theo thành viên, task trễ hạn, khối lượng việc từng người, biểu đồ burndown.
- Trợ lý hỗ trợ: "chia dự án X thành các task và gợi ý phân công theo kỹ năng của từng người" → tạo bản nháp để manager duyệt rồi mới lưu.
- Thông báo Windows (toast) + thông báo trong app khi được giao việc, sắp đến hạn, có bình luận/feedback mới (Supabase Realtime).

### 4.6 Feedback hai chiều
- **Thành viên → dự án**: góp ý về dự án/quy trình, có tùy chọn ẩn danh với Member khác (Manager vẫn thấy hoặc không — cho Owner cấu hình).
- **Manager → thành viên**: feedback gắn với task/dự án hoặc đánh giá định kỳ; phân loại (khen ngợi / cần cải thiện / đề xuất).
- Người nhận có thể **phản hồi lại** feedback (thread), đánh dấu đã đọc/đã xử lý.
- Trợ lý giúp viết feedback mang tính xây dựng (skill `feedback-coach`) và tóm tắt feedback theo kỳ.
- RLS chặt: chỉ người gửi, người nhận và manager liên quan mới xem được.

### 4.7 Hỗ trợ công việc
- **Code**: chế độ Code cho phép chọn một thư mục dự án trên máy → chạy Claude Code với `cwd` là thư mục đó. Mặc định chế độ chỉ đọc/đề xuất; muốn cho sửa file phải bật rõ ràng và hiển thị yêu cầu cấp quyền cho người dùng duyệt. Hiển thị diff các thay đổi.
- **Quản lý thời gian**: bấm giờ theo task (start/stop), Pomodoro, bảng chấm công (timesheet) theo ngày/tuần, xuất CSV.
- **Kế hoạch ngày**: trợ lý đọc task được giao + deadline + lịch → gợi ý kế hoạch hôm nay; nhắc nhở bằng Windows notification.
- Tóm tắt cuối ngày/tuần: đã làm gì, còn gì, đang bị chặn ở đâu (có thể gửi cho manager như báo cáo tiến độ).

### 4.8 Mở rộng bởi cộng đồng thành viên
- Kiến trúc **module tính năng**: mỗi tính năng nằm trong `src/features/<tên>/` với cấu trúc thống nhất (UI, store, IPC handlers, migrations, tests) và đăng ký qua một `registry` duy nhất (route, mục menu, quyền). Thêm tính năng mới không cần sửa lõi.
- Skill trợ lý mới chỉ cần thêm thư mục vào `assistant-skills/`.
- Viết `CONTRIBUTING.md` (tiếng Việt): cách fork/branch, quy ước commit (Conventional Commits), cách chạy dev, cách thêm feature module, cách thêm skill, checklist PR.
- Template GitHub: issue (bug / ý tưởng tính năng), PR template, `CODEOWNERS`.
- Nhánh `main` được bảo vệ; release bằng tag → CI build → GitHub Releases → app các thành viên tự cập nhật.
- Trong app có mục **"Đề xuất ý tưởng"**: thành viên viết ý tưởng, trợ lý giúp chuẩn hóa thành issue và mở trang tạo GitHub issue đã điền sẵn.

## 5. Yêu cầu phi chức năng
- UI tiếng Việt mặc định, hỗ trợ i18n (i18next) để thêm English.
- Không commit bí mật. Dùng `.env.example`; Supabase anon key ok vì có RLS, service key không bao giờ nằm trong app.
- Log lỗi ra file trong `%APPDATA%`, có nút "Gửi báo lỗi" tạo GitHub issue.
- Hoạt động offline cho chat/trí nhớ/time tracking; đồng bộ dữ liệu team khi có mạng.
- Code sạch, có type đầy đủ, có test cho logic quan trọng (parser stream-json, memory selection, quyền RLS).

## 6. Cách làm việc — theo từng giai đoạn

Làm **từng giai đoạn**, cuối mỗi giai đoạn: chạy lint/typecheck/test, chạy thử app, commit, rồi **dừng lại tóm tắt cho tôi và chờ tôi xác nhận** trước khi sang giai đoạn tiếp.

- **Giai đoạn 0 — Lập kế hoạch**: kiểm tra môi trường (Node LTS, git, `claude` CLI), đề xuất cấu trúc thư mục, schema dữ liệu (local + Supabase), danh sách màn hình. Hỏi tôi những điều chưa rõ. Chưa viết code.
- **Giai đoạn 1 — Khung app + Chat**: scaffold Electron/React/TS, `AIProvider` + `ClaudeCliProvider`, chat streaming, lịch sử hội thoại SQLite, đổi tên/tính cách trợ lý, màn hình kiểm tra Claude CLI.
- **Giai đoạn 2 — Trí nhớ**: hồ sơ cá nhân, memory items, đề xuất & duyệt memory, chèn vào prompt, màn hình quản lý trí nhớ.
- **Giai đoạn 3 — Team & giao việc**: Supabase auth, team/role, dự án, task, Kanban, dashboard tiến độ, realtime + thông báo.
- **Giai đoạn 4 — Feedback**: feedback hai chiều, thread phản hồi, RLS, skill feedback-coach.
- **Giai đoạn 5 — Học tập & công việc**: lộ trình học, quiz, chế độ Code, time tracking, Pomodoro, kế hoạch ngày, báo cáo.
- **Giai đoạn 6 — Mở rộng & phát hành**: feature registry hoàn chỉnh, CONTRIBUTING, GitHub templates, CI, electron-builder + auto-update, release `v0.1.0`.

Bắt đầu với **Giai đoạn 0**.
