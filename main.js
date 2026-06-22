const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execFile } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
  width: 1600,
  height: 900,
  frame: false,
  autoHideMenuBar: true,
  icon: path.join(__dirname, 'html_version', 'assets', 'logo-spg.ico'),
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false
  }
});

  win.loadFile(
    path.join(__dirname, 'html_version', 'assets', 'index.html')
  );
}

ipcMain.handle('download-update', async (event, url) => {
  const filePath = path.join(
    app.getPath('downloads'),
    'SPG-Control-Piutang-Update.exe'
  );

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        https.get(response.headers.location, res2 => {
          res2.pipe(file);
          file.on('finish', () => file.close(() => resolve(filePath)));
        }).on('error', reject);
        return;
      }

      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(filePath)));
    }).on('error', err => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
});

ipcMain.handle('install-update', async (event, filePath) => {
  execFile(filePath, [], {
    detached: true,
    stdio: 'ignore'
  });

  app.quit();
  return true;
});

ipcMain.handle('exit-app', () => {
  app.quit();
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});