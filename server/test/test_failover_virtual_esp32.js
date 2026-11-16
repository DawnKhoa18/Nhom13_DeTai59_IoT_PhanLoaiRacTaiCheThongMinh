'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const express = require('express');
const { ServerDatabase } = require('../db');
const { createApiRouter } = require('../api');
const { CloudBridge } = require('../cloud-bridge');
const { VirtualEsp32Twin } = require('../virtual-esp32');

class MockMqttClient extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.subscriptions = new Set();
    this.published = [];
    this.ended = false;
  }

  subscribe(topics, opts, cb) {
    const list = Array.isArray(topics) ? topics : [topics];
    list.forEach((t) => this.subscriptions.add(t));
    if (typeof opts === 'function') opts(null);
    else if (typeof cb === 'function') cb(null);
  }

  publish(topic, payload) {
    this.published.push({ topic, payload: payload.toString() });
  }

  end() {
    this.ended = true;
  }
}

async function testVirtualEsp32() {
  console.log('>>> [TEST] Kiểm thử VirtualEsp32Twin & Cơ chế tự nhường quyền...');
  let mockClient = null;
  const virtualEsp = new VirtualEsp32Twin({
    brokerUrl: 'mqtt://mock-local:1883',
    mode: 'auto',
    sortingDurationMs: 60,
    heartbeatIntervalMs: 10000,
    standbyTimeoutMs: 120,
    connectFn: (url) => {
      mockClient = new MockMqttClient(url);
      return mockClient;
    }
  });

  virtualEsp.start();
  mockClient.emit('connect');
  assert.strictEqual(virtualEsp.active, false, 'Ban đầu phải ở trạng thái Standby');
  console.log('  ✓ Khởi động ở chế độ auto -> Standby chờ mạch thật');

  // Chờ vượt standbyTimeoutMs (120ms) mà không có mạch thật -> tự kích hoạt
  await new Promise((r) => setTimeout(r, 1100));
  assert.strictEqual(virtualEsp.active, true, 'Sau standbyTimeout phải tự kích hoạt khi không có mạch thật');
  console.log('  ✓ Tự động kích hoạt khi quá thời gian chờ không thấy Wokwi/ESP32');

  // Gửi lệnh phân loại ALUMINUM:L
  mockClient.emit('message', 'nhom13/recycling/command', Buffer.from('ALUMINUM:L'));
  assert.strictEqual(virtualEsp.state, 'SORTING');
  assert.strictEqual(virtualEsp.servoAngle, 30);
  assert.strictEqual(virtualEsp.currentIncrement, 20);

  // Chờ hoàn thành sorting (60ms)
  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(virtualEsp.state, 'WAIT_MATERIAL');
  assert.strictEqual(virtualEsp.servoAngle, 90);
  assert.strictEqual(virtualEsp.bins.aluminum, 20, 'Thùng nhôm phải tăng +20% cho cỡ L');
  const completedMsg = mockClient.published.find((p) => p.payload.includes('Sorting completed'));
  assert(completedMsg, 'Phải phát bản tin Sorting completed');
  assert.strictEqual(JSON.parse(completedMsg.payload).virtual, true);
  console.log('  ✓ Xử lý lệnh ALUMINUM:L -> gạt 30° -> cộng 20% -> về HOME 90° chuẩn FSM');

  // Test EMERGENCY
  mockClient.emit('message', 'nhom13/recycling/command', Buffer.from('EMERGENCY'));
  assert.strictEqual(virtualEsp.state, 'EMERGENCY_STOPPED');
  assert.strictEqual(virtualEsp.conveyor, false);
  mockClient.emit('message', 'nhom13/recycling/command', Buffer.from('EMERGENCY'));
  assert.strictEqual(virtualEsp.state, 'WAIT_MATERIAL');
  assert.strictEqual(virtualEsp.conveyor, true);
  console.log('  ✓ Xử lý E-Stop bật/tắt an toàn');

  // Test FULL BIN (>= 90%)
  virtualEsp.bins.steel = 90;
  mockClient.emit('message', 'nhom13/recycling/command', Buffer.from('STEEL:M'));
  assert.strictEqual(virtualEsp.state, 'BIN_FULL_STOP');
  assert.strictEqual(virtualEsp.conveyor, false);
  mockClient.emit('message', 'nhom13/recycling/command', Buffer.from('EMPTY_BIN'));
  assert.strictEqual(virtualEsp.bins.steel, 0);
  assert.strictEqual(virtualEsp.state, 'WAIT_MATERIAL');
  console.log('  ✓ Xử lý chặn thùng đầy >= 90% và EMPTY_BIN về 0%');

  // Test tự nhường quyền khi thấy mạch thật (!data.virtual)
  mockClient.emit('message', 'nhom13/recycling/status', Buffer.from(JSON.stringify({
    state: 'WAIT_MATERIAL',
    broker: 'cloud-emqx',
    message: 'System ready.'
  })));
  assert.strictEqual(virtualEsp.active, false, 'Phải tự nhường quyền ngay lập tức khi có mạch ESP32/Wokwi thật');
  console.log('  ✓ Tự động nhường quyền (STANDBY) ngay khi có tín hiệu mạch ESP32/Wokwi thật');

  virtualEsp.stop();
}

