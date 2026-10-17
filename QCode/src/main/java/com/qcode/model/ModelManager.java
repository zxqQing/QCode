package com.qcode.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import io.agentscope.core.model.*;
import io.agentscope.extensions.model.anthropic.AnthropicChatModel;
import io.agentscope.extensions.model.dashscope.DashScopeChatModel;
import io.agentscope.extensions.model.ollama.OllamaChatModel;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.ArrayList;
import java.util.Objects;
import java.util.UUID;

@Component
public class ModelManager {
    ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final Path modelPath = Path.of(System.getProperty("user.home"))
            .resolve(".qcode")
            .resolve("config")
            .resolve("model.json");

    public Model createModel() {
        ModelConfig activeModel = getActiveModel();
        if (activeModel == null){
            return null;
        }
        ModelCreationContext context =
                ModelCreationContext.builder()
                        .apiKey(activeModel.getApiKey())
                        .baseUrl(activeModel.getBaseUrl())
                        .stream(true)
                        .enableThinking(true)
                        // 扩展模块定义的标量配置，key 由具体模型提供商文档约定。
                        .option("contextWindowSize", 128000)
                        // 以类型为 key 的组件对象，用于传入更复杂的提供商配置、transport 或 formatter。
                        .component(
                                GenerateOptions.class,
                                GenerateOptions.builder()
                                        .parallelToolCalls(false)
                                        .build())
                        .build();
        String provider = activeModel.getProvider();
        String code = ModelProviderEnum.getCodeByName(provider);
        String modelId = code+":"+activeModel.getModelName();
        return ModelRegistry.resolve(modelId, context);
    }
    /**
     * 获取当前激活的模型配置
     */
    public ModelConfig getActiveModel() {
        return readConfig().stream()
                .filter(ModelConfig::isActive)
                .findFirst()
                .orElse(null);
    }
    /**
     * 新增模型
     */
    public synchronized void addModel(ModelConfig model) {
        List<ModelConfig> config = readConfig();
        // 生成随机 UUID
        model.setId(UUID.randomUUID().toString());
        // 新增模型默认不启用
        model.setActive(false);
        config.add(model);
        writeConfig(config);
    }
    /**
     * 获取模型列表
     */
    public List<ModelConfig> listModels() {
        return readConfig();
    }
    /**
     * 切换当前启用的模型
     */
    public synchronized void activateModel(String id) {
        List<ModelConfig> config = readConfig();

        ModelConfig target = config.stream()
                .filter(model -> Objects.equals(model.getId(), id))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("模型不存在: " + id));
        // 保证同一时刻只有一个模型启用
        config.forEach(model -> model.setActive(false));
        target.setActive(true);
        writeConfig(config);
    }


    /**
     * 读取模型配置
     */
    private List<ModelConfig> readConfig() {
        try {
            if (Files.notExists(modelPath)) {
                return new ArrayList<>();
            }
            return new ArrayList<>(objectMapper.readValue(modelPath.toFile(),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ModelConfig.class)));
        } catch (IOException e) {
            throw new IllegalStateException("读取模型配置失败", e);
        }
    }

    /**
     * 保存模型配置
     */
    private void writeConfig(List<ModelConfig> config) {
        try {
            Files.createDirectories(modelPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(modelPath.toFile(), config);
        } catch (IOException e) {
            throw new IllegalStateException("保存模型配置失败", e);
        }
    }

}
