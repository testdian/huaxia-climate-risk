package com.huaxia.climate.service;

import com.huaxia.climate.entity.CompanyFinancialRecord;
import com.huaxia.climate.entity.StressTestResult;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 场景压测计算 — 应用行内碳排放费用与转型风险方法
 */
@Service
public class StressCalculationService {

    private final CarbonStressCalculator carbonCalculator;

    public StressCalculationService(CarbonStressCalculator carbonCalculator) {
        this.carbonCalculator = carbonCalculator;
    }

    public List<StressTestResult> calculate(Long taskId, List<CompanyFinancialRecord> records, List<String> scenarios) {
        List<String> codes = scenarios == null || scenarios.isEmpty()
                ? List.of(CarbonStressCalculator.SCENARIO_BASELINE)
                : scenarios;

        List<StressTestResult> results = new ArrayList<>();
        for (CompanyFinancialRecord r : records) {
            if (Boolean.FALSE.equals(r.getIncluded())) continue;
            if (r.getStandardIndustry() == null || r.getStandardIndustry().isBlank()) continue;

            for (String scenario : codes) {
                CarbonStressCalculator.StressOutcome out = carbonCalculator.run(r, scenario, 2040);

                StressTestResult res = new StressTestResult();
                res.setTaskId(taskId);
                res.setCompanyCode(r.getCompanyCode());
                res.setCompanyName(r.getCompanyName());
                res.setBranchCode(r.getBranchCode());
                res.setBranchName(r.getBranchName());
                res.setStandardIndustry(r.getStandardIndustry());
                res.setScenarioCode(scenario);
                res.setScenarioName(out.scenarioName());
                res.setMetricRevenueBefore(out.revenueBefore());
                res.setMetricRevenueAfter(out.revenueAfter());
                res.setMetricEclBefore(out.eclBefore());
                res.setMetricEclAfter(out.eclAfter());
                res.setImpactRate(out.impactRate());
                res.setCreatedAt(LocalDateTime.now());
                results.add(res);
            }
        }
        return results;
    }
}
