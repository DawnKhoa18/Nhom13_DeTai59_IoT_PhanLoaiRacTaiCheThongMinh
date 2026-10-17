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
        statusText.innerText = 'Đã kết nối (MQTT)';
        addLog(`Đã kết nối broker MQTT: ${url}`, 'success');
      } else if (status === 'CONNECTING') {
        statusPill.className = 'status-pill';
        statusText.innerText = 'Đang kết nối...';
      } else {
        statusPill.className = 'status-pill offline';
        statusText.innerText = 'Chưa kết nối';
      }
    },
    onMessageReceived: (topic, data) => {
      if (currentMode === 'LIVE') {
        renderTelemetry(data);
        if (data.message) {
          addLog(`[ESP32] ${data.message}`, data.emergency ? 'error' : (data.warning ? 'warning' : 'info'));
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
    valConveyorStatus.innerText = isRunning ? 'Đang chạy' : 'Đã dừng';
    valConveyorStatus.style.color = isRunning ? '#10b981' : '#ef4444';
    anim.setConveyor(isRunning);

    const overlayConveyorState = document.getElementById('overlayConveyorState');
    const overlayIRState = document.getElementById('overlayIRState');
    if (overlayConveyorState) overlayConveyorState.innerText = isRunning ? 'Đang chạy' : 'Đã dừng';
    if (overlayIRState) overlayIRState.innerText = state === 'WAIT_AI' ? 'Có vật thể' : 'Chờ vật thể';

    // Servo angle
    const angle = data.servoAngle !== undefined ? data.servoAngle : 90;
    valServoAngle.innerText = `${angle}°`;
    anim.setServoAngle(angle);

    // AI Camera state and laser scanning
    if (state === 'WAIT_AI') {
      anim.setScanning(true);
      valAiResult.innerText = 'Đang nhận diện...';
      valAiResult.style.color = '#38bdf8';
      valAiConfidence.innerText = 'Đang xử lý...';
    } else {
      anim.setScanning(false);
      if (data.material && data.material !== '') {
        valAiResult.innerText = `${data.material}`;
        valAiResult.style.color = data.material === 'UNKNOWN' ? '#ef4444' : '#10b981';
        valAiConfidence.innerText = `Độ tin cậy: ${data.confidence || 95}%`;
      } else {
        valAiResult.innerText = 'Chờ vật thể';
        valAiResult.style.color = '#9ca3af';
        valAiConfidence.innerText = 'Độ tin cậy: --';
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
      alertText.innerText = '⚠️ Cảnh báo: Đã dừng khẩn cấp! Hệ thống tạm ngưng hoạt động.';
    } else if (data.full || state === 'BIN_FULL_STOP') {
      alertBanner.className = 'alert-banner full active';
      alertText.innerText = '⚠️ Cảnh báo: Thùng chứa đã đầy (≥ 90%)! Vui lòng dọn rác để tiếp tục.';
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
      el.tag.innerText = 'Đã đầy';
      el.tag.className = 'bin-status-tag full';
    } else if (val >= 80) {
      el.tag.innerText = 'Sắp đầy';
      el.tag.className = 'bin-status-tag warning';
    } else {
      el.tag.innerText = 'Bình thường';
      el.tag.className = 'bin-status-tag';
    }
  }

  // 7. Mode Switcher
  btnToggleMode.addEventListener('click', () => {
    if (currentMode === 'LIVE') {
      currentMode = 'SIMULATOR';
      statusPill.className = 'status-pill simulating';
      statusText.innerText = 'Mô phỏng (Ngoại tuyến)';
      btnToggleMode.innerHTML = '<span>⚡ Chế độ trực tuyến</span>';
      addLog('Đã chuyển sang chế độ mô phỏng.', 'warning');
      simulator.emitState('Bắt đầu mô phỏng.');
    } else {
      currentMode = 'LIVE';
      simulator.stopAutoSimulation();
      btnToggleMode.innerHTML = '<span>🎮 Chế độ mô phỏng</span>';
      statusPill.className = 'status-pill';
      statusText.innerText = 'Đang kết nối MQTT...';
      addLog('Đã chuyển sang chế độ trực tuyến.', 'info');
      mqttClient.connect();
    }
  });

  // 8. Control Action Buttons
  function triggerAction(cmd) {
    if (currentMode === 'LIVE') {
      const sent = mqttClient.sendCommand(cmd);
      if (sent) {
        addLog(`Đã gửi lệnh tới ESP32: [${cmd}]`, 'info');
      } else {
        addLog('Chưa kết nối MQTT. Hãy chuyển sang chế độ mô phỏng để thử nghiệm.', 'warning');
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
      btnAutoTest.innerText = '🎲 Tự động thử nghiệm';
      btnAutoTest.classList.remove('active');
    } else {
      simulator.startAutoSimulation();
      btnAutoTest.innerText = '⏸ Dừng thử nghiệm';
      btnAutoTest.classList.add('active');
    }
  });

  document.getElementById('btnClearLog').addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('Đã xóa nhật ký.', 'info');
  });

  const selectBroker = document.getElementById('selectBroker');
  if (selectBroker) {
    selectBroker.addEventListener('change', (e) => {
      const brokerChoice = e.target.value;
      addLog(`Đang chuyển sang ${brokerChoice === 'local' ? 'broker cục bộ (Mosquitto :9001)' : 'broker đám mây (EMQX)'}...`, 'info');
      mqttClient.switchBroker(brokerChoice);
    });
  }

  // Initial connect
  addLog('Giao diện giám sát đã sẵn sàng.', 'success');
  mqttClient.connect();
});
