const { contextBridge, ipcRenderer } = require('electron');

// Only expose if not already exposed
if (!window.electron) {
    contextBridge.exposeInMainWorld('electron', {
        isElectron: true,
        versions: {
            node: () => process.versions.node,
            chrome: () => process.versions.chrome,
            electron: () => process.versions.electron
        },
        wakeUp: () => ipcRenderer.send('wake-up'),
        onDarkModeToggle: (callback) => ipcRenderer.on('dark-mode-toggled', (_, isDark) => callback(isDark)),
        onCheckingForUpdate: (cb) => ipcRenderer.on('checking-for-update', cb),
        onUpdateAvailable: (cb) => ipcRenderer.on('update_available', cb),
        onUpdateNotAvailable: (cb) => ipcRenderer.on('update_not_available', cb),
        onDownloadProgress: (cb) => ipcRenderer.on('download_progress', cb),
        onUpdateDownloaded: (cb) => ipcRenderer.on('update_downloaded', cb),
        onUpdateError: (cb) => ipcRenderer.on('update_error', cb),
        requestUpdate: () => ipcRenderer.send('check_for_update'),
        restartApp: () => ipcRenderer.send('restart_app')
    });
}

if (!window.notificationAPI) {
    contextBridge.exposeInMainWorld('notificationAPI', {
        checkPermission: () => Notification.permission,
        requestPermission: () => Notification.requestPermission()
    });
}

if (!window.appInfo) {
    contextBridge.exposeInMainWorld('appInfo', {
        getVersions: () => ({
            node: process.versions.node,
            chrome: process.versions.chrome,
            electron: process.versions.electron
        })
    });
}

ipcRenderer.on('keep-alive', () => {
    console.log('Received keep-alive ping');
});
ipcRenderer.on('error', (event, error) => {
    console.error('IPC Error:', error);
});
ipcRenderer.on('wake-up-response', () => {
    console.log('Wake-up call processed');
});