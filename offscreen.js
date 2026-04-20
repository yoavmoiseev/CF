// offscreen.js — runs inside offscreen.html
// Plays he.mp4 → en.mp4 in a loop.
// Sends each frame as a raw pixel array to the background service worker,
// which then calls chrome.action.setIcon() (chrome.action is NOT available here).

(function () {
  const video  = document.getElementById('cfIconVideo');
  const canvas = document.getElementById('cfIconCanvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });
  const SIZE   = 32;

  const sources = [
    chrome.runtime.getURL('video/he.mp4'),
    chrome.runtime.getURL('video/en.mp4'),
  ];
  let idx = 0;

  function loadNext() {
    idx = (idx + 1) % sources.length;
    video.src = sources[idx];
    video.load();
    video.play().catch(() => {});
  }

  video.addEventListener('ended', loadNext);
  video.addEventListener('error', () => setTimeout(loadNext, 500));

  video.src = sources[0];
  video.play().catch(() => {});

  // Send ~15 frames per second to the background service worker
  setInterval(() => {
    if (video.readyState >= 2 && !video.paused && !video.ended) {
      ctx.drawImage(video, 0, 0, SIZE, SIZE);
      const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
      // Must use message passing — chrome.action is not available in offscreen docs
      chrome.runtime.sendMessage({
        action: 'setIconFrame',
        data: Array.from(imageData.data),
        width: SIZE,
        height: SIZE,
      }).catch(() => {});
    }
  }, 67); // ≈ 15 fps
})();
