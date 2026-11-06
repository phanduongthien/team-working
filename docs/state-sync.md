# Đồng bộ trạng thái toàn app

Mục tiêu: mọi trang cập nhật giao diện ngay, không phải bật/tắt hay mở lại trang.

## Cơ chế

**Main** (`src/main/services/stateSync.ts`)
- `StateSync.changed(topic…)`: gom mọi lần báo trong cùng một lượt → phát MỘT sự kiện `sync:changed` (danh sách mục, `SyncTopic` trong `src/shared/sync.ts`).
- IPC đổi trạng thái khai báo `{ changes: '<mục>' }` ở tham số cuối của `handle(...)` → `createHandle` tự báo sau khi xong, **kể cả khi lỗi** (ném hoặc trả `{ error }`).
- Ghi `settings` tự báo theo khoá (`SETTINGS_TOPICS`) — việc nền ghi settings (vd mức biểu cảm tự động, Gmail phát hiện token hết hạn) không cần nhớ gọi riêng.
- Việc nền không qua settings gọi trực tiếp: lịch sử trao đổi agent (`AgentExchangeRepository.onChange`), artifact mới / phiên bản mới (`ArtifactService.onChange`).
- Sự kiện có kèm dữ liệu (`gmail:statusEvent`, `computer:statusEvent`, `update:state`…) vẫn giữ — dùng cho tiến trình liên tục (tải bản cập nhật, cài gói giọng nói).

**Renderer** (`src/renderer/src/lib/sync.ts`)
- `useSync(mục, refresh)`: hỏi lại khi mở trang, khi cửa sổ focus / hiện lại, khi main báo mục đó.
- `useSyncedState(mục, fetcher)`: như trên cho state riêng của một trang → `{ data, setData, refresh }`.
- `onSync(mục, fn)`: cho store zustand / `setup()` của feature (nghe cả khi trang chưa mở).
- `optimistic({ topic, apply, rollback, save, onError? })`: hiện ngay, lưu sau; lưu lỗi → hoàn tác + báo (mặc định thông báo góc màn hình `SyncErrorToast`). Trong lúc lưu, các lần hỏi lại mục đó bị hoãn (không "giật" về giá trị cũ); lưu xong tự hỏi lại.
- Hỏi lại dồn dập được gộp (`coalesce`): không chạy chồng, không lỡ thay đổi.

## Rà soát (trước PR này)

| Trang / tính năng | Trước | Thiếu | Sau |
|---|---|---|---|
| Cài đặt › Cập nhật | Cài đặt lấy 1 lần khi mở; trạng thái tải có sự kiện | Không sự kiện khi đổi cài đặt; lưu lỗi không hoàn tác | `useSyncedState('update')` + `optimistic` |
| Điều khiển máy tính | Sự kiện trạng thái + hỏi lại khi focus; bật/tắt chờ IPC xong mới đổi | Lỗi không hoàn tác rõ; hook focus nằm trong hộp cảnh báo | `useSync(['computer','sidecar'])`, bật/tắt lạc quan |
| Kết nối agent | Sự kiện trạng thái; bật/tắt, giới hạn, thu hồi chờ IPC | Danh sách MCP lấy 1 lần (đổi khi duyệt "luôn cho phép" ở Chat không hiện) | `onSync('agents' / 'mcpServers')`, thao tác lạc quan |
| Lịch sử trao đổi | **Hỏi lại mỗi 5 giây** + khi focus | Tốn tài nguyên, trễ tới 5 giây | Main báo `agentExchanges` mỗi lần thêm / đổi trạng thái việc — bỏ chu kỳ |
| Giọng nói | Hỏi lại sau thao tác + khi có tiến trình cài | Không hỏi lại khi focus; bật/tắt chờ IPC | `useSync('voice')` + `optimistic` |
| Chat biểu cảm | Lấy 1 lần khi mở | Mức tự động đổi nền không hiện; chọn mức chờ IPC | `useSyncedState('expressive')` + `optimistic` |
| Skill | Lấy 1 lần + sau thao tác của chính trang | Chép skill vào thư mục rồi quay lại không hiện; ghi chú my-style lấy 1 lần | `useSyncedState('skills')` (focus hỏi lại), bật/tắt / gỡ lạc quan |
| Gmail | Sự kiện + focus (PR #15) | Bật/tắt, đổi tên, tuỳ chọn chờ IPC; hàng tài khoản dựng lại theo tên (mất thông báo lỗi) | `onSync('gmail')`, `patchGmail` lạc quan, hàng giữ theo id |
| Telegram | Sự kiện + focus (PR #15) | Bật/tắt, chọn chat chờ IPC | `onSync('telegram')`, `patchTelegram` lạc quan (danh sách chat tính lại tại chỗ) |
| Panel Artifacts | Tải lại khi số tin có artifact đổi | Khôi phục / sửa phiên bản từ nơi khác không hiện; trợ lý sửa artifact cũ không đổi số tin | `useSync('artifacts')`, main báo khi tạo / thêm phiên bản |

## Thêm tính năng mới

1. Thêm mục vào `SYNC_TOPICS` (và `SETTINGS_TOPICS` nếu lưu trong settings).
2. Mọi IPC đổi trạng thái: `handle(kênh, schema, fn, { changes: 'mục' })`. Việc nền: `sync.changed('mục')`.
3. Trang: `useSync` / `useSyncedState`; thao tác người dùng qua `optimistic`. Không làm mới theo chu kỳ.
4. E2E: thao tác → giao diện đổi trong 1 giây; đổi từ nơi khác (gọi IPC trong trang) → trang tự cập nhật (xem `tests/e2e/sync.spec.ts`).
