'use strict';

const ExcelJS = require('exceljs');

const MATERIAL_MAP = {
  ALUMINUM: { name: 'Nhôm', bin: 'Thùng nhôm', angle: '30°' },
  STEEL:    { name: 'Sắt/thép', bin: 'Thùng sắt/thép', angle: '70°' },
  PLASTIC:  { name: 'Nhựa', bin: 'Thùng nhựa', angle: '110°' },
  UNKNOWN:  { name: 'Rác khác', bin: 'Thùng rác khác', angle: '150°' }
};

const SIZE_MAP = {
  S: 'Nhỏ (S)',
  M: 'Vừa (M)',
  L: 'Lớn (L)'
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateVn(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function formatDateForFilename(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
}

function formatExportFilename(fromStr, toStr, ext = 'xlsx') {
  if (fromStr && toStr && fromStr === toStr) {
    return `Báo cáo khối lượng rác - Ngày ${formatDateForFilename(fromStr)}.${ext}`;
  }
  if (fromStr && toStr) {
    return `Báo cáo khối lượng rác - Từ ${formatDateForFilename(fromStr)} Đến ${formatDateForFilename(toStr)}.${ext}`;
  }
  if (fromStr) {
    return `Báo cáo khối lượng rác - Từ Ngày ${formatDateForFilename(fromStr)}.${ext}`;
  }
  if (toStr) {
    return `Báo cáo khối lượng rác - Đến Ngày ${formatDateForFilename(toStr)}.${ext}`;
  }
  return `Báo cáo khối lượng rác - Toàn Bộ Lịch Sử.${ext}`;
}

function formatRangeText(fromStr, toStr) {
  if (fromStr && toStr && fromStr === toStr) {
    return `Ngày ${formatDateVn(fromStr)}`;
  }
  if (fromStr && toStr) {
    return `Từ ngày ${formatDateVn(fromStr)} đến ngày ${formatDateVn(toStr)}`;
  }
  if (fromStr) {
    return `Từ ngày ${formatDateVn(fromStr)}`;
  }
  if (toStr) {
    return `Đến ngày ${formatDateVn(toStr)}`;
  }
  return 'Toàn bộ lịch sử hoạt động';
}

async function buildWasteExcelWorkbook(db, fromStr, toStr) {
  const records = db.queryRecords(fromStr, toStr);
  const aggregates = db.queryAggregates(fromStr, toStr);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hệ Thống Phân Loại Rác Thông Minh - Nhóm 13';
  workbook.lastModifiedBy = 'Smart Recycling System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Tính toán số liệu tổng hợp
  let totalCount = 0;
  let totalWeightKg = 0;
  const byMat = {
    ALUMINUM: { count: 0, kg: 0, grams: 0 },
    STEEL:    { count: 0, kg: 0, grams: 0 },
    PLASTIC:  { count: 0, kg: 0, grams: 0 },
    UNKNOWN:  { count: 0, kg: 0, grams: 0 }
  };

  records.forEach((r) => {
    totalCount++;
    totalWeightKg += r.weightKg;
    const m = byMat[r.material] || byMat.UNKNOWN;
    m.count++;
    m.kg += r.weightKg;
    m.grams += r.weightGram;
  });

  const round3 = (v) => Math.round((v || 0) * 1000) / 1000;
  totalWeightKg = round3(totalWeightKg);

  const now = new Date();
  const exportTimeStr = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const rangeText = formatRangeText(fromStr, toStr);

  const borderThin = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // =========================================================================
  // SHEET 1: TỔNG HỢP BÁO CÁO
  // =========================================================================
  const wsSummary = workbook.addWorksheet('Tổng Hợp Báo Cáo', {
    views: [{ showGridLines: true }]
  });

  wsSummary.columns = [
    { width: 8 },  // A: STT
    { width: 22 }, // B: Loại rác
    { width: 18 }, // C: Khối lượng (kg)
    { width: 16 }, // D: Khối lượng (g)
    { width: 16 }, // E: Số lượng (vật)
    { width: 14 }, // F: Tỷ lệ (%)
    { width: 22 }, // G: Thùng chứa
    { width: 14 }  // H: Góc Servo
  ];

  // Header đồ án
  wsSummary.mergeCells('A1:H1');
  const cellSub = wsSummary.getCell('A1');
  cellSub.value = 'HỌC PHẦN: ĐỒ ÁN INTERNET OF THINGS (IoT) • ĐỀ TÀI 59: HỆ THỐNG PHÂN LOẠI RÁC TÁI CHẾ THÔNG MINH';
  cellSub.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
  cellSub.alignment = { horizontal: 'center', vertical: 'middle' };

  wsSummary.mergeCells('A2:H2');
  const cellTitle = wsSummary.getCell('A2');
  cellTitle.value = 'BÁO CÁO THỐNG KÊ KHỐI LƯỢNG RÁC TÁI CHẾ';
  cellTitle.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0F172A' } };
  cellTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  wsSummary.mergeCells('A3:H3');
  const cellTeam = wsSummary.getCell('A3');
  cellTeam.value = 'Nhóm 13: Võ Đăng Khoa • Đỗ Quang Liêm • Phạm Anh Nhật Minh';
  cellTeam.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  cellTeam.alignment = { horizontal: 'center', vertical: 'middle' };

  wsSummary.addRow([]); // Dòng 4 trống

  // Thông tin báo cáo (Dòng 5, 6)
  const metaRows = [
    ['Khoảng thời gian:', rangeText, '', 'Thời điểm xuất file:', exportTimeStr],
    ['Tổng số vật thể:', `${totalCount} vật thể`, '', 'Tổng khối lượng:', `${totalWeightKg.toFixed(3)} kg`]
  ];

  metaRows.forEach((rowVals) => {
    const row = wsSummary.addRow(rowVals);
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF334155' } };
    row.getCell(2).font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
    row.getCell(4).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF334155' } };
    row.getCell(5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  });

  wsSummary.addRow([]); // Dòng 7 trống

  // Tiêu đề bảng tổng hợp (Dòng 8)
  const tableTitleRow = wsSummary.addRow(['BẢNG TỔNG HỢP THEO LOẠI RÁC (XẾP HẠNG KHỐI LƯỢNG)']);
  wsSummary.mergeCells(`A8:H8`);
  tableTitleRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  tableTitleRow.getCell(1).alignment = { vertical: 'middle' };

  // Header cột bảng (Dòng 9)
  const sumHeaders = ['STT', 'Loại rác', 'Khối lượng (kg)', 'Khối lượng (g)', 'Số lượng (vật)', 'Tỷ lệ (%)', 'Thùng chứa tương ứng', 'Góc Servo'];
  const headerRow = wsSummary.addRow(sumHeaders);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });

  // 4 loại rác xếp hạng theo khối lượng giảm dần
  const matList = ['STEEL', 'ALUMINUM', 'PLASTIC', 'UNKNOWN']
    .map((k) => ({
      key: k,
      name: MATERIAL_MAP[k].name,
      bin: MATERIAL_MAP[k].bin,
      angle: MATERIAL_MAP[k].angle,
      kg: round3(byMat[k].kg),
      grams: byMat[k].grams,
      count: byMat[k].count,
      pct: totalWeightKg > 0 ? (byMat[k].kg / totalWeightKg) * 100 : 0
    }))
    .sort((a, b) => b.kg - a.kg);

  matList.forEach((it, idx) => {
    const r = wsSummary.addRow([
      idx + 1,
      it.name,
      it.kg,
      it.grams,
      it.count,
      it.pct / 100,
      it.bin,
      it.angle
    ]);
    r.height = 22;

    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(2).font = { name: 'Arial', size: 10, bold: true };
    r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(3).numFmt = '#,##0.000';
    r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(4).numFmt = '#,##0';
    r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(5).numFmt = '#,##0';
    r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(6).numFmt = '0.0%';
    r.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

    r.eachCell((cell) => { cell.border = borderThin; });
  });

  // Dòng TỔNG CỘNG
  const totalRow = wsSummary.addRow([
    '',
    'TỔNG CỘNG',
    totalWeightKg,
    Math.round(totalWeightKg * 1000),
    totalCount,
    totalWeightKg > 0 ? 1 : 0,
    'Tất cả 4 thùng',
    'Tự động'
  ]);
  totalRow.height = 24;
  totalRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = borderThin;
  });
  totalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(3).numFmt = '#,##0.000';
  totalRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(4).numFmt = '#,##0';
  totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(5).numFmt = '#,##0';
  totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(6).numFmt = '0.0%';
  totalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

  // =========================================================================
  // SHEET 2: CHI TIẾT PHÂN LOẠI (FACT TABLE)
  // =========================================================================
  const wsDetails = workbook.addWorksheet('Chi Tiết Phân Loại', {
    views: [{ showGridLines: true, freezePane: { ySplit: 3 } }]
  });

  wsDetails.columns = [
    { width: 8 },  // A: STT
    { width: 14 }, // B: Mã bản ghi
    { width: 16 }, // C: Ngày phân loại
    { width: 12 }, // D: Giờ
    { width: 15 }, // E: Loại rác
    { width: 15 }, // F: Kích cỡ AI
    { width: 16 }, // G: Khối lượng (g)
    { width: 16 }, // H: Khối lượng (kg)
    { width: 16 }, // I: Mức tăng thùng
    { width: 18 }, // J: Thùng chứa
    { width: 14 }, // K: Góc Servo
    { width: 16 }, // L: Độ tin cậy AI
    { width: 26 }  // M: Nguồn dữ liệu
  ];

  // Header sheet 2
  wsDetails.mergeCells('A1:M1');
  const dTitle = wsDetails.getCell('A1');
  dTitle.value = 'DANH SÁCH CHI TIẾT TỪNG VẬT THỂ ĐƯỢC PHÂN LOẠI';
  dTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  dTitle.alignment = { horizontal: 'left', vertical: 'middle' };

  wsDetails.mergeCells('A2:M2');
  const dMeta = wsDetails.getCell('A2');
  dMeta.value = `Khoảng thời gian: ${rangeText} • Tổng số: ${records.length} bản ghi • Thời điểm xuất: ${exportTimeStr}`;
  dMeta.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  dMeta.alignment = { horizontal: 'left', vertical: 'middle' };

  const detailHeaders = [
    'STT', 'Mã bản ghi', 'Ngày phân loại', 'Thời gian',
    'Loại rác', 'Kích cỡ AI', 'Khối lượng (g)', 'Khối lượng (kg)',
    'Mức tăng thùng', 'Thùng chứa', 'Góc Servo', 'Độ tin cậy AI', 'Nguồn dữ liệu'
  ];
  const dHeaderRow = wsDetails.addRow(detailHeaders);
  dHeaderRow.height = 26;
  dHeaderRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Xanh Navy
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });

  records.forEach((r, idx) => {
    const matInfo = MATERIAL_MAP[r.material] || { name: r.material, bin: r.binKey, angle: `${r.servoAngle}°` };
    const sizeName = SIZE_MAP[r.size] || r.size;
    const sourceName = r.source === 'SAMPLE' ? 'Dữ liệu mô phỏng (SAMPLE)' : 'Băng chuyền thực tế (LIVE)';

    const row = wsDetails.addRow([
      idx + 1,
      r.id,
      formatDateVn(r.dateStr),
      r.timeStr,
      matInfo.name,
      sizeName,
      r.weightGram,
      r.weightKg,
      `+${r.volumeIncrement}%`,
      matInfo.bin,
      `${r.servoAngle}°`,
      `${r.confidence}%`,
      sourceName
    ]);
    row.height = 20;

    // Định dạng căn lề và định dạng số
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).font = { name: 'Arial', size: 10, bold: true };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(7).numFmt = '#,##0';
    row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(8).numFmt = '#,##0.000';
    row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(10).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(13).alignment = { horizontal: 'left', vertical: 'middle' };

    // Xen kẽ màu dòng
    const bgArgb = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    row.eachCell((cell) => {
      cell.border = borderThin;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
    });
  });

  return {
    workbook,
    filename: formatExportFilename(fromStr, toStr, 'xlsx'),
    count: records.length
  };
}

module.exports = {
  buildWasteExcelWorkbook,
  formatExportFilename,
  formatDateVn,
  formatRangeText
};
