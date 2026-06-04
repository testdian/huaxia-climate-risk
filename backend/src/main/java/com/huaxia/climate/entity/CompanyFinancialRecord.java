package com.huaxia.climate.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "company_financial_record")
public class CompanyFinancialRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long taskId;
    private String companyCode;
    private String companyName;
    private String branchCode;
    private String branchName;
    private String apiIndustry;
    private String standardIndustry;
    private LocalDate reportPeriod;
    private BigDecimal revenue;
    private BigDecimal netProfit;
    private BigDecimal totalAssets;
    private String dataAvailability;
    private String availabilityReason;
    private String dataSource;
    private Boolean confirmed;
    private Boolean included;
    private LocalDateTime createdAt;
}
