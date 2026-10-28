# Kế hoạch Team Working — Giai đoạn 0

## 0. Quyết định đã chốt (2026-10-28)

1. Chỉ dùng **nội bộ team**: mặc định `ClaudeCliProvider` (subscription riêng mỗi người), `AnthropicApiProvider` dự phòng.
2. Supabase **cloud** (đã có tài khoản); chưa có Docker → test RLS trên một project Supabase riêng cho dev.
3. Đăng nhập team bằng **GitHub OAuth** (Supabase Auth provider GitHub).
4. Nhánh chính `main`. Repo Releases: tên `your-agent` (GitHub không cho dấu cách trong tên repo); owner sẽ chốt ở Giai đoạn 6.
5. Dữ liệu học tập lưu trên **Supabase**.
6. Lịch: chỉ dựa trên task + deadline trong app; tích hợp Google/Outlook để sau.
7. Feedback có 2 loại: **công khai** (hiện người gửi) và **ẩn danh** (Member khác không thấy người gửi; **Manager/Owner vẫn thấy** để quản lý). Bỏ cột `teams.feedback_anonymity`.
9. Feedback có thêm chế độ **công khai** (cả team thấy kèm tên); công khai về một người chỉ để khen (2026-10-29).
10. Tên/avatar/tính cách trợ lý đi theo tài khoản GitHub qua bảng `user_settings` (chỉ chính chủ đọc) (2026-10-29).
8. Tên app: **Team Working**. Chưa có code signing → ghi chú cảnh báo SmartScreen trong release.

## 1. Môi trường (kiểm tra 2026-10-28)

| Công cụ | Trạng thái |
|---|---|
| Node.js | v24.22.1 (LTS) ✅ — npm 11.19.1 |
| git | 2.56.0 ✅ — repo chưa có commit, nhánh hiện tại `master` (CLAUDE.md dùng `main`) |
| Claude Code CLI | 2.1.312 tại `C:\Users\LEGION\.local\bin\claude.exe` ✅ — `claude auth status` trả JSON: đã login, gói **pro** |
| Supabase CLI | ❌ chưa cài (dùng được `npx supabase`) |
| Docker | ❌ chưa cài → không chạy được Supabase local để test RLS |
| GitHub CLI `gh` | ❌ chưa cài; repo chưa có remote |
| Python | ❌ (chỉ cần nếu `better-sqlite3` không có prebuilt cho bản Electron) |

Ghi chú: `claude auth status` cho JSON (`loggedIn`, `authMethod`, `subscriptionType`) → dùng nó trong `isAvailable()` để phân biệt "chưa cài" và "chưa đăng nhập", không cần đụng file credential.

## 2. Cấu trúc thư mục

Theo `CLAUDE.md` + skill `add-feature-module` (PROMPT.md mục 4.8 ghi `src/features/`, nhưng CLAUDE.md tách renderer/main — chọn theo CLAUDE.md).

```
team-assistant/
├─ src/
│  ├─ main/                      # Electron main process
│  │  ├─ index.ts                # tạo window, bảo mật, khởi tạo service
│  │  ├─ ipc/register.ts         # gom IPC của core + features (zod validate)
│  │  ├─ ai/
│  │  │  ├─ AIProvider.ts        # interface + ChatEvent
│  │  │  ├─ ClaudeCliProvider.ts # spawn claude, abort, resume
│  │  │  ├─ streamJsonParser.ts  # hàm thuần, test bằng fixture thật
│  │  │  ├─ AnthropicApiProvider.ts
│  │  │  ├─ cliDetector.ts       # where claude / --version / auth status
│  │  │  ├─ systemPrompt.ts      # buildSystemPrompt() thuần
│  │  │  └─ structuredBlocks.ts  # tách khối JSON (memory_suggestions, task_plan, quiz…)
│  │  ├─ db/ (client.ts, schema.ts, migrations/)   # better-sqlite3 + Drizzle
│  │  ├─ services/ (logger, notifications, updater, secrets(safeStorage), workspace, sync-outbox)
│  │  └─ features/<ten>/ipc.ts
│  ├─ preload/index.ts           # contextBridge → window.api.<namespace>.*
│  ├─ renderer/
│  │  ├─ app/ (App.tsx, router, layout, providers)
│  │  ├─ components/ui/          # shadcn/ui
│  │  ├─ features/registry.ts    # điểm đăng ký duy nhất
│  │  ├─ features/<ten>/ (index.ts, components/, store.ts, api.ts, i18n/{vi,en}.json, __tests__/)
│  │  ├─ i18n/                   # i18next, vi mặc định
│  │  └─ lib/ (supabase.ts, queryClient.ts)
│  └─ shared/ (schemas/*.ts zod, types.ts, ipc-channels.ts, supabase.types.ts)
├─ assistant-skills/             # copy vào %APPDATA%/TeamAssistant/workspace/.claude/skills
├─ supabase/ (config.toml, migrations/, tests/*.sql pgTAP)
├─ tests/e2e/                    # Playwright for Electron
├─ docs/
├─ .github/ (workflows/ci.yml, release.yml, ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md, CODEOWNERS)
├─ electron.vite.config.ts, electron-builder.yml, drizzle.config.ts
└─ CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, .env.example
```

