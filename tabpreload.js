const { contextBridge, ipcRenderer } = require('electron');
// Only the new tab page gets this bridge (main.js re-checks the sender URL).
if (location.pathname.endsWith('newtab.html')) {
  contextBridge.exposeInMainWorld('voidApi', {
    go: t => ipcRenderer.send('tab-cmd', 'go', t),
    add: u => ipcRenderer.send('tab-cmd', 'add', u),
    remove: u => ipcRenderer.send('tab-cmd', 'remove', u),
    prefs: () => ipcRenderer.invoke('home-prefs'),
  });
} else if (location.pathname.endsWith('settings.html')) {
  contextBridge.exposeInMainWorld('voidSettings', {
    get: () => ipcRenderer.invoke('settings-get'),
    set: (k, v) => ipcRenderer.send('settings-set', k, v),
    act: a => ipcRenderer.send('settings-act', a),
    pickWallpaper: () => ipcRenderer.invoke('wallpaper-pick'),
    pickAnimatedWallpaper: () => ipcRenderer.invoke('wallpaper-animated-pick'),
  });
} else {
  const addPictureInPictureControl = () => {
    if (!document.documentElement) return;
    let video = null, hideTimer = null;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;display:none;width:38px;height:38px;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      button{all:initial;box-sizing:border-box;width:38px;height:38px;display:grid;place-items:center;border:1px solid #ffffff24;border-radius:10px;background:#292a30eF;color:#fff;box-shadow:0 4px 16px #0008;cursor:pointer;pointer-events:auto;backdrop-filter:blur(12px)}
      button:hover{background:#41434b;color:#b7f36b}svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    </style><button title="Picture in picture" aria-label="Pop this video out"><svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><rect x="10" y="10" width="6" height="4.5" rx=".8"/></svg></button>`;
    const button = shadow.querySelector('button');
    const cancelHide = () => { clearTimeout(hideTimer); };
    const hideSoon = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { host.style.display = 'none'; video = null; }, 420); };
    const updatePosition = () => {
      if (!video || !video.isConnected) { host.style.display = 'none'; return; }
      const r = video.getBoundingClientRect();
      if (r.width < 110 || r.height < 70 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) { host.style.display = 'none'; return; }
      host.style.left = `${Math.round(Math.min(innerWidth - 44, r.right - 46))}px`;
      host.style.top = `${Math.round(Math.max(5, r.top + 7))}px`;
      host.style.display = 'block';
    };
    const findVideo = e => e.composedPath().find(node => node && node.tagName === 'VIDEO' && typeof node.requestPictureInPicture === 'function') || null;
    const showFor = e => {
      const found = findVideo(e);
      if (!found) return;
      video = found; cancelHide(); updatePosition();
    };
    button.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      if (!video) return;
      try {
        if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch { button.title = 'Picture in picture is unavailable for this video'; setTimeout(() => { button.title = 'Picture in picture'; }, 1800); }
    });
    host.addEventListener('pointerenter', cancelHide);
    host.addEventListener('pointerleave', hideSoon);
    document.addEventListener('pointerover', showFor, true);
    document.addEventListener('pointermove', e => { if (findVideo(e)) showFor(e); }, true);
    document.addEventListener('pointerout', e => { if (findVideo(e)) hideSoon(); }, true);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('fullscreenchange', updatePosition);
    document.documentElement.append(host);
  };
  if (document.documentElement) addPictureInPictureControl();
  else document.addEventListener('DOMContentLoaded', addPictureInPictureControl, { once: true });
}
