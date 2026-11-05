# Nhật ký thay đổi cấu hình agent

Mỗi dòng: `YYYY-MM-DD — thay đổi — vì sao`. Ghi bởi skill `health-check`, `learn`, hoặc khi đổi model (xem `MODEL_UPGRADE.md`). Lịch sử sản phẩm nằm ở `CHANGELOG.md` gốc.

- 2026-11-05 — Thiết lập hệ thống chống rot: metadata cho skill, hook SessionStart `rot-check.mjs`, skill `health-check` — để phát hiện skill/rule lỗi thời khi CLI, API, code hay model thay đổi. Model đang dùng: Claude Opus 5.5 (`claude-opus-5-5`), Claude Code CLI 2.1.318.
