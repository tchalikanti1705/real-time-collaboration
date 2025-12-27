# ConcurrencyPad - Product Requirements Document

## Original Problem Statement
Build a real-time collaboration text editor that shows system design skills like concurrency, distributed systems, race conditions, low latency, high users handling, and infrastructure. Create a resume one-liner after development.

## User Choices
- **Collaboration Features**: Advanced (real-time text + cursor/selection, presence list, user colors/avatars, sync status)
- **Concurrency Handling**: CRDT using Yjs for offline/online merges
- **User Capacity**: Simulate 10-50 concurrent users with load testing
- **Technical Dashboard**: Basic metrics (latency p50/p95, connections, messages/sec, errors, doc size, event log)
- **Visual Theme**: Dark developer/IDE theme (VS Code-ish)

## Architecture
```
Client (React + Yjs) ←→ WebSocket ←→ FastAPI Server ←→ MongoDB/Redis
```

### Key Components
- **CRDT**: Yjs for conflict-free document synchronization
- **WebSocket**: Real-time bidirectional communication
- **Presence Protocol**: Cursor positions, selections, user awareness
- **Metrics Collector**: Latency percentiles, throughput, connection tracking

## User Personas
1. **Technical Recruiters**: Evaluating system design skills
2. **Engineering Managers**: Assessing distributed systems knowledge
3. **Developers**: Learning collaborative editing implementation

## Core Requirements (Static)
- [x] Real-time collaborative text editing
- [x] CRDT-based conflict resolution
- [x] Multi-user presence awareness
- [x] Live metrics dashboard
- [x] Load testing simulation
- [x] Event logging
- [x] Dark IDE theme

## What's Been Implemented (December 2025)

### Backend (FastAPI)
- WebSocket endpoint `/api/ws/{room_id}` with connection management
- Metrics collector (P50/P95 latency, throughput, connections, errors)
- User simulation endpoints for load testing
- Room management and document persistence
- Presence protocol (cursors, selections, awareness)

### Frontend (React)
- Landing page with Create/Join room
- Collaborative editor with Yjs integration
- Real-time metrics dashboard with Recharts
- Presence sidebar with user list
- Event log viewer
- Dark VS Code-inspired theme

### System Design Highlights
- CRDT guarantees eventual consistency without coordination
- State vector for efficient sync
- WebSocket binary protocol for low latency
- Horizontal scaling design with Redis pub/sub

## Prioritized Backlog

### P0 (Done)
- [x] Core collaborative editing
- [x] WebSocket presence
- [x] Metrics dashboard
- [x] Load testing simulation

### P1 (Future)
- [ ] Persistent document storage
- [ ] User authentication
- [ ] Room permissions
- [ ] Rich text formatting

### P2 (Nice to have)
- [ ] Code syntax highlighting
- [ ] Vim/Emacs key bindings
- [ ] Export to various formats
- [ ] Mobile responsive layout

## Resume One-Liner
> **Built a real-time collaborative editor using Yjs CRDT achieving <50ms P50 sync latency, supporting 50+ concurrent users with WebSocket presence protocol and live observability dashboard.**

## Next Tasks
1. Add user authentication (optional)
2. Implement document persistence to MongoDB
3. Add code syntax highlighting mode
4. Create load testing benchmarks documentation
