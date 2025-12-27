import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  UserPlus, 
  Trash2,
  Circle,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PresenceSidebar = ({ 
  users, 
  currentUserId, 
  onSimulate, 
  onRemoveSimulated,
  isSimulating 
}) => {
  const realUsers = users.filter(u => !u.simulated);
  const simulatedUsers = users.filter(u => u.simulated);

  return (
    <aside 
      className="w-64 border-r border-zinc-800 bg-zinc-950/50 flex flex-col"
      data-testid="presence-sidebar"
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-bold text-sm">Collaborators</h3>
          <Badge variant="secondary" className="ml-auto text-xs">
            {users.length}
          </Badge>
        </div>
      </div>

      {/* User List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* Current User */}
          <AnimatePresence>
            {users.filter(u => u.id === currentUserId).map(user => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <UserItem user={user} isCurrentUser={true} />
              </motion.div>
            ))}
          </AnimatePresence>

          {realUsers.filter(u => u.id !== currentUserId).length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide px-2 py-1">
                Other Users
              </p>
            </>
          )}

          {/* Other Real Users */}
          <AnimatePresence>
            {realUsers.filter(u => u.id !== currentUserId).map(user => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                layout
              >
                <UserItem user={user} />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Simulated Users */}
          {simulatedUsers.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  Simulated
                </p>
                <Badge variant="outline" className="text-xs">
                  {simulatedUsers.length}
                </Badge>
              </div>
            </>
          )}

          <AnimatePresence>
            {simulatedUsers.map(user => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                layout
              >
                <UserItem user={user} isSimulated={true} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Load Testing Controls */}
      <div className="p-3 border-t border-zinc-800 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Load Testing
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={onSimulate}
          disabled={isSimulating}
          data-testid="simulate-users-btn"
        >
          {isSimulating ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          Add 10 Users
        </Button>
        
        {simulatedUsers.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-destructive hover:text-destructive"
            onClick={onRemoveSimulated}
            data-testid="remove-simulated-btn"
          >
            <Trash2 className="w-4 h-4" />
            Remove Simulated
          </Button>
        )}
      </div>
    </aside>
  );
};

const UserItem = ({ user, isCurrentUser, isSimulated }) => (
  <div 
    className={`
      flex items-center gap-3 px-3 py-2 rounded-md transition-colors
      ${isCurrentUser ? 'bg-primary/10 border border-primary/20' : 'hover:bg-zinc-800/50'}
    `}
  >
    {/* Avatar */}
    <div className="relative">
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
        style={{ 
          backgroundColor: user.color + '30', 
          color: user.color,
          border: `2px solid ${user.color}`
        }}
      >
        {isSimulated ? (
          <Bot className="w-4 h-4" />
        ) : (
          user.name.charAt(0).toUpperCase()
        )}
      </div>
      <Circle 
        className="w-3 h-3 absolute -bottom-0.5 -right-0.5 fill-green-500 text-green-500"
      />
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">
        {user.name}
        {isCurrentUser && <span className="text-muted-foreground ml-1">(you)</span>}
      </p>
      {user.cursor_position && (
        <p className="text-xs text-muted-foreground">
          Ln {user.cursor_position.line + 1}, Col {user.cursor_position.column + 1}
        </p>
      )}
    </div>

    {/* Color indicator */}
    <div 
      className="w-2 h-2 rounded-full"
      style={{ backgroundColor: user.color }}
    />
  </div>
);

export default PresenceSidebar;
