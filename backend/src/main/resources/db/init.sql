CREATE DATABASE IF NOT EXISTS climate_risk_stress DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE climate_risk_stress;

-- 压测任务
CREATE TABLE IF NOT EXISTS stress_test_task (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_code VARCHAR(64) NOT NULL UNIQUE,
    task_name VARCHAR(200) NOT NULL,
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    data_caliber VARCHAR(100),
    description TEXT,
    status VARCHAR(32) NOT NULL,
    filter_json JSON,
    created_by VARCHAR(64),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 公司财务同步数据
CREATE TABLE IF NOT EXISTS company_financial_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id BIGINT NOT NULL,
    company_code VARCHAR(64) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    branch_code VARCHAR(64),
    branch_name VARCHAR(200),
    api_industry VARCHAR(100),
    standard_industry VARCHAR(100),
    report_period DATE,
    revenue DECIMAL(20,2),
    net_profit DECIMAL(20,2),
    total_assets DECIMAL(20,2),
    data_availability VARCHAR(32) NOT NULL,
    availability_reason VARCHAR(500),
    data_source VARCHAR(32),
    confirmed TINYINT(1) DEFAULT 0,
    included TINYINT(1) DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task (task_id),
    INDEX idx_availability (task_id, data_availability)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 行业映射
CREATE TABLE IF NOT EXISTS industry_mapping (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    api_industry VARCHAR(100) NOT NULL,
    standard_industry VARCHAR(100) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
    version_tag VARCHAR(32) DEFAULT 'v1',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_api (api_industry, version_tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 因子库
CREATE TABLE IF NOT EXISTS stress_factor (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    factor_code VARCHAR(64) NOT NULL,
    factor_name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    scenario_type VARCHAR(64),
    factor_value DECIMAL(18,6) NOT NULL,
    unit VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
    version_tag VARCHAR(32) DEFAULT 'v1',
    effective_from DATE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_code_version (factor_code, version_tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 压测结果（公司级）
CREATE TABLE IF NOT EXISTS stress_test_result (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id BIGINT NOT NULL,
    company_code VARCHAR(64) NOT NULL,
    company_name VARCHAR(200),
    branch_code VARCHAR(64),
    branch_name VARCHAR(200),
    standard_industry VARCHAR(100),
    scenario_code VARCHAR(64) NOT NULL,
    scenario_name VARCHAR(200),
    metric_revenue_before DECIMAL(20,2),
    metric_revenue_after DECIMAL(20,2),
    metric_ecl_before DECIMAL(20,2),
    metric_ecl_after DECIMAL(20,2),
    impact_rate DECIMAL(10,6),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_scenario (task_id, scenario_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 导出留痕
CREATE TABLE IF NOT EXISTS export_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id BIGINT,
    export_scope VARCHAR(64),
    export_fields TEXT,
    file_format VARCHAR(16),
    file_name VARCHAR(255),
    exported_by VARCHAR(64),
    exported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 操作日志（模块内轻量留痕，主系统日志仍由绿金系统承接）
CREATE TABLE IF NOT EXISTS operation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id BIGINT,
    operator_id VARCHAR(64),
    operator_name VARCHAR(100),
    action VARCHAR(64),
    detail TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO industry_mapping (api_industry, standard_industry, status, version_tag) VALUES
('制造业-化工', '化工', 'ENABLED', 'v1'),
('制造业-钢铁', '钢铁', 'ENABLED', 'v1'),
('电力热力', '电力', 'ENABLED', 'v1'),
('交通运输', '交通运输', 'ENABLED', 'v1')
ON DUPLICATE KEY UPDATE standard_industry=VALUES(standard_industry);

INSERT INTO stress_factor (factor_code, factor_name, industry, scenario_type, factor_value, unit, status, version_tag) VALUES
('TRANS_CHEM_01', '化工转型风险因子', '化工', 'TRANSITION', 0.12, 'ratio', 'ENABLED', 'v1'),
('TRANS_STEEL_01', '钢铁转型风险因子', '钢铁', 'TRANSITION', 0.15, 'ratio', 'ENABLED', 'v1'),
('PHYS_POWER_01', '电力物理风险因子', '电力', 'PHYSICAL', 0.08, 'ratio', 'ENABLED', 'v1'),
('COMP_TRANS_01', '综合风险因子', NULL, 'COMPREHENSIVE', 0.10, 'ratio', 'ENABLED', 'v1')
ON DUPLICATE KEY UPDATE factor_value=VALUES(factor_value);
