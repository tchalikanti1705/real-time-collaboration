import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';

// Dynamic URL based on environment - works for both local dev and Docker
const getBackendUrl = () => {
  // In production/Docker, use relative URLs (nginx proxy handles it)
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  // In development, use localhost
  return 'http://localhost:8001';
};

const getWsUrl = () => {
  // In production/Docker, use relative WebSocket URL
  if (process.env.NODE_ENV === 'production') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  // In development, use localhost
  return 'ws://localhost:8001';
};

const BACKEND_URL = getBackendUrl();
const WS_URL = getWsUrl();

// Helper functions for hex encoding/decoding (browser-compatible)
const toHex = (uint8Array) => {
  return Array.from(uint8Array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const fromHex = (hexString) => {
  const bytes = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
};

// Get user from localStorage or redirect to home
const getStoredUser = () => {
  try {
    const stored = localStorage.getItem('coedit_user');
    if (stored) {
      const user = JSON.parse(stored);
      // Ensure user has all required fields
      if (user.id && user.name && user.color) {
        return user;
      }
    }
  } catch (e) {
    console.error('Failed to parse user from localStorage:', e);
  }
  return null;
};

const EditorPage = () => {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId] = useState(urlRoomId || uuidv4().slice(0, 8));
  const [isConnected, setIsConnected] = useState(false);
  const [content, setContent] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState({}); // { oderId: { name, color, cursorPosition } }
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  
  // Get user from localStorage, redirect if not found
  const storedUser = getStoredUser();
  const [currentUser] = useState(() => {
    if (!storedUser) {
      // Will redirect in useEffect
      return { id: '', name: 'Anonymous', color: '#3B82F6' };
    }
    return storedUser;
  });
  
  const wsRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  // Use a unique session ID for each tab (different from user ID)
  const sessionIdRef = useRef(uuidv4());
  const reconnectTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  const isLocalUpdateRef = useRef(false);
  const lastSentStateRef = useRef('');
  const cursorOverlayRef = useRef(null);

  // Calculate cursor position in pixels from character index
  const getCursorCoordinates = useCallback((position) => {
    const textarea = editorRef.current;
    if (!textarea) return null;

    // Create a hidden div to measure text
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    
    // Copy textarea styles
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.width = style.width;
    div.style.padding = style.padding;
    div.style.fontFamily = style.fontFamily;
    div.style.fontSize = style.fontSize;
    div.style.lineHeight = style.lineHeight;
    div.style.letterSpacing = style.letterSpacing;
    
    // Get text up to cursor position
    const textBeforeCursor = textarea.value.substring(0, position);
    div.textContent = textBeforeCursor;
    
    // Add a span at cursor position to measure
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);
    
    document.body.appendChild(div);
    
    const spanRect = span.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    
    const coords = {
      left: spanRect.left - divRect.left,
      top: spanRect.top - divRect.top
    };
    
    document.body.removeChild(div);
    
    return coords;
  }, []);

  // Redirect to home if no user is set
  useEffect(() => {
    if (!storedUser) {
      navigate('/');
    }
  }, [storedUser, navigate]);

  // Initialize Yjs document
  useEffect(() => {
    ydocRef.current = new Y.Doc();
    ytextRef.current = ydocRef.current.getText('content');
    
    // Observe changes from remote
    const observer = () => {
      if (!isLocalUpdateRef.current) {
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

  // Handle incoming messages
  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'sync':
        if (message.data) {
          try {
            const update = fromHex(message.data);
            Y.applyUpdate(ydocRef.current, update);
            const newContent = ytextRef.current.toString();
            setContent(newContent);
            console.log('Synced content:', newContent.slice(0, 50) + '...');
          } catch (e) {
            console.error('Sync error:', e);
          }
        }
        break;
        
      case 'update':
        if (message.data && message.from !== sessionIdRef.current) {
          try {
            const update = fromHex(message.data);
            Y.applyUpdate(ydocRef.current, update);
            const newContent = ytextRef.current.toString();
            setContent(newContent);
            console.log('Remote update received:', newContent.slice(0, 50) + '...');
          } catch (e) {
            console.error('Update error:', e);
          }
        }
        break;

      case 'cursor':
        // Update remote user cursor position
        if (message.userId && message.userId !== sessionIdRef.current) {
          console.log('Received cursor from', message.name, 'at position', message.position);
          setRemoteUsers(prev => ({
            ...prev,
            [message.userId]: {
              name: message.name || 'Anonymous',
              color: message.color || '#3B82F6',
              cursorPosition: message.position
            }
          }));
        }
        break;

      case 'user_joined':
        // Add new user to the list
        if (message.userId && message.userId !== sessionIdRef.current) {
          setRemoteUsers(prev => ({
            ...prev,
            [message.userId]: {
              name: message.name || 'Anonymous',
              color: message.color || '#3B82F6',
              cursorPosition: null
            }
          }));
        }
        break;

      case 'user_left':
        // Remove user from the list
        if (message.userId) {
          setRemoteUsers(prev => {
            const updated = { ...prev };
            delete updated[message.userId];
            return updated;
          });
        }
        break;

      case 'users_list':
        // Initial list of users in the room
        if (message.users) {
          const users = {};
          message.users.forEach(user => {
            if (user.id !== sessionIdRef.current) {
              users[user.id] = {
                name: user.name || 'Anonymous',
                color: user.color || '#3B82F6',
                cursorPosition: user.cursorPosition || null
              };
            }
          });
          setRemoteUsers(users);
        }
        break;
        
      default:
        break;
    }
  }, []);

  // WebSocket connection
  const connect = useCallback(() => {
    if (!currentUser || !currentUser.id) return;
    
    try {
      const ws = new WebSocket(`${WS_URL}/api/ws/${roomId}?client_id=${sessionIdRef.current}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected to room:', roomId);
        
        // Send join message
        ws.send(JSON.stringify({
          type: 'join',
          name: currentUser.name,
          color: currentUser.color
        }));
        
        // Request sync to get the latest document state
        ws.send(JSON.stringify({
          type: 'sync_request'
        }));
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
            setContent(ytextRef.current.toString());
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected, reconnecting...');
        
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('Connection error:', e);
    }
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

  // Navigate to URL with roomId
  useEffect(() => {
    if (!urlRoomId && roomId) {
      navigate(`/editor/${roomId}`, { replace: true });
    }
  }, [roomId, urlRoomId, navigate]);

  // Handle text input
  const handleInput = useCallback((e) => {
    if (!ytextRef.current || !ydocRef.current) return;
    
    const newContent = e.target.value;
    const oldContent = ytextRef.current.toString();
    
    if (newContent === oldContent) return;
    
    isLocalUpdateRef.current = true;
    
    // Apply changes to Yjs using a diff approach
    ydocRef.current.transact(() => {
      // Find the first difference
      let start = 0;
      while (start < oldContent.length && start < newContent.length && oldContent[start] === newContent[start]) {
        start++;
      }
      
      // Find the last difference
      let oldEnd = oldContent.length;
      let newEnd = newContent.length;
      while (oldEnd > start && newEnd > start && oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }
      
      // Delete the changed portion
      if (oldEnd > start) {
        ytextRef.current.delete(start, oldEnd - start);
      }
      
      // Insert the new content
      if (newEnd > start) {
        ytextRef.current.insert(start, newContent.slice(start, newEnd));
      }
    }, 'local');
    
    setContent(newContent);
    
    // Send update to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const update = Y.encodeStateAsUpdate(ydocRef.current);
      const hexData = toHex(update);
      
      // Only send if the state actually changed
      if (hexData !== lastSentStateRef.current) {
        lastSentStateRef.current = hexData;
        wsRef.current.send(JSON.stringify({
          type: 'update',
          data: hexData
        }));
        console.log('Sent update, content:', newContent.slice(0, 50) + '...');
      }
      
      // Also send cursor position on every keystroke
      const cursorPos = e.target.selectionStart;
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        userId: sessionIdRef.current,
        name: currentUser.name,
        color: currentUser.color,
        position: cursorPos
      }));
    }
  }, [currentUser]);

  // Send cursor position to other users
  const sendCursorPosition = useCallback((position) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        userId: sessionIdRef.current,
        name: currentUser.name,
        color: currentUser.color,
        position: position
      }));
    }
  }, [currentUser]);

  // Handle cursor/selection changes
  const handleSelect = useCallback((e) => {
    const textarea = e.target;
    const position = textarea.selectionStart;
    sendCursorPosition(position);
  }, [sendCursorPosition]);

  // Get number of active remote users
  const activeRemoteUsers = Object.keys(remoteUsers).length;

  // Fetch metrics from backend
  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/metrics`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // Handle show metrics button click
  const handleShowMetrics = useCallback(() => {
    setShowMetrics(true);
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-2 sm:px-4 py-2 sm:py-3 shadow-sm">
        {/* Mobile: Stack layout, Desktop: Row layout */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          {/* Top row on mobile: Back button and Room ID */}
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
            <button 
              onClick={() => navigate('/')}
              className="text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium"
            >
              ← Back
            </button>
            <div className="hidden sm:block h-4 w-px bg-gray-300" />
            <span className="text-gray-600 text-xs sm:text-sm truncate">Room: <span className="font-mono font-medium text-gray-900">{roomId}</span></span>
          </div>
          
          {/* Bottom row on mobile: All controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end sm:justify-start">
          {/* Current User */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-gray-100">
            <div 
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold"
              style={{ backgroundColor: currentUser.color }}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs sm:text-sm text-gray-700 font-medium hidden xs:inline">{currentUser.name}</span>
          </div>

          {/* Remote Users */}
          {activeRemoteUsers > 0 && (
            <div className="flex items-center">
              <div className="flex -space-x-1.5 sm:-space-x-2">
                {Object.entries(remoteUsers).slice(0, 3).map(([userId, user]) => (
                  <div
                    key={userId}
                    className="w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold border-2 border-white shadow-sm cursor-default"
                    style={{ backgroundColor: user.color }}
                    title={user.name}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {activeRemoteUsers > 3 && (
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold border-2 border-white bg-gray-500 text-white">
                    +{activeRemoteUsers - 3}
                  </div>
                )}
              </div>
              <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-sm text-gray-500 hidden sm:inline">
                {activeRemoteUsers} other{activeRemoteUsers > 1 ? 's' : ''} editing
              </span>
            </div>
          )}

          {/* Divider - hidden on mobile */}
          <div className="hidden sm:block h-4 w-px bg-gray-300" />
          
          {/* Metrics Button */}
          <button
            onClick={handleShowMetrics}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-gray-700"
          >
            <span className="hidden sm:inline">Metrics</span>
            <span className="sm:hidden">📊</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-gray-700"
          >
            <span className="hidden sm:inline">{darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
            <span className="sm:hidden">{darkMode ? '☀️' : '🌙'}</span>
          </button>
          
          {/* Connection Status */}
          <div className={`text-[10px] sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded font-medium ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            <span className="hidden sm:inline">{isConnected ? '● Connected' : '○ Disconnected'}</span>
            <span className="sm:hidden">{isConnected ? '●' : '○'}</span>
          </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Container - Google Docs Style */}
        <div className="flex-1 overflow-auto bg-gray-200 relative">
          <div className="flex justify-center py-2 sm:py-4 md:py-8 px-2 sm:px-4">
            <div 
              className={`shadow-lg transition-all duration-300 relative w-full md:w-auto ${
                darkMode 
                  ? 'bg-gray-900' 
                  : 'bg-white'
              }`}
              style={{ 
                maxWidth: '816px',
                minHeight: 'calc(100vh - 120px)'
              }}
            >
              {/* Cursor overlay - positioned absolutely over textarea */}
              <div 
                ref={cursorOverlayRef}
                className="absolute inset-0 pointer-events-none p-4 sm:p-8 md:p-16 overflow-hidden"
                style={{ 
                  fontFamily: 'Arial, sans-serif',
                  fontSize: '11pt',
                  lineHeight: '1.5'
                }}
              >
                {Object.entries(remoteUsers).map(([oderId, user]) => {
                  if (user.cursorPosition === null || user.cursorPosition === undefined) return null;
                  
                  // Calculate position based on text content
                  const textBeforeCursor = content.substring(0, user.cursorPosition);
                  const lines = textBeforeCursor.split('\n');
                  const lineNumber = lines.length - 1;
                  const columnNumber = lines[lines.length - 1].length;
                  
                  // Approximate character width and line height
                  const charWidth = 8.8; // approximate for 11pt Arial
                  const lineHeight = 22; // 1.5 line height for 11pt
                  
                  const left = columnNumber * charWidth;
                  const top = lineNumber * lineHeight;
                  
                  return (
                    <div
                      key={oderId}
                      className="absolute transition-all duration-100"
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        zIndex: 10
                      }}
                    >
                      {/* Cursor line */}
                      <div 
                        className="w-0.5 h-5 animate-pulse"
                        style={{ backgroundColor: user.color }}
                      />
                      {/* Name label */}
                      <div 
                        className="absolute left-0 -top-5 px-1.5 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap shadow-md"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.name}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <textarea
                ref={editorRef}
                value={content}
                onChange={handleInput}
                onSelect={handleSelect}
                onClick={handleSelect}
                onKeyUp={handleSelect}
                placeholder="Start typing your document..."
                className={`w-full h-full p-4 sm:p-8 md:p-16 text-sm sm:text-base leading-relaxed resize-none focus:outline-none relative z-0 ${
                  darkMode 
                    ? 'bg-gray-900 text-white placeholder-gray-500' 
                    : 'bg-white text-black placeholder-gray-400'
                }`}
                style={{ 
                  minHeight: 'calc(100vh - 120px)',
                  fontFamily: 'Arial, sans-serif',
                  fontSize: 'clamp(10pt, 2.5vw, 11pt)',
                  lineHeight: '1.5',
                  caretColor: darkMode ? 'white' : 'black'
                }}
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Metrics Modal */}
      {showMetrics && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className={`rounded-lg shadow-xl max-w-lg w-full mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className={`text-base sm:text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Server Metrics
              </h2>
              <button
                onClick={() => setShowMetrics(false)}
                className={`p-1 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-4 sm:px-6 py-3 sm:py-4">
              {metricsLoading ? (
                <div className={`text-center py-6 sm:py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Loading metrics...
                </div>
              ) : metrics ? (
                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Connections</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.active_connections}</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rooms</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.rooms_active}</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Msg/sec</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.messages_per_sec?.toFixed(2) || '0.00'}</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Messages</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.total_messages?.toLocaleString() || '0'}</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>P50 Latency</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.p50_latency_ms?.toFixed(1) || '0'} ms</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>P95 Latency</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.p95_latency_ms?.toFixed(1) || '0'} ms</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Errors</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.error_count || 0}</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Reconnects</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metrics.reconnect_count || 0}</div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg col-span-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Uptime</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {metrics.uptime_seconds ? `${Math.floor(metrics.uptime_seconds / 3600)}h ${Math.floor((metrics.uptime_seconds % 3600) / 60)}m ${Math.floor(metrics.uptime_seconds % 60)}s` : '0s'}
                    </div>
                  </div>
                  <div className={`p-2 sm:p-3 rounded-lg col-span-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Doc Size</div>
                    <div className={`text-lg sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {metrics.total_doc_size_bytes ? `${(metrics.total_doc_size_bytes / 1024).toFixed(2)} KB` : '0 KB'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Failed to load metrics
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t flex justify-between ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={fetchMetrics}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                 Refresh
              </button>
              <button
                onClick={() => setShowMetrics(false)}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
