const { app, BrowserWindow, Tray, Menu, nativeTheme, powerSaveBlocker, ipcMain, shell } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let tray;
let powerBlockerId;

const appName = 'IBT Timetable';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png')); // Use your existing icon.png
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show IBT Timetable',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Quit',
      click: () => {
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
  const autoLauncher = new AutoLaunch({
    name: appName,
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

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoLaunch();
  setupDarkMode();
  setupPowerSaveBlocker();
  setupUpdater();

  // Single instance lock
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});