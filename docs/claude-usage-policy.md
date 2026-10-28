# Điều khoản dùng Claude trong Team Assistant

> Kiểm tra ngày 2026-10-28. Chính sách của Anthropic đã đổi nhiều lần trong 2026 — **kiểm tra lại trước mỗi bản phát hành lớn**.

## Nguồn chính
- Claude Code — Legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
- Use the Claude Agent SDK with your Claude plan: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- Consumer Terms (Free/Pro/Max): https://www.anthropic.com/legal/consumer-terms
- Commercial Terms (Team/Enterprise/API): https://www.anthropic.com/legal/commercial-terms
- Usage Policy: https://www.anthropic.com/legal/aup

## Anthropic nói gì (tóm tắt)
1. **OAuth (đăng nhập bằng tài khoản Claude)** chỉ dành cho người mua gói Free/Pro/Max/Team/Enterprise, phục vụ "ordinary use" của Claude Code và các app chính chủ của Anthropic.
2. **Developer xây sản phẩm/dịch vụ** (kể cả dùng Agent SDK) *nên* dùng API key (Claude Console hoặc cloud provider).
3. **Bị cấm**: bên thứ ba đưa "Claude.ai login" vào app của mình; định tuyến request qua credential Free/Pro/Max **thay mặt** người dùng; thu thập, lưu trữ hoặc làm trung gian credential/session token Claude.ai. Đăng nhập phải đi qua flow của chính Anthropic.
4. **Được phép rõ ràng**: người dùng cuối tự đăng nhập vào **binary Claude Code chưa bị sửa đổi** bằng subscription của chính họ. Khi một sản phẩm chạy Claude Code: không được sửa binary, không được gỡ/vô hiệu phương thức đăng nhập; mỗi người dùng phải tự xác thực bằng tài khoản/key của mình và tự chịu phí — không trả hộ, bán lại hay làm trung gian.
5. Giới hạn sử dụng Pro/Max giả định **mức dùng cá nhân thông thường**. `claude -p` và Agent SDK khi đăng nhập bằng gói Claude vẫn tính vào hạn mức subscription (thay đổi tính phí tháng 6/2026 đã tạm dừng).
6. Không dùng tên/logo "Claude"/"Anthropic" làm tên sản phẩm hay logo; chỉ được ghi dạng văn bản "chạy bằng Claude Code".

## Đánh giá thiết kế của Team Assistant

| Cách làm | Đánh giá |
|---|---|
| App spawn `claude` CLI **do người dùng tự cài**, **tự đăng nhập** qua flow của Anthropic, mỗi người một tài khoản | ✅ Khớp mục 4 ("end user signing in to the unmodified Claude Code binary with their own Claude subscription"). |
| App đọc/sao chép/gửi file credential của Claude Code, hoặc tự làm màn hình đăng nhập Claude | ❌ Cấm (mục 3). **Không làm.** App chỉ chạy `claude --version` / `claude auth status` và hướng dẫn người dùng tự chạy `claude` để login. |
| Đóng gói sẵn binary Claude Code trong installer | ⚠️ Cần Commercial Terms + không sửa binary. **Không làm** — yêu cầu người dùng tự cài. |
| Một tài khoản dùng chung cho cả team / server proxy | ❌ Cấm. **Không làm.** |
| `AnthropicApiProvider` với API key người dùng tự nhập, lưu bằng `safeStorage` | ✅ Đây là cách Anthropic khuyến nghị cho developer. |
| Tác vụ AI chạy ngầm liên tục (tự trích memory, tự lập kế hoạch mỗi sáng…) bằng subscription | ⚠️ Vùng xám với "ordinary, individual usage". Giữ ở mức người dùng chủ động kích hoạt hoặc tần suất thấp, có thể tắt. |
| Đặt tên app chứa "Claude" | ❌ Không. Tên "Team Assistant" ổn. |

## Kết luận
- Thiết kế **không vi phạm điều nào được nêu rõ**, với điều kiện giữ các ràng buộc ở bảng trên.
- **Rủi ro còn lại**: câu "developers building products… should use API key authentication" — nếu Team Assistant được coi là "sản phẩm" phát hành rộng (không chỉ nội bộ team), Anthropic có thể yêu cầu dùng API key. Anthropic có quyền thực thi mà không báo trước.
- **Khuyến nghị**: dùng nội bộ team, phi thương mại; giữ `AnthropicApiProvider` hoạt động đầy đủ để chuyển đổi được ngay; nếu muốn phân phối công khai/thương mại thì liên hệ Anthropic sales trước.

## Ràng buộc kỹ thuật rút ra (bắt buộc trong code)
- Không đọc thư mục cấu hình/credential của Claude Code (`~/.claude/.credentials.json`, keychain…).
- Không truyền `--dangerously-skip-permissions`; quyền tool luôn tối thiểu theo chế độ.
- Không tự động hóa ngoài thao tác của người dùng ở tần suất cao.
- UI ghi rõ: "AI chạy bằng Claude Code trên tài khoản Claude của chính bạn; mức dùng tính vào gói của bạn."
