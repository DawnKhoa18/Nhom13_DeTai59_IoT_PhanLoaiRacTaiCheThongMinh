# QUY CHUẨN VĂN PHONG VÀ HÌNH THỨC TRÌNH BÀY BÁO CÁO KHÓA LUẬN (DÀNH CHO AGENT)

Tài liệu này định nghĩa các quy tắc bắt buộc áp dụng khi viết, biên tập hoặc chỉnh sửa các chương trong báo cáo khóa luận tốt nghiệp (đặc biệt là các file Word `.docx` và tài liệu kỹ thuật tiếng Việt). Mọi Agent khi tham gia tạo hoặc sửa nội dung báo cáo bắt buộc phải tuân thủ nghiêm ngặt 4 quy tắc sau:

---

## 1. QUY TẮC 1: KHÔNG CHÊM TỪ TIẾNG ANH KHÔNG CẦN THIẾT
Tuyệt đối không chêm từ tiếng Anh dịch nghĩa hoặc chú thích trong ngoặc đơn sau từ tiếng Việt khi thuật ngữ tiếng Việt đã rõ nghĩa, tự nhiên và đầy đủ.

### Ví dụ đối chiếu:
- ❌ **Sai:** `kiến trúc cơ sở dữ liệu đa mô hình (Polyglot Persistence)`
  👉 **Đúng:** `kiến trúc cơ sở dữ liệu đa mô hình`
- ❌ **Sai:** `kiểm soát sổ kho biến động tồn kho (Stock Card Ledger)`
  👉 **Đúng:** `kiểm soát sổ thẻ kho biến động tồn kho`
- ❌ **Sai:** `vòng đời đặt hàng trước (Pre-order Lifecycle)`
  👉 **Đúng:** `vòng đời đơn đặt hàng trước`
- ❌ **Sai:** `gói combo vật tư (Bill of Materials - BOM)`
  👉 **Đúng:** `gói vật tư thực hành và định mức nguyên vật liệu`
- ❌ **Sai:** `kiến trúc liên cơ sở dữ liệu (Cross-Database Architecture)`
  👉 **Đúng:** `kiến trúc lưu trữ kết hợp giữa hai cơ sở dữ liệu`
- ❌ **Sai:** `sổ cái bất biến (Immutable Financial Ledger)`
  👉 **Đúng:** `sổ cái tài chính bất biến`
- ❌ **Sai:** `cơ chế xóa mềm (Soft Delete) kết hợp chỉ mục duy nhất (Active Record Uniqueness)`
  👉 **Đúng:** `cơ chế xóa mềm kết hợp chỉ mục bán phần duy nhất`
- ❌ **Sai:** `khóa lạc quan (Optimistic Locking)`
  👉 **Đúng:** `cơ chế khóa lạc quan`
- ❌ **Sai:** `bản chụp dữ liệu (Snapshot)`
  👉 **Đúng:** `bản chụp dữ liệu` hoặc `bản ghi giá tại thời điểm đặt`
- ❌ **Sai:** `bộ dụng cụ tự làm tại nhà (DIY Kit)`
  👉 **Đúng:** `bộ dụng cụ tự làm tại nhà`

### Các trường hợp ngoại lệ ĐƯỢC PHÉP giữ lại:
1. **Tên công nghệ, nền tảng, hệ quản trị, phần mềm chính thức:** `PostgreSQL`, `MongoDB`, `NestJS`, `Docker`, `Redis`, `Prisma`, `Node.js`, `TypeScript`, `React`.
2. **Tên mã định danh thực thể, bảng, trường dữ liệu trong code / schema:** `SanPham`, `BienTheSanPham`, `DonHang`, `ChiTietDonHang`, `GioHang`, `DanhGia`, `MaChiTietDonHang`, `PhienBan`...
3. **Giá trị mã enum trạng thái hệ thống:** `'active'`, `'completed'`, `'waiting_deposit'`, `'cancelled'`...
4. **Từ viết tắt kỹ thuật quốc tế chuẩn không thể dịch sang tiếng Việt:** `CSDL`, `ACID`, `RBAC`, `QR`, `SKU`, `BOM`, `API`, `URL`, `POS`, `CRUD`, `JSON`.

