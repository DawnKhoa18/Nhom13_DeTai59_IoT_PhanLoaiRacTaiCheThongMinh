# ĐỀ TÀI 59: HỆ THỐNG IOT PHÂN LOẠI RÁC TÁI CHẾ THÔNG MINH
**Học phần:** Internet of Things (IoT) &bull; **Nhóm thực hiện:** Nhóm 13

---

## 👥 THÀNH VIÊN VÀ PHÂN CÔNG NHIỆM VỤ

| Thành viên | Nhiệm vụ chính | Sản phẩm phụ trách |
| :--- | :--- | :--- |
| **Võ Đăng Khoa** | **Phần 1:** Mô hình giả lập và phần cứng | Thiết kế mạch Wokwi (`diagram.json`), sơ đồ kết nối, phần cứng giả lập. |
| **Đỗ Quang Liêm** | **Phần 2:** Lập trình điều khiển hệ thống | Viết mã nguồn ESP32 (`src/main.cpp`), điều khiển FSM, động cơ, servo, nút bấm, cảnh báo. |
| **Phạm Anh Nhật Minh** | **Phần 3:** Web Demo, IoT & Dashboard | Xây dựng Web Demo (`web/`), hoạt họa Canvas, kết nối MQTT IoT, giám sát và điều khiển. |

---

## 🚀 TỔNG QUAN HỆ THỐNG

Dự án nghiên cứu và chế tạo hệ thống phân loại rác tái chế tự động ứng dụng IoT:
1. **Băng chuyền tự động:** Vận chuyển rác qua trạm phát hiện vật thể và trạm nhận diện camera AI.
2. **Cơ cấu phân luồng bằng Servo:** Điều hướng vật thể đến 4 khu vực chứa:
   - **Nhôm (Aluminum):** Góc Servo 30°
   - **Sắt/Thép (Steel):** Góc Servo 70°
   - **Nhựa (Plastic):** Góc Servo 110°
   - **Không xác định / Kiểm tra (Inspection):** Góc Servo 150°
   - **Vị trí Home:** Góc Servo 90°
3. **Giám sát mức đầy thùng chứa:** Theo dõi mức chứa của 4 thùng rác, cảnh báo khi $\ge 80\%$ và dừng hệ thống khi đầy $\ge 90\%$.
4. **Cơ chế an toàn (Safety Interlock):** Nút dừng khẩn cấp (Emergency Stop) dừng tức thời toàn bộ hệ thống khi có sự cố.
5. **Giám sát trực quan từ xa qua Web:** Web Dashboard cập nhật thời gian thực qua giao thức MQTT over WebSocket.

---

## 🏗️ CẤU TRÚC THƯ MỤC DỰ ÁN

```
Nhom13_DeTai59_IoT_PhanLoaiRacTaiCheThongMinh/
├── .pio/                   # Thư mục build PlatformIO
├── docs/                   # Tài liệu đồ án
│   ├── Phân công giai đoạn 3.md
│   └── Bao_cao_Phan_3_Web_Dashboard_IoT.md
├── include/                # Header file nếu có
├── src/
│   └── main.cpp            # Mã nguồn điều khiển nhúng ESP32 (FSM, WiFi, MQTT)
├── web/                    # Ứng dụng Web Demo & Dashboard Giám Sát (Phần 3)
│   ├── index.html          # Giao diện chính
│   ├── css/
│   │   └── style.css       # Giao diện Dark Industrial Dashboard
│   ├── js/
│   │   ├── animation.js    # Engine hoạt họa băng chuyền Canvas 60 FPS
│   │   ├── mqtt-client.js  # Client MQTT WebSocket (EMQX Public Broker)
│   │   ├── simulator.js    # Bộ sinh dữ liệu mô phỏng offline độc lập
│   │   └── app.js          # Controller điều phối trung tâm
│   └── assets/             # Hình ảnh / Tài nguyên tĩnh
├── diagram.json            # Sơ đồ mạch điện mô phỏng trên Wokwi
├── platformio.ini          # Cấu hình PlatformIO & thư viện dependencies
├── wokwi.toml              # Cấu hình nạp firmware nhúng vào Wokwi
└── README.md               # Tài liệu hướng dẫn sử dụng dự án
```

---

## 🔌 SƠ ĐỒ CHÂN KẾT NỐI (PIN MAPPING)

