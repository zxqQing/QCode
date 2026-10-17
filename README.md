# QCode

QCode 是一个本地运行的 AI 编程助手项目，包含 Spring Boot 后端和基于 React、Vite、Electron 的桌面端。桌面应用提供对话、项目与会话管理、代码文件预览，以及模型、技能和权限设置。

## 界面预览

主界面：

![QCode 主界面](docs/images/qcode-home.png)

代码任务对话：

![QCode 代码任务对话](docs/images/qcode-chat.png)

## 项目结构

```text
.
├── QCode/                 # Spring Boot 后端
├── QCode-Desktop/         # React + Electron 桌面端
└── README.md
```

## 环境要求

- Java 21 或更高版本
- Maven 3.9 或更高版本
- Node.js 20 或更高版本及 npm

## 开发启动

先启动后端：

```powershell
cd QCode
mvn spring-boot:run
```

后端默认监听 `http://localhost:8080`。另开终端启动前端：

```powershell
cd QCode-Desktop
npm install
npm run dev
```

要在 Electron 桌面窗口中运行，先准备后端 JAR，再启动 Electron：

```powershell
cd QCode-Desktop
npm install
npm run desktop:prepare
npm run electron:dev
```

构建桌面安装包：

```powershell
cd QCode-Desktop
npm run desktop:prepare
npm run electron:build
```

## 配置模型

启动应用后，在模型设置中添加服务商、模型名称和自己的 API Key。应用将模型配置保存在当前用户目录的 `.qcode/config/model.json`，不需要把密钥写进源码或提交到仓库。默认后端模型标识可通过 `QCODE_MODEL` 环境变量调整；后端端口默认为 `8080`。

请勿将真实密钥、个人模型配置或其他凭据提交到公开仓库。仓库根目录的 `.gitignore` 已忽略本地环境文件、构建输出和桌面端生成的后端 JAR。

## 子项目说明

- [Spring Boot 后端](QCode/README.md)
- [桌面端](QCode-Desktop/README.md)
