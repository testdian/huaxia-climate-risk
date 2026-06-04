package com.huaxia.climate.service;

import com.huaxia.climate.config.AppProperties;
import com.huaxia.climate.dto.CreateTaskRequest;
import com.huaxia.climate.dto.SummaryItem;
import com.huaxia.climate.entity.*;
import com.huaxia.climate.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class TaskService {

    private final StressTestTaskRepository taskRepository;
    private final CompanyFinancialRecordRepository recordRepository;
    private final IndustryMappingRepository mappingRepository;
    private final StressTestResultRepository resultRepository;
    private final StressCalculationService calculationService;
    private final AppProperties appProperties;

    public TaskService(StressTestTaskRepository taskRepository,
                       CompanyFinancialRecordRepository recordRepository,
                       IndustryMappingRepository mappingRepository,
                       StressTestResultRepository resultRepository,
                       StressCalculationService calculationService,
                       AppProperties appProperties) {
        this.taskRepository = taskRepository;
        this.recordRepository = recordRepository;
        this.mappingRepository = mappingRepository;
        this.resultRepository = resultRepository;
        this.calculationService = calculationService;
        this.appProperties = appProperties;
    }

    public List<StressTestTask> listTasks() {
        return taskRepository.findAll();
    }

    public StressTestTask getTask(Long id) {
        return taskRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("任务不存在"));
    }

    @Transactional
    public StressTestTask createTask(CreateTaskRequest req) {
        StressTestTask task = new StressTestTask();
        task.setTaskCode("CRST" + System.currentTimeMillis());
        task.setTaskName(req.getTaskName());
        task.setReportPeriodStart(LocalDate.parse(req.getReportPeriodStart()));
        task.setReportPeriodEnd(LocalDate.parse(req.getReportPeriodEnd()));
        task.setDataCaliber(req.getDataCaliber());
        task.setDescription(req.getDescription());
        task.setStatus("DRAFT");
        task.setCreatedBy(appProperties.getMockUserId());
        task.setCreatedAt(LocalDateTime.now());
        task.setUpdatedAt(LocalDateTime.now());
        return taskRepository.save(task);
    }

    @Transactional
    public void syncFinancialData(Long taskId) {
        StressTestTask task = getTask(taskId);
        task.setStatus("SYNCING");
        taskRepository.save(task);

        recordRepository.deleteByTaskId(taskId);
        List<CompanyFinancialRecord> mock = buildMockRecords(task);
        recordRepository.saveAll(mock);

        task.setStatus("PENDING_CONFIRM");
        task.setUpdatedAt(LocalDateTime.now());
        taskRepository.save(task);
    }

    private List<CompanyFinancialRecord> buildMockRecords(StressTestTask task) {
        List<Object[]> seeds = List.of(
                new Object[]{"C001", "华东化工有限公司", "上海分行", "制造业-化工", new BigDecimal("120000")},
                new Object[]{"C002", "北方钢铁集团", "北京分行", "制造业-钢铁", new BigDecimal("98000")},
                new Object[]{"C003", "华南电力股份", "广州分行", "电力热力", new BigDecimal("150000")},
                new Object[]{"C004", "西南运输公司", "成都分行", "交通运输", new BigDecimal("45000")},
                new Object[]{"C005", "未知行业企业", "深圳分行", "其他行业", new BigDecimal("30000")}
        );

        List<CompanyFinancialRecord> list = new ArrayList<>();
        int idx = 0;
        for (Object[] s : seeds) {
            CompanyFinancialRecord r = new CompanyFinancialRecord();
            r.setTaskId(task.getId());
            r.setCompanyCode((String) s[0]);
            r.setCompanyName((String) s[1]);
            r.setBranchName((String) s[2]);
            r.setApiIndustry((String) s[3]);
            r.setReportPeriod(task.getReportPeriodEnd());
            r.setRevenue((BigDecimal) s[4]);
            r.setNetProfit(((BigDecimal) s[4]).multiply(new BigDecimal("0.08")));
            r.setTotalAssets(((BigDecimal) s[4]).multiply(new BigDecimal("2.5")));

            mappingRepository.findByApiIndustryAndStatus((String) s[3], "ENABLED")
                    .ifPresentOrElse(m -> r.setStandardIndustry(m.getStandardIndustry()),
                            () -> r.setStandardIndustry(null));

            if (r.getStandardIndustry() == null) {
                r.setDataAvailability("ABNORMAL");
                r.setAvailabilityReason("行业未映射");
            } else if (idx % 5 == 2) {
                r.setDataAvailability("NEED_AVG");
                r.setAvailabilityReason("关键指标缺失，需行业均值补算");
                r.setRevenue(null);
            } else {
                r.setDataAvailability("USABLE");
                r.setAvailabilityReason("数据完整");
                r.setDataSource("API");
            }
            r.setConfirmed(false);
            r.setIncluded(true);
            r.setCreatedAt(LocalDateTime.now());
            list.add(r);
            idx++;
        }
        return list;
    }

    public List<CompanyFinancialRecord> listRecords(Long taskId) {
        return recordRepository.findByTaskId(taskId);
    }

    @Transactional
    public void confirmRecords(Long taskId) {
        List<CompanyFinancialRecord> records = listRecords(taskId);
        for (CompanyFinancialRecord r : records) {
            if (!"ABNORMAL".equals(r.getDataAvailability())) {
                r.setConfirmed(true);
            }
        }
        recordRepository.saveAll(records);
        StressTestTask task = getTask(taskId);
        task.setStatus("PROCESSING");
        taskRepository.save(task);
    }

    @Transactional
    public void calcIndustryAvg(Long taskId) {
        List<CompanyFinancialRecord> records = listRecords(taskId);
        Map<String, BigDecimal> avgByIndustry = records.stream()
                .filter(r -> r.getRevenue() != null && r.getStandardIndustry() != null)
                .collect(Collectors.groupingBy(CompanyFinancialRecord::getStandardIndustry,
                        Collectors.mapping(CompanyFinancialRecord::getRevenue,
                                Collectors.collectingAndThen(Collectors.toList(), list -> {
                                    BigDecimal sum = list.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
                                    return sum.divide(BigDecimal.valueOf(list.size()), 2, RoundingMode.HALF_UP);
                                }))));

        for (CompanyFinancialRecord r : records) {
            if ("NEED_AVG".equals(r.getDataAvailability()) && r.getStandardIndustry() != null) {
                BigDecimal avg = avgByIndustry.get(r.getStandardIndustry());
                if (avg != null) {
                    r.setRevenue(avg);
                    r.setDataSource("INDUSTRY_AVG");
                    r.setDataAvailability("USABLE");
                    r.setAvailabilityReason("已使用行业均值补算");
                    r.setConfirmed(true);
                }
            }
        }
        recordRepository.saveAll(records);
        StressTestTask task = getTask(taskId);
        task.setStatus("READY_STRESS");
        taskRepository.save(task);
    }

    @Transactional
    public void runStress(Long taskId, List<String> scenarios) {
        StressTestTask task = getTask(taskId);
        task.setStatus("STRESSING");
        taskRepository.save(task);

        resultRepository.deleteByTaskId(taskId);
        List<CompanyFinancialRecord> records = listRecords(taskId).stream()
                .filter(r -> Boolean.TRUE.equals(r.getIncluded()) && !"ABNORMAL".equals(r.getDataAvailability()))
                .toList();
        List<StressTestResult> results = calculationService.calculate(taskId, records, scenarios);
        resultRepository.saveAll(results);

        task.setStatus("COMPLETED");
        task.setUpdatedAt(LocalDateTime.now());
        taskRepository.save(task);
    }

    public List<StressTestResult> listResults(Long taskId) {
        return resultRepository.findByTaskId(taskId);
    }

    public List<SummaryItem> summary(Long taskId, String dimension) {
        List<StressTestResult> results = listResults(taskId);
        Map<String, List<StressTestResult>> grouped = results.stream().collect(Collectors.groupingBy(r -> {
            if ("branch".equals(dimension)) {
                return r.getBranchName() != null ? r.getBranchName() : "未知分行";
            }
            return r.getStandardIndustry() != null ? r.getStandardIndustry() : "未知行业";
        }));
        return grouped.entrySet().stream()
                .map(e -> {
                    BigDecimal avg = e.getValue().stream()
                            .map(StressTestResult::getImpactRate)
                            .filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                            .divide(BigDecimal.valueOf(e.getValue().size()), 4, RoundingMode.HALF_UP);
                    return new SummaryItem(e.getKey(), avg, e.getValue().size());
                })
                .sorted(Comparator.comparing(SummaryItem::getName))
                .toList();
    }
}
