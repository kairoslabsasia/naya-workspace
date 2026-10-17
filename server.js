require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const store = require('./data/store');
const { askNaya } = require('./services/gemini');
const { extractGoogleSheetInfo, fetchGoogleSheetContent } = require('./services/sheetReader');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const AI_NAME = (process.env.AI_NAME || 'Naya').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || 'naya-workspace-super-secret-key-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Akses ditolak. Silakan login terlebih dahulu.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi login telah kedaluwarsa. Silakan login ulang.' });
  }
}

function superadminMiddleware(req, res, next) {
  if (req.user && req.user.role === 'superadmin') {
    return next();
  }
  return res.status(403).json({ error: 'Akses terlarang. Hanya Superadmin yang memiliki izin ini.' });
}

// ==========================================
// AUTH & TEAM MANAGEMENT ENDPOINTS
// ==========================================

// 1. Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const user = store.getUserByUsername(username);
  if (!user || !store.verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  // Generate JWT token (valid for 30 days)
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    }
  });
});

// 2. Get Current Authenticated User (Check Session)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// 3. Superadmin: Get All Team Members
app.get('/api/admin/users', [authMiddleware, superadminMiddleware], (req, res) => {
  res.json(store.getUsers());
});

// 4. Superadmin: Create New Team Member
app.post('/api/admin/users', [authMiddleware, superadminMiddleware], (req, res) => {
  const { username, fullName, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password minimal 4 karakter.' });
  }

  try {
    const newUser = store.createUser({ username, fullName, password, role });
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Superadmin: Delete Team Member
app.delete('/api/admin/users/:userId', [authMiddleware, superadminMiddleware], (req, res) => {
  try {
    store.deleteUser(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Superadmin: Reset Team Member Password
app.post('/api/admin/users/:userId/reset-password', [authMiddleware, superadminMiddleware], (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
  }

  try {
    store.resetUserPassword(req.params.userId, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// ROOMS & NOTES ENDPOINTS
// ==========================================

app.get('/api/rooms', (req, res) => {
  res.json(store.getRooms());
});

app.post('/api/rooms', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama room wajib diisi' });
  }
  const newRoom = store.createRoom({ name: name.trim(), description });
  io.emit('room_created', newRoom);
  res.json(newRoom);
});

app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  store.deleteRoom(roomId);
  io.emit('room_deleted', roomId);
  res.json({ success: true });
});

app.get('/api/rooms/:roomId/data', (req, res) => {
  const { roomId } = req.params;
  const room = store.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room tidak ditemukan' });
  }
  const messages = store.getMessages(roomId);
  const notes = store.getNotes(roomId);
  res.json({ room, messages, notes });
});

// ==========================================
// REAL-TIME SOCKET.IO HANDLERS
// ==========================================

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.currentRoom = roomId;
    socket.username = username || 'User';

    const room = store.getRoom(roomId);
    if (room) {
      socket.emit('room_loaded', {
        room,
        messages: store.getMessages(roomId),
        notes: store.getNotes(roomId)
      });
    }
  });

  socket.on('send_message', async ({ roomId, sender, text }) => {
    if (!text || !text.trim()) return;

    const trimmedText = text.trim();

    // 1. Save and broadcast user's message immediately
    const userMsg = store.addMessage({
      roomId,
      sender: sender || 'User',
      text: trimmedText,
      isAi: false
    });
    io.to(roomId).emit('new_message', userMsg);

    // 2. Check if AI (@Naya) is mentioned
    const mentionRegex = new RegExp(`@${AI_NAME}\\b`, 'i');
    if (mentionRegex.test(trimmedText)) {
      // Broadcast thinking state to room
      io.to(roomId).emit('ai_typing', { isTyping: true, name: 'Naya' });

      try {
        const room = store.getRoom(roomId);
        const currentNotes = store.getNotes(roomId);
        const recentMessages = store.getMessages(roomId, 15);

        // Check if there is a Google Spreadsheet URL in the message
        let spreadsheetData = null;
        const sheetInfo = extractGoogleSheetInfo(trimmedText);
        if (sheetInfo) {
          spreadsheetData = await fetchGoogleSheetContent(sheetInfo);
          if (spreadsheetData && spreadsheetData.success) {
            store.setRoomSpreadsheet(roomId, spreadsheetData);
          }
        } else {
          // If no link in current message, check if room already has active spreadsheet
          spreadsheetData = store.getRoomSpreadsheet(roomId);
        }

        // Call Gemini
        const aiResponse = await askNaya({
          room,
          currentNotes,
          recentMessages,
          userMessage: trimmedText,
          senderName: sender || 'User',
          spreadsheetData
        });

        // If notes were revised by Naya
        if (aiResponse.revisedNotes && typeof aiResponse.revisedNotes === 'string') {
          const updateResult = store.updateNotes(roomId, aiResponse.revisedNotes, 'Naya (AI)');
          io.to(roomId).emit('notes_updated', {
            notes: updateResult.content,
            updatedBy: updateResult.updatedBy,
            updatedAt: updateResult.updatedAt,
            summary: aiResponse.summaryOfChanges
          });
        }

        // Send Naya's chat reply
        const nayaMsg = store.addMessage({
          roomId,
          sender: 'Naya',
          text: aiResponse.chatReply,
          isAi: true
        });
        io.to(roomId).emit('new_message', nayaMsg);

      } catch (error) {
        console.error('Error invoking Gemini:', error);
        const errorMsg = store.addMessage({
          roomId,
          sender: 'Naya',
          text: `Maaf, Naya mengalami kendala memproses permintaan ini: ${error.message}`,
          isAi: true
        });
        io.to(roomId).emit('new_message', errorMsg);
      } finally {
        io.to(roomId).emit('ai_typing', { isTyping: false });
      }
    }
  });

  socket.on('manual_update_notes', ({ roomId, notes, updatedBy }) => {
    const updateResult = store.updateNotes(roomId, notes, updatedBy || 'User');
    socket.to(roomId).emit('notes_updated', {
      notes: updateResult.content,
      updatedBy: updateResult.updatedBy,
      updatedAt: updateResult.updatedAt
    });
  });

  socket.on('clear_chat', ({ roomId }) => {
    const newMessages = store.clearMessages(roomId);
    io.to(roomId).emit('chat_cleared', newMessages);
  });
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 Asisten Team (Naya) aktif di: http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
