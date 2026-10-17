// Naya Workspace - Client Application (Dual-Engine: Node.js WebSockets & cPanel PHP Polling)
let socket = null;
let isPollingMode = false;
let pollingInterval = null;
let lastKnownMsgId = null;
const renderedMessageIds = new Set();

if (typeof io !== 'undefined' && !window.noSocketIo) {
  try {
    socket = io({
      reconnectionAttempts: 2,
      timeout: 3000
    });
    socket.on('connect_error', () => {
      enablePollingMode();
    });
  } catch (err) {
    enablePollingMode();
  }
} else {
  enablePollingMode();
}

function enablePollingMode() {
  if (isPollingMode) return;
  isPollingMode = true;
  console.log('⚡ Naya Engine: Mode Polling & REST aktif (cPanel PHP compatible)');
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(pollRoomUpdates, 2000);
}

// State
let currentRoomId = null;
let currentUser = null; // { id, username, fullName, role }
let authToken = localStorage.getItem('naya_auth_token') || null;
let isEditingNotes = false;
let currentNotesRaw = '';
let currentView = 'home'; // 'home' | 'chat'
let deferredInstallPrompt = null;
const REQUIRED_PIN = '082002';

// Token Helper
function getAuthToken() {
  const token = localStorage.getItem('naya_auth_token') || authToken;
  if (token) authToken = token;
  return token;
}

// Toast Notification
let toastTimer = null;
function showToast(message, type = 'info') {
  const toastEl = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');
  if (!toastEl || !msgEl) return;

  if (toastTimer) clearTimeout(toastTimer);

  toastEl.className = `toast-notification ${type}`;
  if (type === 'success') iconEl.textContent = '✅';
  else if (type === 'error') iconEl.textContent = '❌';
  else toastIconEl.textContent = '✨';

  msgEl.textContent = message;
  toastEl.classList.remove('hidden');

  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 4000);
}

// Pending deletion state
let pendingDeleteUserId = null;
let pendingDeleteUserName = null;
let pendingDeleteRoomId = null;
let pendingDeleteRoomName = null;

// DOM Elements - Shell & Views
const appContainerEl = document.getElementById('appContainer');
const sidebarEl = document.getElementById('sidebar');
const btnToggleSidebarEl = document.getElementById('btnToggleSidebar');
const btnToggleSidebarHomeEl = document.getElementById('btnToggleSidebarHome');
const btnCloseSidebarEl = document.getElementById('btnCloseSidebar');
const btnNavHomeEl = document.getElementById('btnNavHome');
const btnBackToHomeEl = document.getElementById('btnBackToHome');
const drawerBackdropEl = document.getElementById('drawerBackdrop');

// User profile in sidebar
const currentUserAvatarEl = document.getElementById('currentUserAvatar');
const currentUserNameEl = document.getElementById('currentUserName');
const currentUserRoleTagEl = document.getElementById('currentUserRoleTag');
const btnLogoutEl = document.getElementById('btnLogout');
const btnNavSuperadminEl = document.getElementById('btnNavSuperadmin');

// Views
const homeViewEl = document.getElementById('homeView');
const chatViewEl = document.getElementById('chatView');
const homeRoomCardsGridEl = document.getElementById('homeRoomCardsGrid');
const statTotalRoomsEl = document.getElementById('statTotalRooms');
const statTotalTeamEl = document.getElementById('statTotalTeam');
const btnOpenModalFromHomeEl = document.getElementById('btnOpenModalFromHome');
const btnCreateRoomFromGridEl = document.getElementById('btnCreateRoomFromGrid');
const btnInstallPwaEl = document.getElementById('btnInstallPwa');

// Chat View Elements
const roomListEl = document.getElementById('roomList');
const currentRoomNameEl = document.getElementById('currentRoomName');
const currentRoomDescEl = document.getElementById('currentRoomDesc');
const chatMessagesEl = document.getElementById('chatMessages');
const chatFormEl = document.getElementById('chatForm');
const messageInputEl = document.getElementById('messageInput');
const btnMentionNayaEl = document.getElementById('btnMentionNaya');
const btnClearChatEl = document.getElementById('btnClearChat');
const btnDeleteCurrentRoomEl = document.getElementById('btnDeleteCurrentRoom');
const aiTypingIndicatorEl = document.getElementById('aiTypingIndicator');

// Notes Elements
const notesPanelEl = document.getElementById('notesPanel');
const notesRenderedEl = document.getElementById('notesRendered');
const notesEditorEl = document.getElementById('notesEditor');
const btnFullscreenNotesEl = document.getElementById('btnFullscreenNotes');
const fullscreenIconEl = document.getElementById('fullscreenIcon');
const fullscreenTextEl = document.getElementById('fullscreenText');
const btnToggleEditNoteEl = document.getElementById('btnToggleEditNote');
const editBtnIconEl = document.getElementById('editBtnIcon');
const editBtnTextEl = document.getElementById('editBtnText');
const btnCopyNoteEl = document.getElementById('btnCopyNote');
const btnCloseNotesEl = document.getElementById('btnCloseNotes');
const btnToggleNotesEl = document.getElementById('btnToggleNotes');
const notesUpdatedByEl = document.getElementById('notesUpdatedBy');
const notesUpdatedAtEl = document.getElementById('notesUpdatedAt');
const notesAlertBannerEl = document.getElementById('notesAlertBanner');
const alertSummaryTextEl = document.getElementById('alertSummaryText');

// Modals
const loginOverlayEl = document.getElementById('loginOverlay');
const loginFormEl = document.getElementById('loginForm');
const loginUsernameEl = document.getElementById('loginUsername');
const loginPasswordEl = document.getElementById('loginPassword');
const loginErrorEl = document.getElementById('loginError');

const superadminModalEl = document.getElementById('superadminModal');
const btnCloseSuperadminModalEl = document.getElementById('btnCloseSuperadminModal');
const createTeamUserFormEl = document.getElementById('createTeamUserForm');
const newTeamUsernameEl = document.getElementById('newTeamUsername');
const newTeamFullNameEl = document.getElementById('newTeamFullName');
const newTeamPasswordEl = document.getElementById('newTeamPassword');
const newTeamRoleEl = document.getElementById('newTeamRole');
const adminUserTableBodyEl = document.getElementById('adminUserTableBody');

