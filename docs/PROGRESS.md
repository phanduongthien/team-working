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

## PR đang mở
- **#12 `feat/artifacts`** — GĐ 5 Artifacts: panel sandbox, doc / slides / sheet / chart / mermaid / html, phiên bản, xuất docx/pdf/pptx/xlsx/csv/json/svg, mẫu làm game. CI xanh, **chờ test tay rồi merge**.

## Lỗi nhỏ — sửa ở PR sau
- Tiêu đề cuộc chat hiện chữ thô `Tạo artifact type="doc" title=...` (lấy từ tin nhắn mẫu). Nên đặt tiêu đề theo tên mẫu / tên artifact.

## Việc tiếp theo
1. **PR "Cài skill cho Mizuki"**
   - Thư mục skill người dùng trong %APPDATA%, định dạng SKILL.md như Claude (frontmatter name + description).
   - Trang Skills trong Cài đặt: cài từ thư mục / .zip (hiện nguồn + nội dung để duyệt), bật/tắt, xoá, xem. Skill có sẵn của app giữ nguyên.
   - Tự chọn vài skill liên quan theo description (không nhồi hết), gọi đích danh được ("dùng skill slide-pixel").
   - Học phong cách → đề xuất lưu ghi chú vào skill "my-style", chỉ lưu khi người dùng đồng ý.
   - Skill chỉ là chữ, KHÔNG chạy script kèm skill. Skill có thể cung cấp theme slide.
2. **GĐ 4 — Gmail / Telegram.**
3. Để sau: thao tác chuột/bàn phím (chỉ khi người dùng đồng ý riêng); A2A + mở kết nối ra LAN (chỉ có đề xuất trong `docs/agents.md`).

## Quyết định đã duyệt
- **Chung:** tính năng cá nhân mặc định TẮT với thành viên team; không hard-code máy/tài khoản ai (repo public) — người dùng tự bật trong Cài đặt. Mỗi người tự tạo key/OAuth. Secret chỉ trên máy (DPAPI), không vào repo. Thư viện nặng chỉ tải khi bật.
- **Điều khiển máy tính:** cảnh báo khi bật lần đầu; không có Ctrl+Alt+Q thì không bật; mặc định chỉ xem.
- **Python sidecar:** uv, cài vào thư mục dữ liệu app; thư viện khoá hash, `--no-build`.
- **Kết nối agent:** duyệt lần đầu (trả `not_approved` ngay), thu hồi được; trả lời agent khác không tool, không trí nhớ, không biểu cảm / artifact; 20 yêu cầu/giờ, 1 việc cùng lúc; MCP client duyệt từng lần gọi tool.
- **Biểu cảm:** GIPHY (key trong .env cho dev / ô nhập DPAPI); thẻ `[[react|gif|sticker:…]]` chỉ chứa từ khoá, không URL; tối đa 1 GIF/sticker + 1 reaction mỗi câu; hỏi lỗi kỹ thuật → tối đa 2 emoji; mức Tắt/Ít/Vừa/Nhiều/Tự động (độ thân thiết tính trên máy).
- **Giọng nói:** STT faster-whisper — GPU + CUDA → large-v3-turbo, không thì small/CPU, chỉ lùi về CPU khi lỗi GPU thật; không khoá ngôn ngữ; tự giải mã WAV (không qua `av.open`, khoá av 14.2). TTS Edge, lỗi thì Piper. "Nói xong" mặc định điền ô nhập. Ghi âm gốc giữ 7 ngày trên máy. Yêu cầu hành động từ chữ chép lời → hỏi xác nhận.
- **Artifacts:** `<artifact>` tạo / viết lại, `<artifact-edit>` find/replace (khớp đúng một chỗ, không thì báo lỗi). iframe CHỈ `allow-scripts`, origin `mmc-artifact://`, CSP chặn mạng, thư viện đóng gói sẵn, postMessage lệnh cố định. Công thức bảng không dùng eval. Slide Markdown → pptx sửa được; theme mở rộng được (JSON, sau này từ skill).
- **Telegram (GĐ 4):** GramJS, chỉ đọc + soạn nháp, allowlist/blocklist, đăng xuất + xoá session. **Gmail:** OAuth chế độ Testing hết hạn sau 7 ngày.
