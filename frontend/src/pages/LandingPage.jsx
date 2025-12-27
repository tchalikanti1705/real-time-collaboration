import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  Zap, 
  Server, 
  GitBranch, 
  Activity, 
  Shield,
  ArrowRight,
  Terminal
} from 'lucide-react';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

const features = [
  {
    icon: GitBranch,
    title: "CRDT-Based Sync",
    description: "Conflict-free replicated data types ensure eventual consistency without coordination"
  },
  {
    icon: Zap,
    title: "Low Latency",
    description: "P50 < 50ms sync times with optimized WebSocket binary protocol"
  },
  {
    icon: Users,
    title: "Multi-User Presence",
    description: "Real-time cursor tracking, selections, and awareness protocol"
  },
  {
    icon: Server,
    title: "Scalable Architecture",
    description: "Stateless WebSocket servers with Redis pub/sub for horizontal scaling"
  },
  {
    icon: Activity,
    title: "Live Metrics",
    description: "Real-time dashboard showing latency percentiles, throughput, and connections"
  },
  {
    icon: Shield,
    title: "Offline-First",
    description: "Local-first editing with automatic sync when connection restores"
  }
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');

  const handleCreateRoom = () => {
    const newRoomId = uuidv4().slice(0, 8);
    navigate(`/editor/${newRoomId}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/editor/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      {/* Header */}
      <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <span className="font-heading text-xl font-bold tracking-tight">ConcurrencyPad</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#architecture" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Architecture
            </a>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCreateRoom}
              data-testid="header-create-room-btn"
            >
              Try Demo
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 md:py-32">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Real-time Collaboration Demo
          </div>
          
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Collaborative Editor
            <br />
            <span className="text-primary">Built for Scale</span>
          </h1>
          
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            A real-time collaborative text editor demonstrating distributed systems concepts: 
            CRDT synchronization, WebSocket presence, and observable metrics.
          </p>

          {/* Action Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-primary/50 transition-colors">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-heading">Create New Room</CardTitle>
                <CardDescription>Start a fresh collaborative session</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full gap-2" 
                  onClick={handleCreateRoom}
                  data-testid="create-room-btn"
                >
                  Create Room
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-primary/50 transition-colors">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-heading">Join Existing Room</CardTitle>
                <CardDescription>Enter a room ID to collaborate</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleJoinRoom} className="flex gap-2">
                  <Input
                    placeholder="Room ID..."
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="bg-zinc-800/50 border-zinc-700"
                    data-testid="room-id-input"
                  />
                  <Button type="submit" variant="secondary" data-testid="join-room-btn">
                    Join
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20 border-t border-zinc-800/50">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl font-bold mb-4">System Design Highlights</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Each feature demonstrates a key distributed systems concept you can discuss in interviews
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="bg-zinc-900/30 border-zinc-800 hover:border-zinc-700 transition-all h-full metric-card">
                  <CardHeader>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-base font-heading">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Architecture Section */}
      <section id="architecture" className="max-w-7xl mx-auto px-6 py-20 border-t border-zinc-800/50">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl font-bold mb-4">Architecture Overview</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              How the system handles concurrent edits, presence, and persistence
            </p>
          </div>

          <Card className="bg-zinc-900/30 border-zinc-800 p-8">
            <div className="font-mono text-sm text-muted-foreground space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-32 text-right text-foreground">Client A</div>
                <div className="flex-1 h-px bg-primary/50" />
                <div className="px-3 py-1 rounded bg-primary/20 text-primary">Yjs CRDT</div>
                <div className="flex-1 h-px bg-primary/50" />
                <div className="w-32 text-foreground">Client B</div>
              </div>
              
              <div className="flex justify-center">
                <div className="h-8 w-px bg-zinc-700" />
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-32" />
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center gap-2">
                    <Server className="w-4 h-4 text-chart-2" />
                    <span className="text-foreground">WebSocket Server</span>
                  </div>
                </div>
                <div className="w-32" />
              </div>
              
              <div className="flex justify-center gap-16">
                <div className="h-8 w-px bg-zinc-700" />
                <div className="h-8 w-px bg-zinc-700" />
              </div>
              
              <div className="flex items-center justify-center gap-8">
                <div className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-chart-4" />
                  <span className="text-foreground">Redis Pub/Sub</span>
                </div>
                <div className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-chart-3" />
                  <span className="text-foreground">MongoDB</span>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-8 grid md:grid-cols-3 gap-6 text-sm">
            <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800">
              <h4 className="font-heading font-bold text-chart-1 mb-2">CRDT Guarantees</h4>
              <p className="text-muted-foreground">
                Yjs ensures all clients converge to the same state regardless of operation order. 
                No central authority needed.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800">
              <h4 className="font-heading font-bold text-chart-2 mb-2">Presence Protocol</h4>
              <p className="text-muted-foreground">
                Awareness protocol broadcasts cursor positions and selections with minimal bandwidth 
                using delta updates.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800">
              <h4 className="font-heading font-bold text-chart-3 mb-2">Persistence Strategy</h4>
              <p className="text-muted-foreground">
                Documents persist to MongoDB on-demand. State vector enables efficient sync for 
                late joiners.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>
            Built to demonstrate system design skills: concurrency, distributed state, 
            real-time sync, and observability.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
