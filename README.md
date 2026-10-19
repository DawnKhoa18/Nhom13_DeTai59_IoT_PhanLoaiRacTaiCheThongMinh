# Hệ Thống IoT Phân Loại Rác Tái Chế Thông Minh (Đề Tài 59 - Nhóm 13)

Dự án IoT mô phỏng dây chuyền phân loại rác tái chế (Nhôm, Sắt/Thép, Nhựa, Không xác định) sử dụng vi điều khiển ESP32, mô phỏng Wokwi và giám sát trực tuyến thời gian thực qua Web Dashboard.

---

## 1. Các Đường Link Truy Cập & Thông Tin Kết Nối

- **Web Dashboard (Docker):** [http://localhost:8088](http://localhost:8088)
- **Web Dashboard (Mở trực tiếp):** File `web/index.html` (chạy trên trình duyệt bất kỳ)
- **Mã nguồn GitHub:** [https://github.com/DawnKhoa18/Nhom13_DeTai59_IoT_PhanLoaiRacTaiCheThongMinh](https://github.com/DawnKhoa18/Nhom13_DeTai59_IoT_PhanLoaiRacTaiCheThongMinh)
- **2 Tùy chọn Môi trường Kết nối Mạch IoT (Live-Only):**
  1. **🌐 Mạch đám mây (EMQX Cloud - Mặc định & Tiện nhất):**
     - ESP32 & Web kết nối qua broker công cộng `broker.emqx.io`.
     - Cổng ESP32 (TCP): `1883` | Cổng Web (WebSocket): `8084` (WSS) / `8083` (WS).
     - *Ưu điểm:* Không cần cài đặt Docker/Mosquitto, chỉ cần mở Wokwi và Web là chạy được ngay qua Internet.
  2. **🏠 Mạch cục bộ (Mosquitto Local qua Docker):**
     - Chạy máy chủ Mosquitto nội bộ ngay trên máy tính qua Docker.
     - Cổng ESP32 (TCP): `1883` | Cổng Web (WebSocket): `9001` (`ws://localhost:9001`).
     - *Ưu điểm:* Hoạt động khép kín trong mạng nội bộ, không phụ thuộc vào Internet.
- **Topic MQTT:**
  - Topic trạng thái (ESP32 gửi lên): `nhom13/recycling/status`
  - Topic điều khiển (Web gửi lệnh xuống): `nhom13/recycling/command`

---

## 2. Hướng Dẫn Khởi Chạy

### Cách 1: Khởi chạy Wokwi với Broker Đám mây (Đơn giản nhất, không cần Docker)

1. Mở project trong VS Code (đã cài extension **Wokwi Simulator**).
2. Kiểm tra file `src/main.cpp` đã bật `#define USE_CLOUD_BROKER 1` (mặc định).
3. Mở file `diagram.json`.
4. Nhấn phím `F1` -> gõ và chọn **`Wokwi: Start Simulator`**.
5. Mở trực tiếp file `web/index.html` trên trình duyệt. Web sẽ tự động kết nối tới Broker đám mây EMQX và đồng bộ hai chiều thời gian thực với Wokwi!

### Cách 2: Khởi chạy Môi trường Cục bộ với Docker

1. Chuyển cấu hình trong `src/main.cpp`: `#define USE_CLOUD_BROKER 0`.
2. Chạy trên Terminal tại thư mục gốc của project:
   ```bash
   # Khởi động Web Dashboard (cổng 8088) và MQTT Broker Mosquitto (cổng 1883, 9001)
   docker compose up -d

   # Biên dịch lại firmware ESP32 bằng Docker (nếu có sửa code)
   docker compose run --rm firmware-builder

   # Dừng toàn bộ hệ thống
   docker compose down
   ```
3. Khởi động Wokwi (`F1` -> `Wokwi: Start Simulator`).
4. Mở Web tại [http://localhost:8088](http://localhost:8088) và chọn dropdown góc trên bên phải là **🏠 Mạch cục bộ (Mosquitto :9001)**.

*Mẹo trên Windows:* Bạn có thể nhấp đúp trực tiếp vào các file trong thư mục `scripts/`:
- `scripts/docker-start.bat`: Khởi động hệ thống và tự động mở Web.
- `scripts/docker-stop.bat`: Dừng hệ thống.
- `scripts/build-firmware.bat`: Biên dịch lại firmware.

---

## 3. Các Kịch Bản Kiểm Thử Trực Tuyến (Test Cases)

Bạn có thể tương tác trực tiếp bằng các nút trên mạch Wokwi hoặc các nút điều khiển trên Web Dashboard (tất cả lệnh đều gửi xuống mạch ESP32 thật):

### Kịch bản 1: Quy trình phân loại rác 1 chạm trực tuyến
1. Trên Web Dashboard, bấm trực tiếp vào một trong 4 nút phân loại rác:
   - **🥫 Nhôm (30°):** Web gửi lệnh `ALUMINUM` tới ESP32 -> rác chạy trên băng chuyền -> trượt qua camera AI quét laser -> Servo gạt góc **30°** -> rác trượt vào Thùng nhôm -> mức đầy tăng 10%.
   - **🔩 Sắt/thép (70°):** Web gửi lệnh `STEEL` tới ESP32 -> Servo gạt góc **70°** -> rác vào Thùng sắt/thép -> mức đầy tăng 10%.
   - **🧴 Nhựa (110°):** Web gửi lệnh `PLASTIC` tới ESP32 -> Servo gạt góc **110°** -> rác vào Thùng nhựa -> mức đầy tăng 10%.
   - **❓ Rác khác (150°):** Web gửi lệnh `UNKNOWN` tới ESP32 -> Servo gạt góc **150°** -> rác vào Thùng rác khác -> mức đầy tăng 10%.
2. *Hỗ trợ bấm liên tiếp (Hàng đợi nối đuôi nhau):* Bạn có thể bấm chọn liên tiếp nhiều loại rác, các vật thể sẽ nối đuôi nhau chạy trên băng chuyền và lần lượt được Servo gạt vào đúng thùng tương ứng.
3. Sau khi phân loại xong, Servo tự động trở về vị trí gốc (**90°**).

### Kịch bản 2: Cảnh báo và xử lý khi thùng rác bị đầy
1. Phân loại liên tục vào cùng một thùng cho đến khi mức đầy $\ge 80\%$: Xuất hiện cảnh báo màu vàng.
2. Khi mức đầy đạt $\ge 90\%$: ESP32 kích hoạt trạng thái **BIN_FULL_STOP** (băng chuyền dừng, còi và đèn đỏ cảnh báo bật, khóa phân loại). Web Dashboard lập tức hiển thị banner đỏ và khóa an toàn.
3. Nhấn nút **Đặt lại thùng chứa** (`btnEmptyBin` trên Web hoặc GPIO 12 trên Wokwi): Mức đầy được reset về 0%, cảnh báo tắt, hệ thống tiếp tục hoạt động.

### Kịch bản 3: Kích hoạt dừng khẩn cấp (Emergency Stop)
1. Trong lúc hệ thống đang chạy, nhấn nút **Dừng khẩn cấp (E-Stop)** (`btnEmergency` trên Web hoặc GPIO 33 trên Wokwi).
2. Toàn bộ băng chuyền dừng ngay lập tức, Servo về gốc (90°), còi và LED đỏ cảnh báo liên tục. Web hiển thị banner cảnh báo dừng khẩn cấp.
3. Nhấn lại nút **Dừng khẩn cấp (E-Stop)** một lần nữa để mở khóa an toàn và cho hệ thống hoạt động lại.

### Kịch bản 4: Chạy tự động thử nghiệm (Live Auto-Test Feeder)
1. Mở Web Dashboard và đảm bảo đã kết nối với Wokwi/mạch ESP32.
2. Nhấn nút **🎲 Tự động thử nghiệm** ở bảng điều khiển:
   - Web sẽ tự động phát sinh rác ngẫu nhiên và gửi lệnh MQTT trực tiếp tới ESP32 theo chu kỳ **3.8 giây/vật**.
   - Mạch ESP32 tiếp nhận lệnh, điều khiển servo gạt rác liên tục, và gửi telemetry cập nhật mức đầy thùng thời gian thực.
   - Nút chuyển sang trạng thái **⏹️ Dừng thử nghiệm** (sáng màu cam).
   - *Cơ chế an toàn:* Nếu hệ thống phát hiện thùng đầy hoặc có lệnh dừng khẩn cấp, quá trình tự động thử nghiệm sẽ **tự động tạm dừng ngay lập tức** để bảo vệ an toàn phần cứng.
