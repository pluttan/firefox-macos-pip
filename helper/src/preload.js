const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pipBridge", {
  onSignal(callback) {
    ipcRenderer.on("signal-from-extension", (_event, message) => callback(message));
  },
  onPinState(callback) {
    ipcRenderer.on("pin-state", (_event, message) => callback(message));
  },
  onPointerInsideWindow(callback) {
    ipcRenderer.on("pointer-inside-window", (_event, message) => callback(message));
  },
  sendSignal(message) {
    ipcRenderer.send("signal-to-extension", message);
  },
  windowAction(action) {
    ipcRenderer.send("window-action", action);
  }
});
