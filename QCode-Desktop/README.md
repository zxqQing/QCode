# QCode 桌面端

QCode 桌面端使用 React 和 Vite 构建界面，并通过 Electron 提供 Windows 桌面应用。前端开发服务器默认运行在 `http://localhost:5173`，后端默认运行在 `http://localhost:8080`。

## 环境要求

- Node.js 20 或更高版本及 npm
- Java 21 和 Maven（运行或打包内置后端时需要）

## 浏览器开发

```powershell
npm install
npm run dev
```

浏览器开发时请另开终端启动 Spring Boot 后端，详见 [后端说明](../QCode/README.md)。

## Electron 开发

先构建后端并复制到 `backend/qcode.jar`，然后启动桌面应用：

```powershell
npm install
npm run desktop:prepare
npm run electron:dev
```

`desktop:prepare` 会调用上级目录的 Maven 项目构建后端。Electron 开发模式会在 `backend/` 中查找 JAR；启动时未找到 JAR 就不会启动内置后端。

## 构建

构建网页资源：

```powershell
npm run build
```

构建 Windows 桌面安装包或便携版：

```powershell
npm run desktop:prepare
npm run electron:build
```

如需让安装包自带 Java 运行时，可将 Java 运行时放入 `runtime/`，使其包含 `runtime/bin/java.exe`。否则应用会尝试使用系统安装的 Java。

生成的 `dist/`、`backend/qcode.jar` 和 `runtime/` 属于本地构建产物，不需要提交到仓库。
