/**
 * Self-contained HTML5 Video & Screen/Whiteboard Presenter Engine.
 * Used when a phone selects:
 * - "video-file" (Open & Share Video from Phone Gallery)
 * - "demo-video" (Stream Built-in Animated HD Video)
 * - "screen-board" (Share Screen / Phone Screenshots / Interactive Whiteboard)
 *
 * Captures live JPEG frames at ~6 FPS and posts them to React Native
 * so the 2nd phone renders them natively in real time!
 */
export function getWebRTCEngineHTML({ mode = 'demo-video', userName = 'Presenter' }) {
  const safeMode = JSON.stringify(mode);
  const safeUserName = JSON.stringify(userName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Presenter Engine</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    html, body { width: 100%; height: 100%; background: #090d16; color: #f8fafc; overflow: hidden; }
    #presenterRoot {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      background: #0b1120;
    }
    .top-prompt {
      width: 100%;
      padding: 12px 16px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .prompt-text {
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
    }
    .pick-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    #videoContainer {
      flex: 1;
      width: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #000;
      padding: 8px;
    }
    #sharedVideo {
      width: 100%;
      max-height: 100%;
      background: #000;
    }
    .empty-video-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .big-pick-btn {
      margin-top: 14px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 14px 24px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }
    #boardContainer {
      flex: 1;
      width: 100%;
      display: none;
      flex-direction: column;
      background: #1e293b;
    }
    #boardCanvas {
      flex: 1;
      width: 100%;
      background: #ffffff;
      touch-action: none;
    }
    .wb-toolbar {
      height: 50px;
      background: #0f172a;
      border-top: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 0 8px;
    }
    .wb-btn {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="presenterRoot">
    <div class="top-prompt">
      <span class="prompt-text" id="headerLabel">🔴 Live Presenting to 2nd Phone</span>
      <button class="pick-btn" id="actionBtn" onclick="triggerPrimaryAction()" style="display:none;">
        📁 Choose File
      </button>
    </div>

    <!-- Video Player Container -->
    <div id="videoContainer">
      <div class="empty-video-box" id="videoEmptyPrompt">
        <div style="font-size:42px;margin-bottom:8px;">🎬</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Select a Video from Your Phone</div>
        <div style="font-size:13px;color:#94a3b8;max-width:280px;">
          Tap the button below to open any video from your gallery. As soon as it plays, the 2nd phone will see it live!
        </div>
        <button class="big-pick-btn" onclick="document.getElementById('videoInput').click()">
          📁 Open Video from Gallery
        </button>
      </div>
      <video id="sharedVideo" controls playsinline style="display:none;"></video>
    </div>

    <!-- Screen / Image / Demo Video Canvas Container -->
    <div id="boardContainer">
      <canvas id="boardCanvas"></canvas>
      <div class="wb-toolbar" id="wbToolbar">
        <button class="wb-btn" onclick="setPenColor('#2563eb')">🔵 Blue</button>
        <button class="wb-btn" onclick="setPenColor('#ef4444')">🔴 Red</button>
        <button class="wb-btn" onclick="setPenColor('#10b981')">🟢 Green</button>
        <button class="wb-btn" onclick="document.getElementById('imageInput').click()">🖼️ Open Screenshot/Photo</button>
        <button class="wb-btn" onclick="resetBoard()">🗑️ Clear</button>
      </div>
    </div>

    <input type="file" id="videoInput" accept="video/*" style="display:none;" onchange="onVideoPicked(event)" />
    <input type="file" id="imageInput" accept="image/*" style="display:none;" onchange="onImagePicked(event)" />
  </div>

  <script>
    const MODE = ${safeMode};
    const USER_NAME = ${safeUserName};

    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d');
    let broadcastTimer = null;
    let animId = null;

    function postToNative(type, payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
      }
    }

    function triggerPrimaryAction() {
      if (MODE === 'video-file') {
        document.getElementById('videoInput').click();
      } else if (MODE === 'screen-board') {
        document.getElementById('imageInput').click();
      }
    }

    function onVideoPicked(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const video = document.getElementById('sharedVideo');
      document.getElementById('videoEmptyPrompt').style.display = 'none';
      video.style.display = 'block';
      video.src = url;
      video.play().catch(() => {});
      document.getElementById('headerLabel').innerText = '🎬 Playing: ' + (file.name || 'Shared Video');

      if (broadcastTimer) clearInterval(broadcastTimer);
      broadcastTimer = setInterval(() => {
        if (video.readyState >= 2) {
          captureCanvas.width = 420;
          captureCanvas.height = 240;
          captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
          const frame = captureCanvas.toDataURL('image/jpeg', 0.56);
          postToNative('PRESENTER_FRAME', { frame, mode: 'video' });
        }
      }, 160);
    }

    let penColor = '#2563eb';
    let drawing = false;
    let lx = 0, ly = 0;

    function setPenColor(c) { penColor = c; }

    function resetBoard() {
      const canvas = document.getElementById('boardCanvas');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || 360;
      canvas.height = rect.height || 460;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('📲 Live Screen & Photo Share', 18, 36);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('Draw here OR tap "Open Screenshot/Photo" below!', 18, 60);
    }

    function onImagePicked(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.getElementById('boardCanvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      };
      img.src = URL.createObjectURL(file);
    }

    function initScreenBoard() {
      document.getElementById('boardContainer').style.display = 'flex';
      document.getElementById('actionBtn').style.display = 'block';
      document.getElementById('actionBtn').innerText = '🖼️ Pick Screenshot';
      document.getElementById('headerLabel').innerText = '📲 Sharing Screen / Board Live';

      setTimeout(() => {
        resetBoard();
        const canvas = document.getElementById('boardCanvas');
        const ctx = canvas.getContext('2d');

        const getPos = (e) => {
          const r = canvas.getBoundingClientRect();
          const cx = e.touches ? e.touches[0].clientX : e.clientX;
          const cy = e.touches ? e.touches[0].clientY : e.clientY;
          return { x: cx - r.left, y: cy - r.top };
        };

        canvas.onpointerdown = (e) => {
          drawing = true;
          const p = getPos(e);
          lx = p.x; ly = p.y;
        };
        canvas.onpointermove = (e) => {
          if (!drawing) return;
          const p = getPos(e);
          ctx.strokeStyle = penColor;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          lx = p.x; ly = p.y;
        };
        canvas.onpointerup = () => { drawing = false; };

        if (broadcastTimer) clearInterval(broadcastTimer);
        broadcastTimer = setInterval(() => {
          const frame = canvas.toDataURL('image/jpeg', 0.58);
          postToNative('PRESENTER_FRAME', { frame, mode: 'screen' });
        }, 180);
      }, 100);
    }

    function initDemoVideo() {
      document.getElementById('boardContainer').style.display = 'flex';
      document.getElementById('wbToolbar').style.display = 'none';
      document.getElementById('headerLabel').innerText = '🎬 Streaming Live Demo Video';

      const canvas = document.getElementById('boardCanvas');
      canvas.width = 420;
      canvas.height = 260;
      const ctx = canvas.getContext('2d');

      let angle = 0;
      function animate() {
        angle += 0.06;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1d4ed8');
        grad.addColorStop(1, '#0d9488');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 4; i++) {
          const x = canvas.width / 2 + Math.cos(angle + i * 1.5) * (85 + i * 16);
          const y = canvas.height / 2 + Math.sin(angle * 1.3 + i) * (50 + i * 10);
          ctx.beginPath();
          ctx.arc(x, y, 16 - i * 2, 0, Math.PI * 2);
          ctx.fillStyle = ['#38bdf8', '#f43f5e', '#facc15', '#4ade80'][i];
          ctx.fill();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎬 LIVE SHARED VIDEO', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#bae6fd';
        ctx.fillText('Streaming from ' + USER_NAME + ' • ' + new Date().toLocaleTimeString(), canvas.width / 2, canvas.height / 2 + 18);

        animId = requestAnimationFrame(animate);
      }
      animate();

      if (broadcastTimer) clearInterval(broadcastTimer);
      broadcastTimer = setInterval(() => {
        const frame = canvas.toDataURL('image/jpeg', 0.58);
        postToNative('PRESENTER_FRAME', { frame, mode: 'video' });
      }, 160);
    }

    window.addEventListener('DOMContentLoaded', () => {
      if (MODE === 'video-file') {
        document.getElementById('videoContainer').style.display = 'flex';
        document.getElementById('actionBtn').style.display = 'block';
        document.getElementById('actionBtn').innerText = '📁 Change Video';
        document.getElementById('headerLabel').innerText = '🎬 Share Video from Gallery';
      } else if (MODE === 'screen-board') {
        initScreenBoard();
      } else {
        initDemoVideo();
      }
    });
  </script>
</body>
</html>`;
}
