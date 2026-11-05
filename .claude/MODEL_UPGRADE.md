# Checklist khi chuyển sang model mới

Làm trong một phiên mới, sau khi đã chọn model mới (`/model`).

1. **Chạy mọi `tests.md`** (`.claude/skills/*/tests.md`). Mỗi prompt chạy trong một phiên riêng, ghi Đạt/Không đạt vào một ghi chú tạm.
2. **Không đạt vì model làm quá** (quá thận trọng, hỏi thừa, sửa quá phạm vi): trước hết tìm rule nặng tay hoặc hướng dẫn thừa gây ra hành vi đó, rồi **xóa hoặc nhẹ tay lại**. Model mới thường giỏi hơn và cần ít scaffolding hơn.
3. **Không đạt vì model làm thiếu**: chỉ khi đó mới thêm hướng dẫn, dạng "Làm X vì Y", qua `/learn`.
4. Chạy `/health-check` để quét lại rule nặng tay và mục quá hạn.
5. Nếu app cũng đổi model API: cập nhật `ANTHROPIC_MODEL` trong code (lấy ID từ skill `claude-api`, không đoán) và bảng "Giá trị dễ lỗi thời" trong skill `claude-bridge`.
6. Ghi vào `.claude/CHANGELOG.md`: `YYYY-MM-DD — Chuyển sang <tên model> (<model ID>) — tests.md: <x>/<y> đạt; đã xóa/sửa: <tóm tắt>`.
