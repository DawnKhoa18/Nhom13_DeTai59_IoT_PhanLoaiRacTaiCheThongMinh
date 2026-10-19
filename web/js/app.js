/**
 * Main Application Controller for Web Dashboard
 * Live-Only Architecture: Real-time Telemetry & Remote Control for ESP32 (Wokwi / Hardware).
 * Supports 2 MQTT environments: Cloud (EMQX) and Local (Docker Mosquitto).
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Local bin fill tracking for immediate visual feedback
  let localBins = {
    aluminum: 0,
    steel: 0,
    plastic: 0,
    inspection: 0
  };

  // 2. Initialize Conveyor Animation Engine with real-time station callbacks
  const anim = new ConveyorAnimation('conveyorCanvas', {
    onItemScanned: (type, size, increment, sizeLabel) => {
      if (type === 'LIVING') {
        valAiResult.innerText = '🐭 SINH VẬT SỐNG!';
        valAiResult.style.color = '#db2777';
        valAiConfidence.innerText = 'Độ tin cậy: 100%';
        if (valAiSize) {
          valAiSize.innerText = 'CẢNH BÁO: DỪNG KHẨN CẤP!';
        }
        addLog('🚨 [CẢNH BÁO KHẨN CẤP] Máy quét AI phát hiện SINH VẬT SỐNG trên băng chuyền! Hệ thống tự động kích hoạt DỪNG KHẨN CẤP (E-Stop).', 'error');
        triggerAction('EMERGENCY');
        return;
      }

      badgeSystemState.innerText = 'SORTING';
      badgeSystemState.className = 'stat-badge badge-state-sorting';

      const labelMap = {
        'ALUMINUM': { name: 'Nhôm (Aluminum)', color: '#15803d' },
        'STEEL':    { name: 'Sắt/thép (Steel)', color: '#0369a1' },
        'PLASTIC':  { name: 'Nhựa (Plastic)', color: '#c2410c' },
        'UNKNOWN':  { name: 'Rác khác (Unknown)', color: '#b91c1c' }
      };
      const info = labelMap[type] || { name: type, color: '#15803d' };

      valAiResult.innerText = info.name;
      valAiResult.style.color = info.color;
      valAiConfidence.innerText = type === 'UNKNOWN' ? 'Độ tin cậy: 42.0%' : 'Độ tin cậy: 96.5%';
      if (valAiSize) {
        valAiSize.innerText = `Kích thước: ${sizeLabel || 'Vừa'} (+${increment || 10}%)`;
      }
    },
    onItemDeflected: (type, angle) => {
      valServoAngle.innerText = `${angle}°`;
    },
    onItemSorted: (type, size, increment, sizeLabel) => {
      if (type === 'LIVING') return;
      const keyMap = {
        'ALUMINUM': 'aluminum',
        'STEEL':    'steel',
        'PLASTIC':  'plastic',
        'UNKNOWN':  'inspection'
      };
      const binKey = keyMap[type] || 'inspection';
      const inc = increment || 10;
      localBins[binKey] = Math.min(100, (localBins[binKey] || 0) + inc);
      updateBinUI(binKey, localBins[binKey]);

      valServoAngle.innerText = '90°';
      valAiResult.innerText = 'Chờ vật thể';
      valAiResult.style.color = '#475569';
      valAiConfidence.innerText = 'Độ tin cậy: --';
      if (valAiSize) valAiSize.innerText = 'Kích thước: --';

      badgeSystemState.innerText = 'WAIT_MATERIAL';
      badgeSystemState.className = 'stat-badge badge-state-wait';

      const nameMap = {
        'aluminum': 'Thùng nhôm',
        'steel': 'Thùng sắt/thép',
        'plastic': 'Thùng nhựa',
        'inspection': 'Thùng rác khác'
      };
      addLog(`[Phân loại] 1 vật thể (${sizeLabel || 'Vừa'}, +${inc}%) đã vào ${nameMap[binKey]}. Mức đầy hiện tại: ${localBins[binKey]}%.`, 'info');
    }
  });

  // 3. Global State
  let isMqttConnected = false;
  let isEsp32Alive = false;
  let activeBrokerType = 'cloud';
  let lastState = 'WAIT_MATERIAL';
  let isAutoTesting = false;
  let autoTestTimer = null;

  // 4. UI Element References
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const alertBanner = document.getElementById('alertBanner');
  const alertText = document.getElementById('alertText');

  const badgeSystemState = document.getElementById('badgeSystemState');
  const valConveyorStatus = document.getElementById('valConveyorStatus');
  const valServoAngle = document.getElementById('valServoAngle');
  const valAiResult = document.getElementById('valAiResult');
  const valAiConfidence = document.getElementById('valAiConfidence');
  const valAiSize = document.getElementById('valAiSize');

  const overlayConveyorState = document.getElementById('overlayConveyorState');
  const overlayIRState = document.getElementById('overlayIRState');

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
  const btnAutoTest = document.getElementById('btnAutoTest');
  const selectBroker = document.getElementById('selectBroker');

  // 4. Logging Helper
  function addLog(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-msg">${msg}</span>`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Helper to show disconnection warning when user clicks while offline
  function showDisconnectedWarning() {
    alertBanner.className = 'alert-banner emergency active';
    alertText.innerText = '⚠️ Chưa kết nối mạch ESP32! Vui lòng khởi động Wokwi hoặc mạch thật.';
    addLog('Chưa có kết nối tới mạch ESP32! Không thể gửi lệnh.', 'error');

    setTimeout(() => {
      if (lastState !== 'EMERGENCY_STOPPED' && lastState !== 'BIN_FULL_STOP') {
        alertBanner.className = 'alert-banner';
      }
    }, 4500);
  }

  // 5. MQTT Client Instance
  const mqttClient = new RecyclingMqttClient({
    onStatusChange: (status, url, brokerType) => {
      activeBrokerType = brokerType || 'cloud';
      const brokerDisplayName = activeBrokerType === 'local' ? 'Cục bộ (Mosquitto)' : 'Đám mây (EMQX)';

      if (status === 'CONNECTED') {
        isMqttConnected = true;
        if (!isEsp32Alive) {
          statusPill.className = 'status-pill online';
          statusText.innerText = `Đã nối broker (Chờ mạch ESP32...)`;
        } else {
          statusPill.className = 'status-pill online';
          statusText.innerText = `Mạch trực tuyến (${brokerDisplayName})`;
        }
        addLog(`Đã kết nối thành công tới broker MQTT [${brokerDisplayName}]: ${url}`, 'success');

        if (lastState !== 'EMERGENCY_STOPPED' && lastState !== 'BIN_FULL_STOP') {
          alertBanner.className = 'alert-banner';
        }
      } else if (status === 'CONNECTING' || status === 'RECONNECTING') {
        isMqttConnected = false;
        statusPill.className = 'status-pill';
        statusText.innerText = `Đang kết nối ${brokerDisplayName}...`;
      } else {
        isMqttConnected = false;
        isEsp32Alive = false;
        statusPill.className = 'status-pill offline';
        statusText.innerText = `Mất kết nối (${brokerDisplayName})`;
        if (isAutoTesting) {
          stopAutoTest('Mất kết nối MQTT tới mạch');
        }
      }
    },
    onMessageReceived: (topic, data) => {
      if (!isEsp32Alive) {
        isEsp32Alive = true;
        const shortName = activeBrokerType === 'local' ? 'Cục bộ' : 'Đám mây';
        statusPill.className = 'status-pill online';
        statusText.innerText = `Mạch trực tuyến (${shortName})`;
        addLog(`[ESP32] Đã nhận tín hiệu từ mạch! Hệ thống sẵn sàng hoạt động.`, 'success');
      }
      renderTelemetry(data);
      if (data.message) {
        addLog(`[ESP32] ${data.message}`, data.emergency ? 'error' : (data.warning ? 'warning' : 'info'));
      }
    },
    onError: (err) => {
      addLog(`Lỗi kết nối MQTT: ${err.message || err}`, 'error');
    }
  });

  // 6. Telemetry Renderer (Synchronized from ESP32)
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

    // Conveyor running state
    const isRunning = !!data.conveyor;
    valConveyorStatus.innerText = isRunning ? 'Đang chạy' : 'Đã dừng';
    valConveyorStatus.style.color = isRunning ? '#15803d' : '#b91c1c';
    anim.setConveyor(isRunning);

    if (overlayConveyorState) overlayConveyorState.innerText = isRunning ? 'Đang chạy' : 'Đã dừng';
    if (overlayIRState) overlayIRState.innerText = state === 'WAIT_AI' ? 'Có vật thể' : 'Chờ vật thể';

    // Servo angle
    const angle = data.servoAngle !== undefined ? data.servoAngle : 90;
    valServoAngle.innerText = `${angle}°`;
    anim.setServoAngle(angle);

    // AI Camera state and telemetry
    if (state === 'WAIT_AI') {
      valAiResult.innerText = data.material || 'Đang nhận diện...';
      valAiResult.style.color = '#0284c7';
      valAiConfidence.innerText = data.confidence ? `Độ tin cậy: ${data.confidence}%` : 'Đang xử lý...';
      if (valAiSize && data.size) {
        const sMap = { 'S': 'Nhỏ', 'M': 'Vừa', 'L': 'Lớn' };
        valAiSize.innerText = `Kích thước: ${sMap[data.size] || data.size} (+${data.increment || 10}%)`;
      }
    } else {
      if (data.material && data.material !== '') {
        valAiResult.innerText = `${data.material}`;
        valAiResult.style.color = data.material === 'UNKNOWN' ? '#b91c1c' : '#15803d';
        valAiConfidence.innerText = `Độ tin cậy: ${data.confidence || 95}%`;
        if (valAiSize && data.size) {
          const sMap = { 'S': 'Nhỏ', 'M': 'Vừa', 'L': 'Lớn' };
          valAiSize.innerText = `Kích thước: ${sMap[data.size] || data.size} (+${data.increment || 10}%)`;
        }
      } else {
        valAiResult.innerText = 'Chờ vật thể';
        valAiResult.style.color = '#475569';
        valAiConfidence.innerText = 'Độ tin cậy: --';
        if (valAiSize) valAiSize.innerText = 'Kích thước: --';
      }
    }

    const prevSysState = lastState;
    lastState = state;

    if (prevSysState === 'EMERGENCY_STOPPED' && state !== 'EMERGENCY_STOPPED') {
      if (anim && typeof anim.removeLivingItems === 'function') {
        const removed = anim.removeLivingItems();
        if (removed) {
          addLog('✅ [AN TOÀN] Đã can thiệp đưa sinh vật sống ra khỏi băng chuyền an toàn.', 'success');
        }
      }
    }

    // Bins fill levels from ESP32
    if (data.bins) {
      localBins.aluminum = data.bins.aluminum;
      localBins.steel = data.bins.steel;
      localBins.plastic = data.bins.plastic;
      localBins.inspection = data.bins.inspection;

      updateBinUI('aluminum', localBins.aluminum);
      updateBinUI('steel', localBins.steel);
      updateBinUI('plastic', localBins.plastic);
      updateBinUI('inspection', localBins.inspection);
    }

    // Alerts (Emergency or Full) & Auto-Test Safety Interlock
    const btnEmergencyEl = document.getElementById('btnEmergency');
    if (data.emergency || state === 'EMERGENCY_STOPPED') {
      alertBanner.className = 'alert-banner emergency active';
      alertText.innerText = '⚠️ Cảnh báo: Đã dừng khẩn cấp! Hệ thống tạm ngưng hoạt động.';
      if (isAutoTesting) {
        stopAutoTest('Hệ thống dừng khẩn cấp (E-Stop)');
      }
      if (btnEmergencyEl) {
        btnEmergencyEl.innerHTML = '<span>🟢</span> Mở khóa & Khởi động lại';
        btnEmergencyEl.classList.add('resuming');
      }
    } else if (data.full || state === 'BIN_FULL_STOP') {
      alertBanner.className = 'alert-banner full active';
      alertText.innerText = '⚠️ Cảnh báo: Thùng chứa đã đầy (≥ 90%)! Vui lòng đặt lại thùng chứa.';
      if (isAutoTesting) {
        stopAutoTest('Thùng chứa đã đầy (≥ 90%)');
      }
      if (btnEmergencyEl) {
        btnEmergencyEl.innerHTML = '<span>🛑</span> Dừng khẩn cấp (E-Stop)';
        btnEmergencyEl.classList.remove('resuming');
      }
    } else {
      alertBanner.className = 'alert-banner';
      if (btnEmergencyEl) {
        btnEmergencyEl.innerHTML = '<span>🛑</span> Dừng khẩn cấp (E-Stop)';
        btnEmergencyEl.classList.remove('resuming');
      }
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

  // 7. Direct 1-Click Action Dispatcher
  function triggerAction(cmd, chosenSize) {
    if (!isMqttConnected) {
      showDisconnectedWarning();
      return;
    }

    if (lastState === 'EMERGENCY_STOPPED' && cmd !== 'EMERGENCY') {
      addLog('Hệ thống đang dừng khẩn cấp! Nhấn nút Dừng khẩn cấp một lần nữa để mở khóa an toàn.', 'warning');
      return;
    }

    if (lastState === 'BIN_FULL_STOP' && cmd !== 'EMPTY_BIN' && cmd !== 'EMERGENCY') {
      addLog('Thùng chứa đã đầy (≥ 90%)! Vui lòng nhấn Đặt lại thùng chứa để tiếp tục.', 'warning');
      return;
    }

    let mqttPayload = cmd;

    // Visual item spawn on belt queue with dynamic size
    if (cmd === 'ALUMINUM' || cmd === 'STEEL' || cmd === 'PLASTIC' || cmd === 'UNKNOWN') {
      const spawned = anim.spawnItem(cmd, null, chosenSize);
      if (spawned && spawned.size) {
        mqttPayload = `${cmd}:${spawned.size}`;
      }
    } else if (cmd === 'LIVING') {
      anim.spawnItem('LIVING');
      addLog('[Băng chuyền] Đã đưa 1 sinh vật sống (🐭) lên băng chuyền. Đang di chuyển tới trạm Camera AI...', 'warning');
      return;
    } else if (cmd === 'EMPTY_BIN') {
      localBins = { aluminum: 0, steel: 0, plastic: 0, inspection: 0 };
      updateBinUI('aluminum', 0);
      updateBinUI('steel', 0);
      updateBinUI('plastic', 0);
      updateBinUI('inspection', 0);
      alertBanner.className = 'alert-banner';
    } else if (cmd === 'EMERGENCY') {
      const btnEmerg = document.getElementById('btnEmergency');
      if (lastState !== 'EMERGENCY_STOPPED') {
        anim.setConveyor(false);
        anim.setServoAngle(90);
        valConveyorStatus.innerText = 'Đã dừng';
        valConveyorStatus.style.color = '#b91c1c';
        valServoAngle.innerText = '90°';
        badgeSystemState.innerText = 'EMERGENCY_STOPPED';
        badgeSystemState.className = 'stat-badge badge-state-danger';
        alertBanner.className = 'alert-banner emergency active';
        alertText.innerText = '⚠️ Cảnh báo: Đã dừng khẩn cấp! Hệ thống tạm ngưng hoạt động.';
        if (btnEmerg) {
          btnEmerg.innerHTML = '<span>🟢</span> Mở khóa & Khởi động lại';
          btnEmerg.classList.add('resuming');
        }
        if (isAutoTesting) stopAutoTest('Dừng khẩn cấp (E-Stop)');
        lastState = 'EMERGENCY_STOPPED';
      } else {
        if (anim && typeof anim.removeLivingItems === 'function') {
          const removed = anim.removeLivingItems();
          if (removed) {
            addLog('✅ [AN TOÀN] Đã can thiệp đưa sinh vật sống ra khỏi băng chuyền an toàn.', 'success');
          }
        }
        anim.setConveyor(true);
        valConveyorStatus.innerText = 'Đang chạy';
        valConveyorStatus.style.color = '#15803d';
        valAiResult.innerText = 'Chờ vật thể';
        valAiResult.style.color = '#475569';
        valAiConfidence.innerText = 'Độ tin cậy: --';
        if (valAiSize) valAiSize.innerText = 'Kích thước: --';
        badgeSystemState.innerText = 'WAIT_MATERIAL';
        badgeSystemState.className = 'stat-badge badge-state-wait';
        alertBanner.className = 'alert-banner';
        if (btnEmerg) {
          btnEmerg.innerHTML = '<span>🛑</span> Dừng khẩn cấp (E-Stop)';
          btnEmerg.classList.remove('resuming');
        }
        lastState = 'WAIT_MATERIAL';
      }
    }

    const sent = mqttClient.sendCommand(mqttPayload);
    if (sent) {
      addLog(`Đã gửi lệnh tới ESP32: [${mqttPayload}]`, 'info');
    }
  }

  // 8. Live Auto-Test Feeder (Periodically feeds items directly to ESP32)
  function startAutoTest() {
    if (!isMqttConnected) {
      showDisconnectedWarning();
      return;
    }
    if (lastState === 'EMERGENCY_STOPPED' || lastState === 'BIN_FULL_STOP') {
      addLog('Không thể bắt đầu tự động thử nghiệm khi hệ thống đang dừng khẩn cấp hoặc thùng chứa đã đầy!', 'warning');
      return;
    }

    isAutoTesting = true;
    btnAutoTest.innerHTML = '<span>⏹️</span> Dừng thử nghiệm';
    btnAutoTest.classList.add('active');
    addLog('Bắt đầu kịch bản tự động thử nghiệm gửi lệnh tới ESP32 (chu kỳ 3.8s)...', 'success');

    feedRandomItem();

    autoTestTimer = setInterval(() => {
      if (!isAutoTesting) return;
      if (!isMqttConnected) {
        stopAutoTest('Mất kết nối MQTT');
        showDisconnectedWarning();
        return;
      }
      if (lastState === 'EMERGENCY_STOPPED' || lastState === 'BIN_FULL_STOP') {
        stopAutoTest(`Hệ thống dừng (${lastState})`);
        return;
      }
      feedRandomItem();
    }, 3800);
  }

  function feedRandomItem() {
    const materials = ['ALUMINUM', 'STEEL', 'PLASTIC', 'UNKNOWN'];
    const randomType = materials[Math.floor(Math.random() * materials.length)];
    triggerAction(randomType);
  }

  function stopAutoTest(reason = '') {
    isAutoTesting = false;
    if (autoTestTimer) {
      clearInterval(autoTestTimer);
      autoTestTimer = null;
    }
    btnAutoTest.innerHTML = '<span>🎲</span> Tự động thử nghiệm';
    btnAutoTest.classList.remove('active');
    if (reason) {
      addLog(`Đã dừng tự động thử nghiệm: ${reason}`, 'warning');
    } else {
      addLog('Đã dừng tự động thử nghiệm.', 'info');
    }
  }

  // 9. Event Listeners for Control Panel
  const btnAluminum = document.getElementById('btnAluminum');
  if (btnAluminum) btnAluminum.addEventListener('click', () => triggerAction('ALUMINUM'));

  const btnSteel = document.getElementById('btnSteel');
  if (btnSteel) btnSteel.addEventListener('click', () => triggerAction('STEEL'));

  const btnPlastic = document.getElementById('btnPlastic');
  if (btnPlastic) btnPlastic.addEventListener('click', () => triggerAction('PLASTIC'));

  const btnUnknown = document.getElementById('btnUnknown');
  if (btnUnknown) btnUnknown.addEventListener('click', () => triggerAction('UNKNOWN'));

  const btnLiving = document.getElementById('btnLiving');
  if (btnLiving) btnLiving.addEventListener('click', () => triggerAction('LIVING'));

  const btnEmergency = document.getElementById('btnEmergency');
  if (btnEmergency) btnEmergency.addEventListener('click', () => triggerAction('EMERGENCY'));

  const btnEmptyBin = document.getElementById('btnEmptyBin');
  if (btnEmptyBin) btnEmptyBin.addEventListener('click', () => triggerAction('EMPTY_BIN'));

  if (btnAutoTest) {
    btnAutoTest.addEventListener('click', () => {
      if (isAutoTesting) {
        stopAutoTest();
      } else {
        startAutoTest();
      }
    });
  }

  const btnClearLog = document.getElementById('btnClearLog');
  if (btnClearLog) {
    btnClearLog.addEventListener('click', () => {
      logContainer.innerHTML = '';
      addLog('Đã xóa nhật ký.', 'info');
    });
  }

  // 10. Broker Selector Switcher
  if (selectBroker) {
    selectBroker.addEventListener('change', (e) => {
      const brokerChoice = e.target.value;
      isEsp32Alive = false;
      if (isAutoTesting) {
        stopAutoTest('Đổi broker MQTT');
      }
      addLog(`Đang chuyển sang ${brokerChoice === 'local' ? 'Mạch cục bộ (Mosquitto :9001)' : 'Mạch đám mây (EMQX)'}...`, 'info');
      mqttClient.switchBroker(brokerChoice);
    });
  }

  // 11. Initial Connection
  addLog('Giao diện điều khiển trực tuyến đã sẵn sàng. Đang kết nối tới mạch ESP32...', 'info');
  mqttClient.connect();
});
