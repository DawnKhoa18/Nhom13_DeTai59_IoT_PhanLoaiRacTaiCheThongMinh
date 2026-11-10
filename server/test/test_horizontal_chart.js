'use strict';

const assert = require('assert');
const WasteDBModule = require('../../web/js/waste-db.js');
const WasteStatisticsModule = require('../../web/js/waste-statistics.js');

const elements = {};
function createMockEl(id) {
  return {
    id,
    innerText: '',
    style: {},
    className: '',
    addEventListener: () => {},
    getContext: () => ({
      save: () => {},
      restore: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 })
    })
  };
}

const mockDoc = {
  getElementById: (id) => {
    if (!elements[id]) elements[id] = createMockEl(id);
    return elements[id];
  }
};

const captured = [];
class MockChart {
  constructor(canvas, config) {
    captured.push({ canvas, config });
    this.data = config.data;
    this.options = config.options;
  }
  update() {}
  destroy() {}
}

async function run() {
  const stats = new WasteStatisticsModule.WasteStatistics({
    document: mockDoc,
    Chart: MockChart,
    nowFn: () => new Date('2026-11-10T12:00:00+07:00'),
    db: {
      isSupported: true,
      open: () => Promise.resolve(),
      getMaterialConfigs: () => WasteDBModule.DEFAULT_MATERIALS,
      queryAggregates: () => Promise.resolve([
        {
          dateStr: '2026-11-10',
          totalCount: 3,
          totalWeightKg: 0.147,
          aluminumCount: 1,
          aluminumWeightKg: 0.045,
          steelCount: 1,
          steelWeightKg: 0.085,
          plasticCount: 1,
          plasticWeightKg: 0.017,
          unknownCount: 0,
          unknownWeightKg: 0
        }
      ]),
      queryBinCycles: () => Promise.resolve([]),
      querySystemEvents: () => Promise.resolve([]),
      queryRecords: () => Promise.resolve([])
    }
  });

  await stats.init();

  assert.strictEqual(captured.length, 2, 'Phải khởi tạo 2 biểu đồ');

  const barChart = captured.find(c => c.canvas.id === 'statBarCanvas');
  assert(barChart, 'Phải có bar chart');
  assert.strictEqual(barChart.config.type, 'bar');
  assert.strictEqual(barChart.config.options.indexAxis, 'y', 'Phải là biểu đồ thanh ngang (indexAxis = y)');

  // Kiểm tra thứ tự xếp hạng giảm dần: Sắt/thép (0.085) > Nhôm (0.045) > Nhựa (0.017) > Rác khác (0)
  const labels = barChart.config.data.labels;
  const values = barChart.config.data.datasets[0].data;

  console.log('  ✓ Nhãn các loại rác (đã sắp xếp xếp hạng):', labels);
  console.log('  ✓ Khối lượng tương ứng (kg):', values);

  assert.strictEqual(labels[0], 'Sắt/thép');
  assert.strictEqual(values[0], 0.085);
  assert.strictEqual(labels[1], 'Nhôm');
  assert.strictEqual(values[1], 0.045);
  assert.strictEqual(labels[2], 'Nhựa');
  assert.strictEqual(values[2], 0.017);
  assert.strictEqual(labels[3], 'Rác khác');
  assert.strictEqual(values[3], 0);

  const title = mockDoc.getElementById('statBarTitle').innerText;
  assert(title.includes('So sánh & Xếp hạng'));
  console.log('  ✓ Tiêu đề biểu đồ:', title);

  console.log('\n>>> KIỂM THỬ BIỂU ĐỒ THANH NGANG XẾP HẠNG (PROPOSAL 2) THÀNH CÔNG 100%! <<<\n');
}

run().catch(err => {
  console.error('LỖI:', err);
  process.exit(1);
});
