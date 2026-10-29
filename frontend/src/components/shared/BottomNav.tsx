'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Sparkles, ClipboardList, Settings } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { name: 'Home', path: '/dashboard', icon: Home },
    { name: 'Create', path: '/session', icon: Sparkles },
    { name: 'History', path: '/ideas', icon: ClipboardList },
    { name: 'Settings', path: '/settings', icon: Settings },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 border-t border-border backdrop-blur-lg md:hidden">
      <div className="flex justify-around items-center h-16 px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.path
          const Icon = item.icon
          
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full relative"
            >
              <div className={`p-1.5 rounded-xl transition-all ${
                isActive 
                  ? 'text-accent bg-accent/10' 
                  : 'text-muted hover:text-text'
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              
              {isActive && (
                <span className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
