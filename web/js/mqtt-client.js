/**
 * MQTT WebSocket Client for Web Dashboard
 * Connects directly to public broker (EMQX) over WebSocket.
 */

class RecyclingMqttClient {
  constructor(options = {}) {
    this.brokerHost = options.brokerHost || 'broker.emqx.io';
    // Use secure WebSocket WSS (8084) for cloud broker (reliable across HTTPS, HTTP, and file:)
    this.brokerPort = options.brokerPort || 8084;
    this.brokerProtocol = options.protocol || 'wss';
    this.brokerPath = options.path || '/mqtt';

    this.topicStatus = options.topicStatus || 'nhom13/recycling/status';
    this.topicCommand = options.topicCommand || 'nhom13/recycling/command';

    this.brokerType = 'cloud';
    this.client = null;
    this.isConnected = false;

    // Callbacks
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onMessageReceived = options.onMessageReceived || (() => {});
    this.onError = options.onError || (() => {});
  }

  connect() {
    const clientId = 'WebDashboard-' + Math.random().toString(16).substring(2, 8);
    const url = `${this.brokerProtocol}://${this.brokerHost}:${this.brokerPort}${this.brokerPath}`;

    console.log(`[MQTT] Connecting to ${url} as ${clientId}...`);
    this.onStatusChange('CONNECTING', url, this.brokerType);

    if (typeof mqtt === 'undefined') {
      console.error('[MQTT] mqtt.js library is not loaded!');
      this.isConnected = false;
      this.onStatusChange('DISCONNECTED', null, this.brokerType);
      this.onError(new Error('Thư viện MQTT.js chưa được tải'));
      return;
    }

    try {
      this.client = mqtt.connect(url, {
        clientId: clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 4000
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log(`[MQTT] Connected to broker successfully!`);
        this.onStatusChange('CONNECTED', url, this.brokerType);

        // Subscribe to status topic
        this.client.subscribe(this.topicStatus, { qos: 0 }, (err) => {
          if (!err) {
            console.log(`[MQTT] Subscribed to ${this.topicStatus}`);
          } else {
            console.error(`[MQTT] Subscription failed:`, err);
          }
        });
      });

      this.client.on('message', (topic, message) => {
        try {
          const payloadStr = message.toString();
          const data = JSON.parse(payloadStr);
          this.onMessageReceived(topic, data);
        } catch (e) {
          console.warn('[MQTT] Non-JSON payload received:', message.toString());
        }
      });

      this.client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
        this.onStatusChange('RECONNECTING', null, this.brokerType);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.onStatusChange('DISCONNECTED', null, this.brokerType);
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Error:', err);
        this.isConnected = false;
        this.onStatusChange('DISCONNECTED', null, this.brokerType);
        this.onError(err);
      });
    } catch (e) {
      console.error('[MQTT] Connect exception:', e);
      this.isConnected = false;
      this.onStatusChange('DISCONNECTED', null, this.brokerType);
      this.onError(e);
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
      this.onStatusChange('DISCONNECTED', null, this.brokerType);
    }
  }

  switchBroker(type) {
    this.disconnect();
    this.brokerType = type;
    if (type === 'local') {
      this.brokerHost = window.location.hostname || 'localhost';
      this.brokerPort = 9001;
      this.brokerProtocol = 'ws';
      this.brokerPath = '';
    } else {
      this.brokerHost = 'broker.emqx.io';
      this.brokerPort = 8084;
      this.brokerProtocol = 'wss';
      this.brokerPath = '/mqtt';
    }
    this.connect();
  }

  sendCommand(cmd) {
    if (!this.client || !this.isConnected) {
      console.warn('[MQTT] Cannot send command, MQTT not connected.');
      return false;
    }

    const payload = typeof cmd === 'object' ? JSON.stringify(cmd) : String(cmd);
    this.client.publish(this.topicCommand, payload, { qos: 0 });
    console.log(`[MQTT] Published command to ${this.topicCommand}:`, payload);
    return true;
  }
}

window.RecyclingMqttClient = RecyclingMqttClient;
