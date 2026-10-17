package com.qcode.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AddModelDTO {
    /** 模型名称 */
    @NotBlank(message = "模型名称不能为空")
    private String modelName;

    /** 模型提供商 */
    @NotBlank(message = "模型提供商不能为空")
    private String provider;

    /** API 地址；为空时使用服务商默认地址 */
    private String baseUrl;

    /** API 密钥 */
    @NotBlank(message = "API 密钥不能为空")
    private String apiKey;
}
