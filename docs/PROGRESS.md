# Tiến độ nâng cấp trợ lý cá nhân (cập nhật 2026-11-06)

## Đã xong (đã merge vào main)
| PR | Nội dung |
|---|---|
| #4 | Thông báo cập nhật: hộp thoại, Bỏ qua / Để sau, bản `[critical]` + dải cam, kênh beta, sao lưu DB trước khi nâng cấp |
| #5 | Điều khiển máy tính — chế độ CHỈ XEM: tool MCP của app, chụp màn hình, phím dừng khẩn cấp Ctrl+Alt+Q |
| #6 | Đọc log Unity/Blender; đọc cửa sổ và cây UI qua Python sidecar (uv) |
| #7 | Dán ảnh (Ctrl+V), kéo thả, thumbnail, tự thu nhỏ ảnh cho Claude |
| #8 | Kết nối agent: Mizuki làm MCP server cho Claude Code / Claude Desktop (kèm cầu nối stdio), Mizuki dùng MCP server khác, Ctrl+Alt+Q dùng chung. Gồm cả bản sửa: trả `not_approved` ngay khi chờ duyệt lần đầu; lịch sử trao đổi tự làm mới (5 giây/lần và khi quay lại cửa sổ app) |

## PR đang mở
- **GĐ 3 `feat/expressive-chat`** — Chat biểu cảm: emoji, GIF/sticker GIPHY, sticker trên máy, Yêu thích, thả cảm xúc, trợ lý biểu cảm theo mức (có "Tự động"). Chờ CI xanh và test tay.

## Lưu ý còn treo
- ⚠️ Token "Claude Code" cũ đã lộ trong ảnh chụp màn hình: thu hồi trong trang Kết nối agent và tạo token mới (nếu chưa làm).
- Test tay #8 với Claude Desktop, Ctrl+Alt+Q ngắt kết nối, MCP client: chưa ghi nhận kết quả. Nếu thấy lỗi thì sửa trên nhánh mới từ `main`.

## Bước tiếp theo (chờ người dùng chọn — chưa bắt đầu)
1. Thao tác chuột/bàn phím (GĐ 1, phần điều khiển): chỉ làm khi người dùng đồng ý riêng.
2. Giọng nói (GĐ 2), Gmail/Telegram (GĐ 4), Artifacts (GĐ 5).
3. A2A và mở kết nối ra LAN: chỉ có đề xuất (`docs/agents.md`), chưa code, chờ duyệt.

## Quyết định đã duyệt
- **Phạm vi:** tính năng cá nhân nằm trong MMC studio, mặc định TẮT với thành viên team. Mỗi người tự tạo key/OAuth riêng. Secret chỉ lưu trên máy (DPAPI), không vào repo. Thư viện nặng chỉ tải khi người dùng bật tính năng.
- **Quy trình:** không tự merge, không tự tạo hay sửa Release, không push lên `main`. Push nhánh, chờ CI xanh rồi mới báo. E2E phải chạy được khi không có Claude CLI và không được đụng clipboard thật.
- **Điều khiển máy tính:** bật lần đầu phải có cảnh báo. Không có Ctrl+Alt+Q thì không bật được. Mặc định chỉ xem.
- **Runtime:** Python sidecar qua uv (khoảng 50 MB tải, 110 MB trên ổ đĩa, tải khi bật).
- **TTS:** edge-tts, Piper làm dự phòng.
- **Telegram:** tài khoản cá nhân qua GramJS, chỉ đọc và soạn nháp, đồng bộ thưa, có allowlist/blocklist, có nút đăng xuất và xoá session.
- **GIF:** dùng GIPHY (Tenor đã ngừng API). **Gmail:** OAuth ở chế độ Testing hết hạn sau 7 ngày, xử lý ở GĐ 4.
- **Kết nối agent**
  - Agent mới phải được duyệt ở lần kết nối đầu; lần đầu server trả `not_approved` ngay ("Đang chờ người dùng duyệt trong MMC studio…"), agent thử lại sau khi được Cho phép. Có danh sách agent kèm nút thu hồi.
  - Khi trả lời agent khác, Mizuki không có tool. Nếu sau này cấp tool thì mỗi yêu cầu phải duyệt từng lần.
  - Giới hạn 20 yêu cầu/giờ và 1 việc cùng lúc; chạm giới hạn thì báo trong app và trả lỗi kèm thời gian chờ.
  - MCP client duyệt từng lần gọi tool, có tuỳ chọn "luôn cho phép".
  - LAN và A2A làm sau.
- **Chat biểu cảm (GĐ 3)**
  - GIPHY key: `.env` (`GIPHY_API_KEY`, chỉ bản dev, không có tiền tố VITE_) + ô nhập trong Cài đặt (DPAPI). Mỗi người key riêng.
  - Trợ lý gửi biểu cảm bằng thẻ `[[react:😂]]`, `[[gif:từ khoá]]`, `[[sticker:từ khoá]]`, `[[sticker:local/tên]]`. Thẻ chỉ chứa TỪ KHOÁ, không bao giờ nhận URL; thẻ sai / không tìm được thì ẩn. Trả lời agent khác qua MCP: bỏ thẻ, chữ thường.
  - Tối đa 1 GIF/sticker + 1 reaction mỗi câu trả lời, giãn cách theo mức. Emoji trong chữ không giới hạn cứng, theo mức + bắt chước người dùng; ngữ cảnh nghiêm túc/buồn được ưu tiên. Hướng dẫn kèm ví dụ: `assistant-skills/expressive/SKILL.md`.
  - Mức: Tắt / Ít / Vừa / Nhiều / Tự động (bắt đầu Ít, mỗi bậc chờ ≥ 3 ngày, có trần, nút đặt lại). Mặc định TẮT với mọi người (không hard-code máy ai trong repo public) — người dùng tự chọn "Tự động" một lần trong Cài đặt.
  - Sticker: GIPHY Stickers + thư mục local + Yêu thích (GIPHY chỉ lưu ID) + 6 sticker SVG mẫu nguyên bản.
