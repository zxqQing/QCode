import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendPort = Number(process.env.QCODE_BACKEND_PORT || 8080);
let mainWindow;
let backendProcess;

function backendRoot() {
  return app.isPackaged ? join(process.resourcesPath, "backend") : join(__dirname, "..", "backend");
}

function findBackendJar() {
  const configured = process.env.QCODE_JAR_PATH;
  const candidates = [
    configured,
    join(backendRoot(), "qcode.jar"),
    join(backendRoot(), "qcode-0.1.0-SNAPSHOT.jar")
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function findJava() {
  const bundledJava = app.isPackaged
    ? join(process.resourcesPath, "runtime", "bin", process.platform === "win32" ? "java.exe" : "java")
    : null;
  if (bundledJava && existsSync(bundledJava)) return bundledJava;
  return process.platform === "win32" ? "java.exe" : "java";
}

function startBackend() {
  const jarPath = findBackendJar();
  if (!jarPath) {
    console.warn("未找到 Spring Boot jar。开发时可设置 QCODE_JAR_PATH，打包时请将 qcode.jar 放入 backend 目录。");
    return false;
  }
  backendProcess = spawn(findJava(), ["-jar", jarPath, `--server.port=${backendPort}`], {
    cwd: backendRoot(),
    windowsHide: true,
    stdio: "pipe"
  });
  backendProcess.stdout?.on("data", (chunk) => console.log(`[backend] ${chunk}`));
  backendProcess.stderr?.on("data", (chunk) => console.error(`[backend] ${chunk}`));
  backendProcess.on("error", (error) => console.error("启动 Spring Boot 失败", error));
  return true;
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(backendProcess.pid), "/t", "/f"], { windowsHide: true });
  else backendProcess.kill("SIGTERM");
  backendProcess = undefined;
}

function waitForBackend(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const socket = createConnection({ host: "127.0.0.1", port: backendPort });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) resolve(false);
        else setTimeout(check, 250);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    // Keep the initial desktop footprint close to Codex instead of filling
    // almost the entire screen on Windows displays using 125% scaling.
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f4f5f7",
    icon: join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(join(__dirname, "..", "dist", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = undefined; });
}

ipcMain.handle("qcode:select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
  return { canceled: result.canceled, path: result.filePaths[0] || "" };
});

ipcMain.handle("qcode:backend-status", () => ({ running: Boolean(backendProcess && !backendProcess.killed), port: backendPort }));

async function resolveSessionFile(sessionId, filePath) {
  if (typeof sessionId !== "string" || typeof filePath !== "string" || !sessionId.trim() || !filePath.trim()) {
    throw new Error("会话或文件路径无效");
  }
  const params = new URLSearchParams({ filePath });
  const response = await fetch(`http://127.0.0.1:${backendPort}/session/${encodeURIComponent(sessionId)}/file/resolve?${params}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.absolutePath !== "string") {
    throw new Error(payload.message || `文件授权校验失败（${response.status}）`);
  }
  return payload.absolutePath;
}

ipcMain.handle("qcode:reveal-session-file", async (_event, args) => {
  const filePath = await resolveSessionFile(args?.sessionId, args?.filePath);
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("qcode:open-session-file", async (_event, args) => {
  const filePath = await resolveSessionFile(args?.sessionId, args?.filePath);
  const error = await shell.openPath(filePath);
  if (error) throw new Error(error);
  return true;
});

app.whenReady().then(async () => {
  app.setAppUserModelId("com.qcode.desktop");
  const backendStarted = startBackend();
  if (backendStarted) await waitForBackend();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { stopBackend(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", stopBackend);
