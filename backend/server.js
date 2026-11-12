const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '25mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 5e7,
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 4000;

// In-memory store for active rooms
const rooms = new Map();

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

function generateMeetCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const part = (len) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(3)}-${part(4)}-${part(3)}`;
}

function normalizeRoomCode(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim().toLowerCase();
  if (cleaned.includes('/join/')) {
    cleaned = cleaned.split('/join/').pop().split('?')[0].split('#')[0];
  } else if (cleaned.includes('room=')) {
    cleaned = cleaned.split('room=').pop().split('&')[0];
  }
  return cleaned.replace(/[^a-z0-9-]/g, '');
}

function broadcastRoomSync(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const participantsList = Array.from(room.participants.values());
  io.to(roomId).emit('room-state-sync', {
    roomId: room.id,
    participantsCount: participantsList.length,
    participants: participantsList,
    presenterSocketId: room.presenterSocketId,
    roomShareMode: room.shareMode,
    shareTitle: room.shareTitle || '',
  });
}

app.get('/api/info', (req, res) => {
  const ips = getLocalIPs();
  const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
  res.json({
    status: 'ok',
    service: 'Live Media Share Signaling Server',
    port: PORT,
    primaryIp,
    ips,
    activeRoomsCount: rooms.size,
  });
});

app.post('/api/rooms', (req, res) => {
  const { hostName = 'Host', customCode } = req.body || {};
  let roomId = customCode ? normalizeRoomCode(customCode) : generateMeetCode();
  while (!customCode && rooms.has(roomId)) {
    roomId = generateMeetCode();
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      createdAt: new Date().toISOString(),
      hostName,
      presenterSocketId: null,
      shareMode: 'none',
      shareTitle: '',
      participants: new Map(),
    });
  }

  const ips = getLocalIPs();
  const primaryIp = ips.length > 0 ? ips[0].address : req.hostname || 'localhost';
  const inviteUrl = `http://${primaryIp}:${PORT}/join/${roomId}`;

  res.json({
    roomId,
    inviteUrl,
    hostName,
    createdAt: rooms.get(roomId).createdAt,
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = normalizeRoomCode(req.params.roomId);
  const room = rooms.get(roomId);
  const ips = getLocalIPs();
  const primaryIp = ips.length > 0 ? ips[0].address : req.hostname || 'localhost';

  if (!room) {
    return res.json({
      exists: false,
      roomId,
      canJoin: true,
      participantsCount: 0,
      inviteUrl: `http://${primaryIp}:${PORT}/join/${roomId}`,
    });
  }

  res.json({
    exists: true,
    roomId: room.id,
    canJoin: true,
    hostName: room.hostName,
    shareMode: room.shareMode,
    participantsCount: room.participants.size,
    participants: Array.from(room.participants.values()),
    inviteUrl: `http://${primaryIp}:${PORT}/join/${room.id}`,
  });
});

