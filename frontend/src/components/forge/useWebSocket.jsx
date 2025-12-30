import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const DEFAULT_BACKEND_URL = import.meta.env.VITE_FORGE_BACKEND_URL || 'http://localhost:5000';

export function useWebSocket(backendUrl = DEFAULT_BACKEND_URL) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    const handleConnect = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      setLastError(null);
    };

    const handleDisconnect = () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
    };

    const handleError = (error) => {
      console.warn('WebSocket connection error:', error);
      setLastError(error);
      setIsConnected(false);
    };

    socketRef.current.on('connect', handleConnect);
    socketRef.current.on('disconnect', handleDisconnect);
    socketRef.current.on('connect_error', handleError);
    socketRef.current.on('error', handleError);

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect', handleConnect);
        socketRef.current.off('disconnect', handleDisconnect);
        socketRef.current.off('connect_error', handleError);
        socketRef.current.off('error', handleError);
        socketRef.current.disconnect();
      }
    };
  }, [backendUrl]);

  const subscribeToJob = (jobId, callback) => {
    if (!socketRef.current || !jobId) return () => {};

    const handler = (data) => {
      if (!data) return;
      const updateJobId = data.jobId || data.job_id;
      if (!updateJobId || updateJobId === jobId) {
        callback(data);
      }
    };

    const emitSubscribe = () => {
      socketRef.current?.emit('subscribe_job', { jobId });
    };

    socketRef.current.on('job_update', handler);
    if (socketRef.current.connected) {
      emitSubscribe();
    } else {
      socketRef.current.once('connect', emitSubscribe);
    }

    return () => {
      socketRef.current?.off('job_update', handler);
      socketRef.current?.off('connect', emitSubscribe);
    };
  };

  return { socket: socketRef.current, isConnected, lastError, subscribeToJob };
}
