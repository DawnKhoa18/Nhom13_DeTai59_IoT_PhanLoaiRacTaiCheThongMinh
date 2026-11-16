'use strict';

const mqtt = require('mqtt');

const SERVO_MAP = {
  ALUMINUM: { angle: 30,  bin: 'ALUMINUM BIN',    binKey: 'aluminum' },
  STEEL:    { angle: 70,  bin: 'STEEL BIN',       binKey: 'steel' },
  PLASTIC:  { angle: 110, bin: 'PLASTIC BIN',     binKey: 'plastic' },
  UNKNOWN:  { angle: 150, bin: 'INSPECTION AREA', binKey: 'inspection' }
};

const SERVO_HOME = 90;
const WARNING_LEVEL = 80;
const FULL_LEVEL = 90;

class VirtualEsp32Twin {
  constructor(options = {}) {
    this.brokerUrl = options.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883';
    this.topicStatus = options.topicStatus || 'nhom13/recycling/status';
    this.topicCommand = options.topicCommand || 'nhom13/recycling/command';
    this.connectFn = options.connectFn || mqtt.connect;

    const initialMode = (options.mode || process.env.VIRTUAL_ESP32_MODE || 'auto').toLowerCase();
    this.mode = ['auto', 'on', 'off'].includes(initialMode) ? initialMode : 'auto';

    this.sortingDurationMs = Number.isFinite(options.sortingDurationMs) ? options.sortingDurationMs : 2000;
    this.heartbeatIntervalMs = Number.isFinite(options.heartbeatIntervalMs) ? options.heartbeatIntervalMs : 1500;
    this.standbyTimeoutMs = Number.isFinite(options.standbyTimeoutMs) ? options.standbyTimeoutMs : 6000;

    this.client = null;
    this.connected = false;
    this.active = false;
    this.startedAt = 0;
    this.lastRealEspSeenAt = 0;
    this.lastReason = 'Khởi tạo ở trạng thái chờ (Standby)';

    this._monitorTimer = null;
    this._heartbeatTimer = null;
    this._sortTimer = null;

    this._resetHardwareState();
  }

  _resetHardwareState() {
    this.state = 'WAIT_MATERIAL';
    this.conveyor = true;
    this.servoAngle = SERVO_HOME;
    this.currentMaterial = '';
    this.currentBin = '';
    this.currentSize = 'M';
    this.currentIncrement = 10;
    this.emergencyActive = false;
    this.bins = {
      aluminum: 0,
      steel: 0,
      plastic: 0,
      inspection: 0
    };
  }

