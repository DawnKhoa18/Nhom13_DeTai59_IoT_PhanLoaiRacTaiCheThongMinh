'use strict';

const assert = require('assert');
const express = require('express');
const { ServerDatabase } = require('../db');
const { createApiRouter } = require('../api');
const { MqttIngestor } = require('../mqtt-ingestor');
const { WasteDB } = require('../../web/js/waste-db');

async function testHybridFlow() {
  console.log('>>> [INTEGRATION TEST] Kiểm thử luồng Hybrid Server-First & MQTT Ingestor...');

  // 1. Tạo mock server chạy Express + SQLite
  const db = new ServerDatabase(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(db));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // 2. Kiểm thử WasteDB ở chế độ Server
  const wasteDb = new WasteDB();
  wasteDb._checkServerHealth = async () => baseUrl;

  await wasteDb.open();
  assert.strictEqual(wasteDb.mode, 'SERVER', 'WasteDB phải kết nối thành công chế độ SERVER');
  console.log('  ✓ WasteDB tự động nhận diện và kết nối chế độ SERVER');

  // Ghi nhận rác qua WasteDB (gọi REST API)
  const rec = await wasteDb.addWasteRecord({
    material: 'ALUMINUM',
    size: 'M'
  });
  assert.strictEqual(rec.material, 'ALUMINUM');
  assert.strictEqual(rec.weightGram, 25);
  console.log('  ✓ wasteDb.addWasteRecord() lưu thành công lên Server Database');

  // Truy vấn tổng hợp
  const aggs = await wasteDb.queryAggregates();
  assert.strictEqual(aggs.length, 1);
  assert.strictEqual(aggs[0].totalCount, 1);
  assert.strictEqual(aggs[0].aluminumCount, 1);
  console.log('  ✓ wasteDb.queryAggregates() đọc thành công dữ liệu từ Server');

  // Ghi nhận đổ thùng
  const cycle = await wasteDb.recordBinCycle({
    triggerSource: 'WEB_BUTTON',
    levels: { aluminum: 50, steel: 0, plastic: 0, inspection: 0 }
  });
  assert(cycle && cycle.id, 'Phải ghi nhận được chu kỳ đổ thùng');
  console.log('  ✓ wasteDb.recordBinCycle() ghi nhận chu kỳ đổ thùng thành công');

  // Ghi nhận sự kiện an toàn
  const ev = await wasteDb.recordSystemEvent({
    eventType: 'E_STOP',
    severity: 'DANGER',
    description: 'Nút E-Stop đã bấm'
  });
  assert(ev && ev.eventType === 'E_STOP');
  console.log('  ✓ wasteDb.recordSystemEvent() ghi nhận sự kiện an toàn thành công');

  // Kiểm tra export CSV
  const csv = await wasteDb.exportCsv();
  assert(csv.includes('ALUMINUM'));
  console.log('  ✓ wasteDb.exportCsv() tải CSV từ server thành công');

  // 3. Kiểm thử MQTT Ingestor mô phỏng gói tin từ ESP32
  const ingestor = new MqttIngestor(db, { brokerUrl: 'mqtt://fake:1883' });
  
  // Giả lập nhận gói tin "Sorting completed"
  ingestor._handleTelemetry({
    state: 'IDLE',
    material: 'PLASTIC',
    size: 'L',
    increment: 20,
    confidence: 98.2,
    message: 'Sorting completed. Ready for next material.',
    bins: { aluminum: 10, steel: 0, plastic: 20, inspection: 0 }
  });

  const records = db.queryRecords();
  const plasticRec = records.find(r => r.material === 'PLASTIC');
  assert(plasticRec, 'MQTT Ingestor phải tự động ghi rác Nhựa khi nhận gói tin Sorting completed');
  assert.strictEqual(plasticRec.weightGram, 60, 'Khối lượng Nhựa L phải là 60g');
  console.log('  ✓ MqttIngestor bắt gói tin Telemetry và ghi rác tự động 24/7');

  // Dọn dẹp
  server.close();
  db.close();

  console.log('\n>>> KIỂM THỬ TÍCH HỢP HYBRID DATABASE THÀNH CÔNG 100%! <<<\n');
}

testHybridFlow().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
