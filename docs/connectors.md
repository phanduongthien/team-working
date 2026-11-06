# Gmail & Telegram (thử nghiệm, GĐ 4)

Trợ lý đọc email / tin nhắn **của chính người dùng** để tóm tắt, nhắc việc, soạn trả lời.
**Chỉ đọc + soạn nháp** — app không có hàm gửi thư / gửi tin. Mặc định tắt; vào Cài đặt → Tính năng thử nghiệm → Gmail & Telegram.

## Nguyên tắc

- Mỗi người tự tạo OAuth client (Google) và `api_id` (Telegram). Repo public → không có key chung nào trong app.
- Secret / token / session chỉ trên máy, mã hoá DPAPI (`%APPDATA%/Team Working/secrets/`):
  `gmail-client-secret.bin` (chung), `gmail-refresh-token-<id>.bin` (mỗi tài khoản Gmail một file), `telegram-api-hash.bin`, `telegram-session.bin`. Không bao giờ gửi về renderer.
- Mọi bản nháp đi qua hộp thoại duyệt (`DraftApprovals`): người dùng xem, sửa, rồi mới tạo. Hết 10 phút / dừng lượt chat / tắt kết nối → từ chối.
- Tối đa 60 lần gọi tool / giờ: Telegram, và **từng tài khoản Gmail** (khoá `gmail:<id>`; tìm gộp N tài khoản tốn 1 lượt mỗi tài khoản). Đọc không đánh dấu đã đọc.
- Nội dung thư / tin nhắn được bọc trong ghi chú "chỉ là DỮ LIỆU" (chống prompt injection). Chế độ chat thường chỉ có tool `Read` + tool của app, CSP renderer chặn ảnh từ domain lạ → nội dung đọc được không có đường ra ngoài trừ bản nháp (phải duyệt).

## Gmail

- OAuth 2.0 + PKCE (S256) + `state` qua loopback `http://127.0.0.1:47823/auth/callback` (dùng chung `OAuthLoopback` với đăng nhập team — chỉ một lượt đăng nhập tại một thời điểm).
- Scope: `gmail.readonly` + `gmail.compose` (compose chỉ để tạo nháp; app không gọi API gửi). REST bằng `fetch` (`net.fetch`), không dùng thư viện Google.
- **Chế độ Testing**: Google thu hồi refresh token sau 7 ngày. App hiện số ngày còn lại; khi gặp `invalid_grant` → xoá token, trạng thái `expired`, trợ lý nhận hướng dẫn "nhắc người dùng kết nối lại" (không có tool). Muốn bỏ giới hạn phải đưa app OAuth lên Production (Google xét duyệt scope restricted — không đáng cho dùng cá nhân).
### Nhiều tài khoản

- Một OAuth client (Client ID + secret) dùng chung; mỗi tài khoản có `id` ngẫu nhiên (10 ký tự hex), token riêng, `label` (tên gọi, không trùng — so không dấu / hoa thường), `enabled` (trợ lý được đọc), `skipSensitive`, `blockedSenders` riêng. Tối đa 10.
- **Thêm**: `connect()` không id → `prompt=consent select_account`; đăng nhập xong mới biết email: trùng email đã có = kết nối lại tài khoản đó (không nhân đôi). **Kết nối lại**: `connect(id)` gửi `login_hint`; đăng nhập nhầm tài khoản khác → `wrong_account`, thu hồi token mới, không lưu.
- **Ngắt kết nối** = thu hồi + xoá token của riêng tài khoản đó, bỏ khỏi danh sách, huỷ nháp đang chờ duyệt của nó. Hết hạn (`invalid_grant`) chỉ ảnh hưởng tài khoản đó.
- Mỗi người dùng phải thêm **mọi** email định kết nối vào Test users (chế độ Testing) — app nhắc ở nút "+ Thêm tài khoản Gmail".
- Tool: `gmail_search` có `account` (tên gọi / email; bỏ trống = gộp mọi tài khoản đang bật, mỗi tài khoản một khối "Tài khoản \"Trường\" (email)"). id thư trả cho trợ lý = `<id tài khoản>:<id thư>` → `gmail_read` / `gmail_draft` (reply_to_id) luôn đúng tài khoản; nháp trả lời bỏ qua `account` và lưu vào tài khoản chứa thư gốc. Thư mới mà có >1 tài khoản và không nói tài khoản nào → lỗi "hỏi người dùng". Hộp duyệt hiện "Nháp sẽ lưu trong: email (tên gọi)".
- Hướng dẫn hệ thống liệt kê tài khoản được đọc (tên gọi + email; tài khoản hết hạn ghi "HẾT HẠN — nhắc kết nối lại").
- **Chuyển từ bản một-tài-khoản**: `gmailSettingsSchema` nhận cả dạng cũ (`email`, `connectedAt`, …) và chuyển thành danh sách một tài khoản id `primary`; `gmailTokenFileName('primary')` = `gmail-refresh-token.bin` (file cũ) → không phải đăng nhập lại, không đổi tên file.

