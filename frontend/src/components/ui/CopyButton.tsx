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
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-black transition-all active:scale-[0.98] ${
        state === 'copied'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : state === 'copying'
          ? 'bg-white/5 border-white/10 text-gray-400 cursor-not-allowed'
          : 'bg-white/5 border-white/10 text-blue-400 hover:bg-white/10 hover:border-white/20'
      }`}
    >
      {state === 'copying' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Copying...</span>
        </>
      )}
      {state === 'copied' && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span>{label ? `${label} Copied!` : 'Copied!'}</span>
        </>
      )}
      {state === 'default' && (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>{label ? `Copy ${label}` : 'Copy'}</span>
        </>
      )}
    </button>
  )
}
