package com.huaxia.climate.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "stress_test_task")
public class StressTestTask {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String taskCode;
    private String taskName;
    private Integer reportYear;
    private String loanType;
    private String loanRegion;
    @Column(columnDefinition = "TEXT")
    private String description;
    private String status;
    @Column(columnDefinition = "JSON")
    private String filterJson;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
