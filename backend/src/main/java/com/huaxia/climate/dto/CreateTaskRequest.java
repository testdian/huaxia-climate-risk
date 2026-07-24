package com.huaxia.climate.dto;

import lombok.Data;

@Data
public class CreateTaskRequest {
    private String taskName;
    private Integer reportYear;
    private String loanType;
    private String loanRegion;
    private String description;
}
