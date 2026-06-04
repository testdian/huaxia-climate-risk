package com.huaxia.climate.dto;

import lombok.Data;

@Data
public class CreateTaskRequest {
    private String taskName;
    private String reportPeriodStart;
    private String reportPeriodEnd;
    private String dataCaliber;
    private String description;
}
