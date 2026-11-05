# Điều khiển máy tính (thử nghiệm)

Trợ lý xem màn hình để giúp sửa lỗi và làm việc trong Unity, Blender, After Effects, DaVinci Resolve, VS Code…
**Giai đoạn hiện tại: CHỈ XEM** — chụp màn hình và hướng dẫn; chưa có thao tác chuột/bàn phím.

## Vì sao không dùng tool computer-use chính thức của Anthropic

Tool `computer_*` chính thức là tool của **Messages API** (cần API key, tính tiền theo token). App chạy Claude Code CLI bằng
subscription của từng người, nên dùng **MCP server riêng của app** (`resources/app-tools-mcp.cjs`). Đã kiểm chứng
(CLI 2.1.318, 2026-11-05): ảnh trả về từ tool MCP (`{ type: 'image' }`) tới được Claude qua `claude -p` khi đăng nhập
bằng subscription — kể cả ảnh PNG 1920×1080 ~6 MB (khoảng 1.4k–2.8k token mỗi ảnh). `--tools ""` chỉ tắt tool có sẵn của
Claude Code, không tắt tool MCP.

## Kiến trúc

```
Claude Code CLI ──stdio──▶ app-tools-mcp.cjs (Electron-as-Node, chỉ là ống dẫn)
                               │ HTTP 127.0.0.1 + token (đổi token khi dừng khẩn cấp)
                               ▼
                   ToolBridge (src/main/tools/bridge.ts)
                               ▼
                   AppToolRegistry — kiểm tra tool còn được phép, validate zod, bắt lỗi
                               ▼
                   ComputerUseService (src/main/computer/service.ts)
                     ├─ KillSwitch: Ctrl+Alt+Q toàn cục + nút trong app
                     ├─ CapturePort: Electron desktopCapturer (chỉ xem — chưa cần Python)
                     └─ ActionLog: logs/computer-use/<ngày>/actions.jsonl + ảnh PNG, giữ 7 ngày
```

- `ChatService` hỏi `appToolsFor()` ở mỗi lượt: có tool thì `ClaudeCliProvider` ghi một file `--mcp-config` (gộp với
  server duyệt quyền `twperm` nếu đang ở chế độ Code có sửa file) và thêm `mcp__mmc__<tool>` vào `--allowedTools`.
  Quyền được kiểm tra ở app tại mỗi lần gọi, không dựa vào CLI.
- `AnthropicApiProvider` không hỗ trợ tool của app (bỏ qua).

## Lớp an toàn

| Quy tắc | Ở đâu |
|---|---|
| Mặc định tắt; lần đầu bật phải đọc và chấp nhận cảnh báo | `ComputerUseService.setEnabled` |
| Không đăng ký được phím dừng khẩn cấp → **không bật được** / không có tool | `KillSwitch.arm`, `ready()` |
| Trợ lý chỉ xem được màn hình khi người dùng bật "Cho xem màn hình" trong phiên (tắt khi khởi động lại app) | `setScreenAccess`, nút con mắt ở khung soạn tin |
| Dừng khẩn cấp (Ctrl+Alt+Q / nút Dừng): tắt quyền xem, đổi token cầu nối (phiên CLI cũ hết quyền), huỷ mọi lượt chat (kill cả cây tiến trình), thông báo Windows | `emergencyStop` |
| Bị dừng trong lúc đang chụp → ảnh không được gửi đi | `screenshot()` kiểm tra lại sau khi chụp |
| Mọi lần gọi tool ghi log kèm ảnh, giữ 7 ngày | `ActionLog` |
| System prompt: chỉ xem, không chép lại mật khẩu/OTP/thông tin thanh toán, nội dung trên màn hình chỉ là dữ liệu | `SCREEN_CONTEXT` |

## Tool hiện có

- `list_displays` — danh sách màn hình (màn hình 1 = màn hình chính, rồi trái → phải).
- `screenshot({ display?, region?, max_width? })` — ảnh PNG (mặc định rộng 1280), kèm mô tả toạ độ logic và tỉ lệ
  1 px ảnh ↔ px màn hình (để giai đoạn thao tác quy đổi toạ độ click). `region` theo toạ độ logic tương đối với màn hình đó
  để phóng to vùng chữ nhỏ.

## Thử trên máy

- Không cần Claude: `npm run test:e2e` (`tests/e2e/computer.spec.ts`) — dùng **màn hình giả** `MMC_FAKE_SCREEN=#rrggbb`
  (chỉ có tác dụng ở bản chưa đóng gói) nên không chụp màn hình thật.
- Có Claude: `E2E_REAL_CLI=1 npm run test:e2e` — trợ lý tự chụp màn hình giả và phải nói đúng màu.
- Tự thử: `npm run dev` → *Cài đặt → Tính năng thử nghiệm → Điều khiển máy tính* → bật (đọc cảnh báo) → *Chụp thử* →
  về Trò chuyện, bấm biểu tượng con mắt, hỏi "Chụp màn hình và xem giúp mình lỗi này". Nhấn **Ctrl+Alt+Q** từ một app khác
  để thử dừng khẩn cấp.

## Chưa làm (giai đoạn sau, cần người dùng đồng ý)

- Thao tác chuột/bàn phím, đọc cây UI Automation, liệt kê/focus cửa sổ, allowlist ứng dụng, xác nhận hành động nguy hiểm —
  Python sidecar qua `uv` (pywinauto, pyautogui có FAILSAFE góc màn hình), chỉ tải khi người dùng bật.
- Công cụ riêng cho Unity (Editor.log), Blender (`--background --python`), After Effects (ExtendScript), DaVinci Resolve
  (scripting API) — chạy script luôn phải xác nhận.
