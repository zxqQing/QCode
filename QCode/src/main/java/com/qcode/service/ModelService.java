package com.qcode.service;

import com.qcode.domain.dto.AddModelDTO;
import com.qcode.model.ModelConfig;

import java.util.List;

public interface ModelService {
    List<ModelConfig> listModels();

    void addModel(AddModelDTO dto);

    void activateModel(String id);
}
