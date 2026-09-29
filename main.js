const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session, screen, dialog } = require('electron');
const path = require('path'), fs = require('fs');
const { pathToFileURL } = require('url');

const TOP = 88, BOTTOM = 22;
const HOME = pathToFileURL(path.join(__dirname, 'newtab.html')).href;
const SETTINGS = pathToFileURL(path.join(__dirname, 'settings.html')).href;
const plFile = () => path.join(app.getPath('userData'), 'spotify.json');
const musicDir = () => path.join(app.getPath('userData'), 'music');
const wallDir = () => path.join(app.getPath('userData'), 'wallpapers');
let playlists = [];
let tracks = [];
const savePl = () => { try { fs.writeFileSync(plFile(), JSON.stringify(playlists)); } catch {} };
const BLOCK = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'adnxs.com', 'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'hotjar.com', 'criteo.net', 'amazon-adsystem.com'];
const DEFAULTS = [
  ['Google', 'https://www.google.com', '🔍'], ['GitHub', 'https://github.com', '🐙'],
  ['YouTube', 'https://www.youtube.com', '▶️'], ['Reddit', 'https://www.reddit.com', '🤖'],
  ['Wikipedia', 'https://wikipedia.org', '📖'], ['HN', 'https://news.ycombinator.com', '🔶'],
  ['MDN', 'https://developer.mozilla.org', '🦊'], ['Claude', 'https://claude.ai', '✦'],
].map(([title, url, icon]) => ({ title, url, icon }));

let win, nid = 1, blockOn = true, blocked = 0, bookmarks = [], timer = null;
const windows = new Map(), tabOwners = new Map();
const contexts = () => [...windows.values()].filter(c => !c.win.isDestroyed());
const cur = c => c && c.tabs.find(t => t.id === c.active);
const allTabs = () => contexts().flatMap(c => c.tabs);
const ownerForWebContents = wc => contexts().find(c => c.tabs.some(t => t.view.webContents === wc));
const pushTabOwner = id => { const c = tabOwners.get(id); if (c) push(c); };
const bmFile = () => path.join(app.getPath('userData'), 'bookmarks.json');
const ENGINES = { duckduckgo: 'https://duckduckgo.com/?q=', google: 'https://www.google.com/search?q=',
  brave: 'https://search.brave.com/search?q=', bing: 'https://www.bing.com/search?q=' };
const DEF_SETTINGS = {
  engine: 'duckduckgo', adblock: true, accent: '#c8ff00', blocklist: [],
  wallpaperMode: 'static', wallpaper: 'none', wallpaperUrl: '',
  wallpaperDesign: { base: '#0a0a0a', accent: '#16351d', pattern: 'glow' },
  animatedWallpaper: 'none', animatedWallpaperUrl: '', animatedWallpaperType: 'video',
};
let settings = { ...DEF_SETTINGS };
const setFile = () => path.join(app.getPath('userData'), 'settings.json');
const saveSettings = () => { try { fs.writeFileSync(setFile(), JSON.stringify(settings)); } catch {} };
const wallPrefs = () => ({ accent: settings.accent, mode: settings.wallpaperMode, static: settings.wallpaper,
  staticUrl: settings.wallpaperUrl, design: settings.wallpaperDesign, animated: settings.animatedWallpaper,
  animatedUrl: settings.animatedWallpaperUrl, animatedType: settings.animatedWallpaperType });
const publicTracks = () => tracks.map(t => ({ id: t.id, title: t.title, src: t.file ? pathToFileURL(t.file).href : '' }));
function copyWithUniqueName(dir, source) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(source), base = path.basename(source, ext);
  let dest = path.join(dir, path.basename(source)), n = 2;
  while (fs.existsSync(dest) && path.resolve(dest) !== path.resolve(source)) dest = path.join(dir, `${base} (${n++})${ext}`);
  if (path.resolve(dest) !== path.resolve(source) && !fs.existsSync(dest)) fs.copyFileSync(source, dest);
  return dest;
}
const cleanHost = s => {
  const h = String(s).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : '';
};

