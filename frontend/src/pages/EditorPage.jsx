import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { 
  Users, 
  Terminal, 
  Activity,
  Wifi,
  WifiOff,
  Copy,
  Check,
  ChevronLeft,
  Settings,
  BarChart3,
  MessageSquare,
  Zap,
  Clock,
  HardDrive,
  AlertCircle,
  RefreshCw,
  Play,
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import Editor from '@/components/Editor';
import MetricsDashboard from '@/components/MetricsDashboard';
import PresenceSidebar from '@/components/PresenceSidebar';
import EventLog from '@/components/EventLog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const CURSOR_COLORS = [
  '#F43F5E', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#EF4444', '#6366F1'
];

const EditorPage = () => {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(urlRoomId || uuidv4().slice(0, 8));
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [users, setUsers] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [events, setEvents] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showEvents, setShowEvents] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  const wsRef = useRef(null);
  const ydocRef = useRef(null);
  const clientIdRef = useRef(uuidv4());
  const reconnectTimeoutRef = useRef(null);

  // Initialize user
  useEffect(() => {
    const storedUser = localStorage.getItem('concurrencypad_user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    } else {
      const newUser = {
        id: clientIdRef.current,
        name: `User-${clientIdRef.current.slice(0, 6)}`,
        color: CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
      };
      localStorage.setItem('concurrencypad_user', JSON.stringify(newUser));
      setCurrentUser(newUser);
    }
  }, []);

  // Initialize Yjs document
  useEffect(() => {
    ydocRef.current = new Y.Doc();
    return () => {
      ydocRef.current?.destroy();
    };
  }, []);

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'users':
        setUsers(message.users || []);
        break;
        
      case 'user_joined':
        setUsers(prev => {
          if (prev.find(u => u.id === message.user.id)) {
            return prev;
          }
          return [...prev, message.user];
        });
        if (message.user.id !== clientIdRef.current) {
          toast.info(`${message.user.name} joined`, {
            icon: <UserPlus className="w-4 h-4" />
          });
        }
        break;
        
      case 'user_left':
        setUsers(prev => prev.filter(u => u.id !== message.user_id));
        break;
        
      case 'cursor':
      case 'selection':
        setUsers(prev => prev.map(u => {
          if (u.id === message.user_id) {
            return {
              ...u,
              cursor_position: message.type === 'cursor' ? message.position : u.cursor_position,
              selection: message.type === 'selection' ? message.selection : u.selection
            };
          }
          return u;
        }));
        break;
        
      case 'sync':
        if (message.data) {
          try {
            const update = new Uint8Array(Buffer.from(message.data, 'hex'));
            Y.applyUpdate(ydocRef.current, update);
          } catch (e) {
            console.error('Sync error:', e);
          }
        }
        break;
        
      case 'update':
        if (message.data && message.from !== clientIdRef.current) {
          try {
            const update = new Uint8Array(Buffer.from(message.data, 'hex'));
            Y.applyUpdate(ydocRef.current, update);
          } catch (e) {
            console.error('Update error:', e);
          }
        }
        break;
        
      case 'pong':
        // Calculate latency
        const latency = Date.now() - message.timestamp;
        console.log('Latency:', latency, 'ms');
        break;
        
      default:
        break;
    }
  }, []);

  // WebSocket connection
  const connect = useCallback(() => {
    if (!currentUser) return;
    
    const ws = new WebSocket(`${WS_URL}/api/ws/${roomId}?client_id=${clientIdRef.current}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsSyncing(true);
      
      // Send join message
      ws.send(JSON.stringify({
        type: 'join',
        name: currentUser.name,
        color: currentUser.color
      }));
      
      toast.success('Connected to room', {
        description: `Room: ${roomId}`
      });
      
      setTimeout(() => setIsSyncing(false), 1000);
    };

    ws.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } else {
          // Binary message - Yjs update
          const update = new Uint8Array(event.data);
          Y.applyUpdate(ydocRef.current, update);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      toast.error('Disconnected', {
        description: 'Attempting to reconnect...'
      });
      
      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [roomId, currentUser, handleMessage]);

  // Connect on mount
  useEffect(() => {
    if (currentUser) {
      connect();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect, currentUser]);

  // Navigate to new URL if roomId changes
  useEffect(() => {
    if (!urlRoomId && roomId) {
      navigate(`/editor/${roomId}`, { replace: true });
    }
  }, [roomId, urlRoomId, navigate]);

  // Fetch metrics periodically
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/metrics`);
        const data = await res.json();
        setMetrics(data);
      } catch (e) {
        console.error('Failed to fetch metrics:', e);
      }
    };

    const fetchEvents = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/metrics/events?limit=50`);
        const data = await res.json();
        setEvents(data);
      } catch (e) {
        console.error('Failed to fetch events:', e);
      }
    };

    fetchMetrics();
    fetchEvents();
    
    const interval = setInterval(() => {
      fetchMetrics();
      fetchEvents();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Send document updates
  const sendUpdate = useCallback((update) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update',
        data: Buffer.from(update).toString('hex')
      }));
    }
  }, []);

  // Send cursor position
  const sendCursor = useCallback((position) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        position
      }));
    }
  }, []);

  // Send selection
  const sendSelection = useCallback((selection) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'selection',
        selection
      }));
    }
  }, []);

  // Copy room link
  const copyRoomLink = async () => {
    const link = `${window.location.origin}/editor/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Fallback for when clipboard API is not available or permission denied
      console.warn('Clipboard API failed, using fallback:', error);
      
      // Create a temporary textarea element
      const textArea = document.createElement('textarea');
      textArea.value = link;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success('Link copied!');
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
        toast.error('Failed to copy link');
      }
      
      document.body.removeChild(textArea);
    }
  };

  // Simulate users for load testing
  const simulateUsers = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/simulate/users/${roomId}?count=10`, {
        method: 'POST'
      });
      const data = await res.json();
      toast.success(`Added ${data.simulated_users} simulated users`);
    } catch (e) {
      toast.error('Failed to simulate users');
    }
    setIsSimulating(false);
  };

  const removeSimulatedUsers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/simulate/users/${roomId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      toast.success(`Removed ${data.removed} simulated users`);
    } catch (e) {
      toast.error('Failed to remove simulated users');
    }
  };

  const otherUsers = users.filter(u => u.id !== clientIdRef.current);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col" data-testid="editor-page">
        {/* Header */}
        <header className="h-14 border-b border-zinc-800 flex items-center px-4 gap-4 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            data-testid="back-btn"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="font-heading font-bold">ConcurrencyPad</span>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800">
            <span className="text-xs text-muted-foreground">Room:</span>
            <code className="text-sm font-mono text-foreground">{roomId}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={copyRoomLink}
              data-testid="copy-link-btn"
            >
              {copied ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
          
          <div className="flex-1" />
          
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <Badge 
              variant={isConnected ? "default" : "destructive"}
              className={`gap-1.5 ${isConnected ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  {isSyncing ? 'Syncing...' : 'Connected'}
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  Disconnected
                </>
              )}
            </Badge>
            
            <div className="avatar-stack">
              {otherUsers.slice(0, 3).map((user) => (
                <Tooltip key={user.id}>
                  <TooltipTrigger asChild>
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{ backgroundColor: user.color + '30', color: user.color, border: `2px solid ${user.color}` }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{user.name}</TooltipContent>
                </Tooltip>
              ))}
              {otherUsers.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs">
                  +{otherUsers.length - 3}
                </div>
              )}
            </div>
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showMetrics ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowMetrics(!showMetrics)}
                  data-testid="toggle-metrics-btn"
                >
                  <BarChart3 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Metrics Dashboard</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showEvents ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowEvents(!showEvents)}
                  data-testid="toggle-events-btn"
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Event Log</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Presence Sidebar */}
          <PresenceSidebar 
            users={users} 
            currentUserId={clientIdRef.current}
            onSimulate={simulateUsers}
            onRemoveSimulated={removeSimulatedUsers}
            isSimulating={isSimulating}
          />

          {/* Editor Area */}
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Metrics Bar */}
            {showMetrics && metrics && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-zinc-800 bg-zinc-950/50"
              >
                <MetricsDashboard metrics={metrics} />
              </motion.div>
            )}
            
            {/* Editor */}
            <div className="flex-1 p-6 overflow-auto">
              <Editor 
                ydoc={ydocRef.current}
                currentUser={currentUser}
                users={otherUsers}
                onUpdate={sendUpdate}
                onCursor={sendCursor}
                onSelection={sendSelection}
                isConnected={isConnected}
              />
            </div>
            
            {/* Status Bar */}
            <div className="h-8 border-t border-zinc-800 bg-zinc-950/80 flex items-center px-4 text-xs text-muted-foreground gap-4">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                <span>{users.length} user{users.length !== 1 ? 's' : ''}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                <span>P50: {metrics?.p50_latency_ms || 0}ms</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>P95: {metrics?.p95_latency_ms || 0}ms</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                <span>{metrics?.messages_per_sec || 0} msg/s</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive className="w-3 h-3" />
                <span>{((metrics?.total_doc_size_bytes || 0) / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">CRDT:</span>
                <span className="text-primary">Yjs</span>
              </div>
            </div>
          </main>

          {/* Event Log Sidebar */}
          <AnimatePresence>
            {showEvents && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-l border-zinc-800 bg-zinc-950/50 overflow-hidden"
              >
                <EventLog events={events} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default EditorPage;