const newRoomModalEl = document.getElementById('newRoomModal');
const btnOpenNewRoomModalEl = document.getElementById('btnOpenNewRoomModal');
const btnCloseModalEl = document.getElementById('btnCloseModal');
const btnCancelModalEl = document.getElementById('btnCancelModal');
const newRoomFormEl = document.getElementById('newRoomForm');
const newRoomNameEl = document.getElementById('newRoomName');
const newRoomDescEl = document.getElementById('newRoomDesc');

const clearChatModalEl = document.getElementById('clearChatModal');
const btnCloseClearModalEl = document.getElementById('btnCloseClearModal');
const btnCancelClearModalEl = document.getElementById('btnCancelClearModal');
const clearChatFormEl = document.getElementById('clearChatForm');
const clearChatPinEl = document.getElementById('clearChatPin');
const pinErrorMsgEl = document.getElementById('pinErrorMsg');

const deleteRoomModalEl = document.getElementById('deleteRoomModal');
const btnCloseDeleteRoomModalEl = document.getElementById('btnCloseDeleteRoomModal');
const btnCancelDeleteRoomModalEl = document.getElementById('btnCancelDeleteRoomModal');
const btnConfirmDeleteRoomEl = document.getElementById('btnConfirmDeleteRoom');

const deleteUserModalEl = document.getElementById('deleteUserModal');
const btnCloseDeleteUserModalEl = document.getElementById('btnCloseDeleteUserModal');
const btnCancelDeleteUserModalEl = document.getElementById('btnCancelDeleteUserModal');
const btnConfirmDeleteUserEl = document.getElementById('btnConfirmDeleteUser');

// Logout Modal
const logoutModalEl = document.getElementById('logoutModal');
const btnCloseLogoutModalEl = document.getElementById('btnCloseLogoutModal');
const btnCancelLogoutModalEl = document.getElementById('btnCancelLogoutModal');
const btnConfirmLogoutEl = document.getElementById('btnConfirmLogout');

// Zoom & Pan Elements
const notesZoomToolbarEl = document.getElementById('notesZoomToolbar');
const btnZoomOutEl = document.getElementById('btnZoomOut');
const zoomLevelDisplayEl = document.getElementById('zoomLevelDisplay');
const btnZoomInEl = document.getElementById('btnZoomIn');
const btnTogglePanModeEl = document.getElementById('btnTogglePanMode');
const btnResetZoomEl = document.getElementById('btnResetZoom');
const notesZoomViewportEl = document.getElementById('notesZoomViewport');
const notesZoomContentEl = document.getElementById('notesZoomContent');

// Zoom & Pan State
let currentZoom = 1.0;
let isPanMode = false;
let isDraggingViewport = false;
let dragStartX = 0;
let dragStartY = 0;
let scrollStartX = 0;
let scrollStartY = 0;

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ PWA Service Worker terpasang:', reg.scope))
      .catch(err => console.log('❌ PWA Service Worker gagal:', err));
  });
}

// PWA Install Prompt Listener
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  btnInstallPwaEl.classList.remove('hidden');
});

btnInstallPwaEl.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('User PWA install outcome:', outcome);
    deferredInstallPrompt = null;
    btnInstallPwaEl.classList.add('hidden');
  }
});

// Subtle Web Audio Ping for AI updates
function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}

// 1. AUTHENTICATION & INITIALIZATION
async function init() {
  setupEventListeners();
  setupZoomAndPanInteractions();

  // Check existing token
  if (authToken) {
    const valid = await checkAuthSession();
    if (valid) {
      onLoginSuccess();
      return;
    }
  }

  // If no valid session, show login overlay
  showLoginOverlay();
}

async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

function showLoginOverlay() {
  loginOverlayEl.classList.remove('hidden');
  loginUsernameEl.value = '';
  loginPasswordEl.value = '';
  loginErrorEl.classList.add('hidden');
  loginUsernameEl.focus();
}

function onLoginSuccess() {
  loginOverlayEl.classList.add('hidden');

  // Update user profile in sidebar
  currentUserNameEl.textContent = currentUser.fullName || currentUser.username;
  currentUserRoleTagEl.textContent = currentUser.role === 'superadmin' ? '👑 Superadmin' : '👤 Member';
  currentUserAvatarEl.textContent = (currentUser.fullName || currentUser.username).slice(0, 1).toUpperCase();

  // Show superadmin menu if superadmin
  if (currentUser.role === 'superadmin') {
    btnNavSuperadminEl.classList.remove('hidden');
  } else {
    btnNavSuperadminEl.classList.add('hidden');
  }

  // Load rooms and start on Home
  loadRooms();
  switchView('home');
}

function logout() {
  localStorage.removeItem('naya_auth_token');
  authToken = null;
  currentUser = null;
  currentRoomId = null;
  clearCurrentRoomState();
  if (logoutModalEl) logoutModalEl.classList.add('hidden');
  if (superadminModalEl) superadminModalEl.classList.add('hidden');
  showLoginOverlay();
  showToast('👋 Kamu telah berhasil logout.', 'info');
}

// 2. VIEW MANAGEMENT
function switchView(viewName) {
  currentView = viewName;
  if (viewName === 'home') {
    homeViewEl.classList.remove('hidden');
    chatViewEl.classList.add('hidden');
    notesPanelEl.classList.add('collapsed');
    notesPanelEl.classList.remove('fullscreen');
    btnNavHomeEl.classList.add('active');
    btnNavSuperadminEl.classList.remove('active');
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
  } else if (viewName === 'chat') {
    homeViewEl.classList.add('hidden');
    chatViewEl.classList.remove('hidden');
    btnNavHomeEl.classList.remove('active');
    notesPanelEl.classList.remove('collapsed');
    btnToggleNotesEl.classList.add('active-toggle');
  }
  if (window.innerWidth <= 768) {
    closeMobileDrawers();
  }
}

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const rooms = await res.json();
    renderSidebarRooms(rooms);
    renderHomeRoomCards(rooms);
    statTotalRoomsEl.textContent = rooms.length;

    // Load team count if available
    loadTeamCount();
  } catch (err) {
    console.error('Gagal memuat rooms:', err);
  }
}

