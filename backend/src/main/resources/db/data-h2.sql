INSERT INTO industry_mapping (api_industry, standard_industry, status, version_tag) VALUES
('C2614 有机化学原料制造', '化工', 'ENABLED', 'V2.0-行内方法'),
('C3110 炼铁', '钢铁', 'ENABLED', 'V2.0-行内方法'),
('D4411 火力发电', '电力', 'ENABLED', 'V2.0-行内方法'),
('C3011 水泥制造', '建材', 'ENABLED', 'V2.0-行内方法'),
('制造业-化工', '化工', 'ENABLED', 'V2.0-行内方法'),
('制造业-钢铁', '钢铁', 'ENABLED', 'V2.0-行内方法'),
('电力热力', '电力', 'ENABLED', 'V2.0-行内方法');

-- 行业碳排放因子（吨 CO2e / 百万元），来源：高碳行业碳排放费用计算方法
INSERT INTO stress_factor (factor_code, factor_name, industry, scenario_type, factor_value, unit, status, version_tag) VALUES
('EMISSION_D4411', '火力发电-燃煤', '电力', 'EMISSION', 1974.5277, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_D4412', '火力发电-热电', '电力', 'EMISSION', 1387.5118, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_C2614', '化工-有机原料', '化工', 'EMISSION', 150.2545, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_CHEM_O', '化工-其他', '化工', 'EMISSION', 197.3447, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_STEEL', '钢铁', '钢铁', 'EMISSION', 358.3470, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_C3011', '水泥制造', '建材', 'EMISSION', 2001.1126, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_C2511_B', '石化-采购炼化', '石化', 'EMISSION', 92.6849, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_AL', '铝冶炼', '有色', 'EMISSION', 491.0012, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法'),
('EMISSION_AVIATION', '航空燃油', '航空', 'EMISSION', 162.7595, 'tCO2e/百万元', 'ENABLED', 'V2.0-行内方法');
