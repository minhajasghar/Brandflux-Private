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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c0c0e]/95 border-t border-white/5 backdrop-blur-lg md:hidden">
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
                  ? 'text-blue-400 bg-blue-500/5' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}>
                <Icon className="h-5.5 w-5.5" />
              </div>
              
              {isActive && (
                <span className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
