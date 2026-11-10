'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MATERIALS = ['ALUMINUM', 'STEEL', 'PLASTIC', 'UNKNOWN'];
const SIZES = ['S', 'M', 'L'];
const SIZE_INCREMENT = { S: 5, M: 10, L: 20 };

const AGG_PREFIX = {
  ALUMINUM: 'aluminum',
  STEEL: 'steel',
  PLASTIC: 'plastic',
  UNKNOWN: 'unknown'
};

const DEFAULT_MATERIALS = [
  { material: 'ALUMINUM', displayName: 'Nhôm',     binName: 'Thùng nhôm',      binKey: 'aluminum',   servoAngle: 30,  weightSmall: 15, weightMedium: 25, weightLarge: 45,  colorHex: '#0f766e', icon: '' },
  { material: 'STEEL',    displayName: 'Sắt/thép', binName: 'Thùng sắt/thép',  binKey: 'steel',      servoAngle: 70,  weightSmall: 40, weightMedium: 85, weightLarge: 160, colorHex: '#1d4ed8', icon: '' },
  { material: 'PLASTIC',  displayName: 'Nhựa',     binName: 'Thùng nhựa',      binKey: 'plastic',    servoAngle: 110, weightSmall: 18, weightMedium: 30, weightLarge: 60,  colorHex: '#d97706', icon: '' },
  { material: 'UNKNOWN',  displayName: 'Rác khác', binName: 'Thùng rác khác',  binKey: 'inspection', servoAngle: 150, weightSmall: 25, weightMedium: 50, weightLarge: 110, colorHex: '#475569', icon: '' }
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(dateOrTs) {
  const d = dateOrTs instanceof Date ? dateOrTs : new Date(dateOrTs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toTimeStr(dateOrTs) {
  const d = dateOrTs instanceof Date ? dateOrTs : new Date(dateOrTs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function round3(x) {
  return Math.round(Number(x || 0) * 1000) / 1000;
}

function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

class ServerDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath || process.env.DB_FILE || path.join(__dirname, '../data/smart_recycling.db');
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(this.dbPath);
    this._inTx = false;
    this._initTables();
    this._initConfigs();
  }

  _initTables() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS material_configs (
        material TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        bin_name TEXT NOT NULL,
        bin_key TEXT NOT NULL,
        servo_angle INTEGER NOT NULL,
        weight_small INTEGER NOT NULL,
        weight_medium INTEGER NOT NULL,
        weight_large INTEGER NOT NULL,
        color_hex TEXT NOT NULL,
        icon TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS waste_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        material TEXT NOT NULL,
        size TEXT NOT NULL,
        weight_gram INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        volume_increment INTEGER NOT NULL,
        bin_key TEXT NOT NULL,
        servo_angle INTEGER NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'LIVE'
      );
      CREATE INDEX IF NOT EXISTS idx_records_date ON waste_records(date_str);
      CREATE INDEX IF NOT EXISTS idx_records_mat ON waste_records(material);

      CREATE TABLE IF NOT EXISTS daily_aggregates (
        date_str TEXT PRIMARY KEY,
        total_count INTEGER DEFAULT 0,
        total_weight_kg REAL DEFAULT 0,
        aluminum_count INTEGER DEFAULT 0,
        aluminum_weight_kg REAL DEFAULT 0,
        steel_count INTEGER DEFAULT 0,
        steel_weight_kg REAL DEFAULT 0,
        plastic_count INTEGER DEFAULT 0,
        plastic_weight_kg REAL DEFAULT 0,
        unknown_count INTEGER DEFAULT 0,
        unknown_weight_kg REAL DEFAULT 0,
        last_updated INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bin_cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        trigger_source TEXT NOT NULL,
        aluminum_level INTEGER NOT NULL,
        steel_level INTEGER NOT NULL,
        plastic_level INTEGER NOT NULL,
        inspection_level INTEGER NOT NULL,
        total_level INTEGER NOT NULL,
        estimated_weight_cleared_kg REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cycles_date ON bin_cycles(date_str);

      CREATE TABLE IF NOT EXISTS system_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_date ON system_events(date_str);
    `);
  }

  _initConfigs() {
    this.configs = {};
    const upsert = this.db.prepare(`
      INSERT INTO material_configs (material, display_name, bin_name, bin_key, servo_angle, weight_small, weight_medium, weight_large, color_hex, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(material) DO UPDATE SET
        display_name = excluded.display_name,
        bin_name = excluded.bin_name,
        bin_key = excluded.bin_key,
        servo_angle = excluded.servo_angle,
        weight_small = excluded.weight_small,
        weight_medium = excluded.weight_medium,
        weight_large = excluded.weight_large,
        color_hex = excluded.color_hex,
        icon = excluded.icon
    `);

    DEFAULT_MATERIALS.forEach((m) => {
      upsert.run(
        m.material, m.displayName, m.binName, m.binKey, m.servoAngle,
        m.weightSmall, m.weightMedium, m.weightLarge, m.colorHex, m.icon || ''
      );
    });

    const rows = this.db.prepare('SELECT * FROM material_configs').all();
    rows.forEach((r) => {
      this.configs[r.material] = {
        material: r.material,
        displayName: r.display_name,
        binName: r.bin_name,
        binKey: r.bin_key,
        servoAngle: r.servo_angle,
        weightSmall: r.weight_small,
        weightMedium: r.weight_medium,
        weightLarge: r.weight_large,
        colorHex: r.color_hex,
        icon: r.icon || ''
      };
    });
  }

  getMaterialConfigs() {
    return Object.values(this.configs);
  }

  weightFor(material, size) {
    const cfg = this.configs[material] || this.configs.UNKNOWN;
    const s = SIZES.indexOf(size) >= 0 ? size : 'M';
    if (s === 'S') return cfg.weightSmall;
    if (s === 'L') return cfg.weightLarge;
    return cfg.weightMedium;
  }

  _normalizeRecord(input) {
    const rawMat = String(input && input.material || '').toUpperCase();
    const material = MATERIALS.indexOf(rawMat) >= 0 ? rawMat : 'UNKNOWN';
    const rawSize = String(input && input.size || '').toUpperCase();
    const size = SIZES.indexOf(rawSize) >= 0 ? rawSize : 'M';

    const ts = Number.isFinite(input && input.timestamp) ? input.timestamp : Date.now();
    const dateStr = input && input.dateStr ? String(input.dateStr) : toDateStr(ts);
    const timeStr = input && input.timeStr ? String(input.timeStr) : toTimeStr(ts);

    const cfg = this.configs[material];
    const weightGram = Number.isFinite(input && input.weightGram) && input.weightGram > 0
      ? Math.round(input.weightGram)
      : this.weightFor(material, size);
    const weightKg = round3(weightGram / 1000);

    const volumeIncrement = Number.isFinite(input && input.volumeIncrement) && input.volumeIncrement > 0
      ? Math.round(input.volumeIncrement)
      : SIZE_INCREMENT[size];

    const servoAngle = Number.isFinite(input && input.servoAngle) ? input.servoAngle : cfg.servoAngle;
    const confidence = Number.isFinite(input && input.confidence)
      ? input.confidence
      : (material === 'UNKNOWN' ? 42.0 : 96.5);
    const source = input && input.source ? String(input.source) : 'LIVE';

    return {
      timestamp: ts,
      dateStr: dateStr,
      timeStr: timeStr,
      material: material,
      size: size,
      weightGram: weightGram,
      weightKg: weightKg,
      volumeIncrement: volumeIncrement,
      binKey: cfg.binKey,
      servoAngle: servoAngle,
      confidence: confidence,
      source: source
    };
  }

  addWasteRecord(input) {
    const rec = this._normalizeRecord(input);
    const p = AGG_PREFIX[rec.material];

    const manageTx = !this._inTx;
    if (manageTx) {
      this._inTx = true;
      this.db.exec('BEGIN TRANSACTION');
    }
    try {
      const insRecord = this.db.prepare(`
        INSERT INTO waste_records (
          timestamp, date_str, time_str, material, size,
          weight_gram, weight_kg, volume_increment, bin_key,
          servo_angle, confidence, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const res = insRecord.run(
        rec.timestamp, rec.dateStr, rec.timeStr, rec.material, rec.size,
        rec.weightGram, rec.weightKg, rec.volumeIncrement, rec.binKey,
        rec.servoAngle, rec.confidence, rec.source
      );
      rec.id = Number(res.lastInsertRowid);

      // Upsert daily aggregate
      const agg = this.db.prepare('SELECT * FROM daily_aggregates WHERE date_str = ?').get(rec.dateStr);
      if (!agg) {
        const initAgg = this.db.prepare(`
          INSERT INTO daily_aggregates (
            date_str, total_count, total_weight_kg,
            aluminum_count, aluminum_weight_kg,
            steel_count, steel_weight_kg,
            plastic_count, plastic_weight_kg,
            unknown_count, unknown_weight_kg,
            last_updated
          ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const aluC = rec.material === 'ALUMINUM' ? 1 : 0;
        const aluKg = rec.material === 'ALUMINUM' ? rec.weightKg : 0;
        const stlC = rec.material === 'STEEL' ? 1 : 0;
        const stlKg = rec.material === 'STEEL' ? rec.weightKg : 0;
        const plaC = rec.material === 'PLASTIC' ? 1 : 0;
        const plaKg = rec.material === 'PLASTIC' ? rec.weightKg : 0;
        const unkC = rec.material === 'UNKNOWN' ? 1 : 0;
        const unkKg = rec.material === 'UNKNOWN' ? rec.weightKg : 0;

        initAgg.run(
          rec.dateStr, rec.weightKg,
          aluC, aluKg,
          stlC, stlKg,
          plaC, plaKg,
          unkC, unkKg,
          Date.now()
        );
      } else {
        const updAgg = this.db.prepare(`
          UPDATE daily_aggregates SET
            total_count = total_count + 1,
            total_weight_kg = round(total_weight_kg + ?, 3),
            ${p}_count = ${p}_count + 1,
            ${p}_weight_kg = round(${p}_weight_kg + ?, 3),
            last_updated = ?
          WHERE date_str = ?
        `);
        updAgg.run(rec.weightKg, rec.weightKg, Date.now(), rec.dateStr);
      }

      if (manageTx) {
        this.db.exec('COMMIT');
        this._inTx = false;
      }
      return rec;
    } catch (e) {
      if (manageTx) {
        this.db.exec('ROLLBACK');
        this._inTx = false;
      }
      throw e;
    }
  }

  recordBinCycle(input) {
    const cy = input || {};
    const ts = Number.isFinite(cy.timestamp) ? cy.timestamp : Date.now();
    const dateStr = toDateStr(ts);
    const timeStr = toTimeStr(ts);
    const lv = cy.levels || {};
    const alu = Math.min(100, Math.max(0, lv.aluminum || 0));
    const stl = Math.min(100, Math.max(0, lv.steel || 0));
    const pla = Math.min(100, Math.max(0, lv.plastic || 0));
    const ins = Math.min(100, Math.max(0, lv.inspection || 0));
    const total = alu + stl + pla + ins;

    const aluKg = (alu / 100) * 1.5;
    const stlKg = (stl / 100) * 4.0;
    const plaKg = (pla / 100) * 1.8;
    const insKg = (ins / 100) * 2.5;
    const estKg = round3(aluKg + stlKg + plaKg + insKg);

    const stmt = this.db.prepare(`
      INSERT INTO bin_cycles (
        timestamp, date_str, time_str, trigger_source,
        aluminum_level, steel_level, plastic_level, inspection_level,
        total_level, estimated_weight_cleared_kg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      ts, dateStr, timeStr, cy.triggerSource || 'WEB_BUTTON',
      alu, stl, pla, ins, total, estKg
    );
    return {
      id: Number(res.lastInsertRowid),
      timestamp: ts,
      dateStr: dateStr,
      timeStr: timeStr,
      triggerSource: cy.triggerSource || 'WEB_BUTTON',
      aluminumLevel: alu,
      steelLevel: stl,
      plasticLevel: pla,
      inspectionLevel: ins,
      totalLevel: total,
      estimatedWeightClearedKg: estKg
    };
  }

  recordSystemEvent(input) {
    const ev = input || {};
    const ts = Number.isFinite(ev.timestamp) ? ev.timestamp : Date.now();
    const dateStr = toDateStr(ts);
    const stmt = this.db.prepare(`
      INSERT INTO system_events (timestamp, date_str, event_type, severity, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      ts, dateStr, ev.eventType || 'INFO', ev.severity || 'INFO', ev.description || ''
    );
    return {
      id: Number(res.lastInsertRowid),
      timestamp: ts,
      dateStr: dateStr,
      eventType: ev.eventType || 'INFO',
      severity: ev.severity || 'INFO',
      description: ev.description || ''
    };
  }

  queryAggregates(fromStr, toStr) {
    let sql = 'SELECT * FROM daily_aggregates';
    const params = [];
    if (fromStr && toStr) {
      sql += ' WHERE date_str BETWEEN ? AND ?';
      params.push(fromStr, toStr);
    } else if (fromStr) {
      sql += ' WHERE date_str >= ?';
      params.push(fromStr);
    } else if (toStr) {
      sql += ' WHERE date_str <= ?';
      params.push(toStr);
    }
    sql += ' ORDER BY date_str ASC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => ({
      dateStr: r.date_str,
      totalCount: r.total_count,
      totalWeightKg: round3(r.total_weight_kg),
      aluminumCount: r.aluminum_count,
      aluminumWeightKg: round3(r.aluminum_weight_kg),
      steelCount: r.steel_count,
      steelWeightKg: round3(r.steel_weight_kg),
      plasticCount: r.plastic_count,
      plasticWeightKg: round3(r.plastic_weight_kg),
      unknownCount: r.unknown_count,
      unknownWeightKg: round3(r.unknown_weight_kg),
      lastUpdated: r.last_updated
    }));
  }

  queryRecords(fromStr, toStr) {
    let sql = 'SELECT * FROM waste_records';
    const params = [];
    if (fromStr && toStr) {
      sql += ' WHERE date_str BETWEEN ? AND ?';
      params.push(fromStr, toStr);
    } else if (fromStr) {
      sql += ' WHERE date_str >= ?';
      params.push(fromStr);
    } else if (toStr) {
      sql += ' WHERE date_str <= ?';
      params.push(toStr);
    }
    sql += ' ORDER BY timestamp ASC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      dateStr: r.date_str,
      timeStr: r.time_str,
      material: r.material,
      size: r.size,
      weightGram: r.weight_gram,
      weightKg: round3(r.weight_kg),
      volumeIncrement: r.volume_increment,
      binKey: r.bin_key,
      servoAngle: r.servo_angle,
      confidence: r.confidence,
      source: r.source
    }));
  }

  queryBinCycles(fromStr, toStr) {
    let sql = 'SELECT * FROM bin_cycles';
    const params = [];
    if (fromStr && toStr) {
      sql += ' WHERE date_str BETWEEN ? AND ?';
      params.push(fromStr, toStr);
    } else if (fromStr) {
      sql += ' WHERE date_str >= ?';
      params.push(fromStr);
    } else if (toStr) {
      sql += ' WHERE date_str <= ?';
      params.push(toStr);
    }
    sql += ' ORDER BY timestamp ASC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      dateStr: r.date_str,
      timeStr: r.time_str,
      triggerSource: r.trigger_source,
      levels: {
        aluminum: r.aluminum_level,
        steel: r.steel_level,
        plastic: r.plastic_level,
        inspection: r.inspection_level
      },
      totalLevel: r.total_level,
      estimatedWeightClearedKg: round3(r.estimated_weight_cleared_kg)
    }));
  }

  querySystemEvents(fromStr, toStr) {
    let sql = 'SELECT * FROM system_events';
    const params = [];
    if (fromStr && toStr) {
      sql += ' WHERE date_str BETWEEN ? AND ?';
      params.push(fromStr, toStr);
    } else if (fromStr) {
      sql += ' WHERE date_str >= ?';
      params.push(fromStr);
    } else if (toStr) {
      sql += ' WHERE date_str <= ?';
      params.push(toStr);
    }
    sql += ' ORDER BY timestamp ASC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      dateStr: r.date_str,
      eventType: r.event_type,
      severity: r.severity,
      description: r.description
    }));
  }

  seedSampleData(days) {
    const nDays = Math.max(1, Math.min(365, Math.floor(days || 30)));
    const now = Date.now();
    const materialPool = [
      { v: 'ALUMINUM', w: 28 }, { v: 'STEEL', w: 22 },
      { v: 'PLASTIC', w: 35 }, { v: 'UNKNOWN', w: 15 }
    ];
    const sizePool = [{ v: 'S', w: 30 }, { v: 'M', w: 50 }, { v: 'L', w: 20 }];
    const pickWeighted = (items) => {
      const total = items.reduce((s, i) => s + i.w, 0);
      let r = Math.random() * total;
      for (let i = 0; i < items.length; i++) {
        r -= items[i].w;
        if (r < 0) return items[i].v;
      }
      return items[items.length - 1].v;
    };

    let countAdded = 0;
    this._inTx = true;
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (let back = nDays - 1; back >= 0; back--) {
        const day = new Date(now);
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - back);
        const dayStart = day.getTime() + 7 * 3600 * 1000;
        const dayEnd = Math.min(day.getTime() + 18 * 3600 * 1000, now);
        if (dayEnd <= dayStart) continue;

        const count = 8 + Math.floor(Math.random() * 18);
        for (let i = 0; i < count; i++) {
          const ts = Math.floor(dayStart + Math.random() * (dayEnd - dayStart));
          this.addWasteRecord({
            timestamp: ts,
            material: pickWeighted(materialPool),
            size: pickWeighted(sizePool),
            source: 'SAMPLE'
          });
          countAdded++;
        }
      }
      this.db.exec('COMMIT');
      this._inTx = false;
      return countAdded;
    } catch (e) {
      this.db.exec('ROLLBACK');
      this._inTx = false;
      throw e;
    }
  }

  clearAllData() {
    this._inTx = true;
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM waste_records;');
      this.db.exec('DELETE FROM daily_aggregates;');
      this.db.exec('DELETE FROM bin_cycles;');
      this.db.exec('DELETE FROM system_events;');
      this.db.exec("DELETE FROM sqlite_sequence WHERE name IN ('waste_records', 'bin_cycles', 'system_events');");
      this.db.exec('COMMIT');
      this._inTx = false;
      return true;
    } catch (e) {
      this.db.exec('ROLLBACK');
      this._inTx = false;
      throw e;
    }
  }

  exportCsv(fromStr, toStr) {
    const records = this.queryRecords(fromStr, toStr);
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

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = {
  ServerDatabase,
  DEFAULT_MATERIALS,
  MATERIALS,
  SIZES,
  toDateStr,
  toTimeStr,
  round3
};
