# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo SemVer.

## [Unreleased]

### Thêm mới
- **Sắp xếp cuộc trò chuyện** ở thanh bên trái: ghim (luôn ở đầu, kéo vào mục Đã ghim cũng được); nhóm tự đặt tên ("Unity", "Học", "Tâm sự"…) — tạo / đổi tên / xoá (xoá nhóm không xoá cuộc trò chuyện), thu gọn / mở rộng từng nhóm, kéo thả cuộc chat vào / ra khỏi nhóm hoặc dùng nút "Chuyển vào nhóm".
- **Gợi ý nhóm**: cuộc chat mới có tên nhóm / từ khoá giống các cuộc trong nhóm → trợ lý gợi ý ngay (không tốn hạn mức); không ra thì hỏi kèm lượt đặt tiêu đề. Chỉ chuyển khi bạn bấm "Chuyển vào nhóm".
- **Tách nhánh**: nút nhánh ở mỗi tin nhắn → cuộc mới có sẵn các tin tới tin đó (trợ lý nắm ngữ cảnh), hiện thụt vào dưới cuộc gốc.
- **Tiêu đề ngắn tự động**: sau câu trả lời đầu, model rẻ (Haiku) đặt tiêu đề 2–6 từ; tự đổi tên thì giữ tên của bạn. Tắt được trong Cài đặt → AI.
- Tìm kiếm cuộc trò chuyện tìm được cả theo tên nhóm. Cuộc khớp trong nội dung tin nhắn (không phải tiêu đề) hiện một dòng trích đoạn, chữ khớp tô đậm. Đang tìm: nhóm có kết quả tự mở, vẫn thu gọn được, mỗi nhóm ghi số kết quả; xoá ô tìm → nhóm về trạng thái thu gọn / mở như trước.

### Sửa lỗi
- Tiêu đề cuộc chat tạo từ mẫu artifact hiện chữ thô `Tạo artifact type="doc" title=...` → nay là tên artifact; các tiêu đề cũ bị lỗi được sửa tự động khi mở app.

