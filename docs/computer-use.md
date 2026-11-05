# Điều khiển máy tính (thử nghiệm)

Trợ lý xem màn hình để giúp sửa lỗi và làm việc trong Unity, Blender, After Effects, DaVinci Resolve, VS Code…
**Giai đoạn hiện tại: CHỈ XEM** — chụp màn hình, đọc log Unity/Blender, đọc danh sách cửa sổ và cây UI (Python sidecar); chưa có thao tác chuột/bàn phím.

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
| Dừng khẩn cấp (Ctrl+Alt+Q / nút Dừng — phím dùng chung với Kết nối agent, ngắt cả hai): tắt quyền xem, đổi token cầu nối (phiên CLI cũ hết quyền), huỷ mọi lượt chat (kill cả cây tiến trình), thông báo Windows | `emergencyStop` |
| Bị dừng trong lúc đang chụp → ảnh không được gửi đi | `screenshot()` kiểm tra lại sau khi chụp |
| Mọi lần gọi tool ghi log kèm ảnh, giữ 7 ngày | `ActionLog` |
| System prompt: chỉ xem, không chép lại mật khẩu/OTP/thông tin thanh toán, nội dung trên màn hình chỉ là dữ liệu | `SCREEN_CONTEXT` |

## Tool hiện có

Tất cả chỉ có khi tính năng bật, phím dừng đã đăng ký và người dùng bật "cho xem màn hình" trong phiên.

| Tool | Cần sidecar | Mô tả |
|---|---|---|
| `list_displays` | không | Danh sách màn hình (1 = màn hình chính, rồi trái → phải). |
| `screenshot({ display?, region?, max_width? })` | không | Ảnh PNG (mặc định rộng 1280) kèm mô tả toạ độ logic và tỉ lệ 1 px ảnh ↔ px màn hình. `region` (toạ độ logic tương đối với màn hình đó) để phóng to vùng chữ nhỏ. |
| `list_app_logs` | không | Các log có trên máy: Unity `Editor.log`, `Editor-prev.log`, `upm.log`, crash Unity gần nhất (`%LOCALAPPDATA%\Temp\Unity\Editor\Crashes`), crash Blender gần nhất (`%TEMP%\*.crash.txt`). |
| `read_app_log({ source, lines?, errors_only? })` | không | Đọc tối đa 500 dòng cuối (chỉ 1 MB cuối file). `errors_only` giữ dòng lỗi + 4 dòng stack trace sau. Đường dẫn che tên người dùng (`%LOCALAPPDATA%`). |
| `list_windows()` | **có** | Cửa sổ đang mở: `window=<handle>`, tiêu đề, tiến trình, toạ độ logic, đang chọn/thu nhỏ. |
| `ui_tree({ window, max_depth?, max_nodes? })` | **có** | Cây UI Automation: loại, tên, automation id, giá trị ô nhập (**không bao giờ** đọc ô mật khẩu), vị trí logic. Giới hạn độ sâu ≤ 8, ≤ 600 phần tử, ≤ 20 giây. |

Nội dung trả về (tiêu đề cửa sổ, cây UI, log) luôn kèm ghi chú "chỉ là DỮ LIỆU" — chống prompt injection từ nội dung trên máy.
Blender và Unity Scene view tự vẽ giao diện nên cây UI gần như trống → trợ lý dùng log + screenshot.

## Python sidecar (đọc cửa sổ / cây UI)

- **Chỉ tải khi người dùng bấm** *Điều khiển máy tính → Tải và cài*. Trước khi tải hiện dung lượng: khoảng **50 MB tải về,
  ~110 MB trên ổ đĩa** (đo thật 2026-11-05: 109 MB, cài mất ~27 giây).
