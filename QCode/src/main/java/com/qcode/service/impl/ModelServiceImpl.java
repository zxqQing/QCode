package com.qcode.service.impl;

import com.qcode.domain.dto.AddModelDTO;
import com.qcode.model.ModelConfig;
import com.qcode.model.ModelManager;
import com.qcode.model.ModelProviderEnum;
import com.qcode.service.ModelService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ModelServiceImpl implements ModelService {
    private final ModelManager modelManager;
    @Override
    public List<ModelConfig> listModels() {
        return modelManager.listModels();
    }

    @Override
    public void addModel(AddModelDTO dto) {
        ModelConfig modelConfig = new ModelConfig();
        modelConfig.setModelName(dto.getModelName().trim());
        ModelProviderEnum provider = ModelProviderEnum.fromCode(dto.getProvider());
        modelConfig.setProvider(provider.getCode());
        modelConfig.setBaseUrl(dto.getBaseUrl() == null || dto.getBaseUrl().isBlank()
                ? provider.getDefaultBaseUrl() : dto.getBaseUrl().trim());
        modelConfig.setApiKey(dto.getApiKey().trim());
        modelManager.addModel(modelConfig);
    }

    @Override
    public void activateModel(String id) {
        modelManager.activateModel(id);
    }
}
