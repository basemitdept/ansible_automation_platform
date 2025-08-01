import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:5003';

console.log('🔴 SOCKET DEBUG: Environment:', process.env.NODE_ENV);
console.log('🔴 SOCKET DEBUG: WebSocket URL:', SOCKET_URL);
console.log('🔴 SOCKET DEBUG: Socket.IO available:', typeof io);
console.log('🔴 SOCKET DEBUG: Socket.IO function:', io);

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      console.log('🔴 FRONTEND: Socket already connected');
      return;
    }

    console.log('🔴 FRONTEND: Attempting to connect to:', SOCKET_URL);
    console.log('🔴 FRONTEND: Creating new socket connection...');
    
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });
    
    console.log('🔴 FRONTEND: Socket object created:', this.socket);

    this.socket.on('connect', () => {
      console.log('🔴 FRONTEND: Connected to WebSocket server');
      console.log('🔴 FRONTEND: Socket ID:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('🔴 FRONTEND: Disconnected from WebSocket server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔴 FRONTEND: Connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('🔴 FRONTEND: Socket error:', error);
    });

    this.socket.on('task_update', (data) => {
      console.log('🔴 FRONTEND: Received task_update:', data);
      this.emit('task_update', data);
    });

    this.socket.on('task_output', (data) => {
      console.log('🔴 FRONTEND: Received task_output:', data);
      console.log('🔴 FRONTEND: About to emit to listeners...');
      
      // Removed alert - confirmed messages not reaching frontend
      
      this.emit('task_output', data);
      console.log('🔴 FRONTEND: Emitted task_output to listeners');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in socket listener:', error);
        }
      });
    }
  }
}

const socketService = new SocketService();
export default socketService; 