---

## 2. QUY TẮC 2: VĂN PHONG GIẢN DỊ, RÕ RÀNG, TRÁNH TỪ NGỮ ĐAO TO BÚA LỚN
Văn phong báo cáo kỹ thuật cần gãy gọn, trong sáng, phản ánh đúng bản chất kỹ thuật của hệ thống. Tránh dùng từ ngữ cường điệu, hoa mỹ hoặc đao to búa lớn.

### Ví dụ đối chiếu:
- ❌ **Sai:** `PostgreSQL 16 (Hạt nhân dữ liệu nghiệp vụ quan hệ): Đóng vai trò là trung tâm lưu trữ chính...`
  👉 **Đúng:** `PostgreSQL 16: Đóng vai trò lưu trữ các dữ liệu giao dịch chính...`
- ❌ **Sai:** `đóng vai trò là hạt nhân lưu trữ nghiệp vụ chính cho toàn bộ hệ thống`
  👉 **Đúng:** `đóng vai trò lưu trữ dữ liệu nghiệp vụ chính`
- ❌ **Sai:** `giải phóng hoàn toàn tài nguyên cho luồng giao dịch đặt hàng`
  👉 **Đúng:** `giúp hệ thống xử lý các giao dịch đặt hàng nhanh chóng và ổn định hơn`
- ❌ **Sai:** `bảo đảm tính minh bạch hoàn hảo cho công tác kiểm kê và đối soát`
  👉 **Đúng:** `giúp việc theo dõi, kiểm kê và đối soát dữ liệu diễn ra rõ ràng, chính xác`
- ❌ **Sai:** `thể hiện rõ nét giải pháp kết hợp cơ sở dữ liệu đa mô hình`
  👉 **Đúng:** `được thiết kế để tận dụng ưu điểm của từng hệ cơ sở dữ liệu`

---

## 3. QUY TẮC 3: TUYỆT ĐỐI KHÔNG SỬ DỤNG KÝ TỰ `&`, BẮT BUỘC DÙNG TỪ "VÀ"
Trong toàn bộ văn bản (bao gồm tiêu đề chương, mục lớn, mục nhỏ, đề mục con, chú thích bảng biểu, nội dung đoạn văn, mục lục và danh mục bảng biểu), tuyệt đối không dùng ký tự `&`. Bắt buộc phải thay bằng từ tiếng Việt **"và"**.

### Ví dụ đối chiếu:
- ❌ **Sai:** `Kiến trúc CSDL đa mô hình & Bảng tổng hợp thực thể`
  👉 **Đúng:** `Kiến trúc cơ sở dữ liệu đa mô hình và bảng tổng hợp thực thể`
- ❌ **Sai:** `Tài khoản & Phân quyền`
  👉 **Đúng:** `Tài khoản và phân quyền`
- ❌ **Sai:** `Danh mục & Bộ sưu tập`
  👉 **Đúng:** `Danh mục và bộ sưu tập`
- ❌ **Sai:** `Nhà cung cấp & Xuất nhập kho`
  👉 **Đúng:** `Nhà cung cấp và xuất nhập kho`
- ❌ **Sai:** `Lưu trữ tài liệu linh hoạt & truy xuất tốc độ cao`
  👉 **Đúng:** `Lưu trữ tài liệu linh hoạt và truy xuất tốc độ cao`
- ❌ **Sai:** `Vé điện tử & Điểm danh QR Code`
  👉 **Đúng:** `Vé điện tử và điểm danh bằng mã QR`

---

