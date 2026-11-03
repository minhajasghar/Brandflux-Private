'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Sparkles, Calendar, Lightbulb, BarChart3, Settings } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { name: 'Home', path: '/dashboard', icon: Home },
    { name: 'Create', path: '/session', icon: Sparkles },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Ideas', path: '/ideas', icon: Lightbulb },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 border-t border-border backdrop-blur-lg md:hidden shadow-2xl safe-area-bottom">
      <div className="flex justify-around items-center h-16 px-1 sm:px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.path
          const Icon = item.icon
          
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 relative group touch-manipulation"
              aria-label={item.name}
            >
              <div className={`p-1 sm:p-1.5 rounded-xl transition-all duration-150 flex items-center justify-center ${
                isActive 
                  ? 'text-accent bg-accent/15 scale-105' 
                  : 'text-muted group-hover:text-text'
              }`}>
                <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <span className={`text-[10px] tracking-tight mt-0.5 leading-none transition-colors ${
                isActive ? 'text-accent font-extrabold' : 'text-muted font-medium'
              }`}>
                {item.name}
              </span>
              
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-accent" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
