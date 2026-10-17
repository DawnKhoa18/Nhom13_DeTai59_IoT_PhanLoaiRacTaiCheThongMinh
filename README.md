# Web Dashboard - Hệ Thống IoT Phân Loại Rác Tái Chế

Ứng dụng web giám sát và điều khiển hệ thống phân loại rác tái chế thông minh thời gian thực (IoT).

## Link truy cập
- **Source code:** [GitHub Repository](https://github.com/DawnKhoa18/Nhom13_DeTai59_IoT_PhanLoaiRacTaiCheThongMinh)
- **Tệp giao diện:** `web/index.html`

## Cách chạy ứng dụng

### Cách 1: Mở trực tiếp (Nhanh nhất)
Mở tệp `web/index.html` bằng bất kỳ trình duyệt web nào (Chrome, Edge, Firefox).

### Cách 2: Dùng Live Server hoặc Local Server
- **VS Code:** Cài extension **Live Server**, chuột phải vào tệp `web/index.html` và chọn **Open with Live Server**.
- **Python Server (nếu có Python):**
  ```bash
  python -m http.server 8000
  ```
  Sau đó mở trình duyệt truy cập: `http://localhost:8000/web/`

## Chế độ hoạt động trên Web
- **Online (kết nối ESP32 / Wokwi qua MQTT):**
  - Broker: `broker.emqx.io` (WebSocket port 8083 / 8084)
  - Topic nhận trạng thái: `nhom13/recycling/status`
  - Topic gửi lệnh: `nhom13/recycling/command`
- **Offline (Demo giả lập):**
  - Nhấn nút **"Chuyển sang Demo Offline"** ở góc trên giao diện để tự do tương tác và kiểm thử không cần phần cứng.
