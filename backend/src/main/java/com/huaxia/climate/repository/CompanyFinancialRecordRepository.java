package com.huaxia.climate.repository;

import com.huaxia.climate.entity.CompanyFinancialRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CompanyFinancialRecordRepository extends JpaRepository<CompanyFinancialRecord, Long> {
    List<CompanyFinancialRecord> findByTaskId(Long taskId);
    void deleteByTaskId(Long taskId);
}
