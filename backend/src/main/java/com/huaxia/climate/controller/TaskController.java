package com.huaxia.climate.controller;

import com.huaxia.climate.common.ApiResponse;
import com.huaxia.climate.dto.CreateTaskRequest;
import com.huaxia.climate.dto.SummaryItem;
import com.huaxia.climate.entity.CompanyFinancialRecord;
import com.huaxia.climate.entity.StressTestResult;
import com.huaxia.climate.entity.StressTestTask;
import com.huaxia.climate.service.TaskService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public ApiResponse<List<StressTestTask>> list() {
        return ApiResponse.ok(taskService.listTasks());
    }

    @GetMapping("/{id}")
    public ApiResponse<StressTestTask> get(@PathVariable Long id) {
        return ApiResponse.ok(taskService.getTask(id));
    }

    @PostMapping
    public ApiResponse<StressTestTask> create(@RequestBody CreateTaskRequest req) {
        return ApiResponse.ok(taskService.createTask(req));
    }

    @PostMapping("/{id}/sync")
    public ApiResponse<Void> sync(@PathVariable Long id) {
        taskService.syncFinancialData(id);
        return ApiResponse.ok(null);
    }

    @GetMapping("/{id}/records")
    public ApiResponse<List<CompanyFinancialRecord>> records(@PathVariable Long id) {
        return ApiResponse.ok(taskService.listRecords(id));
    }

    @PostMapping("/{id}/records/confirm")
    public ApiResponse<Void> confirm(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        taskService.confirmRecords(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/calc-industry-avg")
    public ApiResponse<Void> calcAvg(@PathVariable Long id) {
        taskService.calcIndustryAvg(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/stress")
    public ApiResponse<Void> stress(@PathVariable Long id, @RequestBody Map<String, List<String>> body) {
        taskService.runStress(id, body.getOrDefault("scenarios",
                List.of("BASELINE", "GREENHOUSE_WORLD", "ORDERLY_TRANSITION")));
        return ApiResponse.ok(null);
    }

    @GetMapping("/{id}/results")
    public ApiResponse<List<StressTestResult>> results(@PathVariable Long id) {
        return ApiResponse.ok(taskService.listResults(id));
    }

    @GetMapping("/{id}/summary")
    public ApiResponse<List<SummaryItem>> summary(@PathVariable Long id, @RequestParam(defaultValue = "industry") String dimension) {
        return ApiResponse.ok(taskService.summary(id, dimension));
    }
}
