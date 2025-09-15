import { Camera, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

export default function FloatingHeader() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    setIsDark(initialDark);
    document.documentElement.classList.toggle('dark', initialDark);
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    document.documentElement.classList.toggle('dark', newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  return (
    <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-background/10 backdrop-blur-xl border border-white/20 rounded-full px-6 py-3 shadow-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Camera className="w-6 h-6 text-primary animate-pulse-glow" />
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-sm animate-pulse-glow" />
            </div>
            <span className="font-bold text-lg bg-instagram-gradient bg-clip-text text-transparent">
              InstaDown
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-4">
            <a href="#" className="text-sm text-foreground/80 hover:text-foreground transition-colors hover-elevate px-3 py-1 rounded-full">
              Home
            </a>
            <a href="#" className="text-sm text-foreground/80 hover:text-foreground transition-colors hover-elevate px-3 py-1 rounded-full">
              Features
            </a>
            <a href="#" className="text-sm text-foreground/80 hover:text-foreground transition-colors hover-elevate px-3 py-1 rounded-full">
              About
            </a>
          </nav>

          <Button 
            size="icon" 
            variant="ghost" 
            onClick={toggleTheme}
            className="rounded-full"
            data-testid="button-theme-toggle"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}