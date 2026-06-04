package com.huaxia.climate.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;

@Data
@AllArgsConstructor
public class SummaryItem {
    private String name;
    private BigDecimal impactRate;
    private int count;
}
