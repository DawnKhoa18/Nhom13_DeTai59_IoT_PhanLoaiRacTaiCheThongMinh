/**
 * Waste Database Module (Hybrid Docker Server + IndexedDB Fallback)
 * ---------------------------------------------------------------
 * Hỗ trợ 2 chế độ:
 *   1. Chế độ SERVER (Khuyến nghị & Ưu tiên hàng đầu):
 *      Kết nối tới Docker Backend REST API (/api/) lưu trữ CSDL SQLite tập trung 24/7.
 *   2. Chế độ INDEXED_DB (Tự động chuyển đổi mượt mà khi chạy offline):
 *      Lưu trữ trên W3C IndexedDB cục bộ của trình duyệt nếu Backend chưa khởi động.
 *
 * Cả 2 chế độ đều quản lý 5 bảng:
 *   1. material_configs : định mức khối lượng S/M/L & thuộc tính 4 loại rác
 *   2. waste_records    : lịch sử từng vật thể rơi vào thùng (fact table)
 *   3. daily_aggregates : tổng hợp theo ngày (phục vụ lọc/biểu đồ nhanh)
 *   4. bin_cycles       : lịch sử các lần đổ thùng (EMPTY_BIN)
 *   5. system_events    : nhật ký an toàn (E-Stop, sinh vật sống, thùng đầy...)
 */
