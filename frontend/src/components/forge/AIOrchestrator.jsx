import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Minus, MessageSquare, Upload, Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import MessageBubble from './MessageBubble';
import { getOllamaConfig, sendOllamaChat } from '@/lib/aiChatClient';
import { forgeApi } from './forgeApi';

export default function AIOrchestrator({ onJobCreate, onConfigUpdate }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0,
    y: 20
  }));
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [provider, setProvider] = useState('ollama');
  const [providerHealth, setProviderHealth] = useState({
    base44: { status: 'unknown', checkedAt: null, error: null },
    ollama: { status: 'unknown', checkedAt: null, error: null }
  });
  const [fallbackNotice, setFallbackNotice] = useState(null);
  const baseClient = typeof window !== 'undefined' ? window.base44 : null;
  const ollamaConfig = getOllamaConfig();
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const isBase44Available = Boolean(baseClient?.agents?.createConversation);
  const base44Healthy = providerHealth.base44?.status === 'healthy';
  const ollamaHealthy = providerHealth.ollama?.status === 'healthy';

  const logProviderMetric = ({ providerName, latencyMs, ok, error }) => {
    const payload = {
      provider: providerName,
      latencyMs,
      ok,
      error
    };
    if (ok) {
      console.info('[AI Telemetry]', payload);
    } else {
      console.warn('[AI Telemetry]', payload);
    }
  };

  // Initialize conversation
  useEffect(() => {
    setProvider(base44Healthy ? 'base44' : 'ollama');
    initConversation();
  }, [base44Healthy, isBase44Available]);

  useEffect(() => {
    setProviderHealth((prev) => ({
      ...prev,
      base44: {
        status: isBase44Available ? prev.base44.status : 'unavailable',
        checkedAt: new Date().toISOString(),
        error: isBase44Available ? prev.base44.error : 'Base44 client not detected.'
      }
    }));
  }, [isBase44Available]);

  useEffect(() => {
    if (base44Healthy) {
      setFallbackNotice(null);
    }
  }, [base44Healthy]);

  useEffect(() => {
    let isMounted = true;
    const refreshHealth = async () => {
      try {
        const data = await forgeApi.aiHealth();
        const ollamaStatus = data?.providers?.ollama?.status || 'unknown';
        if (isMounted) {
          setProviderHealth((prev) => ({
            ...prev,
            ollama: {
              status: ollamaStatus,
              checkedAt: new Date().toISOString(),
              error: data?.providers?.ollama?.error || null,
              latencyMs: data?.providers?.ollama?.latencyMs ?? null
            }
          }));
        }
      } catch (error) {
        if (isMounted) {
          setProviderHealth((prev) => ({
            ...prev,
            ollama: {
              status: 'unhealthy',
              checkedAt: new Date().toISOString(),
              error: error.message
            }
          }));
        }
      }
    };
    refreshHealth();
    const intervalId = setInterval(refreshHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const initConversation = async () => {
    if (!isBase44Available) {
      setMessages([
        {
          role: 'assistant',
          content: `Forge Intelligence is running locally via Ollama (${ollamaConfig.model}).`
        }
      ]);
      return;
    }
    try {
      const start = performance?.now ? performance.now() : Date.now();
      const conv = await baseClient.agents.createConversation({
        agent_name: 'forge_orchestrator',
        metadata: {
          name: 'Pipeline Session',
          session_start: new Date().toISOString()
        }
      });
      const latencyMs = Math.round((performance?.now ? performance.now() : Date.now()) - start);
      logProviderMetric({ providerName: 'base44', latencyMs, ok: true });
      setProviderHealth((prev) => ({
        ...prev,
        base44: { status: 'healthy', checkedAt: new Date().toISOString(), error: null }
      }));
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch (error) {
      console.error('Failed to initialize conversation:', error);
      logProviderMetric({
        providerName: 'base44',
        latencyMs: null,
        ok: false,
        error: error.message
      });
      setProviderHealth((prev) => ({
        ...prev,
        base44: { status: 'unhealthy', checkedAt: new Date().toISOString(), error: error.message }
      }));
    }
  };

  // Subscribe to conversation updates
  useEffect(() => {
    if (!conversation?.id) return;

    if (!isBase44Available) return;

    const unsubscribe = baseClient.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages);
      setIsProcessing(false);
    });

    return () => unsubscribe();
  }, [conversation?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.drag-handle')) {
      isDragging.current = true;
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging.current) {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      });
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!baseClient?.integrations?.Core?.UploadFile) {
      setMessages((prev) => ([
        ...prev,
        {
          role: 'assistant',
          content: 'File uploads are unavailable because the base44 integration is not configured.'
        }
      ]));
      return;
    }
    setIsProcessing(true);
    
    const uploaded = [];
    for (const file of files) {
      try {
        const { file_url } = await baseClient.integrations.Core.UploadFile({ file });
        uploaded.push({ name: file.name, url: file_url });
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
    
    setUploadedFiles(prev => [...prev, ...uploaded]);
    setIsProcessing(false);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && uploadedFiles.length === 0) return;

    const messageContent = inputValue.trim() || 'I have uploaded files for processing';
    const fileUrls = uploadedFiles.map(f => f.url);

    setIsProcessing(true);
    setInputValue('');
    setUploadedFiles([]);

    try {
      if (base44Healthy) {
        if (!conversation || !baseClient?.agents?.addMessage) {
          setMessages((prev) => ([
            ...prev,
            { role: 'assistant', content: 'Messaging is unavailable until base44 is connected.' }
          ]));
          return;
        }
        const start = performance?.now ? performance.now() : Date.now();
        await baseClient.agents.addMessage(conversation, {
          role: 'user',
          content: messageContent,
          file_urls: fileUrls.length > 0 ? fileUrls : undefined
        });
        const latencyMs = Math.round((performance?.now ? performance.now() : Date.now()) - start);
        logProviderMetric({ providerName: 'base44', latencyMs, ok: true });
      } else if (!ollamaHealthy) {
        setMessages((prev) => ([
          ...prev,
          {
            role: 'assistant',
            content:
              'Both base44 and Ollama are unavailable. Please check provider health and try again.'
          }
        ]));
        setIsProcessing(false);
        return;
      } else {
        if (isBase44Available && !base44Healthy) {
          const notice = 'Base44 is unavailable, falling back to Ollama.';
          setFallbackNotice(notice);
          setMessages((prev) => ([
            ...prev,
            { role: 'assistant', content: notice }
          ]));
        }
        const nextMessages = [
          ...messages,
          { role: 'user', content: messageContent }
        ];
        setMessages(nextMessages);
        const responseText = await sendOllamaChat({
          messages: nextMessages,
          baseUrl: ollamaConfig.baseUrl,
          model: ollamaConfig.model,
          timeoutMs: ollamaConfig.timeoutMs
        });
        setMessages((prev) => ([
          ...prev,
          { role: 'assistant', content: responseText || 'No response received from Ollama.' }
        ]));
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      logProviderMetric({ providerName: provider, latencyMs: null, ok: false, error: error.message });
      if (provider === 'base44') {
        setProviderHealth((prev) => ({
          ...prev,
          base44: { status: 'unhealthy', checkedAt: new Date().toISOString(), error: error.message }
        }));
      }
      setMessages((prev) => ([
        ...prev,
        { role: 'assistant', content: `Error sending message: ${error.message}` }
      ]));
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isExpanded) {
    return (
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
      >
        <Button
          onClick={() => setIsExpanded(true)}
          className="h-16 w-16 rounded-full heritage-gradient-light shadow-2xl hover:scale-110 transition-transform"
        >
          <MessageSquare className="h-8 w-8 text-white" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={dragRef}
      className="fixed z-50 draggable"
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? '320px' : '400px',
        maxHeight: isMinimized ? '60px' : '600px'
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onMouseDown={handleMouseDown}
    >
      <Card className="glass-panel overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="drag-handle bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-copper)] p-4 cursor-move">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="font-semibold">Forge Intelligence</span>
              <span className="text-[10px] uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full">
                {provider}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={() => setIsExpanded(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {!isMinimized && (
          <>
            {fallbackNotice && (
              <div className="px-4 py-2 text-xs text-[var(--color-copper)] bg-[var(--color-satin)] border-b border-[var(--color-gold)]/20">
                {fallbackNotice}
              </div>
            )}
            <div className="h-[400px] overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-white/50 to-white/30 dark:from-[var(--color-pine-teal)]/50 dark:to-[var(--color-pine-teal)]/30">
              {messages.length === 0 && (
                <div className="text-center text-sm text-gray-500 mt-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-[var(--color-gold)]" />
                  <p className="font-medium text-[var(--color-pine-teal)]">Welcome to The Forge</p>
                  <p className="text-xs mt-2">I'll guide you through the pipeline</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <div className="px-4 py-2 bg-[var(--color-satin)] border-t border-[var(--color-gold)]/20">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="text-xs text-[var(--color-pine-teal)] flex items-center gap-2">
                    <Upload className="h-3 w-3" />
                    <span className="truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-[var(--color-gold)]/20 bg-white dark:bg-[var(--color-pine-teal)]">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="border-[var(--color-gold)]"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about embedding, extraction, or configuration..."
                  disabled={isProcessing}
                  className="flex-1 border-[var(--color-gold)]/30"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isProcessing || (!inputValue.trim() && uploadedFiles.length === 0)}
                  className="heritage-gradient-light text-white"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}
