package com.huaxia.climate.repository;

import com.huaxia.climate.entity.StressTestResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StressTestResultRepository extends JpaRepository<StressTestResult, Long> {
    List<StressTestResult> findByTaskId(Long taskId);
    void deleteByTaskId(Long taskId);
}
