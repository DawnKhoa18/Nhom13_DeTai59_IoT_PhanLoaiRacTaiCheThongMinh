# BÁO CÁO CHI TIẾT PHẦN 3: WEB DEMO, IOT VÀ DASHBOARD GIÁM SÁT
**Học phần:** Internet of Things (IoT) &bull; **Đề tài 59:** Hệ thống Phân loại Rác Tái chế Thông minh  
**Nhóm 13** &bull; **Người phụ trách:** Phạm Anh Nhật Minh  

---

## 1. TỔNG QUAN VÀ MỤC TIÊU CỦA PHẦN 3

### 1.1. Đặt vấn đề
Trong một hệ thống phân loại rác thông minh tự động công nghiệp, bên cạnh bộ điều khiển cục bộ (Edge Controller - ESP32), việc trang bị một giao diện giám sát trung tâm từ xa (Remote Supervisory Dashboard) và mô phỏng trực quan quy trình (Process Visualization) là vô cùng cần thiết. Điều này giúp:
- Người vận hành (Operator) theo dõi được trạng thái hoạt động theo thời gian thực (Real-time Monitoring) của dây chuyền băng chuyền và cơ cấu phân hướng (Servo).
- Nắm bắt tức thời kết quả nhận diện vật liệu từ mô hình AI Vision (loại rác, độ tin cậy %).
- Giám sát mức đầy của các thùng chứa rác (Nhôm, Thép, Nhựa, Kiểm tra) để chủ động điều phối dọn rác, tránh ứ đọng dây chuyền.
- Nhận cảnh báo sự cố, tình huống nguy hiểm và kích hoạt dừng khẩn cấp (Emergency Stop) từ xa.

### 1.2. Mục tiêu triển khai
- **Xây dựng Web Demo & Hoạt họa dây chuyền:** Phát triển ứng dụng Web trực quan hóa toàn bộ dây chuyền phân loại bằng HTML5 Canvas 2D mượt mà.
- **Tích hợp IoT Real-time:** Kết nối không dây giữa vi điều khiển ESP32 trong môi trường mô phỏng Wokwi và Web Dashboard thông qua giao thức truyền thông MQTT over WebSocket trên nền mạng công cộng (`broker.emqx.io`).
- **Hỗ trợ chế độ hoạt động kép (Dual-mode Architecture):**
  - *Chế độ Live IoT:* Đồng bộ dữ liệu telemetry thực từ ESP32 theo thời gian thực (< 200ms).
  - *Chế độ Offline Simulator:* Tự động sinh dữ liệu mô phỏng độc lập trên Web, phục vụ thuyết trình và demo khi không mở Wokwi hoặc phòng khi rớt mạng Internet.

---

## 2. KIẾN TRÚC HỆ THỐNG VÀ LUỒNG DỮ LIỆU IOT

### 2.1. Sơ đồ kiến trúc tổng thể
Hệ thống sử dụng mô hình Publish/Subscribe của MQTT thông qua Cloud Broker công cộng:

```
+------------------------+          MQTT (TCP 1883)          +------------------------+
|      ESP32 Controller  | --------------------------------> |     EMQX MQTT Broker   |
|   (Mô phỏng Wokwi)     | <-------------------------------- |    (broker.emqx.io)    |
+------------------------+      Topic: nhom13/.../command    +------------------------+
                                                                         |
                                                                         | MQTT over WebSocket
                                                                         | (Port 8083 / 8084)
                                                                         v
                                                             +------------------------+
                                                             |     Web Dashboard      |
                                                             |    (HTML5 / CSS / JS)  |
                                                             +------------------------+
```

### 2.2. Chi tiết kênh truyền thông và cấu hình
- **WiFi mạng Wokwi:** Mạng WiFi ảo `Wokwi-GUEST` (không bảo mật/không password) được cung cấp sẵn trong môi trường giả lập Wokwi.
- **MQTT Broker:** `broker.emqx.io`
  - Cổng TCP cho ESP32 (`PubSubClient`): Cổng `1883`.
  - Cổng WebSocket cho Trình duyệt (`mqtt.min.js`): Cổng `8083` (ws) hoặc `8084` (wss an toàn).
- **Topic MQTT:**
  - `nhom13/recycling/status`: ESP32 publish trạng thái định kỳ (1.5s/lần) và tức thời khi có sự kiện thay đổi trạng thái. Web Dashboard subscribe để cập nhật UI.
  - `nhom13/recycling/command`: Web Dashboard publish lệnh điều khiển (bắt đầu phát hiện rác, nhận diện vật liệu, dừng khẩn cấp, dọn thùng rác) để ESP32 lắng nghe và thực thi.

### 2.3. Hợp đồng dữ liệu (Data Contract - JSON Telemetry Format)
Bản tin JSON được chuẩn hóa giữa ESP32 và Web:
```json
{
  "state": "SORTING",
  "conveyor": true,
  "servoAngle": 30,
  "material": "ALUMINUM",
  "bin": "ALUMINUM BIN",
  "confidence": 96.5,
  "bins": {
    "aluminum": 30,
    "steel": 20,
    "plastic": 40,
    "inspection": 10
  },
  "emergency": false,
  "warning": false,
  "full": false,
  "message": "Sorting material..."
}
```