app.get('/join/:roomId', (req, res) => {
  const roomId = normalizeRoomCode(req.params.roomId);
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Join Meeting • ${roomId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; max-width: 420px; width: 100%; padding: 32px 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
    .logo { width: 64px; height: 64px; border-radius: 16px; background: linear-gradient(135deg, #2563eb, #06b6d4); display: inline-flex; align-items: center; justify-content: center; font-size: 30px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
    .code-box { background: #0f172a; border: 1px dashed #3b82f6; border-radius: 12px; padding: 14px; font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #60a5fa; margin-bottom: 20px; }
    .btn { display: block; width: 100%; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; margin-bottom: 12px; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .toast { font-size: 13px; color: #34d399; margin-top: 8px; min-height: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📹</div>
    <h1>Live Media Share Invite</h1>
    <p>You have been invited to join a live camera & screen sharing meeting.</p>
    <div class="code-box" id="roomCode">${roomId}</div>
    <button class="btn btn-primary" onclick="copyCode()">📋 Copy Meeting Code</button>
    <a class="btn btn-secondary" href="livemediashare://join/${roomId}">📱 Open in Live Media Share App</a>
    <div class="toast" id="toast"></div>
  </div>
  <script>
    function copyCode() {
      const code = "${roomId}";
      if (navigator.clipboard) navigator.clipboard.writeText(code);
      document.getElementById('toast').innerText = '✅ Meeting code copied! Paste it in the app.';
    }
  </script>
</body>
</html>`);
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ${socket.id}`);

  socket.on('join-room', ({ roomId: rawRoomId, userName = 'Guest', initialMediaState = {} }) => {
    const roomId = normalizeRoomCode(rawRoomId);
    if (!roomId) return;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        createdAt: new Date().toISOString(),
        hostName: userName,
        presenterSocketId: null,
        shareMode: 'none',
        shareTitle: '',
        participants: new Map(),
      });
    }

    const room = rooms.get(roomId);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    const participantInfo = {
      socketId: socket.id,
      userName,
      joinedAt: Date.now(),
      isAudioMuted: !!initialMediaState.isAudioMuted,
      isVideoOff: !!initialMediaState.isVideoOff,
      shareMode: 'none',
    };

    const existingPeers = Array.from(room.participants.values()).filter(
      (p) => p.socketId !== socket.id
    );
    room.participants.set(socket.id, participantInfo);

    console.log(`[Room ${roomId}] ${userName} (${socket.id}) joined. Total: ${room.participants.size}`);

    socket.emit('room-joined', {
      roomId,
      selfSocketId: socket.id,
      peers: existingPeers,
      presenterSocketId: room.presenterSocketId,
      roomShareMode: room.shareMode,
      shareTitle: room.shareTitle || '',
    });

    socket.to(roomId).emit('peer-joined', participantInfo);
    broadcastRoomSync(roomId);
  });

  socket.on('request-room-sync', () => {
    const roomId = socket.data.roomId;
    if (roomId) broadcastRoomSync(roomId);
  });

  socket.on('webrtc-offer', ({ targetSocketId, sdp, metadata }) => {
    io.to(targetSocketId).emit('webrtc-offer', {
      fromSocketId: socket.id,
      fromUserName: socket.data.userName || 'Peer',
      sdp,
      metadata,
    });
  });

  socket.on('webrtc-answer', ({ targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('webrtc-answer', {
      fromSocketId: socket.id,
      sdp,
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      fromSocketId: socket.id,
      candidate,
    });
  });

  socket.on('media-state-change', (stateUpdate = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const participant = room.participants.get(socket.id);
    if (!participant) return;

    if (typeof stateUpdate.isAudioMuted === 'boolean') {
      participant.isAudioMuted = stateUpdate.isAudioMuted;
    }
    if (typeof stateUpdate.isVideoOff === 'boolean') {
      participant.isVideoOff = stateUpdate.isVideoOff;
    }
    if (stateUpdate.shareMode) {
      participant.shareMode = stateUpdate.shareMode;
      if (stateUpdate.shareMode !== 'none') {
        room.presenterSocketId = socket.id;
        room.shareMode = stateUpdate.shareMode;
        room.shareTitle = stateUpdate.shareTitle || '';
      } else if (room.presenterSocketId === socket.id) {
        room.presenterSocketId = null;
        room.shareMode = 'none';
        room.shareTitle = '';
      }
    }

    io.to(roomId).emit('peer-media-updated', {
      socketId: socket.id,
      userName: participant.userName,
      isAudioMuted: participant.isAudioMuted,
      isVideoOff: participant.isVideoOff,
      shareMode: participant.shareMode,
      presenterSocketId: room.presenterSocketId,
      roomShareMode: room.shareMode,
      shareTitle: room.shareTitle || '',
    });

    broadcastRoomSync(roomId);
  });

  socket.on('screen-frame', (payload = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('screen-frame', {
      fromSocketId: socket.id,
      fromUserName: socket.data.userName || 'Peer',
      ...payload,
    });
  });

  socket.on('chat-message', ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !text) return;
    io.to(roomId).emit('chat-message', {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: socket.id,
      senderName: socket.data.userName || 'Peer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  });

  const handleLeave = () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const participant = room.participants.get(socket.id);
    room.participants.delete(socket.id);

    if (room.presenterSocketId === socket.id) {
      room.presenterSocketId = null;
      room.shareMode = 'none';
      room.shareTitle = '';
    }

    socket.to(roomId).emit('peer-left', {
      socketId: socket.id,
      userName: participant ? participant.userName : 'Peer',
      presenterSocketId: room.presenterSocketId,
      roomShareMode: room.shareMode,
    });

    broadcastRoomSync(roomId);

    console.log(`[Room ${roomId}] ${socket.id} left. Remaining: ${room.participants.size}`);
    if (room.participants.size === 0) {
      setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.participants.size === 0) {
          rooms.delete(roomId);
        }
      }, 10 * 60 * 1000);
    }
    socket.data.roomId = null;
  };

  socket.on('leave-room', handleLeave);
  socket.on('disconnect', handleLeave);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\n=======================================================');
  console.log('🚀 LIVE MEDIA SHARE - SIGNALING & ROOM SERVER RUNNING');
  console.log('=======================================================');
  console.log(`Local URL:    http://localhost:${PORT}`);
  ips.forEach((ip) => {
    console.log(`Network URL:  http://${ip.address}:${PORT}  (${ip.name})`);
  });
  console.log('=======================================================\n');
});
