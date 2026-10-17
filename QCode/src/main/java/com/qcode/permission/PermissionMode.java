package com.qcode.permission;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PermissionMode {
    AUTO("AI 自动审批", "由 AI 判断工具调用是否通过；不通过时转人工审批"),
    MANUAL("人工审批", "所有需要审批的工具调用均交由用户确认");

    private final String description;
    private final String detail;
}
