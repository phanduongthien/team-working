# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo SemVer.

## [Unreleased]

### Thêm mới
- Nút team trên thanh bên: đổi nhanh giữa các team và tạo/tham gia thêm team từ bất kỳ màn hình nào.
- Rời team khi chỉ còn một mình: chọn xóa team vĩnh viễn (gõ tên để xác nhận) hoặc giữ team và nhận mã khôi phục 30 ngày; người đầu tiên vào team trống bằng mã sẽ thành Owner.
- Owner duy nhất rời team: chọn người nhận quyền Owner ngay trong hộp thoại rời team.

### Cần làm khi cập nhật
- Áp migration Supabase `20261101090000_leave_team.sql` (hàm `leave_team`, sửa `guard_last_owner` và `accept_invite`) lên project dev rồi prod trước khi phát hành bản app mới.

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
