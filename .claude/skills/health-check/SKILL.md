---
name: health-check
description: Kiểm tra "rot" của cấu hình agent (CLAUDE.md, skill trong .claude/skills) — phụ thuộc hỏng, skill quá hạn review, rule mâu thuẫn/trùng/nặng tay — rồi đề xuất bản sửa dạng diff để người dùng duyệt từng cái. Gọi bằng /health-check.
disable-model-invocation: true
metadata:
  last_verified: 2026-11-05
  review_every_days: 30
  depends_on:
    - file:.claude/hooks/rot-check.mjs
    - file:.claude/settings.json
    - file:.claude/CHANGELOG.md
    - cmd:node
---

# Health check

Mục tiêu: phát hiện chỗ lỗi thời và **đề xuất** sửa. Không ghi gì vào skill hay CLAUDE.md khi người dùng chưa đồng ý từng thay đổi, vì người dùng là người chịu trách nhiệm cho các rule này.

## 1. Kiểm tra máy móc (rẻ, chắc chắn)
Chạy `node .claude/hooks/rot-check.mjs --full`. Script kiểm tra:
- `file:` tồn tại, `npm:` có trong package.json, `cmd:` chạy được `--version`, `mcp:` có trong `.mcp.json`/settings.
- Mục quá hạn `review_every_days`, mục thiếu metadata.
- `url:` được liệt kê là XEM TAY: chỉ mở khi người dùng muốn (WebFetch), không tự gọi.

## 2. Đọc và đánh giá (cần phán đoán)
Đọc `CLAUDE.md` và mọi `.claude/skills/*/SKILL.md`, rồi tìm:
- Tham chiếu tới hàm, symbol, script npm, cờ CLI không còn trong code. Kiểm tra bằng Grep hoặc `--help`, đừng đoán.
- Rule mâu thuẫn hoặc trùng lặp giữa CLAUDE.md và skill, hoặc giữa các skill.
- Rule nặng tay (chữ in hoa, "không bao giờ", "PHẢI", in đậm) mà không có lý do đi kèm. Model mới dễ làm quá với kiểu rule này. Đề xuất viết lại thành "Làm X vì Y".
- Chi tiết viết cứng dễ đổi (phiên bản, model ID, đường dẫn tuyệt đối) nằm ngoài bảng "giá trị dễ lỗi thời".
- CLAUDE.md dài hơn khoảng 200 dòng, hoặc chứa quy trình chi tiết lẽ ra nên nằm trong skill.
- Rule lẽ ra phải đúng 100% (nên là hook) nhưng đang chỉ là lời dặn.
- `assistant-skills/` (skill của sản phẩm): chỉ quét rule nặng tay và định dạng JSON trả về, không gắn metadata.

## 3. Ghi báo cáo
Ghi `.claude/health/YYYY-MM-DD.md` (ngày hôm nay, ghi đè nếu chạy lại trong ngày), gồm 3 mục: **Ổn**, **Hỏng**, **Nghi ngờ**. Mỗi dòng ghi rõ file và lý do. Ghi báo cáo không cần duyệt, vì đây chỉ là bản ghi kết quả.

## 4. Đề xuất sửa (từng cái một)
Với mỗi vấn đề ở mục Hỏng hoặc Nghi ngờ:
1. Hiện diff đề xuất và một câu giải thích.
2. Hỏi người dùng (AskUserQuestion: Đồng ý / Bỏ qua / Sửa khác).
3. Đồng ý → ghi file, cập nhật `metadata.last_verified` của mục đó thành hôm nay, thêm một dòng vào `.claude/CHANGELOG.md` (`YYYY-MM-DD — <thay đổi> — <vì sao>`).
4. Mục quá hạn nhưng không có gì cần sửa: hỏi người dùng có xác nhận "vẫn đúng" không. Có thì chỉ cập nhật `last_verified`.

Ưu tiên xóa hoặc gộp rule hơn là thêm rule mới.

## 5. Kết thúc
- Tóm tắt: đã sửa gì, bỏ qua gì.
- Với mỗi skill vừa sửa, gợi ý chạy lại các prompt trong `tests.md` cạnh nó (trong một phiên mới).
- Không commit trừ khi người dùng yêu cầu.
