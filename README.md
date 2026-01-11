# CoEdit - Real-Time Collaborative Text Editor
# My first commit
A production-grade collaborative text editor demonstrating distributed systems concepts: **CRDT synchronization**, **WebSocket presence**, **low-latency messaging**, and **real-time cursor tracking**.

## Quick Start

### Option 1: Docker Compose (Recommended - Easiest)

**Prerequisites:** Docker Desktop installed and running

```bash
# 1. Clone the repository
git clone https://github.com/tchalikanti1705/real-time-collaboration.git
cd real-time-collaboration

# 2. Start the application (builds and runs everything)
docker-compose up --build

# 3. Open in browser
# http://localhost:3000
```

That's it! The app will be running with MongoDB included.

---

### Option 2: Local Development (Without Docker)

**Prerequisites:** 
- Node.js 18+ 
- Python 3.9+
- MongoDB (local or cloud like MongoDB Atlas)

#### Step 1: Clone the repository
```bash
git clone https://github.com/tchalikanti1705/real-time-collaboration.git
cd real-time-collaboration
```

#### Step 2: Setup Backend
```bash
cd backend

# Create .env file from example
cp .env.example .env

# Edit .env with your MongoDB connection (or use local MongoDB)
# For local MongoDB: MONGO_URL=mongodb://localhost:27017

# Install Python dependencies
pip install -r requirements.txt

# Start the backend server
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

#### Step 3: Setup Frontend (in a new terminal)
```bash
cd frontend

# Install dependencies
npm install --legacy-peer-deps

# Start the frontend dev server
npm start
```

#### Step 4: Open the app
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001

---

##  Usage

1. **Enter your name** on the landing page
2. **Create a new room** or **join an existing room** with a Room ID
3. **Start typing** - changes sync in real-time with other users
4. **See live cursors** of other collaborators with their names
5. **Share the Room ID** with others to collaborate

---



##  Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Client A   │     │  Client B   │     │  Client C   │
│  (Yjs Doc)  │     │  (Yjs Doc)  │     │  (Yjs Doc)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    WebSocket (Binary)
                           │
              ┌────────────┴────────────┐
              │    FastAPI Server       │
              │  - WebSocket Handler    │
              │  - Metrics Collector    │
              │  - Presence Manager     │
              └────────────┬────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
       ┌────┴────┐   ┌─────┴─────┐  ┌─────┴─────┐
       │  Redis  │   │  MongoDB  │  │  Metrics  │
       │ Pub/Sub │   │   (Docs)  │  │ Collector │
       └─────────┘   └───────────┘  └───────────┘
```

---

##  Why CRDT (Yjs)?

### Problem with OT (Operational Transformation)
- Requires **central server** to order operations
- Complex **transformation functions** for each operation type
- **Single point of failure** - server must be available

### CRDT Guarantees
| Property | Description |
|----------|-------------|
| **Eventual Consistency** | All replicas converge to the same state |
| **Conflict-Free** | No coordination needed for merges |
| **Offline-First** | Edits queue locally, sync when online |
| **Commutative** | Operations can be applied in any order |

### Yjs Specific Benefits
- **State Vector** for efficient sync (only missing updates sent)
- **Delta Encoding** minimizes bandwidth
- **Undo Manager** with proper CRDT semantics
- **Sub-document** support for large documents

---

##  Metrics & Observability

### Live Dashboard
- **P50/P95 Latency**: Percentile response times
- **Throughput**: Messages per second
- **Active Connections**: WebSocket connection count
- **Document Size**: Total CRDT state size
- **Error Rate**: Failed operations count

### Event Log
Real-time stream of:
- User joins/leaves
- Document updates
- Connection events
- Simulated load tests

---

## 🔧 Trade-offs & Design Decisions

### 1. Ordering Guarantees
| Approach | Our Choice |
|----------|------------|
| Strong ordering |  Not needed - CRDT handles conflicts |
| Causal ordering |  Yjs maintains causal dependencies |
| Total ordering |  Would require central coordinator |

