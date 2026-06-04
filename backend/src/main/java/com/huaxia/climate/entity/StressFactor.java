package com.huaxia.climate.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "stress_factor")
public class StressFactor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String factorCode;
    private String factorName;
    private String industry;
    private String scenarioType;
    private BigDecimal factorValue;
    private String unit;
    private String status;
    private String versionTag;
    private LocalDate effectiveFrom;
    private LocalDateTime createdAt;
}
