---
name: artifacts
description: Cách trợ lý tạo / sửa artifact (tài liệu, slide, bảng cân bằng, biểu đồ, sơ đồ, HTML) hiển thị trong panel cạnh khung chat.
---

Khi người dùng cần một sản phẩm để giữ lại / chỉnh sửa / xuất file (tài liệu thiết kế, slide, bảng số liệu, biểu đồ, sơ đồ, trang tương tác), hãy tạo ARTIFACT thay vì viết dài trong chat. Câu trả lời trong chat chỉ nói ngắn gọn đã làm gì.

Tạo mới hoặc viết lại TOÀN BỘ:
<artifact type="doc" title="Tên duy nhất">
…nội dung…
</artifact>
Cùng title với artifact đã có = phiên bản mới của artifact đó.

Sửa NHỎ (ưu tiên khi chỉ đổi vài chỗ — tiết kiệm và an toàn hơn viết lại):
<artifact-edit title="Tên artifact">
<find>đoạn cũ chép NGUYÊN VĂN, đủ dài để chỉ khớp đúng một chỗ</find>
<replace>đoạn mới</replace>
</artifact-edit>
Được nhiều cặp find/replace. Nếu đoạn find không khớp đúng một chỗ, app KHÔNG sửa gì và báo lỗi ở lượt sau — khi đó chép lại đúng nguyên văn rồi thử lại. Chỉ viết lại toàn bộ khi thay đổi lớn.

Các loại (type):
- doc — Markdown (tiêu đề, danh sách, bảng). Nhúng biểu đồ bằng khối ```chart {JSON}``` và sơ đồ bằng ```mermaid```.
- slides — các slide ngăn bằng dòng `---`. Dòng đầu có thể `theme: <id>`. Mỗi slide: `layout: title | content | two-column | quote | chart | section`, `# Tiêu đề`, `## Phụ đề`, gạch đầu dòng `- …`, `|||` để sang cột phải (two-column), `> trích dẫn`, `chart: {JSON}`, `notes: ghi chú người nói`. Xuất được pptx sửa được.
- sheet — bảng cân bằng chỉ số. Dòng đầu là tên cột, cột công thức viết `DPS = Damage * AttackSpeed`; các dòng sau là dữ liệu CSV, ô của cột công thức để trống (app tự tính). Hàm: min, max, round(x, n), floor, ceil, abs, sqrt, pow, if(đk, a, b); toán tử + - * / ^ % < > = !=. App tô vàng/đỏ ô lệch nhiều so với trung bình cột.
- chart — một JSON: {"type":"bar|line|pie|doughnut|radar","labels":[…],"datasets":[{"label":"…","data":[…]}]}.
- mermaid — mã Mermaid (flowchart, sequenceDiagram, gantt, stateDiagram, mindmap…).
- html — trang HTML/CSS/JS tự chứa cho dashboard tương tác, mô phỏng. KHÔNG có mạng (không fetch, không CDN, không ảnh ngoài); chỉ dùng JS thuần, ảnh data:. Chạy trong sandbox.

Người dùng có thể tự sửa artifact (vd sửa số trong bảng) — bản mới sẽ được gửi kèm ở lượt sau, hãy dựa vào bản đó.
Không bao giờ đặt artifact trong khối code ``` của chat.
