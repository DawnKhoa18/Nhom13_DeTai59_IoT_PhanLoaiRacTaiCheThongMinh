'use strict';

const mqtt = require('mqtt');

class MqttIngestor {
  constructor(db, options = {}) {
    this.db = db;
    this.brokerUrl = options.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883';
    this.topicStatus = options.topicStatus || 'nhom13/recycling/status';
    this.client = null;
    this.connected = false;

    // State tracking for edge detection & deduplication
    this.lastState = null;
    this.lastEmergency = false;
    this.lastBinFull = false;
    this.lastEmptiedTs = 0;
    this.previousBins = { aluminum: 0, steel: 0, plastic: 0, inspection: 0 };
    this.recentLiveSorts = new Map(); // key: `${material}_${size}` -> timestamp
  }

  start() {
    if (this.client) return;

    console.log(`[MqttIngestor] Đang kết nối tới MQTT Broker: ${this.brokerUrl}...`);
    this.client = mqtt.connect(this.brokerUrl, {
      clientId: `server_ingestor_${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 5000
    });

    this.client.on('connect', () => {
      this.connected = true;
      console.log(`[MqttIngestor] Đã kết nối MQTT Broker thành công! Đăng ký topic: ${this.topicStatus}`);
      this.client.subscribe(this.topicStatus, { qos: 0 }, (err) => {
        if (err) {
          console.error('[MqttIngestor] Lỗi đăng ký topic:', err.message);
        } else {
          console.log(`[MqttIngestor] Đã lắng nghe dữ liệu 24/7 trên topic: ${this.topicStatus}`);
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      if (topic !== this.topicStatus) return;
      try {
        const text = payload.toString();
        const data = JSON.parse(text);
        this._handleTelemetry(data);
      } catch (err) {
        // payload không phải JSON hợp lệ, bỏ qua
      }
    });

    this.client.on('error', (err) => {
      console.warn('[MqttIngestor] Cảnh báo kết nối MQTT:', err.message);
    });

    this.client.on('close', () => {
      this.connected = false;
    });
  }

  _handleTelemetry(data) {
    const now = Date.now();
    const msg = String(data.message || '');
    const state = String(data.state || '');
    const material = String(data.material || '').trim().toUpperCase();
    const size = String(data.size || 'M').trim().toUpperCase();
    const bins = data.bins || {};

    // Cập nhật mức thùng trước khi bị reset về 0 (để ghi nhận khối lượng khi đổ thùng)
    const currentTotalBins = (bins.aluminum || 0) + (bins.steel || 0) + (bins.plastic || 0) + (bins.inspection || 0);
    if (currentTotalBins > 0) {
      this.previousBins = {
        aluminum: bins.aluminum || 0,
        steel: bins.steel || 0,
        plastic: bins.plastic || 0,
        inspection: bins.inspection || 0
      };
    }

    // 1. Ghi nhận vật thể phân loại hoàn thành ("Sorting completed")
    const isSortingCompleted = msg.includes('Sorting completed') || 
      (this.lastState === 'SORTING' && (state === 'IDLE' || state === 'WAIT_AI'));

    if (isSortingCompleted && material && material !== 'NONE' && ['ALUMINUM', 'STEEL', 'PLASTIC', 'UNKNOWN'].includes(material)) {
      const dedupKey = `${material}_${size}`;
      const lastTs = this.recentLiveSorts.get(dedupKey) || 0;
      if (now - lastTs > 2500) {
        this.recentLiveSorts.set(dedupKey, now);
        try {
          const rec = this.db.addWasteRecord({
            timestamp: now,
            material: material,
            size: size,
            volumeIncrement: data.increment || 10,
            confidence: typeof data.confidence === 'number' ? data.confidence : 96.5,
            source: 'LIVE'
          });
          console.log(`[MqttIngestor] Đã lưu rác mới: ${material} (${size}) -> ID: ${rec.id}, Khối lượng: ${rec.weightGram}g`);
        } catch (e) {
          console.error('[MqttIngestor] Lỗi lưu rác vào CSDL:', e.message);
        }
      }
    }

    // 2. Ghi nhận chu kỳ đổ thùng ("All bins emptied")
    const isBinsEmptied = msg.includes('All bins emptied') || 
      (currentTotalBins === 0 && (this.previousBins.aluminum + this.previousBins.steel + this.previousBins.plastic + this.previousBins.inspection) > 0 && (now - this.lastEmptiedTs > 5000));

    if (isBinsEmptied && (now - this.lastEmptiedTs > 4000)) {
      this.lastEmptiedTs = now;
      const levelsToRecord = Object.assign({}, this.previousBins);
      try {
        const cycle = this.db.recordBinCycle({
          timestamp: now,
          triggerSource: 'ESP32_TELEMETRY',
          levels: levelsToRecord
        });
        console.log(`[MqttIngestor] Đã ghi nhận chu kỳ đổ thùng (ID: ${cycle.id}), thu gom ước tính: ${cycle.estimatedWeightClearedKg} kg`);
      } catch (e) {
        console.error('[MqttIngestor] Lỗi ghi nhận đổ thùng:', e.message);
      }
    }

    // 3. Ghi nhận sự kiện dừng khẩn cấp (E_STOP)
    const isEmergency = data.emergency === true || msg.includes('EMERGENCY STOP') || state === 'EMERGENCY_STOPPED';
    if (isEmergency && !this.lastEmergency) {
      try {
        this.db.recordSystemEvent({
          timestamp: now,
          eventType: 'E_STOP',
          severity: 'DANGER',
          description: 'Dừng khẩn cấp kích hoạt qua phần cứng ESP32 hoặc Web'
        });
        console.log('[MqttIngestor] Đã ghi sự kiện DỪNG KHẨN CẤP (E_STOP)');
      } catch (e) {
        console.error('[MqttIngestor] Lỗi ghi sự kiện E_STOP:', e.message);
      }
    }
    this.lastEmergency = isEmergency;

    // 4. Ghi nhận sự kiện thùng đầy (BIN_FULL)
    const isBinFull = data.full === true || state === 'BIN_FULL_STOP' || msg.includes('Bin Full');
    if (isBinFull && !this.lastBinFull) {
      try {
        this.db.recordSystemEvent({
          timestamp: now,
          eventType: 'BIN_FULL',
          severity: 'WARNING',
          description: 'Thùng rác đạt ngưỡng 100%, tạm dừng phân loại'
        });
        console.log('[MqttIngestor] Đã ghi sự kiện THÙNG ĐẦY (BIN_FULL)');
      } catch (e) {
        console.error('[MqttIngestor] Lỗi ghi sự kiện BIN_FULL:', e.message);
      }
    }
    this.lastBinFull = isBinFull;

    // Cập nhật trạng thái chu kỳ trước
    this.lastState = state;
  }

  stop() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.connected = false;
      console.log('[MqttIngestor] Đã dừng MQTT Ingestor.');
    }
  }
}

module.exports = { MqttIngestor };