async function loadTeamCount() {
  if (currentUser && currentUser.role === 'superadmin') {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const users = await res.json();
        statTotalTeamEl.textContent = users.length;
      }
    } catch (e) {}
  } else {
    statTotalTeamEl.textContent = 'Aktif';
  }
}

function renderSidebarRooms(rooms) {
  roomListEl.innerHTML = '';
  rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = `room-item ${room.id === currentRoomId && currentView === 'chat' ? 'active' : ''}`;
    div.dataset.id = room.id;
    div.innerHTML = `
      <div class="room-item-content">
        <span class="room-item-title">${escapeHtml(room.name)}</span>
        <span class="room-item-desc">${escapeHtml(room.description || 'Ruang diskusi')}</span>
      </div>
      <button class="btn-delete-room" title="Hapus Room & Seluruh Catatan" data-id="${room.id}">&times;</button>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-room')) {
        e.stopPropagation();
        handleDeleteRoom(room.id, room.name);
        return;
      }
      openRoom(room.id);
    });

    roomListEl.appendChild(div);
  });
}

function renderHomeRoomCards(rooms) {
  homeRoomCardsGridEl.innerHTML = '';

  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    card.innerHTML = `
      <div>
        <div class="room-card-header">
          <div class="room-card-title">${escapeHtml(room.name)}</div>
          <span class="room-card-badge">Aktif</span>
        </div>
        <p class="room-card-desc">${escapeHtml(room.description || 'Ruang diskusi kolaboratif bersama tim dan Naya.')}</p>
      </div>
      <div class="room-card-footer">
        <span class="room-card-action">Masuk ke Room Chat ➔</span>
        <button class="btn-delete-room" title="Hapus Room & Seluruh Catatan" data-id="${room.id}">&times;</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-room')) {
        e.stopPropagation();
        handleDeleteRoom(room.id, room.name);
        return;
      }
      openRoom(room.id);
    });

    homeRoomCardsGridEl.appendChild(card);
  });

  // "+ Buat Room Baru" card
  const createCard = document.createElement('div');
  createCard.className = 'room-card card-create-new';
  createCard.innerHTML = `
    <div class="create-icon-circle">+</div>
    <span>Buat Room Baru</span>
  `;
  createCard.addEventListener('click', () => {
    openCreateRoomModal();
  });
  homeRoomCardsGridEl.appendChild(createCard);
}

function openRoom(roomId) {
  currentRoomId = roomId;
  switchView('chat');

  document.querySelectorAll('.room-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === roomId);
  });

  const senderName = currentUser ? (currentUser.fullName || currentUser.username) : 'User';
  if (socket && socket.connected) {
    socket.emit('join_room', { roomId, username: senderName });
  } else {
    loadRoomDirectly(roomId);
  }
}

async function loadRoomDirectly(roomId) {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/rooms/${roomId}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) return;
    const data = await res.json();
    currentRoomNameEl.textContent = data.room.name;
    currentRoomDescEl.textContent = data.room.description || 'Diskusi bersama tim & asisten @Naya';
    chatMessagesEl.innerHTML = '';
    renderedMessageIds.clear();
    (data.messages || []).forEach(msg => appendMessage(msg));
    scrollToBottom();
    updateNotesContent(data.notes, 'Sistem');
  } catch (err) {
    console.error('Error loading room:', err);
  }
}

// Room Deletion Confirmation & Execution
function handleDeleteRoom(roomId, roomName) {
  promptDeleteRoom(roomId, roomName);
}

function promptDeleteRoom(roomId, roomName) {
  pendingDeleteRoomId = roomId;
  pendingDeleteRoomName = roomName;
  if (deleteRoomModalEl) {
    const titleEl = document.getElementById('deleteRoomModalTitle');
    const descEl = document.getElementById('deleteRoomModalDesc');
    if (titleEl) titleEl.textContent = `Hapus "${roomName}"?`;
    if (descEl) {
      descEl.innerHTML = `Aksi ini akan menghapus permanen Room <strong>"${escapeHtml(roomName)}"</strong>, seluruh obrolan, dan <strong>seluruh Living Notes yang terikat</strong>. Data tidak dapat dipulihkan kembali.`;
    }
    deleteRoomModalEl.classList.remove('hidden');
  } else {
    // Fallback if modal not present
    if (confirm(`Hapus permanen room "${roomName}" beserta seluruh catatan yang terikat?`)) {
      executeDeleteRoom(roomId, roomName);
    }
  }
}

async function confirmDeleteRoomAction() {
  if (deleteRoomModalEl) deleteRoomModalEl.classList.add('hidden');
  if (!pendingDeleteRoomId) return;
  const roomId = pendingDeleteRoomId;
  const roomName = pendingDeleteRoomName;
  pendingDeleteRoomId = null;
  pendingDeleteRoomName = null;
  await executeDeleteRoom(roomId, roomName);
}