| Thiết bị / Linh kiện | Chân ESP32 | Ghi chú |
| :--- | :---: | :--- |
| **Nút Detect Material** | GPIO 32 | Mô phỏng cảm biến quang IR phát hiện rác |
| **Nút Phân loại Nhôm** | GPIO 14 | Mô phỏng kết quả nhận diện AI: Nhôm |
| **Nút Phân loại Thép** | GPIO 17 | Mô phỏng kết quả nhận diện AI: Sắt/Thép |
| **Nút Phân loại Nhựa** | GPIO 19 | Mô phỏng kết quả nhận diện AI: Nhựa |
| **Nút Phân loại Khác** | GPIO 22 | Mô phỏng kết quả nhận diện AI: Không xác định |
| **Nút Emergency Stop** | GPIO 33 | Dừng khẩn cấp toàn bộ hệ thống |
| **Nút Empty Bin** | GPIO 12 | Xác nhận nhân công đã dọn sạch thùng rác đầy |
| **Động cơ Băng chuyền (A4988)** | STEP: 25, DIR: 26, EN: 27 | Băng chuyền vận chuyển rác |
| **Động cơ Servo phân loại** | GPIO 23 (PWM) | Góc gạt: 30° / 70° / 90° / 110° / 150° |
| **LED Xanh (Trạng thái OK)** | GPIO 4 | Báo hệ thống sẵn sàng hoạt động |
| **LED Đỏ (Cảnh báo)** | GPIO 5 | Báo thùng đầy hoặc dừng khẩn cấp |
| **Còi Buzzer** | GPIO 15 | Kêu cảnh báo thùng đầy và dừng khẩn |
| **Cảm biến HC-SR04 Nhôm** | TRIG: 13, ECHO: 34 | Đo mức đầy thùng Nhôm |
| **Cảm biến HC-SR04 Thép** | TRIG: 16, ECHO: 35 | Đo mức đầy thùng Thép |
| **Cảm biến HC-SR04 Nhựa** | TRIG: 18, ECHO: 36 | Đo mức đầy thùng Nhựa |
| **Cảm biến HC-SR04 Khác** | TRIG: 21, ECHO: 39 | Đo mức đầy khu kiểm tra |

---

## 🌐 KÊNH TRUYỀN IOT VÀ MQTT

- **WiFi ảo Wokwi:** `Wokwi-GUEST` (không mật khẩu).
- **MQTT Broker:** `broker.emqx.io` (Public Broker).
- **Cổng kết nối:**
  - ESP32 TCP: Cổng `1883` (thư viện `PubSubClient`).
  - Web WebSocket: Cổng `8083` (ws) hoặc `8084` (wss) (thư viện `mqtt.js`).
- **Topic trạng thái (ESP32 $\rightarrow$ Web):** `nhom13/recycling/status`
- **Topic điều khiển (Web $\rightarrow$ ESP32):** `nhom13/recycling/command`

---

## 📖 HƯỚNG DẪN KHỞI CHẠY VÀ DEMO

### Cách 1: Chạy mô phỏng Live với Wokwi và Web
1. **Biên dịch Firmware:**
   ```bash
   pio run
   ```
2. **Khởi chạy mô phỏng Wokwi:**
   - Mở VS Code có cài extension **Wokwi Simulator**.
   - Mở tệp `diagram.json`, nhấn phím `F1` $\rightarrow$ chọn **Wokwi: Start Simulator**.
   - ESP32 sẽ tự động kết nối WiFi `Wokwi-GUEST` và kết nối tới `broker.emqx.io`.
3. **Mở Web Dashboard:**
   - Mở tệp `web/index.html` trực tiếp bằng trình duyệt (Chrome, Edge, Firefox) hoặc thông qua extension **Live Server** trong VS Code.
   - Trạng thái trên Web sẽ hiển thị: **`ONLINE (Wokwi MQTT)`**.
   - Mọi thao tác nhấn nút trên Wokwi hoặc trên Web đều đồng bộ tức thời!

### Cách 2: Chạy Demo Offline (Khi thuyết trình hoặc không bật Wokwi)
1. Mở tệp `web/index.html` trong trình duyệt.
2. Nhấn nút **`🎮 Chuyển sang Demo Offline`** ở góc trên bên phải.
3. Nhấn **`🎲 Chạy tự động demo`**: Hệ thống Web sẽ tự động thực hiện chu trình mô phỏng liên tục: sinh rác ngẫu nhiên $\rightarrow$ quét AI $\rightarrow$ gạt servo $\rightarrow$ đổ rác vào thùng $\rightarrow$ tăng mức đầy $\rightarrow$ cảnh báo thùng đầy.
4. Có thể nhấn các nút tương tác trực tiếp: Phát hiện vật thể, Phân loại, Dừng khẩn cấp, Dọn thùng để kiểm thử.

---

## 🏆 KẾT QUẢ ĐẠT ĐƯỢC
- ✅ Hoàn thành 100% các yêu cầu của cả 3 giai đoạn.
- ✅ Kiến trúc Monorepo thống nhất, dễ bàn giao và đánh giá.
- ✅ Giao diện trực quan hiện đại, đạt tiêu chuẩn đồ án tốt nghiệp / học phần chuyên sâu.
