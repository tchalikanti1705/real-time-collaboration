import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import * as Y from 'yjs';

const Editor = ({ 
  ydoc, 
  currentUser, 
  users, 
  onUpdate, 
  onCursor, 
  onSelection,
  isConnected 
}) => {
  const editorRef = useRef(null);
  const [content, setContent] = useState('');
  const [cursorPosition, setCursorPosition] = useState({ line: 0, column: 0 });
  const isLocalUpdateRef = useRef(false);
  const ytextRef = useRef(null);

  // Initialize Yjs text type
  useEffect(() => {
    if (!ydoc) return;
    
    ytextRef.current = ydoc.getText('content');
    
    // Set initial content
    setContent(ytextRef.current.toString());
    
    // Observe changes
    const observer = (event, transaction) => {
      if (!isLocalUpdateRef.current) {
        setContent(ytextRef.current.toString());
      }
      isLocalUpdateRef.current = false;
    };
    
    ytextRef.current.observe(observer);
    
    // Listen for updates to broadcast
    const updateHandler = (update, origin) => {
      if (origin === 'local') {
        onUpdate(update);
      }
    };
    
    ydoc.on('update', updateHandler);
    
    return () => {
      ytextRef.current.unobserve(observer);
      ydoc.off('update', updateHandler);
    };
  }, [ydoc, onUpdate]);

  // Handle text changes
  const handleInput = useCallback((e) => {
    if (!ytextRef.current || !ydoc) return;
    
    const newContent = e.target.innerText;
    const oldContent = ytextRef.current.toString();
    
    if (newContent === oldContent) return;
    
    isLocalUpdateRef.current = true;
    
    // Calculate diff and apply to Yjs
    ydoc.transact(() => {
      // Simple diff: delete all and insert new (for demo)
      // In production, use a proper diff algorithm
      const deleteLength = oldContent.length;
      if (deleteLength > 0) {
        ytextRef.current.delete(0, deleteLength);
      }
      if (newContent.length > 0) {
        ytextRef.current.insert(0, newContent);
      }
    }, 'local');
    
    setContent(newContent);
  }, [ydoc]);

  // Handle cursor movement
  const handleSelect = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !editorRef.current) return;
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    
    const start = preCaretRange.toString().length;
    const text = content.substring(0, start);
    const lines = text.split('\n');
    const line = lines.length - 1;
    const column = lines[lines.length - 1].length;
    
    const position = { line, column, offset: start };
    setCursorPosition(position);
    onCursor(position);
    
    // Send selection if there is one
    if (!selection.isCollapsed) {
      onSelection({
        start: start,
        end: start + selection.toString().length
      });
    }
  }, [content, onCursor, onSelection]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  }, []);

  // Calculate line numbers
  const lineCount = content.split('\n').length || 1;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Get cursor elements for remote users
  const remoteCursors = users.filter(u => u.cursor_position).map(user => {
    const pos = user.cursor_position;
    const lines = content.split('\n');
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    offset += Math.min(pos.column, lines[pos.line]?.length || 0);
    
    return {
      ...user,
      offset
    };
  });

  return (
    <div 
      className="editor-container h-full flex flex-col relative"
      data-testid="collaborative-editor"
    >
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs text-muted-foreground ml-2">document.txt</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Ln {cursorPosition.line + 1}, Col {cursorPosition.column + 1}
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div className="w-12 bg-zinc-900/30 border-r border-zinc-800 py-4 select-none overflow-hidden">
          <div className="font-mono text-xs text-right pr-3 text-zinc-600 leading-6">
            {lineNumbers.map(num => (
              <div key={num} className={cursorPosition.line + 1 === num ? 'text-zinc-400' : ''}>
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative overflow-auto">
          {/* Remote Cursors */}
          {remoteCursors.map(user => (
            <RemoteCursor key={user.id} user={user} content={content} />
          ))}

          {/* Editable Content */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="editor-content font-mono text-sm leading-6 text-foreground outline-none p-4 min-h-full"
            onInput={handleInput}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            data-testid="editor-content"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {content || '// Start typing here...\n// Your changes sync in real-time with other users.\n\n// Try opening this room in another browser tab!'}
          </div>
        </div>
      </div>

      {/* Connection overlay */}
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center"
        >
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Reconnecting...</p>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// Remote cursor component
const RemoteCursor = ({ user, content }) => {
  const pos = user.cursor_position;
  if (!pos) return null;

  // Calculate pixel position (approximate)
  const lines = content.split('\n');
  const top = pos.line * 24 + 16; // 24px line height + padding
  const left = pos.column * 8.4 + 64; // ~8.4px per char + line number width

  return (
    <div 
      className="absolute pointer-events-none z-10"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative"
      >
        {/* Cursor line */}
        <div 
          className="w-0.5 h-5 rounded-full"
          style={{ backgroundColor: user.color }}
        />
        {/* User label */}
        <div 
          className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
          style={{ 
            backgroundColor: user.color,
            color: '#fff'
          }}
        >
          {user.name}
        </div>
      </motion.div>
    </div>
  );
};

export default Editor;
