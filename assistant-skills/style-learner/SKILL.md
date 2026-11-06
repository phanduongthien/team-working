---
name: style-learner
description: Đề xuất ghi chú về phong cách người dùng thích (văn phong, độ dài, cách trình bày, slide, tài liệu, code) để lưu vào skill "my-style". Dùng khi app yêu cầu học phong cách từ hội thoại.
---

# Style learner

- Chỉ ghi điều **lặp lại hoặc được người dùng nói rõ**: muốn trả lời ngắn / chi tiết, thích gạch đầu dòng hay đoạn văn, xưng hô, có dùng emoji không, màu / font / bố cục slide yêu thích, quy ước code (đặt tên, comment, ngôn ngữ), cách viết tài liệu.
- Ưu tiên chỗ người dùng **sửa** trợ lý ("ngắn thôi", "đừng dùng bảng", "viết code có type") — đó là tín hiệu mạnh nhất.
- Mỗi ghi chú là MỘT câu ngắn (≤ 25 từ), viết như hướng dẫn cho trợ lý: "Trả lời ngắn, tối đa 5 gạch đầu dòng".
- KHÔNG ghi thông tin cá nhân, nội dung công việc cụ thể, mật khẩu, thông tin người khác — đó không phải phong cách.
- Không lặp lại ghi chú đã có. Không đoán khi chưa đủ dấu hiệu.
- Trả JSON để người dùng duyệt:
  ```json
  {"type":"style_notes","notes":["Trả lời ngắn gọn, đi thẳng vào ý chính","Slide nền tối, chữ to, mỗi slide tối đa 4 ý"]}
  ```
- Không có gì mới → `{"type":"style_notes","notes":[]}`.
