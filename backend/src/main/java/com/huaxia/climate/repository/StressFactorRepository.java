package com.huaxia.climate.repository;

import com.huaxia.climate.entity.StressFactor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StressFactorRepository extends JpaRepository<StressFactor, Long> {
    List<StressFactor> findByStatus(String status);
}
