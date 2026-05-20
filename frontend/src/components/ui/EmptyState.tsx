'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface EmptyStateProps {
  emoji: string
  title: string
  subtitle: string
  buttonText?: string
  onButtonClick?: () => void
}

export default function EmptyState({
  emoji,
  title,
  subtitle,
  buttonText,
  onButtonClick
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 md:p-12 bg-white/[0.01] border border-white/5 rounded-[2.5rem] backdrop-blur-md max-w-md mx-auto my-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
      
      <motion.span 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-5xl md:text-6xl mb-6 inline-block select-none"
      >
        {emoji}
      </motion.span>

      <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
        {title}
      </h3>
      
      <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-8">
        {subtitle}
      </p>

      {buttonText && onButtonClick && (
        <button
          onClick={onButtonClick}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black px-6 py-3 rounded-xl text-xs hover:opacity-90 active:scale-[0.98] transition shadow-lg shadow-blue-500/20"
        >
          {buttonText}
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
