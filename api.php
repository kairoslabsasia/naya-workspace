<?php
/**
 * Naya Workspace - Standalone PHP Backend
 * 100% Compatible with cPanel Shared Hosting (No Node.js Required)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 1. CONFIGURATION (Loads from .env file securely)
$envPath = __DIR__ . '/.env';
$envVars = file_exists($envPath) ? @parse_ini_file($envPath) : [];

$JWT_SECRET = $envVars['JWT_SECRET'] ?? getenv('JWT_SECRET') ?: 'naya-workspace-super-secret-key-2026';
$GEMINI_API_KEY = $envVars['GEMINI_API_KEY'] ?? getenv('GEMINI_API_KEY') ?: '';
if (empty($GEMINI_API_KEY) && file_exists($envPath)) {
    $envContent = file_get_contents($envPath);
    if (preg_match('/GEMINI_API_KEY\s*=\s*([^\r\n]+)/', $envContent, $m)) {
        $GEMINI_API_KEY = trim($m[1], " \t\n\r\0\x0B\"'");
    }
}
$AI_NAME = $envVars['AI_NAME'] ?? getenv('AI_NAME') ?: 'Naya';
$DB_FILE = __DIR__ . '/data/db.json';

// Helper: Base64URL
function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data) {
    return base64_decode(str_pad(strtr($data, '-_', '+/'), strlen($data) % 4, '=', STR_PAD_RIGHT));
}

// Helper: JWT
function createJWT($user, $secret) {
    $header = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64url_encode(json_encode([
        'id' => $user['id'],
        'username' => $user['username'],
        'fullName' => $user['fullName'],
        'role' => $user['role'],
        'exp' => time() + (86400 * 7)
    ]));
    $sig = base64url_encode(hash_hmac('sha256', "$header.$payload", $secret, true));
    return "$header.$payload.$sig";
}

function verifyJWT($token, $secret) {
    if (!$token) return null;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;
    $expectedSig = base64url_encode(hash_hmac('sha256', "$header.$payload", $secret, true));
    if (!hash_equals($expectedSig, $sig)) return null;
    $data = json_decode(base64url_decode($payload), true);
    if (!$data || !isset($data['exp']) || $data['exp'] < time()) return null;
    return $data;
}

function getAuthUser($secret) {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (empty($authHeader) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (strpos($authHeader, 'Bearer ') !== 0) {
        return null;
    }
    $token = substr($authHeader, 7);
    return verifyJWT($token, $secret);
}

// Helper: DB
function loadDB($file) {
    if (!file_exists($file)) {
        return ['rooms' => [], 'notes' => [], 'messages' => [], 'spreadsheets' => [], 'users' => []];
    }
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : ['rooms' => [], 'notes' => [], 'messages' => [], 'spreadsheets' => [], 'users' => []];
}

function saveDB($file, $data) {
    $dir = dirname($file);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

// 2. PARSE REQUEST ROUTE
$route = $_GET['endpoint'] ?? '';
if (empty($route)) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir !== '/' && strpos($uri, $scriptDir) === 0) {
        $uri = substr($uri, strlen($scriptDir));
    }
    $uri = ltrim($uri, '/');
    if (strpos($uri, 'api/') === 0) {
        $route = substr($uri, 4);
    }
}
$route = trim($route, '/');
$method = $_SERVER['REQUEST_METHOD'];
$inputJSON = file_get_contents('php://input');
$body = json_decode($inputJSON, true) ?? [];

$db = loadDB($DB_FILE);

// ==========================================
// ROUTE HANDLERS
// ==========================================

// 1. AUTH: LOGIN
if ($route === 'auth/login' && $method === 'POST') {
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Username dan password wajib diisi.']);
        exit;
    }

    $foundUser = null;
    foreach ($db['users'] as $u) {
        if (strtolower($u['username']) === strtolower($username)) {
            $foundUser = $u;
            break;
        }
    }

    if (!$foundUser) {
        http_response_code(401);
        echo json_encode(['error' => 'Username atau password salah.']);
        exit;
    }

    $hash = str_replace('$2b$', '$2y$', $foundUser['passwordHash']);
    if (!password_verify($password, $hash)) {
        http_response_code(401);
        echo json_encode(['error' => 'Username atau password salah.']);
        exit;
    }

    $token = createJWT($foundUser, $JWT_SECRET);
    echo json_encode([
        'token' => $token,
        'user' => [
            'id' => $foundUser['id'],
            'username' => $foundUser['username'],
            'fullName' => $foundUser['fullName'],
            'role' => $foundUser['role']
        ]
    ]);
    exit;
}

// 2. AUTH: ME
if ($route === 'auth/me' && $method === 'GET') {
    $user = getAuthUser($JWT_SECRET);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Sesi tidak valid atau telah kedaluwarsa.']);
        exit;
    }
    echo json_encode(['user' => $user]);
    exit;
}

// Require Auth for subsequent endpoints
$user = getAuthUser($JWT_SECRET);
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Akses ditolak. Silakan login terlebih dahulu.']);
    exit;
}

// 3. ADMIN: GET USERS
if ($route === 'admin/users' && $method === 'GET') {
    if ($user['role'] !== 'superadmin') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya superadmin yang memiliki akses.']);
        exit;
    }
    $safeUsers = array_map(function($u) {
        return [
            'id' => $u['id'],
            'username' => $u['username'],
            'fullName' => $u['fullName'],
            'role' => $u['role'],
            'createdAt' => $u['createdAt']
        ];
    }, $db['users']);
    echo json_encode($safeUsers);
    exit;
}

// 4. ADMIN: CREATE USER
if ($route === 'admin/users' && $method === 'POST') {
    if ($user['role'] !== 'superadmin') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya superadmin yang memiliki akses.']);
        exit;
    }
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $fullName = trim($body['fullName'] ?? '');
    $role = $body['role'] ?? 'member';

    if (!$username || !$password || !$fullName) {
        http_response_code(400);
        echo json_encode(['error' => 'Semua kolom wajib diisi.']);
        exit;
    }

    foreach ($db['users'] as $u) {
        if (strtolower($u['username']) === strtolower($username)) {
            http_response_code(400);
            echo json_encode(['error' => 'Username sudah digunakan. Silakan pilih username lain.']);
            exit;
        }
    }

    $newUser = [
        'id' => 'usr-' . substr(md5(uniqid(rand(), true)), 0, 8),
        'username' => $username,
        'fullName' => $fullName,
        'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
        'role' => in_array($role, ['superadmin', 'member']) ? $role : 'member',
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z')
    ];
    $db['users'][] = $newUser;
    saveDB($DB_FILE, $db);

    unset($newUser['passwordHash']);
    echo json_encode($newUser);
    exit;
}

// 5. ADMIN: DELETE USER
if (preg_match('/^admin\/users\/([a-zA-Z0-9-_]+)$/', $route, $m) && $method === 'DELETE') {
    if ($user['role'] !== 'superadmin') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya superadmin yang memiliki akses.']);
        exit;
    }
    $targetId = $m[1];
    $found = false;
    $filtered = [];
    foreach ($db['users'] as $u) {
        if ($u['id'] === $targetId) {
            if ($u['role'] === 'superadmin' && $u['id'] === $user['id']) {
                http_response_code(400);
                echo json_encode(['error' => 'Tidak dapat menghapus akun Superadmin Anda sendiri.']);
                exit;
            }
            $found = true;
        } else {
            $filtered[] = $u;
        }
    }

    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'User tidak ditemukan.']);
        exit;
    }

    $db['users'] = $filtered;
    saveDB($DB_FILE, $db);
    echo json_encode(['success' => true]);
    exit;
}

// 6. ADMIN: RESET PASSWORD
if (preg_match('/^admin\/users\/([a-zA-Z0-9-_]+)\/reset-password$/', $route, $m) && $method === 'POST') {
    if ($user['role'] !== 'superadmin') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya superadmin yang memiliki akses.']);
        exit;
    }
    $targetId = $m[1];
    $newPassword = $body['newPassword'] ?? '';
    if (strlen($newPassword) < 6) {
        http_response_code(400);
        echo json_encode(['error' => 'Password minimal 6 karakter.']);
        exit;
    }

    $found = false;
    foreach ($db['users'] as &$u) {
        if ($u['id'] === $targetId) {
            $u['passwordHash'] = password_hash($newPassword, PASSWORD_BCRYPT);
            $found = true;
            break;
        }
    }

    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'User tidak ditemukan.']);
        exit;
    }

    saveDB($DB_FILE, $db);
    echo json_encode(['success' => true]);
    exit;
}

// 7. ROOMS: GET LIST
if ($route === 'rooms' && $method === 'GET') {
    echo json_encode($db['rooms']);
    exit;
}

// 8. ROOMS: CREATE ROOM
if ($route === 'rooms' && $method === 'POST') {
    $name = trim($body['name'] ?? '');
    $description = trim($body['description'] ?? '');
    if (!$name) {
        http_response_code(400);
        echo json_encode(['error' => 'Nama room wajib diisi.']);
        exit;
    }

    $id = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $name)) . '-' . substr(md5(uniqid(rand(), true)), 0, 6);
    $newRoom = [
        'id' => $id,
        'name' => $name,
        'description' => $description,
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z')
    ];

    $db['rooms'][] = $newRoom;
    $db['notes'][$id] = '';
    $db['messages'][$id] = [
        [
            'id' => 'msg-' . round(microtime(true) * 1000),
            'sender' => $AI_NAME,
            'text' => "Halo! Ruangan \"{$name}\" telah siap. Panggil @{$AI_NAME} jika butuh bantuan mencatat ide atau merevisi rencana bersama!",
            'isAi' => true,
            'timestamp' => date('H.i')
        ]
    ];
    saveDB($DB_FILE, $db);

    echo json_encode($newRoom);
    exit;
}

// 9. ROOMS: GET SINGLE ROOM DETAILS
if (preg_match('/^rooms\/([a-zA-Z0-9-_]+)$/', $route, $m) && $method === 'GET') {
    $roomId = $m[1];
    $room = null;
    foreach ($db['rooms'] as $r) {
        if ($r['id'] === $roomId) {
            $room = $r;
            break;
        }
    }
    if (!$room) {
        http_response_code(404);
        echo json_encode(['error' => 'Room tidak ditemukan.']);
        exit;
    }

    echo json_encode([
        'room' => $room,
        'notes' => $db['notes'][$roomId] ?? '',
        'messages' => $db['messages'][$roomId] ?? [],
        'spreadsheet' => $db['spreadsheets'][$roomId] ?? null
    ]);
    exit;
}

// 10. ROOMS: DELETE ROOM
if (preg_match('/^rooms\/([a-zA-Z0-9-_]+)$/', $route, $m) && $method === 'DELETE') {
    $roomId = $m[1];
    $db['rooms'] = array_values(array_filter($db['rooms'], fn($r) => $r['id'] !== $roomId));
    unset($db['notes'][$roomId]);
    unset($db['messages'][$roomId]);
    unset($db['spreadsheets'][$roomId]);
    saveDB($DB_FILE, $db);
    echo json_encode(['success' => true]);
    exit;
}

// 11. ROOMS: CLEAR CHAT (WITH PIN 082002)
if (preg_match('/^rooms\/([a-zA-Z0-9-_]+)\/clear$/', $route, $m) && $method === 'POST') {
    $roomId = $m[1];
    $pin = $body['pin'] ?? '';
    if ($pin !== '082002') {
        http_response_code(403);
        echo json_encode(['error' => 'PIN keamanan salah! Harap masukkan PIN yang benar.']);
        exit;
    }

    $db['messages'][$roomId] = [
        [
            'id' => 'msg-' . round(microtime(true) * 1000),
            'sender' => $AI_NAME,
            'text' => 'Riwayat chat telah dibersihkan. Catatan penting di samping tetap aman terjaga. Ada yang ingin kita diskusikan selanjutnya?',
            'isAi' => true,
            'timestamp' => date('H.i')
        ]
    ];
    saveDB($DB_FILE, $db);
    echo json_encode(['success' => true, 'messages' => $db['messages'][$roomId]]);
    exit;
}

// 12. ROOMS: UPDATE NOTES
if (preg_match('/^rooms\/([a-zA-Z0-9-_]+)\/notes$/', $route, $m) && $method === 'PUT') {
    $roomId = $m[1];
    $newNotes = $body['notes'] ?? '';
    $db['notes'][$roomId] = $newNotes;
    saveDB($DB_FILE, $db);
    echo json_encode(['success' => true, 'notes' => $newNotes]);
    exit;
}

// 13. ROOMS: POLL FOR UPDATES
if (preg_match('/^rooms\/([a-zA-Z0-9-_]+)\/poll$/', $route, $m) && $method === 'GET') {
    $roomId = $m[1];
    $lastMsgId = $_GET['since'] ?? '';
    $allMsgs = $db['messages'][$roomId] ?? [];

    $newMsgs = [];
    $found = false;
    if (empty($lastMsgId)) {
        $newMsgs = $allMsgs;
    } else {
        foreach ($allMsgs as $msg) {
            if ($found) {
                $newMsgs[] = $msg;
            } else if ($msg['id'] === $lastMsgId) {
                $found = true;
            }
        }
        if (!$found) {
            $newMsgs = $allMsgs;
        }
    }

    echo json_encode([
        'messages' => $newMsgs,
        'notes' => $db['notes'][$roomId] ?? ''
    ]);
    exit;
}

// 14. ROOMS: SEND MESSAGE & TRIGGER AI
if (preg_match('/^rooms\/([a-zA-Z0-9-_]+)\/messages$/', $route, $m) && $method === 'POST') {
    $roomId = $m[1];
    $text = trim($body['text'] ?? '');
    $sender = $body['sender'] ?? ($user['fullName'] ?? 'Pengguna');
    if (!$text) {
        http_response_code(400);
        echo json_encode(['error' => 'Pesan tidak boleh kosong.']);
        exit;
    }

    // A. Save User Message
    $userMsg = [
        'id' => 'msg-' . round(microtime(true) * 1000) . '-' . substr(md5(rand()), 0, 4),
        'sender' => $sender,
        'text' => $text,
        'isAi' => false,
        'timestamp' => date('H.i')
    ];
    $db['messages'][$roomId][] = $userMsg;

    // Check if triggers AI: @naya, /catat, spreadsheet link
    $lower = strtolower($text);
    $isAiTrigger = (strpos($lower, '@' . strtolower($AI_NAME)) !== false) ||
                   (strpos($lower, '/catat') === 0) ||
                   (preg_match('/https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/i', $text));

    $aiMsg = null;
    $revisedNotes = null;

    if ($isAiTrigger) {
        // Find Room
        $currentRoom = null;
        foreach ($db['rooms'] as $r) {
            if ($r['id'] === $roomId) {
                $currentRoom = $r;
                break;
            }
        }

        // Check for Google Sheet URL
        if (preg_match('/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)(?:[^\s]*)/i', $text, $sMatch)) {
            $sheetId = $sMatch[1];
            $sheetData = fetchGoogleSheetInPHP($sheetId, $sMatch[0]);
            $db['spreadsheets'][$roomId] = $sheetData;
        }

        $activeSpreadsheet = $db['spreadsheets'][$roomId] ?? null;
        $currentNotes = $db['notes'][$roomId] ?? '';
        $recentMessages = array_slice($db['messages'][$roomId], -10);

        // Call Gemini
        $aiResult = askNayaInPHP([
            'apiKey' => $GEMINI_API_KEY,
            'aiName' => $AI_NAME,
            'room' => $currentRoom ?? ['name' => 'Diskusi', 'description' => ''],
            'currentNotes' => $currentNotes,
            'recentMessages' => $recentMessages,
            'userMessage' => $text,
            'senderName' => $sender,
            'spreadsheetData' => $activeSpreadsheet
        ]);

        $aiMsg = [
            'id' => 'msg-' . (round(microtime(true) * 1000) + 10) . '-' . substr(md5(rand()), 0, 4),
            'sender' => $AI_NAME,
            'text' => $aiResult['reply'],
            'isAi' => true,
            'timestamp' => date('H.i')
        ];
        $db['messages'][$roomId][] = $aiMsg;

        if (!empty($aiResult['revisedNotes'])) {
            $db['notes'][$roomId] = $aiResult['revisedNotes'];
            $revisedNotes = $aiResult['revisedNotes'];
        }
    }

    saveDB($DB_FILE, $db);

    echo json_encode([
        'userMessage' => $userMsg,
        'aiMessage' => $aiMsg,
        'revisedNotes' => $revisedNotes
    ]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Endpoint tidak ditemukan.']);
exit;


// ==========================================
// GOOGLE SHEETS & GEMINI AI HELPERS IN PHP
// ==========================================

function fetchGoogleSheetInPHP($sheetId, $fullUrl) {
    $editUrl = "https://docs.google.com/spreadsheets/d/{$sheetId}/edit";
    $ch = curl_init($editUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || empty($html)) {
        return ['success' => false, 'error' => 'Gagal mengakses spreadsheet. Pastikan izin berbagi disetel ke "Anyone with the link can view".'];
    }

    $tabs = [];
    $visitedGids = [];

    // Pattern 1: JSON bootstrap array
    if (preg_match_all('/\[[0-9]+,[0-9]+,\\?"([0-9]+)\\?",\[\{\\?"1\\?":\[\[[0-9]+,[0-9]+,\\?"([^"\\\\]+)\\?"/i', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            $gid = $m[1];
            $name = $m[2];
            if (!in_array($gid, $visitedGids)) {
                $visitedGids[] = $gid;
                $tabs[] = ['gid' => $gid, 'name' => $name];
            }
        }
    }

    if (empty($tabs)) {
        $tabs[] = ['gid' => '0', 'name' => 'Sheet1'];
    }

    $combined = "=== DOKUMEN SPREADSHEET ONLINE: TERDETEKSI " . count($tabs) . " SHEET/TAB ===\n\n";
    $sheetNames = [];

    foreach ($tabs as $idx => $t) {
        $sheetNames[] = $t['name'];
        $csvUrl = "https://docs.google.com/spreadsheets/d/{$sheetId}/export?format=csv&gid={$t['gid']}";
        $chCsv = curl_init($csvUrl);
        curl_setopt($chCsv, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chCsv, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($chCsv, CURLOPT_TIMEOUT, 10);
        curl_setopt($chCsv, CURLOPT_USERAGENT, 'Mozilla/5.0');
        $csv = curl_exec($chCsv);
        curl_close($chCsv);

        $combined .= "############################################################\n";
        $combined .= "### SHEET [" . ($idx + 1) . "/" . count($tabs) . "]: \"{$t['name']}\" (GID: {$t['gid']})\n";
        $combined .= "############################################################\n";
        $combined .= ($csv ? $csv : "(Sheet kosong)") . "\n\n";
    }

    return [
        'success' => true,
        'isMultiSheet' => count($tabs) > 1,
        'sheetCount' => count($tabs),
        'sheetNames' => $sheetNames,
        'data' => $combined,
        'url' => $fullUrl
    ];
}

function askNayaInPHP($params) {
    $apiKey = $params['apiKey'];
    $room = $params['room'];
    $currentNotes = $params['currentNotes'];
    $recentMessages = $params['recentMessages'];
    $userMessage = $params['userMessage'];
    $senderName = $params['senderName'];
    $spreadsheetData = $params['spreadsheetData'];

    $historyLines = [];
    foreach ($recentMessages as $m) {
        $historyLines[] = "[{$m['sender']}]: {$m['text']}";
    }
    $historyText = implode("\n", $historyLines);

    $sheetContextPrompt = '';
    if ($spreadsheetData && !empty($spreadsheetData['success'])) {
        $dataSnippet = substr($spreadsheetData['data'], 0, 75000);
        $sheetContextPrompt = "
---
[DATA LENGKAP DARI SELURUH SHEET/TAB GOOGLE SPREADSHEET ONLINE]:
{$dataSnippet}
---
PANDUAN KHUSUS MEMBACA SPREADSHEET:
1. Analisislah seluruh sheet/tab di atas secara komprehensif.
2. Jika ditanya data tenant/UMKM, kategorikan secara jelas (Fix Ikut, Tidak Bisa, Belum Menjawab, dsb).
3. Buatkan tabel Markdown yang terstruktur di revisedNotes jika diperlukan.
";
    }

    $prompt = "
Kamu adalah Naya, asisten tim AI yang cerdas, teliti, ramah, dan cekatan.
Ruang diskusi: \"{$room['name']}\".
Deskripsi: \"{$room['description']}\".

TUGAS UTAMA:
1. Jawab pertanyaan pengguna ({$senderName}) secara ramah, teliti, dan solutif.
2. Jika ada spreadsheet, gunakan data akurat dari spreadsheet tersebut.
3. JIKA pengguna meminta merangkum, mencatat, mengedit, atau merevisi catatan:
   Tuliskan seluruh isi catatan terbaru di kolom 'revisedNotes'.
4. JIKA pengguna TIDAK meminta mencatat apapun, isi 'revisedNotes' dengan null.

FORMAT OUTPUT WAJIB JSON MURNI:
{
  \"reply\": \"Pesan jawaban balasan kamu di chat...\",
  \"revisedNotes\": \"Dokumen Markdown catatan lengkap (atau null)...\"
}

---
CATATAN ROOM TERKINI SAAT INI:
\"\"\"
" . ($currentNotes ?: "(Catatan saat ini masih kosong)") . "
\"\"\"
{$sheetContextPrompt}
RIWAYAT OBROLAN TERAKHIR:
{$historyText}
---
PESAN BARU DARI {$senderName}:
\"{$userMessage}\"
";

    $models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
    foreach ($models as $m) {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$m}:generateContent?key=" . $apiKey;
        $body = [
            'contents' => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => ['temperature' => 0.3]
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 200 && $res) {
            $json = json_decode($res, true);
            $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
            if ($text) {
                $cleaned = trim($text);
                if (strpos($cleaned, '```') === 0) {
                    $cleaned = preg_replace('/^```(?:json)?\s*/i', '', $cleaned);
                    $cleaned = preg_replace('/```\s*$/i', '', $cleaned);
                    $cleaned = trim($cleaned);
                }
                $parsed = json_decode($cleaned, true);
                if (is_array($parsed) && isset($parsed['reply'])) {
                    return $parsed;
                }
                return ['reply' => $cleaned, 'revisedNotes' => null];
            }
        }
    }

    return ['reply' => 'Halo! Saya sedang mengalami sedikit kendala koneksi ke server AI, silakan kirim ulang pesan Kakak ya.', 'revisedNotes' => null];
}
