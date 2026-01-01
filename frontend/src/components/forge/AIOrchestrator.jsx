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
  
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]); // Stores Base64 for Ollama
  
  const [providerHealth, setProviderHealth] = useState({
    ollama: { status: 'unknown', checkedAt: null, error: null }
  });

  const ollamaConfig = getOllamaConfig();
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // 1. Health Check Loop (Ollama Only)
  useEffect(() => {
    let isMounted = true;
    const refreshHealth = async () => {
      try {
        // If forgeApi.aiHealth() checks backend, keep it. 
        // Otherwise, we assume Ollama is generally reachable if the app loads.
        const data = await forgeApi.aiHealth(); 
        const ollamaStatus = data?.providers?.ollama?.status || 'unknown';
        
        if (isMounted) {
          setProviderHealth((prev) => ({
            ollama: {
              status: ollamaStatus,
              checkedAt: new Date().toISOString(),
              error: data?.providers?.ollama?.error || null
            }
          }));
        }
      } catch (error) {
        if (isMounted) {
          setProviderHealth((prev) => ({
            ollama: {
              status: 'unhealthy',
              checkedAt: new Date().toISOString(),
              error: error.message
            }
          }));
        }
      }
    };
    
    // Initial check and interval
    refreshHealth();
    const intervalId = setInterval(refreshHealth, 30000);
    
    // Set Initial Welcome Message
    setMessages([
      {
        role: 'system',
        content: `Sentry Online. Connected to ${ollamaConfig.model}.`
      }
    ]);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // 2. Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Drag Handlers
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

  // 4. File Upload (Converted to Local Base64 for Ollama)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsProcessing(true);
    const newUploads = [];

    // Helper to read file as Base64
    const readFile = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ 
          name: file.name, 
          // Strip the data:image/png;base64, prefix for Ollama if needed, 
          // but usually the client handles clean up. We store raw base64 here.
          // Note: InternVL3 expects just the base64 string usually.
          data: reader.result 
        });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    try {
      for (const file of files) {
        const result = await readFile(file);
        newUploads.push(result);
      }
      setUploadedFiles(prev => [...prev, ...newUploads]);
    } catch (err) {
      console.error("File read error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Send Message (The "Safety Net" Version)
  const handleSendMessage = async () => {
    if (!inputValue.trim() && uploadedFiles.length === 0) return;

    const userText = inputValue.trim();
    
    // Prepare images for Ollama (strip mime type prefix if present)
    const images = uploadedFiles.map(f => {
      return f.data.replace(/^data:image\/[a-z]+;base64,/, "");
    });

    // Create the optimistic message for UI
    const newUserMsg = { 
      role: 'user', 
      content: userText || (images.length ? "[Image Uploaded]" : "System Check"),
      images: images // Store internally for UI if needed, but mainly for API
    };

    const nextMessages = [...messages, newUserMsg];
    
    // Reset Input
    setInputValue('');
    setUploadedFiles([]);
    setIsProcessing(true); // LOCK INPUT

    try {
      setMessages(nextMessages);

      // Call Ollama
      const responseText = await sendOllamaChat({
        messages: nextMessages,
        baseUrl: ollamaConfig.baseUrl,
        model: ollamaConfig.model,
        timeoutMs: ollamaConfig.timeoutMs, // Uses the new 5 min timeout
        images: images // Pass images explicitly to the helper
      });

      // Add Response
      setMessages((prev) => ([
        ...prev,
        { role: 'assistant', content: responseText || 'No response received.' }
      ]));

    } catch (error) {
      console.error('Transmission failed:', error);
      setMessages((prev) => ([
        ...prev,
        { role: 'assistant', content: `Error: ${error.message}` }
      ]));
    } finally {
      // THE SAFETY NET: This runs no matter what, unlocking the UI
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
      <Card className="glass-panel overflow-hidden shadow-2xl border-none">
        {/* Header */}
        <div className="drag-handle bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-copper)] p-4 cursor-move">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${providerHealth.ollama.status === 'unhealthy' ? 'bg-red-500' : 'bg-green-400'} animate-pulse`} />
              <span className="font-semibold">Sentry Interface</span>
              <span className="text-[10px] uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full">
                LOCAL
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
            <div className="h-[400px] overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-white/50 to-white/30 dark:from-[var(--color-pine-teal)]/50 dark:to-[var(--color-pine-teal)]/30">
              {messages.length === 0 && (
                <div className="text-center text-sm text-gray-500 mt-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-[var(--color-gold)]" />
                  <p className="font-medium text-[var(--color-pine-teal)]">Sentry Online</p>
                  <p className="text-xs mt-2">Systems Nominal.</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-gray-500 justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-gold)]" />
                  <span>Analyzing...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Uploaded Files Preview */}
            {uploadedFiles.length > 0 && (
              <div className="px-4 py-2 bg-[var(--color-satin)] border-t border-[var(--color-gold)]/20">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="text-xs text-[var(--color-pine-teal)] flex items-center gap-2">
                    <Upload className="h-3 w-3" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs text-gray-400">(Ready)</span>
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
                  accept="image/*" 
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="border-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter command..."
                  disabled={isProcessing}
                  className="flex-1 border-[var(--color-gold)]/30 focus:border-[var(--color-gold)]"
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