  start() {
    if (this.client) return;
    this.startedAt = Date.now();
    console.log(`[VirtualESP32] Khởi động (chế độ=${this.mode}), kết nối ${this.brokerUrl}...`);

    this.client = this.connectFn(this.brokerUrl, {
      clientId: `virtual_esp32_docker_${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 4000
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.client.subscribe([this.topicCommand, this.topicStatus], { qos: 0 }, (err) => {
        if (err) {
          console.warn('[VirtualESP32] Lỗi subscribe:', err.message);
        }
      });

      if (this.mode === 'on') {
        this._activate('Bật thủ công chế độ dự phòng (mode=on)');
      }
    });

    this.client.on('message', (topic, payload) => {
      const text = payload.toString();
      if (topic === this.topicStatus) {
        this._onStatusSeen(text);
      } else if (topic === this.topicCommand) {
        this._onCommandReceived(text);
      }
    });

    this.client.on('close', () => {
      this.connected = false;
    });

    this.client.on('error', () => {
      // Sẽ tự reconnect
    });

    // Kiểm tra định kỳ mỗi 1s để tự bật khi thiếu mạch thật hoặc nhường khi có mạch thật
    this._monitorTimer = setInterval(() => this._evaluateAutoMode(), 1000);
  }

  _onStatusSeen(text) {
    try {
      const data = JSON.parse(text);
      if (data && data.virtual === true) {
        return; // Tin của chính Virtual ESP32
      }
      // Thấy bản tin từ Wokwi / ESP32 thật
      this.lastRealEspSeenAt = Date.now();
      if (this.active && this.mode === 'auto') {
        this._deactivate('Phát hiện mạch ESP32/Wokwi thật đang hoạt động -> tự nhường quyền');
      }
    } catch (_) {
      // Bỏ qua nếu không phải JSON
    }
  }

  _evaluateAutoMode() {
    if (!this.connected) return;
    if (this.mode === 'off') {
      if (this.active) this._deactivate('Đã tắt qua cấu hình (mode=off)');
      return;
    }
    if (this.mode === 'on') {
      if (!this.active) this._activate('Bật thủ công chế độ dự phòng (mode=on)');
      return;
    }

    // Chế độ 'auto'
    const now = Date.now();
    const silenceMs = now - Math.max(this.startedAt, this.lastRealEspSeenAt);
    if (!this.active && silenceMs >= this.standbyTimeoutMs) {
      this._activate(`Không thấy mạch ESP32/Wokwi sau ${Math.round(this.standbyTimeoutMs / 1000)}s -> tự kích hoạt dự phòng Docker`);
    }
  }

  _activate(reason) {
    if (this.active) return;
    this.active = true;
    this.lastReason = reason;
    console.log(`[VirtualESP32] ACTIVE: ${reason}`);

    this.publishTelemetry('ESP32 Online & Ready (Docker Backup)');
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => {
      if (this.active && this.connected) {
        this.publishTelemetry(null);
      }
    }, this.heartbeatIntervalMs);
  }

  _deactivate(reason) {
    if (!this.active) return;
    this.active = false;
    this.lastReason = reason;
    console.log(`[VirtualESP32] STANDBY: ${reason}`);

    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._sortTimer) {
      clearTimeout(this._sortTimer);
      this._sortTimer = null;
    }
    this._resetHardwareState();
  }

  setMode(newMode) {
    const normalized = String(newMode || '').toLowerCase();
    if (!['auto', 'on', 'off'].includes(normalized)) {
      throw new Error('Chế độ không hợp lệ. Chỉ chấp nhận: auto, on, off');
    }
    this.mode = normalized;
    if (normalized === 'off') {
      this._deactivate('Người dùng tắt chế độ dự phòng Docker');
    } else if (normalized === 'on') {
      if (this.connected) this._activate('Người dùng bật chế độ dự phòng Docker');
    } else {
      // Khi chuyển sang auto: kiểm tra nếu mới vừa có mạch thật thì về standby, chưa có thì chờ đánh giá
      const recentReal = Date.now() - this.lastRealEspSeenAt < this.standbyTimeoutMs;
      if (recentReal && this.active) {
        this._deactivate('Chuyển sang chế độ Tự động (đang có mạch thật)');
      } else {
        this._evaluateAutoMode();
      }
    }
    return this.getStatus();
  }

  _isAnyBinFull() {
    return (
      this.bins.aluminum >= FULL_LEVEL ||
      this.bins.steel >= FULL_LEVEL ||
      this.bins.plastic >= FULL_LEVEL ||
      this.bins.inspection >= FULL_LEVEL
    );
  }

  _isAnyBinWarning() {
    return (
      this.bins.aluminum >= WARNING_LEVEL ||
      this.bins.steel >= WARNING_LEVEL ||
      this.bins.plastic >= WARNING_LEVEL ||
      this.bins.inspection >= WARNING_LEVEL
    );
  }

  _onCommandReceived(rawMsg) {
    if (!this.active) return;
    const msg = String(rawMsg || '').trim();
    if (!msg) return;
    const upper = msg.toUpperCase();

    // Phân tích kích thước (:S, :M, :L) giống src/main.cpp
    let sizeStr = 'M';
    let increment = 10;
    const colonIdx = upper.indexOf(':');
    if (colonIdx >= 0) {
      const suffix = upper.slice(colonIdx + 1).trim();
      if (suffix === 'S' || suffix === 'SMALL') {
        sizeStr = 'S';
        increment = 5;
      } else if (suffix === 'L' || suffix === 'LARGE') {
        sizeStr = 'L';
        increment = 20;
      }
    }

    if (upper.includes('EMERGENCY')) {
      if (!this.emergencyActive) {
        this.emergencyActive = true;
        this.conveyor = false;
        this.servoAngle = SERVO_HOME;
        this.state = 'EMERGENCY_STOPPED';
        if (this._sortTimer) {
          clearTimeout(this._sortTimer);
          this._sortTimer = null;
        }
        this.publishTelemetry('EMERGENCY STOP ACTIVATED!');
      } else {
        this.emergencyActive = false;
        this.conveyor = true;
        this.servoAngle = SERVO_HOME;
        this.currentMaterial = '';
        this.currentBin = '';
        this.currentSize = 'M';
        this.currentIncrement = 10;
        this.state = 'WAIT_MATERIAL';
        this.publishTelemetry('Emergency reset. System ready.');
      }
      return;
    }

    if (upper.includes('EMPTY_BIN') || upper.includes('EMPTY')) {
      this.bins = { aluminum: 0, steel: 0, plastic: 0, inspection: 0 };
      this.currentMaterial = '';
      this.currentBin = '';
      if (!this.emergencyActive) {
        this.state = 'WAIT_MATERIAL';
        this.conveyor = true;
        this.servoAngle = SERVO_HOME;
      }
      this.publishTelemetry('All bins emptied. System ready.');
      return;
    }

    if (this.emergencyActive) return;

    if (upper.includes('DETECT')) {
      if (this.state === 'WAIT_MATERIAL') {
        this.conveyor = false;
        this.state = 'WAIT_AI';
        this.publishTelemetry('Material detected via Web!');
      }
      return;
    }

    const matKey = ['ALUMINUM', 'STEEL', 'PLASTIC', 'UNKNOWN'].find((m) => upper.includes(m));
    if (matKey) {
      if (this.state === 'SORTING' && this.currentMaterial) {
        // Hoàn tất nhanh vật đang gạt trước đó nếu có lệnh nối tiếp
        const prevCfg = SERVO_MAP[this.currentMaterial] || SERVO_MAP.UNKNOWN;
        this.bins[prevCfg.binKey] = Math.min(100, (this.bins[prevCfg.binKey] || 0) + this.currentIncrement);
        if (this._sortTimer) {
          clearTimeout(this._sortTimer);
          this._sortTimer = null;
        }
        this.state = 'WAIT_MATERIAL';
      }

      if (this.state === 'WAIT_AI' || this.state === 'WAIT_MATERIAL') {
        const cfg = SERVO_MAP[matKey];
        if ((this.bins[cfg.binKey] || 0) >= FULL_LEVEL) {
          this.conveyor = false;
          this.servoAngle = SERVO_HOME;
          this.state = 'BIN_FULL_STOP';
          this.publishTelemetry('WARNING: Bin Full! Sorting blocked.');
          return;
        }

        this.currentMaterial = matKey;
        this.currentBin = cfg.bin;
        this.currentSize = sizeStr;
        this.currentIncrement = increment;
        this.servoAngle = cfg.angle;
        this.conveyor = true;
        this.state = 'SORTING';
        this.publishTelemetry('Sorting material...');

        this._sortTimer = setTimeout(() => {
          this._sortTimer = null;
          if (!this.active || this.emergencyActive) return;

          this.bins[cfg.binKey] = Math.min(100, (this.bins[cfg.binKey] || 0) + this.currentIncrement);
          this.servoAngle = SERVO_HOME;
          // Đặt lại trường hiển thị cho chu kỳ chờ tiếp theo giống src/main.cpp
          this.currentMaterial = '';
          this.currentBin = '';
          this.currentSize = 'M';
          this.currentIncrement = 10;
          this.state = 'WAIT_MATERIAL';

          this.publishTelemetry('Sorting completed. Ready for next material.');
        }, this.sortingDurationMs);
      }
    }
  }

  _buildTelemetryDoc(customMsg) {
    let message = customMsg;
    if (!message) {
      if (this.state === 'EMERGENCY_STOPPED') {
        message = 'EMERGENCY STOP ACTIVATED';
      } else if (this.state === 'BIN_FULL_STOP') {
        message = 'BIN FULL! Sorting blocked.';
      } else if (this.state === 'SORTING') {
        message = `Routing material to ${this.currentBin}`;
      } else if (this.state === 'WAIT_AI') {
        message = 'Material detected, waiting for AI...';
      } else {
        message = 'System ready. Waiting for material...';
      }
    }

    return {
      state: this.state,
      conveyor: this.conveyor,
      servoAngle: this.servoAngle,
      material: this.currentMaterial,
      size: this.currentSize,
      increment: this.currentIncrement,
      bin: this.currentBin,
      confidence: (!this.currentMaterial || this.currentMaterial === 'UNKNOWN') ? 0.0 : 96.5,
      bins: Object.assign({}, this.bins),
      emergency: this.emergencyActive,
      warning: this.state === 'BIN_FULL_STOP' || this._isAnyBinWarning(),
      full: this.state === 'BIN_FULL_STOP' || this._isAnyBinFull(),
      broker: 'local-docker-virtual',
      virtual: true,
      message: message
    };
  }

  publishTelemetry(customMsg) {
    if (!this.client || !this.connected) return;
    const doc = this._buildTelemetryDoc(customMsg);
    this.client.publish(this.topicStatus, JSON.stringify(doc), { qos: 0 });
  }

  getStatus() {
    return {
      mode: this.mode,
      connected: this.connected,
      active: this.active,
      state: this.state,
      lastRealEspSeenAt: this.lastRealEspSeenAt,
      lastReason: this.lastReason
    };
  }

  stop() {
    if (this._monitorTimer) {
      clearInterval(this._monitorTimer);
      this._monitorTimer = null;
    }
    this._deactivate('Dừng dịch vụ VirtualESP32');
    if (this.client) {
      try { this.client.end(true); } catch (_) {}
      this.client = null;
    }
    this.connected = false;
  }
}

module.exports = { VirtualEsp32Twin };
