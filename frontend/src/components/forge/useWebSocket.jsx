import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useWebSocket(backendUrl = 'http://localhost:5000') {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [backendUrl]);

  const subscribeToJob = (jobId, callback) => {
    if (!socketRef.current) return () => {};

    const handler = (data) => callback(data);
    socketRef.current.on('job_update', handler);
    socketRef.current.emit('subscribe_job', { jobId });

    return () => {
      socketRef.current.off('job_update', handler);
    };
  };

  return { socket: socketRef.current, isConnected, subscribeToJob };
}