(function (global) {
  'use strict';

  const DB_NAME = 'SmartRecyclingDB';
  const DB_VERSION = 1;

  const STORE = {
    CONFIGS: 'material_configs',
    RECORDS: 'waste_records',
    AGGREGATES: 'daily_aggregates',
    CYCLES: 'bin_cycles',
    EVENTS: 'system_events'
  };

  const MATERIALS = ['ALUMINUM', 'STEEL', 'PLASTIC', 'UNKNOWN'];
  const SIZES = ['S', 'M', 'L'];
  const SIZE_INCREMENT = { S: 5, M: 10, L: 20 };

  // Tiền tố trường trong daily_aggregates theo từng vật liệu
  const AGG_PREFIX = {
    ALUMINUM: 'aluminum',
    STEEL: 'steel',
    PLASTIC: 'plastic',
    UNKNOWN: 'unknown'
  };

  // Định mức khối lượng chuẩn (gram) theo vật liệu & kích cỡ AI
  const DEFAULT_MATERIALS = [
    { material: 'ALUMINUM', displayName: 'Nhôm',     binName: 'Thùng nhôm',      binKey: 'aluminum',   servoAngle: 30,  weightSmall: 15, weightMedium: 25, weightLarge: 45,  colorHex: '#0f766e', icon: '' },
    { material: 'STEEL',    displayName: 'Sắt/thép', binName: 'Thùng sắt/thép',  binKey: 'steel',      servoAngle: 70,  weightSmall: 40, weightMedium: 85, weightLarge: 160, colorHex: '#1d4ed8', icon: '' },
    { material: 'PLASTIC',  displayName: 'Nhựa',     binName: 'Thùng nhựa',      binKey: 'plastic',    servoAngle: 110, weightSmall: 18, weightMedium: 30, weightLarge: 60,  colorHex: '#d97706', icon: '' },
    { material: 'UNKNOWN',  displayName: 'Rác khác', binName: 'Thùng rác khác',  binKey: 'inspection', servoAngle: 150, weightSmall: 25, weightMedium: 50, weightLarge: 110, colorHex: '#475569', icon: '' }
  ];

  // ---------------------------------------------------------------
  // Helpers thuần (không phụ thuộc DOM / IndexedDB)
  // ---------------------------------------------------------------
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Ngày theo GIỜ ĐỊA PHƯƠNG dạng YYYY-MM-DD (không dùng UTC để tránh lệch ngày). */
  function toDateStr(dateOrTs) {
    const d = dateOrTs instanceof Date ? dateOrTs : new Date(dateOrTs);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function toTimeStr(dateOrTs) {
    const d = dateOrTs instanceof Date ? dateOrTs : new Date(dateOrTs);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  /** Làm tròn 3 chữ số thập phân (khối lượng gram nguyên => kg luôn chính xác). */
  function round3(x) {
    return Math.round((x || 0) * 1000) / 1000;
  }

  function emptyAggregate(dateStr) {
    const agg = {
      dateStr: dateStr,
      totalCount: 0,
      totalWeightKg: 0,
      lastUpdated: Date.now()
    };
    MATERIALS.forEach((m) => {
      agg[AGG_PREFIX[m] + 'Count'] = 0;
      agg[AGG_PREFIX[m] + 'WeightKg'] = 0;
    });
    return agg;
  }

  /** Cộng (sign=+1) hoặc trừ (sign=-1) một bản ghi vào dòng tổng hợp ngày. */
  function applyToAggregate(agg, record, sign) {
    const s = sign || 1;
    const p = AGG_PREFIX[record.material] || AGG_PREFIX.UNKNOWN;
    agg.totalCount += s;
    agg.totalWeightKg = round3(agg.totalWeightKg + s * record.weightKg);
    agg[p + 'Count'] += s;
    agg[p + 'WeightKg'] = round3(agg[p + 'WeightKg'] + s * record.weightKg);
    agg.lastUpdated = Date.now();
    return agg;
  }

  function csvEscape(value) {
    const s = value === undefined || value === null ? '' : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function recordsToCsv(records) {
    const header = [
      'id', 'timestamp', 'date', 'time', 'material', 'size',
      'weight_g', 'weight_kg', 'volume_increment_percent',
      'bin', 'servo_angle', 'confidence', 'source'
    ];
    const lines = [header.join(',')];
    records.forEach((r) => {
      lines.push([
        r.id, r.timestamp, r.dateStr, r.timeStr, r.material, r.size,
        r.weightGram, r.weightKg, r.volumeIncrement,
        r.binKey, r.servoAngle, r.confidence, r.source
      ].map(csvEscape).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  // ---------------------------------------------------------------
  // WasteDB Hybrid Implementation
  // ---------------------------------------------------------------
  class WasteDB {
    constructor(options) {
      const opts = options || {};
      this._idb = opts.indexedDB || global.indexedDB || null;
      this._keyRange = opts.IDBKeyRange || global.IDBKeyRange || null;
      this._rng = opts.random || Math.random;
      this._db = null;
      this._openPromise = null;
      this._configs = {};
      DEFAULT_MATERIALS.forEach((m) => { this._configs[m.material] = Object.assign({}, m); });

      this.mode = 'CHECKING'; // 'SERVER' hoặc 'INDEXED_DB'
      this.serverBaseUrl = '';
      this.onEngineChange = opts.onEngineChange || null;
    }

    get isSupported() {
      return !!(this._idb && this._keyRange) || typeof global.fetch === 'function';
    }

    /** Kiểm tra xem Backend REST API có phản hồi hay không với timeout */
    async _checkServerHealth() {
      if (typeof global.fetch !== 'function') return null;

      const candidates = [
        '/api',
        'http://localhost:3000/api',
        'http://127.0.0.1:3000/api'
      ];

      for (const base of candidates) {
        try {
          const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = ctrl ? setTimeout(() => ctrl.abort(), 1800) : null;
          const res = await global.fetch(`${base}/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: ctrl ? ctrl.signal : undefined
          });
          if (timer) clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            if (data && data.status === 'ok') {
              return base;
            }
          }
        } catch (_) {
          // thử endpoint kế tiếp
        }
      }
      return null;
    }

    // ---- Mở CSDL & Tự động nhận diện Máy chủ / Cục bộ ----
    open() {
      if (this._openPromise) return this._openPromise;

      this._openPromise = (async () => {
        // 1. Thử kết nối Docker Backend REST API trước
        try {
          const serverUrl = await this._checkServerHealth();
          if (serverUrl) {
            this.serverBaseUrl = serverUrl;
            this.mode = 'SERVER';
            console.log(`[WasteDB] ĐÃ KẾT NỐI SERVER DATABASE (SQLite): ${serverUrl}`);

            // Nạp cấu hình từ server
            try {
              const cfgRes = await global.fetch(`${this.serverBaseUrl}/configs`);
              const cfgJson = await cfgRes.json();
              if (cfgJson && Array.isArray(cfgJson.data)) {
                cfgJson.data.forEach((c) => {
                  this._configs[c.material] = c;
                });
              }
            } catch (errCfg) {
              console.warn('[WasteDB] Không lấy được configs từ server, dùng mặc định:', errCfg);
            }

            if (typeof this.onEngineChange === 'function') {
              this.onEngineChange(this.mode, this.serverBaseUrl);
            }
            return this;
          }
        } catch (e) {
          console.warn('[WasteDB] Kiểm tra server thất bại, chuyển sang IndexedDB:', e);
        }

        // 2. Fallback sang IndexedDB nội bộ
        this.mode = 'INDEXED_DB';
        console.log('[WasteDB] Sử dụng Cơ sở dữ liệu Cục bộ (IndexedDB)');
        if (typeof this.onEngineChange === 'function') {
          this.onEngineChange(this.mode, null);
        }

        if (!this._idb || !this._keyRange) {
          throw new Error('Trình duyệt không hỗ trợ IndexedDB và không có kết nối Server');
        }

        return new Promise((resolve, reject) => {
          const req = this._idb.open(DB_NAME, DB_VERSION);

          req.onupgradeneeded = (ev) => {
            const db = req.result;

            const configs = db.createObjectStore(STORE.CONFIGS, { keyPath: 'material' });
            DEFAULT_MATERIALS.forEach((m) => configs.put(m));

            const records = db.createObjectStore(STORE.RECORDS, { keyPath: 'id', autoIncrement: true });
            records.createIndex('timestamp', 'timestamp', { unique: false });
            records.createIndex('dateStr', 'dateStr', { unique: false });
            records.createIndex('material', 'material', { unique: false });

            db.createObjectStore(STORE.AGGREGATES, { keyPath: 'dateStr' });

            const cycles = db.createObjectStore(STORE.CYCLES, { keyPath: 'id', autoIncrement: true });
            cycles.createIndex('timestamp', 'timestamp', { unique: false });
            cycles.createIndex('dateStr', 'dateStr', { unique: false });

            const events = db.createObjectStore(STORE.EVENTS, { keyPath: 'id', autoIncrement: true });
            events.createIndex('timestamp', 'timestamp', { unique: false });
            events.createIndex('dateStr', 'dateStr', { unique: false });
            events.createIndex('eventType', 'eventType', { unique: false });
          };

          req.onsuccess = () => {
            this._db = req.result;
            this._db.onversionchange = () => { this._db.close(); };

            // Nạp & đồng bộ bảng cấu hình
            try {
              const t = this._db.transaction([STORE.CONFIGS], 'readwrite');
              const store = t.objectStore(STORE.CONFIGS);
              const getAll = store.getAll();
              getAll.onsuccess = () => {
                (getAll.result || []).forEach((c) => {
                  if (MATERIALS.indexOf(c.material) >= 0) {
                    const def = DEFAULT_MATERIALS.find((d) => d.material === c.material);
                    if (def) {
                      c.colorHex = def.colorHex;
                      c.icon = '';
                      try { store.put(c); } catch (_) {}
                    }
                    this._configs[c.material] = c;
                  }
                });
              };
              t.oncomplete = () => resolve(this);
              t.onerror = () => resolve(this);
              t.onabort = () => resolve(this);
            } catch (e) {
              resolve(this);
            }
          };
          req.onerror = () => reject(req.error || new Error('Không mở được IndexedDB'));
          req.onblocked = () => reject(new Error('IndexedDB bị chặn bởi tab khác'));
        });
      })();

      return this._openPromise;
    }

    /** Chạy 1 transaction trên IndexedDB */
    _run(storeNames, mode, work) {
      return this.open().then((self) => new Promise((resolve, reject) => {
        let result;
        let t;
        try {
          t = self._db.transaction(storeNames, mode);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error || new Error('Lỗi transaction'));
        t.onabort = () => reject(t.error || new Error('Transaction bị hủy'));
        try {
          result = work(t);
        } catch (e) {
          try { t.abort(); } catch (_) {}
          reject(e);
        }
      }));
    }

    // ---- Cấu hình vật liệu ----
    getMaterialConfigs() {
      return MATERIALS.map((m) => Object.assign({}, this._configs[m]));
    }

    updateMaterialConfig(cfg) {
      if (!cfg || MATERIALS.indexOf(cfg.material) < 0) {
        return Promise.reject(new Error('Vật liệu không hợp lệ'));
      }
      const merged = Object.assign({}, this._configs[cfg.material], cfg);
      if (this.mode === 'SERVER') {
        this._configs[cfg.material] = merged;
        return Promise.resolve(merged);
      }
      return this._run([STORE.CONFIGS], 'readwrite', (t) => {
        t.objectStore(STORE.CONFIGS).put(merged);
        this._configs[cfg.material] = merged;
      });
    }

    /** Khối lượng gram theo vật liệu & kích cỡ (mặc định M, vật liệu lạ => UNKNOWN). */
    weightFor(material, size) {
      const cfg = this._configs[material] || this._configs.UNKNOWN;
      if (size === 'S') return cfg.weightSmall;
      if (size === 'L') return cfg.weightLarge;
      return cfg.weightMedium;
    }

    _normalizeRecord(input) {
      const rec = input || {};
      let material = String(rec.material || 'UNKNOWN').toUpperCase();
      if (MATERIALS.indexOf(material) < 0) material = 'UNKNOWN';
      let size = String(rec.size || 'M').toUpperCase();
      if (SIZES.indexOf(size) < 0) size = 'M';

      const ts = Number.isFinite(rec.timestamp) ? rec.timestamp : Date.now();
      const cfg = this._configs[material] || this._configs.UNKNOWN;
      const weightGram = Number.isFinite(rec.weightGram) ? rec.weightGram : this.weightFor(material, size);

      return {
        timestamp: ts,
        dateStr: toDateStr(ts),
        timeStr: toTimeStr(ts),
        material: material,
        size: size,
        weightGram: weightGram,
        weightKg: round3(weightGram / 1000),
        volumeIncrement: Number.isFinite(rec.volumeIncrement) ? rec.volumeIncrement : SIZE_INCREMENT[size],
        binKey: rec.binKey || cfg.binKey,
        servoAngle: Number.isFinite(rec.servoAngle) ? rec.servoAngle : cfg.servoAngle,
        confidence: Number.isFinite(rec.confidence) ? rec.confidence : (material === 'UNKNOWN' ? 42.0 : 96.5),
        source: rec.source || 'LIVE'
      };
    }

    // ---- Ghi 1 vật thể ----
    addWasteRecord(input) {
      return this.open().then(async () => {
        const record = this._normalizeRecord(input);

        if (this.mode === 'SERVER') {
          try {
            const res = await global.fetch(`${this.serverBaseUrl}/records`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(record)
            });
            if (res.ok) {
              const body = await res.json();
              return body.data || record;
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi gửi record lên server, lưu cục bộ:', e);
          }
        }

        // IndexedDB fallback
        return this._run([STORE.RECORDS, STORE.AGGREGATES], 'readwrite', (t) => {
          const recStore = t.objectStore(STORE.RECORDS);
          const aggStore = t.objectStore(STORE.AGGREGATES);

          const addReq = recStore.add(record);
          addReq.onsuccess = () => { record.id = addReq.result; };

          const getReq = aggStore.get(record.dateStr);
          getReq.onsuccess = () => {
            const agg = getReq.result || emptyAggregate(record.dateStr);
            aggStore.put(applyToAggregate(agg, record, 1));
          };
          return record;
        });
      });
    }

    // ---- Truy vấn theo khoảng ngày ----
    _range(fromStr, toStr) {
      return this._keyRange.bound(fromStr || '0000-01-01', toStr || '9999-12-31');
    }

    queryAggregates(fromStr, toStr) {
      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const qs = `from=${encodeURIComponent(fromStr || '')}&to=${encodeURIComponent(toStr || '')}`;
            const res = await global.fetch(`${this.serverBaseUrl}/stats?${qs}`);
            if (res.ok) {
              const data = await res.json();
              return data.aggregates || [];
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi queryAggregates từ server, fallback IndexedDB:', e);
          }
        }

        return this._run([STORE.AGGREGATES], 'readonly', (t) => {
          const out = [];
          const req = t.objectStore(STORE.AGGREGATES).getAll(this._range(fromStr, toStr));
          req.onsuccess = () => { req.result.forEach((r) => out.push(r)); };
          return out;
        }).then((rows) => rows.sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : 0)));
      });
    }

    queryRecords(fromStr, toStr) {
      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const qs = `from=${encodeURIComponent(fromStr || '')}&to=${encodeURIComponent(toStr || '')}`;
            const res = await global.fetch(`${this.serverBaseUrl}/records?${qs}`);
            if (res.ok) {
              const data = await res.json();
              return data.data || [];
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi queryRecords từ server, fallback IndexedDB:', e);
          }
        }

        return this._run([STORE.RECORDS], 'readonly', (t) => {
          const out = [];
          const req = t.objectStore(STORE.RECORDS).index('dateStr').getAll(this._range(fromStr, toStr));
          req.onsuccess = () => { req.result.forEach((r) => out.push(r)); };
          return out;
        }).then((rows) => rows.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id));
      });
    }

    queryBinCycles(fromStr, toStr) {
      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const qs = `from=${encodeURIComponent(fromStr || '')}&to=${encodeURIComponent(toStr || '')}`;
            const res = await global.fetch(`${this.serverBaseUrl}/stats?${qs}`);
            if (res.ok) {
              const data = await res.json();
              return data.cycles || [];
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi queryBinCycles từ server, fallback IndexedDB:', e);
          }
        }

        return this._run([STORE.CYCLES], 'readonly', (t) => {
          const out = [];
          const req = t.objectStore(STORE.CYCLES).index('dateStr').getAll(this._range(fromStr, toStr));
          req.onsuccess = () => { req.result.forEach((r) => out.push(r)); };
          return out;
        }).then((rows) => rows.sort((a, b) => a.timestamp - b.timestamp));
      });
    }

    querySystemEvents(fromStr, toStr) {
      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const qs = `from=${encodeURIComponent(fromStr || '')}&to=${encodeURIComponent(toStr || '')}`;
            const res = await global.fetch(`${this.serverBaseUrl}/stats?${qs}`);
            if (res.ok) {
              const data = await res.json();
              return data.events || [];
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi querySystemEvents từ server, fallback IndexedDB:', e);
          }
        }

        return this._run([STORE.EVENTS], 'readonly', (t) => {
          const out = [];
          const req = t.objectStore(STORE.EVENTS).index('dateStr').getAll(this._range(fromStr, toStr));
          req.onsuccess = () => { req.result.forEach((r) => out.push(r)); };
          return out;
        }).then((rows) => rows.sort((a, b) => a.timestamp - b.timestamp));
      });
    }

    // ---- Chu kỳ đổ thùng ----
    recordBinCycle(input) {
      const opts = input || {};
      const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
      const levels = opts.levels || {};
      const KR = this._keyRange;

      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const res = await global.fetch(`${this.serverBaseUrl}/cycles`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                timestamp: ts,
                triggerSource: opts.triggerSource || 'WEB_BUTTON',
                levels: levels
              })
            });
            if (res.ok) {
              const body = await res.json();
              return body.data;
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi gửi cycle lên server, fallback IndexedDB:', e);
          }
        }

        return this._run([STORE.CYCLES, STORE.RECORDS], 'readwrite', (t) => {
          const cycles = t.objectStore(STORE.CYCLES);
          const records = t.objectStore(STORE.RECORDS);
          const cycle = {
            timestamp: ts,
            dateStr: toDateStr(ts),
            timeStr: toTimeStr(ts),
            triggerSource: opts.triggerSource || 'WEB_BUTTON',
            levelsBeforeClear: JSON.stringify({
              aluminum: levels.aluminum || 0,
              steel: levels.steel || 0,
              plastic: levels.plastic || 0,
              inspection: levels.inspection || 0
            }),
            estimatedWeightClearedKg: 0
          };

          const cur = cycles.index('timestamp').openCursor(null, 'prev');
          cur.onsuccess = () => {
            const last = cur.result ? cur.result.value.timestamp : 0;
            const req = records.index('timestamp').getAll(KR.lowerBound(last, true));
            req.onsuccess = () => {
              const grams = req.result
                .filter((r) => r.source !== 'SAMPLE' && r.timestamp <= ts)
                .reduce((sum, r) => sum + r.weightGram, 0);
              cycle.estimatedWeightClearedKg = round3(grams / 1000);
              const add = cycles.add(cycle);
              add.onsuccess = () => { cycle.id = add.result; };
            };
          };
          return cycle;
        });
      });
    }

    // ---- Nhật ký sự kiện ----
    recordSystemEvent(input) {
      const ev = input || {};
      const ts = Number.isFinite(ev.timestamp) ? ev.timestamp : Date.now();
      const row = {
        timestamp: ts,
        dateStr: toDateStr(ts),
        eventType: ev.eventType || 'INFO',
        severity: ev.severity || 'INFO',
        description: ev.description || ''
      };

      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const res = await global.fetch(`${this.serverBaseUrl}/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(row)
            });
            if (res.ok) {
              const body = await res.json();
              return body.data || row;
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi gửi event lên server, fallback IndexedDB:', e);
          }
        }

        return this._run([STORE.EVENTS], 'readwrite', (t) => {
          const add = t.objectStore(STORE.EVENTS).add(row);
          add.onsuccess = () => { row.id = add.result; };
          return row;
        });
      });
    }

    // ---- Tính lại toàn bộ daily_aggregates từ waste_records (kiểm tra toàn vẹn) ----
    _rebuildAggregatesInTx(t) {
      const recStore = t.objectStore(STORE.RECORDS);
      const aggStore = t.objectStore(STORE.AGGREGATES);
      const all = recStore.getAll();
      all.onsuccess = () => {
        const byDate = {};
        all.result.forEach((r) => {
          if (!byDate[r.dateStr]) byDate[r.dateStr] = emptyAggregate(r.dateStr);
          applyToAggregate(byDate[r.dateStr], r, 1);
        });
        aggStore.clear();
        Object.keys(byDate).forEach((k) => aggStore.put(byDate[k]));
      };
    }

    rebuildAggregates() {
      if (this.mode === 'SERVER') return Promise.resolve();
      return this._run([STORE.RECORDS, STORE.AGGREGATES], 'readwrite', (t) => {
        this._rebuildAggregatesInTx(t);
      });
    }

    // ---- Dữ liệu mẫu N ngày gần nhất (đánh dấu source = SAMPLE) ----
    seedSampleData(days) {
      const nDays = Math.max(1, Math.min(365, Math.floor(days || 30)));

      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const res = await global.fetch(`${this.serverBaseUrl}/seed-sample`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ days: nDays })
            });
            if (res.ok) {
              const body = await res.json();
              return body.count || 0;
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi nạp mẫu từ server, fallback IndexedDB:', e);
          }
        }

        const now = Date.now();
        const rng = this._rng;
        const pickWeighted = (items) => {
          const total = items.reduce((s, i) => s + i.w, 0);
          let r = rng() * total;
          for (let i = 0; i < items.length; i++) {
            r -= items[i].w;
            if (r < 0) return items[i].v;
          }
          return items[items.length - 1].v;
        };
        const materialPool = [
          { v: 'ALUMINUM', w: 28 }, { v: 'STEEL', w: 22 },
          { v: 'PLASTIC', w: 35 }, { v: 'UNKNOWN', w: 15 }
        ];
        const sizePool = [{ v: 'S', w: 30 }, { v: 'M', w: 50 }, { v: 'L', w: 20 }];

        const records = [];
        for (let back = nDays - 1; back >= 0; back--) {
          const day = new Date(now);
          day.setHours(0, 0, 0, 0);
          day.setDate(day.getDate() - back);
          const dayStart = day.getTime() + 7 * 3600 * 1000;
          const dayEnd = Math.min(day.getTime() + 18 * 3600 * 1000, now);
          if (dayEnd <= dayStart) continue;
          const count = 8 + Math.floor(rng() * 18);
          for (let i = 0; i < count; i++) {
            const ts = Math.floor(dayStart + rng() * (dayEnd - dayStart));
            const rec = this._normalizeRecord({
              timestamp: ts,
              material: pickWeighted(materialPool),
              size: pickWeighted(sizePool),
              source: 'SAMPLE'
            });
            records.push(rec);
          }
        }

        return this._run([STORE.RECORDS, STORE.AGGREGATES], 'readwrite', (t) => {
          const recStore = t.objectStore(STORE.RECORDS);
          records.forEach((r) => recStore.add(r));
          this._rebuildAggregatesInTx(t);
        }).then(() => records.length);
      });
    }

    // ---- Xóa dữ liệu (giữ nguyên bảng cấu hình định mức) ----
    clearAllData() {
      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const res = await global.fetch(`${this.serverBaseUrl}/clear`, {
              method: 'POST'
            });
            if (res.ok) return true;
          } catch (e) {
            console.warn('[WasteDB] Lỗi xóa dữ liệu trên server, fallback IndexedDB:', e);
          }
        }

        return this._run(
          [STORE.RECORDS, STORE.AGGREGATES, STORE.CYCLES, STORE.EVENTS],
          'readwrite',
          (t) => {
            t.objectStore(STORE.RECORDS).clear();
            t.objectStore(STORE.AGGREGATES).clear();
            t.objectStore(STORE.CYCLES).clear();
            t.objectStore(STORE.EVENTS).clear();
          }
        );
      });
    }

    exportCsv(fromStr, toStr) {
      return this.open().then(async () => {
        if (this.mode === 'SERVER') {
          try {
            const qs = `from=${encodeURIComponent(fromStr || '')}&to=${encodeURIComponent(toStr || '')}`;
            const res = await global.fetch(`${this.serverBaseUrl}/export-csv?${qs}`);
            if (res.ok) {
              return await res.text();
            }
          } catch (e) {
            console.warn('[WasteDB] Lỗi exportCsv từ server, fallback queryRecords:', e);
          }
        }
        return this.queryRecords(fromStr, toStr).then(recordsToCsv);
      });
    }
  }

  const api = {
    WasteDB: WasteDB,
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORE: STORE,
    MATERIALS: MATERIALS,
    SIZES: SIZES,
    SIZE_INCREMENT: SIZE_INCREMENT,
    AGG_PREFIX: AGG_PREFIX,
    DEFAULT_MATERIALS: DEFAULT_MATERIALS,
    toDateStr: toDateStr,
    toTimeStr: toTimeStr,
    round3: round3,
    emptyAggregate: emptyAggregate,
    applyToAggregate: applyToAggregate,
    recordsToCsv: recordsToCsv
  };

  global.WasteDBModule = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
