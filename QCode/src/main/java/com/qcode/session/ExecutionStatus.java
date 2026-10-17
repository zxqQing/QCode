package com.qcode.session;

public enum ExecutionStatus {
    RUNNING,           // 正在执行
    WAITING_APPROVAL,  // 等待人工审批
    STOPPING,          // 正在停止
    STOPPED,           // 已停止
    COMPLETED,         // 正常完成
    FAILED             // 执行失败
}
