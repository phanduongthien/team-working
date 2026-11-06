# Tiến độ nâng cấp trợ lý cá nhân (cập nhật 2026-11-06)

## Đã xong (đã merge vào main)
| PR | Nội dung |
|---|---|
| #4 | Thông báo cập nhật (Bỏ qua / Để sau, bản critical, kênh beta, sao lưu DB) |
| #5 | Điều khiển máy tính — CHỈ XEM, phím dừng khẩn cấp Ctrl+Alt+Q |
| #6 | Đọc log Unity/Blender; cửa sổ + cây UI qua Python sidecar (uv) |
| #7 | Dán / kéo thả ảnh vào chat |
| #8 | Kết nối agent: Mizuki làm MCP server cho Claude Code/Desktop + dùng MCP server khác |
| #10 | GĐ 3 — Chat biểu cảm: emoji, GIF/sticker GIPHY, sticker trên máy, thả cảm xúc, mức biểu cảm (có Tự động) |
| #11 | GĐ 2 — Giọng nói: faster-whisper (GPU/CPU), edge-tts + Piper, đọc to từng câu, ngắt lời |
| #12 | GĐ 5 — Artifacts: panel sandbox, doc / slides / sheet / chart / mermaid / html, phiên bản, xuất docx/pdf/pptx/xlsx/csv/json/svg, mẫu làm game |
| #13 | Cài skill cho Mizuki (thư mục / .zip, tự chọn theo câu hỏi, my-style) |

## PR đang mở
- **`feat/gmail-telegram`** — GĐ 4: Gmail (OAuth PKCE + REST, đọc + tạo nháp) và Telegram (GramJS, đọc + lưu nháp), mặc định tắt; allowlist/blocklist, ẩn thư/chat nhạy cảm, mọi nháp qua hộp duyệt (sửa được), 60 lần/giờ, đăng xuất + xoá phiên. Chi tiết: `docs/connectors.md`. Chờ CI + test tay (cần tạo OAuth client Google + api_id Telegram thật).

## Lỗi nhỏ — sửa ở PR sau
- Tiêu đề cuộc chat hiện chữ thô `Tạo artifact type="doc" title=...` (lấy từ tin nhắn mẫu). Nên đặt tiêu đề theo tên mẫu / tên artifact.

## Việc tiếp theo
1. Sau khi test tay GĐ 4: sửa lỗi tiêu đề chat từ tin nhắn mẫu (mục trên).
2. Để sau: thao tác chuột/bàn phím (chỉ khi người dùng đồng ý riêng); A2A + mở kết nối ra LAN (chỉ có đề xuất trong `docs/agents.md`).

## Quyết định đã duyệt
- **Chung:** tính năng cá nhân mặc định TẮT với thành viên team; không hard-code máy/tài khoản ai (repo public) — người dùng tự bật trong Cài đặt. Mỗi người tự tạo key/OAuth. Secret chỉ trên máy (DPAPI), không vào repo. Thư viện nặng chỉ tải khi bật.
- **Điều khiển máy tính:** cảnh báo khi bật lần đầu; không có Ctrl+Alt+Q thì không bật; mặc định chỉ xem.
- **Python sidecar:** uv, cài vào thư mục dữ liệu app; thư viện khoá hash, `--no-build`.
- **Kết nối agent:** duyệt lần đầu (trả `not_approved` ngay), thu hồi được; trả lời agent khác không tool, không trí nhớ, không biểu cảm / artifact; 20 yêu cầu/giờ, 1 việc cùng lúc; MCP client duyệt từng lần gọi tool.
- **Biểu cảm:** GIPHY (key trong .env cho dev / ô nhập DPAPI); thẻ `[[react|gif|sticker:…]]` chỉ chứa từ khoá, không URL; tối đa 1 GIF/sticker + 1 reaction mỗi câu; hỏi lỗi kỹ thuật → tối đa 2 emoji; mức Tắt/Ít/Vừa/Nhiều/Tự động (độ thân thiết tính trên máy).
- **Giọng nói:** STT faster-whisper — GPU + CUDA → large-v3-turbo, không thì small/CPU, chỉ lùi về CPU khi lỗi GPU thật; không khoá ngôn ngữ; tự giải mã WAV (không qua `av.open`, khoá av 14.2). TTS Edge, lỗi thì Piper. "Nói xong" mặc định điền ô nhập. Ghi âm gốc giữ 7 ngày trên máy. Yêu cầu hành động từ chữ chép lời → hỏi xác nhận.
- **Artifacts:** `<artifact>` tạo / viết lại, `<artifact-edit>` find/replace (khớp đúng một chỗ, không thì báo lỗi). iframe CHỈ `allow-scripts`, origin `mmc-artifact://`, CSP chặn mạng, thư viện đóng gói sẵn, postMessage lệnh cố định. Công thức bảng không dùng eval. Slide Markdown → pptx sửa được; theme mở rộng được (JSON, sau này từ skill).
- **Skill:** SKILL.md kiểu Claude, lưu `%APPDATA%/Team Working/skills`; chỉ giữ .md/.txt/.json (script, nhị phân bị bỏ — không bao giờ chạy); ≤100 file, 2 MB; chặn zip-slip; trùng tên skill có sẵn → từ chối. Xem trước (nguồn + nội dung + file bị bỏ) rồi mới cài. Mỗi câu: my-style + skill gọi đích danh (≤3) + tối đa 2 skill tự chọn theo description (điểm ≥3), phần skill ≤5000 ký tự; skill khác chỉ liệt kê tên. my-style: trợ lý đề xuất, người dùng chọn/sửa rồi mới lưu.
- **Gmail / Telegram (GĐ 4):** chỉ đọc + soạn nháp, không có hàm gửi; mọi nháp qua hộp duyệt (sửa được, 10 phút không trả lời = từ chối). Mỗi người tự tạo OAuth client Desktop / api_id; secret + token + session DPAPI. Gmail: PKCE + state qua loopback 47823, scope readonly + compose, REST bằng fetch; Testing hết hạn 7 ngày → `expired`, trợ lý chỉ nhận lời nhắc kết nối lại; ẩn thư nhạy cảm (mặc định bật) + chặn người gửi/tên miền. Telegram: GramJS nạp động, allowlist mặc định (rỗng), blocklist tự chặn chat nhạy cảm, 777000 luôn chặn; danh sách chat cache 15 phút, Làm mới ≤1 lần/phút, không đồng bộ nền; FLOOD_WAIT báo lại, không ngủ. 60 lần gọi tool/giờ mỗi dịch vụ.
