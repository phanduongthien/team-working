# Nhật ký thay đổi cấu hình agent

Mỗi dòng: `YYYY-MM-DD — thay đổi — vì sao`. Ghi bởi skill `health-check`, `learn`, hoặc khi đổi model (xem `MODEL_UPGRADE.md`). Lịch sử sản phẩm nằm ở `CHANGELOG.md` gốc.

- 2026-11-05 — Thiết lập hệ thống chống rot: metadata cho skill, hook SessionStart `rot-check.mjs`, skill `health-check` và `learn`, mục "Bảo trì cấu hình agent" trong CLAUDE.md — để phát hiện skill/rule lỗi thời khi CLI, API, code hay model thay đổi. Model đang dùng: Claude Opus 5.5 (`claude-opus-5-5`), Claude Code CLI 2.1.318.
- 2026-11-05 — Viết lại 6 rule nặng tay thành "làm X vì Y" (RLS, secret, registry, Bash ở chế độ Code, --allowedTools, PGlite) — rule không lý do khiến model mới dễ làm quá; "registry là chỗ duy nhất" đã sai vì IPC phía main cũng phải đăng ký.
- 2026-11-05 — Health check lần đầu: sửa bước 6 của supabase-migration (không sinh đè supabase.types.ts viết tay), ghi ngày kiểm chứng stream-json trong claude-bridge — sinh đè sẽ gãy typecheck; ngày mơ hồ thì không biết khi nào cần kiểm lại. Báo cáo: health/2026-11-05.md.
