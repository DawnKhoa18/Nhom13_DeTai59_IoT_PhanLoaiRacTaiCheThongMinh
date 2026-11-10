/**
 * Conveyor & Sorting Belt 2D Animation Engine
 * Simulates physical movement of conveyor belt, IR sensor beam,
 * AI camera scanning laser, servo deflection arm, and material routing.
 * Supports multi-item queue (nối đuôi nhau) with deliberate realistic pacing (~3.5s per item).
 */

class ConveyorAnimation {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Callbacks
    this.onItemScanned = options.onItemScanned || (() => {});
    this.onItemDeflected = options.onItemDeflected || (() => {});
    this.onItemSorted = options.onItemSorted || (() => {});

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Animation state
    this.beltOffset = 0;
    this.beltSpeed = 1.65; // pixels per frame (smooth & deliberate ~3.5s transit)
    this.isConveyorRunning = true;
    this.servoAngle = 90; // degrees (90 = Home)
    this.currentAngle = 90; // for smooth interpolation
    this.isScanning = false;
    this.scanScanlineY = 0;
    this.scanDirection = 1;
    this.isServerSorting = false;
    this.isStationBlocked = false;

    // Multi-item Queue
    this.items = [];
    this.itemIdCounter = 0;

    // Station Positions along belt (normalized 0 to 1)
    this.irSensorX = 0.28;
    this.aiScannerX = 0.42;
    this.servoStationX = 0.65;

