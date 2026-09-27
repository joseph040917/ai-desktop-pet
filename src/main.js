// 主进程：透明置顶窗口 + 托盘 + 拖拽 + 缩放
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');

let win = null;
let tray = null;
let alwaysOnTop = true;

// 基准尺寸与缩放（1.0 = 380x560）
const BASE_W = 380;
const BASE_H = 560;
let petScale = 1.0;

// 拖拽状态
let dragOrigin = null;
let isDragging = false;
let lastDragPos = null;

function targetSize() {
  return { w: Math.round(BASE_W * petScale), h: Math.round(BASE_H * petScale) };
}

function setPetScale(factor) {
  factor = Math.min(1.6, Math.max(0.5, factor));
  petScale = factor;
  if (!win) return;
  const { w, h } = targetSize();
  const b = win.getBounds();
  // 保持底边与水平中心不动
  win.setBounds({
    x: Math.round(b.x + (b.width - w) / 2),
    y: Math.round(b.y + (b.height - h)),
    width: w,
    height: h
  });
}

// 窗口尺寸哨兵：DPI 缩放下尺寸会漂移，超过容差强制拉回（拖拽期间避让，拖完补校正）
let enforcing = false;
function enforceWindowSize() {
  if (enforcing || isDragging || !win) return;
  const { w, h } = targetSize();
  const b = win.getBounds();
  if (Math.abs(b.width - w) > 3 || Math.abs(b.height - h) > 3) {
    console.log('[main] 窗口尺寸漂移 ' + b.width + 'x' + b.height + ' → ' + w + 'x' + h);
    enforcing = true;
    win.setBounds({ x: b.x, y: b.y, width: w, height: h });
    setTimeout(() => { enforcing = false; }, 150);
  }
}

// 单实例锁
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const { w, h } = targetSize();
  win = new BrowserWindow({
    width: w,
    height: h,
    x: sw - w - 40,
    y: sh - h,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // 本地素材加载；素材已全部离线审查
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // 渲染端日志转发到终端，便于诊断
  win.webContents.on('console-message', (e, level, message) => {
    console.log('[renderer] ' + message);
  });
  win.on('resize', enforceWindowSize);
  win.once('ready-to-show', () => win.show());
  win.setAlwaysOnTop(true, 'screen-saver');
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.setToolTip('伊蕾娜桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '置顶显示', type: 'checkbox', checked: alwaysOnTop, click: (item) => {
      alwaysOnTop = item.checked;
      if (win) win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
    }},
    { label: '开机自启', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => {
      app.setLoginItemSettings({ openAtLogin: item.checked });
    }},
    { label: '大小', submenu: [
      { label: '小 (70%)', type: 'checkbox', checked: petScale === 0.7, click: () => setPetScale(0.7) },
      { label: '中 (100%)', type: 'checkbox', checked: petScale === 1.0, click: () => setPetScale(1.0) },
      { label: '大 (130%)', type: 'checkbox', checked: petScale === 1.3, click: () => setPetScale(1.3) }
    ]},
    { type: 'separator' },
    { label: '使用说明', click: () => {
      dialog.showMessageBox(win, {
        type: 'info',
        title: '使用说明',
        message: '伊蕾娜桌宠 · 操作方式',
        detail: '拖动 = 移动位置\n单击 = 互动（弹跳 + 台词）\nCtrl + 滚轮 = 缩放（50%~160%）\n托盘图标右键 = 置顶 / 开机自启 / 大小 / 退出',
        buttons: ['好的']
      });
    }},
    { label: '退出', click: () => app.quit() }
  ]));
  tray.on('double-click', () => win && win.show());
}

// ---- 拖拽：渲染进程上报屏幕坐标，主进程移动窗口 ----
ipcMain.on('pet:drag-start', (e, { screenX, screenY }) => {
  if (!win || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  const [winX, winY] = win.getPosition();
  dragOrigin = { mouseX: screenX, mouseY: screenY, winX, winY };
  isDragging = true;
  lastDragPos = null;
});

ipcMain.on('pet:drag-move', (e, { screenX, screenY }) => {
  if (!dragOrigin || !win) return;
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  const x = Math.round(dragOrigin.winX + (screenX - dragOrigin.mouseX));
  const y = Math.round(dragOrigin.winY + (screenY - dragOrigin.mouseY));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  // 位置没变就别再调系统 API
  if (lastDragPos && lastDragPos.x === x && lastDragPos.y === y) return;
  lastDragPos = { x, y };
  // 关键：DPI 缩放下只写位置(setPosition)会让窗口宽高逐像素"涨大"，
  // 每次移动都必须用 setBounds 把宽高一并钉死，掐断漂移累积。
  const { w, h } = targetSize();
  win.setBounds({ x, y, width: w, height: h });
});

ipcMain.on('pet:drag-end', () => {
  dragOrigin = null;
  isDragging = false;
  lastDragPos = null;
  // 拖拽结束后补一次尺寸校正
  setTimeout(enforceWindowSize, 200);
});

// Ctrl+滚轮缩放（渲染进程上报倍率）
ipcMain.on('pet:resize', (e, factor) => {
  if (Number.isFinite(factor)) setPetScale(factor);
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
