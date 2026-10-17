/**
 * Main Application Controller for Web Dashboard
 * Manages UI interactions, MQTT Telemetry, Conveyor Animation, and Simulation Mode.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Animation Engine
  const anim = new ConveyorAnimation('conveyorCanvas');

  // 2. Global state & mode
  let currentMode = 'LIVE'; // 'LIVE' (MQTT from Wokwi) or 'SIMULATOR' (Offline)
  let lastState = 'WAIT_MATERIAL';

  // 3. UI Element references
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const btnToggleMode = document.getElementById('btnToggleMode');

  const alertBanner = document.getElementById('alertBanner');
  const alertText = document.getElementById('alertText');

  const badgeSystemState = document.getElementById('badgeSystemState');
  const valConveyorStatus = document.getElementById('valConveyorStatus');
  const valServoAngle = document.getElementById('valServoAngle');
  const valAiResult = document.getElementById('valAiResult');
  const valAiConfidence = document.getElementById('valAiConfidence');

  // Bin elements
  const binElements = {
    aluminum: {
      bar: document.getElementById('barAluminum'),
      val: document.getElementById('valAluminum'),
      tag: document.getElementById('tagAluminum')
    },
    steel: {
      bar: document.getElementById('barSteel'),
      val: document.getElementById('valSteel'),
      tag: document.getElementById('tagSteel')
    },
    plastic: {
      bar: document.getElementById('barPlastic'),
      val: document.getElementById('valPlastic'),
      tag: document.getElementById('tagPlastic')
    },
    inspection: {
      bar: document.getElementById('barInspection'),
      val: document.getElementById('valInspection'),
      tag: document.getElementById('tagInspection')
    }
  };

  const logContainer = document.getElementById('logContainer');

  // Logging function
  function addLog(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-msg">${msg}</span>`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // 4. Instantiate Simulator
  const simulator = new RecyclingSimulator({
    onStateUpdate: (data) => {
      if (currentMode === 'SIMULATOR') {
        renderTelemetry(data);
      }
    },
    onLog: (msg, type) => {
      addLog(msg, type);
    }
  });

  // 5. Instantiate MQTT Client
  const mqttClient = new RecyclingMqttClient({
    onStatusChange: (status, url) => {
      if (currentMode !== 'LIVE') return;

      if (status === 'CONNECTED') {
        statusPill.className = 'status-pill online';
        statusText.innerText = 'ONLINE (Wokwi MQTT)';
        addLog(`Kết nối thành công Broker MQTT: ${url}`, 'success');
      } else if (status === 'CONNECTING') {
        statusPill.className = 'status-pill';
        statusText.innerText = 'Đang kết nối MQTT...';
      } else {
        statusPill.className = 'status-pill offline';
        statusText.innerText = 'OFFLINE (Chưa có Wokwi)';
      }
    },
    onMessageReceived: (topic, data) => {
      if (currentMode === 'LIVE') {
        renderTelemetry(data);
        if (data.message) {
          addLog(`[Wokwi ESP32] ${data.message}`, data.emergency ? 'error' : (data.warning ? 'warning' : 'info'));
        }
      }
    },
    onError: (err) => {
      if (currentMode === 'LIVE') {
        addLog(`Lỗi kết nối MQTT: ${err.message || err}`, 'error');
      }
    }
  });

  // 6. Telemetry Renderer (Shared by Live and Simulator)
  function renderTelemetry(data) {
    if (!data) return;

    // FSM State badge
    const state = data.state || 'WAIT_MATERIAL';
    badgeSystemState.innerText = state;

    if (state === 'EMERGENCY_STOPPED') {
      badgeSystemState.className = 'stat-badge badge-state-danger';
    } else if (state === 'BIN_FULL_STOP') {
      badgeSystemState.className = 'stat-badge badge-state-danger';
    } else if (state === 'SORTING') {
      badgeSystemState.className = 'stat-badge badge-state-sorting';
    } else {
      badgeSystemState.className = 'stat-badge badge-state-wait';
    }

    // Conveyor running
    const isRunning = !!data.conveyor;
    valConveyorStatus.innerText = isRunning ? 'ĐANG CHẠY' : 'ĐÃ DỪNG';
    valConveyorStatus.style.color = isRunning ? '#10b981' : '#ef4444';
    anim.setConveyor(isRunning);

    const overlayConveyorState = document.getElementById('overlayConveyorState');
    const overlayIRState = document.getElementById('overlayIRState');
    if (overlayConveyorState) overlayConveyorState.innerText = isRunning ? 'Vận hành' : 'Đã dừng';
    if (overlayIRState) overlayIRState.innerText = state === 'WAIT_AI' ? 'Phát hiện rác' : 'Chờ vật thể';

    // Servo angle
    const angle = data.servoAngle !== undefined ? data.servoAngle : 90;
    valServoAngle.innerText = `${angle}°`;
    anim.setServoAngle(angle);

    // AI Camera state and laser scanning
    if (state === 'WAIT_AI') {
      anim.setScanning(true);
      valAiResult.innerText = 'Đang quét AI...';
      valAiResult.style.color = '#38bdf8';
      valAiConfidence.innerText = 'Analyzing...';
    } else {
      anim.setScanning(false);
      if (data.material && data.material !== '') {
        valAiResult.innerText = `${data.material}`;
        valAiResult.style.color = data.material === 'UNKNOWN' ? '#ef4444' : '#10b981';
        valAiConfidence.innerText = `Độ tin cậy: ${data.confidence || 95}%`;
      } else {
        valAiResult.innerText = 'Chờ vật thể';
        valAiResult.style.color = '#9ca3af';
        valAiConfidence.innerText = 'Confidence: --';
      }
    }

    // Spawn item animation on transition to SORTING
    if (state === 'SORTING' && lastState !== 'SORTING' && data.material) {
      anim.spawnItem(data.material);
    }
    lastState = state;

    // Bins fill levels
    if (data.bins) {
      updateBinUI('aluminum', data.bins.aluminum);
      updateBinUI('steel', data.bins.steel);
      updateBinUI('plastic', data.bins.plastic);
      updateBinUI('inspection', data.bins.inspection);
    }

    // Alerts (Emergency or Full)
    if (data.emergency) {
      alertBanner.className = 'alert-banner emergency active';
      alertText.innerText = '⚠️ CẢNH BÁO: DỪNG KHẨN CẤP ĐANG BẬT! Hệ thống bị khóa an toàn.';
    } else if (data.full || state === 'BIN_FULL_STOP') {
      alertBanner.className = 'alert-banner full active';
      alertText.innerText = '⚠️ CẢNH BÁO: THÙNG RÁC ĐÃ ĐẦY (>=90%)! Vui lòng đổ rác và nhấn EMPTY BIN.';
    } else {
      alertBanner.className = 'alert-banner';
    }
  }

  function updateBinUI(key, level) {
    const el = binElements[key];
    if (!el) return;

    const val = Math.min(100, Math.max(0, level || 0));
    el.bar.style.width = `${val}%`;
    el.val.innerText = `${val}%`;

    if (val >= 90) {
      el.tag.innerText = 'ĐÃ ĐẦY (FULL)';
      el.tag.className = 'bin-status-tag full';
    } else if (val >= 80) {
      el.tag.innerText = 'SẮP ĐẦY';
      el.tag.className = 'bin-status-tag warning';
    } else {
      el.tag.innerText = 'BÌNH THƯỜNG';
      el.tag.className = 'bin-status-tag';
    }
  }

  // 7. Mode Switcher
  btnToggleMode.addEventListener('click', () => {
    if (currentMode === 'LIVE') {
      currentMode = 'SIMULATOR';
      statusPill.className = 'status-pill simulating';
      statusText.innerText = 'SIMULATOR (Offline Demo)';
      btnToggleMode.innerHTML = '<span>⚡ Chuyển sang Live IoT</span>';
      addLog('Đã chuyển sang Chế độ Mô phỏng Offline (Simulator Mode).', 'warning');
      simulator.emitState('Chế độ mô phỏng kích hoạt.');
    } else {
      currentMode = 'LIVE';
      simulator.stopAutoSimulation();
      btnToggleMode.innerHTML = '<span>🎮 Chuyển sang Demo Offline</span>';
      statusPill.className = 'status-pill';
      statusText.innerText = 'Đang kết nối Live MQTT...';
      addLog('Đã chuyển sang Chế độ Live IoT từ Wokwi.', 'info');
      mqttClient.connect();
    }
  });

  // 8. Control Action Buttons
  function triggerAction(cmd) {
    if (currentMode === 'LIVE') {
      const sent = mqttClient.sendCommand(cmd);
      if (sent) {
        addLog(`Đã gửi lệnh điều khiển tới ESP32: [${cmd}]`, 'info');
      } else {
        addLog(`Chưa kết nối Wokwi MQTT. Chuyển sang Demo Offline để test ngay!`, 'warning');
      }
    } else {
      // Simulator mode actions
      if (cmd === 'DETECT') simulator.triggerDetect();
      else if (cmd === 'ALUMINUM' || cmd === 'STEEL' || cmd === 'PLASTIC' || cmd === 'UNKNOWN') {
        simulator.triggerClassify(cmd);
      }
      else if (cmd === 'EMERGENCY') simulator.triggerEmergency();
      else if (cmd === 'EMPTY_BIN') simulator.triggerEmptyBin();
    }
  }

  document.getElementById('btnDetect').addEventListener('click', () => triggerAction('DETECT'));
  document.getElementById('btnAluminum').addEventListener('click', () => triggerAction('ALUMINUM'));
  document.getElementById('btnSteel').addEventListener('click', () => triggerAction('STEEL'));
  document.getElementById('btnPlastic').addEventListener('click', () => triggerAction('PLASTIC'));
  document.getElementById('btnUnknown').addEventListener('click', () => triggerAction('UNKNOWN'));
  document.getElementById('btnEmergency').addEventListener('click', () => triggerAction('EMERGENCY'));
  document.getElementById('btnEmptyBin').addEventListener('click', () => triggerAction('EMPTY_BIN'));

  const btnAutoTest = document.getElementById('btnAutoTest');
  btnAutoTest.addEventListener('click', () => {
    if (currentMode !== 'SIMULATOR') {
      // Auto-switch to simulator
      btnToggleMode.click();
    }
    if (simulator.isAutoRunning) {
      simulator.stopAutoSimulation();
      btnAutoTest.innerText = '🎲 Chạy tự động demo';
      btnAutoTest.classList.remove('active');
    } else {
      simulator.startAutoSimulation();
      btnAutoTest.innerText = '⏸ Dừng tự động demo';
      btnAutoTest.classList.add('active');
    }
  });

  document.getElementById('btnClearLog').addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('Đã xóa lịch sử sự kiện.', 'info');
  });

  // Initial connect
  addLog('Hệ thống Web Dashboard đã sẵn sàng.', 'success');
  mqttClient.connect();
});