### Thêm mới
- **Gmail & Telegram** (thử nghiệm, mặc định tắt — Cài đặt → Tính năng thử nghiệm): trợ lý đọc email / tin nhắn của bạn để tóm tắt, nhắc việc, soạn trả lời. **Chỉ đọc + soạn nháp** — mọi bản nháp hiện hộp thoại để bạn xem / sửa trước, và bạn tự gửi trong Gmail / Telegram.
- Gmail: bạn tự tạo OAuth client (hướng dẫn từng bước trong app), đăng nhập bằng trình duyệt; ẩn sẵn thư OTP / ngân hàng, chặn người gửi theo địa chỉ hoặc tên miền, "Thử đọc 5 thư mới" để xem trợ lý thấy gì. App OAuth ở chế độ Testing hết hạn sau 7 ngày — app báo trước và nhắc kết nối lại.
- Telegram: đăng nhập tài khoản cá nhân (api_id của bạn, mã + mật khẩu 2 bước); mặc định trợ lý không đọc chat nào cho tới khi bạn chọn, hoặc chế độ "mọi chat trừ chat bị chặn" (chat ngân hàng / ví chặn sẵn); tin nhắn hệ thống chứa mã đăng nhập luôn bị chặn. "Đăng xuất + xoá phiên" một nút.
- **Gmail nhiều tài khoản**: kết nối 2–3 (tối đa 10) tài khoản Gmail dùng chung một OAuth client — mỗi tài khoản token riêng, ngắt kết nối riêng. Đặt tên gọi ("Cá nhân", "Trường", "Công việc"), bật/tắt cho trợ lý đọc, lọc riêng tư (ẩn thư nhạy cảm, người gửi bị chặn) theo từng tài khoản; mỗi dòng hiện số ngày còn lại trước khi Google buộc đăng nhập lại. "Tóm tắt thư chưa đọc" gộp mọi tài khoản đang bật và ghi rõ thư thuộc tài khoản nào; hỏi đích danh ("thư bên Trường") thì chỉ đọc tài khoản đó. Nháp trả lời luôn lưu đúng tài khoản chứa thư gốc, hộp duyệt ghi "Nháp sẽ lưu trong: …". Tài khoản đang kết nối tự chuyển sang danh sách, không phải đăng nhập lại.
- Secret, token, phiên đăng nhập chỉ lưu trên máy (mã hoá Windows); tối đa 60 lần đọc / giờ cho Telegram và cho từng tài khoản Gmail; đọc không đánh dấu đã đọc.
- **Cài skill cho trợ lý** (Cài đặt → Skill): cài từ thư mục hoặc file .zip có `SKILL.md` (định dạng skill của Claude: frontmatter `name` + `description`). Trước khi cài hiện nguồn, toàn bộ nội dung và danh sách file để bạn duyệt; script / file nhị phân bị bỏ qua — skill chỉ là chữ, app không chạy gì kèm theo. Bật/tắt, xem, xoá từng skill; skill có sẵn của app giữ nguyên (chỉ xem). Lưu ở `%APPDATA%/Team Working/skills`.
- Trợ lý tự chọn tối đa 2 skill hợp với câu hỏi theo `description` (không nhồi hết vào prompt); gọi đích danh bằng "dùng skill <tên>" hoặc "/<tên>".
- **Phong cách của bạn (my-style)**: bấm "Học từ các cuộc chat gần đây" → trợ lý đề xuất ghi chú (văn phong, cách trình bày slide/tài liệu/code), bạn chọn / sửa rồi mới lưu; tự thêm hoặc xoá ghi chú được. Ghi chú luôn được dùng khi chat.
- Skill có thể kèm theme slide (`themes/*.json`, cùng định dạng theme artifact) — hiện mẫu màu khi xem trước, dùng được ngay trong slide / xuất pptx, trợ lý biết id theme khi dùng skill.
- **Artifacts**: panel cạnh khung chat hiển thị tài liệu (Markdown + biểu đồ + sơ đồ Mermaid), slide, bảng cân bằng chỉ số, biểu đồ, sơ đồ, trang HTML tương tác. Có lịch sử phiên bản (xem / khôi phục), trợ lý sửa tại chỗ bằng find/replace (không khớp thì báo lỗi, không sửa bừa).
- Xuất file: tài liệu → docx / pdf / md; slide → pptx (sửa được trong PowerPoint) / pdf; bảng → xlsx (giữ công thức, tô ô bất thường) / csv / json (nhập vào Unity); sơ đồ → svg / pdf.
- Bảng cân bằng: cột công thức tự tính (bộ phân tích an toàn, không eval), ô lệch nhiều so với trung bình được tô vàng / đỏ, sửa số ngay trong panel — trợ lý thấy bản mới ở lần hỏi tiếp.
- Mẫu cho làm game: Game Design Document, bảng cân bằng chỉ số, roadmap, pitch deck. Theme slide: Sáng, Tối, Pixel + theme JSON tự thêm.
- An toàn: artifact chạy trong iframe chỉ `allow-scripts` ở origin riêng `mmc-artifact://`, CSP chặn mạng, thư viện (Chart.js, Mermaid) đóng gói sẵn; không đọc được dữ liệu / API của app, không mở cửa sổ hay điều hướng; artifact treo không làm đơ app.
- **Giao diện luôn đúng trạng thái**: mọi trang (Cài đặt › Cập nhật / Giọng nói / Chat biểu cảm / Skill, Điều khiển máy tính, Kết nối agent, Gmail, Telegram, panel Artifacts) tự cập nhật khi trạng thái đổi ở bất kỳ đâu — không phải bật/tắt hay mở lại trang. Bật/tắt, đổi tên, chọn hiện ngay; lưu lỗi thì tự hoàn tác và báo lỗi. Lịch sử trao đổi với agent hiện ngay thay vì đợi tới 5 giây; chép skill vào thư mục rồi quay lại app là thấy.

