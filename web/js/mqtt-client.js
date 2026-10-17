/**
 * MQTT WebSocket Client for Web Dashboard
 * Connects directly to public broker (EMQX) over WebSocket.
 */

class RecyclingMqttClient {
  constructor(options = {}) {
    this.brokerHost = options.brokerHost || 'broker.emqx.io';
    // Use WSS (8084) if on HTTPS or WS (8083) if on HTTP/file:
    const isHttps = window.location.protocol === 'https:';
    this.brokerPort = options.brokerPort || (isHttps ? 8084 : 8083);
    this.brokerProtocol = options.protocol || (isHttps ? 'wss' : 'ws');
    this.brokerPath = options.path || '/mqtt';

    this.topicStatus = options.topicStatus || 'nhom13/recycling/status';
    this.topicCommand = options.topicCommand || 'nhom13/recycling/command';

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
    this.onStatusChange('CONNECTING', url);

    try {
      this.client = mqtt.connect(url, {
        clientId: clientId,
        clean: true,
        connectTimeout: 6000,
        reconnectPeriod: 4000
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log(`[MQTT] Connected to broker successfully!`);
        this.onStatusChange('CONNECTED', url);

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
        this.onStatusChange('RECONNECTING');
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.onStatusChange('DISCONNECTED');
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Error:', err);
        this.onError(err);
      });
    } catch (e) {
      console.error('[MQTT] Connect exception:', e);
      this.onError(e);
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
      this.onStatusChange('DISCONNECTED');
    }
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
