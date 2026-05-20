import React from 'react'

interface SkeletonProps {
  width?: string
  height?: string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full'
  className?: string
}

export default function Skeleton({
  width = '100%',
  height = '20px',
  rounded = 'md',
  className = ''
}: SkeletonProps) {
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    full: 'rounded-full',
  }

  return (
    <div
      className={`animate-pulse bg-white/[0.05] border border-white/5 ${roundedClasses[rounded]} ${className}`}
      style={{ width, height }}
    />
  )
}
