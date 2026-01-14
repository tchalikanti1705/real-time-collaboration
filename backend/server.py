from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, List, Optional, Set
import uuid
import json
import asyncio
from datetime import datetime, timezone
from collections import defaultdict
import time
import statistics


ROOT_DIR = Path(__file__).parent
# Load .env file if it exists (for local development)
env_file = ROOT_DIR / '.env'
if env_file.exists():
    load_dotenv(env_file)

# MongoDB connection with defaults for Docker
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'coedit')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============== CRDT Document State ==============
# In-memory store for Yjs document updates per room
# In production, this would be Redis
room_documents: Dict[str, bytes] = {}
room_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
room_users: Dict[str, Dict[str, dict]] = defaultdict(dict)  # room_id -> {client_id -> user_info}

# ============== Metrics Collection ==============
class MetricsCollector:
    def __init__(self):
        self.message_count = 0
        self.error_count = 0
        self.reconnect_count = 0
        self.latencies: List[float] = []
        self.start_time = time.time()
        self.doc_sizes: Dict[str, int] = {}
        self.events: List[dict] = []
        self.max_events = 100
    
    def record_message(self, latency_ms: float = 0):
        self.message_count += 1
        if latency_ms > 0:
            self.latencies.append(latency_ms)
            # Keep only last 1000 latencies
            if len(self.latencies) > 1000:
                self.latencies = self.latencies[-1000:]
    
    def record_error(self):
        self.error_count += 1
    
    def record_reconnect(self):
        self.reconnect_count += 1
    
    def record_doc_size(self, room_id: str, size: int):
        self.doc_sizes[room_id] = size
    
    def add_event(self, event_type: str, room_id: str, user_id: str = "", details: str = ""):
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": event_type,
            "room_id": room_id,
            "user_id": user_id,
            "details": details
        }
        self.events.append(event)
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events:]
    
    def get_stats(self) -> dict:
        uptime = time.time() - self.start_time
        messages_per_sec = self.message_count / uptime if uptime > 0 else 0
        
        p50_latency = 0
        p95_latency = 0
        if self.latencies:
            sorted_latencies = sorted(self.latencies)
            p50_idx = int(len(sorted_latencies) * 0.5)
            p95_idx = int(len(sorted_latencies) * 0.95)
            p50_latency = sorted_latencies[p50_idx] if p50_idx < len(sorted_latencies) else 0
            p95_latency = sorted_latencies[p95_idx] if p95_idx < len(sorted_latencies) else 0
        
        total_connections = sum(len(conns) for conns in room_connections.values())
        total_doc_size = sum(self.doc_sizes.values())
        
        return {
            "active_connections": total_connections,
            "messages_per_sec": round(messages_per_sec, 2),
            "p50_latency_ms": round(p50_latency, 2),
            "p95_latency_ms": round(p95_latency, 2),
            "error_count": self.error_count,
            "reconnect_count": self.reconnect_count,
            "total_doc_size_bytes": total_doc_size,
            "uptime_seconds": round(uptime, 0),
            "total_messages": self.message_count,
            "rooms_active": len(room_connections)
        }
    
    def get_events(self, limit: int = 50) -> List[dict]:
        return self.events[-limit:]


metrics = MetricsCollector()


# ============== Models ==============
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class RoomInfo(BaseModel):
    id: str
    name: str
    user_count: int
    doc_size: int
    created_at: str


class UserInfo(BaseModel):
    id: str
    name: str
    color: str
    avatar_url: Optional[str] = None
    cursor_position: Optional[dict] = None
    selection: Optional[dict] = None


class JoinRoomRequest(BaseModel):
    user_name: str
    user_color: Optional[str] = None


# ============== REST API Routes ==============
@api_router.get("/")
async def root():
    return {"message": "CoEdit - Real-time Collaborative Editor API"}


@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


@api_router.get("/metrics")
async def get_metrics():
    return metrics.get_stats()