### Thêm mới
- **Giọng nói** (mặc định tắt): nút micro trong khung chat — nhận giọng nói bằng faster-whisper chạy trên máy (GPU NVIDIA: large-v3-turbo; không có GPU hoặc GPU lỗi: small trên CPU), không khoá ngôn ngữ (nói lẫn Việt / Anh / Nhật), có từ vựng riêng. Nói xong điền vào ô nhập để sửa hoặc gửi luôn (tuỳ chọn). Tin gửi bằng giọng có nhãn "🎤 nói" và nghe lại được ghi âm gốc (chỉ trên máy, tự xoá sau 7 ngày).
- **Đọc to câu trả lời**: nút loa trên mỗi câu trả lời; tự đọc khi bạn hỏi bằng giọng. Đọc dần từng câu, bỏ qua code / đường dẫn / log / emoji. Dừng bằng Esc, Ctrl+Alt+Q, hoặc khi bạn bắt đầu nói. Giọng Edge (tự nhiên, cần mạng), lỗi thì tự chuyển sang Piper (offline).
- Thư viện và model chỉ tải khi bạn bấm, báo dung lượng trước (gói giọng nói ~120 MB, CUDA ~1,2 GB nếu có GPU, model 148 MB–1,5 GB, giọng Piper 64 MB); mọi file khoá phiên bản / mã kiểm tra.
- Trợ lý biết tin nhắn là chữ chép từ giọng nói: đoán ý khi bị nghe sai, chỉ trêu nhẹ khi đang chat vui, và hỏi xác nhận trước mọi yêu cầu hành động.

### Thay đổi
- Chat biểu cảm: khi hỏi lỗi kỹ thuật / làm việc nghiêm túc, câu trả lời có tối đa 2 emoji kể cả ở mức Nhiều.

### Thêm mới
- **Chat biểu cảm**: bộ chọn emoji (tìm tiếng Việt, gõ không dấu cũng được, mục "dùng gần đây"); gửi GIF và sticker GIPHY (có ô tìm, mục thịnh hành, "Powered by GIPHY"); sticker trên máy (6 sticker mẫu kèm app + thư mục bạn tự chép png/webp/gif/svg vào); tab Yêu thích (GIPHY chỉ lưu ID).
- **Thả cảm xúc** cho từng tin nhắn (rê chuột → 6 cảm xúc nhanh hoặc chọn thêm), lưu trong lịch sử; trợ lý biết bạn đã thả gì ở lượt sau.
- **Trợ lý biểu cảm** theo mức Tắt / Ít / Vừa / Nhiều / Tự động (tăng dần theo độ thân thiết, có trần và nút đặt lại về Ít; dữ liệu chỉ trên máy). Mặc định **Tắt**. Trợ lý bắt chước số emoji bạn dùng, tự giảm khi bạn đang sửa lỗi / làm việc nghiêm túc / buồn. Tối đa 1 reaction và 1 GIF/sticker mỗi câu trả lời, có giãn cách chống spam.
- GIPHY API key: mỗi người tự lấy key miễn phí và dán trong Cài đặt → Chat biểu cảm (mã hoá DPAPI). Bản dev đọc `GIPHY_API_KEY` trong `.env` (không vào bộ cài). Chưa có key thì tab GIF hiện hướng dẫn.

### Thêm mới
- **Kết nối agent** (thử nghiệm, mặc định tắt): Claude Code, Claude Desktop và agent khác trên máy dùng được trợ lý qua MCP — `ask_mizuki`, `submit_task`, `get_task`, `list_tasks`. Chỉ nghe 127.0.0.1; mỗi agent một token (chỉ hiện một lần); lần đầu kết nối phải bấm Cho phép; danh sách agent đã cho phép có nút thu hồi; lịch sử trao đổi. Hướng dẫn thêm vào Claude Code / Claude Desktop: `docs/agents.md`.
- Agent khác **không kế thừa quyền của bạn**: khi trả lời agent khác, trợ lý không có công cụ nào và không dùng trí nhớ của bạn; nội dung agent gửi chỉ là dữ liệu.
- Giới hạn mặc định 20 yêu cầu/giờ/agent và 1 việc cùng lúc (chỉnh được); chạm giới hạn thì agent nhận lỗi kèm giờ gọi lại và app hiện thông báo nhỏ.
- **Trợ lý dùng MCP server khác** (Notion, GitHub…): thêm/xoá/bật/tắt trong trang Kết nối agent, giá trị bí mật mã hoá; mỗi lần gọi công cụ phải duyệt, có "luôn cho phép công cụ này" (thu hồi được).

### Thay đổi
- Ctrl+Alt+Q là phím dừng khẩn cấp dùng chung: ngắt cả điều khiển máy tính lẫn kết nối agent.

