package com.qcode.model;


import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ModelProvider {
    private String code;
    private String name;
    private String defaultBaseUrl;

}
