const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: () => ipcRenderer.invoke("qcode:select-directory"),
  backendStatus: () => ipcRenderer.invoke("qcode:backend-status"),
  revealSessionFile: (sessionId, filePath) => ipcRenderer.invoke("qcode:reveal-session-file", { sessionId, filePath }),
  openSessionFile: (sessionId, filePath) => ipcRenderer.invoke("qcode:open-session-file", { sessionId, filePath })
});
