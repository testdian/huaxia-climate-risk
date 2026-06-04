package com.huaxia.climate.repository;

import com.huaxia.climate.entity.IndustryMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IndustryMappingRepository extends JpaRepository<IndustryMapping, Long> {
    List<IndustryMapping> findByStatus(String status);
    Optional<IndustryMapping> findByApiIndustryAndStatus(String apiIndustry, String status);
}
