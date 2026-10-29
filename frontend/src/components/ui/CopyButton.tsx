'use client'

import { useState } from 'react'
import { Copy, Check, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface CopyButtonProps {
  text: string
  label?: string
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [state, setState] = useState<'default' | 'copying' | 'copied'>('default')

  const handleCopy = async () => {
    if (!text) return
    setState('copying')
    
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      toast.success('Copied to clipboard!')
      
      setTimeout(() => {
        setState('default')
      }, 2000)
    } catch (err) {
      setState('default')
      toast.error('Failed to copy text.')
    }
  }

  return (
    <button
      onClick={handleCopy}
      disabled={state === 'copying'}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] ${
        state === 'copied'
          ? 'bg-success/15 border-success/30 text-success'
          : state === 'copying'
          ? 'bg-surface border-border text-muted cursor-not-allowed'
          : 'bg-surface border-border text-text hover:bg-surface-secondary hover:border-border-light hover:text-white'
      }`}
    >
      {state === 'copying' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
          <span>Copying...</span>
        </>
      )}
      {state === 'copied' && (
        <>
          <Check className="h-3.5 w-3.5 text-success" />
          <span>{label ? `${label} Copied!` : 'Copied!'}</span>
        </>
      )}
      {state === 'default' && (
        <>
          <Copy className="h-3.5 w-3.5 text-muted" />
          <span>{label ? `Copy ${label}` : 'Copy'}</span>
        </>
      )}
    </button>
  )
}
