# Hệ Thống IoT Phân Loại Rác Tái Chế Thông Minh (Đề Tài 59 - Nhóm 13)

Dự án IoT mô phỏng dây chuyền phân loại rác tái chế (Nhôm, Sắt/Thép, Nhựa, Không xác định) sử dụng vi điều khiển ESP32, mô phỏng Wokwi và giám sát thời gian thực qua Web Dashboard.

---

## 1. Các Đường Link Truy Cập

- **Web Dashboard (Docker):** [http://localhost:8088](http://localhost:8088)
- **Web Dashboard (Mở trực tiếp):** File `web/index.html`
- **Mã nguồn GitHub:** [https://github.com/DawnKhoa18/Nhom13_DeTai59_IoT_PhanLoaiRacTaiCheThongMinh](https://github.com/DawnKhoa18/Nhom13_DeTai59_IoT_PhanLoaiRacTaiCheThongMinh)
- **Thông tin MQTT Broker:**
  - **Cloud Broker (Wokwi):** `broker.emqx.io` (TCP: `1883`, WebSocket: `8083` / `8084`)
  - **Local Broker (Docker):** `localhost` (TCP: `1883`, WebSocket: `9001`)
  - **Topic trạng thái:** `nhom13/recycling/status`
  - **Topic điều khiển:** `nhom13/recycling/command`

---

## 2. Các Lệnh Khởi Chạy Toàn Bộ Project

### Cách 1: Khởi chạy bằng Docker (Nhanh & Đầy đủ nhất)

Chạy trên Terminal tại thư mục gốc của project:

```bash
# Khởi động Web Dashboard (cổng 8088) và MQTT Broker (cổng 1883, 9001)
docker compose up -d

# Biên dịch lại firmware ESP32 bằng Docker (nếu có sửa code)
docker compose run --rm firmware-builder

# Dừng toàn bộ hệ thống
docker compose down
```

*Mẹo trên Windows:* Bạn có thể nhấp đúp trực tiếp vào các file trong thư mục `scripts/`:
- `scripts/docker-start.bat`: Khởi động hệ thống và tự động mở Web.
- `scripts/docker-stop.bat`: Dừng hệ thống.
- `scripts/build-firmware.bat`: Biên dịch lại firmware.

### Cách 2: Khởi chạy mô phỏng phần cứng (Wokwi trong VS Code)

1. Mở project trong VS Code (đã cài extension **Wokwi Simulator**).
2. Mở file `diagram.json`.
3. Nhấn phím `F1` $\rightarrow$ gõ và chọn **`Wokwi: Start Simulator`**.
4. Mở Web Dashboard tại [http://localhost:8088](http://localhost:8088) để xem dữ liệu đồng bộ trực tiếp.

### Cách 3: Chạy Web độc lập (Không cần Docker)

Mở trực tiếp file `web/index.html` bằng trình duyệt web bất kỳ.

---

## 3. Các Kịch Bản Mô Phỏng Kiểm Thử (Test Cases)

Bạn có thể kiểm thử bằng cách nhấn nút trên mạch Wokwi hoặc nhấn các nút điều khiển trực tiếp trên Web Dashboard:

### Kịch bản 1: Quy trình phân loại rác bình thường
1. Nhấn nút **Phát hiện vật thể** (`btnDetect` / GPIO 32): Băng chuyền dừng, trạm AI quét nhận diện.
2. Nhấn một trong 4 nút phân loại:
   - **Nhôm (Aluminum):** Servo quay góc **30°** $\rightarrow$ rác vào thùng Nhôm $\rightarrow$ mức đầy tăng 10%.
   - **Sắt/Thép (Steel):** Servo quay góc **70°** $\rightarrow$ rác vào thùng Thép $\rightarrow$ mức đầy tăng 10%.
   - **Nhựa (Plastic):** Servo quay góc **110°** $\rightarrow$ rác vào thùng Nhựa $\rightarrow$ mức đầy tăng 10%.
   - **Không xác định (Unknown):** Servo quay góc **150°** $\rightarrow$ rác vào khu kiểm tra $\rightarrow$ mức đầy tăng 10%.
3. Sau 2 giây phân loại, Servo tự động quay về vị trí Home (**90°**), băng chuyền chạy tiếp.

### Kịch bản 2: Cảnh báo và xử lý khi thùng rác bị đầy
1. Liên tục phân loại rác vào cùng một thùng cho đến khi mức đầy $\ge 80\%$: Xuất hiện cảnh báo màu vàng.
2. Khi mức đầy đạt $\ge 90\%$: Hệ thống kích hoạt trạng thái **BIN_FULL_STOP** (băng chuyền dừng, còi và đèn đỏ cảnh báo bật, khóa phân loại).
3. Nhấn nút **Dọn thùng** (`btnEmptyBin` / GPIO 12): Mức đầy được reset về 0%, cảnh báo tắt, hệ thống tiếp tục hoạt động.

### Kịch bản 3: Kích hoạt dừng khẩn cấp (Emergency Stop)
1. Trong lúc hệ thống đang chạy, nhấn nút **DỪNG KHẨN CẤP** (`btnEmergency` / GPIO 33).
2. Toàn bộ băng chuyền dừng ngay lập tức, Servo về Home (90°), còi và LED đỏ cảnh báo liên tục.
3. Nhấn lại nút **DỪNG KHẨN CẤP** một lần nữa để mở khóa an toàn và cho hệ thống hoạt động lại.

### Kịch bản 4: Chạy tự động Demo Offline (Dùng khi thuyết trình)
1. Mở Web Dashboard: [http://localhost:8088](http://localhost:8088).
2. Nhấn nút **🎮 Chuyển sang Demo Offline** ở góc trên bên phải.
3. Nhấn **🎲 Chạy tự động demo**: Hệ thống sẽ tự động tạo chu trình rác chạy trên băng chuyền, quét laser AI, gạt servo và cập nhật mức đầy liên tục mà không cần phần cứng hay mạng internet.
