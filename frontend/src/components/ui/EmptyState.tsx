'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

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
    <div className="flex flex-col items-center justify-center text-center p-8 md:p-12 bg-surface border border-border rounded-3xl max-w-md mx-auto my-6 relative overflow-hidden">
      <motion.span 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-5xl md:text-6xl mb-5 inline-block select-none"
      >
        {emoji}
      </motion.span>

      <h3 className="text-xl md:text-2xl font-bold text-text tracking-tight mb-2">
        {title}
      </h3>
      
      <p className="text-muted text-sm leading-relaxed max-w-xs mb-6">
        {subtitle}
      </p>

      {buttonText && onButtonClick && (
        <button
          onClick={onButtonClick}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-black font-bold px-6 py-3 rounded-xl text-xs active:scale-[0.98] transition"
        >
          {buttonText}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
