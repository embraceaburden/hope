import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const DEFAULT_BACKEND_URL = import.meta.env.VITE_FORGE_BACKEND_URL || 'http://localhost:5000';
const DEFAULT_SOCKET_TOKEN = import.meta.env.VITE_FORGE_SOCKET_TOKEN;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;
const RECONNECT_JITTER = 0.4;

const resolveSocketToken = (overrideToken) => {
  if (overrideToken) return overrideToken;
  if (DEFAULT_SOCKET_TOKEN) return DEFAULT_SOCKET_TOKEN;
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('forgeSocketToken');
};

export function useWebSocket(backendUrl = DEFAULT_BACKEND_URL, socketToken) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const resolvedToken = useMemo(() => resolveSocketToken(socketToken), [socketToken]);

  useEffect(() => {
    if (!resolvedToken) {
      setConnectionState('missing-token');
      setLastError(new Error('Missing Socket.IO auth token'));
      setIsConnected(false);
      return () => {};
    }

    setConnectionState('connecting');
    setRetryAttempt(0);
    setLastError(null);
    setIsConnected(false);

    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: BASE_RECONNECT_DELAY_MS,
      reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
      randomizationFactor: RECONNECT_JITTER,
      auth: { token: resolvedToken }
    });

    const handleConnect = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      setLastError(null);
      setConnectionState('connected');
      setRetryAttempt(0);
    };

    const handleDisconnect = () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
      setConnectionState('disconnected');
    };

    const handleError = (error) => {
      console.warn('WebSocket connection error:', error);
      setLastError(error);
      setIsConnected(false);
      setConnectionState('error');
    };

    socketRef.current.on('connect', handleConnect);
    socketRef.current.on('disconnect', handleDisconnect);
    socketRef.current.on('connect_error', handleError);
    socketRef.current.on('error', handleError);
    socketRef.current.io.on('reconnect_attempt', (attempt) => {
      setConnectionState('reconnecting');
      setRetryAttempt(attempt);
    });
    socketRef.current.io.on('reconnect', handleConnect);
    socketRef.current.io.on('reconnect_failed', () => {
      setConnectionState('failed');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect', handleConnect);
        socketRef.current.off('disconnect', handleDisconnect);
        socketRef.current.off('connect_error', handleError);
        socketRef.current.off('error', handleError);
        socketRef.current.io.off('reconnect_attempt');
        socketRef.current.io.off('reconnect');
        socketRef.current.io.off('reconnect_failed');
        socketRef.current.disconnect();
      }
    };
  }, [backendUrl, resolvedToken]);

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

  return {
    socket: socketRef.current,
    isConnected,
    lastError,
    connectionState,
    retryAttempt,
    maxRetries: MAX_RECONNECT_ATTEMPTS,
    subscribeToJob
  };
}
