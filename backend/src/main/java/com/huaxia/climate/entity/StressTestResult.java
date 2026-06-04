package com.huaxia.climate.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "stress_test_result")
public class StressTestResult {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long taskId;
    private String companyCode;
    private String companyName;
    private String branchCode;
    private String branchName;
    private String standardIndustry;
    private String scenarioCode;
    private String scenarioName;
    private BigDecimal metricRevenueBefore;
    private BigDecimal metricRevenueAfter;
    private BigDecimal metricEclBefore;
    private BigDecimal metricEclAfter;
    private BigDecimal impactRate;
    private LocalDateTime createdAt;
}
