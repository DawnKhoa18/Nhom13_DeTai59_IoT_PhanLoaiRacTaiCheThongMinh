'use strict';

const express = require('express');
const { buildWasteExcelWorkbook, formatExportFilename } = require('./excel-export');

function createApiRouter(db) {
  const router = express.Router();

  // 1. Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      engine: 'sqlite',
      version: '1.0.0',
      timestamp: Date.now()
    });
  });

  // 2. Lấy cấu hình các loại rác
  router.get('/configs', (req, res) => {
    try {
      const configs = db.getMaterialConfigs();
      res.json({ status: 'ok', data: configs });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // 3. Lấy dữ liệu tổng hợp & chu kỳ, sự kiện phục vụ vẽ biểu đồ
  router.get('/stats', (req, res) => {
    try {
      const fromStr = req.query.from || '';
      const toStr = req.query.to || '';

      const aggregates = db.queryAggregates(fromStr, toStr);
      const cycles = db.queryBinCycles(fromStr, toStr);
      const events = db.querySystemEvents(fromStr, toStr);

      // Tính tổng hợp nhanh từ các ngày trong khoảng
      let totalCount = 0;
      let totalWeightKg = 0;
      let aluminumCount = 0;
      let aluminumWeightKg = 0;
      let steelCount = 0;
      let steelWeightKg = 0;
      let plasticCount = 0;
      let plasticWeightKg = 0;
      let unknownCount = 0;
      let unknownWeightKg = 0;

      for (const row of aggregates) {
        totalCount += row.totalCount;
        totalWeightKg += row.totalWeightKg;
        aluminumCount += row.aluminumCount;
        aluminumWeightKg += row.aluminumWeightKg;
        steelCount += row.steelCount;
        steelWeightKg += row.steelWeightKg;
        plasticCount += row.plasticCount;
        plasticWeightKg += row.plasticWeightKg;
        unknownCount += row.unknownCount;
        unknownWeightKg += row.unknownWeightKg;
      }

      const round3 = (v) => Math.round((v || 0) * 1000) / 1000;

      const summary = {
        totalCount,
        totalWeightKg: round3(totalWeightKg),
        byMaterial: {
          ALUMINUM: { count: aluminumCount, weightKg: round3(aluminumWeightKg) },
          STEEL:    { count: steelCount,    weightKg: round3(steelWeightKg) },
          PLASTIC:  { count: plasticCount,  weightKg: round3(plasticWeightKg) },
          UNKNOWN:  { count: unknownCount,  weightKg: round3(unknownWeightKg) }
        }
      };

      res.json({
        status: 'ok',
        from: fromStr,
        to: toStr,
        aggregates,
        summary,
        cycles,
        events
      });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // 4. Lấy chi tiết từng vật thể
  router.get('/records', (req, res) => {
    try {
      const fromStr = req.query.from || '';
      const toStr = req.query.to || '';
      const records = db.queryRecords(fromStr, toStr);
      res.json({ status: 'ok', total: records.length, data: records });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // 5. Thêm bản ghi phân loại mới (từ Web hoặc test)
  router.post('/records', (req, res) => {
    try {
      const payload = req.body || {};
      const record = db.addWasteRecord(payload);
      res.status(201).json({ status: 'ok', data: record });
    } catch (e) {
      res.status(400).json({ status: 'error', message: e.message });
    }
  });

  // 6. Ghi nhận chu kỳ đổ thùng
  router.post('/cycles', (req, res) => {
    try {
      const payload = req.body || {};
      const cycle = db.recordBinCycle(payload);
      res.status(201).json({ status: 'ok', data: cycle });
    } catch (e) {
      res.status(400).json({ status: 'error', message: e.message });
    }
  });

  // 7. Ghi nhận sự kiện an toàn
  router.post('/events', (req, res) => {
    try {
      const payload = req.body || {};
      const ev = db.recordSystemEvent(payload);
      res.status(201).json({ status: 'ok', data: ev });
    } catch (e) {
      res.status(400).json({ status: 'error', message: e.message });
    }
  });

  // 8. Nạp dữ liệu mẫu 30 ngày
  router.post('/seed-sample', (req, res) => {
    try {
      const days = Number(req.body && req.body.days) || 30;
      const count = db.seedSampleData(days);
      res.json({ status: 'ok', message: `Đã nạp ${count} bản ghi mẫu`, count });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // 9. Xóa toàn bộ dữ liệu lịch sử
  router.post('/clear', (req, res) => {
    try {
      db.clearAllData();
      res.json({ status: 'ok', message: 'Đã xóa toàn bộ dữ liệu lịch sử' });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // 10. Xuất file Excel (.xlsx) 2 sheet định dạng chuyên nghiệp
  router.get('/export-excel', async (req, res) => {
    try {
      const fromStr = req.query.from || '';
      const toStr = req.query.to || '';
      const { workbook, filename } = await buildWasteExcelWorkbook(db, fromStr, toStr);

      const buffer = await workbook.xlsx.writeBuffer();
      const encodedFilename = encodeURIComponent(filename);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // 11. Xuất file CSV (dự phòng)
  router.get('/export-csv', (req, res) => {
    try {
      const fromStr = req.query.from || '';
      const toStr = req.query.to || '';
      const csv = db.exportCsv(fromStr, toStr);
      const filename = formatExportFilename(fromStr, toStr, 'csv');
      const encodedFilename = encodeURIComponent(filename);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
      res.send(csv);
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  return router;
}

module.exports = { createApiRouter };
