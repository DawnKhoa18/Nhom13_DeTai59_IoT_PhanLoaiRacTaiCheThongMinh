'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { ServerDatabase } = require('./db');
const { createApiRouter } = require('./api');
const { MqttIngestor } = require('./mqtt-ingestor');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/smart_recycling.db');
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883';

console.log('=====================================================');
console.log(' [BACKEND] SMART RECYCLING IOT SERVER & DATABASE');
console.log('=====================================================');
console.log(`- Database path : ${DB_PATH}`);
console.log(`- MQTT Broker   : ${MQTT_BROKER_URL}`);
console.log(`- HTTP API Port : ${PORT}`);

// 1. Khởi tạo Cơ sở dữ liệu SQLite
const db = new ServerDatabase(DB_PATH);

// 2. Khởi tạo Express Server
const app = express();
app.use(cors());
app.use(express.json());

// Gắn API Router
app.use('/api', createApiRouter(db));

// Root info
app.get('/', (req, res) => {
  res.json({
    service: 'Smart Recycling IoT Backend Server',
    status: 'running',
    endpoints: {
      health: '/api/health',
      configs: '/api/configs',
      stats: '/api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD',
      records: '/api/records',
      exportCsv: '/api/export-csv'
    }
  });
});

// 3. Khởi chạy HTTP Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] API Server sẵn sàng lắng nghe tại http://0.0.0.0:${PORT}`);
});

// 4. Khởi chạy MQTT Ingestor (lắng nghe bản tin từ ESP32 24/7)
const ingestor = new MqttIngestor(db, {
  brokerUrl: MQTT_BROKER_URL,
  topicStatus: 'nhom13/recycling/status'
});
ingestor.start();

// 5. Quản lý dừng tiến trình an toàn (Graceful Shutdown)
function shutdown(signal) {
  console.log(`\n[Shutdown] Nhận tín hiệu ${signal}. Đang đóng các kết nối...`);
  ingestor.stop();
  server.close(() => {
    db.close();
    console.log('[Shutdown] Hoàn tất tắt dịch vụ sạch sẽ.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server, db, ingestor };
