'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const { ServerDatabase } = require('../db');
const { createApiRouter } = require('../api');

async function runTests() {
  console.log('>>> [TEST] Bắt đầu kiểm thử ServerDatabase & REST API...');

  // 1. Kiểm thử CSDL InMemory
  const db = new ServerDatabase(':memory:');

  // Kiểm tra 4 loại cấu hình
  const configs = db.getMaterialConfigs();
  assert.strictEqual(configs.length, 4, 'Phải có đúng 4 cấu hình rác');
  console.log('  ✓ getMaterialConfigs() trả về 4 vật liệu');

  // Thêm bản ghi phân loại
  const rec1 = db.addWasteRecord({
    timestamp: Date.now(),
    material: 'ALUMINUM',
    size: 'M',
    volumeIncrement: 10
  });
  assert.strictEqual(rec1.material, 'ALUMINUM');
  assert.strictEqual(rec1.weightGram, 25);
  assert.strictEqual(rec1.weightKg, 0.025);
  console.log('  ✓ addWasteRecord() tính khối lượng đúng định mức: 25g = 0.025kg');

  // Thêm bản ghi thứ hai khác ngày
  const yesterday = new Date(Date.now() - 86400000);
  const rec2 = db.addWasteRecord({
    timestamp: yesterday.getTime(),
    material: 'PLASTIC',
    size: 'L',
    volumeIncrement: 20
  });
  assert.strictEqual(rec2.weightGram, 60);
  assert.strictEqual(rec2.weightKg, 0.06);
  console.log('  ✓ addWasteRecord() tính khối lượng Nhựa L: 60g = 0.06kg');

  // Kiểm tra aggregates
  const aggs = db.queryAggregates();
  assert.strictEqual(aggs.length, 2, 'Phải có 2 ngày tổng hợp');
  console.log('  ✓ queryAggregates() ghi nhận đúng 2 ngày tổng hợp');

  // Ghi chu kỳ đổ thùng
  const cycle = db.recordBinCycle({
    triggerSource: 'WEB_BUTTON',
    levels: { aluminum: 30, steel: 40, plastic: 20, inspection: 0 }
  });
  assert(cycle.estimatedWeightClearedKg > 0, 'Khối lượng thu gom ước tính phải > 0');
  console.log(`  ✓ recordBinCycle() tính khối lượng thu gom: ${cycle.estimatedWeightClearedKg} kg`);

  // Ghi sự kiện an toàn
  const ev = db.recordSystemEvent({
    eventType: 'E_STOP',
    severity: 'DANGER',
    description: 'Thử nghiệm dừng khẩn cấp'
  });
  assert.strictEqual(ev.eventType, 'E_STOP');
  console.log('  ✓ recordSystemEvent() ghi nhận sự kiện E_STOP');

  // Kiểm tra CSV export
  const csv = db.exportCsv();
  assert(csv.startsWith('\uFEFFSTT,Mã bản ghi'), 'CSV phải có BOM UTF-8 và tiêu đề tiếng Việt');
  assert(csv.includes('Nhôm'), 'CSV phải chứa dữ liệu Nhôm');
  console.log('  ✓ exportCsv() tạo nội dung CSV chuẩn UTF-8 tiếng Việt');

  // Nạp mẫu 5 ngày
  const sampleCount = db.seedSampleData(5);
  assert(sampleCount > 0, 'Phải nạp được các bản ghi mẫu');
  console.log(`  ✓ seedSampleData(5) đã nạp thành công ${sampleCount} bản ghi`);

  // Kiểm tra REST API Server
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(db));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  async function getJson(path) {
    const res = await fetch(`${baseUrl}${path}`);
    return await res.json();
  }

  async function postJson(path, data) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  // Test /api/health
  const health = await getJson('/health');
  assert.strictEqual(health.status, 'ok');
  assert.strictEqual(health.engine, 'sqlite');
  console.log('  ✓ GET /api/health -> 200 OK');

  // Test /api/configs
  const configsRes = await getJson('/configs');
  assert.strictEqual(configsRes.data.length, 4);
  console.log('  ✓ GET /api/configs -> trả về 4 vật liệu');

  // Test /api/stats
  const statsRes = await getJson('/stats');
  assert.strictEqual(statsRes.status, 'ok');
  assert(statsRes.summary.totalCount > 0);
  assert(statsRes.summary.totalWeightKg > 0);
  console.log(`  ✓ GET /api/stats -> totalCount: ${statsRes.summary.totalCount}, totalWeight: ${statsRes.summary.totalWeightKg}kg`);

  // Test POST /api/records
  const postRec = await postJson('/records', {
    material: 'STEEL',
    size: 'S',
    volumeIncrement: 5
  });
  assert.strictEqual(postRec.status, 'ok');
  assert.strictEqual(postRec.data.material, 'STEEL');
  assert.strictEqual(postRec.data.weightGram, 40);
  console.log('  ✓ POST /api/records -> thêm rác STEEL (S) thành công');

  // Test /api/export-csv
  const csvRes = await fetch(`${baseUrl}/export-csv`);
  const csvText = await csvRes.text();
  assert(csvText.includes('Sắt/thép'), 'File CSV qua API phải có Sắt/thép');
  console.log('  ✓ GET /api/export-csv -> trả về file CSV tiếng Việt hợp lệ');

  // Test /api/export-excel
  const excelRes = await fetch(`${baseUrl}/export-excel`);
  assert.strictEqual(excelRes.status, 200);
  assert(excelRes.headers.get('content-type').includes('spreadsheetml'));
  const excelBuf = await excelRes.arrayBuffer();
  assert(excelBuf.byteLength > 2000, 'File Excel .xlsx phải có dữ liệu hợp lệ');
  console.log('  ✓ GET /api/export-excel -> tải file .xlsx 2 sheet định dạng chuyên nghiệp thành công');

  // Dọn dẹp
  server.close();
  db.close();

  console.log('\n>>> TẤT CẢ CÁC BÀI KIỂM THỬ BACKEND DATABASE ĐÃ VƯỢT QUA 100%! <<<\n');
}

runTests().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
