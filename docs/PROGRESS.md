# Tiến độ nâng cấp trợ lý cá nhân (cập nhật 2026-11-05)

## Đã xong (đã merge vào main)
| PR | Nội dung |
|---|---|
| #4 | Thông báo cập nhật: hộp thoại, Bỏ qua / Để sau, bản `[critical]` + dải cam, kênh beta, sao lưu DB trước khi nâng cấp |
| #5 | Điều khiển máy tính — chế độ CHỈ XEM: tool MCP của app, chụp màn hình, phím dừng khẩn cấp Ctrl+Alt+Q |
| #6 | Đọc log Unity/Blender; đọc cửa sổ và cây UI qua Python sidecar (uv) |
| #7 | Dán ảnh (Ctrl+V), kéo thả, thumbnail, tự thu nhỏ ảnh cho Claude |

## PR đang mở
- **#8 `feat/agent-connect`** — Kết nối agent: Mizuki làm MCP server cho Claude Code / Claude Desktop (kèm cầu nối stdio), Mizuki dùng MCP server khác, Ctrl+Alt+Q dùng chung. CI xanh. **Chờ người dùng test tay rồi merge.**

## Đang làm dở / sửa trên `feat/agent-connect` (PR #8)
1. ✅ **Duyệt agent lần đầu:** trước đây Mizuki giữ kết nối chờ duyệt tối đa 60 giây, trong khi Claude Code hết thời gian chờ sau 30 giây. Giờ server trả `not_approved` **ngay lập tức** kèm thông báo "Đang chờ người dùng duyệt trong MMC studio…", đồng thời hiện yêu cầu trong app. Agent thử lại sau khi bạn bấm Cho phép.
2. ✅ **Lịch sử trao đổi không hiện yêu cầu lúc 9:22 PM:** dữ liệu thực ra **đã được lưu** trong DB (`ask_mizuki`, trạng thái xong). Mở app với bản sao DB thì lịch sử hiện đúng. Nguyên nhân: trang chỉ làm mới lịch sử khi nhận sự kiện từ main, nên lỡ một sự kiện là danh sách đứng yên. Đã sửa: trang tự làm mới mỗi 5 giây và mỗi khi cửa sổ app được chọn lại.
3. ⏳ **Chờ test tay lại:** mục 2–6 của PR #8 (Claude Code, Claude Desktop, Ctrl+Alt+Q, MCP client).
4. ⚠️ **Token "Claude Code" cũ đã lộ trong ảnh chụp màn hình:** thu hồi và tạo token mới trước khi test lại.

## Bước tiếp theo
1. Test tay #8 với Claude Code và Claude Desktop thật (xem mô tả PR #8 và `docs/agents.md`), rồi merge.
2. Thao tác chuột/bàn phím (GĐ 1, phần điều khiển): chỉ làm khi người dùng đồng ý riêng.
3. Các giai đoạn còn lại theo kế hoạch ban đầu: giọng nói (GĐ 2), chat biểu cảm (GĐ 3), Gmail/Telegram (GĐ 4), Artifacts (GĐ 5).
4. A2A và mở kết nối ra LAN: chỉ có đề xuất (`docs/agents.md`), chưa code, chờ duyệt.

## Quyết định đã duyệt
- **Phạm vi:** tính năng cá nhân nằm trong MMC studio, mặc định TẮT với thành viên team. Mỗi người tự tạo key/OAuth riêng. Secret chỉ lưu trên máy (DPAPI), không vào repo. Thư viện nặng chỉ tải khi người dùng bật tính năng.
- **Quy trình:** không tự merge, không tự tạo hay sửa Release, không push lên `main`. Push nhánh, chờ CI xanh rồi mới báo. E2E phải chạy được khi không có Claude CLI và không được đụng clipboard thật.
- **Điều khiển máy tính:** bật lần đầu phải có cảnh báo. Không có Ctrl+Alt+Q thì không bật được. Mặc định chỉ xem.
- **Runtime:** Python sidecar qua uv (khoảng 50 MB tải, 110 MB trên ổ đĩa, tải khi bật).
- **TTS:** edge-tts, Piper làm dự phòng.
- **Telegram:** tài khoản cá nhân qua GramJS, chỉ đọc và soạn nháp, đồng bộ thưa, có allowlist/blocklist, có nút đăng xuất và xoá session.
- **GIF:** dùng GIPHY (Tenor đã ngừng API). **Gmail:** OAuth ở chế độ Testing hết hạn sau 7 ngày, xử lý ở GĐ 4.
- **Kết nối agent**
  - Agent mới phải được duyệt ở lần kết nối đầu; có danh sách agent kèm nút thu hồi.
  - Khi trả lời agent khác, Mizuki không có tool. Nếu sau này cấp tool thì mỗi yêu cầu phải duyệt từng lần.
  - Giới hạn 20 yêu cầu/giờ và 1 việc cùng lúc; chạm giới hạn thì báo trong app và trả lỗi kèm thời gian chờ.
  - MCP client duyệt từng lần gọi tool, có tuỳ chọn "luôn cho phép".
  - LAN và A2A làm sau.
