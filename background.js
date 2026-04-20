// background.js — MV3 service worker
// 1. On startup: draws a static "YS" icon, then immediately opens the offscreen
//    document which plays the video and sends frames back here.
// 2. On message 'setIconFrame': updates the toolbar icon with each video frame.

const OFFSCREEN_URL = 'offscreen.html';

function drawStaticIcon() {
  try {
    const SIZE = 32;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    grad.addColorStop(0, '#667eea');
    grad.addColorStop(1, '#764ba2');
    ctx.fillStyle = grad;
    roundRect(0, 0, SIZE, SIZE, 7);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YS', SIZE / 2, SIZE / 2);

    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('[CF BG] drawStaticIcon error:', e);
  }
}

async function ensureOffscreenDocument() {
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (existing) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Extract video frames and send them to the service worker to animate the toolbar icon',
    });
  } catch (e) {
    console.warn('[CF BG] ensureOffscreenDocument error:', e);
  }
}

// Receive video frames from offscreen.js and paint them to the toolbar icon
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'setIconFrame') {
    try {
      const imageData = new ImageData(
        new Uint8ClampedArray(msg.data),
        msg.width,
        msg.height
      );
      chrome.action.setIcon({ imageData });
    } catch (e) { /* ignore single bad frame */ }
  }
});

function init() {
  drawStaticIcon();
  ensureOffscreenDocument();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
init();
