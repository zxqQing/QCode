package com.qcode.agent;

import io.agentscope.harness.agent.filesystem.AbstractFilesystem;
import io.agentscope.harness.agent.filesystem.spec.LocalFilesystemSpec;
import io.agentscope.harness.agent.workspace.LocalFsMode;

import java.nio.file.Path;

public class test {
    public static void main(String[] args) {
        Path project = Path.of("D:/zxq/agent/QCodeTest");
        Path workspace = Path.of("D:/zxq/agent/QCode/.qcode/workspace");

        LocalFilesystemSpec spec = new LocalFilesystemSpec()
                .mode(LocalFsMode.ROOTED)
                .projectWritable(true);

        System.out.println("spec.project = " + spec.getProject());
        System.out.println("user.dir = " + System.getProperty("user.dir"));

        AbstractFilesystem filesystem = spec.toFilesystem(workspace, null);
        System.out.println("====================");
        System.out.println("spec.project = " + filesystem);
    }
}