async function executeDeleteRoom(roomId, roomName) {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ Room "${roomName}" dan catatannya berhasil dihapus!`, 'success');
      // If currently inside the deleted room, clear all state
      if (currentRoomId === roomId) {
        clearCurrentRoomState();
        switchView('home');
      }
      await loadRooms();
    } else {
      showToast('❌ ' + (data.error || 'Gagal menghapus room.'), 'error');
    }
  } catch (err) {
    showToast('❌ Kesalahan jaringan: ' + err.message, 'error');
  }
}

function clearCurrentRoomState() {
  currentRoomId = null;
  currentNotesRaw = '';
  if (notesEditorEl) notesEditorEl.value = '';
  if (notesRenderedEl) notesRenderedEl.innerHTML = '<p class="empty-notes-hint">Pilih room chat untuk melihat catatan.</p>';
  if (notesUpdatedByEl) notesUpdatedByEl.textContent = 'Diperbarui oleh: -';
  if (notesUpdatedAtEl) notesUpdatedAtEl.textContent = '-';
  if (chatMessagesEl) chatMessagesEl.innerHTML = '';
  if (currentRoomNameEl) currentRoomNameEl.textContent = '';
  if (currentRoomDescEl) currentRoomDescEl.textContent = '';
}

// 3. SOCKET EVENT HANDLERS (IF SOCKET IS AVAILABLE)
if (socket) {
  socket.on('room_loaded', ({ room, messages, notes }) => {
    currentRoomNameEl.textContent = room.name;
    currentRoomDescEl.textContent = room.description || 'Diskusi bersama tim & asisten @Naya';
    
    chatMessagesEl.innerHTML = '';
    renderedMessageIds.clear();
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();

    updateNotesContent(notes, 'Sistem');
  });

  socket.on('new_message', (msg) => {
    appendMessage(msg);
    scrollToBottom();
  });

  socket.on('chat_cleared', (messages) => {
    chatMessagesEl.innerHTML = '';
    renderedMessageIds.clear();
    messages.forEach(msg => appendMessage(msg));
  });

  socket.on('ai_typing', ({ isTyping }) => {
    if (isTyping) {
      aiTypingIndicatorEl.classList.remove('hidden');
      scrollToBottom();
    } else {
      aiTypingIndicatorEl.classList.add('hidden');
    }
  });

  socket.on('notes_updated', ({ notes, updatedBy, updatedAt, summary }) => {
    updateNotesContent(notes, updatedBy, updatedAt);

    if (updatedBy && updatedBy.includes('Naya')) {
      playChime();
      notesPanelEl.classList.add('just-updated');
      setTimeout(() => notesPanelEl.classList.remove('just-updated'), 1500);

      if (summary) {
        alertSummaryTextEl.textContent = summary;
        notesAlertBannerEl.classList.remove('hidden');
        setTimeout(() => {
          notesAlertBannerEl.classList.add('hidden');
        }, 7000);
      }
    }
  });

  socket.on('room_created', () => {
    loadRooms();
  });

  socket.on('room_deleted', (deletedId) => {
    if (currentRoomId === deletedId) {
      clearCurrentRoomState();
      switchView('home');
      showToast('⚠️ Room yang sedang dibuka telah dihapus beserta catatannya.', 'info');
    }
    loadRooms();
  });
}

// 4. CHAT HELPERS
function appendMessage(msg) {
  if (msg.id && renderedMessageIds.has(msg.id)) return;
  if (msg.id) renderedMessageIds.add(msg.id);
  if (msg.id && !msg.id.startsWith('temp-')) lastKnownMsgId = msg.id;

  const currentDisplayName = currentUser ? (currentUser.fullName || currentUser.username) : 'Kamu';
  const isMe = msg.sender === currentDisplayName || (currentUser && msg.sender === currentUser.username);
  const isAi = msg.isAi || msg.sender === 'Naya';
  const isSystem = msg.isSystem;

  const row = document.createElement('div');
  row.className = `message-row ${isMe ? 'me' : ''} ${isAi ? 'ai' : ''} ${isSystem ? 'system' : ''}`;

  if (isSystem) {
    row.innerHTML = `<div class="message-bubble">${escapeHtml(msg.text)}</div>`;
    chatMessagesEl.appendChild(row);
    return;
  }

  let avatarClass = 'user-avatar';
  let avatarText = msg.sender ? msg.sender.slice(0, 1).toUpperCase() : 'U';
  if (isAi) {
    avatarClass = 'ai-avatar';
    avatarText = '✨';
  } else if (!isMe) {
    avatarClass = 'friend-avatar';
  }

  const formattedText = formatChatMessage(msg.text);

  row.innerHTML = `
    <div class="avatar ${avatarClass}">${avatarText}</div>
    <div class="message-bubble-wrapper">
      <div class="message-meta">
        <span class="sender-name">${escapeHtml(msg.sender)}</span>
        ${isAi ? '<span class="ai-tag">AI ASISTEN</span>' : ''}
        <span class="timestamp">${msg.timestamp || ''}</span>
      </div>
      <div class="message-bubble">${formattedText}</div>
    </div>
  `;

  chatMessagesEl.appendChild(row);
}

function formatChatMessage(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/@Naya\b/gi, '<span style="color:#a5b4fc; font-weight:700; background:rgba(99,102,241,0.25); padding:1px 5px; border-radius:4px;">@Naya</span>');
  return escaped.replace(/\n/g, '<br>');
}

function scrollToBottom() {
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// 5. NOTES HELPERS, ZOOM & PAN, & FULLSCREEN
function isNotesEmpty(markdown) {
  if (!markdown) return true;
  const trimmed = markdown.trim();
  if (trimmed === '') return true;
  // If only headers or default placeholder
  const cleaned = trimmed
    .replace(/^#+\s+[^\n]*/g, '')
    .replace(/\*Belum ada catatan[^*]*\*/g, '')
    .trim();
  return cleaned === '';
}

function updateNotesContent(notesMarkdown, updatedBy, updatedAt) {
  currentNotesRaw = notesMarkdown || '';
  notesEditorEl.value = currentNotesRaw;

  if (isNotesEmpty(currentNotesRaw)) {
    notesRenderedEl.innerHTML = `
      <div class="empty-notes-card">
        <div class="empty-notes-icon">📝</div>
        <h4>(Tidak ada catatan tersedia saat ini)</h4>
        <p>Belum ada catatan yang tersimpan di room obrolan ini.</p>
        <div class="empty-notes-hint-box">
          <span>💡 <strong>Tips:</strong> Ketik obrolan dan panggil <code>@Naya</code> di chat untuk merangkum atau mencatat otomatis, atau klik tombol <strong>✏️ Edit</strong> di atas untuk menulis langsung.</span>
        </div>
      </div>
    `;
  } else if (window.marked) {
    notesRenderedEl.innerHTML = marked.parse(currentNotesRaw);
  } else {
    notesRenderedEl.innerHTML = `<pre>${escapeHtml(currentNotesRaw)}</pre>`;
  }

  if (updatedBy) {
    notesUpdatedByEl.textContent = `Diperbarui oleh: ${updatedBy}`;
  }
  if (updatedAt) {
    notesUpdatedAtEl.textContent = updatedAt;
  } else {
    notesUpdatedAtEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function setNotesZoom(level) {
  currentZoom = Math.min(Math.max(level, 0.4), 3.0);
  const rounded = Math.round(currentZoom * 100);
  if (zoomLevelDisplayEl) {
    zoomLevelDisplayEl.textContent = `${rounded}%`;
  }
  if (notesZoomContentEl) {
    notesZoomContentEl.style.transform = `scale(${currentZoom})`;
    if (currentZoom > 1) {
      notesZoomContentEl.style.width = `${Math.round(100 * currentZoom)}%`;
    } else {
      notesZoomContentEl.style.width = '100%';
    }
  }
}

function zoomNotesIn() {
  setNotesZoom(currentZoom + 0.15);
}

function zoomNotesOut() {
  setNotesZoom(currentZoom - 0.15);
}

function resetNotesZoom() {
  setNotesZoom(1.0);
  if (notesZoomViewportEl) {
    notesZoomViewportEl.scrollLeft = 0;
    notesZoomViewportEl.scrollTop = 0;
  }
}

function togglePanMode() {
  isPanMode = !isPanMode;
  if (btnTogglePanModeEl) {
    btnTogglePanModeEl.classList.toggle('active', isPanMode);
  }
  if (notesZoomViewportEl) {
    notesZoomViewportEl.classList.toggle('pan-mode', isPanMode);
  }
  if (isPanMode) {
    showToast('🖐️ Mode Geser Aktif: Klik & tarik (drag) mouse atau sentuh layar untuk menggeser catatan bebas.', 'info');
  }
}

function toggleNotesFullscreen() {
  const isNowFullscreen = notesPanelEl.classList.toggle('fullscreen');
  if (isNowFullscreen) {
    fullscreenIconEl.textContent = '🗗';
    fullscreenTextEl.textContent = 'Perkecil';
    resetNotesZoom();
    showToast('⛶ Layar penuh aktif (Menyesuaikan device). Gunakan ➕ / ➖ untuk zoom dan 🖐️ untuk menggeser.', 'info');
  } else {
    fullscreenIconEl.textContent = '⛶';
    fullscreenTextEl.textContent = 'Fullscreen';
    resetNotesZoom();
  }
}

function setupZoomAndPanInteractions() {
  if (!notesZoomViewportEl) return;

  // 1. Mouse Drag Pan
  notesZoomViewportEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'A') return;

    isDraggingViewport = true;
    dragStartX = e.pageX - notesZoomViewportEl.offsetLeft;
    dragStartY = e.pageY - notesZoomViewportEl.offsetTop;
    scrollStartX = notesZoomViewportEl.scrollLeft;
    scrollStartY = notesZoomViewportEl.scrollTop;
    notesZoomViewportEl.classList.add('is-dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingViewport) return;
    e.preventDefault();
    const x = e.pageX - notesZoomViewportEl.offsetLeft;
    const y = e.pageY - notesZoomViewportEl.offsetTop;
    const walkX = (x - dragStartX);
    const walkY = (y - dragStartY);
    notesZoomViewportEl.scrollLeft = scrollStartX - walkX;
    notesZoomViewportEl.scrollTop = scrollStartY - walkY;
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingViewport) {
      isDraggingViewport = false;
      notesZoomViewportEl.classList.remove('is-dragging');
    }
  });

  // 2. Mouse Wheel Zoom with Ctrl or Pan Mode
  notesZoomViewportEl.addEventListener('wheel', (e) => {
    if (e.ctrlKey || isPanMode) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setNotesZoom(currentZoom + delta);
    }
  }, { passive: false });

  // 3. Touch Pinch-to-Zoom & Drag on Mobile/Tablet
  let touchStartDist = 0;
  let initialZoomOnTouch = 1.0;

  notesZoomViewportEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      touchStartDist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      initialZoomOnTouch = currentZoom;
    }
  }, { passive: true });

  notesZoomViewportEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const factor = currentDist / touchStartDist;
      setNotesZoom(initialZoomOnTouch * factor);
    }
  }, { passive: false });

  notesZoomViewportEl.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      touchStartDist = 0;
    }
  }, { passive: true });
}

function closeMobileDrawers() {
  sidebarEl.classList.remove('open');
  notesPanelEl.classList.remove('open');
  drawerBackdropEl.classList.add('hidden');
}

function toggleSidebar() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const willOpen = !sidebarEl.classList.contains('open');
    if (willOpen) {
      closeMobileDrawers();
      sidebarEl.classList.add('open');
      drawerBackdropEl.classList.remove('hidden');
    } else {
      closeMobileDrawers();
    }
  } else {
    appContainerEl.classList.toggle('sidebar-collapsed');
  }
}

function toggleNotesPanel() {
  const isMobile = window.innerWidth <= 1024;
  if (isMobile) {
    const willOpen = !notesPanelEl.classList.contains('open');
    if (willOpen) {
      closeMobileDrawers();
      notesPanelEl.classList.add('open');
      drawerBackdropEl.classList.remove('hidden');
      btnToggleNotesEl.classList.add('active-toggle');
    } else {
      closeMobileDrawers();
      btnToggleNotesEl.classList.remove('active-toggle');
    }
  } else {
    const isCollapsed = notesPanelEl.classList.toggle('collapsed');
    btnToggleNotesEl.classList.toggle('active-toggle', !isCollapsed);
  }
}

function closeNotesPanel() {
  notesPanelEl.classList.add('collapsed');
  notesPanelEl.classList.remove('open');
  notesPanelEl.classList.remove('fullscreen');
  fullscreenIconEl.textContent = '⛶';
  fullscreenTextEl.textContent = 'Fullscreen';
  drawerBackdropEl.classList.add('hidden');
  btnToggleNotesEl.classList.remove('active-toggle');
}

function openCreateRoomModal() {
  newRoomModalEl.classList.remove('hidden');
  newRoomNameEl.value = '';
  newRoomDescEl.value = '';
  newRoomNameEl.focus();
}

// 6. SUPERADMIN TEAM MANAGEMENT
async function openSuperadminModal() {
  superadminModalEl.classList.remove('hidden');
  await loadTeamUsersTable();
}

async function loadTeamUsersTable() {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('❌ Sesi login kedaluwarsa. Silakan login kembali.', 'error');
      return;
    }

    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      showToast('❌ Gagal memuat daftar anggota tim.', 'error');
      return;
    }
    const users = await res.json();
    adminUserTableBodyEl.innerHTML = '';

    users.forEach(u => {
      const tr = document.createElement('tr');
      const isMainAdmin = u.username === 'admin';
      
      tr.innerHTML = `
        <td><strong>${escapeHtml(u.fullName)}</strong></td>
        <td><code>@${escapeHtml(u.username)}</code></td>
        <td><span class="role-badge ${u.role}">${u.role === 'superadmin' ? '👑 Superadmin' : '👤 Member'}</span></td>
        <td class="table-actions">
          <button class="btn-table-action btn-reset-pwd" data-id="${u.id}" data-user="${escapeHtml(u.username)}">🔑 Reset Pass</button>
          ${!isMainAdmin ? `<button class="btn-table-action delete btn-del-user" data-id="${u.id}" data-user="${escapeHtml(u.username)}">🗑️ Hapus</button>` : '<span style="color:#64748b;font-size:11px;">Utama</span>'}
        </td>
      `;

      // Attach delete click
      const delBtn = tr.querySelector('.btn-del-user');
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation();
          promptDeleteUser(u.id, u.username);
        };
      }

      // Attach reset password click
      const resetBtn = tr.querySelector('.btn-reset-pwd');
      if (resetBtn) {
        resetBtn.onclick = async (e) => {
          e.stopPropagation();
          const newPwd = prompt(`Masukkan password baru untuk anggota tim "@${u.username}":`);
          if (newPwd && newPwd.trim().length >= 4) {
            await resetTeamUserPassword(u.id, newPwd.trim(), u.username);
          } else if (newPwd !== null) {
            alert('Password minimal 4 karakter.');
          }
        };
      }

      adminUserTableBodyEl.appendChild(tr);
    });

  } catch (err) {
    console.error('Error loadTeamUsersTable:', err);
    showToast('❌ Gagal memuat daftar tim: ' + err.message, 'error');
  }
}

function promptDeleteUser(userId, userName) {
  pendingDeleteUserId = userId;
  pendingDeleteUserName = userName;
  if (deleteUserModalEl) {
    const descEl = document.getElementById('deleteUserModalDesc');
    if (descEl) {
      descEl.innerHTML = `Apakah kamu yakin ingin menghapus akun anggota tim <strong>@${escapeHtml(userName)}</strong>?<br><br>Akun tersebut tidak akan dapat login lagi ke Naya Workspace.`;
    }
    deleteUserModalEl.classList.remove('hidden');
  } else {
    if (confirm(`Hapus akun anggota tim "@${userName}"?`)) {
      deleteTeamUser(userId, userName);
    }
  }
}

async function confirmDeleteUserAction() {
  if (deleteUserModalEl) deleteUserModalEl.classList.add('hidden');
  if (!pendingDeleteUserId) return;
  const userId = pendingDeleteUserId;
  const userName = pendingDeleteUserName;
  pendingDeleteUserId = null;
  pendingDeleteUserName = null;
  await deleteTeamUser(userId, userName);
}

async function deleteTeamUser(userId, userName) {
  const token = getAuthToken();
  if (!token) {
    showToast('❌ Sesi login kedaluwarsa. Silakan login kembali.', 'error');
    return;
  }
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ Akun @${userName || 'anggota'} berhasil dihapus!`, 'success');
      await loadTeamUsersTable();
      loadTeamCount();
    } else {
      showToast('❌ ' + (data.error || 'Gagal menghapus anggota tim.'), 'error');
    }
  } catch (err) {
    showToast('❌ Kesalahan jaringan: ' + err.message, 'error');
  }
}

