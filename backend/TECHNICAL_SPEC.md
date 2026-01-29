# Backend Technical Specification

## Table of Contents
1. [Overview](#1-overview)
2. [File Structure](#2-file-structure)
3. [Core Technologies](#3-core-technologies)
4. [Architecture](#4-architecture)
5. [In-Memory State](#5-in-memory-state)
6. [API Reference](#6-api-reference)
7. [WebSocket Protocol](#7-websocket-protocol)
8. [Complex Logic](#8-complex-logic)
9. [Classes](#9-classes)
10. [Configuration](#10-configuration)

---

## 1. Overview

The backend is a FastAPI Python application that handles WebSocket connections for real-time collaboration, REST APIs for room management, and MongoDB integration for document persistence.

### Key Responsibilities
- ✅ WebSocket connection management
- ✅ Document state broadcasting
- ✅ User presence tracking
- ✅ Cursor position synchronization
- ✅ Performance metrics collection
- ✅ MongoDB persistence
- ✅ Load testing simulation

---

## 2. File Structure

```
backend/
├── server.py           # Main FastAPI application (536 lines)
├── requirements.txt    # Python dependencies
├── .env.example        # Environment template
└── .env                # Local environment (gitignored)
```

---

## 3. Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.115.5 | Web framework + WebSocket |
| Motor | 3.6.0 | Async MongoDB driver |
| Pydantic | 2.10.2 | Data validation |
| Uvicorn | 0.32.1 | ASGI server |
| python-dotenv | 1.0.1 | Environment variables |
| websockets | 14.1 | WebSocket support |

### requirements.txt
```
fastapi==0.115.5
motor==3.6.0
pydantic==2.10.2
python-dotenv==1.0.1
uvicorn==0.32.1
websockets==14.1
```

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Application                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │    REST Router      │    │      WebSocket Endpoint         │ │
│  │    /api/*           │    │      /api/ws/{room_id}          │ │
│  ├─────────────────────┤    ├─────────────────────────────────┤ │
│  │ GET  /              │    │ - Accept connection             │ │
│  │ GET  /health        │    │ - Send initial sync             │ │
│  │ GET  /metrics       │    │ - Handle messages               │ │
│  │ GET  /rooms         │    │ - Broadcast updates             │ │
│  │ POST /rooms/persist │    │ - Manage presence               │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
│                                       │                          │
│  ┌────────────────────────────────────┼────────────────────────┐│
│  │              In-Memory State       │                        ││
│  │                                    ▼                        ││
│  │  room_documents: Dict[room_id, hex_string]                  ││
│  │  room_connections: Dict[room_id, Set[WebSocket]]            ││
│  │  room_users: Dict[room_id, Dict[client_id, user_info]]      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                       │                          │
│  ┌────────────────────────────────────┼────────────────────────┐│
│  │              ConnectionManager     │                        ││
│  │  - connect()                       │                        ││
│  │  - disconnect()                    ▼                        ││
│  │  - broadcast()         ┌─────────────────────┐              ││
│  │  - broadcast_bytes()   │  MetricsCollector   │              ││
│  └────────────────────────│  - record_message() │──────────────┘│
│                           │  - record_error()   │               │
│                           │  - get_stats()      │               │
│                           └─────────────────────┘               │
│                                       │                          │
└───────────────────────────────────────┼──────────────────────────┘
                                        │
                               ┌────────▼────────┐
                               │    MongoDB      │
                               │  (Persistence)  │
                               └─────────────────┘
```

---

## 5. In-Memory State

### 5.1 Data Structures

```python
from typing import Dict, Set
from collections import defaultdict

# Document content per room (hex-encoded Yjs state)
room_documents: Dict[str, str] = {}
# Example: {"abc123": "0001020304050607..."}

# Active WebSocket connections per room
room_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
# Example: {"abc123": {<WebSocket>, <WebSocket>}}

# User info per room
room_users: Dict[str, Dict[str, dict]] = defaultdict(dict)
# Example: {
#   "abc123": {
#     "client-uuid-1": {
#       "id": "client-uuid-1",
#       "name": "Alice",
#       "color": "#3B82F6",
#       "cursor_position": 42
#     }
#   }
# }
```

### 5.2 User Info Structure

```python
user_info = {
    "id": str,              # Unique client ID (UUID)
    "name": str,            # Display name
    "color": str,           # Hex color code
    "avatar_url": str,      # Optional avatar URL
    "cursor_position": int, # Current cursor position
    "selection": dict,      # Optional selection range
    "simulated": bool       # True if load-test user
}
```

---

## 6. API Reference

### 6.1 Base Info

| Property | Value |
|----------|-------|
| Base URL | `/api` |
| Protocol | HTTP/1.1, WebSocket |
| Content-Type | `application/json` |

### 6.2 REST Endpoints

#### GET /api/
**Description:** API info and welcome message.

**Response:**
```json
{
  "message": "CoEdit - Real-time Collaborative Editor API"
}
```

---

#### GET /api/health
**Description:** Health check endpoint for Docker/Kubernetes.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-26T12:00:00.000Z"
}
```

---

#### GET /api/metrics
**Description:** Performance and usage metrics.

**Response:**
```json
{
  "active_connections": 5,
  "messages_per_sec": 12.34,
  "p50_latency_ms": 2.5,
  "p95_latency_ms": 8.3,
  "error_count": 0,
  "reconnect_count": 2,
  "total_doc_size_bytes": 4096,
  "uptime_seconds": 3600,
  "total_messages": 15000,
  "rooms_active": 3
}
```

---

#### GET /api/metrics/events
**Description:** Recent event log for debugging.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | int | 50 | Max events to return |

**Response:**
```json
[
  {
    "id": "uuid",
    "timestamp": "2025-12-26T12:00:00.000Z",
    "type": "join",
    "room_id": "abc123",
    "user_id": "client-uuid",
    "details": "User Alice joined"
  }
]
```

---

#### GET /api/rooms
**Description:** List all active rooms.

**Response:**
```json
[
  {
    "id": "abc123",
    "name": "abc123",
    "user_count": 3,
    "doc_size": 1024,
    "users": [
      {"id": "...", "name": "Alice", "color": "#3B82F6"}
    ]
  }
]
```

---

#### GET /api/rooms/{room_id}
**Description:** Get specific room details.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| room_id | string | Room identifier |

**Response:**
```json
{
  "id": "abc123",
  "name": "abc123",
  "user_count": 3,
  "doc_size": 1024,
  "users": [...]
}
```

---

#### GET /api/rooms/{room_id}/users
**Description:** Get users in a room.

**Response:**
```json
[
  {
    "id": "client-uuid",
    "name": "Alice",
    "color": "#3B82F6",
    "cursor_position": 42
  }
]
```

---

#### POST /api/rooms/{room_id}/persist
**Description:** Save room document to MongoDB.

**Response (success):**
```json
{
  "success": true,
  "size": 2048
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": "No document found"
}
```

---

#### GET /api/rooms/{room_id}/load
**Description:** Load room document from MongoDB.

**Response (success):**
```json
{
  "success": true,
  "size": 2048
}
```

---

#### POST /api/simulate/users/{room_id}
**Description:** Add simulated users for load testing.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| count | int | 10 | Number of users to simulate |

**Response:**
```json
{
  "success": true,
  "simulated_users": 10,
  "total_users": 15
}
```

---

#### DELETE /api/simulate/users/{room_id}
**Description:** Remove all simulated users.

**Response:**
```json
{
  "success": true,
  "removed": 10
}
```

---

## 7. WebSocket Protocol

### 7.1 Connection

```
URL: ws://host/api/ws/{room_id}?client_id={uuid}

Path Parameters:
  room_id: string - Room to join

Query Parameters:
  client_id: string (optional) - Unique client identifier
                                 (auto-generated if not provided)
```

### 7.2 Connection Flow

```
Client                              Server
   │                                   │
   │──── WebSocket Connect ───────────>│
   │     /api/ws/abc123?client_id=xyz  │
   │                                   │
   │<──── Accept ──────────────────────│
   │                                   │
   │<──── sync {data: hex} ────────────│  (if room has document)
   │                                   │
   │<──── users {users: [...]} ────────│  (current room users)
   │                                   │
   │──── join {name, color} ──────────>│
   │                                   │
   │<──── users_list {users: [...]} ───│  (other users for cursor display)
   │                                   │
   │                    ┌──────────────│──> user_joined broadcast
   │                    │              │
   │                    ▼              │
   │              Other Clients        │
```

### 7.3 Client → Server Messages

#### join
**Purpose:** Register user info on connection.
```json
{
  "type": "join",
  "name": "Alice",
  "color": "#3B82F6",
  "avatar_url": "https://..." 
}
```

#### sync_request
**Purpose:** Request full document state.
```json
{
  "type": "sync_request"
}
```

#### update
**Purpose:** Send Yjs document update.
```json
{
  "type": "update",
  "data": "0001020304..."  // Hex-encoded Yjs state
}
```

#### cursor
**Purpose:** Send cursor position.
```json
{
  "type": "cursor",
  "userId": "client-uuid",
  "name": "Alice",
  "color": "#3B82F6",
  "position": 42
}
```

#### selection
**Purpose:** Send text selection range.
```json
{
  "type": "selection",
  "selection": {
    "start": 10,
    "end": 25
  }
}
```

#### ping
**Purpose:** Keepalive heartbeat.
```json
{
  "type": "ping",
  "timestamp": 1703592000000
}
```

### 7.4 Server → Client Messages

#### sync
**Purpose:** Full document state (on join or request).
```json
{
  "type": "sync",
  "data": "0001020304..."  // Hex-encoded Yjs state
}
```

#### update
**Purpose:** Remote document change.
```json
{
  "type": "update",
  "data": "0001020304...",
  "from": "client-uuid"  // Who sent the update
}
```

#### cursor
**Purpose:** Remote cursor position.
```json
{
  "type": "cursor",
  "userId": "client-uuid",
  "name": "Alice",
  "color": "#3B82F6",
  "position": 42
}
```

#### user_joined
**Purpose:** New user entered room.
```json
{
  "type": "user_joined",
  "userId": "client-uuid",
  "name": "Alice",
  "color": "#3B82F6"
}
```

#### user_left
**Purpose:** User disconnected.
```json
{
  "type": "user_left",
  "userId": "client-uuid"
}
```

#### users_list
**Purpose:** Full list of current users (sent to joining user).
```json
{
  "type": "users_list",
  "users": [
    {
      "id": "client-uuid",
      "name": "Bob",
      "color": "#EF4444",
      "cursorPosition": 100
    }
  ]
}
```

#### pong
**Purpose:** Keepalive response.
```json
{
  "type": "pong",
  "timestamp": 1703592000000
}
```

#### error
**Purpose:** Error notification.
```json
{
  "type": "error",
  "message": "Invalid JSON"
}
```

---

## 8. Complex Logic

### 8.1 Document State Storage

**Key Decision:** Store full Yjs state, not incremental updates.

```python
elif msg_type == "update":
    update_data = message.get("data", "")
    if update_data:
        # REPLACE, don't append - client sends full state
        room_documents[room_id] = update_data
        
        # Broadcast to others
        await manager.broadcast(room_id, {
            "type": "update",
            "data": update_data,
            "from": client_id
        }, exclude_client=client_id)
```

**Why full state?**
- Simpler than managing Yjs state vectors
- New clients get consistent state immediately
- Trade-off: More bandwidth, but reliable

### 8.2 Broadcast with Exclusion

**Problem:** Don't send message back to sender (would cause echo).

**Solution:**
```python
async def broadcast(self, room_id: str, message: dict, exclude_client: str = None):
    disconnected = []
    
    for client_id, connection in self.active_connections[room_id].items():
        if client_id != exclude_client:  # Skip sender
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(client_id)
    
    # Cleanup dead connections
    for client_id in disconnected:
        self.disconnect(room_id, client_id)
```

### 8.3 Graceful Disconnect Handling

```python
@app.websocket("/api/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str = None):
    await manager.connect(websocket, room_id, client_id)
    
    try:
        while True:
            data = await websocket.receive()
            # ... handle messages
            
    except WebSocketDisconnect:
        pass  # Normal disconnect
    finally:
        # Always cleanup
        manager.disconnect(room_id, client_id)
        
        # Notify others
        try:
            await manager.broadcast(room_id, {
                "type": "user_left",
                "userId": client_id
            })
        except:
            pass  # Ignore errors during cleanup
```

### 8.4 Latency Percentile Calculation

```python
def get_stats(self) -> dict:
    if self.latencies:
        sorted_latencies = sorted(self.latencies)
        
        # P50 (median)
        p50_idx = int(len(sorted_latencies) * 0.5)
        p50_latency = sorted_latencies[p50_idx]
        
        # P95
        p95_idx = int(len(sorted_latencies) * 0.95)
        p95_latency = sorted_latencies[p95_idx]
```

### 8.5 MongoDB Persistence

```python
@api_router.post("/rooms/{room_id}/persist")
async def persist_room(room_id: str):
    room_doc = room_documents.get(room_id, '')
    if room_doc:
        doc = {
            "room_id": room_id,
            "data": room_doc,  # Hex-encoded Yjs state
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "size": len(room_doc)
        }
        
        # Upsert: insert or update
        await db.room_documents.update_one(
            {"room_id": room_id},
            {"$set": doc},
            upsert=True
        )
        return {"success": True, "size": len(room_doc)}
```

---

## 9. Classes

### 9.1 ConnectionManager

**Purpose:** Manage WebSocket connections and broadcasting.

```python
class ConnectionManager:
    def __init__(self):
        # {room_id: {client_id: WebSocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = defaultdict(dict)
    
    async def connect(self, websocket: WebSocket, room_id: str, client_id: str):
        """Accept WebSocket and register connection"""
        await websocket.accept()
        self.active_connections[room_id][client_id] = websocket
        room_connections[room_id].add(websocket)
        metrics.add_event("connect", room_id, client_id)
    
    def disconnect(self, room_id: str, client_id: str):
        """Remove connection and cleanup user state"""
        ws = self.active_connections[room_id].pop(client_id, None)
        if ws:
            room_connections[room_id].discard(ws)
        if client_id in room_users.get(room_id, {}):
            del room_users[room_id][client_id]
        metrics.add_event("disconnect", room_id, client_id)
    
    async def broadcast(self, room_id: str, message: dict, exclude_client: str = None):
        """Send JSON to all room members (except excluded)"""
        # ... implementation
    
    async def broadcast_bytes(self, room_id: str, data: bytes, exclude_client: str = None):
        """Send binary to all room members"""
        # ... implementation
```

### 9.2 MetricsCollector

**Purpose:** Track performance and usage metrics.

```python
class MetricsCollector:
    def __init__(self):
        self.message_count = 0
        self.error_count = 0
        self.reconnect_count = 0
        self.latencies: List[float] = []  # Last 1000
        self.start_time = time.time()
        self.doc_sizes: Dict[str, int] = {}
        self.events: List[dict] = []  # Last 100
    
    def record_message(self, latency_ms: float = 0):
        """Record a processed message"""
        self.message_count += 1
        if latency_ms > 0:
            self.latencies.append(latency_ms)
            if len(self.latencies) > 1000:
                self.latencies = self.latencies[-1000:]
    
    def record_error(self):
        """Record an error"""
        self.error_count += 1
    
    def add_event(self, event_type: str, room_id: str, user_id: str, details: str):
        """Add to event log"""
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": event_type,
            "room_id": room_id,
            "user_id": user_id,
            "details": details
        }
        self.events.append(event)
        if len(self.events) > 100:
            self.events = self.events[-100:]
    
    def get_stats(self) -> dict:
        """Get current metrics snapshot"""
        # ... implementation
```

---

## 10. Configuration

### 10.1 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | `coedit` | MongoDB database name |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |

### 10.2 .env.example

```env
# MongoDB Configuration
MONGO_URL=mongodb://localhost:27017
# For Docker: MONGO_URL=mongodb://mongo:27017
DB_NAME=coedit

# CORS Configuration
CORS_ORIGINS=*
```

### 10.3 CORS Middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 10.4 Logging

```python
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
```

### 10.5 Running the Server

```bash
# Development
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Production (via Docker/supervisor)
uvicorn server:app --host 0.0.0.0 --port 8001
```

---

## Appendix: Data Flow Diagrams

### User Joins Room
```
Client                          Server                         MongoDB
   │                               │                              │
   │──── WS Connect ──────────────>│                              │
   │                               │                              │
   │<──── sync (if exists) ────────│                              │
   │                               │                              │
   │<──── users list ──────────────│                              │
   │                               │                              │
   │──── join {name, color} ──────>│                              │
   │                               │                              │
   │                               │── update room_users ─────────│
   │                               │                              │
   │                               │── broadcast user_joined ────>│ (other clients)
   │                               │                              │
```

### Document Edit
```
Client A                        Server                         Client B
   │                               │                              │
   │──── update {hex_data} ───────>│                              │
   │                               │                              │
   │                               │── room_documents[room] = data│
   │                               │                              │
   │                               │── broadcast update ─────────>│
   │                               │                              │
   │                               │              Y.applyUpdate() ─│
   │                               │                              │
```


