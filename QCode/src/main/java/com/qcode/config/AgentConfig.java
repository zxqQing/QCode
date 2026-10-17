package com.qcode.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;

@Configuration
@ConfigurationProperties(prefix = "qcode")
@Data
public class AgentConfig {
    private Path workspace;
    private String model;
}