Features dự kiến: `chat`, `memory`, `settings`, `onboarding`, `team`, `projects`, `tasks`, `dashboard`, `feedback`, `learning`, `code`, `time`, `planner`, `ideas`, `notifications`.

## 3. Schema dữ liệu local (SQLite / Drizzle)

Chỉ dữ liệu cá nhân + cần offline. ID dùng UUID text; thời gian lưu epoch ms.

- **settings**(key PK, value JSON) — theme, accent, ngôn ngữ, provider AI, pomodoro, khung giờ làm việc, sync memory on/off.
- **assistant_profile**(id=1, name, avatar, persona, custom_persona, language)
- **user_profile**(id=1, name, role, learning_goals, skills JSON, interests, answer_style)
- **conversations**(id, title, mode `study|code|project|free`, pinned, archived, provider, cli_session_id, cwd, code_write_enabled, created_at, updated_at)
- **messages**(id, conversation_id FK, role `user|assistant|system`, content, attachments JSON, tool_events JSON, status `streaming|done|error|aborted`, usage JSON, created_at)
- **messages_fts** (FTS5 trên title + content) — tìm kiếm hội thoại.
- **memories**(id, content, category `goal|skill|preference|project|deadline|other`, source_conversation_id, pinned, created_at, updated_at, last_used_at, remote_id, synced_at)
- **memory_suggestions**(id, conversation_id, action `add|update|delete`, target_memory_id, content, category, status `pending|accepted|rejected|edited`, created_at)
- **ai_drafts**(id, kind `task_plan|learning_path|quiz|day_plan|report|feedback|idea`, payload JSON, status `pending|applied|discarded`, conversation_id, created_at) — mọi thứ AI tạo chờ duyệt.
- **time_entries**(id, task_remote_id, task_title_cache, project_remote_id, started_at, ended_at, duration_sec, kind `timer|pomodoro|manual`, note, synced_at)
- **outbox**(id, entity, op, payload JSON, attempts, last_error, created_at) — hàng đợi đồng bộ lên Supabase khi online.
- **cache_tasks** (bản sao read-only task được giao, để lập kế hoạch ngày khi offline).

## 4. Schema Supabase (dữ liệu team) — mọi bảng bật RLS

Helper (security definer): `is_team_member(team_id)`, `has_team_role(team_id, roles[])`, `is_project_member(project_id)`.