function toURL(s) {
  s = s.trim();
  if (!s) return HOME;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(s)) return 'http://' + s;
  if (/^[^\s]+\.[^\s]{2,}$/.test(s)) return 'https://' + s;
  return (ENGINES[settings.engine] || ENGINES.duckduckgo) + encodeURIComponent(s);
}
const titleOf = u => { const h = new URL(u).hostname.replace(/^www\./, ''); return h[0].toUpperCase() + h.slice(1); };

function refreshHome() {
  allTabs().forEach(t => {
    const wc = t.view.webContents;
    if (wc.getURL().startsWith(HOME)) wc.executeJavaScript(`render(${JSON.stringify(bookmarks)});setPrefs(${JSON.stringify(wallPrefs())})`).catch(() => {});
  });
}
function pushAll() { contexts().forEach(push); }
function saveBm() { fs.writeFileSync(bmFile(), JSON.stringify(bookmarks)); refreshHome(); pushAll(); }

function layout(c) {
  if (!c || c.win.isDestroyed()) return;
  const [w, h] = c.win.getContentSize();
  const top = c.focusMode ? 0 : TOP, bot = c.focusMode ? 0 : BOTTOM;
  c.tabs.forEach(t => {
    const shown = t.id === c.active;
    t.view.setVisible(shown);
    if (shown) t.view.setBounds({ x: 0, y: top, width: w, height: h - top - bot });
  });
}

function push(c) {
  if (!c || c.win.isDestroyed()) return;
  const t = cur(c), wc = t && t.view.webContents;
  const url = wc ? wc.getURL() : '';
  c.win.webContents.send('state', {
    active: c.active, focusMode: c.focusMode, blockOn, blocked, accent: settings.accent,
    bookmarks: bookmarks.map(b => ({ title: b.title, url: b.url })),
    tabs: c.tabs.map(tab => ({ id: tab.id, title: tab.view.webContents.getTitle() || 'New Tab', loading: tab.view.webContents.isLoading() })),
    url: url.startsWith(HOME) || url.startsWith(SETTINGS) ? '' : url,
    label: url.startsWith(SETTINGS) ? 'Settings' : 'New tab',
    back: !!wc && wc.navigationHistory.canGoBack(),
    fwd: !!wc && wc.navigationHistory.canGoForward(),
    loading: !!wc && wc.isLoading(),
    starred: bookmarks.some(b => b.url === url),
  });
}

function switchTab(id, c) {
  if (!c || !c.tabs.some(t => t.id === id)) return;
  c.active = id;
  const t = cur(c);
  layout(c); push(c);
  if (t.view.webContents.getURL().startsWith(HOME)) focusUrl(c);
  else t.view.webContents.focus();
}

function newTab(url = HOME, c = windows.get(win)) {
  if (!c || c.win.isDestroyed()) return;
  const view = new WebContentsView({ webPreferences: { sandbox: true, preload: path.join(__dirname, 'tabpreload.js') } });
  view.setBackgroundColor('#0a0a0a');
  const id = nid++;
  c.tabs.push({ id, view });
  tabOwners.set(id, c);
  c.win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.on('focus', () => { const owner = tabOwners.get(id); if (owner && owner.active !== id) { owner.active = id; layout(owner); push(owner); } });
  ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']
    .forEach(e => wc.on(e, () => pushTabOwner(id)));
  wc.on('did-finish-load', () => { refreshHome(); pushTabOwner(id); });
  wc.setWindowOpenHandler(({ url }) => { const owner = tabOwners.get(id); if (owner) newTab(url, owner); return { action: 'deny' }; });
  wc.loadURL(url);
  switchTab(id, c);
}

