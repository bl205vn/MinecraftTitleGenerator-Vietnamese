# Thử nghiệm Minecraft Ten Vietnamese với atlas cao hơn

Font: `fonts/minecraft-ten-vietnamese` (biến thể Vietnamese của Minecraft Ten).

- Kích thước UV chuẩn và `textures/flat.png`: **1000 × 1280**.
- Giữ nguyên 320 hàng pixel đầu của atlas nguồn, gồm các vùng mặt cạnh, đầu và viền.
- Đóng gói 90 model bổ sung (84 ký tự Việt và 6 model dấu phụ) thành các ô mặt trước/sau hoàn chỉnh ở phần mở rộng. 6 dấu phụ chỉ dùng khi sửa model, không được đăng ký thành ký tự nhập văn bản.
- Vùng lấy mẫu riêng ở cuối atlas bảo toàn các mặt sừng chồng lên dấu ngã của `ỡ` và `ữ`.
- Giữ nguyên hình khối, vị trí, số cube và toàn bộ 155 khóa ký tự đã biên dịch của nguồn; chỉ đổi UV và metadata kích thước.
- `textureWidth: 1000`, `textureHeight: 1280`, `faces`, `ends`, `border` được khai báo trong biến thể ở `fonts.json`. Các vùng đầu/cạnh/viền cũ vẫn được dùng.
- Toàn bộ 119 texture và 21 overlay nguồn được chuyển sang cùng bố cục. Tài nguyên có độ phân giải 2×, 3×, 4× tiếp tục giữ hệ số tương ứng.
- `characters.json` và thumbnails đã được dựng sẵn. `atlas-layout.json` mô tả vị trí từng ô.

## Thay đổi code

Không sửa code lõi plugin. Thư mục legacy này chỉ chứa dữ liệu và công cụ build.

`compile.js` chỉ bổ sung ánh xạ tên file `creeper_*` thành 17 chữ A có dấu theo quy ước của nguồn và loại 6 model dấu phụ khỏi danh sách ký tự. Module `scripts/vietnamese-character-map.js` được lấy từ dự án Việt hóa nguồn.

Không phải đổi dòng gán `textureWidth = 1000` vì chiều rộng vẫn là 1000. Renderer thumbnail đọc UV đã chuẩn hóa và kích thước ảnh thật; không khóa chiều cao ở 320.

## Kiểm tra

Mở `fonts/minecraft-ten-vietnamese/review/index.html` để xem atlas và bảng ký tự. Toàn bộ 140 texture/overlay khớp mẫu UV; 84 ảnh đối chiếu trước/nghiêng/sau trên 4 texture đều khớp nguồn từng pixel. Kiểm tra cú pháp Node và vòng lặp biên dịch ký tự của `compile.js` đã đạt. Chưa chạy toàn bộ pipeline `compile.js` vì máy hiện chưa có các dependency Node của repo. Các kiểm tra phần mềm không thay thế việc mở font trong Blockbench. Chưa kiểm tra tương tác hoặc toàn bộ hiệu ứng trong Blockbench.

Đây là thử nghiệm bố cục riêng; khung UV 1000×1280 khác yêu cầu đóng góp 1000×320 trong README gốc.
