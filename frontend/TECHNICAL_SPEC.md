# Frontend Technical Specification

## Table of Contents
1. [Overview](#1-overview)
2. [File Structure](#2-file-structure)
3. [Core Technologies](#3-core-technologies)
4. [Components](#4-components)
5. [Complex Logic](#5-complex-logic)
6. [State Management](#6-state-management)
7. [WebSocket Integration](#7-websocket-integration)
8. [Yjs CRDT Integration](#8-yjs-crdt-integration)

---

## 1. Overview

The frontend is a React 19 single-page application providing a Google Docs-style collaborative editing experience with real-time cursor tracking and presence awareness.

### Key Features
- ✅ Real-time document sync (<50ms latency)
- ✅ Live cursor tracking with user names
- ✅ Presence awareness (who's online)
- ✅ Automatic reconnection
- ✅ Dark/Light mode toggle
- ✅ Room-based collaboration

---

## 2. File Structure

```
frontend/
├── src/
│   ├── App.js                    # Router configuration
│   ├── App.css                   # Global styles
│   ├── index.js                  # React entry point
│   ├── index.css                 # Tailwind imports
│   ├── pages/
│   │   ├── LandingPage.jsx       # User onboarding (name + room)
│   │   └── EditorPage.jsx        # Main collaborative editor (599 lines)
│   ├── components/
│   │   └── ui/
│   │       └── sonner.jsx        # Toast notifications
│   └── lib/
│       └── utils.js              # Utility functions (cn)
├── public/
│   └── index.html                # HTML template
├── package.json                  # Dependencies
├── tailwind.config.js            # Tailwind CSS config
├── craco.config.js               # Build config (path aliases)
└── postcss.config.js             # PostCSS config
```

---

## 3. Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI Framework |
| React Router | 6.x | Client-side routing |
| Tailwind CSS | 3.x | Utility-first styling |
| Yjs | 13.x | CRDT for conflict-free sync |
| uuid | 9.x | Unique ID generation |
| sonner | - | Toast notifications |

### Dependencies (package.json)
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.x",
    "yjs": "^13.x",
    "uuid": "^9.x",
    "sonner": "^1.x",
    "tailwindcss": "^3.x"
  }
}
```

---

## 4. Components

### 4.1 App.js - Router Configuration

```jsx
function App() {
  return (
    <div className="App min-h-screen bg-background">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/editor/:roomId" element={<EditorPage />} />
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </div>
  );
}
```

### 4.2 LandingPage.jsx - User Onboarding

**Purpose:** Collect user name and room selection before entering editor.

#### State Variables
```javascript
const [step, setStep] = useState('name');     // 'name' | 'room'
const [userName, setUserName] = useState('');  // User's display name
const [roomId, setRoomId] = useState('');      // Room to join
const [action, setAction] = useState('');      // 'create' | 'join'
```

#### User Flow
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Enter Name     │────>│  Create Room    │────>│  Editor Page    │
│                 │     │  (auto UUID)    │     │  /editor/{id}   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               ▲
        │               ┌─────────────────┐             │
        └──────────────>│  Enter Room ID  │─────────────┘
                        │  (join existing)│
                        └─────────────────┘
```

#### Key Functions

| Function | Description |
|----------|-------------|
| `handleCreateClick()` | Generates UUID room ID, stores user in localStorage, navigates to editor |
| `handleJoinClick()` | Stores user, transitions to room input step |
| `handleJoinRoom()` | Navigates to existing room with entered ID |

#### User Storage (localStorage)
```javascript
// Key: 'coedit_user'
{
  name: "John",
  color: "#3B82F6",  // Random from 10 predefined colors
  id: "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Color Palette
```javascript
const CURSOR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];
```

---

### 4.3 EditorPage.jsx - Main Editor (599 lines)

**Purpose:** Real-time collaborative text editor with cursor synchronization.

#### State Variables

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `roomId` | string | URL param or UUID | Current room identifier |
| `isConnected` | boolean | false | WebSocket connection status |
| `content` | string | '' | Current document text |
| `darkMode` | boolean | false | Theme toggle |
| `remoteUsers` | object | {} | `{userId: {name, color, cursorPosition}}` |
| `currentUser` | object | from localStorage | Current user info |

#### Refs (Persistent across renders)

| Ref | Type | Purpose |
|-----|------|---------|
| `wsRef` | WebSocket | WebSocket connection instance |
| `ydocRef` | Y.Doc | Yjs document instance |
| `ytextRef` | Y.Text | Yjs shared text type |
| `sessionIdRef` | string | Unique per-tab session ID |
| `editorRef` | HTMLTextAreaElement | Textarea DOM reference |
| `isLocalUpdateRef` | boolean | Flag to prevent echo of local changes |
| `lastSentStateRef` | string | Last sent Yjs state (for deduplication) |
| `cursorOverlayRef` | HTMLDivElement | Cursor overlay container |
| `reconnectTimeoutRef` | number | Reconnection timeout ID |

#### UI Structure
```
┌──────────────────────────────────────────────────────────────────┐
│ Header                                                            │
│ [← Back] | Room: abc123 | [User Avatar] | [Remote Avatars] | [🌙]│
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │                    Google Docs Style                       │  │
│  │                    Document Container                      │  │
│  │                    (816px × 1056px)                        │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Cursor Overlay (absolute positioned)                │  │  │
│  │  │   [Alice|]  ← Remote cursor with name label        │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ <textarea>                                          │  │  │
│  │  │   Document content here...                          │  │  │
│  │  │   |  ← Local cursor                                 │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Complex Logic

### 5.1 Environment-Aware URLs

**Problem:** Different URLs needed for local development vs Docker production.

**Solution:**
```javascript
const getBackendUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return '';  // Relative URL - nginx proxies /api to backend
  }
  return 'http://localhost:8001';  // Local development
};

const getWsUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost:8001';
};
```

### 5.2 Hex Encoding (Browser-Compatible)

**Problem:** Browser doesn't have Node.js `Buffer` class for binary data.

**Solution:** Custom hex encoding for Yjs binary updates:

```javascript
// Uint8Array → Hex String
const toHex = (uint8Array) => {
  return Array.from(uint8Array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// Example: [255, 0, 128] → "ff0080"

// Hex String → Uint8Array
const fromHex = (hexString) => {
  const bytes = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
};

// Example: "ff0080" → Uint8Array([255, 0, 128])
```

### 5.3 Text Diff Algorithm

**Problem:** Need to efficiently identify what changed between old and new content.

**Solution:** Two-pointer diff algorithm:

```javascript
const handleInput = useCallback((e) => {
  const newContent = e.target.value;
  const oldContent = ytextRef.current.toString();
  
  ydocRef.current.transact(() => {
    // Step 1: Find first difference (scan from start)
    let start = 0;
    while (start < oldContent.length && start < newContent.length 
           && oldContent[start] === newContent[start]) {
      start++;
    }
    
    // Step 2: Find last difference (scan from end)
    let oldEnd = oldContent.length;
    let newEnd = newContent.length;
    while (oldEnd > start && newEnd > start 
           && oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    
    // Step 3: Delete changed portion
    if (oldEnd > start) {
      ytextRef.current.delete(start, oldEnd - start);
    }
    
    // Step 4: Insert new content
    if (newEnd > start) {
      ytextRef.current.insert(start, newContent.slice(start, newEnd));
    }
  }, 'local');
}, []);
```

**Example:**
```
Old: "Hello World"
New: "Hello there World"

Step 1: start = 6 (first diff at index 6: 'W' vs 't')
Step 2: oldEnd = 6, newEnd = 12 (scanning backwards, 'World' matches)
Step 3: Delete nothing (oldEnd == start after adjustment)
Step 4: Insert "there " at position 6

Result: Minimal operation - just insert "there "
```

### 5.4 Cursor Position Calculation

**Problem:** Need to render remote cursors at correct pixel positions from character index.

**Solution:** Convert character position to line/column, then to pixels:

```javascript
// In cursor overlay rendering
const textBeforeCursor = content.substring(0, user.cursorPosition);
const lines = textBeforeCursor.split('\n');
const lineNumber = lines.length - 1;
const columnNumber = lines[lines.length - 1].length;

// Convert to pixels using font metrics
const charWidth = 8.8;   // Approximate for 11pt Arial
const lineHeight = 22;   // 1.5 line-height × 11pt

const left = columnNumber * charWidth;
const top = lineNumber * lineHeight;
```

**Visual:**
```
Line 0: Hello World
Line 1: This is |   ← cursor at position 20
Line 2: Some text

textBeforeCursor = "Hello World\nThis is "
lines = ["Hello World", "This is "]
lineNumber = 1
columnNumber = 8

left = 8 × 8.8 = 70.4px
top = 1 × 22 = 22px
```

### 5.5 Session vs User ID

**Problem:** Same user opens multiple browser tabs - should show as separate cursors.

**Solution:** Two-level identity system:

```javascript
// User ID: Persistent across tabs (from localStorage)
const currentUser = getStoredUser();  // {id, name, color}

// Session ID: Unique per tab (new on each page load)
const sessionIdRef = useRef(uuidv4());

// WebSocket connects with session ID
new WebSocket(`${WS_URL}/api/ws/${roomId}?client_id=${sessionIdRef.current}`);

// Filter out own cursor by session ID, not user ID
if (message.userId !== sessionIdRef.current) {
  // Show remote cursor
}
```

### 5.6 Update Deduplication

**Problem:** Sending same Yjs state multiple times wastes bandwidth.

**Solution:** Track and compare last sent state:

```javascript
const lastSentStateRef = useRef('');

// In handleInput:
const update = Y.encodeStateAsUpdate(ydocRef.current);
const hexData = toHex(update);

// Only send if state actually changed
if (hexData !== lastSentStateRef.current) {
  lastSentStateRef.current = hexData;
  wsRef.current.send(JSON.stringify({
    type: 'update',
    data: hexData
  }));
}
```

---

## 6. State Management

### 6.1 Local Storage

| Key | Value | Purpose |
|-----|-------|---------|
| `coedit_user` | `{id, name, color}` | Persistent user identity |

### 6.2 React State Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        EditorPage                                │
├─────────────────────────────────────────────────────────────────┤
│  State:                                                          │
│    content ─────────────> <textarea value={content} />           │
│    remoteUsers ─────────> Cursor Overlay rendering               │
│    isConnected ─────────> Connection status indicator            │
│    darkMode ────────────> Theme classes                          │
│                                                                  │
│  Refs (no re-render):                                            │
│    wsRef ───────────────> WebSocket.send()                       │
│    ydocRef ─────────────> Y.Doc operations                       │
│    ytextRef ────────────> Y.Text insert/delete                   │
│    sessionIdRef ────────> Message filtering                      │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Update Flow

```
User Types
    │
    ▼
onChange(e) ──> handleInput()
    │
    ├──> Diff old vs new content
    │
    ├──> ytextRef.delete() / insert()  (Yjs transaction)
    │
    ├──> setContent(newContent)  (React state)
    │
    └──> wsRef.send({type: 'update', data: hexData})
                │
                ▼
           WebSocket Server
                │
                ▼
           Other Clients receive 'update'
                │
                ▼
           Y.applyUpdate(ydocRef, update)
                │
                ▼
           ytextRef observer fires
                │
                ▼
           setContent(ytextRef.toString())
```

---

## 7. WebSocket Integration

### 7.1 Connection Lifecycle

```javascript
const connect = useCallback(() => {
  const ws = new WebSocket(`${WS_URL}/api/ws/${roomId}?client_id=${sessionIdRef.current}`);
  wsRef.current = ws;

  ws.onopen = () => {
    setIsConnected(true);
    
    // 1. Send join message with user info
    ws.send(JSON.stringify({
      type: 'join',
      name: currentUser.name,
      color: currentUser.color
    }));
    
    // 2. Request sync for latest document state
    ws.send(JSON.stringify({ type: 'sync_request' }));
  };

  ws.onclose = () => {
    setIsConnected(false);
    
    // Auto-reconnect after 3 seconds
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, 3000);
  };
}, [roomId, currentUser]);
```

### 7.2 Message Handling

```javascript
const handleMessage = useCallback((message) => {
  switch (message.type) {
    case 'sync':
      // Initial full document state
      const update = fromHex(message.data);
      Y.applyUpdate(ydocRef.current, update);
      setContent(ytextRef.current.toString());
      break;
      
    case 'update':
      // Remote document change
      if (message.from !== sessionIdRef.current) {
        const update = fromHex(message.data);
        Y.applyUpdate(ydocRef.current, update);
        setContent(ytextRef.current.toString());
      }
      break;

    case 'cursor':
      // Remote cursor position
      if (message.userId !== sessionIdRef.current) {
        setRemoteUsers(prev => ({
          ...prev,
          [message.userId]: {
            name: message.name,
            color: message.color,
            cursorPosition: message.position
          }
        }));
      }
      break;

    case 'user_joined':
      setRemoteUsers(prev => ({
        ...prev,
        [message.userId]: {
          name: message.name,
          color: message.color,
          cursorPosition: null
        }
      }));
      break;

    case 'user_left':
      setRemoteUsers(prev => {
        const updated = { ...prev };
        delete updated[message.userId];
        return updated;
      });
      break;

    case 'users_list':
      // Initial list of users in room
      const users = {};
      message.users.forEach(user => {
        if (user.id !== sessionIdRef.current) {
          users[user.id] = {
            name: user.name,
            color: user.color,
            cursorPosition: user.cursorPosition
          };
        }
      });
      setRemoteUsers(users);
      break;
  }
}, []);
```

### 7.3 Client → Server Messages

| Type | Payload | When Sent |
|------|---------|-----------|
| `join` | `{name, color}` | On WebSocket open |
| `sync_request` | `{}` | On WebSocket open |
| `update` | `{data: hex}` | On document change |
| `cursor` | `{userId, name, color, position}` | On cursor move/click/type |

---

## 8. Yjs CRDT Integration

### 8.1 Initialization

```javascript
useEffect(() => {
  // Create Yjs document
  ydocRef.current = new Y.Doc();
  
  // Get shared text type
  ytextRef.current = ydocRef.current.getText('content');
  
  // Observe changes (from local or remote)
  const observer = () => {
    if (!isLocalUpdateRef.current) {
      // Only update React state for remote changes
      setContent(ytextRef.current.toString());
    }
    isLocalUpdateRef.current = false;
  };
  
  ytextRef.current.observe(observer);
  
  return () => {
    ytextRef.current?.unobserve(observer);
    ydocRef.current?.destroy();
  };
}, []);
```

### 8.2 How Yjs CRDT Works

```
User A types "Hello" at position 0
User B types "World" at position 0 (same time)

┌─────────────────────────────────────────────────────────┐
│                    Without CRDT                         │
├─────────────────────────────────────────────────────────┤
│  Server receives:                                       │
│    A: insert("Hello", 0)                                │
│    B: insert("World", 0)                                │
│                                                         │
│  Conflict! Which wins? Need complex merging logic.      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     With Yjs CRDT                        │
├─────────────────────────────────────────────────────────┤
│  Each character has unique ID: (clientID, clock)        │
│                                                         │
│  A's "Hello": [(A,0,'H'), (A,1,'e'), (A,2,'l'), ...]   │
│  B's "World": [(B,0,'W'), (B,1,'o'), (B,2,'r'), ...]   │
│                                                         │
│  Yjs sorts by (position, clientID) deterministically:   │
│    Result: "HelloWorld" or "WorldHello"                 │
│    (depends on clientID ordering)                       │
│                                                         │
│  ✅ No conflict! Both users see same result.            │
└─────────────────────────────────────────────────────────┘
```

### 8.3 State Synchronization

```javascript
// Receiving sync from server
case 'sync':
  const update = fromHex(message.data);
  Y.applyUpdate(ydocRef.current, update);  // Merge into local doc
  setContent(ytextRef.current.toString()); // Update UI

// Sending update to server
const update = Y.encodeStateAsUpdate(ydocRef.current);
ws.send(JSON.stringify({
  type: 'update',
  data: toHex(update)
}));
```

---

## Appendix: Build Configuration

### craco.config.js (Path Aliases)
```javascript
const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};
```

### tailwind.config.js
```javascript
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

---

*Document Version: 1.0*  
*Last Updated: December 26, 2025*
