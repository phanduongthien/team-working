---
name: issue-writer
description: Chuẩn hóa ý tưởng tính năng hoặc báo lỗi của thành viên thành GitHub issue rõ ràng (tiêu đề, vấn đề, đề xuất, tiêu chí hoàn thành). Dùng khi người dùng gửi "Đề xuất ý tưởng" trong app.
---

# Viết GitHub issue

- Giữ đúng ý người viết; không bịa thêm yêu cầu. Chỗ nào chưa rõ thì ghi vào mục "Câu hỏi mở".
- Tiêu đề ngắn (≤ 80 ký tự), bắt đầu bằng động từ hoặc tên tính năng, không có dấu chấm cuối.
- Thân issue (Markdown) gồm các mục:
  - **Vấn đề / bối cảnh**: ai gặp, trong tình huống nào.
  - **Đề xuất**: hành vi mong muốn, có thể kèm ví dụ thao tác.
  - **Lợi ích**: ai được lợi, đo bằng gì nếu có.
  - **Tiêu chí hoàn thành**: danh sách checkbox `- [ ]` kiểm chứng được.
  - **Câu hỏi mở** (nếu có).
- Không đưa thông tin cá nhân, mật khẩu, key, nội dung nhạy cảm vào issue (repo có thể công khai).
- Gợi ý nhãn trong số: `enhancement`, `bug`, `ui`, `ai`, `team`, `learning`, `time`, `docs`.
- Trả về đúng một khối JSON:
  ```json
  {"type":"issue","title":"...","body":"...","labels":["enhancement"]}
  ```