@api_router.get("/metrics/events")
async def get_events(limit: int = 50):
    return metrics.get_events(limit)


@api_router.get("/rooms")
async def list_rooms():
    rooms = []
    for room_id, connections in room_connections.items():
        room_doc = room_documents.get(room_id, '')
        rooms.append({
            "id": room_id,
            "name": room_id,
            "user_count": len(connections),
            "doc_size": len(room_doc) // 2 if room_doc else 0,  # hex is 2 chars per byte
            "users": list(room_users.get(room_id, {}).values())
        })
    return rooms


@api_router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    connections = room_connections.get(room_id, set())
    room_doc = room_documents.get(room_id, '')
    users = room_users.get(room_id, {})
    return {
        "id": room_id,
        "name": room_id,
        "user_count": len(connections),
        "doc_size": len(room_doc) // 2 if room_doc else 0,  # hex is 2 chars per byte
        "users": list(users.values())
    }


@api_router.get("/rooms/{room_id}/users")
async def get_room_users(room_id: str):
    users = room_users.get(room_id, {})
    return list(users.values())


@api_router.post("/rooms/{room_id}/persist")
async def persist_room(room_id: str):
    """Persist room document to MongoDB"""
    room_doc = room_documents.get(room_id, '')
    if room_doc:
        doc = {
            "room_id": room_id,
            "data": room_doc,  # Already stored as hex string
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "size": len(room_doc)
        }
        await db.room_documents.update_one(
            {"room_id": room_id},
            {"$set": doc},
            upsert=True
        )
        return {"success": True, "size": len(room_doc)}
    return {"success": False, "error": "No document found"}


@api_router.get("/rooms/{room_id}/load")
async def load_room(room_id: str):
    """Load room document from MongoDB"""
    doc = await db.room_documents.find_one({"room_id": room_id}, {"_id": 0})
    if doc:
        room_documents[room_id] = doc["data"]  # Store as hex string
        return {"success": True, "size": doc.get("size", 0)}
    return {"success": False, "error": "No persisted document found"}


# ============== WebSocket Handler ==============
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = defaultdict(dict)
    
    async def connect(self, websocket: WebSocket, room_id: str, client_id: str):
        await websocket.accept()
        self.active_connections[room_id][client_id] = websocket
        room_connections[room_id].add(websocket)
        metrics.add_event("connect", room_id, client_id, "User connected")
    
    def disconnect(self, room_id: str, client_id: str):
        if room_id in self.active_connections:
            ws = self.active_connections[room_id].pop(client_id, None)
            if ws:
                room_connections[room_id].discard(ws)
            if client_id in room_users.get(room_id, {}):
                del room_users[room_id][client_id]
        metrics.add_event("disconnect", room_id, client_id, "User disconnected")
    
    async def broadcast(self, room_id: str, message: dict, exclude_client: str = None):
        if room_id in self.active_connections:
            disconnected = []
            for client_id, connection in self.active_connections[room_id].items():
                if client_id != exclude_client:
                    try:
                        await connection.send_json(message)
                    except Exception:
                        disconnected.append(client_id)
            
            # Clean up disconnected clients
            for client_id in disconnected:
                self.disconnect(room_id, client_id)
    
    async def broadcast_bytes(self, room_id: str, data: bytes, exclude_client: str = None):
        if room_id in self.active_connections:
            disconnected = []
            for client_id, connection in self.active_connections[room_id].items():
                if client_id != exclude_client:
                    try:
                        await connection.send_bytes(data)
                    except Exception:
                        disconnected.append(client_id)
            
            for client_id in disconnected:
                self.disconnect(room_id, client_id)


manager = ConnectionManager()


