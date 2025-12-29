import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const FunctionDisplay = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'Function';
  const status = toolCall?.status || 'pending';
  const results = toolCall?.results;
  
  const parsedResults = (() => {
    if (!results) return null;
    try {
      return typeof results === 'string' ? JSON.parse(results) : results;
    } catch {
      return results;
    }
  })();
  
  const isError = results && (
    (typeof results === 'string' && /error|failed/i.test(results)) ||
    (parsedResults?.success === false)
  );
  
  const statusConfig = {
    pending: { icon: Clock, color: 'text-gray-400', text: 'Pending' },
    running: { icon: Loader2, color: 'text-[var(--color-gold)]', text: 'Running...', spin: true },
    in_progress: { icon: Loader2, color: 'text-[var(--color-gold)]', text: 'Running...', spin: true },
    completed: isError ? 
      { icon: AlertCircle, color: 'text-[var(--color-copper)]', text: 'Failed' } : 
      { icon: CheckCircle2, color: 'text-green-600', text: 'Success' },
    success: { icon: CheckCircle2, color: 'text-green-600', text: 'Success' },
    failed: { icon: AlertCircle, color: 'text-[var(--color-copper)]', text: 'Failed' },
    error: { icon: AlertCircle, color: 'text-[var(--color-copper)]', text: 'Failed' }
  }[status] || { icon: Zap, color: 'text-gray-500', text: '' };
  
  const Icon = statusConfig.icon;
  const formattedName = name.split('.').reverse().join(' ').toLowerCase();
  
  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
          'hover:bg-[var(--color-satin)]',
          expanded ? 'bg-[var(--color-satin)] border-[var(--color-gold)]' : 'bg-white border-[var(--color-gold)]/30'
        )}
      >
        <Icon className={cn('h-3 w-3', statusConfig.color, statusConfig.spin && 'animate-spin')} />
        <span className="text-[var(--color-pine-teal)] font-medium">{formattedName}</span>
        {statusConfig.text && (
          <span className={cn('text-gray-500', isError && 'text-[var(--color-copper)]')}>
            • {statusConfig.text}
          </span>
        )}
        {!statusConfig.spin && (toolCall.arguments_string || results) && (
          <ChevronRight className={cn('h-3 w-3 text-gray-400 transition-transform ml-auto', 
            expanded && 'rotate-90')} />
        )}
      </button>
      
      {expanded && !statusConfig.spin && (
        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-[var(--color-gold)]/30 space-y-2">
          {toolCall.arguments_string && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Parameters:</div>
              <pre className="bg-[var(--color-satin)] rounded-md p-2 text-xs text-[var(--color-pine-teal)] whitespace-pre-wrap">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2);
                  } catch {
                    return toolCall.arguments_string;
                  }
                })()}
              </pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Result:</div>
              <pre className="bg-[var(--color-satin)] rounded-md p-2 text-xs text-[var(--color-pine-teal)] whitespace-pre-wrap max-h-48 overflow-auto">
                {typeof parsedResults === 'object' ? 
                  JSON.stringify(parsedResults, null, 2) : parsedResults}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg heritage-gradient-light flex items-center justify-center mt-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-white" />
        </div>
      )}
      <div className={cn('max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {message.content && (
          <div className={cn(
            'rounded-2xl px-4 py-2.5',
            isUser ? 'bg-[var(--color-pine-teal)] text-white' : 'bg-white border border-[var(--color-gold)]/30'
          )}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown 
                className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  code: ({ inline, className, children, ...props }) => {
                    return !inline ? (
                      <pre className="bg-[var(--color-pine-teal)] text-white rounded-lg p-3 overflow-x-auto my-2">
                        <code className={className} {...props}>{children}</code>
                      </pre>
                    ) : (
                      <code className="px-1 py-0.5 rounded bg-[var(--color-satin)] text-[var(--color-pine-teal)] text-xs">
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => <p className="my-1 leading-relaxed text-[var(--color-pine-teal)]">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc text-[var(--color-pine-teal)]">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal text-[var(--color-pine-teal)]">{children}</ol>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1 mt-2">
            {message.tool_calls.map((toolCall, idx) => (
              <FunctionDisplay key={idx} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}