# Kết nối agent (thử nghiệm)

Cho **Claude Code, Claude Desktop** và agent khác trên cùng máy dùng trợ lý của bạn (gọi tắt là Mizuki — tên hiển thị theo
trợ lý bạn đặt) như một công cụ, và cho Mizuki dùng **MCP server khác**. Mặc định **tắt**. Bật ở
*Cài đặt → Tính năng thử nghiệm → Kết nối agent*.

## 1. Cho agent khác dùng Mizuki (MCP server)

App mở một endpoint MCP chuẩn (Streamable HTTP) **chỉ trên `127.0.0.1`** (mặc định cổng 47831):

| Tool | Làm gì |
|---|---|
| `ask_mizuki(message)` | Hỏi và chờ câu trả lời (tối đa ~100 giây; lâu hơn thì trả mã việc). |
| `submit_task(title, instructions)` | Giao việc chạy nền, trả mã việc. |
| `get_task(id)` | Trạng thái + kết quả việc (chỉ việc của chính agent đó). |
| `list_tasks()` | Các việc gần đây của agent đó. |

### Thêm vào Claude Code

1. MMC studio → *Kết nối agent* → bật **Bật kết nối agent**.
2. Ở *Agent được cấp quyền*: nhập tên (vd `Claude Code`) → **Tạo token**. Token chỉ hiện **một lần** — app chỉ lưu bản băm.
3. Copy lệnh hiện ra và chạy trong terminal:
   ```powershell
   claude mcp add-json mizuki '{"type":"http","url":"http://127.0.0.1:47831/mcp","headers":{"Authorization":"Bearer mzk_..."}}'
   ```
   (dùng `add-json` thay cho `--header` vì có bản Claude Code đặt header sai — xem
   [issue](https://github.com/github/github-mcp-server/issues/1757)).
4. Mở Claude Code, gõ `/mcp` để kiểm tra, rồi nhờ: "Hỏi Mizuki xem…". Lần đầu, MMC studio hiện hộp thoại
   **"Agent mới muốn kết nối"** → bấm **Cho phép**. Nếu Claude Code báo lỗi trong lúc chờ, kết nối lại sau khi bấm.

### Thêm vào Claude Desktop

Cấu hình local của Claude Desktop chỉ chạy MCP server dạng stdio, nên app kèm **cầu nối** `mizuki-mcp-bridge.cjs`
(chạy bằng chính `MMC studio.exe`, không cần cài Node).

1. Tạo token như trên (đặt tên `Claude Desktop`).
2. Claude Desktop → *Settings → Developer → Edit Config* → mở `claude_desktop_config.json`, dán khối `mcpServers` app
   hiện ra (đã điền sẵn đường dẫn exe, script cầu nối, URL, token). Nếu file đã có `mcpServers`, chỉ thêm mục `mizuki`.
3. Khởi động lại Claude Desktop. Lần đầu dùng, bấm **Cho phép** trong MMC studio.
4. MMC studio phải đang mở và đã bật *Kết nối agent*; nếu không, Claude Desktop báo "Không kết nối được MMC studio".

> Token nằm dạng chữ trong file cấu hình của Claude Code / Claude Desktop trên máy bạn — đừng chia sẻ file đó. Lộ thì
> bấm **Thu hồi quyền** rồi tạo token mới.

### An toàn

| Quy tắc | Ở đâu |
|---|---|
| Mặc định tắt; chỉ nghe `127.0.0.1`; kiểm tra Host/Origin để trang web không gọi được (chống DNS rebinding) | `agents/httpServer.ts` |
| Mỗi agent một token (`mzk_…`, 256-bit), chỉ lưu SHA-256; thu hồi = xoá | `agents/tokens.ts`, `hub.ts` |
| Lần đầu kết nối phải được bấm **Cho phép**; danh sách agent đã cho phép + nút thu hồi | `hub.ensureApproved`, trang Kết nối agent |
| Agent khác **không kế thừa quyền**: Mizuki trả lời không có tool nào, không dùng trí nhớ/hồ sơ, không lưu session | `answer` trong `index.ts`, `agents/prompt.ts` |
| Nội dung từ agent khác bọc trong `<agent_request>` và được coi là DỮ LIỆU (chống prompt injection) | `agents/prompt.ts` |
| Nếu sau này Mizuki được cấp tool khi trả lời agent → mỗi yêu cầu phải duyệt từng lần (hiện: từ chối luôn) | `needsPerRequestApproval` |
| Giới hạn mặc định **20 yêu cầu/giờ/agent**, **1 việc chạy cùng lúc** (chỉnh được). Chạm giới hạn → agent nhận lỗi kèm giờ gọi lại, app hiện thông báo nhỏ | `rateLimiter.ts`, `taskQueue.ts` |
| Mọi yêu cầu ghi vào lịch sử (bảng `agent_exchanges`) | trang Kết nối agent |
| **Ctrl+Alt+Q** (dùng chung với Điều khiển máy tính) hoặc **Ngắt tất cả**: huỷ mọi việc, đóng server, tắt tính năng | `computer/killSwitch.ts` |
| Không đăng ký được Ctrl+Alt+Q → không bật được | `hub.setEnabled` |

Mỗi yêu cầu tốn hạn mức gói Claude của bạn (`docs/claude-usage-policy.md`: tránh tự động hoá dày đặc bằng subscription).

## 2. Mizuki dùng MCP server khác (MCP client)

*Kết nối agent → Trợ lý dùng MCP server khác → Thêm server*:

- **Chạy lệnh (stdio)**: lệnh + tham số (mỗi dòng một tham số) + biến môi trường bí mật (`KEY=VALUE`).
- **URL (HTTP)**: URL + header bí mật (`Authorization: Bearer …`). Server cần đăng nhập OAuth tương tác chưa hỗ trợ.

Giá trị bí mật mã hoá bằng Windows DPAPI (`%APPDATA%\Team Working\secrets\mcp-servers.bin`), không hiện lại sau khi lưu.
Tên `mmc`, `twperm`, `mizuki` dành cho app.

Khi trò chuyện, các server đang bật được đưa vào `--mcp-config` của Claude Code CLI. **Mỗi lần Mizuki gọi tool**, app hiện
hộp thoại: *Cho phép lần này* / *Luôn cho phép công cụ này* / *Từ chối* (không trả lời trong 10 phút = từ chối). Công cụ
"luôn cho phép" hiện dưới server và thu hồi được. Tác vụ nền (trích trí nhớ, lập kế hoạch) và câu trả lời cho agent khác
**không** dùng MCP server ngoài.

## 3. A2A (Agent2Agent) — đề xuất, chưa làm

- **Hiện trạng**: A2A v1.0.0, do Linux Foundation quản lý (cùng nơi với MCP). Có Agent Card (mô tả agent, cách xác thực),
  SendMessage / GetTask / ListTasks / CancelTask, streaming, qua JSON-RPC / gRPC / REST
  ([đặc tả](https://a2a-protocol.org/latest/specification/)). MCP dành cho agent ↔ tool, A2A cho agent ↔ agent.
- **Đề xuất**: chưa cần lúc này — Claude Code / Claude Desktop nói MCP, và mọi thứ đang chạy trên cùng máy. A2A đáng làm khi
  cần **agent trên máy khác**: thêm phía server (Agent Card + SendMessage/GetTask) dùng chung hàng đợi, token, giới hạn và
  lịch sử với MCP server ở trên.
- **Thời điểm**: cùng lúc với quyết định mở ra mạng LAN/Internet (ưu tiên qua Tailscale hoặc SSH tunnel có mã hoá thay vì
  mở cổng HTTP thường). Cả hai cần người dùng duyệt trước khi code.

## Thử trên máy

- `npm run test:e2e` — `tests/e2e/agents.spec.ts`: test đóng vai Claude Code (SDK MCP client thật) kết nối, duyệt lần đầu,
  giới hạn, thu hồi, dừng khẩn cấp, MCP client. Mặc định Mizuki trả lời **giả lập** (`MMC_FAKE_AGENT_ANSWER`, chỉ bản chưa
  đóng gói) để không tốn hạn mức.
- `E2E_REAL_CLI=1 npm run test:e2e` — thêm: Mizuki trả lời thật; Mizuki gọi tool `echo` của MCP server test → hộp thoại duyệt.
- Cần Ctrl+Alt+Q trống: đóng mọi bản MMC studio khác (kể cả `npm run dev`) trước khi chạy.
