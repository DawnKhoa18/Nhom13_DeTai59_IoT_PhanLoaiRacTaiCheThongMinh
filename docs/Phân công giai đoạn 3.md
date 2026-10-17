**NHÓM 13 – ĐỀ TÀI 59**

**PHÂN CÔNG CÔNG VIỆC GIAI ĐOẠN 3**

*Phân loại rác tái chế thông minh tích hợp IoT*

Phân công dưới đây được điều chỉnh theo hướng kết hợp Wokwi và Web Demo. Phần của Khoa được giữ nguyên; phần của Liêm và Minh được điều chỉnh để phù hợp với giới hạn mô phỏng của Wokwi và vẫn có thể tích hợp thành một hệ thống demo thống nhất.

# **1\. Phân công chính**

| Thành viên | Phần phụ trách | Sản phẩm chính |
| ----- | ----- | ----- |
| Võ Đăng Khoa | Phần 1 – Mô hình giả lập và phần cứng | Wokwi, sơ đồ kết nối, phần cứng giả lập |
| Đỗ Quang Liêm | Phần 2 – Lập trình điều khiển hệ thống | Code ESP32/PlatformIO \+ Wokwi |
| Phạm Anh Nhật Minh | Phần 3 – Web Demo, IoT và Dashboard | Web HTML/CSS/JS \+ giao diện giám sát |

# **2\. Võ Đăng Khoa – Phần 1: Mô hình giả lập và phần cứng**

## **Mô hình giả lập**

* Thiết kế bố trí băng chuyền, nguồn và kết cấu mô hình giả lập.  
* Kết nối ESP32, cảm biến quang/IR, Servo và động cơ băng chuyền.  
* Bố trí 4 đầu ra: Nhôm, Sắt/Thép, Nhựa, Reject.  
* Kiểm tra hoạt động cơ cấu gạt, nguồn và tín hiệu thiết bị.

## **Báo cáo Word**

* Công cụ/môi trường giả lập; danh sách và thông số thiết bị.  
* Sơ đồ kết nối phần cứng, mô tả thiết kế băng chuyền.  
* Ảnh chụp và kết quả kiểm tra phần cứng.

## **PowerPoint**

* 4–5 slide: thiết bị, sơ đồ kết nối, mô hình và kiểm tra phần cứng.

# **3\. Đỗ Quang Liêm – Phần 2: Lập trình điều khiển và xử lý hệ thống**

Liêm phụ trách chương trình điều khiển chạy trên ESP32 trong PlatformIO/Wokwi. Camera AI không cần mô phỏng trực tiếp trong Wokwi; kết quả nhận dạng được mô phỏng bằng các nút Nhôm, Sắt/Thép, Nhựa và Không xác định.

## **Mô hình giả lập và lập trình**

* Lập trình ESP32 nhận tín hiệu Detect Material từ Push Button để mô phỏng cảm biến IR phát hiện vật liệu.  
* Điều khiển Stepper Motor thông qua A4988 để mô phỏng băng chuyền chạy/dừng.  
* Đọc các nút mô phỏng kết quả AI: Aluminum, Steel, Plastic và Unknown.  
* Điều khiển Servo theo kết quả phân loại để đưa vật liệu đến đúng khu vực.  
* Đọc 4 cảm biến HC-SR04 để theo dõi mức đầy của khu vực Nhôm, Sắt/Thép, Nhựa và Kiểm tra.  
* Xử lý Emergency Stop: dừng băng chuyền, dừng quá trình phân loại và kích hoạt LED/Buzzer cảnh báo.  
* Tạo các trạng thái cần gửi sang Web Demo: conveyor, material, servoPosition, fillLevel, emergency và warning.  
* Phối hợp với Minh để thống nhất định dạng dữ liệu trao đổi giữa ESP32/Wokwi và Web Demo.

## **Báo cáo Word**

* Lưu đồ thuật toán và nguyên lý hoạt động của chương trình điều khiển.  
* Bảng chân GPIO và mô tả chức năng từng thiết bị trong code.  
* Các trường hợp kiểm thử: Nhôm, Sắt/Thép, Nhựa, Không xác định, mức đầy và Emergency Stop.  
* Kết quả chạy thử trên Wokwi và ảnh chụp trạng thái thiết bị.

## **PowerPoint**

* 4–5 slide: thuật toán điều khiển, xử lý phân loại, băng chuyền, mức đầy và Emergency Stop.

# **4\. Phạm Anh Nhật Minh – Phần 3: Web Demo, IoT và Dashboard**

