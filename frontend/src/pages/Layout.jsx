
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { 
  Zap, Moon, Sun, LogOut, User, 
  LayoutDashboard, Settings, FileText, Menu, X
} from 'lucide-react';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);


  const loadTheme = () => {
    const savedTheme = localStorage.getItem('forge-theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('forge-theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };


  const navItems = [
    { name: 'Dashboard', page: 'Dashboard', icon: LayoutDashboard },
    { name: 'Documentation', page: 'Documentation', icon: FileText },
    { name: 'Backend Setup', page: 'BackendSetup', icon: Settings }
  ];

  return (
    <div className="min-h-screen">
      {/* Toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 p-2 rounded-lg transition-all"
        style={{ 
          background: sidebarOpen ? 'transparent' : 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)',
          boxShadow: sidebarOpen ? 'none' : '0 4px 12px rgba(188, 128, 77, 0.3)'
        }}
      >
        {sidebarOpen ? (
          <X className="h-6 w-6" style={{ color: 'var(--color-pine-teal)' }} />
        ) : (
          <Menu className="h-6 w-6 text-white" />
        )}
      </button>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Heritage-branded sidebar */}
      <aside 
        className="fixed left-0 top-0 h-screen w-64 border-r z-50 transition-transform duration-300 ease-in-out"
        style={{ 
          background: 'rgba(255, 255, 255, 0.95)', 
          backdropFilter: 'blur(12px)', 
          borderColor: 'rgba(188, 128, 77, 0.2)', 
          boxShadow: '0 8px 32px rgba(12, 65, 60, 0.08)',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'
        }}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 border-b" style={{ borderColor: 'rgba(188, 128, 77, 0.2)' }}>
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3 group">
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"
                style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
              >
                <Zap className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--color-pine-teal)' }}>
                  The Forge
                </h1>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  Enterprise Edition
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all"
                  style={isActive ? 
                    { background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)', color: 'white', boxShadow: '0 4px 12px rgba(188, 128, 77, 0.3)' } : 
                    { color: 'var(--color-pine-teal)' }
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-[var(--color-gold)]/20">
            {user && (
              <div className="mb-3 p-3 rounded-lg bg-[var(--color-satin)] dark:bg-[var(--color-pine-teal)]/30">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full heritage-gradient-light flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-pine-teal)] dark:text-white truncate">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {user.role}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={toggleTheme}
                className="w-full justify-start border-[var(--color-gold)]/30"
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="h-4 w-4 mr-2" />
                    Dark Mode
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4 mr-2" />
                    Light Mode
                  </>
                )}
              </Button>

              {user && (
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="w-full justify-start border-[var(--color-gold)]/30 text-[var(--color-copper)]"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="transition-all duration-300" style={{ marginLeft: 0 }}>
        {children}
      </div>

      {/* Custom Heritage styling */}
      <style jsx>{`
        :global(body) {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }

        .heritage-shine {
          background: linear-gradient(
            90deg,
            var(--color-gold) 0%,
            var(--color-copper) 50%,
            var(--color-gold) 100%
          );
          background-size: 1000px 100%;
          animation: shimmer 3s infinite;
        }
      `}</style>
    </div>
  );
}