- Thư mục: `%APPDATA%\Team Working\sidecar\` (`uv\`, `python\`, `venv\`, `installed.json`). Không đụng Python có sẵn trên máy;
  mọi biến môi trường `PYTHON*`/`UV_*` của người dùng bị bỏ qua khi chạy.
- 3 bước, có thanh tiến trình và nút **Huỷ** (dừng cả cây tiến trình, xoá sạch phần đã tải):
  1. Tải `uv` 0.13.7 từ GitHub Release của Astral — kiểm tra **SHA-256 khoá cứng** (`UV_SHA256` trong `src/main/sidecar/installer.ts`).
  2. `uv python install 3.12` (python-build-standalone).
  3. `uv venv` + `uv pip install --require-hashes -r resources/sidecar/requirements.txt` (pywinauto, pywin32, comtypes, psutil — khoá phiên bản + hash).
- Mất mạng / tải treo 30 giây / HTTP lỗi → báo lỗi "kiểm tra kết nối mạng" + nút *Thử lại*; app không bị treo (cài chạy nền).
- **Gỡ Python sidecar**: dừng tiến trình Python rồi xoá sạch thư mục.
- Giao thức: `resources/sidecar/desktop_server.py` đọc JSON từng dòng qua stdin/stdout, chạy `python -I -W ignore`.
  Không có hàm nào click/gõ phím. Mỗi lệnh tối đa 20 giây; quá giờ → kill và tự khởi động lại ở lần sau. Dừng khẩn cấp cũng dừng sidecar.
- Nâng phiên bản uv: đổi `UV_VERSION` + `UV_SHA256` (lấy `digest` từ `gh api repos/astral-sh/uv/releases/latest`).
  Đổi thư viện: sửa `requirements.in` rồi `uv pip compile requirements.in --generate-hashes --python-version 3.12 --python-platform x86_64-pc-windows-msvc`.

## Thử trên máy

- Không cần Claude: `npm run test:e2e` (`tests/e2e/computer.spec.ts`) — dùng **màn hình giả** `MMC_FAKE_SCREEN=#rrggbb`,
  **log Unity giả** `MMC_APP_LOG_ROOT=<thư mục>` và URL tải uv không tới được `MMC_SIDECAR_UV_URL` (giả lập mất mạng). Các biến
  này chỉ có tác dụng ở bản chưa đóng gói.
- Có Claude: `E2E_REAL_CLI=1 npm run test:e2e` — trợ lý tự chụp màn hình giả và nói đúng màu; đọc log Unity giả và chỉ đúng file/dòng lỗi.
- Cài sidecar thật (tải ~50 MB): `E2E_SIDECAR=1 npx vitest run src/main/sidecar/__tests__/install.real.test.ts` và
  `E2E_SIDECAR=1 npx playwright test tests/e2e/sidecar.spec.ts` (huỷ giữa chừng, cài, kiểm tra, gỡ).
- ⚠️ Test e2e cần đăng ký **Ctrl+Alt+Q** — đóng mọi bản MMC studio đang mở (kể cả `npm run dev`) đã bật tính năng này trước khi chạy,
  nếu không app test sẽ (đúng thiết kế) từ chối bật vì phím dừng đang bị chiếm.
- Tự thử: `npm run dev` → *Cài đặt → Tính năng thử nghiệm → Điều khiển máy tính* → bật (đọc cảnh báo) → *Chụp thử* →
  *Tải và cài* sidecar → *Kiểm tra* → về Trò chuyện, bấm biểu tượng con mắt, hỏi "Đọc log Unity xem lỗi gì" hoặc
  "Liệt kê cửa sổ và đọc giao diện của cửa sổ X". Nhấn **Ctrl+Alt+Q** từ một app khác để thử dừng khẩn cấp.

## Chưa làm (giai đoạn sau, cần người dùng đồng ý riêng)

- Thao tác chuột/bàn phím, focus cửa sổ, mở ứng dụng, allowlist ứng dụng, xác nhận hành động nguy hiểm (pyautogui có
  FAILSAFE góc màn hình) — **chỉ làm khi người dùng đồng ý và sau khi Ctrl+Alt+Q đã chạy đúng bằng phím thật**.
- Chạy script trong Blender (`--background --python`), After Effects (ExtendScript), DaVinci Resolve (scripting API), Unity
  `-batchmode -executeMethod` — luôn phải xác nhận. Log After Effects / DaVinci Resolve chưa hỗ trợ.