// ---- Spotify popup: a small window that keeps playing even with no tab open ----
const POP_W = 380, POP_H = 560;
let pop = null, hiddenAt = 0, popDialogOpen = 0;
const applyPopAccent = () => { if (pop && !pop.isDestroyed()) pop.webContents.executeJavaScript(`document.documentElement.style.setProperty('--lime',${JSON.stringify(settings.accent)})`).catch(() => {}); };
function ensurePopup(c) {
  if (pop && !pop.isDestroyed()) return pop;
  if (!c || c.win.isDestroyed()) return null;
  pop = new BrowserWindow({
    parent: c.win, width: POP_W, height: POP_H, frame: false, resizable: false, show: false, skipTaskbar: true,
    minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#0e0e0e',
    webPreferences: { preload: path.join(__dirname, 'spotifyPreload.js') },
  });
  pop.loadFile('spotify.html');
  pop.webContents.on('did-finish-load', applyPopAccent);
  pop.on('blur', () => { if (!popDialogOpen) pop.hide(); });
  pop.on('hide', () => { hiddenAt = Date.now(); });
  pop.on('closed', () => { pop = null; });
  pop.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') pop.hide(); });
  pop.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return pop;
}
function toggleSpotifyPopup(r, c) {
  const p = ensurePopup(c);
  if (!p) return;
  if (p.isVisible()) return p.hide();
  if (Date.now() - hiddenAt < 250) return; // the click that just closed it via blur
  const n = v => (Number.isFinite(v) ? v : 0);
  r = r || {};
  const cb = c.win.getContentBounds();
  const wa = screen.getDisplayMatching(c.win.getBounds()).workArea;
  const x = Math.round(cb.x + n(r.x) + n(r.width) - POP_W), y = Math.round(cb.y + n(r.y) + n(r.height) + 6);
  p.setPosition(Math.max(wa.x, Math.min(x, wa.x + wa.width - POP_W)), Math.max(wa.y, Math.min(y, wa.y + wa.height - POP_H)));
  applyPopAccent();
  p.show();
}
const fromPop = e => pop && !pop.isDestroyed() && e.sender === pop.webContents;
async function showPopupOpenDialog(options) {
  const parent = pop;
  if (!parent || parent.isDestroyed()) return { canceled: true, filePaths: [] };
  popDialogOpen++;
  try { return await dialog.showOpenDialog(parent, options); }
  finally { popDialogOpen = Math.max(0, popDialogOpen - 1); }
}
ipcMain.handle('spotify-get', e => (fromPop(e) ? playlists : []));
ipcMain.on('spotify-add', (e, title, link) => {
  if (!fromPop(e) || !link) return;
  title = (title || '').trim().slice(0, 60) || 'Untitled';
  playlists.push({ title, link, id: Date.now() + Math.random() });
  savePl();
  e.sender.send('spotify-lib', playlists);
});
ipcMain.on('spotify-remove', (e, id) => {
  if (!fromPop(e)) return;
  playlists = playlists.filter(p => p.id !== id);
  savePl();
  e.sender.send('spotify-lib', playlists);
});
ipcMain.on('spotify-hide', e => { if (fromPop(e)) pop.hide(); });
ipcMain.on('spotify-login', e => {
  if (!fromPop(e)) return;
  const lw = new BrowserWindow({ parent: pop, width: 460, height: 680, title: 'Log in to Spotify', backgroundColor: '#121212',
    webPreferences: { partition: undefined } }); // default session, so cookies are shared with the embed player
  lw.setMenuBarVisibility(false);
  lw.loadURL('https://accounts.spotify.com/login?continue=' + encodeURIComponent('https://open.spotify.com/'));
  const done = () => { if (!e.sender.isDestroyed()) e.sender.send('spotify-login-done'); };
  lw.webContents.on('did-navigate', (_, url) => { if (/^https:\/\/open\.spotify\.com\//.test(url)) { done(); lw.close(); } });
  lw.on('closed', done);
});
ipcMain.handle('music-get', e => fromPop(e) ? publicTracks() : []);
ipcMain.handle('music-pick', async e => {
  if (!fromPop(e)) return [];
  const result = await showPopupOpenDialog({ title: 'Add music', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3','wav','m4a','aac','ogg','flac','opus'] }] });
  if (result.canceled) return publicTracks();
  for (const source of result.filePaths) {
    try {
      const dest = copyWithUniqueName(musicDir(), source);
      if (!tracks.some(t => path.resolve(t.file) === path.resolve(dest))) tracks.push({ id: Date.now() + Math.random(), title: path.basename(source, path.extname(source)), file: dest });
    } catch {}
  }
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'music.json'), JSON.stringify(tracks)); } catch {}
  return publicTracks();
});
ipcMain.on('music-remove', (e, id) => {
  if (!fromPop(e)) return;
  tracks = tracks.filter(t => t.id !== id);
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'music.json'), JSON.stringify(tracks)); } catch {}
  e.sender.send('music-lib', publicTracks());
});

