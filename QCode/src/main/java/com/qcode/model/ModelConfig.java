package com.qcode.model;

import lombok.Data;

@Data
public class ModelConfig {
    /** 模型唯一标识 */
    private String id;
    /** 模型名称 */
    private String modelName;
    /** 模型提供商，例如 OpenAI、Anthropic */
    private String provider;
    /** API 密钥 */
    private String apiKey;
    /** API 地址 */
    private String baseUrl;
    /** 是否为当前启用模型 */
    private boolean active;
}