async function resetTeamUserPassword(userId, newPassword, userName) {
  const token = getAuthToken();
  if (!token) {
    showToast('❌ Sesi login kedaluwarsa. Silakan login kembali.', 'error');
    return;
  }
  try {
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ Password @${userName || 'anggota'} berhasil diperbarui!`, 'success');
    } else {
      showToast('❌ ' + (data.error || 'Gagal reset password.'), 'error');
    }
  } catch (err) {
    showToast('❌ Kesalahan: ' + err.message, 'error');
  }
}

// 7. EVENT LISTENERS
function setupEventListeners() {
  // Login Form Submission
  loginFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsernameEl.value.trim();
    const password = loginPasswordEl.value;
    loginErrorEl.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('naya_auth_token', authToken);
        onLoginSuccess();
      } else {
        loginErrorEl.classList.remove('hidden');
        loginErrorEl.textContent = '❌ ' + (data.error || 'Login gagal.');
      }
    } catch (err) {
      loginErrorEl.classList.remove('hidden');
      loginErrorEl.textContent = '❌ Koneksi server gagal: ' + err.message;
    }
  });

  // Logout Trigger (Custom Modal)
  btnLogoutEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (logoutModalEl) {
      logoutModalEl.classList.remove('hidden');
    } else {
      logout();
    }
  });

  if (btnCloseLogoutModalEl) {
    btnCloseLogoutModalEl.addEventListener('click', () => logoutModalEl.classList.add('hidden'));
  }
  if (btnCancelLogoutModalEl) {
    btnCancelLogoutModalEl.addEventListener('click', () => logoutModalEl.classList.add('hidden'));
  }
  if (btnConfirmLogoutEl) {
    btnConfirmLogoutEl.addEventListener('click', () => {
      logoutModalEl.classList.add('hidden');
      logout();
    });
  }

  // Zoom & Pan Toolbar Controls
  if (btnZoomInEl) btnZoomInEl.addEventListener('click', zoomNotesIn);
  if (btnZoomOutEl) btnZoomOutEl.addEventListener('click', zoomNotesOut);
  if (btnResetZoomEl) btnResetZoomEl.addEventListener('click', resetNotesZoom);
  if (zoomLevelDisplayEl) zoomLevelDisplayEl.addEventListener('click', resetNotesZoom);
  if (btnTogglePanModeEl) btnTogglePanModeEl.addEventListener('click', togglePanMode);

  // Navigation / Home switching
  btnNavHomeEl.addEventListener('click', () => switchView('home'));
  btnBackToHomeEl.addEventListener('click', () => switchView('home'));

  // Superadmin Modal Open
  btnNavSuperadminEl.addEventListener('click', openSuperadminModal);
  btnCloseSuperadminModalEl.addEventListener('click', () => superadminModalEl.classList.add('hidden'));

  // Create Team User Form (Superadmin)
  createTeamUserFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = newTeamUsernameEl.value.trim();
    const fullName = newTeamFullNameEl.value.trim();
    const password = newTeamPasswordEl.value.trim();
    const role = newTeamRoleEl.value;

    const token = getAuthToken();
    if (!token) {
      showToast('❌ Sesi login kedaluwarsa. Silakan login kembali.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, fullName, password, role })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ Akun @${username} berhasil didaftarkan!`, 'success');
        newTeamUsernameEl.value = '';
        newTeamFullNameEl.value = '';
        newTeamPasswordEl.value = '';
        await loadTeamUsersTable();
        loadTeamCount();
      } else {
        showToast('❌ ' + (data.error || 'Gagal membuat akun.'), 'error');
      }
    } catch (err) {
      showToast('❌ Kesalahan jaringan: ' + err.message, 'error');
    }
  });

  // Sidebar Toggles
  btnToggleSidebarEl.addEventListener('click', toggleSidebar);
  btnToggleSidebarHomeEl.addEventListener('click', toggleSidebar);
  btnCloseSidebarEl.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      closeMobileDrawers();
    } else {
      appContainerEl.classList.add('sidebar-collapsed');
    }
  });

  // Notes Panel Toggles
  btnToggleNotesEl.addEventListener('click', toggleNotesPanel);
  btnCloseNotesEl.addEventListener('click', closeNotesPanel);
  btnFullscreenNotesEl.addEventListener('click', toggleNotesFullscreen);

  // Drawer Backdrop click
  drawerBackdropEl.addEventListener('click', closeMobileDrawers);

  // REST & POLLING HELPERS (FOR CPANEL PHP COMPATIBILITY)
  async function sendChatMessageViaRest(roomId, sender, text) {
    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      id: tempId,
      sender: sender,
      text: text,
      isAi: false,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };
    appendMessage(optimisticMsg);
    scrollToBottom();

    const lower = text.toLowerCase();
    const isAi = lower.includes('@naya') || lower.startsWith('/catat') || text.includes('docs.google.com/spreadsheets');
    if (isAi && aiTypingIndicatorEl) {
      aiTypingIndicatorEl.classList.remove('hidden');
      scrollToBottom();
    }

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sender, text })
      });

      if (aiTypingIndicatorEl) aiTypingIndicatorEl.classList.add('hidden');

      if (!res.ok) {
        const errData = await res.json();
        showToast('❌ ' + (errData.error || 'Gagal mengirim pesan.'), 'error');
        return;
      }

      const data = await res.json();
      if (data.userMessage && data.userMessage.id) {
        renderedMessageIds.add(data.userMessage.id);
        lastKnownMsgId = data.userMessage.id;
      }
      if (data.aiMessage) {
        appendMessage(data.aiMessage);
        scrollToBottom();
      }
      if (data.revisedNotes) {
        playChime();
        updateNotesContent(data.revisedNotes, 'Naya AI', new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
        notesPanelEl.classList.add('just-updated');
        setTimeout(() => notesPanelEl.classList.remove('just-updated'), 1500);
      }
    } catch (err) {
      if (aiTypingIndicatorEl) aiTypingIndicatorEl.classList.add('hidden');
      showToast('❌ Kesalahan jaringan: ' + err.message, 'error');
    }
  }

  async function pollRoomUpdates() {
    if (!currentRoomId || currentView !== 'chat') return;
    try {
      const token = getAuthToken();
      if (!token) return;
      const url = `/api/rooms/${currentRoomId}/poll${lastKnownMsgId ? `?since=${encodeURIComponent(lastKnownMsgId)}` : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        let hasNew = false;
        data.messages.forEach(msg => {
          if (!renderedMessageIds.has(msg.id)) {
            appendMessage(msg);
            hasNew = true;
          }
        });
        if (hasNew) scrollToBottom();
      }
      if (typeof data.notes === 'string' && data.notes !== currentNotesRaw) {
        if (!isEditingNotes) {
          updateNotesContent(data.notes, 'Sistem');
        }
      }
    } catch (err) {
      // Silently continue polling
    }
  }

  // Chat Submit
  chatFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInputEl.value.trim();
    if (!text || !currentRoomId) return;

    const sender = currentUser ? (currentUser.fullName || currentUser.username) : 'User';
    messageInputEl.value = '';
    messageInputEl.focus();

    if (socket && socket.connected) {
      socket.emit('send_message', {
        roomId: currentRoomId,
        sender: sender,
        text: text
      });
    } else {
      await sendChatMessageViaRest(currentRoomId, sender, text);
    }
  });

  // Shortcut @Naya button
  btnMentionNayaEl.addEventListener('click', () => {
    if (!messageInputEl.value.includes('@Naya')) {
      messageInputEl.value = '@Naya ' + messageInputEl.value;
    }
    messageInputEl.focus();
  });

  // Suggestion Pills
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      messageInputEl.value = btn.dataset.text;
      messageInputEl.focus();
    });
  });

  // Clear Chat Button (Opens Double-Action PIN Modal)
  btnClearChatEl.addEventListener('click', () => {
    if (!currentRoomId) return;
    clearChatPinEl.value = '';
    pinErrorMsgEl.classList.add('hidden');
    clearChatModalEl.classList.remove('hidden');
    clearChatPinEl.focus();
  });

  btnCloseClearModalEl.addEventListener('click', () => {
    clearChatModalEl.classList.add('hidden');
  });

  btnCancelClearModalEl.addEventListener('click', () => {
    clearChatModalEl.classList.add('hidden');
  });

  // Header Delete Current Room Button
  if (btnDeleteCurrentRoomEl) {
    btnDeleteCurrentRoomEl.addEventListener('click', () => {
      if (!currentRoomId) return;
      const roomName = currentRoomNameEl.textContent || 'Room ini';
      promptDeleteRoom(currentRoomId, roomName);
    });
  }

  // Delete Room Modal Listeners
  if (btnCloseDeleteRoomModalEl) {
    btnCloseDeleteRoomModalEl.addEventListener('click', () => {
      deleteRoomModalEl.classList.add('hidden');
      pendingDeleteRoomId = null;
      pendingDeleteRoomName = null;
    });
  }
  if (btnCancelDeleteRoomModalEl) {
    btnCancelDeleteRoomModalEl.addEventListener('click', () => {
      deleteRoomModalEl.classList.add('hidden');
      pendingDeleteRoomId = null;
      pendingDeleteRoomName = null;
    });
  }
  if (btnConfirmDeleteRoomEl) {
    btnConfirmDeleteRoomEl.addEventListener('click', confirmDeleteRoomAction);
  }

  // Delete User Modal Listeners
  if (btnCloseDeleteUserModalEl) {
    btnCloseDeleteUserModalEl.addEventListener('click', () => {
      deleteUserModalEl.classList.add('hidden');
      pendingDeleteUserId = null;
      pendingDeleteUserName = null;
    });
  }
  if (btnCancelDeleteUserModalEl) {
    btnCancelDeleteUserModalEl.addEventListener('click', () => {
      deleteUserModalEl.classList.add('hidden');
      pendingDeleteUserId = null;
      pendingDeleteUserName = null;
    });
  }
  if (btnConfirmDeleteUserEl) {
    btnConfirmDeleteUserEl.addEventListener('click', confirmDeleteUserAction);
  }

  // PIN Form Submission
  clearChatFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputPin = clearChatPinEl.value.trim();

    if (inputPin === REQUIRED_PIN) {
      if (socket && socket.connected) {
        socket.emit('clear_chat', { roomId: currentRoomId });
      } else {
        try {
          const res = await fetch(`/api/rooms/${currentRoomId}/clear`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ pin: REQUIRED_PIN })
          });
          if (res.ok) {
            const data = await res.json();
            chatMessagesEl.innerHTML = '';
            renderedMessageIds.clear();
            (data.messages || []).forEach(msg => appendMessage(msg));
            showToast('🧹 Riwayat chat berhasil dibersihkan.', 'success');
          }
        } catch (err) {
          showToast('❌ Gagal membersihkan chat: ' + err.message, 'error');
        }
      }
      clearChatModalEl.classList.add('hidden');
      clearChatPinEl.value = '';
      playChime();
    } else {
      pinErrorMsgEl.classList.remove('hidden');
      const card = clearChatModalEl.querySelector('.modal-card');
      card.classList.add('shake-anim');
      setTimeout(() => card.classList.remove('shake-anim'), 500);
      clearChatPinEl.value = '';
      clearChatPinEl.focus();
    }
  });

  // Notes Manual Edit Toggle
  btnToggleEditNoteEl.addEventListener('click', async () => {
    isEditingNotes = !isEditingNotes;
    if (isEditingNotes) {
      notesRenderedEl.classList.add('hidden');
      notesEditorEl.classList.remove('hidden');
      notesEditorEl.value = currentNotesRaw;
      notesEditorEl.focus();
      editBtnIconEl.textContent = '💾';
      editBtnTextEl.textContent = 'Simpan';
    } else {
      const updatedNotes = notesEditorEl.value;
      const editorName = currentUser ? (currentUser.fullName || currentUser.username) : 'User';
      updateNotesContent(updatedNotes, editorName);
      
      if (socket && socket.connected) {
        socket.emit('manual_update_notes', {
          roomId: currentRoomId,
          notes: updatedNotes,
          updatedBy: editorName
        });
      } else {
        try {
          await fetch(`/api/rooms/${currentRoomId}/notes`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ notes: updatedNotes })
          });
        } catch (err) {
          console.error('Error saving notes:', err);
        }
      }
      notesRenderedEl.classList.remove('hidden');
      notesEditorEl.classList.add('hidden');
      editBtnIconEl.textContent = '✏️';
      editBtnTextEl.textContent = 'Edit';
    }
  });

  // Copy Notes
  btnCopyNoteEl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentNotesRaw);
      btnCopyNoteEl.textContent = '✅ Tersalin!';
      setTimeout(() => {
        btnCopyNoteEl.textContent = '📋 Salin';
      }, 2000);
    } catch (err) {
      alert('Gagal menyalin catatan: ' + err.message);
    }
  });

  // Modal: Create New Room Buttons
  btnOpenNewRoomModalEl.addEventListener('click', openCreateRoomModal);
  btnOpenModalFromHomeEl.addEventListener('click', openCreateRoomModal);
  btnCreateRoomFromGridEl.addEventListener('click', openCreateRoomModal);

  btnCloseModalEl.addEventListener('click', () => newRoomModalEl.classList.add('hidden'));
  btnCancelModalEl.addEventListener('click', () => newRoomModalEl.classList.add('hidden'));

  newRoomFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newRoomNameEl.value.trim();
    const description = newRoomDescEl.value.trim();
    if (!name) return;

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      const created = await res.json();
      newRoomModalEl.classList.add('hidden');
      await loadRooms();
      openRoom(created.id);
    } catch (err) {
      alert('Gagal membuat room: ' + err.message);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start app
init();
