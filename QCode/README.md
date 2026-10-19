# QCode 后端

QCode 后端基于 Java 21、Spring Boot 和 AgentScope，负责会话、项目、模型、MCP、技能、权限、文件访问和 AI Agent 执行。桌面安装包已经内置后端 JAR 与 Java 21 运行时，普通用户无需单独部署本服务。

## 下载桌面版

- [Windows 安装版](https://github.com/zxqQing/QCode/releases/latest/download/QCode-1.0.0-x64-setup.exe)
- [Windows 便携版](https://github.com/zxqQing/QCode/releases/latest/download/QCode-1.0.0-x64-portable.exe)
- [全部 Releases](https://github.com/zxqQing/QCode/releases)

![QCode Windows 桌面快捷方式](../docs/images/qcode-windows-desktop.png)

## 技术栈

- Java 21
- Spring Boot 3.4
- Spring WebFlux / WebSocket / Actuator
- AgentScope 2.x
- Maven 3.9+

## 本地启动

在本目录运行：

```powershell
mvn spring-boot:run
```

服务默认监听 `http://localhost:8080`，健康检查地址为：

```text
http://localhost:8080/actuator/health
```

## 配置

默认配置位于 `src/main/resources/application.yml`。

| 环境变量 | 用途 | 默认值 |
| --- | --- | --- |
| `QCODE_MODEL` | 默认模型标识 | `dashscope:qwen-plus` |
| `QCODE_WORKSPACE` | 默认工作区 | 当前用户目录 |
| `QCODE_CORS_ORIGINS` | 允许访问后端的前端来源 | `http://localhost:3000,http://localhost:5173` |

桌面端模型设置保存在当前用户目录的 `.qcode/config/model.json`。API Key 属于敏感信息，不应写入源码、README 或提交到 Git。

## 构建与测试

运行测试：

```powershell
mvn test
```

构建 Spring Boot JAR：

```powershell
mvn -DskipTests package
```

JAR 会生成到 `target/`。桌面端的 `npm run backend:prepare` 会自动使用 JDK 21 构建，并将最新 JAR 复制为 `QCode-Desktop/backend/qcode.jar`。

完整 Windows 打包请在 `QCode-Desktop/` 中运行：

```powershell
npm run electron:build
```

该命令会依次构建后端、生成精简 Java 21 运行时、构建前端并输出安装版与便携版 EXE。

## 相关文档

- [项目主页](../README.md)
- [桌面端开发与打包](../QCode-Desktop/README.md)
