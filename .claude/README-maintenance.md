# Bảo trì cấu hình agent (chống "rot")

Skill và rule dần lỗi thời khi CLI, API, code hoặc model thay đổi. Hệ thống dưới đây phát hiện sớm và **đề xuất** sửa; mọi thay đổi vào skill hay CLAUDE.md đều cần bạn duyệt.

## Gồm những gì
- **Metadata** trong frontmatter mỗi skill (CLAUDE.md dùng comment `<!-- -->` ở đầu file):
  `last_verified` (ngày kiểm tra gần nhất), `review_every_days` (14 = rủi ro cao, 30 = trung bình, 90 = thấp), `depends_on` (`file:`, `cmd:`, `npm:`, `mcp:`, `url:`).
- **`tests.md`** cạnh mỗi skill: 2–3 prompt thử kèm hành vi mong đợi.
- **Hook SessionStart** (`hooks/rot-check.mjs`, cấu hình trong `settings.json`): mỗi phiên mới kiểm tra hạn review và các file trong `depends_on`. Chạy cục bộ, không tốn token. Ổn thì im lặng; có vấn đề thì in 1–3 dòng gợi ý `/health-check`. Script lỗi thì tự bỏ qua.
- **`/health-check`**: kiểm tra toàn bộ, ghi báo cáo vào `health/YYYY-MM-DD.md`, đề xuất từng bản sửa dạng diff.
- **`/learn`**: biến một lần bị sửa lỗi thành một rule "Làm X vì Y", đặt đúng chỗ, duyệt rồi mới ghi.
- **`CHANGELOG.md`** (trong `.claude/`): nhật ký thay đổi cấu hình agent và đổi model.
- **`MODEL_UPGRADE.md`**: checklist khi đổi model.

## Khi nào chạy gì
| Tình huống | Làm gì |
|---|---|
| Mở phiên thấy dòng `[chống rot]` | `/health-check` |
| Vừa nâng cấp Claude Code CLI, SDK, Electron… | `/health-check` |
| Agent làm sai và bạn phải sửa (nhất là lần thứ hai) | `/learn` |
| Sửa một skill | Chạy lại prompt trong `tests.md` của skill đó, ở phiên mới |
| Đổi model | Làm theo `MODEL_UPGRADE.md` |
| Thêm skill mới | Thêm metadata + `tests.md` giống các skill có sẵn |

## Khi đổi model
Chạy mọi `tests.md`. Nếu model mới làm quá thì ưu tiên **xóa** hướng dẫn thừa và rule nặng tay trước khi thêm rule mới. Ghi model và ngày kiểm tra vào `CHANGELOG.md`.

## Lưu ý
- Hook chạy bằng PowerShell (`"shell": "powershell"`), vì Claude Code có thể không tìm thấy Git Bash trên máy.
- Thử hook bằng tay: `node .claude/hooks/rot-check.mjs --today 2027-01-01` (giả lập ngày tương lai) hoặc `--full`.
- `assistant-skills/` là skill của sản phẩm (đóng gói vào app), không thuộc hệ thống này.
