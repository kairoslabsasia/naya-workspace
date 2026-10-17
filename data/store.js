const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'db.json');

// Default admin hash for 'admin123'
const DEFAULT_ADMIN_PASSWORD_HASH = bcrypt.hashSync('admin123', 10);

const defaultState = {
  users: [
    {
      id: 'usr-superadmin',
      username: 'admin',
      fullName: 'Super Administrator',
      passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
      role: 'superadmin',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-budi',
      username: 'budi',
      fullName: 'Budi Santoso',
      passwordHash: bcrypt.hashSync('budi123', 10),
      role: 'member',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-siti',
      username: 'siti',
      fullName: 'Siti Rahma',
      passwordHash: bcrypt.hashSync('siti123', 10),
      role: 'member',
      createdAt: new Date().toISOString()
    }
  ],
  rooms: [
    {
      id: 'liburan-bali',
      name: '🌴 Rencana Liburan Bali',
      description: 'Diskusi itinerary, budget, dan akomodasi liburan bareng tim.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'proyek-startup',
      name: '🚀 Ide Startup AI Workspace',
      description: 'Brainstorming fitur, arsitektur teknis, dan target pengguna.',
      createdAt: new Date().toISOString()
    }
  ],
  notes: {
    'liburan-bali': `# 🌴 Rencana Liburan Bali\n\n## 👥 Peserta\n- User (Ketua)\n- Budi (Teman)\n- Siti (Teman)\n\n## 💰 Estimasi Budget\n- Target: Rp 5.000.000 / orang\n- Tiket Pesawat: ~Rp 1.800.000 (PP)\n- Penginapan: ~Rp 1.500.000 (3 malam)\n- Makanan & Rekreasi: ~Rp 1.700.000\n\n## 📍 Rencana Destinasi\n1. **Hari 1:** Tiba di Denpasar, Check-in Hotel, Sunset di Pantai Kuta\n2. **Hari 2:** Sunrise Gunung Batur, Tour Kopi Kintamani, Ubud Art Market\n3. **Hari 3:** Watersport Nusa Dua, Makan Malam Seafood Jimbaran\n4. **Hari 4:** Belanja Oleh-oleh Krisna & Pulang\n\n---\n*Catatan ini bisa diubah otomatis oleh @Naya saat kalian berdiskusi di chat!*`,
    'proyek-startup': `# 🚀 Ide Startup AI Workspace\n\n## 🎯 Visi Produk\nPlatform chat kolaboratif tim dengan asisten AI terintegrasi yang memiliki memori terisolasi per-room dan sinkronisasi catatan hidup (*Living Notes*).\n\n## 🛠️ Tech Stack\n- Frontend: Vanilla JS + Modern Glassmorphism CSS + PWA\n- Backend: Node.js + Express + Socket.io + JWT Auth\n- AI Engine: Google Gemini Flash (Context Window 1M+)\n- Database: JSON / SQLite Persistent Storage\n\n## 📝 To-Do List\n- [x] Rancang sistem multi-room\n- [x] Integrasi model Gemini Flash\n- [x] Panel split chat & live notes\n- [x] PWA & Login Superadmin`
  },
  messages: {
    'liburan-bali': [
      {
        id: 'msg-1',
        sender: 'Siti',
        text: 'Halo semua! Jadi gimana nih rencana liburan kita bulan depan?',
        isAi: false,
        timestamp: new Date(Date.now() - 3600000 * 2).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      {
        id: 'msg-2',
        sender: 'Budi',
        text: 'Aku sih setuju ke Bali, budget 5 jutaan cukup gak ya?',
        isAi: false,
        timestamp: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      {
        id: 'msg-3',
        sender: 'Naya',
        text: 'Halo! Aku Naya, asisten room ini ✨ Aku sudah buatkan draf estimasi budget dan itinerary 4 hari di panel catatan sebelah kanan. Silakan cek dan beri tahu jika ada yang ingin diubah!',
        isAi: true,
        timestamp: new Date(Date.now() - 1800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ],
    'proyek-startup': [
      {
        id: 'msg-startup-1',
        sender: 'Naya',
        text: 'Selamat datang di ruang proyek! Silakan diskusi santai, dan panggil @Naya jika ingin mencatat atau merevisi arsitektur di sebelah kanan.',
        isAi: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]
  },
  spreadsheets: {}
};

function ensureDb() {
  if (!fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultState, null, 2), 'utf-8');
  } else {
    // Ensure users array exists in existing DB
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      let modified = false;
      if (!data.users || data.users.length === 0) {
        data.users = defaultState.users;
        modified = true;
      }
      if (!data.spreadsheets) {
        data.spreadsheets = {};
        modified = true;
      }
      if (modified) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {}
  }
}

function readData() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return defaultState;
  }
}

function saveData(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  // USER & AUTH METHODS
  getUsers() {
    const data = readData();
    // Return users without password hash for safety
    return (data.users || []).map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName || u.username,
      role: u.role || 'member',
      createdAt: u.createdAt
    }));
  },

  getUserByUsername(username) {
    const data = readData();
    const uname = (username || '').toLowerCase().trim();
    const userPartBeforeAt = uname.includes('@') ? uname.split('@')[0] : '';
    return (data.users || []).find(u => {
      const uName = (u.username || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      return uName === uname || (uEmail && uEmail === uname) || (userPartBeforeAt && uName === userPartBeforeAt);
    });
  },

  createUser({ username, fullName, password, role = 'member' }) {
    const data = readData();
    if (!data.users) data.users = [];

    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
    if (data.users.find(u => u.username.toLowerCase() === cleanUsername)) {
      throw new Error(`Username "${cleanUsername}" sudah digunakan.`);
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = {
      id: 'usr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 4),
      username: cleanUsername,
      fullName: fullName ? fullName.trim() : cleanUsername,
      passwordHash,
      role: role === 'superadmin' ? 'superadmin' : 'member',
      createdAt: new Date().toISOString()
    };

    data.users.push(newUser);
    saveData(data);

    return {
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      role: newUser.role,
      createdAt: newUser.createdAt
    };
  },

  deleteUser(userId) {
    const data = readData();
    if (!data.users) return false;
    const target = data.users.find(u => u.id === userId);
    if (!target) {
      throw new Error('User tidak ditemukan atau sudah dihapus.');
    }
    if (target.username === 'admin') {
      throw new Error('Akun superadmin utama tidak dapat dihapus.');
    }
    data.users = data.users.filter(u => u.id !== userId);
    saveData(data);
    return true;
  },

  resetUserPassword(userId, newPassword) {
    const data = readData();
    if (!data.users) return false;
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User tidak ditemukan.');

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    saveData(data);
    return true;
  },

  verifyPassword(user, password) {
    if (!user || !user.passwordHash) return false;
    return bcrypt.compareSync(password, user.passwordHash);
  },

  // ROOM METHODS
  getRooms() {
    return readData().rooms || [];
  },
  getRoom(roomId) {
    const data = readData();
    return (data.rooms || []).find(r => r.id === roomId);
  },
  createRoom({ name, description }) {
    const data = readData();
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36);
    const newRoom = {
      id,
      name,
      description: description || 'Ruang diskusi kolaboratif.',
      createdAt: new Date().toISOString()
    };
    if (!data.rooms) data.rooms = [];
    if (!data.notes) data.notes = {};
    if (!data.messages) data.messages = {};
    data.rooms.push(newRoom);
    data.notes[id] = '';
    data.messages[id] = [
      {
        id: 'msg-' + Date.now(),
        sender: 'Naya',
        text: `Halo! Ruangan "${name}" telah siap. Panggil @Naya jika butuh bantuan mencatat ide atau merevisi rencana bersama!`,
        isAi: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
    saveData(data);
    return newRoom;
  },
  deleteRoom(roomId) {
    const data = readData();
    // 1. Remove from rooms list
    data.rooms = (data.rooms || []).filter(r => r.id !== roomId);
    // 2. Cascade delete living notes
    if (data.notes && data.notes[roomId] !== undefined) {
      delete data.notes[roomId];
    }
    // 3. Cascade delete messages
    if (data.messages && data.messages[roomId] !== undefined) {
      delete data.messages[roomId];
    }
    // 4. Cascade delete spreadsheets
    if (data.spreadsheets && data.spreadsheets[roomId] !== undefined) {
      delete data.spreadsheets[roomId];
    }
    saveData(data);
    return true;
  },
  getMessages(roomId, limit = 50) {
    const data = readData();
    const msgs = data.messages[roomId] || [];
    return msgs.slice(-limit);
  },
  addMessage({ roomId, sender, text, isAi = false, isSystem = false }) {
    const data = readData();
    if (!data.messages[roomId]) {
      data.messages[roomId] = [];
    }
    const msg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      sender,
      text,
      isAi,
      isSystem,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    data.messages[roomId].push(msg);
    saveData(data);
    return msg;
  },
  clearMessages(roomId) {
    const data = readData();
    data.messages[roomId] = [
      {
        id: 'msg-cleared-' + Date.now(),
        sender: 'Sistem',
        text: 'Riwayat obrolan telah dibersihkan. Catatan di sebelah kanan tetap aman!',
        isAi: false,
        isSystem: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
    saveData(data);
    return data.messages[roomId];
  },
  getNotes(roomId) {
    const data = readData();
    return data.notes[roomId] || `# Catatan Room\n\n*Belum ada catatan.*`;
  },
  updateNotes(roomId, content, updatedBy = 'User') {
    const data = readData();
    data.notes[roomId] = content;
    saveData(data);
    return {
      content,
      updatedBy,
      updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  },
  setRoomSpreadsheet(roomId, sheetData) {
    const data = readData();
    if (!data.spreadsheets) data.spreadsheets = {};
    data.spreadsheets[roomId] = sheetData;
    saveData(data);
  },
  getRoomSpreadsheet(roomId) {
    const data = readData();
    return (data.spreadsheets && data.spreadsheets[roomId]) || null;
  }
};