## 4. QUY TẮC 4: SENTENCE CASE TUYỆT ĐỐI, CẤM DÙNG TITLE CASE
Trong tiếng Việt, tiêu đề chương, mục, tiểu mục, đề mục nhỏ, chú thích bảng, phụ lục chỉ viết hoa chữ cái đầu tiên (Sentence case). Tuyệt đối không viết hoa từng từ theo kiểu Title Case của tiếng Anh.

### Ví dụ đối chiếu:
- ❌ **Sai:** `3.2.1. Kiến trúc CSDL đa mô hình và Bảng tổng hợp thực thể` *(chữ "Bảng" viết hoa không vì lý do gì)*
  👉 **Đúng:** `3.2.1. Kiến trúc cơ sở dữ liệu đa mô hình và bảng tổng hợp thực thể`
- ❌ **Sai:** `A. Nhóm 1: Sản Phẩm Đa Biến Thể Và Kiểm Soát Sổ Kho Biến Động Tồn Kho`
  👉 **Đúng:** `A. Nhóm 1: Sản phẩm đa biến thể và kiểm soát sổ thẻ kho biến động tồn kho`
- ❌ **Sai:** `B. Nhóm 2: Đơn hàng bán lẻ và Vòng đời Đặt hàng trước`
  👉 **Đúng:** `B. Nhóm 2: Đơn hàng bán lẻ và vòng đời đơn đặt hàng trước`
- ❌ **Sai:** `C. Nhóm 3: Dịch Vụ Workshop Trải Nghiệm, Lộ Trình Học Và Điểm Danh QR Code`
  👉 **Đúng:** `C. Nhóm 3: Dịch vụ workshop trải nghiệm, lộ trình học và điểm danh bằng mã QR`
- ❌ **Sai:** `D. Nhóm 4: Gói Combo Set Vật Tư`
  👉 **Đúng:** `D. Nhóm 4: Gói vật tư thực hành và định mức nguyên vật liệu`
- ❌ **Sai:** `E. Nhóm 5: Giỏ Hàng Ảo Và Đánh Giá Phản Hồi`
  👉 **Đúng:** `E. Nhóm 5: Giỏ hàng và đánh giá phản hồi giữa hai cơ sở dữ liệu`
- ❌ **Sai:** `Phụ lục A.1. Các bảng phân hệ Tài khoản và Phân quyền`
  👉 **Đúng:** `Phụ lục A.1. Các bảng phân hệ tài khoản và phân quyền`
- ❌ **Sai:** `Phụ lục A.2. Các bảng phân hệ Danh mục, Bộ sưu tập và Khuyến mãi`
  👉 **Đúng:** `Phụ lục A.2. Các bảng phân hệ danh mục, bộ sưu tập và khuyến mãi`
- ❌ **Sai:** `Phụ lục A.3. Các bảng phân hệ Quản lý Nhà cung cấp và Xuất nhập kho`
  👉 **Đúng:** `Phụ lục A.3. Các bảng phân hệ quản lý nhà cung cấp và xuất nhập kho`
- ❌ **Sai:** `Phụ lục A.4. Bảng phân hệ Thông báo hệ thống`
  👉 **Đúng:** `Phụ lục A.4. Bảng phân hệ thông báo hệ thống`

### Danh sách các trường hợp được phép viết hoa:
1. Chữ cái đầu tiên của câu, tiêu đề mục, hoặc đầu dòng danh sách.
2. Tên công nghệ / thương hiệu: `PostgreSQL`, `MongoDB`, `NestJS`, `Docker`, `Redis`.
3. Từ viết tắt quy chuẩn: `CSDL`, `ACID`, `RBAC`, `QR`, `SKU`, `BOM`, `API`, `URL`, `POS`, `CRUD`, `JSON`.
4. Tên mã định danh thực thể trong code / schema: `SanPham`, `BienTheSanPham`, `ChiTietDonHang`.
5. Tên trường đại học: `HUIT`.
