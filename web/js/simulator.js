/**
 * Offline Simulator Engine
 * Provides autonomous simulation or manual mock events when Wokwi is not running.
 */

class RecyclingSimulator {
  constructor(options = {}) {
    this.onStateUpdate = options.onStateUpdate || (() => {});
    this.onLog = options.onLog || (() => {});

    // Internal simulation state
    this.state = 'WAIT_MATERIAL'; // WAIT_MATERIAL, WAIT_AI, SORTING, BIN_FULL_STOP, EMERGENCY_STOPPED
    this.conveyor = true;
    this.servoAngle = 90;
    this.currentMaterial = '';
    this.currentBin = '';
    this.confidence = 0;
    this.emergency = false;
    this.warning = false;
    this.full = false;

    this.bins = {
      aluminum: 20,
      steel: 30,
      plastic: 40,
      inspection: 10
    };

    this.materials = [
      { type: 'ALUMINUM', angle: 30,  bin: 'Thùng nhôm',       name: 'Nhôm' },
      { type: 'STEEL',    angle: 70,  bin: 'Thùng sắt/thép',   name: 'Sắt/thép' },
      { type: 'PLASTIC',  angle: 110, bin: 'Thùng nhựa',       name: 'Nhựa' },
      { type: 'UNKNOWN',  angle: 150, bin: 'Thùng rác khác',   name: 'Rác khác' }
    ];

    this.autoTimer = null;
    this.isAutoRunning = false;
  }

  startAutoSimulation() {
    this.isAutoRunning = true;
    this.onLog('Bắt đầu tự động mô phỏng phân loại.', 'info');
    this.runNextCycle();
  }

  stopAutoSimulation() {
    this.isAutoRunning = false;
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    this.onLog('Đã dừng tự động mô phỏng.', 'info');
  }

  runNextCycle() {
    if (!this.isAutoRunning || this.emergency || this.state === 'BIN_FULL_STOP') return;

    // Pick a random material
    const mat = this.materials[Math.floor(Math.random() * this.materials.length)];

    // Step 1: Detect material
    this.autoTimer = setTimeout(() => {
      if (!this.isAutoRunning || this.emergency) return;
      this.triggerDetect();

      // Step 2: AI Classification result
      this.autoTimer = setTimeout(() => {
        if (!this.isAutoRunning || this.emergency) return;
        this.triggerClassify(mat.type);

        // Step 3: Complete sorting
        this.autoTimer = setTimeout(() => {
          if (!this.isAutoRunning || this.emergency) return;
          this.completeSorting(mat);

          // Loop next after delay
          this.autoTimer = setTimeout(() => this.runNextCycle(), 2500);
        }, 2200);

      }, 1500);

    }, 2000);
  }

  triggerDetect() {
    if (this.state !== 'WAIT_MATERIAL' || this.emergency) return;
    this.state = 'WAIT_AI';
    this.conveyor = false;
    this.onLog('Cảm biến phát hiện vật thể. Đang chờ nhận diện...', 'warning');
    this.emitState('Phát hiện vật thể. Đang chờ nhận diện...');
  }

  triggerClassify(materialType) {
    if (this.state !== 'WAIT_AI' || this.emergency) return;

    const mat = this.materials.find(m => m.type === materialType) || this.materials[3];
    const binKey = mat.type.toLowerCase();
    
    // Check if bin is already full
    if (this.bins[binKey] >= 90) {
      this.state = 'BIN_FULL_STOP';
      this.conveyor = false;
      this.servoAngle = 90;
      this.warning = true;
      this.full = true;
      this.onLog(`Cảnh báo: Thùng ${mat.name.toLowerCase()} đã đầy (≥ 90%)! Đã ngắt băng chuyền. Vui lòng đặt lại thùng chứa.`, 'error');
      this.emitState(`Cảnh báo: ${mat.bin} đã đầy!`);
      return;
    }

    this.state = 'SORTING';
    this.conveyor = true;
    this.currentMaterial = mat.type;
    this.currentBin = mat.bin;
    this.servoAngle = mat.angle;
    this.confidence = (88 + Math.random() * 11).toFixed(1);

    this.onLog(`Nhận diện: ${mat.name} - Độ tin cậy: ${this.confidence}%. Góc servo: ${mat.angle}°.`, 'success');
    this.emitState(`Phân loại ${mat.name} vào ${mat.bin}`);
  }

  completeSorting(mat) {
    if (this.state !== 'SORTING') return;

    const binKey = mat.type.toLowerCase();
    this.bins[binKey] = Math.min(100, this.bins[binKey] + 10);

    this.servoAngle = 90;
    this.state = 'WAIT_MATERIAL';
    this.onLog(`Đã phân loại xong vào ${mat.bin}. Mức đầy: ${this.bins[binKey]}%.`, 'info');

    // Warning check
    if (this.bins[binKey] >= 80 && this.bins[binKey] < 90) {
      this.onLog(`Lưu ý: ${mat.bin} sắp đầy (${this.bins[binKey]}%).`, 'warning');
    }

    this.emitState('Hệ thống sẵn sàng. Chờ vật thể...');
  }

  triggerEmergency() {
    this.emergency = !this.emergency;
    if (this.emergency) {
      this.state = 'EMERGENCY_STOPPED';
      this.conveyor = false;
      this.servoAngle = 90;
      this.onLog('Cảnh báo: Đã kích hoạt dừng khẩn cấp! Dừng toàn bộ hệ thống.', 'error');
      this.emitState('Đã dừng khẩn cấp!');
    } else {
      this.state = 'WAIT_MATERIAL';
      this.conveyor = true;
      this.servoAngle = 90;
      this.currentMaterial = '';
      this.currentBin = '';
      this.onLog('Đã tắt dừng khẩn cấp. Khởi động lại hệ thống.', 'success');
      this.emitState('Đã tắt dừng khẩn cấp. Hệ thống sẵn sàng.');
    }
  }

  triggerEmptyBin() {
    let emptied = false;
    for (let key in this.bins) {
      if (this.bins[key] >= 80) {
        this.bins[key] = 0;
        emptied = true;
      }
    }
    // If none >=80, reset the highest
    if (!emptied) {
      this.bins = { aluminum: 0, steel: 0, plastic: 0, inspection: 0 };
    }

    this.warning = false;
    this.full = false;
    if (this.state === 'BIN_FULL_STOP') {
      this.state = 'WAIT_MATERIAL';
      this.conveyor = true;
    }

    this.onLog('Đã dọn thùng chứa. Mức đầy đặt lại về 0%. Tiếp tục hoạt động.', 'success');
    this.emitState('Đã đặt lại thùng chứa. Hệ thống sẵn sàng.');
  }

  emitState(msg) {
    const isWarning = Object.values(this.bins).some(v => v >= 80);
    const isFull = Object.values(this.bins).some(v => v >= 90);

    const payload = {
      state: this.state,
      conveyor: this.conveyor,
      servoAngle: this.servoAngle,
      material: this.currentMaterial,
      bin: this.currentBin,
      confidence: this.confidence,
      bins: { ...this.bins },
      emergency: this.emergency,
      warning: isWarning,
      full: isFull,
      message: msg
    };

    this.onStateUpdate(payload);
  }
}

window.RecyclingSimulator = RecyclingSimulator;
