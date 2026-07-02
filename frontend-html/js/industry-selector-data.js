/**
 * 压测涉及行业 — 人行默认口径 + 级联选择树
 */
window.CRST_INDUSTRY_SELECTOR = (function () {
  /** 人行气候风险压测涉及行业（GB/T 4754-2017） */
  const PBOC_INDUSTRY_LEAVES = [
    { code: 'D4411', name: '火力发电', category: '电力' },
    { code: 'D4412', name: '热电联产', category: '电力' },
    { code: 'D4420', name: '电力供应', category: '电力' },
    { code: 'C3011', name: '水泥制造', category: '建材' },
    { code: 'C3041', name: '平板玻璃制造', category: '建材' },
    { code: 'C3110', name: '炼铁', category: '钢铁' },
    { code: 'C3120', name: '炼钢', category: '钢铁' },
    { code: 'C3130', name: '钢压延加工', category: '钢铁' },
    { code: 'C3216', name: '铝冶炼', category: '有色' },
    { code: 'C3211', name: '铜冶炼', category: '有色' },
    { code: 'C2511', name: '原油加工及石油制品制造', category: '石化' },
    { code: 'C2611', name: '无机酸制造', category: '化工' },
    { code: 'C2612', name: '无机碱制造', category: '化工' },
    { code: 'C2613', name: '无机盐制造', category: '化工' },
    { code: 'C2614', name: '有机化学原料制造', category: '化工' },
    { code: 'C2621', name: '氮肥制造', category: '化工' },
    { code: 'C2622', name: '磷肥制造', category: '化工' },
    { code: 'C2623', name: '钾肥制造', category: '化工' },
    { code: 'C2624', name: '复混肥料制造', category: '化工' },
    { code: 'C2625', name: '有机肥料及微生物肥料制造', category: '化工' },
    { code: 'C2629', name: '其他肥料制造', category: '化工' },
    { code: 'C2631', name: '化学农药制造', category: '化工' },
    { code: 'C2632', name: '生物化学农药及微生物农药制造', category: '化工' },
    { code: 'C2619', name: '其他基础化学原料制造', category: '化工' },
    { code: 'C2651', name: '初级形态塑料及合成树脂制造', category: '化工' },
    { code: 'C2652', name: '合成橡胶制造', category: '化工' },
    { code: 'C2653', name: '合成纤维单（聚合）体制造', category: '化工' },
    { code: 'C2659', name: '其他合成材料制造', category: '化工' },
    { code: 'C2211', name: '木竹浆制造', category: '造纸' },
    { code: 'C2212', name: '非木竹浆制造', category: '造纸' },
    { code: 'C2221', name: '机制纸及纸板制造', category: '造纸' },
    { code: 'G5611', name: '航空旅客运输', category: '航空' },
    { code: 'G5612', name: '航空货物运输', category: '航空' },
    { code: 'G5631', name: '机场', category: '航空' },
  ];

  const LEAF_MAP = Object.fromEntries(PBOC_INDUSTRY_LEAVES.map((x) => [x.code, x]));

  /** 压测测试行业大类（与人行涉及行业 category 一致） */
  const TEST_INDUSTRY_MAJORS = [...new Set(PBOC_INDUSTRY_LEAVES.map((x) => x.category))];

  /** 细分测试行业 → 行业大类 */
  const TEST_INDUSTRY_MAJOR_ALIASES = {
    平板玻璃: '建材',
    '平板玻璃（仅浮法）': '建材',
    开采原油加工炼化: '石化',
    采购原油加工炼化: '石化',
    '造纸（生活用纸）': '造纸',
    '造纸（其他）': '造纸',
    机场企业: '航空',
    机场: '航空',
    有色金属: '有色',
  };

  function getTestIndustryMajors() {
    return [...TEST_INDUSTRY_MAJORS];
  }

  /** 将记录上的测试行业解析为因子库可对齐的行业大类 */
  function resolveTestIndustryMajor(standardIndustry, gbIndustryCode) {
    if (gbIndustryCode && LEAF_MAP[gbIndustryCode]) {
      return LEAF_MAP[gbIndustryCode].category;
    }
    if (standardIndustry && TEST_INDUSTRY_MAJORS.includes(standardIndustry)) {
      return standardIndustry;
    }
    if (standardIndustry && TEST_INDUSTRY_MAJOR_ALIASES[standardIndustry]) {
      return TEST_INDUSTRY_MAJOR_ALIASES[standardIndustry];
    }
    if (standardIndustry) {
      const hit = TEST_INDUSTRY_MAJORS.find((m) => standardIndustry.includes(m));
      if (hit) return hit;
    }
    return standardIndustry || '';
  }

  function leafNode(item) {
    return { id: item.code, leaf: true, code: item.code, name: item.name, category: item.category };
  }

  /** 级联树（含人行涉及行业及常见门类，供浏览勾选） */
  const INDUSTRY_SELECTOR_TREE = [
    { id: 'A', name: '农、林、牧、渔业', children: [] },
    { id: 'B', name: '采矿业', children: [] },
    {
      id: 'C',
      name: '制造业',
      children: [
        {
          id: 'C25',
          name: '石油、煤炭及其他燃料加工业',
          children: [
            { id: 'C251', name: '精炼石油产品制造', children: [leafNode(LEAF_MAP.C2511)] },
          ],
        },
        {
          id: 'C26',
          name: '化学原料和化学制品制造业',
          children: [
            {
              id: 'C261',
              name: '基础化学原料制造',
              children: [
                leafNode(LEAF_MAP.C2611),
                leafNode(LEAF_MAP.C2612),
                leafNode(LEAF_MAP.C2613),
                leafNode(LEAF_MAP.C2614),
                leafNode(LEAF_MAP.C2619),
              ],
            },
            {
              id: 'C262',
              name: '肥料制造',
              children: [
                leafNode(LEAF_MAP.C2621),
                leafNode(LEAF_MAP.C2622),
                leafNode(LEAF_MAP.C2623),
                leafNode(LEAF_MAP.C2624),
                leafNode(LEAF_MAP.C2625),
                leafNode(LEAF_MAP.C2629),
              ],
            },
            {
              id: 'C263',
              name: '农药制造',
              children: [leafNode(LEAF_MAP.C2631), leafNode(LEAF_MAP.C2632)],
            },
            {
              id: 'C265',
              name: '合成材料制造',
              children: [
                leafNode(LEAF_MAP.C2651),
                leafNode(LEAF_MAP.C2652),
                leafNode(LEAF_MAP.C2653),
                leafNode(LEAF_MAP.C2659),
              ],
            },
          ],
        },
        {
          id: 'C30',
          name: '非金属矿物制品业',
          children: [
            { id: 'C301', name: '水泥、石灰和石膏制造', children: [leafNode(LEAF_MAP.C3011)] },
            { id: 'C304', name: '玻璃制造', children: [leafNode(LEAF_MAP.C3041)] },
          ],
        },
        {
          id: 'C31',
          name: '黑色金属冶炼和压延加工业',
          children: [
            { id: 'C311', name: '炼铁', children: [leafNode(LEAF_MAP.C3110)] },
            { id: 'C312', name: '炼钢', children: [leafNode(LEAF_MAP.C3120)] },
            { id: 'C313', name: '钢压延加工', children: [leafNode(LEAF_MAP.C3130)] },
          ],
        },
        {
          id: 'C32',
          name: '有色金属冶炼和压延加工业',
          children: [
            { id: 'C321', name: '常用有色金属冶炼', children: [leafNode(LEAF_MAP.C3211), leafNode(LEAF_MAP.C3216)] },
          ],
        },
        {
          id: 'C22',
          name: '造纸和纸制品业',
          children: [
            {
              id: 'C221',
              name: '纸浆制造',
              children: [leafNode(LEAF_MAP.C2211), leafNode(LEAF_MAP.C2212)],
            },
            { id: 'C222', name: '造纸', children: [leafNode(LEAF_MAP.C2221)] },
          ],
        },
      ],
    },
    {
      id: 'D',
      name: '电力、热力、燃气及水生产和供应业',
      children: [
        {
          id: 'D44',
          name: '电力、热力生产和供应业',
          children: [
            { id: 'D441', name: '电力生产', children: [leafNode(LEAF_MAP.D4411), leafNode(LEAF_MAP.D4412)] },
            { id: 'D442', name: '电力供应', children: [leafNode(LEAF_MAP.D4420)] },
          ],
        },
      ],
    },
    { id: 'E', name: '建筑业', children: [] },
    { id: 'F', name: '批发和零售业', children: [] },
    { id: 'G', name: '交通运输、仓储和邮政业', children: [
      {
        id: 'G56',
        name: '航空运输业',
        children: [
          { id: 'G561', name: '航空客货运输', children: [leafNode(LEAF_MAP.G5611), leafNode(LEAF_MAP.G5612)] },
          { id: 'G563', name: '机场', children: [leafNode(LEAF_MAP.G5631)] },
        ],
      },
    ] },
    { id: 'I', name: '信息传输、软件和信息技术服务业', children: [] },
    { id: 'J', name: '金融业', children: [] },
  ];

  function getPbocDefaultCodes() {
    return PBOC_INDUSTRY_LEAVES.map((x) => x.code);
  }

  function formatCodeDisplay(code) {
    return String(code || '').replace(/^[A-Z]/, '');
  }

  function formatSelectedSummary(codes) {
    const list = (codes || []).map((c) => {
      const item = LEAF_MAP[c];
      return item ? `${formatCodeDisplay(c)}${item.name}` : c;
    });
    return list.join('；');
  }

  function collectLeaves(node) {
    if (!node) return [];
    if (node.leaf) return [node.code];
    return (node.children || []).flatMap(collectLeaves);
  }

  function findNodeById(nodes, id) {
    for (const n of nodes || []) {
      if (n.id === id) return n;
      const hit = findNodeById(n.children, id);
      if (hit) return hit;
    }
    return null;
  }

  function getAllSelectableLeaves() {
    return INDUSTRY_SELECTOR_TREE.flatMap(collectLeaves);
  }

  return {
    PBOC_INDUSTRY_LEAVES,
    LEAF_MAP,
    TEST_INDUSTRY_MAJORS,
    INDUSTRY_SELECTOR_TREE,
    getPbocDefaultCodes,
    getTestIndustryMajors,
    resolveTestIndustryMajor,
    formatCodeDisplay,
    formatSelectedSummary,
    collectLeaves,
    findNodeById,
    getAllSelectableLeaves,
  };
})();