function openSettings(c) {
  const t = c.tabs.find(t => t.view.webContents.getURL().startsWith(SETTINGS));
  t ? switchTab(t.id, c) : newTab(SETTINGS, c);
}

function closeTab(id, c = tabOwners.get(id)) {
  if (!c) return;
  const i = c.tabs.findIndex(t => t.id === id); if (i < 0) return;
  const [t] = c.tabs.splice(i, 1);
  c.win.contentView.removeChildView(t.view);
  tabOwners.delete(id);
  t.view.webContents.close();
  if (!c.tabs.length) { c.active = null; return newTab(HOME, c); }
  if (id === c.active) switchTab(c.tabs[Math.min(i, c.tabs.length - 1)].id, c);
  else { layout(c); push(c); }
}
function reorderTab(id, beforeId, c) {
  if (!c || tabOwners.get(id) !== c || (beforeId != null && tabOwners.get(beforeId) !== c)) return;
  const from = c.tabs.findIndex(t => t.id === id); if (from < 0) return;
  const [tab] = c.tabs.splice(from, 1);
  const to = beforeId == null ? c.tabs.length : c.tabs.findIndex(t => t.id === beforeId);
  c.tabs.splice(to < 0 ? c.tabs.length : to, 0, tab);
  push(c);
}
function detachTab(id, c, x, y) {
  if (!c || tabOwners.get(id) !== c || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const b = c.win.getBounds();
  if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return;
  const i = c.tabs.findIndex(t => t.id === id); if (i < 0) return;
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;
  const width = Math.min(1280, display.width), height = Math.min(800, display.height);
  const left = Math.max(display.x, Math.min(Math.round(x - 100), display.x + display.width - width));
  const top = Math.max(display.y, Math.min(Math.round(y - 22), display.y + display.height - height));
  const detached = c.tabs.splice(i, 1)[0];
  c.win.contentView.removeChildView(detached.view);
  const target = createBrowserWindow({ x: left, y: top, width, height });
  target.tabs.push(detached); target.active = id; tabOwners.set(id, target);
  target.win.contentView.addChildView(detached.view);
  target.win.show(); target.win.focus(); detached.view.webContents.focus(); layout(target); push(target);
  if (c.active === id) c.active = c.tabs[Math.min(i, c.tabs.length - 1)]?.id ?? null;
  if (!c.tabs.length) c.win.close(); else { layout(c); push(c); }
}
const cycle = (c, d) => { const i = c.tabs.findIndex(t => t.id === c.active); switchTab(c.tabs[(i + d + c.tabs.length) % c.tabs.length].id, c); };

function toggleStar(ctx) {
  const t = cur(ctx); if (!t) return;
  const url = t.view.webContents.getURL();
  if (url.startsWith(HOME) || url.startsWith(SETTINGS)) return;
  const i = bookmarks.findIndex(b => b.url === url);
  if (i >= 0) bookmarks.splice(i, 1);
  else bookmarks.push({ url, title: t.view.webContents.getTitle() || titleOf(url) });
  saveBm();
}
const toggleFocus = c => { c.focusMode = !c.focusMode; layout(c); push(c); };
const toggleAds = () => { blockOn = !blockOn; settings.adblock = blockOn; saveSettings(); pushAll(); };
const zoom = (c, d) => { const wc = cur(c)?.view.webContents; if (wc) wc.setZoomLevel(d === 0 ? 0 : wc.getZoomLevel() + d); };
const focusUrl = c => { if (c.focusMode) toggleFocus(c); c.win.webContents.focus(); c.win.webContents.send('focus-url'); };
async function screenshot(c) {
  const t = cur(c); if (!t) return;
  const result = await dialog.showSaveDialog(c.win, { title: 'Save screenshot', defaultPath: `VOID-screenshot-${new Date().toISOString().replace(/[:.]/g,'-')}.png`, filters: [{ name: 'PNG image', extensions: ['png'] }] });
  if (result.canceled || !result.filePath) return;
  const image = await t.view.webContents.capturePage();
  fs.writeFileSync(result.filePath, image.toPNG());
  notice(c, 'Screenshot saved');
}
function notice(c, message) { if (c && !c.win.isDestroyed()) c.win.webContents.send('notice', message); }
async function setCustomWallpaper(e) {
  if (!fromSettings(e)) return;
  const c = ownerForWebContents(e.sender);
  const result = await dialog.showOpenDialog(c.win, { title: 'Choose wallpaper', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp'] }] });
  if (result.canceled || !result.filePaths[0]) return;
  const dest = copyWithUniqueName(wallDir(), result.filePaths[0]);
  settings.wallpaper = 'image'; settings.wallpaperUrl = pathToFileURL(dest).href;
  saveSettings(); refreshHome(); pushAll();
  return settings.wallpaperUrl;
}
async function setCustomAnimatedWallpaper(e) {
  if (!fromSettings(e)) return;
  const c = ownerForWebContents(e.sender);
  const result = await dialog.showOpenDialog(c.win, { title: 'Choose animated wallpaper', properties: ['openFile'], filters: [{ name: 'Animated wallpapers', extensions: ['gif','mp4','webm'] }] });
  if (result.canceled || !result.filePaths[0]) return;
  const source = result.filePaths[0], dest = copyWithUniqueName(wallDir(), source);
  settings.animatedWallpaper = 'custom'; settings.animatedWallpaperUrl = pathToFileURL(dest).href;
  settings.animatedWallpaperType = path.extname(dest).toLowerCase() === '.gif' ? 'gif' : 'video';
  saveSettings(); refreshHome(); pushAll();
  return settings.animatedWallpaperUrl;
}

const item = (label, accelerator, click) => ({ label, accelerator, click });
const bookmarkItems = c => bookmarks.length
  ? bookmarks.map(b => ({ label: b.title, click: () => cur(c)?.view.webContents.loadURL(b.url) }))
  : [{ label: 'No bookmarks yet', enabled: false }];
const items = c => [
  item('New tab', 'CmdOrCtrl+T', () => newTab(HOME, c)),
  item('Close tab', 'CmdOrCtrl+W', () => closeTab(c.active, c)),
  item('Next tab', 'Ctrl+Tab', () => cycle(c, 1)),
  item('Previous tab', 'Ctrl+Shift+Tab', () => cycle(c, -1)),
  item('Address bar', 'CmdOrCtrl+L', () => focusUrl(c)),
  item('Home', 'Alt+Home', () => cur(c)?.view.webContents.loadURL(HOME)),
  item('Reload', 'CmdOrCtrl+R', () => cur(c)?.view.webContents.reload()),
  item('Back', 'Alt+Left', () => cur(c)?.view.webContents.navigationHistory.goBack()),
  item('Forward', 'Alt+Right', () => cur(c)?.view.webContents.navigationHistory.goForward()),
  item('Bookmark page', 'CmdOrCtrl+D', () => toggleStar(c)),
  { label: 'Bookmarks', submenu: bookmarkItems(c) },
  item('Focus mode', 'CmdOrCtrl+Shift+F', () => toggleFocus(c)),
  item('Music', 'CmdOrCtrl+Shift+M', () => toggleSpotifyPopup(null, c)),
  item('Take screenshot', null, () => screenshot(c)),
  { label: 'Block ads & trackers', type: 'checkbox', checked: blockOn, click: toggleAds },
  { type: 'separator' },
  item('Settings', 'CmdOrCtrl+,', () => openSettings(c)),
  item('Zoom in', 'CmdOrCtrl+=', () => zoom(c, 0.5)),
  item('Zoom out', 'CmdOrCtrl+-', () => zoom(c, -0.5)),
  item('Reset zoom', 'CmdOrCtrl+0', () => zoom(c, 0)),
  item('Developer tools', 'F12', () => cur(c)?.view.webContents.toggleDevTools()),
  { role: 'togglefullscreen' },
  { type: 'separator' },
  item('Quit VOID', 'CmdOrCtrl+Q', () => app.quit()),
];

ipcMain.on('cmd', (e, c, a) => {
  const ctx = contexts().find(window => window.win.webContents === e.sender);
  if (!ctx) return;
  const tab = cur(ctx), wc = tab && tab.view.webContents;
  switch (c) {
    case 'go': if (wc) { wc.loadURL(toURL(a)); wc.focus(); } break;
    case 'back': wc?.navigationHistory.goBack(); break;
    case 'fwd': wc?.navigationHistory.goForward(); break;
    case 'reload': if (wc) wc.isLoading() ? wc.stop() : wc.reload(); break;
    case 'home': wc?.loadURL(HOME); break;
    case 'new': newTab(HOME, ctx); break;
    case 'close': closeTab(a, ctx); break;
    case 'switch': switchTab(a, ctx); break;
    case 'reorder': if (a && Number.isInteger(a.id)) reorderTab(a.id, a.beforeId ?? null, ctx); break;
    case 'detach': if (a && Number.isInteger(a.id)) detachTab(a.id, ctx, a.x, a.y); break;
    case 'star': toggleStar(ctx); break;
    case 'bookmark-remove': bookmarks = bookmarks.filter(b => b.url !== a); saveBm(); break;
    case 'ads': toggleAds(); break;
    case 'focus': toggleFocus(ctx); break;
    case 'spotify': toggleSpotifyPopup(a, ctx); break;
    case 'menu': Menu.buildFromTemplate(items(ctx)).popup({ window: ctx.win }); break;
    case 'bookmarks': Menu.buildFromTemplate(bookmarkItems(ctx)).popup({ window: ctx.win }); break;
    case 'screenshot': screenshot(ctx); break;
    case 'min': ctx.win.minimize(); break;
    case 'max': ctx.win.isMaximized() ? ctx.win.unmaximize() : ctx.win.maximize(); break;
    case 'quit': app.quit(); break;
  }
});

ipcMain.on('tab-cmd', (e, c, a) => {
  const ok = ownerForWebContents(e.sender) && e.sender.getURL().startsWith(HOME) && typeof a === 'string';
  if (!ok) return;
  if (c === 'go') e.sender.loadURL(toURL(a));
  else if (c === 'add') {
    const url = toURL(a);
    if (url !== HOME && !bookmarks.some(b => b.url === url)) { bookmarks.push({ url, title: titleOf(url) }); saveBm(); }
  } else if (c === 'remove') { bookmarks = bookmarks.filter(b => b.url !== a); saveBm(); }
});
ipcMain.handle('home-prefs', e => ownerForWebContents(e.sender) && e.sender.getURL().startsWith(HOME) ? wallPrefs() : null);

const fromSettings = e => ownerForWebContents(e.sender) && e.sender.getURL().startsWith(SETTINGS);
ipcMain.handle('settings-get', e => (fromSettings(e) ? settings : null));
ipcMain.on('settings-set', (e, k, v) => {
  if (!fromSettings(e)) return;
  if (k === 'engine' && ENGINES[v]) settings.engine = v;
  else if (k === 'adblock') settings.adblock = blockOn = !!v;
  else if (k === 'accent' && /^#[0-9a-f]{6}$/i.test(v)) settings.accent = v;
  else if (k === 'wallpaper-mode' && ['static','animated'].includes(v)) settings.wallpaperMode = v;
  else if (k === 'wallpaper' && ['none','image','design'].includes(v)) settings.wallpaper = v;
  else if (k === 'animated-wallpaper' && ['none','matrix','waves','hexagons','custom'].includes(v)) settings.animatedWallpaper = v;
  else if (k === 'wallpaper-design' && v && typeof v === 'object') {
    const { base, accent, pattern } = v;
    if (!/^#[\da-f]{6}$/i.test(base) || !/^#[\da-f]{6}$/i.test(accent) || !['glow','dots','grid','diagonal'].includes(pattern)) return;
    settings.wallpaperDesign = { base, accent, pattern };
  }
  else if (k === 'blocklist' && Array.isArray(v)) settings.blocklist = [...new Set(v.map(cleanHost).filter(Boolean))].slice(0, 200);
  else return;
  saveSettings(); refreshHome(); pushAll();
});
ipcMain.handle('wallpaper-pick', setCustomWallpaper);
ipcMain.handle('wallpaper-animated-pick', setCustomAnimatedWallpaper);
ipcMain.on('settings-act', async (e, a) => {
  if (!fromSettings(e)) return;
  if (a === 'clear') { await session.defaultSession.clearStorageData(); await session.defaultSession.clearCache(); }
  else if (a === 'links') { bookmarks = DEFAULTS.map(b => ({ ...b })); saveBm(); }
  else return;
  e.sender.executeJavaScript(`done(${JSON.stringify(a)})`).catch(() => {});
});

app.whenReady().then(() => {
  try { bookmarks = JSON.parse(fs.readFileSync(bmFile(), 'utf8')); }
  catch { bookmarks = DEFAULTS; try { fs.writeFileSync(bmFile(), JSON.stringify(bookmarks)); } catch {} }
  try { playlists = JSON.parse(fs.readFileSync(plFile(), 'utf8')); } catch {}
  try { tracks = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'music.json'), 'utf8')); } catch {}
  try { settings = { ...DEF_SETTINGS, ...JSON.parse(fs.readFileSync(setFile(), 'utf8')) }; } catch {}
  settings.wallpaperDesign = { ...DEF_SETTINGS.wallpaperDesign, ...(settings.wallpaperDesign || {}) };
  if (['aurora','drift','matrix','waves','hexagons'].includes(settings.wallpaper)) {
    settings.animatedWallpaper = settings.wallpaper === 'aurora' ? 'waves' : settings.wallpaper === 'drift' ? 'hexagons' : settings.wallpaper;
    settings.wallpaperMode = 'animated'; settings.wallpaper = 'none';
  } else if (settings.wallpaper === 'custom') settings.wallpaper = 'image';
  if (!['none','image','design'].includes(settings.wallpaper)) settings.wallpaper = 'none';
  if (!['none','matrix','waves','hexagons','custom'].includes(settings.animatedWallpaper)) settings.animatedWallpaper = 'none';
  if (!['static','animated'].includes(settings.wallpaperMode)) settings.wallpaperMode = 'static';
  if (!['glow','dots','grid','diagonal'].includes(settings.wallpaperDesign.pattern)) settings.wallpaperDesign.pattern = 'glow';
  if (!/^#[\da-f]{6}$/i.test(settings.wallpaperDesign.base)) settings.wallpaperDesign.base = DEF_SETTINGS.wallpaperDesign.base;
  if (!/^#[\da-f]{6}$/i.test(settings.wallpaperDesign.accent)) settings.wallpaperDesign.accent = DEF_SETTINGS.wallpaperDesign.accent;
  saveSettings();
  blockOn = settings.adblock;

  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
    try {
      const h = new URL(d.url).hostname;
      if (settings.blocklist.some(b => h === b || h.endsWith('.' + b))) return cb({ cancel: true });
      if (!blockOn) return cb({});
      const hit = BLOCK.some(b => h === b || h.endsWith('.' + b));
      if (hit) { blocked++; if (!timer) timer = setTimeout(() => { timer = null; pushAll(); }, 500); }
      cb({ cancel: hit });
    } catch { cb({}); }
  });

  createBrowserWindow();
});

function createBrowserWindow(bounds = {}) {
  const browserWindow = new BrowserWindow({
    width: bounds.width || 1280, height: bounds.height || 800, x: bounds.x, y: bounds.y,
    minWidth: 720, minHeight: 440, frame: false,
    backgroundColor: '#0a0a0a', title: 'VOID', icon: path.join(__dirname, 'assets', 'void.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  const ctx = { win: browserWindow, tabs: [], active: null, focusMode: false };
  windows.set(browserWindow, ctx);
  if (!win) win = browserWindow;
  browserWindow.loadFile('ui.html');
  browserWindow.on('resize', () => layout(ctx));
  browserWindow.webContents.on('did-finish-load', () => {
    if (!ctx.tabs.length) newTab(HOME, ctx);
    push(ctx);
  });
  browserWindow.on('focus', () => Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'VOID', submenu: items(ctx) }])));
  browserWindow.on('closed', () => {
    ctx.tabs.forEach(t => tabOwners.delete(t.id));
    windows.delete(browserWindow);
    if (win === browserWindow) win = contexts()[0]?.win || null;
    if (pop && pop.isDestroyed()) pop = null;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'VOID', submenu: items(ctx) }]));
  return ctx;
}

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!contexts().length) createBrowserWindow(); });
