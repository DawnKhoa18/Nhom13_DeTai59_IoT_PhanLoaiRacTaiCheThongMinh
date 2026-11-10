/**
 * Waste Statistics Module
 * ---------------------------------------------------------------
 * Thống kê khối lượng rác theo loại + biểu đồ + bộ lọc thời gian.
 * - Đọc/ghi qua WasteDB (IndexedDB) trong waste-db.js
 * - Hoàn toàn độc lập: app.js chỉ gọi vài hàm public (recordSortedItem,
 *   recordBinEmpty, recordEvent) và đều được bọc try/catch.
 */
(function (global) {
  'use strict';

  const DBM = global.WasteDBModule || (typeof require !== 'undefined' ? require('./waste-db.js') : null);
  const MATERIALS = DBM.MATERIALS;
  const AGG_PREFIX = DBM.AGG_PREFIX;
  const toDateStr = DBM.toDateStr;
  const round3 = DBM.round3;

  const MAX_DAYS_ON_CHART = 731;

  // ---------------------------------------------------------------
  // Helpers thuần (đã được kiểm thử độc lập)
  // ---------------------------------------------------------------
  function fmtDate(dateStr) {
    const p = String(dateStr).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(dateStr);
  }

  function fmtKg(kg) {
    return `${(kg || 0).toFixed(3)} kg`;
  }

  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    // Dùng 12:00 trưa để không bị lệch ngày bởi giờ mùa hè (DST)
    return toDateStr(new Date(p[0], p[1] - 1, p[2] + n, 12, 0, 0));
  }

  function enumerateDays(fromStr, toStr) {
    const days = [];
    let cur = fromStr;
    let guard = 0;
    while (cur <= toStr && guard < 5000) {
      days.push(cur);
      cur = addDays(cur, 1);
      guard++;
    }
    return days;
  }

  /**
   * Quy đổi bộ lọc thành khoảng ngày [from, to] (YYYY-MM-DD, gồm cả 2 đầu).
   *  - today : hôm nay
   *  - week  : từ Thứ Hai của tuần hiện tại đến hôm nay
   *  - month : từ ngày 1 của tháng hiện tại đến hôm nay
   *  - all   : toàn bộ lịch sử (from = to = null)
   *  - custom: khoảng người dùng chọn
   */
  function resolveRange(preset, now, customFrom, customTo) {
    const ref = now instanceof Date ? now : new Date();
    const today = toDateStr(ref);

    if (preset === 'today') {
      return { from: today, to: today, label: `Hôm nay (${fmtDate(today)})` };
    }
    if (preset === 'week') {
      const dow = (ref.getDay() + 6) % 7; // Thứ Hai = 0 ... Chủ Nhật = 6
      const monday = toDateStr(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow, 12, 0, 0));
      return { from: monday, to: today, label: `Tuần này (${fmtDate(monday)} - ${fmtDate(today)})` };
    }
    if (preset === 'month') {
      const first = toDateStr(new Date(ref.getFullYear(), ref.getMonth(), 1, 12, 0, 0));
      return { from: first, to: today, label: `Tháng này (${fmtDate(first)} - ${fmtDate(today)})` };
    }
    if (preset === 'all') {
      return { from: null, to: null, label: 'Toàn bộ lịch sử' };
    }
    if (preset === 'custom') {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!re.test(customFrom || '') || !re.test(customTo || '')) {
        return { error: 'Vui lòng chọn đầy đủ "Từ ngày" và "Đến ngày".' };
      }
      if (customFrom > customTo) {
        return { error: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.' };
      }
      return { from: customFrom, to: customTo, label: `Từ ${fmtDate(customFrom)} đến ${fmtDate(customTo)}` };
    }
    return { error: 'Bộ lọc không hợp lệ.' };
  }

  /** Tổng hợp từ các dòng daily_aggregates (cộng theo gram để không sai số thực). */
  function summarize(aggregates) {
    const out = { totalCount: 0, totalKg: 0, byMaterial: {} };
    let totalGrams = 0;
    MATERIALS.forEach((m) => { out.byMaterial[m] = { count: 0, kg: 0 }; });
    const grams = {};
    MATERIALS.forEach((m) => { grams[m] = 0; });

    (aggregates || []).forEach((a) => {
      out.totalCount += a.totalCount || 0;
      MATERIALS.forEach((m) => {
        const p = AGG_PREFIX[m];
        out.byMaterial[m].count += a[p + 'Count'] || 0;
        grams[m] += Math.round((a[p + 'WeightKg'] || 0) * 1000);
      });
    });
    MATERIALS.forEach((m) => {
      out.byMaterial[m].kg = round3(grams[m] / 1000);
      totalGrams += grams[m];
    });
    out.totalKg = round3(totalGrams / 1000);
    return out;
  }

  /** Chuỗi theo NGÀY: mỗi ngày trong khoảng lọc 1 cột (ngày không có rác = 0). */
  function buildDailySeries(aggregates, fromStr, toStr, todayStr) {
    const rows = aggregates || [];
    let from = fromStr;
    let to = toStr;
    if (!from || !to) {
      from = rows.length ? rows[0].dateStr : todayStr;
      to = rows.length ? rows[rows.length - 1].dateStr : todayStr;
    }
    let days = enumerateDays(from, to);
    if (days.length > MAX_DAYS_ON_CHART) days = days.slice(days.length - MAX_DAYS_ON_CHART);

    const map = {};
    rows.forEach((r) => { map[r.dateStr] = r; });
    const multiYear = days.length > 0 && days[0].slice(0, 4) !== days[days.length - 1].slice(0, 4);
    const labels = days.map((d) => {
      const p = d.split('-');
      return multiYear ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : `${p[2]}/${p[1]}`;
    });

    const series = {};
    MATERIALS.forEach((m) => {
      const key = AGG_PREFIX[m] + 'WeightKg';
      series[m] = days.map((d) => (map[d] ? map[d][key] || 0 : 0));
    });
    return { mode: 'day', labels: labels, days: days, series: series };
  }

  /** Chuỗi theo GIỜ (0-23h) cho bộ lọc 1 ngày (Hôm nay / 1 ngày tùy chọn). */
  function buildHourlySeries(records) {
    const labels = [];
    for (let h = 0; h < 24; h++) labels.push(`${String(h).padStart(2, '0')}h`);
    const grams = {};
    MATERIALS.forEach((m) => { grams[m] = new Array(24).fill(0); });
    (records || []).forEach((r) => {
      const h = new Date(r.timestamp).getHours();
      const m = grams[r.material] ? r.material : 'UNKNOWN';
      grams[m][h] += r.weightGram;
    });
    const series = {};
    MATERIALS.forEach((m) => { series[m] = grams[m].map((g) => round3(g / 1000)); });
    return { mode: 'hour', labels: labels, series: series };
  }

  function summarizeEvents(events) {
    const c = { E_STOP: 0, LIVING_BIO: 0, BIN_FULL: 0, RESUME: 0 };
    (events || []).forEach((e) => { if (c[e.eventType] !== undefined) c[e.eventType]++; });
    return c;
  }

  function summarizeCycles(cycles) {
    let grams = 0;
    (cycles || []).forEach((c) => { grams += Math.round((c.estimatedWeightClearedKg || 0) * 1000); });
    return { count: (cycles || []).length, kg: round3(grams / 1000) };
  }

  // ---------------------------------------------------------------
  // Lớp giao diện
  // ---------------------------------------------------------------
  const PRESET_BUTTONS = {
    today: 'statPresetToday',
    week: 'statPresetWeek',
    month: 'statPresetMonth',
    all: 'statPresetAll'
  };
  const CARD_IDS = {
    ALUMINUM: 'Alu',
    STEEL: 'Steel',
    PLASTIC: 'Plastic',
    UNKNOWN: 'Unknown'
  };

  class WasteStatistics {
    constructor(options) {
      const opts = options || {};
      this.db = opts.db;
      this.doc = opts.document || global.document;
      this.Chart = opts.Chart || global.Chart || null;
      this.nowFn = opts.now || (() => new Date());
      this.preset = 'today';
      this.customFrom = '';
      this.customTo = '';
      this._seq = 0;
      this._timer = null;
      this._barChart = null;
      this._donutChart = null;
      this._centerKg = '0.000 kg';
      this._ready = false;
    }

    $(id) {
      return this.doc && this.doc.getElementById ? this.doc.getElementById(id) : null;
    }

    _setText(id, text) {
      const el = this.$(id);
      if (el) el.innerText = text;
    }

    _message(text, isError) {
      const el = this.$('statMessage');
      if (!el) return;
      el.innerText = text || '';
      el.style.display = text ? 'block' : 'none';
      el.className = 'stat-message' + (isError ? ' error' : '');
    }

    _updateEngineBadge() {
      const badge = this.$('statDbEngineBadge');
      if (!badge) return;
      if (this.db && this.db.mode === 'SERVER') {
        badge.innerHTML = '<span class="status-dot"></span> CSDL: Docker Server (SQLite)';
        badge.className = 'stat-engine-badge server';
        badge.title = 'Đang kết nối CSDL trung tâm Docker SQLite 24/7 qua REST API (/api/)';
      } else {
        badge.innerHTML = '<span class="status-dot"></span> CSDL: Cục bộ (IndexedDB)';
        badge.className = 'stat-engine-badge local';
        badge.title = 'Đang chạy ngoại tuyến, lưu trữ bằng IndexedDB cục bộ của trình duyệt';
      }
    }

    init() {
      const on = (id, fn) => {
        const el = this.$(id);
        if (el) el.addEventListener('click', fn);
      };
      Object.keys(PRESET_BUTTONS).forEach((p) => on(PRESET_BUTTONS[p], () => this.setPreset(p)));
      on('btnStatApply', () => this.applyCustom());
      on('btnStatSeed', () => this.seedSample());
      on('btnStatExport', () => this.downloadCsv());
      on('btnStatClear', () => this.clearHistory());

      if (this.db) {
        this.db.onEngineChange = () => this._updateEngineBadge();
      }

      if (!this.db || !this.db.isSupported) {
        this._message('Trình duyệt không hỗ trợ IndexedDB nên không thể lưu thống kê.', true);
        return Promise.resolve();
      }
      return this.db.open().then(() => {
        this._ready = true;
        this._updateEngineBadge();
        return this.setPreset('today');
      }).catch((e) => {
        this._message('Không mở được cơ sở dữ liệu thống kê: ' + (e && e.message ? e.message : e), true);
      });
    }

    setPreset(preset) {
      this.preset = preset;
      this._markActive(preset);
      this._message('');
      return this.refresh();
    }

    applyCustom() {
      const from = this.$('statDateFrom');
      const to = this.$('statDateTo');
      this.customFrom = from ? from.value : '';
      this.customTo = to ? to.value : '';
      const range = resolveRange('custom', this.nowFn(), this.customFrom, this.customTo);
      if (range.error) {
        this._message(range.error, true);
        return Promise.resolve();
      }
      this.preset = 'custom';
      this._markActive('custom');
      this._message('');
      return this.refresh();
    }

    _markActive(preset) {
      Object.keys(PRESET_BUTTONS).forEach((p) => {
        const el = this.$(PRESET_BUTTONS[p]);
        if (!el || !el.classList) return;
        if (p === preset) el.classList.add('active'); else el.classList.remove('active');
      });
      const apply = this.$('btnStatApply');
      if (apply && apply.classList) {
        if (preset === 'custom') apply.classList.add('active'); else apply.classList.remove('active');
      }
    }

    _currentRange() {
      return resolveRange(this.preset, this.nowFn(), this.customFrom, this.customTo);
    }

    scheduleRefresh() {
      if (!this._ready) return;
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => { this._timer = null; this.refresh(); }, 250);
    }

    refresh() {
      if (!this._ready) return Promise.resolve();
      const seq = ++this._seq;
      const range = this._currentRange();
      if (range.error) {
        this._message(range.error, true);
        return Promise.resolve();
      }
      const singleDay = !!(range.from && range.from === range.to);

      return Promise.all([
        this.db.queryAggregates(range.from, range.to),
        this.db.queryBinCycles(range.from, range.to),
        this.db.querySystemEvents(range.from, range.to),
        singleDay ? this.db.queryRecords(range.from, range.to) : Promise.resolve(null)
      ]).then((res) => {
        if (seq !== this._seq) return; // đã có lần làm mới mới hơn
        this._render(range, res[0], res[1], res[2], res[3]);
      }).catch((e) => {
        this._message('Không đọc được dữ liệu thống kê: ' + (e && e.message ? e.message : e), true);
      });
    }

    _render(range, aggregates, cycles, events, dayRecords) {
      const sum = summarize(aggregates);
      const today = toDateStr(this.nowFn());

      this._setText('statRangeLabel', range.label);
      this._setText('statTotalKg', fmtKg(sum.totalKg));
      this._setText('statTotalMeta', `${sum.totalCount} vật thể · ${Math.round(sum.totalKg * 1000)} g`);

      MATERIALS.forEach((m) => {
        const id = CARD_IDS[m];
        const d = sum.byMaterial[m];
        const share = sum.totalKg > 0 ? ((d.kg / sum.totalKg) * 100).toFixed(1) : '0.0';
        this._setText(`stat${id}Kg`, fmtKg(d.kg));
        this._setText(`stat${id}Meta`, `${d.count} vật · ${Math.round(d.kg * 1000)} g · ${share}%`);
      });

      const cy = summarizeCycles(cycles);
      const ev = summarizeEvents(events);
      this._setText('statCycleSummary', `Chu kỳ đổ thùng: ${cy.count} lần · thu gom ước tính ${fmtKg(cy.kg)}`);
      this._setText('statEventSummary',
        `Sự kiện an toàn: Dừng khẩn cấp ${ev.E_STOP} · Sinh vật sống ${ev.LIVING_BIO} · Thùng đầy ${ev.BIN_FULL}`);

      const hint = this.$('statEmptyHint');
      if (hint) hint.style.display = sum.totalCount === 0 ? 'block' : 'none';

      const series = dayRecords ? buildHourlySeries(dayRecords) : buildDailySeries(aggregates, range.from, range.to, today);
      this._setText('statBarTitle', 'So sánh & Xếp hạng khối lượng các loại rác (kg)');

      this._centerKg = fmtKg(sum.totalKg);
      this._renderCharts(series, sum);
    }

    _renderCharts(series, sum) {
      const Chart = this.Chart;
      const barCanvas = this.$('statBarCanvas');
      const donutCanvas = this.$('statDonutCanvas');
      if (!Chart) {
        this._message('Không tải được thư viện biểu đồ (Chart.js). Số liệu dạng thẻ vẫn hoạt động.', true);
        return;
      }
      const cfgs = this.db.getMaterialConfigs();

      if (barCanvas) {
        // Chuẩn bị dữ liệu xếp hạng 4 loại rác theo khối lượng giảm dần (Đề xuất 2)
        const rankItems = cfgs.map((c) => {
          const m = sum.byMaterial[c.material] || { kg: 0, count: 0, grams: 0 };
          const pct = sum.totalKg > 0 ? (m.kg / sum.totalKg) * 100 : 0;
          return {
            material: c.material,
            displayName: c.displayName,
            colorHex: c.colorHex,
            kg: m.kg,
            count: m.count,
            grams: Math.round(m.kg * 1000),
            pct: pct
          };
        }).sort((a, b) => b.kg - a.kg);

        const rankLabels = rankItems.map((it) => it.displayName);
        const rankValues = rankItems.map((it) => it.kg);
        const rankColors = rankItems.map((it) => it.colorHex);

        this._currentRankItems = rankItems;

        if (!this._barChart) {
          const self = this;
          this._barChart = new Chart(barCanvas, {
            type: 'bar',
            data: {
              labels: rankLabels,
              datasets: [{
                label: 'Khối lượng (kg)',
                data: rankValues,
                backgroundColor: rankColors,
                borderRadius: 6,
                borderSkipped: false,
                barPercentage: 0.62,
                categoryPercentage: 0.85
              }]
            },
            options: {
              indexAxis: 'y', // Biểu đồ thanh ngang (Proposal 2)
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 250 },
              layout: {
                padding: { right: 85, top: 8, bottom: 8 }
              },
              scales: {
                x: {
                  beginAtZero: true,
                  grace: '18%',
                  title: {
                    display: true,
                    text: 'Khối lượng (kg)',
                    color: '#64748b',
                    font: { size: 12, weight: '600' }
                  },
                  grid: { color: 'rgba(226, 232, 240, 0.7)' },
                  ticks: { color: '#64748b', font: { size: 11 } }
                },
                y: {
                  grid: { display: false },
                  ticks: {
                    color: '#0f172a',
                    font: { size: 13, weight: '700' }
                  }
                }
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#0f172a',
                  titleFont: { size: 13, weight: 'bold' },
                  bodyFont: { size: 12 },
                  padding: 10,
                  cornerRadius: 6,
                  displayColors: true,
                  callbacks: {
                    title: (ctxList) => ctxList[0] ? ctxList[0].label : '',
                    label: (ctx) => {
                      const it = (self._currentRankItems || rankItems)[ctx.dataIndex];
                      if (!it) return '';
                      return [
                        `Khối lượng: ${it.kg.toFixed(3)} kg (${it.pct.toFixed(1)}%)`,
                        `Số lượng: ${it.count} vật thể (${it.grams} g)`
                      ];
                    }
                  }
                }
              }
            },
            plugins: [{
              id: 'horizontalBarLabels',
              afterDatasetsDraw: (chart) => {
                const items = self._currentRankItems || rankItems;
                const meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data) return;
                const ctx = chart.ctx;
                const xZero = chart.scales.x.getPixelForValue(0);

                meta.data.forEach((bar, idx) => {
                  const it = items[idx];
                  if (!it) return;
                  const xPos = Math.max(bar.x + 8, xZero + 8);
                  const yPos = bar.y;
                  const label = `${it.kg.toFixed(3)} kg (${it.pct.toFixed(1)}%)`;

                  ctx.save();
                  ctx.font = '600 12px Inter, system-ui, -apple-system, sans-serif';
                  ctx.fillStyle = it.kg > 0 ? '#0f172a' : '#94a3b8';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(label, xPos, yPos);
                  ctx.restore();
                });
              }
            }]
          });
        } else {
          this._barChart.data.labels = rankLabels;
          this._barChart.data.datasets[0].data = rankValues;
          this._barChart.data.datasets[0].backgroundColor = rankColors;
          this._barChart.update();
        }
      }

      if (donutCanvas) {
        const labels = cfgs.map((c) => c.displayName);
        const values = cfgs.map((c) => sum.byMaterial[c.material].kg);
        const colors = cfgs.map((c) => c.colorHex);
        if (!this._donutChart) {
          const self = this;
          this._donutChart = new Chart(donutCanvas, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2 }] },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '62%',
              animation: { duration: 250 },
              plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                      return `${ctx.label}: ${Number(ctx.parsed).toFixed(3)} kg (${pct}%)`;
                    }
                  }
                }
              }
            },
            plugins: [{
              id: 'wasteCenterText',
              afterDraw: (chart) => {
                const area = chart.chartArea;
                if (!area) return;
                const ctx = chart.ctx;
                const cx = (area.left + area.right) / 2;
                const cy = (area.top + area.bottom) / 2;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 17px sans-serif';
                ctx.fillText(self._centerKg, cx, cy - 8);
                ctx.fillStyle = '#475569';
                ctx.font = '600 12px sans-serif';
                ctx.fillText('tổng khối lượng', cx, cy + 12);
                ctx.restore();
              }
            }]
          });
        } else {
          this._donutChart.data.labels = labels;
          this._donutChart.data.datasets[0].data = values;
          this._donutChart.update();
        }
      }
    }

    // ---- API công khai cho app.js ----
    recordSortedItem(type, size, increment, sizeLabel) {
      if (!this._ready || MATERIALS.indexOf(type) < 0) return Promise.resolve(null);
      return this.db.addWasteRecord({
        material: type,
        size: size,
        volumeIncrement: increment
      }).then((rec) => {
        this.scheduleRefresh();
        return rec;
      }).catch((e) => {
        console.warn('[WasteStatistics] Không ghi được thống kê:', e);
        return null;
      });
    }

    recordBinEmpty(levels, source) {
      if (!this._ready) return Promise.resolve(null);
      const lv = levels || {};
      const total = (lv.aluminum || 0) + (lv.steel || 0) + (lv.plastic || 0) + (lv.inspection || 0);
      if (total <= 0) return Promise.resolve(null); // bấm "Đặt lại" khi thùng đang trống => bỏ qua
      return this.db.recordBinCycle({ triggerSource: source || 'WEB_BUTTON', levels: lv })
        .then((c) => { this.scheduleRefresh(); return c; })
        .catch((e) => { console.warn('[WasteStatistics] Không ghi được chu kỳ đổ thùng:', e); return null; });
    }

    recordEvent(eventType, severity, description) {
      if (!this._ready) return Promise.resolve(null);
      return this.db.recordSystemEvent({ eventType: eventType, severity: severity, description: description })
        .then((r) => { this.scheduleRefresh(); return r; })
        .catch((e) => { console.warn('[WasteStatistics] Không ghi được sự kiện:', e); return null; });
    }

    // ---- Hành động trên thanh công cụ ----
    seedSample() {
      return this.db.seedSampleData(30).then((n) => {
        this._message(`Đã nạp ${n} bản ghi mẫu cho 30 ngày gần nhất (cột "source" = SAMPLE trong file CSV).`, false);
        return this.refresh();
      }).catch((e) => this._message('Không nạp được dữ liệu mẫu: ' + e.message, true));
    }

    clearHistory() {
      const ok = typeof global.confirm === 'function'
        ? global.confirm('Xóa TOÀN BỘ lịch sử thống kê (rác, chu kỳ đổ thùng, sự kiện)? Thao tác không thể hoàn tác.')
        : true;
      if (!ok) return Promise.resolve();
      return this.db.clearAllData().then(() => {
        this._message('Đã xóa toàn bộ lịch sử thống kê.', false);
        return this.refresh();
      }).catch((e) => this._message('Không xóa được dữ liệu: ' + e.message, true));
    }

    downloadCsv() {
      const range = this._currentRange();
      if (range.error) {
        this._message(range.error, true);
        return Promise.resolve();
      }
      return this.db.exportCsv(range.from, range.to).then((csv) => {
        if (csv.split('\r\n').length <= 1) {
          this._message('Không có dữ liệu trong khoảng đã chọn để xuất.', true);
          return;
        }
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = this.doc.createElement('a');
        a.href = url;
        a.download = `thong-ke-rac_${range.from || 'tat-ca'}_${range.to || 'tat-ca'}.csv`;
        this.doc.body.appendChild(a);
        a.click();
        this.doc.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }).catch((e) => this._message('Không xuất được CSV: ' + e.message, true));
    }
  }

  const api = {
    WasteStatistics: WasteStatistics,
    fmtDate: fmtDate,
    fmtKg: fmtKg,
    addDays: addDays,
    enumerateDays: enumerateDays,
    resolveRange: resolveRange,
    summarize: summarize,
    buildDailySeries: buildDailySeries,
    buildHourlySeries: buildHourlySeries,
    summarizeEvents: summarizeEvents,
    summarizeCycles: summarizeCycles
  };
  global.WasteStatisticsModule = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  // ---- Tự khởi động trên trình duyệt ----
  function boot() {
    if (global.__WASTE_STATS_NO_BOOT || !global.document || !global.WasteDBModule) return;
    const stats = new WasteStatistics({ db: new global.WasteDBModule.WasteDB() });
    global.wasteStatistics = stats;
    stats.init();
  }
  if (typeof document !== 'undefined' && global.document === document) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
