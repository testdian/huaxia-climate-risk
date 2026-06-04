package com.huaxia.climate.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {
    private String mockUserId = "HQ_ADMIN_001";
    private String mockUserName = "总行管理员";
}
