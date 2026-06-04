package com.huaxia.climate.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "industry_mapping")
public class IndustryMapping {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String apiIndustry;
    private String standardIndustry;
    private String status;
    private String versionTag;
    private LocalDateTime createdAt;
}
