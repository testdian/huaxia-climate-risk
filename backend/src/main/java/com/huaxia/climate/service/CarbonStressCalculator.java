package com.huaxia.climate.service;

import com.huaxia.climate.entity.CompanyFinancialRecord;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 高碳行业碳排放费用与转型风险压测计算
 */
@Component
public class CarbonStressCalculator {

    public static final String SCENARIO_BASELINE = "BASELINE";
    public static final String SCENARIO_GREENHOUSE = "GREENHOUSE_WORLD";
    public static final String SCENARIO_ORDERLY = "ORDERLY_TRANSITION";

    private static final BigDecimal CCUS_CAP = new BigDecimal("500");
    private static final BigDecimal TAX_RETAIN = new BigDecimal("0.75");

    private final Map<String, BigDecimal> emissionByGb = new LinkedHashMap<>();

    public CarbonStressCalculator() {
        emissionByGb.put("D4411", new BigDecimal("1974.5277"));
        emissionByGb.put("D4412", new BigDecimal("1387.5118"));
        emissionByGb.put("C2614", new BigDecimal("150.2545"));
        emissionByGb.put("C3110", new BigDecimal("358.3470"));
        emissionByGb.put("C3011", new BigDecimal("2001.1126"));
        emissionByGb.put("C2511", new BigDecimal("92.6849"));
        emissionByGb.put("C3211", new BigDecimal("23.0207"));
        emissionByGb.put("C3216", new BigDecimal("491.0012"));
        emissionByGb.put("G5611", new BigDecimal("162.7595"));
    }

    public StressOutcome run(CompanyFinancialRecord record, String scenarioCode, int testYear) {
        ScenarioParams sp = scenarioParams(scenarioCode);
        BigDecimal revenue0 = nz(record.getRevenue());
        BigDecimal revenue = rollRevenue(revenue0, testYear);

        BigDecimal emission = calcEmission(revenue, record);
        BigDecimal freeQuota = interpolate(sp.quota2025, sp.quota2040, testYear);
        BigDecimal carbonPrice = interpolate(sp.price2025, sp.price2040, testYear);
        BigDecimal carbonCostWan = carbonCostWan(emission, freeQuota, carbonPrice);

        BigDecimal costRatio = new BigDecimal("0.88");
        boolean highCarbon = isHighCarbon(record.getStandardIndustry());
        BigDecimal expense = highCarbon
                ? revenue.multiply(costRatio).add(carbonCostWan)
                : revenue.multiply(costRatio);
        BigDecimal profit = revenue.subtract(expense);
        BigDecimal netProfit = profit.compareTo(BigDecimal.ZERO) > 0
                ? profit.multiply(TAX_RETAIN)
                : profit;

        BigDecimal eclBefore = revenue0.multiply(new BigDecimal("0.02"));
        BigDecimal impact = revenue0.compareTo(BigDecimal.ZERO) > 0
                ? carbonCostWan.divide(revenue0, 6, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal revenueAfter = revenue.subtract(carbonCostWan).max(BigDecimal.ZERO);
        BigDecimal eclAfter = eclBefore.multiply(BigDecimal.ONE.add(impact.min(new BigDecimal("0.5"))))
                .setScale(2, RoundingMode.HALF_UP);

        return new StressOutcome(
                scenarioName(scenarioCode),
                revenue0.setScale(2, RoundingMode.HALF_UP),
                revenueAfter.setScale(2, RoundingMode.HALF_UP),
                emission.setScale(2, RoundingMode.HALF_UP),
                carbonCostWan.setScale(2, RoundingMode.HALF_UP),
                eclBefore.setScale(2, RoundingMode.HALF_UP),
                eclAfter,
                impact,
                netProfit.setScale(2, RoundingMode.HALF_UP),
                false
        );
    }

    private BigDecimal calcEmission(BigDecimal revenue, CompanyFinancialRecord r) {
        if (r.getApiIndustry() != null) {
            for (Map.Entry<String, BigDecimal> e : emissionByGb.entrySet()) {
                if (r.getApiIndustry().contains(e.getKey())) {
                    return revenue.multiply(e.getValue());
                }
            }
        }
        if ("钢铁".equals(r.getStandardIndustry())) {
            return revenue.multiply(emissionByGb.get("C3110"));
        }
        if ("化工".equals(r.getStandardIndustry())) {
            return revenue.multiply(emissionByGb.get("C2614"));
        }
        if ("电力".equals(r.getStandardIndustry())) {
            return revenue.multiply(emissionByGb.get("D4411"));
        }
        return revenue.multiply(new BigDecimal("197.3447"));
    }

    private BigDecimal carbonCostWan(BigDecimal emissionTon, BigDecimal freeQuota, BigDecimal priceYuan) {
        BigDecimal payable = BigDecimal.ONE.subtract(freeQuota);
        BigDecimal effectivePrice = priceYuan.min(CCUS_CAP);
        return emissionTon.multiply(payable).multiply(effectivePrice)
                .divide(new BigDecimal("10000"), 6, RoundingMode.HALF_UP);
    }

    private BigDecimal rollRevenue(BigDecimal r0, int testYear) {
        BigDecimal r = r0;
        for (int y = 2026; y <= testYear; y++) {
            r = r.multiply(new BigDecimal("1.02"));
        }
        return r.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal interpolate(BigDecimal v2025, BigDecimal v2040, int year) {
        if (year <= 2025) return v2025;
        if (year >= 2040) return v2040;
        BigDecimal t = new BigDecimal(year - 2025).divide(new BigDecimal("15"), 6, RoundingMode.HALF_UP);
        return v2025.add(v2040.subtract(v2025).multiply(t));
    }

    private boolean isHighCarbon(String industry) {
        if (industry == null) return false;
        return switch (industry) {
            case "电力", "建材", "钢铁", "石化", "化工", "造纸", "航空", "有色" -> true;
            default -> false;
        };
    }

    private ScenarioParams scenarioParams(String code) {
        return switch (code != null ? code : SCENARIO_BASELINE) {
            case SCENARIO_GREENHOUSE -> new ScenarioParams(
                    new BigDecimal("1"), new BigDecimal("0.85"),
                    new BigDecimal("80"), new BigDecimal("120"));
            case SCENARIO_ORDERLY -> new ScenarioParams(
                    new BigDecimal("1"), new BigDecimal("0.55"),
                    new BigDecimal("80"), new BigDecimal("200"));
            default -> new ScenarioParams(
                    new BigDecimal("1"), new BigDecimal("0.75"),
                    new BigDecimal("80"), new BigDecimal("150"));
        };
    }

    private String scenarioName(String code) {
        return switch (code != null ? code : SCENARIO_BASELINE) {
            case SCENARIO_GREENHOUSE -> "温室世界";
            case SCENARIO_ORDERLY -> "有序转型";
            default -> "现有政策（基准）";
        };
    }

    private BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private record ScenarioParams(BigDecimal quota2025, BigDecimal quota2040, BigDecimal price2025, BigDecimal price2040) {}

    public record StressOutcome(
            String scenarioName,
            BigDecimal revenueBefore,
            BigDecimal revenueAfter,
            BigDecimal carbonEmission,
            BigDecimal carbonCost,
            BigDecimal eclBefore,
            BigDecimal eclAfter,
            BigDecimal impactRate,
            BigDecimal netProfitAfter,
            boolean defaultFlag
    ) {}
}
