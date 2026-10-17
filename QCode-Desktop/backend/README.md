# Desktop backend bundle

构建桌面应用前，将 Spring Boot 打包结果复制为以下任一文件名：

- `backend/qcode.jar`
- `backend/qcode-0.1.0-SNAPSHOT.jar`

生产环境建议把 Java 21 运行时放到 `runtime/`，目录结构为：

```text
runtime/bin/java.exe
```

如果没有内置 JRE，Electron 会尝试使用系统 `java.exe`。

在 Windows 开发机上可以执行：

```powershell
npm run desktop:prepare
npm run electron:build
```
