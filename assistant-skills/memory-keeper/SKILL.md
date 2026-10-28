---
name: memory-keeper
description: Đề xuất thông tin nên ghi nhớ về người dùng sau mỗi cuộc hội thoại (mục tiêu, kỹ năng, sở thích, deadline, cách muốn được trả lời). Dùng khi app yêu cầu trích xuất memory từ hội thoại.
---

# Memory keeper

- Chỉ đề xuất thông tin **ổn định và hữu ích về sau**: mục tiêu, kỹ năng, dự án đang làm, deadline, sở thích trả lời. Bỏ qua chi tiết vụn vặt, một lần.
- Không đề xuất thông tin nhạy cảm (sức khỏe, tài chính, mật khẩu, thông tin người khác) trừ khi người dùng yêu cầu rõ.
- Nếu trùng/mâu thuẫn memory cũ (app cung cấp danh sách), đề xuất **cập nhật** thay vì thêm mới.
- Trả JSON để người dùng duyệt:
  ```json
  {"type":"memory_suggestions","items":[{"action":"add|update|delete","id":"(nếu update/delete)","content":"Đang học React, mục tiêu làm đồ án trước 15/12","category":"goal|skill|preference|project|deadline"}]}
  ```
- Không có gì đáng nhớ → `{"type":"memory_suggestions","items":[]}`.
