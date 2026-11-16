'use strict';

const mqtt = require('mqtt');

const DEFAULT_CLOUD_BROKERS = [
  'mqtt://broker.emqx.io:1883',
  'mqtt://broker.hivemq.com:1883'
];

class CloudBridge {
  constructor(options = {}) {
    this.localUrl = options.localUrl || process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883';

    const envClouds = process.env.CLOUD_BROKERS
      ? process.env.CLOUD_BROKERS.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    this.cloudUrls = Array.isArray(options.cloudUrls) && options.cloudUrls.length > 0
      ? options.cloudUrls
      : (envClouds && envClouds.length > 0 ? envClouds : DEFAULT_CLOUD_BROKERS.slice());

    this.topicStatus = options.topicStatus || 'nhom13/recycling/status';
    this.topicCommand = options.topicCommand || 'nhom13/recycling/command';
    this.connectFn = options.connectFn || mqtt.connect;
    this.enabled = options.enabled !== false && process.env.CLOUD_BRIDGE_ENABLED !== 'false';

    this.localClient = null;
    this.cloudClient = null;
    this.localConnected = false;
    this.cloudConnected = false;

    this.cloudIndex = 0;
    this.cloudFailCount = 0;
    this._stopped = false;
    this._reconnectTimer = null;

    this.stats = {
      statusForwardedToLocal: 0,
      commandForwardedToCloud: 0,
      lastCloudStatusAt: 0,
      lastError: null
    };
  }

  get currentCloudUrl() {
    return this.cloudUrls[this.cloudIndex] || this.cloudUrls[0];
  }

  start() {
    if (!this.enabled) {
      console.log('[CloudBridge] Đang tắt qua cấu hình (CLOUD_BRIDGE_ENABLED=false).');
      return;
    }
    this._stopped = false;
    this._connectLocal();
    this._connectCloud();
  }

  _connectLocal() {
    if (this.localClient || this._stopped) return;

    console.log(`[CloudBridge] Kết nối Local Mosquitto: ${this.localUrl}`);
    this.localClient = this.connectFn(this.localUrl, {
      clientId: `cloud_bridge_local_${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 4000
    });

    this.localClient.on('connect', () => {
      this.localConnected = true;
      console.log('[CloudBridge] Local Mosquitto đã sẵn sàng. Lắng nghe command để đồng bộ lên Cloud...');
      this.localClient.subscribe(this.topicCommand, { qos: 0 }, (err) => {
        if (err) {
          console.warn('[CloudBridge] Lỗi subscribe command Local:', err.message);
        }
      });
    });

    // Local command -> Cloud command (chỉ chuyển tiếp 1 chiều cho command, chống lặp 100%)
    this.localClient.on('message', (topic, payload) => {
      if (topic !== this.topicCommand) return;
      if (this.cloudClient && this.cloudConnected) {
        this.cloudClient.publish(this.topicCommand, payload, { qos: 0 });
        this.stats.commandForwardedToCloud++;
      }
    });

    this.localClient.on('close', () => {
      this.localConnected = false;
    });

    this.localClient.on('error', (err) => {
      this.stats.lastError = `Local: ${err.message}`;
    });
  }

  _connectCloud() {
    if (this._stopped || !this.cloudUrls.length) return;
    if (this.cloudClient) {
      try { this.cloudClient.end(true); } catch (_) {}
      this.cloudClient = null;
    }

    const url = this.currentCloudUrl;
    console.log(`[CloudBridge] Đang kết nối Cloud Broker [${this.cloudIndex + 1}/${this.cloudUrls.length}]: ${url}`);

    const client = this.connectFn(url, {
      clientId: `cloud_bridge_remote_${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 0, // tự quản lý failover qua _scheduleCloudReconnect
      connectTimeout: 4500
    });
    this.cloudClient = client;

    client.on('connect', () => {
      if (this.cloudClient !== client || this._stopped) return;
      this.cloudConnected = true;
      this.cloudFailCount = 0;
      this.stats.lastError = null;
      console.log(`[CloudBridge] Đã nối Cloud thành công (${url}). Đang đồng bộ status -> Local Mosquitto!`);

      client.subscribe(this.topicStatus, { qos: 0 }, (err) => {
        if (err) {
          console.warn('[CloudBridge] Lỗi subscribe status Cloud:', err.message);
        }
      });
    });

    // Cloud status -> Local status (1 chiều cho status, chống lặp 100%)
    client.on('message', (topic, payload, packet) => {
      if (topic !== this.topicStatus) return;
      if (this.cloudClient !== client) return;
      if (packet && packet.retain) return; // bỏ qua tin nhắn cũ lưu kho (retained) khi vừa kết nối

      // Không chuyển ngược lại bản tin virtual nếu có ai đó vô tình gửi lên cloud
      try {
        const parsed = JSON.parse(payload.toString());
        if (parsed && parsed.virtual === true) return;
      } catch (_) {
        // payload không phải JSON hợp lệ
      }

      this.stats.lastCloudStatusAt = Date.now();
      if (this.localClient && this.localConnected) {
        this.localClient.publish(this.topicStatus, payload, { qos: 0 });
        this.stats.statusForwardedToLocal++;
      }
    });

    const handleFailure = (reason) => {
      if (this.cloudClient !== client) return;
      this.cloudConnected = false;
      if (this._stopped) return;

      if (reason) {
        this.stats.lastError = `Cloud (${url}): ${reason}`;
      }
      this.cloudFailCount++;

      // Sau 2 lần thất bại trên 1 Cloud broker -> xoay vòng sang broker dự phòng tiếp theo
      if (this.cloudFailCount >= 2 && this.cloudUrls.length > 1) {
        this.cloudFailCount = 0;
        this.cloudIndex = (this.cloudIndex + 1) % this.cloudUrls.length;
        console.warn(`[CloudBridge] Cloud (${url}) lỗi liên tiếp. Chuyển sang Cloud dự phòng: ${this.currentCloudUrl}`);
      }

      this._scheduleCloudReconnect();
    };

    client.on('error', (err) => {
      handleFailure(err ? err.message : 'connection error');
    });

    client.on('close', () => {
      handleFailure(null);
    });
  }

  _scheduleCloudReconnect() {
    if (this._stopped || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connectCloud();
    }, 3000);
  }

  getStatus() {
    return {
      enabled: this.enabled,
      localConnected: this.localConnected,
      cloudConnected: this.cloudConnected,
      cloudBroker: this.currentCloudUrl,
      cloudBrokers: this.cloudUrls,
      stats: Object.assign({}, this.stats)
    };
  }

  stop() {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.cloudClient) {
      try { this.cloudClient.end(true); } catch (_) {}
      this.cloudClient = null;
    }
    if (this.localClient) {
      try { this.localClient.end(true); } catch (_) {}
      this.localClient = null;
    }
    this.localConnected = false;
    this.cloudConnected = false;
  }
}

module.exports = { CloudBridge, DEFAULT_CLOUD_BROKERS };
