# QCode 后端

QCode 后端使用 Spring Boot WebFlux 提供本地 HTTP API，并通过 AgentScope 接入模型服务。模型提供商依项目配置支持 DashScope、OpenAI 兼容接口、Anthropic 和 Ollama。

## 环境要求

- Java 21 或更高版本
- Maven 3.9 或更高版本

## 启动

在本目录运行：

```powershell
mvn spring-boot:run
```

默认地址为 `http://localhost:8080`。打包为桌面应用所需的 Spring Boot JAR：

```powershell
mvn -DskipTests package
```

生成的 JAR 位于 `target/`。桌面端的 `npm run backend:prepare` 会自动构建并复制该 JAR。

## 配置

默认配置位于 `src/main/resources/application.yml`。可通过环境变量覆盖常用设置：

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `QCODE_MODEL` | 默认模型标识 | `dashscope:qwen-plus` |
| `QCODE_WORKSPACE` | 默认工作区路径 | 当前用户目录 |
| `QCODE_CORS_ORIGINS` | 允许跨域的来源 | `http://localhost:3000,http://localhost:5173` |

在桌面应用的模型设置中录入 API Key。模型配置保存在用户目录的 `.qcode/config/model.json`，不要将其中的真实凭据复制到源码或提交到 Git。

## 运行测试

```powershell
mvn test
```