Minh chuyển trọng tâm từ mô phỏng ESP32-CAM/OV2640 trực tiếp trên Wokwi sang Web Demo. Web Demo dùng để minh họa trực quan dây chuyền phân loại, trạng thái hệ thống và Dashboard. Camera \+ AI được thể hiện ở mức mô phỏng kết quả nhận dạng.

## **Web Demo và mô phỏng quy trình**

* Xây dựng Web Demo bằng HTML/CSS/JavaScript mô phỏng dây chuyền phân loại.  
* Hiển thị vật liệu di chuyển trên băng chuyền qua vùng phát hiện và khu vực nhận dạng AI.  
* Mô phỏng kết quả AI: Nhôm, Sắt/Thép, Nhựa và Không xác định.  
* Mô phỏng cơ cấu phân loại đưa vật liệu đến 4 khu vực đầu ra tương ứng.  
* Hiển thị mức đầy của 4 khu vực chứa dựa trên dữ liệu mô phỏng từ HC-SR04.  
* Hiển thị trạng thái băng chuyền, trạng thái Servo, cảnh báo đầy, Emergency Stop và cảnh báo an toàn.  
* Thiết kế Dashboard có khu vực trạng thái hệ thống, kết quả nhận dạng, mức đầy và cảnh báo.

## **Kết nối IoT giữa Wokwi và Web**

* Thống nhất với Liêm định dạng dữ liệu truyền giữa ESP32 và Web.  
* Ưu tiên kết nối bằng HTTP, WebSocket hoặc MQTT tùy mức độ triển khai thực tế.  
* Nếu tích hợp trực tiếp hoàn thành, Web nhận trạng thái từ chương trình ESP32 và cập nhật animation/Dashboard theo dữ liệu.  
* Nếu chưa kịp tích hợp realtime, Web vẫn chạy độc lập theo cùng logic và cùng bộ trạng thái với Wokwi để phục vụ demo.

## **Báo cáo Word**

* Mô tả kiến trúc Web Demo và luồng dữ liệu từ ESP32/Wokwi đến giao diện.  
* Mô tả dữ liệu đầu vào/đầu ra của phần AI mô phỏng và Dashboard.  
* Mô tả HTTP/WebSocket/MQTT nếu nhóm triển khai kết nối thật.  
* Ảnh chụp giao diện, các tình huống demo và kết quả thử nghiệm.

## **PowerPoint**

* 4–5 slide: Web Demo, luồng dữ liệu, Dashboard, cảnh báo và kết quả tích hợp với Wokwi.

# **5\. Công việc chung của cả nhóm**

* Thống nhất tên trạng thái và dữ liệu giữa ba phần: material, confidence (nếu có), conveyor, servoPosition, fillLevel, emergency và warning.  
* Tích hợp theo chuỗi: mô hình Wokwi → code điều khiển → Web Demo/Dashboard.  
* Kiểm thử các tình huống: Nhôm, Sắt/Thép, Nhựa, Không xác định, khu vực chứa gần đầy và Emergency Stop.  
* Chuẩn bị ảnh chụp, video demo, nội dung Word và slide của từng người; sau đó ghép thành bản chung.  
* Ghi rõ trong báo cáo rằng IR, camera AI và động cơ băng chuyền được mô phỏng bằng phương án thay thế do giới hạn của Wokwi.

# **6\. Tiến độ thực hiện đề xuất**

| Thời gian | Kết quả cần có |
| :---: | ----- |
| Tuần 1 | Khoa hoàn thiện Wokwi; Liêm chốt GPIO và cấu trúc code; Minh dựng khung Web Demo. |
| Tuần 2 | Liêm hoàn thiện logic thiết bị; Minh hoàn thiện animation dây chuyền và Dashboard. |
| Tuần 3 | Tích hợp Wokwi/ESP32 với Web bằng HTTP/WebSocket/MQTT nếu khả thi; chạy các tình huống kiểm thử. |
| Tuần 4 | Hoàn thiện Word, PowerPoint, ảnh/video demo và tập thuyết trình. |

**Lưu ý:** ESP32-CAM/OV2640 và IR Sensor không được mô phỏng trực tiếp đúng chức năng trên Wokwi trong phương án hiện tại. Nhóm dùng nút/tín hiệu để mô phỏng đầu vào IR và kết quả AI; DC Motor \+ L298N được thay bằng Stepper Motor \+ A4988 trong Wokwi. Các thay thế này chỉ áp dụng cho mô phỏng, không thay đổi thiết kế phần cứng thực tế của đề tài.