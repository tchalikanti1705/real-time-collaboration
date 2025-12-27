import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare,
  UserPlus,
  UserMinus,
  Wifi,
  WifiOff,
  Edit3,
  Bot,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const eventTypeConfig = {
  connect: {
    icon: Wifi,
    color: '#10B981',
    label: 'Connected'
  },
  disconnect: {
    icon: WifiOff,
    color: '#F43F5E',
    label: 'Disconnected'
  },
  join: {
    icon: UserPlus,
    color: '#3B82F6',
    label: 'Joined'
  },
  user_left: {
    icon: UserMinus,
    color: '#F59E0B',
    label: 'Left'
  },
  update: {
    icon: Edit3,
    color: '#8B5CF6',
    label: 'Update'
  },
  simulate: {
    icon: Bot,
    color: '#EC4899',
    label: 'Simulated'
  },
  default: {
    icon: Activity,
    color: '#71717A',
    label: 'Event'
  }
};

const EventLog = ({ events }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <div className="h-full flex flex-col" data-testid="event-log">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-bold text-sm">Event Log</h3>
          <Badge variant="secondary" className="ml-auto text-xs">
            {events.length}
          </Badge>
        </div>
      </div>

      {/* Events List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <AnimatePresence initial={false}>
            {[...events].reverse().map((event) => {
              const config = eventTypeConfig[event.type] || eventTypeConfig.default;
              const Icon = config.icon;

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  layout
                  className={`event-log-item ${event.type} p-2 rounded text-sm`}
                >
                  <div className="flex items-start gap-2">
                    <div 
                      className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: config.color + '20' }}
                    >
                      <Icon className="w-3 h-3" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span 
                          className="font-medium text-xs"
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {event.details || `Room: ${event.room_id}`}
                      </p>
                      {event.user_id && (
                        <code className="text-[10px] text-zinc-500 font-mono">
                          {event.user_id.slice(0, 12)}...
                        </code>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {events.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No events yet</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-800 text-xs text-muted-foreground text-center">
        Real-time event stream
      </div>
    </div>
  );
};

export default EventLog;