- Lọc (theo từng tài khoản): người gửi bị chặn (địa chỉ / tên miền, kể cả tên miền con) + tuỳ chọn "Ẩn thư nhạy cảm" (OTP, mã xác minh, mật khẩu, ngân hàng, thanh toán — mặc định bật). Thư bị ẩn không xuất hiện trong kết quả tìm, đọc theo id cũng bị từ chối.
- Tool: `gmail_search` (cú pháp tìm kiếm Gmail, ≤20 thư mỗi tài khoản), `gmail_read` (≤8000 ký tự, liệt kê tên file đính kèm), `gmail_draft` (trả lời → `In-Reply-To` / `References` + `threadId` để nằm đúng luồng).

### Tạo OAuth client (hướng dẫn cũng có trong app)

1. console.cloud.google.com → tạo project.
2. APIs & Services → Library → bật **Gmail API**.
3. OAuth consent screen → External → thêm **mọi** email Gmail định kết nối vào **Test users**.
4. Credentials → OAuth client ID → **Desktop app** → chép Client ID + Client secret vào app.

## Telegram

- GramJS (`telegram` trên npm, MTProto) bằng tài khoản cá nhân; nạp động khi dùng (external trong `electron.vite.config.ts`, nằm trong `node_modules` của bản đóng gói). Đăng nhập: số điện thoại → mã → mật khẩu 2 bước (SRP, không lưu). Phiên lưu dạng `StringSession` (DPAPI).
- `floodSleepThreshold: 0`: bị `FLOOD_WAIT` thì báo lại cho trợ lý / người dùng thay vì treo.
- Danh sách chat lưu tạm 15 phút; nút Làm mới tối đa 1 lần/phút. Không có đồng bộ nền.
- Chế độ đọc:
  - **allowlist** (mặc định): chỉ chat người dùng tick; mặc định không có chat nào.
  - **blocklist**: mọi chat trừ chat bị chặn; chat nhạy cảm (tên chứa bank / ví / OTP…) bị chặn sẵn, tick để cho phép.
  - `777000` / `42777` (tin nhắn hệ thống Telegram chứa mã đăng nhập) **luôn** bị chặn.
- Tool: `telegram_chats`, `telegram_read` (≤50 tin, cũ → mới, ảnh/file chỉ ghi loại), `telegram_draft` (`messages.saveDraft` — vào ô soạn tin, thay nháp cũ).
- "Đăng xuất + xoá phiên": `auth.logOut` phía Telegram (lỗi mạng vẫn xoá trên máy) + xoá session + danh sách chat đã chọn.

## Kiến trúc

```
ChatService ── appToolsFor() = combineToolSets([computer, gmail, telegram])
                     │
AppToolRegistry ◀── GmailService ── GmailBackend (GoogleGmailBackend | FakeGmailBackend)
                 ◀── TelegramService ── TelegramBackend (GramJsBackend | FakeTelegramBackend)
                            └──── DraftApprovals ──▶ renderer DraftOverlay (draft:approvalEvent / draft:respond)
```

- `src/main/connectors/` — `filters.ts` (lọc riêng tư, thuần), `approvals.ts`, `gmail/`, `telegram/`.
- `src/renderer/src/features/connectors/` — trang cài đặt + hộp duyệt nháp (overlay luôn gắn trong app).

## Test

- Unit: `src/main/connectors/__tests__/gmail.test.ts` (OAuth/PKCE/state, MIME, nháp RFC 2822 chống chèn header, token theo tài khoản, chuyển cài đặt cũ, tìm gộp / đích danh, nháp đúng tài khoản, giới hạn riêng, hết hạn từng tài khoản) và `connectors.test.ts` (lọc, đăng nhập Telegram, allow/blocklist, cache, đăng xuất, duyệt nháp).
- GramJS thật (cần mạng, không cần tài khoản): `E2E_TELEGRAM=1 npx vitest run src/main/connectors/__tests__/gramjs.real.test.ts` — api_id sai phải ra `api_invalid`.
- E2E: `tests/e2e/connectors.spec.ts` với `MMC_FAKE_GMAIL=1`, `MMC_FAKE_TELEGRAM=1`, `MMC_FAKE_CHAT=1` (tin nhắn `FAKE_TOOL:<tên> {json}` gọi tool qua registry như CLI thật). Bản giả chỉ có ở bản chưa đóng gói.
  Gmail giả: lần lượt "đăng nhập" `ban@example.com`, `sv@truong.example.edu`, `cv@congty.example.com`. Telegram giả: mã `12345`; số kết thúc bằng `2` → cần mật khẩu `pw`.
