package com.huaxia.climate.repository;

import com.huaxia.climate.entity.StressTestTask;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StressTestTaskRepository extends JpaRepository<StressTestTask, Long> {
}
