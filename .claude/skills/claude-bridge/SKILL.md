---
name: claude-bridge
description: Quy ước gọi Claude từ app (ClaudeCliProvider / AnthropicApiProvider) — spawn Claude Code CLI headless, parse stream-json, resume session, chèn system prompt (tên trợ lý, tính cách, memory). Dùng khi viết hoặc sửa bất kỳ code nào gọi AI.
---

# Claude bridge

Code: `src/main/ai/` (provider, parser, args, system prompt, skills) và `src/main/services/chatService.ts` (điều phối, lưu DB, emit IPC).

## Interface chung
```ts
interface AIProvider {
  isAvailable(): Promise<{ ok: boolean; reason?: string }>;
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
type ChatEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'done'; usage?: ChatUsage }
  | { type: 'error'; message: string };
```
Renderer chỉ thấy `ChatEvent` qua IPC `chat:event` — không bao giờ thấy chi tiết CLI. `session` không gửi ra renderer. Dừng phản hồi = `error` với message `aborted`.

## ClaudeCliProvider (mặc định)
- Args dựng bằng hàm thuần `buildCliArgs()` (`claudeCli.ts`):
  `claude -p --output-format stream-json --verbose --include-partial-messages --restricted --strict-mcp-config --tools <list> (--system-prompt-file | --append-system-prompt-file) <file> [--allowedTools <list>] [--resume <id>]`
- **Prompt đi qua stdin**, system prompt ghi ra file tạm → args chỉ chứa cờ cố định, UUID, tên tool, đường dẫn. Không bao giờ ghép chuỗi người dùng vào dòng lệnh.
- `--restricted`: bỏ qua settings/hook/project của người dùng, **tắt auto-memory của CLI** (trí nhớ do app quản lý qua bước duyệt). `--strict-mcp-config`: không nạp MCP.
- **Không dùng `--bare`** (bắt buộc API key, không dùng được subscription). Không dùng `--dangerously-skip-permissions`.
- Chế độ thường thay system prompt (`--system-prompt-file`); chế độ Code giữ prompt mặc định của Claude Code (`--append-system-prompt-file`).
- Windows: tìm bằng `where.exe claude`, ưu tiên `.exe`; shim `.cmd` chạy qua `cmd.exe /d /s /c` với `buildCmdLine()` (từ chối ký tự đặc biệt). Abort dùng `taskkill /T /F` để dừng cả cây tiến trình.
- Parser `StreamJsonParser` (fixture thật trong `src/main/ai/__fixtures__/`): `system/init` → session; `stream_event` text_delta → text; `assistant` tool_use → tool (text của assistant chỉ dùng khi message đó không có delta); `result` → done/error (`errors[]`). Bỏ qua thinking, `rate_limit_event`, message subagent (`parent_tool_use_id` ≠ null), dòng hỏng.
- CLI còn chạy một lúc sau `result`: `ChatService` chỉ phát done/error **sau khi tiến trình thoát** và đã nhả khóa hội thoại.
- Session mất (`No conversation found`) → xóa `cli_session_id`, thử lại 1 lần kèm 12 tin gần nhất.
- `cwd`: thường = `%APPDATA%/Team Working/workspace`; chế độ Code = thư mục dự án người dùng chọn.
- Quyền tool: chat thường → `--tools ""`. Code chỉ đọc → `Read,Grep,Glob`. Cho sửa file chỉ khi người dùng bật rõ ràng.
- `isAvailable`/`checkClaudeCli`: `claude --version` + `claude auth status` (JSON; chỉ giữ `loggedIn`, `subscriptionType`). Không đọc, sao chép hay truyền đi file credential của Claude Code.
- Kiểm tra lại format khi nâng cấp CLI: chạy thử, cập nhật fixture (xóa đường dẫn/thông tin cá nhân).

## System prompt
`buildSystemPrompt()` (hàm thuần, có test) ghép theo thứ tự, giới hạn `DEFAULT_MAX_CHARS`:
1. Danh tính: `Bạn là {assistantName}. Tính cách: {persona}. Trả lời bằng {language}.`
2. Hồ sơ người dùng (tên, vai trò, mục tiêu).
3. Memory liên quan (tối đa 30, mới trước; thiếu chỗ thì bỏ cái cuối).
4. Chế độ + nội dung skill của chế độ (`assistant-skills/<skill>/SKILL.md`, bỏ frontmatter — app tự chèn vì `--restricted` không nạp skill) + ngữ cảnh thêm.
Khi vượt giới hạn: cắt ngữ cảnh thêm → cắt skill → bỏ bớt memory.

## File đính kèm
- Renderer **không bao giờ gửi đường dẫn**: main mở hộp thoại (`chat:pickAttachments`), kiểm tra loại/kích thước (≤10 MB; ảnh, PDF, file chữ/code), copy vào `workspace/attachments/<uuid>.<ext>`, trả ID. `chat:send` chỉ nhận ID (`AttachmentStore.take`).
- CLI: liệt kê đường dẫn trong prompt (stdin) và bật tool `Read` cho lượt đó (file nằm trong cwd nên `--restricted` vẫn cho đọc).
- API: ảnh → `image` base64, PDF → `document` base64, file chữ → `text`.

## Tác vụ nền (trích memory)
`completeText()` + `ephemeral: true` (CLI: `--no-session-persistence`) — không tạo session rác. Kết quả chỉ là **đề xuất** vào `memory_suggestions`; người dùng duyệt ở trang Trí nhớ.

## AnthropicApiProvider (dự phòng)
- `@anthropic-ai/sdk` `client.beta.messages.stream(...)`, model `claude-opus-5-5` (theo skill `claude-api` — không đoán ID), `output_config.effort: 'medium'`, `fallbacks: 'default'` + beta `server-side-fallback-2026-07-01` (tự chạy lại trên model dự phòng khi bị từ chối vì an toàn), `signal` để hủy.
- Không có session → `ChatService` gửi kèm 30 tin gần nhất (`provider.stateful === false`).
- Key người dùng tự nhập, lưu mã hóa bằng `safeStorage` (`SecretStore`), không bao giờ trả về renderer. Lỗi map sang mã: `invalid_api_key`, `rate_limit`, `network_error`, `refusal`…
