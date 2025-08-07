const { app, BrowserWindow, Tray, Menu, nativeTheme, powerSaveBlocker, ipcMain, shell } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let tray;
let powerBlockerId;

// Request single instance lock to ensure only one instance of the app runs
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // If another instance is already running, quit this one
  app.quit();
  return;
}

// Handle second instance: focus and restore the existing mainWindow
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

const appName = 'IBT Timetable';

function createWindow() {
  if (mainWindow) {
    return; // Prevent creating multiple windows
  }
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Ensure preload.js is included in the build/package
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png')); // Use your existing icon.png
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show IBT Timetable',
      click: () => {
        if (mainWindow) mainWindow.show();
        else createWindow();
      },
    },
    {
      label: 'Toggle Dark Mode',
      click: () => {
        if (nativeTheme.shouldUseDarkColors) {
          nativeTheme.themeSource = 'light';
        } else {
          nativeTheme.themeSource = 'dark';
        }
        if (mainWindow) {
          mainWindow.webContents.send('dark-mode-toggled', nativeTheme.shouldUseDarkColors);
        }
      },
    },
    {
      label: 'Check for Updates',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('checking-for-update');
        autoUpdater.checkForUpdates();
      },
    },
    // Uncomment the following to enable DevTools in tray menu
    // {
    //   label: 'Toggle DevTools',
    //   click: () => {
    //     if (mainWindow) {
    //       mainWindow.webContents.toggleDevTools();
    //     }
    //   },
    // },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip(appName);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
}

function setupAutoLaunch() {
  // Use app.getPath('exe') for reliable executable path on Mac/Win
  const autoLauncher = new AutoLaunch({
    name: appName,
    path: app.getPath('exe'),
  });

  autoLauncher.isEnabled()
    .then((isEnabled) => {
      if (!isEnabled) {
        autoLauncher.enable();
      }
    })
    .catch((err) => {
      log.error('AutoLaunch error:', err);
    });
}

function setupDarkMode() {
  ipcMain.handle('dark-mode:toggle', () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = 'light';
    } else {
      nativeTheme.themeSource = 'dark';
    }
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('dark-mode:system', () => {
    nativeTheme.themeSource = 'system';
  });
}

function setupPowerSaveBlocker() {
  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  // Stop the powerSaveBlocker on app quit to clean up explicitly
  app.on('will-quit', () => {
    if (powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
  });
}

function setupUpdater() {
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available.');
    if (mainWindow) mainWindow.webContents.send('update_available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
    if (mainWindow) mainWindow.webContents.send('update_not_available', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    if (mainWindow) mainWindow.webContents.send('update_error', err.message || String(err));
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('download_progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update_downloaded', info);
  });

  ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.on('check_for_update', () => {
    autoUpdater.checkForUpdates();
  });
}

// Only create windows and setup app when ready and after obtaining the single instance lock
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoLaunch();
  setupDarkMode();
  setupPowerSaveBlocker();
  setupUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep the app running in the tray, do nothing here.
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('dark-mode-toggled', (event, isDark) => {
  if (mainWindow) {
    mainWindow.webContents.send('dark-mode-toggled', isDark);
  }
});