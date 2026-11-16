const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { parseEnv } = require('node:util');

function holidayKey() {
  try {
    const envPath = app.isPackaged ? path.join(process.resourcesPath, 'app.env') : path.join(__dirname, '.env');
    const key = parseEnv(fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')).KASI_SERVICE_KEY;
    if (typeof key !== 'string') return '';
    try { return decodeURIComponent(key.trim()); } catch { return key.trim(); }
  } catch { return ''; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1510,
    height: 980,
    minWidth: 1030,
    minHeight: 700,
    backgroundColor: '#fff3c8',
    icon: path.join(__dirname, 'src', 'assets', 'usagi.ico'),
    frame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.gmkim.bunnycalendar');
  ipcMain.handle('holidays:configured', () => Boolean(holidayKey()));
  ipcMain.handle('holidays:fetch', async (_event, { year, month } = {}) => {
    const key = holidayKey();
    if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !key || key.length > 1000) return { error: '프로젝트의 .env에서 KASI_SERVICE_KEY를 확인해 주세요.' };
    const url = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
    url.search = new URLSearchParams({ serviceKey: key, solYear: String(year), solMonth: String(month).padStart(2, '0'), numOfRows: '100', pageNo: '1', _type: 'json' }).toString();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { error: '공휴일 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' };
      return { text: await response.text() };
    } catch { return { error: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' }; }
  });
  ipcMain.on('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.on('window:maximize', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
