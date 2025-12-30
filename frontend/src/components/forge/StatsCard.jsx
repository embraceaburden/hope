import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StatsCard({ title, value, icon: Icon, trend, trendValue, className }) {
  return (
    <Card className={cn('glass-panel overflow-hidden hover:shadow-xl transition-shadow', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <h3 className="text-3xl font-bold text-[var(--color-pine-teal)]">
              {value}
            </h3>
            {trend && trendValue && (
              <div className="flex items-center gap-1 text-sm">
                {trend === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className={cn(
                  'font-medium',
                  trend === 'up' ? 'text-green-600' : 'text-red-600'
                )}>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-xl heritage-gradient-light shadow-lg">
            <Icon className="h-6 w-6 text-green" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}