---

## 3. THIẾT KẾ GIAO DIỆN VÀ HOẠT HỌA WEB DEMO

### 3.1. Cấu trúc mã nguồn thư mục `web/`
- `web/index.html`: Khung cấu trúc giao diện chính, tích hợp thư viện MQTT.js qua CDN.
- `web/css/style.css`: Giao diện hiện đại mang phong cách công nghiệp tối màu (Industrial Dark UI), sử dụng CSS Grid, Flexbox, thanh tiến trình màu sắc động và hiệu ứng cảnh báo nhấp nháy.
- `web/js/animation.js`: Engine hoạt họa 2D Canvas 60 FPS:
  - Băng chuyền cuộn vân chuyển động theo trạng thái của động cơ.
  - Trạm cảm biến quang IR với tia laser đỏ đổi trạng thái khi vật thể đi qua.
  - Trạm camera AI Vision với hiệu ứng tia quét laser xanh cyan chuyển động lên xuống khi nhận diện rác.
  - Cơ cấu cánh gạt Servo SG90 quay mượt mà theo góc phân loại (30°, 70°, 110°, 150° và 90° Home).
  - Vật thể rác (lon nhôm 🥫, ốc thép 🔩, chai nhựa 🧴, rác khác ❓) di chuyển dọc băng chuyền và trượt vào các máng dẫn tương ứng.
- `web/js/mqtt-client.js`: Lớp bọc kết nối WebSocket MQTT, tự động kết nối lại (auto-reconnect), phân tích cú pháp JSON an toàn.
- `web/js/simulator.js`: Bộ sinh dữ liệu giả lập độc lập, cho phép chạy kịch bản ngẫu nhiên liên tục để demo mà không phụ thuộc phần cứng.
- `web/js/app.js`: Bộ điều phối trung tâm (Main Controller) liên kết giao diện, telemetry, bộ điều khiển và nhật ký hệ thống.

### 3.2. Các phân vùng chức năng trên giao diện
1. **Thanh Header & Status Bar:** Hiển thị tên hệ thống, nhãn trạng thái kết nối (`ONLINE`, `SIMULATOR`, `OFFLINE`) và nút chuyển đổi chế độ vận hành.
2. **Khung hoạt họa dây chuyền (Visual Belt Canvas):** Tái hiện sống động chuyển động cơ học của toàn bộ dây chuyền.
3. **Bảng chỉ số đo lường (Telemetry Metrics):**
   - Trạng thái FSM: `WAIT_MATERIAL`, `WAIT_AI`, `SORTING`, `BIN_FULL_STOP`, `EMERGENCY_STOPPED`.
   - Trạng thái động cơ băng chuyền (ĐANG CHẠY / ĐÃ DỪNG).
   - Góc quay Servo hiện tại (°).
   - Kết quả nhận diện AI và độ tin cậy (%).
4. **Giám sát mức đầy 4 thùng chứa (Bin Fill Levels):** 4 thẻ đo trực quan kèm thanh phần trăm (%) đổi màu theo 3 cấp độ: Bình thường (<80%), Cảnh báo (80-89%), Đã đầy ($\ge 90\%$).
5. **Bảng điều khiển tương tác (Remote Control Panel):** Các nút bấm cho phép kiểm thử nhanh tất cả các tình huống: Phát hiện vật thể, Phân loại 4 nhóm rác, Dọn thùng rác, Dừng khẩn cấp, Chạy tự động demo.
6. **Nhật ký sự kiện (Event Feed Log):** Lưu trữ lịch sử hoạt động có gắn nhãn thời gian thực [HH:mm:ss].

---

## 4. KỊCH BẢN KIỂM THỬ VÀ KẾT QUẢ THỰC NGHIỆM