    // Chute target positions
    this.chutes = [
      { id: 'ALUMINUM', name: 'Nhôm (30°)', angle: 30, color: '#0f766e', targetYRatio: 0.16 },
      { id: 'STEEL',    name: 'Sắt/thép (70°)', angle: 70, color: '#1d4ed8', targetYRatio: 0.37 },
      { id: 'PLASTIC',  name: 'Nhựa (110°)', angle: 110, color: '#d97706', targetYRatio: 0.58 },
      { id: 'UNKNOWN',  name: 'Rác khác (150°)', angle: 150, color: '#475569', targetYRatio: 0.79 }
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

  setServerSorting(busy) {
    this.isServerSorting = !!busy;
  }

  removeLivingItems() {
    const hadLiving = this.items.some(item => item.type === 'LIVING');
    this.items = this.items.filter(item => item.type !== 'LIVING');
    return hadLiving;
  }

  clearAllItems() {
    this.items = [];
    this.isScanning = false;
    this.isServerSorting = false;
    this.isStationBlocked = false;
    this.servoAngle = 90;
  }

  rewindUnroutedScannedItems() {
    const gateStopX = this.width * this.aiScannerX - 34 * this.scale;
    this.items.forEach(item => {
      if (item.scanned && !item.deflected && item.type !== 'LIVING') {
        item.scanned = false;
        if (item.x > gateStopX) {
          item.x = gateStopX;
        }
      }
    });
  }

  hasActiveSortingItems() {
    return this.items.some(item => item.scanned && !item.completed && item.type !== 'LIVING');
  }

  spawnItem(materialType, onComplete, chosenSize) {
    let color = '#475569';
    let code = 'MISC';
    let label = 'Unknown';
    let angle = 90;

    if (materialType === 'ALUMINUM') {
      color = '#0f766e';
      code = 'ALU';
      label = 'Nhôm';
      angle = 30;
    } else if (materialType === 'STEEL') {
      color = '#1d4ed8';
      code = 'FE';
      label = 'Sắt/thép';
      angle = 70;
    } else if (materialType === 'PLASTIC') {
      color = '#d97706';
      code = 'PET';
      label = 'Nhựa';
      angle = 110;
    } else if (materialType === 'UNKNOWN') {
      color = '#475569';
      code = 'MISC';
      label = 'Rác khác';
      angle = 150;
    } else if (materialType === 'LIVING') {
      color = '#dc2626';
      code = 'BIO';
      label = 'Sinh vật sống';
      angle = 90;
    }

    // Determine size and increment
    let size = chosenSize;
    let radius = 14;
    let increment = 10;
    let sizeLabel = 'Vừa';
    let fullLabel = '';

    if (materialType === 'LIVING') {
      size = 'BIO';
      radius = 16;
      increment = 0;
      sizeLabel = 'Sinh vật';
      fullLabel = 'Sinh vật sống';
    } else {
      if (!size) {
        const rand = Math.random();
        if (rand < 0.30) {
          size = 'S';
        } else if (rand < 0.80) {
          size = 'M';
        } else {
          size = 'L';
        }
      }

      if (size === 'S') {
        radius = 10;
        increment = 5;
        sizeLabel = 'Nhỏ';
      } else if (size === 'L') {
        radius = 19;
        increment = 20;
        sizeLabel = 'Lớn';
      }
      fullLabel = `${label} (${size})`;
    }

    // Determine startX with spacing behind any existing item
    let startX = 15 * this.scale;
    const minSpacing = 75 * this.scale;
    if (this.items.length > 0) {
      const lastItem = this.items[this.items.length - 1];
      if (lastItem.x < startX + minSpacing) {
        startX = lastItem.x - minSpacing;
      }
    }

    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;

    const newItem = {
      id: ++this.itemIdCounter,
      type: materialType,
      size: size,
      sizeLabel: sizeLabel,
      increment: increment,
      radius: radius,
      label: fullLabel,
      code: code,
      icon: code,
      color: color,
      angle: angle,
      x: startX,
      y: beltY + beltHeight / 2,
      targetY: beltY + beltHeight / 2,
      scanned: false,
      deflected: false,
      completed: false,
      opacity: 1,
      onComplete: onComplete
    };

    this.items.push(newItem);
    return newItem;
  }

  animate(currentTime) {
    requestAnimationFrame(this.animate);

    const dt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    const validDt = (dt > 0 && dt < 0.25) ? dt : (1 / 60);
    this.dtFactor = Math.min(2.5, Math.max(0.25, validDt * 60));

    try {
      // Smooth servo angle transition
      this.currentAngle += (this.servoAngle - this.currentAngle) * 0.12 * this.dtFactor;

      // Update conveyor texture offset
      if (this.isConveyorRunning && !this.isStationBlocked) {
        this.beltOffset = (this.beltOffset + this.beltSpeed * this.scale * this.dtFactor) % (30 * this.scale);
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
      this.updateAndDrawItems();
    } catch (err) {
      console.error('[ConveyorAnimation] Render error:', err);
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.05)';
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
    ctx.fillStyle = '#334155';
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = `bold ${12 * this.scale}px sans-serif`;
    }
  }

  drawIRSensor() {
    const ctx = this.ctx;
    const sensorX = this.width * this.irSensorX;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;

    // Sensor top bracket
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(sensorX - 8 * this.scale, beltY - 26 * this.scale, 16 * this.scale, 18 * this.scale);

    // Sensor IR beam (Red laser line when any item is passing)
    const isTriggered = this.items.some(item => Math.abs(item.x - sensorX) < 25 * this.scale);
    ctx.strokeStyle = isTriggered ? 'rgba(185, 28, 28, 0.95)' : 'rgba(185, 28, 28, 0.35)';
    ctx.lineWidth = isTriggered ? 3 * this.scale : 1.5 * this.scale;
    ctx.setLineDash([4 * this.scale, 3 * this.scale]);
    ctx.beginPath();
    ctx.moveTo(sensorX, beltY - 8 * this.scale);
    ctx.lineTo(sensorX, beltY + beltHeight + 8 * this.scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sensor status LED dot
    ctx.fillStyle = isTriggered ? '#b91c1c' : '#15803d';
    ctx.beginPath();
    ctx.arc(sensorX, beltY - 30 * this.scale, 5 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#334155';
    ctx.font = `bold ${10 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Cảm biến IR', sensorX, beltY - 36 * this.scale);
  }

  drawAIScanner() {
    const ctx = this.ctx;
    const scannerX = this.width * this.aiScannerX;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;

    // Camera Arch Frame
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3 * this.scale;
    ctx.beginPath();
    ctx.moveTo(scannerX - 24 * this.scale, beltY + beltHeight + 6 * this.scale);
    ctx.lineTo(scannerX - 24 * this.scale, beltY - 42 * this.scale);
    ctx.lineTo(scannerX + 24 * this.scale, beltY - 42 * this.scale);
    ctx.lineTo(scannerX + 24 * this.scale, beltY + beltHeight + 6 * this.scale);
    ctx.stroke();

    // Camera housing
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2 * this.scale;
    ctx.fillRect(scannerX - 16 * this.scale, beltY - 52 * this.scale, 32 * this.scale, 18 * this.scale);
    ctx.strokeRect(scannerX - 16 * this.scale, beltY - 52 * this.scale, 32 * this.scale, 18 * this.scale);

    // Lens
    ctx.fillStyle = this.isScanning ? '#b91c1c' : '#0284c7';
    ctx.beginPath();
    ctx.arc(scannerX, beltY - 43 * this.scale, 5 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    // Scanning laser effect
    if (this.isScanning) {
      this.scanScanlineY += 1.8 * this.scale * this.scanDirection;
      if (this.scanScanlineY > beltHeight + 20 * this.scale || this.scanScanlineY < 0) {
        this.scanDirection *= -1;
      }

      const grad = ctx.createLinearGradient(scannerX - 28 * this.scale, beltY - 35 * this.scale, scannerX, beltY + this.scanScanlineY);
      grad.addColorStop(0, 'rgba(2, 132, 199, 0.45)');
      grad.addColorStop(1, 'rgba(2, 132, 199, 0.05)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(scannerX, beltY - 38 * this.scale);
      ctx.lineTo(scannerX - 26 * this.scale, beltY + beltHeight);
      ctx.lineTo(scannerX + 26 * this.scale, beltY + beltHeight);
      ctx.closePath();
      ctx.fill();

      // Scanline
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2 * this.scale;
      ctx.beginPath();
      ctx.moveTo(scannerX - 24 * this.scale, beltY - 8 * this.scale + this.scanScanlineY);
      ctx.lineTo(scannerX + 24 * this.scale, beltY - 8 * this.scale + this.scanScanlineY);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#0369a1';
    ctx.font = `bold ${10.5 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Camera AI', scannerX, beltY - 58 * this.scale);
  }

  drawServoMechanism() {
    const ctx = this.ctx;
    const servoX = this.width * this.servoStationX;
    const beltY = this.height * 0.44;
    const beltHeight = 50 * this.scale;
    const pivotY = beltY + beltHeight / 2;

    // Servo Pivot Base
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5 * this.scale;
    ctx.beginPath();
    ctx.arc(servoX, pivotY, 13 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Servo Arm / Flap
    const rad = ((this.currentAngle - 90) * Math.PI) / 180;
    const armLength = 58 * this.scale;
    const armEndX = servoX + Math.cos(rad) * armLength;
    const armEndY = pivotY + Math.sin(rad) * armLength;

    // Draw arm
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 5 * this.scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(servoX, pivotY);
    ctx.lineTo(armEndX, armEndY);
    ctx.stroke();

    // Flap blade
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 8 * this.scale;
    ctx.beginPath();
    ctx.moveTo(servoX + Math.cos(rad) * 16 * this.scale, pivotY + Math.sin(rad) * 16 * this.scale);
    ctx.lineTo(armEndX, armEndY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Pivot center dot
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(servoX, pivotY, 4 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#b45309';
    ctx.font = `bold ${10.5 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Servo SG90 (${Math.round(this.currentAngle)}°)`, servoX, beltY - 20 * this.scale);
  }

  drawChutesAndBins() {
    const ctx = this.ctx;
    const servoX = this.width * this.servoStationX;
    const startX = servoX + 65 * this.scale;
    const binWidth = this.width - startX - 16 * this.scale;

    this.chutes.forEach((chute) => {
      const chuteY = this.height * chute.targetYRatio;
      const chuteHeight = 28 * this.scale;

      // Guide rail leading from servo to chute
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2 * this.scale;
      ctx.beginPath();
      ctx.moveTo(servoX + 25 * this.scale, this.height * 0.44 + 25 * this.scale);
      ctx.lineTo(startX, chuteY + chuteHeight / 2);
      ctx.stroke();

      // Bin Chute Box
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = chute.color;
      ctx.lineWidth = 2 * this.scale;
      ctx.fillRect(startX, chuteY, binWidth, chuteHeight);
      ctx.strokeRect(startX, chuteY, binWidth, chuteHeight);

      // Chute label
      ctx.fillStyle = chute.color;
      ctx.font = `bold ${11 * this.scale}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`${chute.name}`, startX + 8 * this.scale, chuteY + chuteHeight / 2 + 4 * this.scale);
    });
  }

  drawSingleItem(ctx, item, isWaitingAtGate = false) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, item.opacity));
    ctx.translate(item.x, item.y);

    const r = (item.radius || 14) * this.scale;

    // Clean Flat Body without glow blur
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Crisp white border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8 * this.scale;
    ctx.stroke();

    // Technical Code Monogram (ALU, FE, PET, MISC, BIO)
    const codeText = item.code || item.type || '';
    const fontSize = Math.max(8 * this.scale, r * 0.72);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(codeText, 0, 0.5 * this.scale);

    // Floating text label with minimalist badge
    ctx.font = `600 ${9 * this.scale}px sans-serif`;
    let labelText = item.label;
    if (isWaitingAtGate) {
      labelText = `${item.label} (Chờ AI...)`;
    }
    const textWidth = ctx.measureText(labelText).width;
    const padX = 5 * this.scale;
    const pillH = 13 * this.scale;
    const pillY = -(r + 13 * this.scale);

    ctx.fillStyle = isWaitingAtGate ? 'rgba(180, 83, 9, 0.95)' : 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(-textWidth / 2 - padX, pillY, textWidth + padX * 2, pillH, 3 * this.scale);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 0, pillY + pillH / 2 + 0.5 * this.scale);

    ctx.restore();
  }

  updateAndDrawItems() {
    if (this.items.length === 0) {
      this.isScanning = false;
      this.servoAngle = 90;
      this.isStationBlocked = false;
      return;
    }

    const ctx = this.ctx;
    const scannerX = this.width * this.aiScannerX;
    const servoX = this.width * this.servoStationX;
    const gateStopX = scannerX - 34 * this.scale;
    const minGap = 68 * this.scale;

    let hasScannedItemBeforeServo = this.items.some(
      it => it.scanned && !it.deflected && it.type !== 'LIVING'
    );
    const leadingUnscanned = this.items.find(it => !it.deflected && !it.scanned);

    let anyScanning = false;
    let targetServoAngle = 90;
    let closestToServoDist = Infinity;
    let prevBeltItemX = Infinity;
    let anyUnscannedMoved = false;

    const stepFactor = this.dtFactor || 1;

    this.items = this.items.filter(item => {
      if (this.isConveyorRunning) {
        if (!item.deflected) {
          const isGateClosedNow = this.isServerSorting || hasScannedItemBeforeServo;
          let nextX = item.x + this.beltSpeed * this.scale * stepFactor;

          // Station Gating: hold un-scanned items right before AI Scanner while busy
          if (!item.scanned && isGateClosedNow && nextX > gateStopX) {
            nextX = Math.max(item.x, gateStopX);
          }

          // Queue Spacing: keep neat spacing behind any item ahead on the belt
          if (nextX > prevBeltItemX - minGap) {
            nextX = Math.max(item.x, prevBeltItemX - minGap);
          }

          if (!item.scanned && nextX > item.x + 0.01) {
            anyUnscannedMoved = true;
          }

          item.x = nextX;
          prevBeltItemX = item.x;

          // Check if passing camera scanner (only trigger scan when gate is open)
          if (Math.abs(item.x - scannerX) < 32 * this.scale) {
            anyScanning = true;
            if (!item.scanned && !(this.isServerSorting || hasScannedItemBeforeServo)) {
              item.scanned = true;
              if (item.type !== 'LIVING') {
                hasScannedItemBeforeServo = true;
              }
              if (this.onItemScanned) this.onItemScanned(item.type, item.size, item.increment, item.sizeLabel, item);
            }
          }

          // Check if approaching servo
          const distToServo = servoX - item.x;
          if (distToServo > -20 * this.scale && distToServo < 110 * this.scale) {
            if (distToServo < closestToServoDist) {
              closestToServoDist = distToServo;
              targetServoAngle = item.angle;
            }
          }

          // Transition to deflection once passing servo pivot
          if (item.x >= servoX) {
            if (item.type === 'LIVING') {
              if (item.x > this.width - 20 * this.scale) {
                return false;
              }
            } else {
              item.deflected = true;
              const chute = this.chutes.find(c => c.id === item.type) || this.chutes[3];
              item.targetY = this.height * chute.targetYRatio + 14 * this.scale;
              if (this.onItemDeflected) this.onItemDeflected(item.type, item.angle);
            }
          }
        } else {
          // Slide smoothly along chute rail
          item.x += (this.beltSpeed * 1.35) * this.scale * stepFactor;
          item.y += (item.targetY - item.y) * Math.min(0.5, 0.08 * stepFactor);

          // Fade out near end of chute
          if (item.x > this.width - 35 * this.scale) {
            item.opacity -= 0.04 * stepFactor;
            if (item.opacity <= 0) {
              if (!item.completed) {
                item.completed = true;
                if (typeof item.onComplete === 'function') {
                  item.onComplete(item.type, item.size, item.increment, item);
                }
                if (this.onItemSorted) this.onItemSorted(item.type, item.size, item.increment, item.sizeLabel, item);
              }
              return false; // remove from items array
            }
          }
        }
      }

      // Draw item
      if (item.x > -30 * this.scale) {
        const isWaitingAtGate =
          item === leadingUnscanned &&
          (this.isServerSorting || hasScannedItemBeforeServo) &&
          item.x >= gateStopX - 1;
        this.drawSingleItem(ctx, item, isWaitingAtGate);
      }

      return true;
    });

    this.isStationBlocked = !!(
      leadingUnscanned &&
      this.isServerSorting &&
      !hasScannedItemBeforeServo &&
      leadingUnscanned.x >= gateStopX - 0.5 &&
      !anyUnscannedMoved
    );
    this.isScanning = anyScanning;
    this.servoAngle = targetServoAngle;
  }
}

window.ConveyorAnimation = ConveyorAnimation;
