package com.qcode.controller;

import com.qcode.domain.dto.AddModelDTO;
import com.qcode.model.ModelConfig;
import com.qcode.model.ModelProvider;
import com.qcode.model.ModelProviderEnum;
import com.qcode.service.ModelService;

import lombok.RequiredArgsConstructor;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/models")
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class ModelController {
    private final ModelService modelService;
    @GetMapping("/providers")
    public List<ModelProvider> listProviders() {
        return Arrays.stream(ModelProviderEnum.values())
                .map(provider -> new ModelProvider(
                        provider.getCode(),
                        provider.getName(),
                        provider.getDefaultBaseUrl()
                ))
                .toList();
    }
    @GetMapping("/list")
    public List<ModelConfig> listModels() {
        return modelService.listModels().stream().map(model -> {
            ModelConfig safe = new ModelConfig();
            safe.setId(model.getId());
            safe.setModelName(model.getModelName());
            safe.setProvider(model.getProvider());
            safe.setBaseUrl(model.getBaseUrl());
            safe.setActive(model.isActive());
            return safe;
        }).toList();
    }

    @PostMapping("/add")
    public void addModel(@Valid @RequestBody AddModelDTO dto) {
        modelService.addModel(dto);
    }

    @PutMapping("/{id}/activate")
    public void activateModel(@PathVariable String id) {
        modelService.activateModel(id);
    }
}
