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

    // Multi-item Queue
    this.items = [];
    this.itemIdCounter = 0;

    // Station Positions along belt (normalized 0 to 1)
    this.irSensorX = 0.28;
    this.aiScannerX = 0.42;
    this.servoStationX = 0.65;

    // Chute target positions
    this.chutes = [
      { id: 'ALUMINUM', name: 'Nhôm (30°)', angle: 30, color: '#15803d', targetYRatio: 0.16 },
      { id: 'STEEL',    name: 'Sắt/thép (70°)', angle: 70, color: '#0369a1', targetYRatio: 0.37 },
      { id: 'PLASTIC',  name: 'Nhựa (110°)', angle: 110, color: '#c2410c', targetYRatio: 0.58 },
      { id: 'UNKNOWN',  name: 'Rác khác (150°)', angle: 150, color: '#b91c1c', targetYRatio: 0.79 }
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

  removeLivingItems() {
    const hadLiving = this.items.some(item => item.type === 'LIVING');
    this.items = this.items.filter(item => item.type !== 'LIVING');
    return hadLiving;
  }

  spawnItem(materialType, onComplete, chosenSize) {
    let color = '#475569';
    let icon = '📦';
    let label = 'Unknown';
    let angle = 90;

    if (materialType === 'ALUMINUM') {
      color = '#15803d';
      icon = '🥫';
      label = 'Nhôm';
      angle = 30;
    } else if (materialType === 'STEEL') {
      color = '#0369a1';
      icon = '🔩';
      label = 'Sắt/thép';
      angle = 70;
    } else if (materialType === 'PLASTIC') {
      color = '#c2410c';
      icon = '🧴';
      label = 'Nhựa';
      angle = 110;
    } else if (materialType === 'UNKNOWN') {
      color = '#b91c1c';
      icon = '❓';
      label = 'Rác khác';
      angle = 150;
    } else if (materialType === 'LIVING') {
      color = '#db2777';
      icon = '🐭';
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
      icon: icon,
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
    const dt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Smooth servo angle transition
    this.currentAngle += (this.servoAngle - this.currentAngle) * 0.12;

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
    this.updateAndDrawItems();

    requestAnimationFrame(this.animate);
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
      ctx.fillText('► ► ►  Băng chuyền đang chạy', 60 * this.scale, beltY + beltHeight / 2 + 4 * this.scale);
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

  drawSingleItem(ctx, item) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, item.opacity));
    ctx.translate(item.x, item.y);

    const r = (item.radius || 14) * this.scale;
    const fontIconSize = (item.radius ? item.radius : 14) * this.scale;

    // Glow background
    ctx.fillStyle = item.color;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 6 * this.scale;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Crisp white border around item circle
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * this.scale;
    ctx.stroke();

    // Icon emoji
    ctx.font = `${fontIconSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, 0, 1 * this.scale);

    // Floating text label with high-contrast badge background
    ctx.font = `bold ${9.5 * this.scale}px sans-serif`;
    const labelText = item.label;
    const textWidth = ctx.measureText(labelText).width;
    const padX = 6 * this.scale;
    const pillH = 14 * this.scale;
    const pillY = -(r + 14 * this.scale);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(-textWidth / 2 - padX, pillY, textWidth + padX * 2, pillH, 4 * this.scale);
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
      return;
    }

    const ctx = this.ctx;
    const scannerX = this.width * this.aiScannerX;
    const servoX = this.width * this.servoStationX;

    let anyScanning = false;
    let targetServoAngle = 90;
    let closestToServoDist = Infinity;

    this.items = this.items.filter(item => {
      if (this.isConveyorRunning) {
        if (!item.deflected) {
          // Move forward along the belt
          item.x += this.beltSpeed * this.scale;

          // Check if passing camera scanner
          if (Math.abs(item.x - scannerX) < 32 * this.scale) {
            anyScanning = true;
            if (!item.scanned) {
              item.scanned = true;
              if (this.onItemScanned) this.onItemScanned(item.type, item.size, item.increment, item.sizeLabel);
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
          item.x += (this.beltSpeed * 1.35) * this.scale;
          item.y += (item.targetY - item.y) * 0.08;

          // Fade out near end of chute
          if (item.x > this.width - 35 * this.scale) {
            item.opacity -= 0.04;
            if (item.opacity <= 0) {
              if (!item.completed) {
                item.completed = true;
                if (typeof item.onComplete === 'function') {
                  item.onComplete(item.type, item.size, item.increment);
                }
                if (this.onItemSorted) this.onItemSorted(item.type, item.size, item.increment, item.sizeLabel);
              }
              return false; // remove from items array
            }
          }
        }
      }

      // Draw item
      if (item.x > -30 * this.scale) {
        this.drawSingleItem(ctx, item);
      }

      return true;
    });

    this.isScanning = anyScanning;
    this.servoAngle = targetServoAngle;
  }
}

window.ConveyorAnimation = ConveyorAnimation;
