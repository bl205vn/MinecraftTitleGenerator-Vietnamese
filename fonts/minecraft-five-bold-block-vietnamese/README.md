# Minecraft Five Bold Block Vietnamese

Biến thể tiếng Việt của Minecraft Five Bold Block, tác giả Ewan Howell & bl205vn.

## Cách plugin tạo chữ

- `characters/*.json` và các atlas trong `textures/` là **dữ liệu nguồn có thể chỉnh sửa**. Model nguồn có thể còn nhiều cube để mô tả vị trí chữ và dấu.
- Khi tạo chữ, plugin ghép nền và nét chữ vào texture đầu ra trong bộ nhớ, rồi tạo **một cube cho mỗi ký tự**, cộng một cube âm làm viền ngoài dòng.
- Chỉ ký tự được dùng mới chiếm ô; ký tự lặp dùng lại ô. Hết trang thì tạo trang tiếp. Trang đầu ra không ghi đè atlas nguồn.
- Các panel trong cùng một lần tạo có chung chiều cao nền theo dấu cao nhất/thấp nhất của dòng; nét chữ giữ nguyên tọa độ. Dòng không dấu vẫn dùng mặt chữ cao 48px.
- Bố cục, UV, số trang, độ phân giải và màu đều lấy từ dữ liệu; không có danh sách màu hoặc công thức riêng theo tên texture.
- Nhánh này chỉ bật cho font có `bakedPanels` trong `fonts.json`; các font khác giữ luồng cũ.

## Vẽ thêm texture mới

1. Sao chép `textures/flat.png` hoặc một atlas cùng font làm mẫu, giữ nguyên vị trí tất cả ô chữ, dấu và mặt cạnh. Vẽ màu/hoa văn theo bố cục đó. Không vẽ riêng toàn bộ ký tự có dấu.
2. Giữ tỷ lệ atlas **1000×320**. Có thể dùng bản phóng nguyên lần **2000×640** hoặc **4000×1280**; mọi tọa độ bên dưới nhân cùng hệ số.
3. Bổ sung nền dùng chung tại **575,164 — 48×132**:
   - Mặt trên: **575,164 — 48×16**.
   - Mặt trước: **575,180 — 48×100**.
   - Mặt dưới: **575,280 — 48×16**.
   Nền này không có nét chữ. Tô kín vùng cần hiển thị; giữ pha hoa văn phù hợp với nền các chữ nguồn.
4. Giữ màu viền ở pixel **0,246**. Nếu atlas mẫu có ô viền 8×8 như các texture gỗ, giữ nguyên ô đó. Viền được tạo bằng hình học, không cần vẽ quanh từng chữ.
5. Lưu thành `textures/my_texture.png`, rồi thêm mục tương ứng vào `textures.json`:

```json
"my_texture": {
  "name": "My Texture",
  "author": "Tên tác giả"
}
```

   Đặt mục này bên trong đối tượng `textures`, thêm dấu phẩy đúng JSON và giữ `flat` ở đầu danh sách. Để thêm biến thể, dùng cấu trúc `variants` như `oak_planks` hiện có.
6. Chạy compile riêng cho font, sau đó cập nhật dữ liệu mà plugin đang tải và nạp lại plugin. Cũng có thể thử ngay bằng mục tải atlas từ file trong plugin; ảnh đúng tỷ lệ sẽ được nhận là atlas thay vì texture khối lặp.

Không sửa code ghép để thêm một texture thông thường. Nếu đổi hình chữ hoặc vị trí UV thì phải cập nhật `flat.png` và model nguồn tương ứng; Flat là mặt nạ xác định nét chữ khi nới nền cho cả dòng. Nếu chuyển hoặc đổi kích thước khung nền, cập nhật thêm `bakedPanels.frame` và `frameY` trong `fonts.json`.

## Hiệu ứng và giới hạn

- Texture có sẵn, atlas tùy chỉnh, gradient, texture khối lặp và overlay đều được xử lý trên atlas nguồn trước bước đóng gói. Overlay mới cũng phải theo atlas nguồn, không theo các trang đầu ra được tạo tạm.
- Khi panel được nới cao, nền dùng khung chung và phần nét lấy theo mặt nạ Flat. Các hiệu ứng nằm ngoài nét chữ, như bóng vẽ tay quanh chữ, cần được kiểm tra riêng; không mặc định sao chép mọi điểm nền quanh từng chữ vào panel đã nới.
- Khung hỗ trợ tọa độ Y **-12..88**, còn dữ liệu hiện tại nằm trong **-10..86**. Ký tự vượt khung cần cập nhật cấu hình/atlas.
- Các lần chèn dòng độc lập vẫn dùng Text Row/Row Spacing. Những dòng có chiều cao khác nhau có thể cần chỉnh khoảng cách; đây không phải trình dàn trang nhiều dòng tự động.
- Kiểm tra code và dữ liệu không thay thế bước duyệt thực tế trong Blockbench, đặc biệt Top/Bottom/Small, góc xiên và các texture mới.

## Build và kiểm tra

Chạy tại thư mục gốc của repo bằng Node portable của dự án:

```powershell
& .\.tools\node-v22.23.4-win-x64\node.exe scripts/verify-vietnamese-plugin-input.js minecraft-five-bold-block-vietnamese
& .\.tools\node-v22.23.4-win-x64\node.exe scripts/verify-block-baking-plugin.js
```

Compile từ thư mục `scripts`:

```powershell
& ..\.tools\node-v22.23.4-win-x64\node.exe --experimental-import-meta-resolve compile.js --font minecraft-five-bold-block-vietnamese
```

Hoặc chạy `scripts/compile.bat --font minecraft-five-bold-block-vietnamese`.

Plugin hiện tải dữ liệu từ GitHub theo `repo`/`branch` ở đầu `plugin/minecraft_title_generator.js`. Compile chỉ tạo file local; muốn bản đang tải từ GitHub nhận thay đổi thì cần cập nhật các file build lên nhánh đó. Đừng đưa texture thử sinh ra trong `backups/` vào thư mục source.