@app.websocket("/api/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str = None):
    if not client_id:
        client_id = str(uuid.uuid4())
    
    await manager.connect(websocket, room_id, client_id)
    
    # Send initial sync - send existing document state
    if room_id in room_documents and room_documents[room_id]:
        await websocket.send_json({
            "type": "sync",
            "data": room_documents[room_id]  # Already stored as hex string
        })
    
    # Send current users in room
    await websocket.send_json({
        "type": "users",
        "users": list(room_users.get(room_id, {}).values())
    })
    
    try:
        while True:
            start_time = time.time()
            
            try:
                # Try to receive as JSON first
                data = await websocket.receive()
                
                if "text" in data:
                    message = json.loads(data["text"])
                    await handle_json_message(websocket, room_id, client_id, message)
                elif "bytes" in data:
                    # Handle binary Yjs updates
                    await handle_binary_message(websocket, room_id, client_id, data["bytes"])
                
                latency_ms = (time.time() - start_time) * 1000
                metrics.record_message(latency_ms)
                
            except json.JSONDecodeError:
                metrics.record_error()
                try:
                    await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                except:
                    break  # Connection is closed
            except WebSocketDisconnect:
                raise
            except Exception as e:
                metrics.record_error()
                logging.error(f"WebSocket error: {e}")
                break  # Exit loop on any other error
                
    except WebSocketDisconnect:
        pass  # Normal disconnect
    finally:
        manager.disconnect(room_id, client_id)
        # Notify others about user leaving
        try:
            await manager.broadcast(room_id, {
                "type": "user_left",
                "userId": client_id
            })
        except:
            pass  # Ignore errors during cleanup


async def handle_json_message(websocket: WebSocket, room_id: str, client_id: str, message: dict):
    msg_type = message.get("type")
    
    if msg_type == "join":
        # User joining with info
        user_info = {
            "id": client_id,
            "name": message.get("name", f"User-{client_id[:6]}"),
            "color": message.get("color", "#3B82F6"),
            "avatar_url": message.get("avatar_url"),
            "cursor_position": None,
            "selection": None
        }
        room_users[room_id][client_id] = user_info
        metrics.add_event("join", room_id, client_id, f"User {user_info['name']} joined")
        
        # Broadcast to all users (including the new one to get the list)
        await manager.broadcast(room_id, {
            "type": "user_joined",
            "userId": client_id,
            "name": user_info["name"],
            "color": user_info["color"]
        }, exclude_client=client_id)
        
        # Send the current users list to the joining user
        users_list = [
            {"id": uid, "name": u["name"], "color": u["color"], "cursorPosition": u.get("cursor_position")}
            for uid, u in room_users.get(room_id, {}).items()
            if uid != client_id
        ]
        await websocket.send_json({
            "type": "users_list",
            "users": users_list
        })
    
    elif msg_type == "cursor":
        # Cursor position update
        if client_id in room_users.get(room_id, {}):
            room_users[room_id][client_id]["cursor_position"] = message.get("position")
            user_info = room_users[room_id][client_id]
            await manager.broadcast(room_id, {
                "type": "cursor",
                "userId": client_id,
                "name": user_info.get("name", "Anonymous"),
                "color": user_info.get("color", "#3B82F6"),
                "position": message.get("position")
            }, exclude_client=client_id)
    
    elif msg_type == "selection":
        # Selection update
        if client_id in room_users.get(room_id, {}):
            room_users[room_id][client_id]["selection"] = message.get("selection")
            await manager.broadcast(room_id, {
                "type": "selection",
                "user_id": client_id,
                "selection": message.get("selection")
            }, exclude_client=client_id)
    
    elif msg_type == "awareness":
        # Awareness protocol message
        await manager.broadcast(room_id, {
            "type": "awareness",
            "user_id": client_id,
            "data": message.get("data")
        }, exclude_client=client_id)
    
    elif msg_type == "sync_request":
        # Client requesting full sync
        if room_id in room_documents and room_documents[room_id]:
            await websocket.send_json({
                "type": "sync",
                "data": room_documents[room_id]  # Already stored as hex string
            })
    
    elif msg_type == "update":
        # Document update (hex encoded) - this is the FULL Yjs state
        update_data = message.get("data", "")
        if update_data:
            # Store the full state (not concatenating - the client sends full state)
            room_documents[room_id] = update_data  # Store as hex string
            metrics.record_doc_size(room_id, len(update_data))
            
            # Broadcast to others
            await manager.broadcast(room_id, {
                "type": "update",
                "data": update_data,
                "from": client_id
            }, exclude_client=client_id)
    
    elif msg_type == "ping":
        await websocket.send_json({"type": "pong", "timestamp": message.get("timestamp")})


async def handle_binary_message(websocket: WebSocket, room_id: str, client_id: str, data: bytes):
    """Handle binary Yjs update messages"""
    # Store the update as hex string (full state)
    room_documents[room_id] = data.hex()
    metrics.record_doc_size(room_id, len(data))
    
    # Broadcast to all other clients as JSON with hex data
    await manager.broadcast(room_id, {
        "type": "update",
        "data": data.hex(),
        "from": client_id
    }, exclude_client=client_id)


# ============== Load Testing Simulation ==============
@api_router.post("/simulate/users/{room_id}")
async def simulate_users(room_id: str, count: int = 10):
    """Simulate multiple users joining a room for load testing"""
    simulated_users = []
    colors = ["#F43F5E", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899"]
    
    for i in range(count):
        user_id = f"sim-{uuid.uuid4().hex[:8]}"
        user_info = {
            "id": user_id,
            "name": f"SimUser-{i+1}",
            "color": colors[i % len(colors)],
            "avatar_url": None,
            "cursor_position": {"line": i % 20, "column": (i * 5) % 80},
            "selection": None,
            "simulated": True
        }
        room_users[room_id][user_id] = user_info
        simulated_users.append(user_info)
        metrics.add_event("simulate", room_id, user_id, f"Simulated user {user_info['name']}")
    
    # Broadcast new simulated users
    for user in simulated_users:
        await manager.broadcast(room_id, {
            "type": "user_joined",
            "user": user
        })
    
    return {"success": True, "simulated_users": len(simulated_users), "total_users": len(room_users[room_id])}


@api_router.delete("/simulate/users/{room_id}")
async def remove_simulated_users(room_id: str):
    """Remove all simulated users from a room"""
    removed = 0
    if room_id in room_users:
        to_remove = [uid for uid, user in room_users[room_id].items() if user.get("simulated")]
        for user_id in to_remove:
            del room_users[room_id][user_id]
            await manager.broadcast(room_id, {
                "type": "user_left",
                "userId": user_id
            })
            removed += 1
    
    return {"success": True, "removed": removed}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Serve static files from React build (for production)
FRONTEND_BUILD_DIR = ROOT_DIR.parent / 'frontend' / 'build'

# Log the frontend build directory for debugging
logger.info(f"Looking for frontend build at: {FRONTEND_BUILD_DIR}")
logger.info(f"Frontend build exists: {FRONTEND_BUILD_DIR.exists()}")

if FRONTEND_BUILD_DIR.exists():
    logger.info(f"Frontend build contents: {list(FRONTEND_BUILD_DIR.iterdir())}")
    
    # Catch-all route for SPA - serves both static files and index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # If empty path, serve index.html
        if not full_path:
            return FileResponse(FRONTEND_BUILD_DIR / "index.html")
        
        # Check if it's a file request
        file_path = FRONTEND_BUILD_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # Return index.html for SPA routing
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")
    
    # Mount static assets after the catch-all (FastAPI will match /static first)
    app.mount("/static", StaticFiles(directory=FRONTEND_BUILD_DIR / "static"), name="static")
else:
    logger.warning(f"Frontend build not found at {FRONTEND_BUILD_DIR}. Listing parent directory:")
    if ROOT_DIR.parent.exists():
        logger.warning(f"Parent contents: {list(ROOT_DIR.parent.iterdir())}")
