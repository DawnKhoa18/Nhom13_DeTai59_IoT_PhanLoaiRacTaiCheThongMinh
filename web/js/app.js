/**
 * Main Application Controller for Web Dashboard
 * Live-Only Architecture: Real-time Telemetry & Remote Control for ESP32 (Wokwi / Hardware).
 * Supports 2 MQTT environments: Cloud (EMQX) and Local (Docker Mosquitto).
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Local bin fill tracking & active sort session synchronization
  let localBins = {
    aluminum: 0,
    steel: 0,
    plastic: 0,
    inspection: 0
  };

  const typeToBinKey = {
    'ALUMINUM': 'aluminum',
    'STEEL':    'steel',
    'PLASTIC':  'plastic',
    'UNKNOWN':  'inspection'
  };

  let activeSortSession = null;
  let lastEmptyBinAt = 0;

  // 2. Initialize Conveyor Animation Engine with real-time station callbacks
  const anim = new ConveyorAnimation('conveyorCanvas', {
    onItemScanned: (type, size, increment, sizeLabel, item) => {
      if (type === 'LIVING') {
        activeSortSession = null;
        valAiResult.innerText = 'SINH VẬT SỐNG!';
        valAiResult.style.color = '#db2777';
        valAiConfidence.innerText = 'Độ tin cậy: 100%';
        if (valAiSize) {
          valAiSize.innerText = 'CẢNH BÁO: DỪNG KHẨN CẤP!';
        }
        addLog('[CẢNH BÁO KHẨN CẤP] Máy quét AI phát hiện SINH VẬT SỐNG trên băng chuyền! Hệ thống tự động kích hoạt DỪNG KHẨN CẤP (E-Stop).', 'error');
        logSystemEvent('LIVING_BIO', 'DANGER', 'Camera AI phát hiện sinh vật sống trên băng chuyền - tự động dừng khẩn cấp');
        triggerAction('EMERGENCY');
        return;
      }

      const binKey = typeToBinKey[type] || 'inspection';
      const inc = increment || 10;

      // Safety pre-check: if target bin is already full (>= 90%), block sorting immediately
      if ((localBins[binKey] || 0) >= 90) {
        activeSortSession = null;
        setServerSortingWithWatchdog(false);
        anim.setConveyor(false);
        if (typeof anim.rewindUnroutedScannedItems === 'function') {
          anim.rewindUnroutedScannedItems();
        }
        badgeSystemState.innerText = 'BIN_FULL_STOP';
        badgeSystemState.className = 'stat-badge badge-state-danger';
        valConveyorStatus.innerText = 'Đã dừng';
        valConveyorStatus.style.color = '#b91c1c';
        alertBanner.className = 'alert-banner full active';
        alertText.innerText = 'Cảnh báo: Thùng chứa đã đầy (≥ 90%)! Vui lòng đặt lại thùng chứa.';
        lastState = 'BIN_FULL_STOP';
        if (isAutoTesting) {
          stopAutoTest('Thùng chứa đã đầy (≥ 90%)');
        }
        if (isMqttConnected) {
          mqttClient.sendCommand(`${type}:${size || 'M'}`);
        }
        addLog(`[Chặn phân loại] Thùng đích của [${type}] đã đầy (${localBins[binKey]}% ≥ 90%). Băng chuyền tạm dừng an toàn!`, 'warning');
        logSystemEvent('BIN_FULL', 'WARNING', `Thùng đích của ${type} đã đầy (${localBins[binKey]}%), chặn phân loại`);
        return;
      }

      activeSortSession = {
        item: item || null,
        type: type,
        binKey: binKey,
        increment: inc,
        sizeLabel: sizeLabel || 'Vừa',
        scannedAt: Date.now(),
        espSawSorting: false
      };

      badgeSystemState.innerText = 'SORTING';
      badgeSystemState.className = 'stat-badge badge-state-sorting';
      setServerSortingWithWatchdog(true);

      const labelMap = {
        'ALUMINUM': { name: 'Nhôm (Aluminum)', color: '#0f766e' },
        'STEEL':    { name: 'Sắt/thép (Steel)', color: '#1d4ed8' },
        'PLASTIC':  { name: 'Nhựa (Plastic)', color: '#d97706' },
        'UNKNOWN':  { name: 'Rác khác (Unknown)', color: '#475569' }
      };
      const info = labelMap[type] || { name: type, color: '#15803d' };

      valAiResult.innerText = info.name;
      valAiResult.style.color = info.color;
      valAiConfidence.innerText = type === 'UNKNOWN' ? 'Độ tin cậy: 42.0%' : 'Độ tin cậy: 96.5%';
      if (valAiSize) {
        valAiSize.innerText = `Kích thước: ${sizeLabel || 'Vừa'} (+${inc}%)`;
      }

      // Phát lệnh MQTT cho ESP32 ngay khi vật thể chạm trạm Camera AI
      const mqttPayload = `${type}:${size || 'M'}`;
      if (isMqttConnected) {
        mqttClient.sendCommand(mqttPayload);
        addLog(`[Camera AI] Nhận diện [${info.name}] (${sizeLabel || 'Vừa'}). Đã gửi lệnh tới ESP32: [${mqttPayload}]`, 'info');
      }
    },
    onItemDeflected: (type, angle) => {
      valServoAngle.innerText = `${angle}°`;
    },
    onItemSorted: (type, size, increment, sizeLabel, item) => {
      if (type === 'LIVING') return;

      const binKey = typeToBinKey[type] || 'inspection';
      const inc = increment || 10;

      // Cập nhật ngay mức đầy thùng chứa khi vật thể rơi vào thùng (đảm bảo chỉ cộng 1 lần duy nhất cho mỗi vật thể)
      if (!item || !item.binCounted) {
        if (item) item.binCounted = true;
        localBins[binKey] = Math.min(100, (localBins[binKey] || 0) + inc);
        updateBinUI(binKey, localBins[binKey]);
      }

      // Ghi nhận thống kê khối lượng: mỗi vật thể chỉ được ghi đúng 1 lần
      if (window.wasteStatistics && (!item || !item.statRecorded)) {
        if (item) item.statRecorded = true;
        try {
          window.wasteStatistics.recordSortedItem(type, size, inc, sizeLabel);
        } catch (e) {
          console.warn('[WasteStatistics] recordSortedItem lỗi:', e);
        }
      }

      if (!anim.hasActiveSortingItems()) {
        valServoAngle.innerText = '90°';
        valAiResult.innerText = 'Chờ vật thể';
        valAiResult.style.color = '#475569';
        valAiConfidence.innerText = 'Độ tin cậy: --';
        if (valAiSize) valAiSize.innerText = 'Kích thước: --';
      }

      const nameMap = {
        'ALUMINUM': 'Thùng nhôm',
        'STEEL':    'Thùng sắt/thép',
        'PLASTIC':  'Thùng nhựa',
        'UNKNOWN':  'Thùng rác khác'
      };
      addLog(`[Phân loại] 1 vật thể ${nameMap[type] || type} (${sizeLabel || 'Vừa'}, +${inc}%) đã rơi vào thùng -> Mức đầy: ${localBins[binKey]}%.`, 'success');

      if (localBins[binKey] >= 90) {
        alertBanner.className = 'alert-banner full active';
        alertText.innerText = 'Cảnh báo: Thùng chứa đã đầy (≥ 90%)! Vui lòng đặt lại thùng chứa.';
        logSystemEvent('BIN_FULL', 'WARNING', `${nameMap[type] || type} đạt ${localBins[binKey]}% (≥ 90%)`);
      }
    }
  });

  // 3. Global State
  let isMqttConnected = false;
  let isEsp32Alive = false;
  let lastEsp32SeenAt = 0;
  let activeBrokerType = 'cloud';
  let lastState = 'WAIT_MATERIAL';
  let isAutoTesting = false;
  let autoTestTimer = null;
  let serverSortingWatchdog = null;

  // --- Thống kê: ghi nhật ký sự kiện an toàn (module độc lập, lỗi không ảnh hưởng hệ thống) ---
  const lastSystemEventAt = {};
  let lastLocalEmergencyToggleAt = 0;
  function logSystemEvent(eventType, severity, description) {
    if (!window.wasteStatistics || typeof window.wasteStatistics.recordEvent !== 'function') return;
    const now = Date.now();
    if (lastSystemEventAt[eventType] && now - lastSystemEventAt[eventType] < 3000) return; // chống ghi trùng
    lastSystemEventAt[eventType] = now;
    try {
      window.wasteStatistics.recordEvent(eventType, severity, description);
    } catch (e) {
      console.warn('[WasteStatistics] recordEvent lỗi:', e);
    }
  }

  function setServerSortingWithWatchdog(busy) {
    if (serverSortingWatchdog) {
      clearTimeout(serverSortingWatchdog);
      serverSortingWatchdog = null;
    }
    anim.setServerSorting(busy);
    if (busy) {
      serverSortingWatchdog = setTimeout(() => {
        activeSortSession = null;
        if (lastState !== 'EMERGENCY_STOPPED' && lastState !== 'BIN_FULL_STOP') {
          anim.setServerSorting(false);
        }
      }, 6500);
    }
  }

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
  function showDisconnectedWarning(reason = 'broker') {
    alertBanner.className = 'alert-banner emergency active';
    if (reason === 'esp32') {
      const brokerLabel = activeBrokerType === 'local' ? 'Cục bộ (Mosquitto :9001)' : 'Đám mây (EMQX)';
      alertText.innerText = `Đã nối Broker [${brokerLabel}] nhưng chưa thấy mạch ESP32! Hãy bật mạch hoặc chọn đúng kênh Broker.`;
      addLog(`Chưa nhận được tín hiệu từ mạch ESP32 trên kênh [${brokerLabel}]! Hãy kiểm tra mạch đang chạy ở chế độ Đám mây hay Cục bộ.`, 'warning');
    } else {
      alertText.innerText = 'Chưa kết nối tới Broker MQTT! Vui lòng kiểm tra kết nối mạng hoặc Mosquitto.';
      addLog('Chưa có kết nối tới Broker MQTT! Không thể gửi lệnh.', 'error');
    }

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
      lastEsp32SeenAt = Date.now();
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

    // FSM State badge & Active Sort Session Gating
    const state = data.state || 'WAIT_MATERIAL';
    const isSortingCompletedMsg = !!(data.message && data.message.indexOf('Sorting completed') >= 0);
    const isPreCommandHeartbeat = !!(
      activeSortSession &&
      state === 'WAIT_MATERIAL' &&
      !activeSortSession.espSawSorting &&
      !isSortingCompletedMsg &&
      (Date.now() - activeSortSession.scannedAt < 2200)
    );

    if (state === 'EMERGENCY_STOPPED') {
      activeSortSession = null;
      badgeSystemState.innerText = state;
      badgeSystemState.className = 'stat-badge badge-state-danger';
      setServerSortingWithWatchdog(false);
    } else if (state === 'BIN_FULL_STOP') {
      activeSortSession = null;
      badgeSystemState.innerText = state;
      badgeSystemState.className = 'stat-badge badge-state-danger';
      setServerSortingWithWatchdog(false);
    } else if (state === 'SORTING' || isPreCommandHeartbeat) {
      if (state === 'SORTING' && activeSortSession) {
        activeSortSession.espSawSorting = true;
      }
      badgeSystemState.innerText = 'SORTING';
      badgeSystemState.className = 'stat-badge badge-state-sorting';
      setServerSortingWithWatchdog(true);
    } else {
      if (activeSortSession) {
        if (activeSortSession.item && !activeSortSession.item.binCounted) {
          activeSortSession.item.binCounted = true;
          const bk = activeSortSession.binKey;
          localBins[bk] = Math.min(100, (localBins[bk] || 0) + activeSortSession.increment);
          updateBinUI(bk, localBins[bk]);
        }
        activeSortSession = null;
      }
      badgeSystemState.innerText = state;
      badgeSystemState.className = 'stat-badge badge-state-wait';
      setServerSortingWithWatchdog(false);
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

    // Thống kê: ghi sự kiện khi ESP32 đổi trạng thái (bỏ qua ngay sau thao tác E-Stop trên Web để khỏi ghi trùng/sai)
    if (Date.now() - lastLocalEmergencyToggleAt > 4000) {
      if (state === 'EMERGENCY_STOPPED' && prevSysState !== 'EMERGENCY_STOPPED') {
        logSystemEvent('E_STOP', 'DANGER', 'Mạch ESP32 báo trạng thái dừng khẩn cấp');
      } else if (prevSysState === 'EMERGENCY_STOPPED' && state !== 'EMERGENCY_STOPPED') {
        logSystemEvent('RESUME', 'SUCCESS', 'Hệ thống được mở khóa và hoạt động trở lại');
      }
    }
    if (state === 'BIN_FULL_STOP' && prevSysState !== 'BIN_FULL_STOP') {
      logSystemEvent('BIN_FULL', 'WARNING', 'ESP32 báo thùng chứa đầy - dừng phân loại');
    }

    if (prevSysState !== 'BIN_FULL_STOP' && state === 'BIN_FULL_STOP') {
      if (anim && typeof anim.rewindUnroutedScannedItems === 'function') {
        anim.rewindUnroutedScannedItems();
      }
    }

    if (prevSysState === 'EMERGENCY_STOPPED' && state !== 'EMERGENCY_STOPPED') {
      if (anim && typeof anim.removeLivingItems === 'function') {
        const removed = anim.removeLivingItems();
        if (removed) {
          addLog('[AN TOÀN] Đã can thiệp đưa sinh vật sống ra khỏi băng chuyền an toàn.', 'success');
        }
      }
    }

    // Bins fill levels synchronized with ESP32 (protecting in-flight items from stale 0% heartbeats)
    if (data.bins) {
      const isResetMsg = !!(
        data.message &&
        (data.message.indexOf('All bins emptied') >= 0 || data.message.indexOf('ESP32 Online & Ready') >= 0)
      );
      if (isResetMsg) {
        if (data.message.indexOf('All bins emptied') >= 0 && Date.now() - lastEmptyBinAt > 8000 &&
            window.wasteStatistics && typeof window.wasteStatistics.recordBinEmpty === 'function') {
          try {
            window.wasteStatistics.recordBinEmpty(Object.assign({}, localBins), 'ESP32_PIN12');
          } catch (e) {
            console.warn('[WasteStatistics] recordBinEmpty lỗi:', e);
          }
        }
        localBins = { aluminum: 0, steel: 0, plastic: 0, inspection: 0 };
      } else if (Date.now() - lastEmptyBinAt >= 3000) {
        localBins.aluminum = Math.max(localBins.aluminum || 0, data.bins.aluminum || 0);
        localBins.steel = Math.max(localBins.steel || 0, data.bins.steel || 0);
        localBins.plastic = Math.max(localBins.plastic || 0, data.bins.plastic || 0);
        localBins.inspection = Math.max(localBins.inspection || 0, data.bins.inspection || 0);
      }

      updateBinUI('aluminum', localBins.aluminum);
      updateBinUI('steel', localBins.steel);
      updateBinUI('plastic', localBins.plastic);
      updateBinUI('inspection', localBins.inspection);
    }

    // Alerts (Emergency or Full) & Auto-Test Safety Interlock
    const btnEmergencyEl = document.getElementById('btnEmergency');
    if (data.emergency || state === 'EMERGENCY_STOPPED') {
      alertBanner.className = 'alert-banner emergency active';
      alertText.innerText = 'Cảnh báo: Đã dừng khẩn cấp! Hệ thống tạm ngưng hoạt động.';
      if (isAutoTesting) {
        stopAutoTest('Hệ thống dừng khẩn cấp (E-Stop)');
      }
      if (btnEmergencyEl) {
        btnEmergencyEl.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 19 12 7 20 7 4"/></svg> <span>Mở khóa & Khởi động lại</span>`;
        btnEmergencyEl.classList.add('resuming');
      }
    } else if (data.full || state === 'BIN_FULL_STOP') {
      alertBanner.className = 'alert-banner full active';
      alertText.innerText = 'Cảnh báo: Thùng chứa đã đầy (≥ 90%)! Vui lòng đặt lại thùng chứa.';
      if (isAutoTesting) {
        stopAutoTest('Thùng chứa đã đầy (≥ 90%)');
      }
      if (btnEmergencyEl) {
        btnEmergencyEl.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/></svg> <span>Dừng khẩn cấp (E-Stop)</span>`;
        btnEmergencyEl.classList.remove('resuming');
      }
    } else {
      alertBanner.className = 'alert-banner';
      if (btnEmergencyEl) {
        btnEmergencyEl.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/></svg> <span>Dừng khẩn cấp (E-Stop)</span>`;
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
      showDisconnectedWarning('broker');
      return;
    }
    if (!isEsp32Alive) {
      showDisconnectedWarning('esp32');
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
      const nameMap = {
        'ALUMINUM': 'Nhôm (30°)',
        'STEEL':    'Sắt/thép (70°)',
        'PLASTIC':  'Nhựa (110°)',
        'UNKNOWN':  'Rác khác (150°)'
      };
      const sizeText = spawned ? ` [${spawned.sizeLabel || 'Vừa'}]` : '';
      addLog(`[Băng chuyền] Đã nạp 1 vật thể ${nameMap[cmd] || cmd}${sizeText} vào hàng đợi băng chuyền...`, 'info');
      return; // Lệnh MQTT sẽ được phát khi vật thể di chuyển đến trạm Camera AI
    } else if (cmd === 'LIVING') {
      anim.spawnItem('LIVING');
      addLog('[Băng chuyền] Đã đưa 1 sinh vật sống (Sinh vật sống) lên băng chuyền. Đang di chuyển tới trạm Camera AI...', 'warning');
      return;
    } else if (cmd === 'EMPTY_BIN') {
      if (window.wasteStatistics && typeof window.wasteStatistics.recordBinEmpty === 'function') {
        try {
          window.wasteStatistics.recordBinEmpty(Object.assign({}, localBins), 'WEB_BUTTON');
        } catch (e) {
          console.warn('[WasteStatistics] recordBinEmpty lỗi:', e);
        }
      }
      lastEmptyBinAt = Date.now();
      activeSortSession = null;
      setServerSortingWithWatchdog(false);
      localBins = { aluminum: 0, steel: 0, plastic: 0, inspection: 0 };
      updateBinUI('aluminum', 0);
      updateBinUI('steel', 0);
      updateBinUI('plastic', 0);
      updateBinUI('inspection', 0);
      alertBanner.className = 'alert-banner';
    } else if (cmd === 'EMERGENCY') {
      const btnEmerg = document.getElementById('btnEmergency');
      lastLocalEmergencyToggleAt = Date.now();
      if (lastState !== 'EMERGENCY_STOPPED') {
        logSystemEvent('E_STOP', 'DANGER', 'Dừng khẩn cấp được kích hoạt từ giao diện Web');
        anim.setConveyor(false);
        anim.setServoAngle(90);
        valConveyorStatus.innerText = 'Đã dừng';
        valConveyorStatus.style.color = '#b91c1c';
        valServoAngle.innerText = '90°';
        badgeSystemState.innerText = 'EMERGENCY_STOPPED';
        badgeSystemState.className = 'stat-badge badge-state-danger';
        alertBanner.className = 'alert-banner emergency active';
        alertText.innerText = 'Cảnh báo: Đã dừng khẩn cấp! Hệ thống tạm ngưng hoạt động.';
        if (btnEmerg) {
          btnEmerg.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 19 12 7 20 7 4"/></svg> <span>Mở khóa & Khởi động lại</span>`;
          btnEmerg.classList.add('resuming');
        }
        if (isAutoTesting) stopAutoTest('Dừng khẩn cấp (E-Stop)');
        lastState = 'EMERGENCY_STOPPED';
      } else {
        if (anim && typeof anim.removeLivingItems === 'function') {
          const removed = anim.removeLivingItems();
          if (removed) {
            addLog('[AN TOÀN] Đã can thiệp đưa sinh vật sống ra khỏi băng chuyền an toàn.', 'success');
          }
        }
        logSystemEvent('RESUME', 'SUCCESS', 'Mở khóa dừng khẩn cấp từ giao diện Web');
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
          btnEmerg.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/></svg> <span>Dừng khẩn cấp (E-Stop)</span>`;
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
      showDisconnectedWarning('broker');
      return;
    }
    if (!isEsp32Alive) {
      showDisconnectedWarning('esp32');
      return;
    }
    if (lastState === 'EMERGENCY_STOPPED' || lastState === 'BIN_FULL_STOP') {
      addLog('Không thể bắt đầu tự động thử nghiệm khi hệ thống đang dừng khẩn cấp hoặc thùng chứa đã đầy!', 'warning');
      return;
    }

    isAutoTesting = true;
    btnAutoTest.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> <span>Dừng thử nghiệm</span>`;
    btnAutoTest.classList.add('active');
    addLog('Bắt đầu kịch bản tự động thử nghiệm gửi lệnh tới ESP32 (chu kỳ 3.8s)...', 'success');

    feedRandomItem();

    autoTestTimer = setInterval(() => {
      if (!isAutoTesting) return;
      if (!isMqttConnected || !isEsp32Alive) {
        stopAutoTest(!isMqttConnected ? 'Mất kết nối MQTT' : 'Mất tín hiệu mạch ESP32');
        showDisconnectedWarning(!isMqttConnected ? 'broker' : 'esp32');
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
    btnAutoTest.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> <span>Tự động thử nghiệm</span>`;
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
      lastEsp32SeenAt = 0;
      setServerSortingWithWatchdog(false);
      if (anim && typeof anim.clearAllItems === 'function') {
        anim.clearAllItems();
      }
      if (isAutoTesting) {
        stopAutoTest('Đổi broker MQTT');
      }
      addLog(`Đang chuyển sang ${brokerChoice === 'local' ? 'Mạch cục bộ (Mosquitto :9001)' : 'Mạch đám mây (EMQX)'}...`, 'info');
      mqttClient.switchBroker(brokerChoice);
    });
  }

  // Heartbeat liveness monitor: detect if ESP32 stopped transmitting
  setInterval(() => {
    if (isMqttConnected && isEsp32Alive && lastEsp32SeenAt > 0 && Date.now() - lastEsp32SeenAt > 10000) {
      isEsp32Alive = false;
      setServerSortingWithWatchdog(false);
      statusPill.className = 'status-pill online';
      statusText.innerText = 'Đã nối broker (Chờ mạch ESP32...)';
      addLog('[Cảnh báo] Đã quá 10s không nhận được tín hiệu từ mạch ESP32. Vui lòng kiểm tra mạch hoặc kênh Broker.', 'warning');
    }
  }, 2500);

  // 11. Initial Connection
  addLog('Giao diện điều khiển trực tuyến đã sẵn sàng. Đang kết nối tới mạch ESP32...', 'info');
  mqttClient.connect();
});
