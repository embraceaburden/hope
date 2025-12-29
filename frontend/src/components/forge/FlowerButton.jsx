import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function FlowerButton({ 
  mainIcon: MainIcon, 
  petalActions = [], 
  label = '',
  className = '' 
}) {
  const [isOpen, setIsOpen] = useState(false);

  const petalVariants = {
    closed: { scale: 0, opacity: 0 },
    open: (i) => {
      // Start at 60 degrees (π/3 radians) and spread downward
      const baseAngle = Math.PI / 3; // 60 degrees
      const angleStep = Math.PI / 6; // 30 degrees between petals
      const angle = baseAngle + (i * angleStep);
      
      return {
        scale: 1,
        opacity: 1,
        x: Math.cos(angle) * 80,
        y: Math.sin(angle) * 80,
        transition: {
          delay: i * 0.05,
          type: 'spring',
          stiffness: 260,
          damping: 20
        }
      };
    }
  };

  return (
    <div className="relative inline-block">
      {/* Main Button */}
      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'h-14 w-14 rounded-full heritage-gradient-light shadow-2xl relative z-10',
            className
          )}
        >
          <MainIcon className="h-6 w-6 text-white" />
        </Button>
      </motion.div>

      {/* Petals */}
      <AnimatePresence>
        {isOpen && petalActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.div
              key={i}
              custom={i}
              variants={petalVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="absolute top-0 left-0"
              style={{ transformOrigin: '28px 28px' }}
            >
              <Button
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                className="h-12 w-12 rounded-full bg-white border-2 border-[var(--color-gold)] text-[var(--color-pine-teal)] shadow-lg hover:bg-[var(--color-satin)]"
                title={action.label}
              >
                <Icon className="h-5 w-5" />
              </Button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Label */}
      {label && !isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-[var(--color-pine-teal)] font-medium"
        >
          {label}
        </motion.div>
      )}
    </div>
  );
}