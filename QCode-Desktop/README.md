# QCode 桌面端

QCode 桌面端使用 React、TypeScript、Vite 和 Electron 构建。生产版本会自动启动内置 Spring Boot 后端，并优先使用打包在应用中的 Java 21 运行时。

## 下载

当前发布 Windows x64 版本：

- [下载安装版](https://github.com/zxqQing/QCode/releases/latest/download/QCode-1.0.0-x64-setup.exe) — 可选择安装目录并创建桌面快捷方式
- [下载便携版](https://github.com/zxqQing/QCode/releases/latest/download/QCode-1.0.0-x64-portable.exe) — 无需安装，直接运行
- [查看全部版本](https://github.com/zxqQing/QCode/releases)

两个版本都包含 Java 21 和后端 JAR，不依赖目标电脑预装 Java。便携版每次启动需要先解包，因此通常比安装版稍慢。

> 当前 EXE 未进行商业代码签名，Windows SmartScreen 可能在首次运行时显示提醒。

## 安装效果

![QCode Windows 桌面快捷方式](../docs/images/qcode-windows-desktop.png)

## 首次使用

1. 启动 QCode。
2. 打开模型设置。
3. 添加模型服务商、模型名称、API Key 和可选的 Base URL。
4. 添加项目目录并开始新会话。

应用数据保存在当前用户目录的 `.qcode/` 中，包括模型、MCP、技能、项目和会话信息。

## 开发环境

- Node.js 20 或更高版本及 npm
- JDK 21 或更高版本
- Maven 3.9 或更高版本

前端入口为 `index.html` → `src/main.tsx` → `src/App.tsx`。Electron 主进程位于 `electron/main.mjs`，后端项目位于 `../QCode/`。

## 浏览器开发

先另开终端启动后端，再在本目录运行：

```powershell
npm install
npm run dev
```

Vite 默认地址为 `http://localhost:5173`，后端默认地址为 `http://localhost:8080`。

## Electron 开发

```powershell
npm install
npm run desktop:prepare
npm run electron:dev
```

`desktop:prepare` 会构建后端 JAR、生成 Java 21 运行时并构建前端资源。

## 打包 Windows EXE

```powershell
npm run electron:build
```

构建机会执行以下流程：

1. 使用 JDK 21 构建 Spring Boot 后端。
2. 使用 `jlink` 生成随应用分发的精简 Java 21 运行时。
3. 使用 Vite 构建可供 `file://` 加载的相对路径前端资源。
4. 使用 electron-builder 生成安装版和便携版。

如未自动找到 JDK 21，可设置：

```powershell
$env:QCODE_JAVA_HOME = "D:\Program\Java\jdk21"
npm run electron:build
```

最终文件位于 `release/`：

| 文件 | 说明 |
| --- | --- |
| `QCode-1.0.0-x64-setup.exe` | Windows 安装版 |
| `QCode-1.0.0-x64-portable.exe` | Windows 便携版 |
| `win-unpacked/` | 用于本地检查的未压缩目录 |

`dist/`、`backend/qcode.jar`、`runtime/` 和 `release/` 都是本地构建产物，不应直接提交到仓库。正式 EXE 应作为 GitHub Release 附件发布。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build:web` | 构建前端资源 |
| `npm run backend:prepare` | 构建并复制后端 JAR |
| `npm run runtime:prepare` | 生成内置 Java 21 运行时 |
| `npm run electron:dev` | 启动 Electron 开发模式 |
| `npm run electron:build` | 完整生成两个 Windows EXE |

## 相关文档

- [项目主页](../README.md)
- [后端说明](../QCode/README.md)