| Bảng | Cột chính | RLS tóm tắt |
|---|---|---|
| profiles | id (=auth.uid), display_name, avatar_url, email, skills text[] | xem: chính mình + người chung team; sửa: chính mình |
| teams | id, name, created_by | xem: member; sửa/xóa: owner |
| team_members | team_id, user_id, role `owner\|manager\|member` | xem: member; thêm/sửa role: owner (manager mời member) |
| team_invites | id, team_id, email?, code, role, expires_at, created_by, accepted_by | tạo/xem: owner/manager; nhận qua RPC `accept_invite(code)` |
| projects | id, team_id, name, description, goal, start_date, due_date, status, created_by | xem: member team; ghi: owner/manager |
| project_members | project_id, user_id | như projects |
| tasks | id, team_id, project_id, parent_id, title, description, assignee_id, assigner_id, priority, status `todo\|in_progress\|review\|done\|blocked`, due_date, estimate_hours, position, ai_generated, completed_at, timestamps | xem: member; assignee sửa status/giờ (trigger chặn cột khác); manager/owner sửa hết |
| task_status_events | task_id, from, to, changed_by, at | chỉ insert qua trigger — dùng cho burndown |
| task_comments | id, task_id, author_id, body | xem: member; sửa/xóa: tác giả |
| task_attachments | id, task_id, storage_path, name, size, uploaded_by | + Storage bucket `task-files` có policy theo team |
| time_entries | id, user_id, team_id, task_id, started_at, ended_at, duration_sec | ghi: chính mình; xem: chính mình + manager/owner |
| feedback | id, team_id, kind `member_to_project\|manager_to_member\|periodic_review`, category `praise\|improve\|suggestion`, project_id?, task_id?, author_id, recipient_id?, is_anonymous, body, status `open\|read\|resolved` | xem: tác giả, người nhận, manager/owner; ẩn danh → Member đọc qua view `feedback_visible` (author_id = null nếu không phải tác giả); Manager/Owner thấy author_id |
| feedback_replies | id, feedback_id, author_id, body | ai xem được feedback thì xem/trả lời được |
| learning_paths / learning_steps | owner_id, team_id?, goal, shared bool / title, status, due_date, notes, resources | chủ sở hữu toàn quyền; manager xem khi shared |
| quiz_attempts | owner_id, path_id?, topic, score, weak_points JSON, shared | như learning |
| notifications | id, user_id, type, payload, read_at | chỉ chính mình; tạo bằng trigger (giao việc, bình luận, feedback) |
| progress_reports | id, user_id, team_id, period, body, sent_to | tác giả + người nhận |
| memories_remote | id, user_id, content, category, updated_at | chỉ chính mình (đồng bộ tùy chọn, mặc định tắt) |

Realtime: subscribe `notifications` (lọc `user_id`), `tasks`, `task_comments`, `feedback_replies` theo team.

## 5. Danh sách màn hình

1. **Kiểm tra Claude CLI** (onboarding): chưa cài → hướng dẫn cài; chưa login → hướng dẫn mở terminal chạy `claude`; nút "Kiểm tra lại"; lựa chọn dùng API key.
2. **Đăng nhập team** (Supabase) — có thể bỏ qua để dùng cá nhân offline.
3. **Chat**: sidebar hội thoại (tìm, ghim, đổi tên, xóa), chọn chế độ, streaming Markdown + code highlight + copy, đính kèm, nút dừng; panel duyệt đề xuất memory sau hội thoại.
4. **Chế độ Code** (trong Chat): chọn thư mục, công tắc "cho phép sửa file" + hộp xác nhận, hiển thị diff.
5. **Trợ lý nhớ gì về tôi**: hồ sơ cá nhân, danh sách memory (sửa/xóa/xuất JSON), hàng chờ đề xuất.
6. **Cài đặt**: tên/avatar/tính cách/ngôn ngữ trợ lý, theme + màu nhấn, AI provider + API key, đồng bộ, log & "Gửi báo lỗi", cập nhật.
7. **Team**: chọn workspace, thành viên & vai trò, lời mời (email/mã).
8. **Dự án**: danh sách + chi tiết (mô tả, mục tiêu, thành viên, tiến độ).
9. **Task**: Kanban / Danh sách / Lịch-timeline; drawer chi tiết (subtask, bình luận, file, bấm giờ).
10. **Duyệt bản nháp AI** (phân công task, lộ trình học, kế hoạch ngày…).
11. **Dashboard tiến độ**: % theo dự án & thành viên, task trễ, khối lượng, burndown.
12. **Feedback**: hộp nhận / đã gửi / góp ý dự án, thread trả lời, soạn thảo có "feedback-coach", tóm tắt theo kỳ.
13. **Học tập**: lộ trình & bước, quiz/flashcard, kết quả & chỗ yếu, công tắc chia sẻ với manager.
14. **Thời gian**: timer, Pomodoro, timesheet ngày/tuần, xuất CSV.
15. **Hôm nay**: kế hoạch ngày do trợ lý gợi ý, nhắc nhở; báo cáo cuối ngày/tuần.
16. **Đề xuất ý tưởng** → chuẩn hóa thành GitHub issue.
17. **Trung tâm thông báo**.
