---
name: claude-bridge
description: Quy ước gọi Claude từ app (ClaudeCliProvider / AnthropicApiProvider) — spawn Claude Code CLI headless, parse stream-json, resume session, chèn system prompt (tên trợ lý, tính cách, memory). Dùng khi viết hoặc sửa bất kỳ code nào gọi AI.
---

# Claude bridge

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
  | { type: 'done'; usage?: unknown }
  | { type: 'error'; message: string };
```
Renderer chỉ thấy `ChatEvent` qua IPC — không bao giờ thấy chi tiết CLI.

## ClaudeCliProvider (mặc định)
- Spawn bằng `child_process.spawn` (không dùng `shell: true`, truyền args dạng mảng để tránh injection):
  `claude -p <prompt> --output-format stream-json --verbose --append-system-prompt <system> [--resume <sessionId>] [--allowedTools ...]`
- Trên Windows, tìm executable bằng `where claude`; xử lý cả `claude.cmd`.
- Đọc stdout theo dòng, mỗi dòng là một JSON. Map: message `system/init` → `session` (lấy `session_id`), các block `text` của assistant → `text`, `tool_use` → `tool`, message `result` → `done`. Dòng không parse được → log, bỏ qua. **Kiểm tra lại format thực tế** bằng cách chạy CLI thử, viết test với fixture thật.
- Abort: `signal` → `child.kill()`.
- `cwd`: chế độ thường dùng thư mục workspace của app trong `%APPDATA%` (chứa `.claude/skills` copy từ `assistant-skills/`); chế độ Code dùng thư mục dự án người dùng chọn.
- Quyền tool: chat thường → không cho Bash/Edit/Write. Chế độ Code chỉ đọc → `Read,Grep,Glob`. Cho sửa file chỉ khi người dùng bật rõ ràng.
- `isAvailable`: chạy `claude --version`; lỗi → hướng dẫn cài & đăng nhập.
- Không đọc, sao chép hay truyền đi file credential của Claude Code.

## System prompt
Ghép theo thứ tự, có giới hạn độ dài:
1. Danh tính: `Bạn là {assistantName}. Tính cách: {persona}. Trả lời bằng {language}.`
2. Hồ sơ người dùng (tên, vai trò, mục tiêu).
3. Memory liên quan (tối đa N mục, ưu tiên mới & khớp từ khóa).
4. Ngữ cảnh chế độ (Học tập/Code/Quản lý) + dữ liệu cần thiết (task đang được giao…).
Viết hàm thuần `buildSystemPrompt()` và test nó.

## AnthropicApiProvider (dự phòng)
Dùng `@anthropic-ai/sdk`, streaming. Key người dùng tự nhập, lưu bằng `safeStorage`. Tra skill `claude-api` để lấy model ID mới nhất — không đoán.
