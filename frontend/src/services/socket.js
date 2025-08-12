import { io } from 'socket.io-client';

// Always use same-origin WebSocket endpoint so it works behind reverse proxies/nginx and in Docker
// This avoids pointing to the browser's localhost when the app is hosted remotely
const SOCKET_URL = `${window.location.protocol}//${window.location.host}`;

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      console.log('🔴 SOCKET: Already connected, skipping');
      return;
    }

    console.log('🔴 SOCKET: Creating new socket connection to:', SOCKET_URL);
    console.log('🔴 SOCKET: Socket.io options:', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 15000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    
    this.socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 15000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    
    console.log('🔴 SOCKET: Socket object created:', this.socket);
    
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      console.log('Socket ID:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    this.socket.on('task_update', (data) => {
      this.emit('task_update', data);
    });

    this.socket.on('task_output', (data) => {
      console.log('🔴 SOCKET: Received task_output from server:', data);
      this.emit('task_output', data);
      console.log('🔴 SOCKET: Emitted to', this.listeners.get('task_output')?.length || 0, 'listeners');
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