### Thêm mới
- **Dán ảnh trực tiếp vào khung chat (Ctrl+V)**: ảnh chụp bằng Win+Shift+S / Snipping Tool / Print Screen, ảnh copy từ trình duyệt hoặc Photoshop, và file copy từ File Explorer (nhiều file một lần). Dán chữ vẫn như cũ.
- **Kéo thả** ảnh và file vào bất kỳ đâu trong khung chat.
- Ảnh hiện thành thumbnail phía trên ô nhập (có nút X để bỏ, bấm để xem to) và trong lịch sử chat. Gửi được chỉ ảnh, hoặc ảnh kèm chữ; tối đa 10 file mỗi tin (trước là 5).
- Ảnh vượt giới hạn của Claude (cạnh dài > 2.576 px hoặc > 5 MB, hoặc BMP) được tự thu nhỏ/nén thành bản riêng để gửi; bản gốc (tối đa 30 MB) vẫn lưu trong lịch sử.

### Thay đổi
- Khi chưa kết nối Claude Code CLI vẫn soạn được tin và đính kèm sẵn — chỉ nút Gửi bị tắt.
- File đính kèm được nhận dạng theo nội dung (không tin đuôi file): file đổi đuôi thành .png mà không phải ảnh sẽ bị từ chối.

### Thêm mới
- Thông báo cập nhật: khi có bản mới, app hiện số phiên bản, ngày phát hành và danh sách thay đổi, kèm 3 lựa chọn *Cập nhật ngay* (tải nền có thanh tiến trình, xong thì hỏi khởi động lại), *Để sau* (nhắc lại lần mở app sau) và *Bỏ qua phiên bản này*.
- Bản cập nhật bắt buộc (`[critical]`): không bỏ qua được, nhắc lại mỗi lần kiểm tra và hiện dải cam trên đầu app — bấm vào là cập nhật.
- *Cài đặt → Cập nhật*: bật/tắt tự kiểm tra, nút *Kiểm tra ngay*, chọn kênh **stable** hoặc **beta** (nhận cả bản pre-release).
- Tự sao lưu dữ liệu (`%APPDATA%\Team Working\backups\`, giữ 3 bản) lần đầu mở phiên bản mới, trước khi nâng cấp cơ sở dữ liệu.
- **Điều khiển máy tính — chế độ chỉ xem** (thử nghiệm, mặc định tắt): bật ở *Cài đặt → Tính năng thử nghiệm*, lần đầu phải đọc cảnh báo. Bấm biểu tượng con mắt ở khung soạn tin để cho trợ lý xem màn hình trong phiên này — trợ lý chụp màn hình (chọn màn hình, phóng to một vùng) rồi hướng dẫn bạn, không tự click hay gõ phím.
- Phím dừng khẩn cấp **Ctrl+Alt+Q** (dùng được cả khi đang ở app khác) và nút *Dừng*: tắt quyền xem màn hình và dừng ngay mọi phản hồi đang chạy. Không đăng ký được phím này thì tính năng không bật.
- Nhật ký mọi lần chụp kèm ảnh trong `%APPDATA%\Team Working\logs\computer-use\` (giữ 7 ngày); nút *Chụp thử* để xem trợ lý sẽ thấy gì mà không gửi đi.
- Trợ lý đọc được **log Unity** (Editor.log, phiên trước, Package Manager, crash) và **crash Blender** khi được cho xem màn hình — chẩn đoán lỗi chính xác hơn đọc ảnh.
- **Đọc cửa sổ & cây giao diện** (tuỳ chọn): bấm *Tải và cài* Python sidecar (~50 MB tải, ~110 MB ổ đĩa, có thanh tiến trình và nút Huỷ) để trợ lý liệt kê cửa sổ đang mở và đọc tên nút/ô nhập/thông báo lỗi. Không bao giờ đọc ô mật khẩu. Gỡ sạch bằng nút *Gỡ Python sidecar*.

### Thay đổi
- App không còn tự tải bản cập nhật khi chưa được đồng ý; kiểm tra mỗi 2 giờ thay vì 6 giờ. Trước khi khởi động lại để cài, app dừng và lưu các phản hồi đang chạy.

## [0.3.0] - 2026-11-05

App đổi tên thành **MMC studio**. Cài đè lên bản cũ như bình thường, không mất dữ liệu. Chưa ký số: Windows SmartScreen có thể cảnh báo khi cài — chọn *More info → Run anyway*.

### Thay đổi
- Đổi tên app thành **MMC studio**. Bản cập nhật cài đè lên bản cũ như bình thường; lịch sử chat, trí nhớ, tài khoản đã lưu và phiên đăng nhập giữ nguyên (thư mục dữ liệu vẫn là `%APPDATA%\Team Working\`). Shortcut cũ được thay bằng shortcut tên mới — nếu đã ghim app lên taskbar, có thể cần ghim lại.

## [0.2.0] - 2026-11-05

Thêm đổi team, rời team, nhường quyền Owner và đổi nhanh tài khoản GitHub. Chưa ký số: Windows SmartScreen có thể cảnh báo khi cài — chọn *More info → Run anyway*.

### Thêm mới
- Nút team trên thanh bên: đổi nhanh giữa các team và tạo/tham gia thêm team từ bất kỳ màn hình nào.
- Rời team khi chỉ còn một mình: chọn xóa team vĩnh viễn (gõ tên để xác nhận) hoặc giữ team và nhận mã khôi phục 30 ngày; người đầu tiên vào team trống bằng mã sẽ thành Owner.
- Owner duy nhất rời team: chọn người nhận quyền Owner ngay trong hộp thoại rời team.
- Nhường quyền Owner (nút vương miện trong danh sách thành viên): người nhận thành Owner, Owner cũ thành Manager, trong một bước có xác nhận.
- Đổi tài khoản GitHub nhanh: nút tài khoản ở thanh bên hiện các tài khoản từng đăng nhập trên máy; tài khoản bật "Ghi nhớ đăng nhập" thì bấm là đổi ngay, không cần mở trình duyệt. Phiên được mã hóa bằng Windows DPAPI; app không bao giờ thấy mật khẩu GitHub.

### Thay đổi
- Lịch sử chat và cài đặt trợ lý (tên, avatar, tính cách) giờ riêng theo từng tài khoản trên máy, như trí nhớ và hồ sơ cá nhân. Dữ liệu cũ thuộc về tài khoản đầu tiên đã đăng nhập trên máy.
- Đăng xuất chỉ thu hồi phiên trên máy này, không còn đăng xuất các máy khác của cùng tài khoản.

### Ghi chú cho người quản trị
- Bản này cần 2 migration Supabase `20261101090000_leave_team.sql` và `20261102090000_transfer_ownership.sql` (đã áp lên prod trước khi phát hành).

## [0.1.2] - 2026-10-28

Bản nên cài. Nội dung giống 0.1.1; sửa cách đăng release để app tự cập nhật được (0.1.1 bị tạo trùng 2 release nên không tải được `latest.yml`). Chưa ký số: Windows SmartScreen có thể cảnh báo khi cài — chọn *More info → Run anyway*.

### Sửa lỗi
- Phát hành: mỗi phiên bản chỉ còn một release trên GitHub, đủ file cài đặt và thông tin cập nhật.
- Máy chưa cài Claude Code CLI không còn bị kéo về màn hình "Kết nối Claude Code" mỗi lần bấm menu (từ 0.1.1).

## [0.1.1] - 2026-10-28

Bản phát hành đầu tiên lên GitHub Releases (0.1.0 chỉ có tag, không phát hành). Chưa ký số: Windows SmartScreen có thể cảnh báo khi cài — chọn *More info → Run anyway*.

### Sửa lỗi
- Máy chưa cài Claude Code CLI không còn bị kéo về màn hình "Kết nối Claude Code" mỗi lần bấm menu — vẫn dùng được Thời gian, Trí nhớ, Team….

## [0.1.0] - 2026-10-28

### Thêm mới
- Khung ứng dụng desktop Team Working (Electron + React + TypeScript), giao diện tiếng Việt mặc định, có tiếng Anh.
- Trò chuyện với trợ lý AI qua Claude Code CLI trên tài khoản Claude của chính bạn: chữ hiện dần theo thời gian thực, nút dừng, nhớ ngữ cảnh giữa các tin nhắn.
- Nhiều cuộc trò chuyện: tìm kiếm, ghim, đổi tên, xóa; lịch sử lưu trên máy.
- Chế độ hội thoại: Tự do, Học tập, Code, Quản lý dự án.
- Hiển thị Markdown, tô màu code, nút sao chép code.
- Cá nhân hóa trợ lý: tên, avatar (chọn sẵn hoặc tải ảnh), tính cách, ngôn ngữ; chủ đề sáng/tối và màu nhấn.
- Màn hình kiểm tra Claude Code CLI kèm hướng dẫn cài đặt và đăng nhập.
- Trí nhớ: hồ sơ cá nhân và danh sách điều trợ lý ghi nhớ (thêm, sửa, xóa, tìm, xuất JSON) — chỉ lưu trên máy.
- Trợ lý đề xuất điều nên ghi nhớ (bấm "Gợi ý ghi nhớ" hoặc tự động khi rời cuộc trò chuyện); bạn duyệt/sửa trước khi lưu.
- Trợ lý dùng hồ sơ và các ghi nhớ liên quan khi trả lời, kể cả ở cuộc trò chuyện mới.
- Đính kèm file vào tin nhắn: ảnh, PDF, file chữ/code (tối đa 5 file, mỗi file 10 MB).
- Tìm kiếm cuộc trò chuyện theo nội dung tin nhắn, gõ không dấu vẫn tìm được.
- Tùy chọn dùng Anthropic API key của riêng bạn thay cho Claude Code CLI (key được mã hóa trên máy).
- Đăng nhập team bằng GitHub (mở trình duyệt hệ thống).
- Team: tạo team, mời bằng email hoặc mã chia sẻ, vai trò Owner/Manager/Member, khai báo kỹ năng.
- Dự án và task: Kanban kéo thả, danh sách, lịch; việc con, bình luận, file đính kèm; quyền theo vai trò.
- Trợ lý chia dự án thành task và gợi ý phân công theo kỹ năng + khối lượng việc — manager duyệt trước khi tạo.
- Dashboard tiến độ: % theo dự án/thành viên, task trễ hạn, khối lượng việc, burndown.
- Thông báo trong app và thông báo Windows khi được giao việc, có bình luận, task đổi trạng thái, sắp đến hạn.
- Sao lưu trí nhớ lên máy chủ team (tùy chọn, mặc định tắt).
- Nhãn DEV khi app đang trỏ tới máy chủ thử nghiệm.
- Feedback hai chiều: góp ý dự án/quy trình (công khai, ẩn danh với thành viên, hoặc riêng tư gửi quản lý), feedback cho một người (riêng tư; công khai chỉ để khen), đánh giá định kỳ của quản lý.
- Thread trả lời, đánh dấu đã đọc/đã xử lý, thông báo khi có feedback hoặc trả lời mới.
- Trợ lý giúp viết feedback và câu trả lời mang tính xây dựng (bạn duyệt trước khi gửi), quản lý tóm tắt feedback theo kỳ.
- Tên, avatar, tính cách trợ lý đi theo tài khoản GitHub (chỉ riêng bạn thấy).
- Học tập: trợ lý lập lộ trình theo mục tiêu (bạn sửa trước khi lưu), theo dõi từng bước, ghi chú; quiz trắc nghiệm + tự luận, flashcard; chỉ ra chỗ cần ôn và đề xuất ghi nhớ. Chia sẻ tiến độ với quản lý (tùy chọn).
- Chế độ Code: chọn thư mục dự án; mặc định chỉ đọc; bật quyền sửa thì mỗi thay đổi hiện diff để bạn đồng ý/từ chối. Trợ lý không chạy lệnh terminal.
- Thời gian: bấm giờ theo task, Pomodoro, bảng chấm công theo tuần, nhập/sửa giờ, xuất CSV — dùng được khi offline.
- Hôm nay: việc được giao, trợ lý gợi ý kế hoạch ngày và nhắc khi tới giờ; trợ lý viết báo cáo cuối ngày/tuần để gửi quản lý.
- Trí nhớ riêng theo tài khoản GitHub: mỗi thành viên có hồ sơ, ghi nhớ và đề xuất riêng — kể cả khi dùng chung máy. Hồ sơ cá nhân đi theo tài khoản (đổi máy vẫn giữ), chỉ chính chủ đọc được.
- Chế độ sáng/tối: đưa lên đầu Cài đặt và thêm nút chuyển nhanh ở thanh bên.
- Góp ý & báo lỗi: trợ lý chuẩn hóa ý tưởng/lỗi thành GitHub issue, bạn sửa rồi mở trang tạo issue; báo lỗi kèm phiên bản, hệ điều hành và log gần nhất (đã che đường dẫn cá nhân, email). Nút "Gửi báo lỗi" trong Cài đặt.
- Tự cập nhật từ GitHub Releases: tải nền, báo "Có bản mới — khởi động lại để cập nhật".
- Lỗi giao diện được ghi vào file log để dễ báo lỗi.
- Menu chỉ hiện tính năng hợp với vai trò của bạn trong team.