| STT | Kịch bản kiểm thử | Hành động thực hiện | Kết quả trên Web Dashboard | Đánh giá |
| :---: | :--- | :--- | :--- | :---: |
| 1 | **Khởi động hệ thống** | Mở Web và khởi động Wokwi ESP32 | Trạng thái hiển thị `ONLINE`, FSM: `WAIT_MATERIAL`, Băng chuyền quay, Servo ở 90°. | ĐẠT |
| 2 | **Phát hiện vật thể** | Bấm nút `DETECT MATERIAL` (chân 32) hoặc nút trên Web | Băng chuyền dừng lại, FSM chuyển `WAIT_AI`, trạm camera quét laser nhận diện. | ĐẠT |
| 3 | **Phân loại Nhôm (Aluminum)** | Bấm nút `ALUMINUM` (chân 14) hoặc nút Web | FSM chuyển `SORTING`, Servo xoay về 30°, vật thể rác trượt vào thùng Nhôm, thùng Nhôm tăng 10%. | ĐẠT |
| 4 | **Phân loại Thép, Nhựa, Khác** | Lần lượt kích hoạt các nút phân loại còn lại | Servo quay đúng góc (Thép: 70°, Nhựa: 110°, Kiểm tra: 150°), mức đầy các thùng tăng tương ứng. | ĐẠT |
| 5 | **Cảnh báo thùng đầy ($\ge 90\%$)** | Tiếp tục phân loại rác cho đến khi một thùng đạt $\ge 90\%$ | Hệ thống chuyển sang `BIN_FULL_STOP`, băng chuyền dừng, Servo về Home, hiện banner cảnh báo đỏ. | ĐẠT |
| 6 | **Dọn sạch thùng rác** | Bấm nút `EMPTY BIN` (chân 12) hoặc nút trên Web | Mức đầy thùng bị đầy được reset về 0%, cảnh báo tắt, hệ thống quay lại `WAIT_MATERIAL`. | ĐẠT |
| 7 | **Dừng khẩn cấp (E-Stop)** | Bấm nút `EMERGENCY STOP` (chân 33) hoặc nút Web | Toàn bộ dây chuyền dừng ngay lập tức, FSM chuyển `EMERGENCY_STOPPED`, còi/đèn cảnh báo bật. | ĐẠT |
| 8 | **Chế độ Demo Offline** | Bấm nút "Chuyển sang Demo Offline" trên Web | Web tự động sinh chu trình phân loại mượt mà, đầy đủ animation mà không cần Wokwi. | ĐẠT |

---

## 5. NỘI DUNG 5 SLIDE THUYẾT TRÌNH POWERPOINT (PHẦN 3)

### Slide 1: Giới thiệu Phần 3 – Giám sát IoT và Web Dashboard
- **Tiêu đề:** Hệ thống Giám sát & Giao diện Demo Trực tuyến (Web Dashboard & IoT Cloud)
- **Nội dung:**
  - Vai trò của lớp ứng dụng (Application Layer) trong kiến trúc IoT công nghiệp 4 tầng.
  - Mục tiêu: Giám sát thời gian thực, điều khiển từ xa và trực quan hóa quy trình phân loại rác.
  - Người thực hiện: Phạm Anh Nhật Minh (Nhóm 13).

### Slide 2: Kiến trúc Kênh truyền Dữ liệu IoT (Wokwi &bull; Cloud MQTT &bull; Web)
- **Tiêu đề:** Kiến trúc Kết nối & Giao thức Dữ liệu
- **Nội dung:**
  - Sơ đồ kết nối: ESP32 (Wokwi WiFi) $\rightarrow$ Cloud MQTT Broker (`broker.emqx.io:1883`) $\rightarrow$ Web Browser (WebSocket `8083/8084`).
  - Giao thức chuẩn hóa: JSON Telemetry (trạng thái FSM, băng chuyền, góc servo, mức đầy 4 thùng chứa).
  - Ưu điểm: Kiến trúc Zero-Backend, truyền nhận dữ liệu thời gian thực độ trễ thấp (< 200ms).

### Slide 3: Giao diện Người dùng & Hoạt họa Băng chuyền 2D
- **Tiêu đề:** Thiết kế Giao diện Trực quan hóa Quy trình (Process Visualization)
- **Nội dung:**
  - Hoạt họa HTML5 Canvas 60 FPS: Băng chuyền chuyển động, cảm biến quang IR, camera quét laser AI Vision, cánh gạt Servo.
  - Vật thể rác di chuyển động theo từng loại: Lon nhôm, ốc thép, chai nhựa, rác không xác định.
  - Phong cách thiết kế: Dark Industrial Dashboard chuyên nghiệp, hỗ trợ responsive trên màn hình máy tính và máy tính bảng.

### Slide 4: Giám sát Mức đầy Thùng & Xử lý An toàn Khẩn cấp
- **Tiêu đề:** Giám sát Mức đầy Thùng Chứa & Cảnh báo An toàn
- **Nội dung:**
  - Đo lường và hiển thị trực quan mức đầy 4 thùng chứa (Nhôm, Thép, Nhựa, Kiểm tra).
  - Thuật toán cảnh báo 3 cấp độ: Bình thường (<80%), Chú ý sắp đầy (80–89%), Khóa phân loại khi đầy ($\ge 90\%$).
  - Cơ chế khóa liên động dừng khẩn cấp (Emergency Stop Interlock): Dừng tức thời, bảo đảm an toàn tuyệt đối cho người và thiết bị.

### Slide 5: Chế độ Hoạt động Kép & Kết quả Đạt được
- **Tiêu đề:** Chế độ Vận hành Kép & Tổng kết Phần 3
- **Nội dung:**
  - Khả năng chuyển đổi linh hoạt: *Live IoT Mode* (đồng bộ Wokwi) $\longleftrightarrow$ *Offline Simulation Mode* (demo độc lập).
  - Hoàn thành đầy đủ 100% yêu cầu đề ra theo kế hoạch Giai đoạn 3.
  - Sẵn sàng tích hợp với mô hình phần cứng thật trong các giai đoạn phát triển tiếp theo.
