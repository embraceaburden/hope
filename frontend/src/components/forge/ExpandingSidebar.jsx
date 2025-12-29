import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExpandingSidebar({ 
  title, 
  icon: Icon, 
  children, 
  defaultExpanded = false,
  side = 'right' 
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <motion.div
      initial={false}
      animate={{ 
        width: isExpanded ? '320px' : '60px'
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'fixed top-20 z-40 h-[calc(100vh-5rem)] glass-panel border shadow-2xl',
        side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        'border-[var(--color-gold)]/20'
      )}
    >
      {/* Toggle Button */}
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'absolute top-4 h-10 w-10 rounded-full heritage-gradient-light shadow-lg',
          side === 'right' ? '-left-5' : '-right-5'
        )}
      >
        {side === 'right' ? (
          isExpanded ? <ChevronRight className="h-5 w-5 text-white" /> : <ChevronLeft className="h-5 w-5 text-white" />
        ) : (
          isExpanded ? <ChevronLeft className="h-5 w-5 text-white" /> : <ChevronRight className="h-5 w-5 text-white" />
        )}
      </Button>

      {/* Collapsed State - Icon Only */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center pt-20 space-y-4"
          >
            <Icon className="h-8 w-8 text-[var(--color-gold)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded State - Full Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.1 }}
            className="h-full overflow-y-auto"
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg heritage-gradient-light flex items-center justify-center">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-bold text-[var(--color-pine-teal)]">{title}</h3>
              </div>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}