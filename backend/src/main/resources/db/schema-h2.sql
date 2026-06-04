-- H2 开发库表结构（与 MySQL 逻辑一致，语法适配 H2）

CREATE TABLE IF NOT EXISTS stress_test_task (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_code VARCHAR(64) NOT NULL,
    task_name VARCHAR(200) NOT NULL,
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    data_caliber VARCHAR(100),
    description CLOB,
    status VARCHAR(32) NOT NULL,
    filter_json VARCHAR(4000),
    created_by VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_financial_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
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
    confirmed BOOLEAN DEFAULT FALSE,
    included BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    api_industry VARCHAR(100) NOT NULL,
    standard_industry VARCHAR(100) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
    version_tag VARCHAR(32) DEFAULT 'v1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stress_factor (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    factor_code VARCHAR(64) NOT NULL,
    factor_name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    scenario_type VARCHAR(64),
    factor_value DECIMAL(18,6) NOT NULL,
    unit VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
    version_tag VARCHAR(32) DEFAULT 'v1',
    effective_from DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stress_test_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
