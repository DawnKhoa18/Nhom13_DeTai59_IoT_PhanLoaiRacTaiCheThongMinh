/**
 * Conveyor & Sorting Belt 2D Animation Engine
 * Simulates physical movement of conveyor belt, IR sensor beam,
 * AI camera scanning laser, servo deflection arm, and material routing.
 */

class ConveyorAnimation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Animation state
    this.beltOffset = 0;
    this.beltSpeed = 2.5; // pixels per frame
    this.isConveyorRunning = true;
    this.servoAngle = 90; // degrees (90 = Home)
    this.currentAngle = 90; // for smooth interpolation
    this.isScanning = false;
    this.scanScanlineY = 0;
    this.scanDirection = 1;

    // Material item moving on belt
    this.activeItem = null;
    
    // Station Positions along belt (normalized 0 to 1)
    this.irSensorX = 0.28;
    this.aiScannerX = 0.42;
    this.servoStationX = 0.65;

    // Chute target positions
    this.chutes = [
      { id: 'ALUMINUM', name: 'Nhôm (30°)', angle: 30, color: '#10b981', targetYRatio: 0.25 },
      { id: 'STEEL',    name: 'Sắt/thép (70°)', angle: 70, color: '#06b6d4', targetYRatio: 0.42 },
      { id: 'PLASTIC',  name: 'Nhựa (110°)', angle: 110, color: '#f97316', targetYRatio: 0.60 },
      { id: 'UNKNOWN',  name: 'Rác khác (150°)', angle: 150, color: '#ef4444', targetYRatio: 0.80 }
    ];

    // Start loop
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.scale = window.devicePixelRatio;
  }

  setConveyor(running) {
    this.isConveyorRunning = running;
  }

  setServoAngle(angle) {
    this.servoAngle = angle;
  }

  setScanning(scanning) {
    this.isScanning = scanning;
  }

  spawnItem(materialType) {
    let color = '#94a3b8';
    let icon = '📦';
    let label = 'Unknown';

    if (materialType === 'ALUMINUM') {
      color = '#10b981';
      icon = '🥫';
      label = 'Nhôm';
    } else if (materialType === 'STEEL') {
      color = '#06b6d4';
      icon = '🔩';
      label = 'Sắt/thép';
    } else if (materialType === 'PLASTIC') {
      color = '#f97316';
      icon = '🧴';
      label = 'Nhựa';
    } else if (materialType === 'UNKNOWN') {
      color = '#ef4444';
      icon = '❓';
      label = 'Rác khác';
    }

    this.activeItem = {
      type: materialType,
      label: label,
      icon: icon,
      color: color,
      x: 30 * this.scale,
      y: (this.height * 0.5),
      size: 34 * this.scale,
      targetY: (this.height * 0.5),
      state: 'MOVING_ON_BELT', // 'MOVING_ON_BELT', 'AT_SENSOR', 'SORTED'
      opacity: 1
    };
  }

  animate(currentTime) {
    const dt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Smooth servo angle transition
    this.currentAngle += (this.servoAngle - this.currentAngle) * 0.15;

    // Update conveyor texture offset
    if (this.isConveyorRunning) {
      this.beltOffset = (this.beltOffset + this.beltSpeed * this.scale) % (30 * this.scale);
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Render components
    this.drawBackground();
    this.drawConveyorBelt();
    this.drawChutesAndBins();
    this.drawIRSensor();
    this.drawAIScanner();
    this.drawServoMechanism();
    this.updateAndDrawItem();

    requestAnimationFrame(this.animate);
  }

  drawBackground() {
    const ctx = this.ctx;
    // Factory grid subtle background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const gridSize = 40 * this.scale;
    for (let x = 0; x < this.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  drawConveyorBelt() {
    const ctx = this.ctx;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;
    const beltEndX = this.width * this.servoStationX;

    // Belt metal body
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, beltY - 6 * this.scale, beltEndX, beltHeight + 12 * this.scale);

    // Rollers on ends
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(15 * this.scale, beltY + beltHeight / 2, beltHeight / 2, 0, Math.PI * 2);
    ctx.arc(beltEndX, beltY + beltHeight / 2, beltHeight / 2, 0, Math.PI * 2);
    ctx.fill();

    // Belt rubber surface
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, beltY, beltEndX, beltHeight);

    // Conveyor moving ridges
    ctx.strokeStyle = this.isConveyorRunning ? '#334155' : '#1e293b';
    ctx.lineWidth = 3 * this.scale;
    const step = 28 * this.scale;
    for (let x = -step + this.beltOffset; x < beltEndX; x += step) {
      if (x >= 0 && x <= beltEndX) {
        ctx.beginPath();
        ctx.moveTo(x, beltY + 4 * this.scale);
        ctx.lineTo(x, beltY + beltHeight - 4 * this.scale);
        ctx.stroke();
      }
    }

    // Direction arrows
    if (this.isConveyorRunning) {
      ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.font = `bold ${13 * this.scale}px sans-serif`;
      ctx.fillText('► ► ►  Băng chuyền đang chạy', 80 * this.scale, beltY + beltHeight / 2 + 5 * this.scale);
    }
  }

  drawIRSensor() {
    const ctx = this.ctx;
    const sensorX = this.width * this.irSensorX;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;

    // Sensor top bracket
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(sensorX - 8 * this.scale, beltY - 26 * this.scale, 16 * this.scale, 18 * this.scale);

    // Sensor IR beam (Red laser line)
    const isTriggered = this.activeItem && Math.abs(this.activeItem.x - sensorX) < 25 * this.scale;
    ctx.strokeStyle = isTriggered ? 'rgba(239, 68, 68, 0.9)' : 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = isTriggered ? 3 * this.scale : 1.5 * this.scale;
    ctx.setLineDash([4 * this.scale, 3 * this.scale]);
    ctx.beginPath();
    ctx.moveTo(sensorX, beltY - 8 * this.scale);
    ctx.lineTo(sensorX, beltY + beltHeight + 8 * this.scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sensor status LED dot
    ctx.fillStyle = isTriggered ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.arc(sensorX, beltY - 30 * this.scale, 5 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${10 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Cảm biến IR', sensorX, beltY - 38 * this.scale);
  }

  drawAIScanner() {
    const ctx = this.ctx;
    const scannerX = this.width * this.aiScannerX;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;

    // Camera Arch Frame
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3 * this.scale;
    ctx.beginPath();
    ctx.moveTo(scannerX - 25 * this.scale, beltY + beltHeight + 6 * this.scale);
    ctx.lineTo(scannerX - 25 * this.scale, beltY - 45 * this.scale);
    ctx.lineTo(scannerX + 25 * this.scale, beltY - 45 * this.scale);
    ctx.lineTo(scannerX + 25 * this.scale, beltY + beltHeight + 6 * this.scale);
    ctx.stroke();

    // Camera housing
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5 * this.scale;
    ctx.fillRect(scannerX - 16 * this.scale, beltY - 55 * this.scale, 32 * this.scale, 18 * this.scale);
    ctx.strokeRect(scannerX - 16 * this.scale, beltY - 55 * this.scale, 32 * this.scale, 18 * this.scale);

    // Lens
    ctx.fillStyle = this.isScanning ? '#ef4444' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(scannerX, beltY - 46 * this.scale, 5 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    // Scanning laser effect
    if (this.isScanning) {
      this.scanScanlineY += 1.8 * this.scale * this.scanDirection;
      if (this.scanScanlineY > beltHeight + 20 * this.scale || this.scanScanlineY < 0) {
        this.scanDirection *= -1;
      }

      const grad = ctx.createLinearGradient(scannerX - 30 * this.scale, beltY - 35 * this.scale, scannerX, beltY + this.scanScanlineY);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.05)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(scannerX, beltY - 40 * this.scale);
      ctx.lineTo(scannerX - 28 * this.scale, beltY + beltHeight);
      ctx.lineTo(scannerX + 28 * this.scale, beltY + beltHeight);
      ctx.closePath();
      ctx.fill();

      // Scanline
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2 * this.scale;
      ctx.beginPath();
      ctx.moveTo(scannerX - 26 * this.scale, beltY - 10 * this.scale + this.scanScanlineY);
      ctx.lineTo(scannerX + 26 * this.scale, beltY - 10 * this.scale + this.scanScanlineY);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold ${10 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Camera AI', scannerX, beltY - 62 * this.scale);
  }

  drawServoMechanism() {
    const ctx = this.ctx;
    const servoX = this.width * this.servoStationX;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;
    const pivotY = beltY + beltHeight / 2;

    // Servo Pivot Base
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2 * this.scale;
    ctx.beginPath();
    ctx.arc(servoX, pivotY, 14 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Servo Arm / Flap
    // Angle in degrees: 90 is straight right, 30 is up, 150 is down
    const rad = ((this.currentAngle - 90) * Math.PI) / 180;
    const armLength = 70 * this.scale;
    const armEndX = servoX + Math.cos(rad) * armLength;
    const armEndY = pivotY + Math.sin(rad) * armLength;

    // Draw arm
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6 * this.scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(servoX, pivotY);
    ctx.lineTo(armEndX, armEndY);
    ctx.stroke();

    // Flap blade
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 10 * this.scale;
    ctx.beginPath();
    ctx.moveTo(servoX + Math.cos(rad) * 20 * this.scale, pivotY + Math.sin(rad) * 20 * this.scale);
    ctx.lineTo(armEndX, armEndY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Pivot center dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(servoX, pivotY, 4 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#f59e0b';
    ctx.font = `bold ${11 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Servo SG90 (${Math.round(this.currentAngle)}°)`, servoX, beltY - 24 * this.scale);
  }

  drawChutesAndBins() {
    const ctx = this.ctx;
    const servoX = this.width * this.servoStationX;
    const startX = servoX + 75 * this.scale;
    const binWidth = this.width - startX - 20 * this.scale;

    this.chutes.forEach((chute, idx) => {
      const chuteY = this.height * chute.targetYRatio;
      const chuteHeight = 36 * this.scale;

      // Guide rail leading from servo to chute
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2 * this.scale;
      ctx.beginPath();
      ctx.moveTo(servoX + 30 * this.scale, this.height * 0.44 + 25 * this.scale);
      ctx.lineTo(startX, chuteY + chuteHeight / 2);
      ctx.stroke();

      // Bin Chute Box
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.strokeStyle = chute.color;
      ctx.lineWidth = 2 * this.scale;
      ctx.fillRect(startX, chuteY, binWidth, chuteHeight);
      ctx.strokeRect(startX, chuteY, binWidth, chuteHeight);

      // Chute label
      ctx.fillStyle = chute.color;
      ctx.font = `bold ${12 * this.scale}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`${chute.name}`, startX + 10 * this.scale, chuteY + chuteHeight / 2 + 4 * this.scale);
    });
  }

  updateAndDrawItem() {
    if (!this.activeItem) return;

    const item = this.activeItem;
    const ctx = this.ctx;
    const beltY = this.height * 0.44;
    const servoX = this.width * this.servoStationX;

    // Movement logic
    if (this.isConveyorRunning) {
      if (item.x < servoX) {
        item.x += this.beltSpeed * this.scale;
      } else {
        // Find matched chute
        const chute = this.chutes.find(c => c.id === item.type) || this.chutes[3];
        const targetY = this.height * chute.targetYRatio + 18 * this.scale;

        item.x += (this.beltSpeed * 1.5) * this.scale;
        item.y += (targetY - item.y) * 0.08;

        // Fade out when reached end
        if (item.x > this.width - 40 * this.scale) {
          item.opacity -= 0.05;
          if (item.opacity <= 0) {
            this.activeItem = null;
            return;
          }
        }
      }
    }

    // Draw item box
    ctx.save();
    ctx.globalAlpha = item.opacity;
    ctx.translate(item.x, item.y);

    // Glow background
    ctx.fillStyle = item.color;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 10 * this.scale;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Icon emoji
    ctx.font = `${16 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, 0, 1 * this.scale);

    // Floating text label
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${10 * this.scale}px sans-serif`;
    ctx.fillText(item.label, 0, -22 * this.scale);

    ctx.restore();
  }
}

window.ConveyorAnimation = ConveyorAnimation;
