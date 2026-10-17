package com.qcode.model;

public class ModelResolver {

    public String resolve(String modelName) {
        if (modelName == null || modelName.isBlank()) {
            throw new IllegalArgumentException("模型名称不能为空");
        }
        if (modelName.contains(":")) {
            return modelName;
        }
        if (isQwenModel(modelName)) {
            return "dashscope:" + modelName;
        }
        if (isDeepSeekModel(modelName)) {
            return "deepseek:" + modelName;
        }
        throw new IllegalArgumentException(
                "不支持的模型: " + modelName
                        + "，目前仅支持 Qwen 和 DeepSeek"
        );
    }
    private boolean isQwenModel(String modelName) {
        return modelName.startsWith("qwen");
    }
    private boolean isDeepSeekModel(String modelName) {
        return modelName.startsWith("deepseek");
    }
}
