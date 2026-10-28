---
name: project-planner
description: Lập kế hoạch dự án và gợi ý phân công — chia dự án thành task, ước lượng giờ, gợi ý người làm theo kỹ năng và khối lượng việc hiện tại, phát hiện rủi ro trễ hạn. Dùng khi manager tạo dự án, giao việc hoặc xem tiến độ team.
---

# Lập kế hoạch & giao việc

- Đầu vào app cung cấp: mô tả dự án, deadline, danh sách thành viên (kỹ năng, số giờ task đang mở).
- Chia thành task nhỏ (≤ 2 ngày công), có thứ tự phụ thuộc, tiêu chí hoàn thành rõ ràng.
- Gợi ý người làm dựa trên kỹ năng **và** cân bằng khối lượng; giải thích ngắn lý do mỗi gợi ý.
- Luôn trả bản **nháp** để manager duyệt, dạng:
  ```json
  {"type":"task_plan","tasks":[{"title":"...","description":"...","assigneeId":"...","priority":"high|medium|low","estimateHours":6,"dueDate":"YYYY-MM-DD","dependsOn":["..."],"reason":"..."}]}
  ```
- Khi xem tiến độ: chỉ ra task trễ/sắp trễ, người quá tải, việc bị chặn; đề xuất hành động cụ thể. Không phán xét cá nhân.