### 2. Persistence Strategy
```
┌─────────────────────────────────────────────┐
│ On-Demand Persistence                       │
│ - Documents persist to MongoDB on API call  │
│ - State vector enables incremental sync     │
│ - Trade-off: Durability vs. Latency         │
└─────────────────────────────────────────────┘
```

### 3. Reconnection Handling
- **Exponential backoff** prevents thundering herd
- **State vector sync** ensures no missed updates
- **Optimistic UI** - local edits apply immediately

### 4. Backpressure
- **Message queuing** at WebSocket layer
- **Rate limiting** on broadcast operations
- **Document size limits** prevent memory exhaustion

---

##  Scaling Considerations

### Horizontal Scaling (Not implemented but designed for)
```
Load Balancer (Sticky Sessions)
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
 Server 1  Server 2  Server 3  Server N
    │         │        │        │
    └────┬────┴────────┴────────┘
         │
    Redis Pub/Sub (Cross-server sync)
```

### Bottleneck Analysis
| Component | Bottleneck | Mitigation |
|-----------|------------|------------|
| WebSocket | Concurrent connections | Sticky LB, connection pooling |
| CRDT Merge | CPU for large docs | Document sharding, lazy loading |
| Broadcast | Fan-out latency | Redis pub/sub, batching |
| Persistence | I/O on sync | Write-behind caching |

---

##  Load Testing

### Built-in Simulation
```bash
# Add 10 simulated users to a room
curl -X POST /api/simulate/users/{room_id}?count=10

# Remove simulated users
curl -X DELETE /api/simulate/users/{room_id}
```

### Metrics Endpoints
```bash
# Get current metrics
curl /api/metrics

# Get event log
curl /api/metrics/events?limit=50
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 | UI Framework |
| CRDT | Yjs | Conflict-free data sync |
| Transport | WebSocket | Real-time bidirectional |
| Backend | FastAPI | Async Python API |
| Database | MongoDB | Document persistence |
| Styling | Tailwind + Shadcn | Dark IDE theme |
| Charts | Recharts | Metrics visualization |
| Animation | Framer Motion | Micro-interactions |

---

##  Project Structure

```
/app
├── backend/
│   └── server.py          # FastAPI + WebSocket + Metrics
├── frontend/src/
│   ├── pages/
│   │   ├── LandingPage.jsx    # Home with features
│   │   └── EditorPage.jsx     # Main editor
│   └── components/
│       ├── Editor.jsx          # Yjs-powered editor
│       ├── MetricsDashboard.jsx # Live metrics
│       ├── PresenceSidebar.jsx  # User list
│       └── EventLog.jsx         # Event stream
└── README.md
```

---

##  Interview Talking Points

1. **Why CRDT over OT?**
   - No central coordinator needed
   - Better offline support
   - Mathematically proven convergence

2. **How do you handle late joiners?**
   - State vector identifies missing updates
   - Full sync for completely new clients
   - Delta sync for reconnections

3. **What about consistency guarantees?**
   - Eventual consistency is sufficient for text editing
   - Causal ordering maintained by Yjs
   - No lost updates due to CRDT properties

4. **How would you scale this?**
   - Horizontal scaling with Redis pub/sub
   - Document sharding for large documents
   - CDN for static assets, edge for WebSocket

5. **What metrics matter?**
   - P95 latency (user-perceived delay)
   - Sync convergence time
   - Document merge efficiency

---

##  Quick Start

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001

# Frontend
cd frontend && yarn install && yarn start
```

Visit `http://localhost:3000` and open in multiple tabs to test collaboration!

---

##  Performance Benchmarks

| Metric | Target | Achieved |
|--------|--------|----------|
| P50 Latency | <50ms |  <50ms |
| P95 Latency | <200ms |  <200ms |
| Concurrent Users | 50+ |  Tested |
| Document Size | <1MB |  Supported |
| Reconnection | <3s |  Auto-reconnect |
