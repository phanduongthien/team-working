---
name: learn
description: Biến một lần bị người dùng sửa lỗi (hoặc một lỗi lặp lại ≥2 lần) thành MỘT rule ngắn có lý do, đặt đúng chỗ (CLAUDE.md, skill, hoặc hook), kiểm tra trùng/mâu thuẫn, hiện diff để người dùng duyệt rồi mới ghi. Gọi bằng /learn hoặc tự đề xuất khi bị sửa lỗi.
metadata:
  last_verified: 2026-11-05
  review_every_days: 90
  depends_on:
    - file:CLAUDE.md
    - file:.claude/skills
    - file:.claude/settings.json
    - file:.claude/CHANGELOG.md
---

# Learn

Mục tiêu: rút ra bài học bền vững mà không làm CLAUDE.md phình ra. Người dùng duyệt mọi thay đổi, vì rule sai sẽ ảnh hưởng tới mọi phiên sau.

1. **Tóm tắt bài học thành một rule**, dạng "Làm X vì Y". Rule phải cụ thể đủ để kiểm chứng, và phần lý do giúp model sau này áp dụng đúng mức, không làm quá. Không viết chữ in hoa hay "TUYỆT ĐỐI".
2. **Chọn nơi đặt**:
   - CLAUDE.md: áp dụng cho mọi việc trong repo.
   - Skill cụ thể (`.claude/skills/<tên>/SKILL.md`): chỉ áp dụng khi làm việc đó. Đây là nơi ưu tiên nếu được.
   - Hook (`.claude/settings.json`): khi việc đó phải xảy ra 100% và kiểm tra được bằng script. Đề xuất hook kèm lệnh cụ thể và test nó trước khi ghi.
3. **Kiểm tra trùng và mâu thuẫn**: Grep các rule liên quan trong CLAUDE.md và skill. Nếu đã có rule gần giống thì đề xuất **sửa hoặc gộp rule cũ**, không thêm rule mới. Nếu mâu thuẫn thì nêu rõ hai rule và hỏi người dùng giữ bên nào.
4. **Hiện diff và hỏi** (Đồng ý / Sửa lại / Bỏ). Chỉ ghi khi người dùng đồng ý.
5. Sau khi ghi:
   - Cập nhật `metadata.last_verified` của skill vừa sửa.
   - Thêm một dòng vào `.claude/CHANGELOG.md`: `YYYY-MM-DD — <rule/thay đổi> — <vì sao: lỗi gì đã xảy ra>`.
   - Nếu skill có `tests.md` và bài học là một hành vi kiểm chứng được, đề xuất thêm một prompt thử vào đó.

Không dùng skill này để lưu thông tin về người dùng hay tiến độ công việc. Những thứ đó không phải rule.
