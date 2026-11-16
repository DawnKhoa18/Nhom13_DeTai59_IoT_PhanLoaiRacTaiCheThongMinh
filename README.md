# Hệ thống IoT phân loại rác tái chế thông minh (Đề tài 59 - Nhóm 13)

Dự án mô phỏng dây chuyền phân loại rác tái chế (nhôm, sắt và thép, nhựa, rác khác) sử dụng vi điều khiển ESP32 trên Wokwi và giám sát trực tuyến qua giao diện web.

---

## 1. Thông tin kết nối

- Giao diện web qua Docker: http://localhost:8088
- Giao diện web mở trực tiếp: web/index.html
- Máy chủ dữ liệu và API: http://localhost:3000/api
- Kênh trạng thái MQTT: nhom13/recycling/status
- Kênh điều khiển MQTT: nhom13/recycling/command
- Máy chủ MQTT đám mây chính: `broker.emqx.io` (TCP cổng 1883, WebSocket cổng 8084)
- Máy chủ MQTT đám mây dự phòng: `broker.hivemq.com` (TCP cổng 1883, WebSocket cổng 8884)
- Máy chủ MQTT cục bộ Docker: `localhost` (TCP cổng 1883, WebSocket cổng 9001)

---

## 2. Cơ chế Dự phòng 3 Lớp (Không cần sửa code khi đổi môi trường)

1. **Tự động chuyển kênh trên ESP32**: Firmware [`src/main.cpp`](src/main.cpp) tự động thử lần lượt `broker.emqx.io` → `broker.hivemq.com` → `host.wokwi.internal` khi có sự cố (mặc định `#define PREFER_LOCAL_BROKER 0` để dùng tốt trên Wokwi miễn phí).
2. **Cầu nối đồng bộ Cloud ↔ Local (`CloudBridge`)**: Container `backend-server` tự đồng bộ hai chiều giữa Đám mây và Mosquitto Docker. Nhờ đó, dù chạy Wokwi bản miễn phí nối lên Đám mây, bạn vẫn có thể mở Web ở chế độ **Cục bộ Docker (`Mosquitto :9001`)** bình thường.
3. **Mạch ESP32 Dự phòng trong Docker (`VirtualEsp32Twin`)**: Mặc định ở chế độ `auto` (tự nhường quyền 100% khi có Wokwi/ESP32 thật). Nếu mất Internet hoàn toàn hoặc quá 6 giây không thấy mạch thật, Docker tự kích hoạt mạch dự phòng để hệ thống luôn hoạt động.

---

## 3. Cách chạy môi trường cục bộ với Docker (Khuyến nghị)

1. Mở terminal tại thư mục gốc của dự án và chạy:

```bash
# Khởi động giao diện web (8088), máy chủ MQTT (1883, 9001) và máy chủ dữ liệu (3000)
docker compose up -d

# Biên dịch lại mã nguồn ESP32 bằng Docker khi có thay đổi
docker compose run --rm firmware-builder

# Kiểm tra trạng thái các dịch vụ đang chạy
docker compose ps

# Dừng toàn bộ hệ thống
docker compose down
```

2. Mở `diagram.json` trong VS Code, nhấn `F1` và chọn `Wokwi: Start Simulator`. *(Nếu chạy ESP32 phần cứng thật qua mạng LAN hoặc có Wokwi Club Private Gateway, có thể đặt `#define PREFER_LOCAL_BROKER 1` trong `src/main.cpp` để ưu tiên kết nối cục bộ trước).*
3. Mở trình duyệt tại http://localhost:8088 và chọn bất kỳ kênh nào (`EMQX`, `HiveMQ dự phòng`, hoặc `Mạch cục bộ Docker`).

---

## 4. Lệnh chạy nhanh trên Windows

Có thể chạy trực tiếp các tệp trong thư mục `scripts`:

```bat
:: Khởi động hệ thống Docker và tự động mở giao diện web
scripts\docker-start.bat

:: Dừng toàn bộ hệ thống Docker
scripts\docker-stop.bat

:: Biên dịch lại mã nguồn ESP32
scripts\build-firmware.bat
```
