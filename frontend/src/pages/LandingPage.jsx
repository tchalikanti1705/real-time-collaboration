import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

// Random colors for users
const CURSOR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('name'); // 'name' or 'room'
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [action, setAction] = useState(''); // 'create' or 'join'

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (userName.trim()) {
      // Store user info in localStorage
      const userColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
      localStorage.setItem('coedit_user', JSON.stringify({
        name: userName.trim(),
        color: userColor,
        id: uuidv4()
      }));

      if (action === 'create') {
        const newRoomId = uuidv4().slice(0, 8);
        navigate(`/editor/${newRoomId}`);
      } else {
        setStep('room');
      }
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/editor/${roomId.trim()}`);
    }
  };

  const handleCreateClick = () => {
    setAction('create');
    if (userName.trim()) {
      const userColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
      localStorage.setItem('coedit_user', JSON.stringify({
        name: userName.trim(),
        color: userColor,
        id: uuidv4()
      }));
      const newRoomId = uuidv4().slice(0, 8);
      navigate(`/editor/${newRoomId}`);
    }
  };

  const handleJoinClick = () => {
    setAction('join');
    if (userName.trim()) {
      const userColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
      localStorage.setItem('coedit_user', JSON.stringify({
        name: userName.trim(),
        color: userColor,
        id: uuidv4()
      }));
      setStep('room');
    }
  };

  // Room selection step
  if (step === 'room') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            CoEdit
          </h1>
          <p className="text-center text-gray-600 mb-8">Welcome, <span className="font-semibold">{userName}</span>!</p>

          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Enter Room ID</h2>
            <form onSubmit={handleJoinRoom} className="space-y-3">
              <input
                type="text"
                placeholder="Enter Room ID..."
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg py-3 px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="room-id-input"
                autoFocus
              />
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                data-testid="join-room-btn"
              >
                Join Room
              </button>
            </form>
            <button
              onClick={() => setStep('name')}
              className="w-full mt-4 text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Name input step (default)
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-10">
          CoEdit
        </h1>

        {/* Name Input */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">What's your name?</h2>
          <input
            type="text"
            placeholder="Enter your name..."
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg py-3 px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            data-testid="user-name-input"
            autoFocus
          />
          
          {/* Create Room */}
          <button
            onClick={handleCreateClick}
            disabled={!userName.trim()}
            className={`w-full font-medium py-3 px-4 rounded-lg transition-colors mb-3 ${
              userName.trim()
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            data-testid="create-room-btn"
          >
            Create Room
          </button>

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-1 h-px bg-gray-300" />
            <span className="px-4 text-gray-500 text-sm">or</span>
            <div className="flex-1 h-px bg-gray-300" />
          </div>

          {/* Join Room */}
          <button
            onClick={handleJoinClick}
            disabled={!userName.trim()}
            className={`w-full font-medium py-3 px-4 rounded-lg transition-colors ${
              userName.trim()
                ? 'bg-gray-800 hover:bg-gray-900 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            data-testid="join-room-btn"
          >
            Join Existing Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