async function testCloudBridgeAndApi() {
  console.log('>>> [TEST] Kiểm thử CloudBridge (2 chiều + Anti-Loop + Failover) & REST API...');
  const clientsByUrl = {};
  const bridge = new CloudBridge({
    localUrl: 'mqtt://mock-local:1883',
    cloudUrls: ['mqtt://cloud-1:1883', 'mqtt://cloud-2:1883'],
    connectFn: (url) => {
      const c = new MockMqttClient(url);
      clientsByUrl[url] = c;
      return c;
    }
  });

  bridge.start();
  const localC = clientsByUrl['mqtt://mock-local:1883'];
  const cloud1C = clientsByUrl['mqtt://cloud-1:1883'];
  localC.emit('connect');
  cloud1C.emit('connect');

  assert.strictEqual(bridge.localConnected, true);
  assert.strictEqual(bridge.cloudConnected, true);
  assert(cloud1C.subscriptions.has('nhom13/recycling/status'));
  assert(!cloud1C.subscriptions.has('nhom13/recycling/command'), 'Cloud client không subscribe command -> chống lặp 100%');
  assert(localC.subscriptions.has('nhom13/recycling/command'));
  assert(!localC.subscriptions.has('nhom13/recycling/status'), 'Local client không subscribe status -> chống lặp 100%');

  // Test Cloud status -> Local status
  const statusPayload = JSON.stringify({ state: 'WAIT_MATERIAL', broker: 'cloud-emqx' });
  cloud1C.emit('message', 'nhom13/recycling/status', Buffer.from(statusPayload));
  assert.strictEqual(localC.published.length, 1);
  assert.strictEqual(localC.published[0].topic, 'nhom13/recycling/status');

  // Test không đẩy bản tin virtual lên local từ cloud
  cloud1C.emit('message', 'nhom13/recycling/status', Buffer.from(JSON.stringify({ virtual: true })));
  assert.strictEqual(localC.published.length, 1);

  // Test Local command -> Cloud command
  localC.emit('message', 'nhom13/recycling/command', Buffer.from('PLASTIC:S'));
  assert.strictEqual(cloud1C.published.length, 1);
  assert.strictEqual(cloud1C.published[0].topic, 'nhom13/recycling/command');
  assert.strictEqual(cloud1C.published[0].payload, 'PLASTIC:S');
  console.log('  ✓ Đồng bộ 2 chiều Cloud status -> Local & Local command -> Cloud (0 lặp vòng)');

  // Test Failover sang cloud-2 khi cloud-1 lỗi 2 lần
  cloud1C.emit('error', new Error('ETIMEDOUT'));
  assert.strictEqual(bridge.cloudIndex, 0);
  await new Promise((r) => setTimeout(r, 3100));
  const cloud1Retry = clientsByUrl['mqtt://cloud-1:1883'];
  cloud1Retry.emit('error', new Error('ETIMEDOUT'));
  assert.strictEqual(bridge.cloudIndex, 1, 'Sau 2 lần lỗi phải tự chuyển sang Cloud dự phòng #2');
  assert.strictEqual(bridge.currentCloudUrl, 'mqtt://cloud-2:1883');
  console.log('  ✓ Auto-Failover từ Cloud #1 sang Cloud #2 hoạt động chính xác');

  // Test API /api/mqtt-status & /api/virtual-esp32
  const db = new ServerDatabase(':memory:');
  const virtualMock = new VirtualEsp32Twin({ mode: 'auto', connectFn: () => new MockMqttClient('mqtt://mock:1883') });
  virtualMock.start();

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(db, { cloudBridge: bridge, virtualEsp32: virtualMock }));
  const server = app.listen(0);
  const port = server.address().port;

  const statusRes = await fetch(`http://127.0.0.1:${port}/api/mqtt-status`).then((r) => r.json());
  assert.strictEqual(statusRes.status, 'ok');
  assert.strictEqual(statusRes.bridge.cloudBroker, 'mqtt://cloud-2:1883');
  assert.strictEqual(statusRes.virtualEsp32.mode, 'auto');

  const toggleRes = await fetch(`http://127.0.0.1:${port}/api/virtual-esp32`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'off' })
  }).then((r) => r.json());
  assert.strictEqual(toggleRes.status, 'ok');
  assert.strictEqual(toggleRes.data.mode, 'off');

  const badRes = await fetch(`http://127.0.0.1:${port}/api/virtual-esp32`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'invalid' })
  });
  assert.strictEqual(badRes.status, 400);
  console.log('  ✓ API GET /api/mqtt-status & POST /api/virtual-esp32 hoạt động đúng');

  server.close();
  virtualMock.stop();
  bridge.stop();
  db.close();
}

(async () => {
  await testVirtualEsp32();
  await testCloudBridgeAndApi();
  console.log('\n>>> TẤT CẢ KIỂM THỬ FAILOVER + BRIDGE + VIRTUAL ESP32 VƯỢT QUA 100%! <<<\n');
})().catch((err) => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
