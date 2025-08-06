const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
    isElectron: true,
    versions: {
        node: () => process.versions.node,
        chrome: () => process.versions.chrome,
        electron: () => process.versions.electron
    },
    // Add wake-up function
    wakeUp: () => ipcRenderer.send('wake-up'),
    // Add dark mode handler
    onDarkModeToggle: (callback) => ipcRenderer.on('toggle-dark-mode', (_, isDark) => callback(isDark))
});

// Keep-alive handler
ipcRenderer.on('keep-alive', () => {
    // Just receiving this message keeps the renderer process active
    console.log('Received keep-alive ping');
});

// Add error handling for IPC
ipcRenderer.on('error', (event, error) => {
    console.error('IPC Error:', error);
});

// Add logging for wake-up calls
ipcRenderer.on('wake-up-response', () => {
    console.log('Wake-up call processed');
});

// Add notification permission check
contextBridge.exposeInMainWorld('notificationAPI', {
    checkPermission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission()
});

// Add version info exposure
contextBridge.exposeInMainWorld('appInfo', {
    getVersions: () => ({
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron
    })
});