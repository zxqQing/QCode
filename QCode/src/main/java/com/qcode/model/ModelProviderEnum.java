package com.qcode.model;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;

@Getter
@RequiredArgsConstructor
public enum ModelProviderEnum {
    OPENAI("openai", "OpenAI", "https://api.openai.com/v1"),
    DEEPSEEK("deepseek", "DeepSeek", "https://api.deepseek.com"),
    DASHSCOPE("dashscope", "阿里云", "https://dashscope.aliyuncs.com"),
    ANTHROPIC("anthropic", "Anthropic", "https://api.anthropic.com"),
    OLLAMA("ollama", "Ollama", "http://localhost:11434");

    private final String code;
    private final String name;
    private final String defaultBaseUrl;
    public static String getCodeByName(String name) {
        if (name == null) {
            throw new IllegalArgumentException("provider name cannot be null");
        }
        return fromCode(name).code;
    }
    public static ModelProviderEnum fromCode(String provider) {
        if (provider == null || provider.isBlank()) {
            throw new IllegalArgumentException("模型供应商不能为空");
        }
        return Arrays.stream(values())
                .filter(item -> item.code.equalsIgnoreCase(provider.trim())
                        || item.name.equalsIgnoreCase(provider.trim()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("不支持的模型供应商: " + provider));
    }
}
