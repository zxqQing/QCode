package com.qcode.session;

import io.agentscope.harness.agent.HarnessAgent;
import lombok.Getter;

import java.util.concurrent.atomic.AtomicReference;

@Getter
public class SessionExecution {

    private final String sessionId;
    private final String projectId;
    private final HarnessAgent agent;

    private final AtomicReference<ExecutionStatus> status = new AtomicReference<>(ExecutionStatus.RUNNING);

    public SessionExecution(
            String sessionId,
            String projectId,
            HarnessAgent agent
    ) {
        this.sessionId = sessionId;
        this.projectId = projectId;
        this.agent = agent;
    }

    public void setStatus(ExecutionStatus newStatus) {
        status.set(newStatus);
    }

    /**
     * 外部中断：只有 RUNNING 或 WAITING_APPROVAL 才能被中断
     */
    public boolean stop() {
        while (true) {
            ExecutionStatus current = status.get();
            if (current != ExecutionStatus.RUNNING
                    && current != ExecutionStatus.WAITING_APPROVAL) {
                return false;
            }
            if (status.compareAndSet(current, ExecutionStatus.STOPPING)) {
                agent.interrupt("qing", sessionId);
                return true;
            }
            // CAS 失败说明被别人抢先改了，重试
        }
    }
}