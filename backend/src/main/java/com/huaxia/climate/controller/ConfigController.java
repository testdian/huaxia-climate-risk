package com.huaxia.climate.controller;

import com.huaxia.climate.common.ApiResponse;
import com.huaxia.climate.entity.IndustryMapping;
import com.huaxia.climate.entity.StressFactor;
import com.huaxia.climate.repository.IndustryMappingRepository;
import com.huaxia.climate.repository.StressFactorRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final IndustryMappingRepository mappingRepository;
    private final StressFactorRepository factorRepository;

    public ConfigController(IndustryMappingRepository mappingRepository, StressFactorRepository factorRepository) {
        this.mappingRepository = mappingRepository;
        this.factorRepository = factorRepository;
    }

    @GetMapping("/industry-mappings")
    public ApiResponse<List<IndustryMapping>> mappings() {
        return ApiResponse.ok(mappingRepository.findByStatus("ENABLED"));
    }

    @GetMapping("/factors")
    public ApiResponse<List<StressFactor>> factors() {
        return ApiResponse.ok(factorRepository.findByStatus("ENABLED"));
    }
}
