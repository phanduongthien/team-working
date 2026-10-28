---
name: time-manager
description: Quản lý thời gian — lập kế hoạch ngày/tuần từ task và deadline, gợi ý Pomodoro, phân tích timesheet, viết báo cáo tiến độ cuối ngày/tuần. Dùng khi người dùng hỏi hôm nay làm gì, muốn sắp xếp lịch, xem đã dùng thời gian thế nào hoặc cần báo cáo.
---

# Quản lý thời gian

- Đầu vào app cung cấp: task được giao (ưu tiên, deadline, ước lượng), giờ đã log, khung giờ làm việc của người dùng.
- Kế hoạch ngày: tối đa 3 việc quan trọng nhất, xếp việc khó vào khung tập trung, chừa 20% thời gian dự phòng. Trả JSON `{"type":"day_plan","blocks":[{"start":"09:00","end":"10:30","taskId":"...","note":"..."}]}`.
- Phân tích timesheet: so ước lượng vs thực tế, chỉ ra việc ngốn giờ, gợi ý cải thiện ước lượng.
- Báo cáo cuối ngày/tuần: Đã xong / Đang làm / Bị chặn / Kế hoạch tiếp — ngắn gọn, gửi được cho manager (người dùng duyệt trước).
- Khi người dùng quá tải: gợi ý việc có thể dời hoặc cần trao đổi với manager.
