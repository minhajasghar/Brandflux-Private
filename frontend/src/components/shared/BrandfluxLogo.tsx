'use client'

import React from 'react'

interface BrandfluxLogoProps {
  className?: string
  size?: number
  showText?: boolean
  textClassName?: string
}

export default function BrandfluxLogo({
  className = '',
  size = 36,
  showText = false,
  textClassName = 'text-xl font-extrabold tracking-tight text-text'
}: BrandfluxLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 group-hover:scale-105"
      >
        <defs>
          <linearGradient id="bfBgGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#161B28" />
            <stop offset="100%" stopColor="#07090F" />
          </linearGradient>
          <linearGradient id="bfBlueGrad" x1="16" y1="14" x2="48" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="bfVoltGrad" x1="16" y1="30" x2="48" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E2FF4A" />
            <stop offset="100%" stopColor="#A3E635" />
          </linearGradient>
          <filter id="bfVoltGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Squircle Background Container */}
        <rect width="64" height="64" rx="18" fill="url(#bfBgGrad)" />
        <rect
          x="0.75"
          y="0.75"
          width="62.5"
          height="62.5"
          rx="17.25"
          stroke="#252D40"
          strokeWidth="1.5"
        />

        {/* Top Loop: Cobalt Blue Flux */}
        <path
          d="M19 16C19 14.8954 19.8954 14 21 14H35C40.5228 14 45 18.4772 45 24C45 29.5228 40.5228 34 35 34H21C19.8954 34 19 33.1046 19 32V16Z"
          fill="url(#bfBlueGrad)"
        />
        <path
          d="M26 20H34C36.2091 20 38 21.7909 38 24C38 26.2091 36.2091 28 34 28H26V20Z"
          fill="#0C0F17"
        />

        {/* Bottom Loop: Cyber Volt Lime Flux with dynamic glow */}
        <path
          d="M19 28H37C42.5228 28 47 32.4772 47 38C47 43.5228 42.5228 48 37 48H21C19.8954 48 19 47.1046 19 46V28Z"
          fill="url(#bfVoltGrad)"
          filter="url(#bfVoltGlow)"
        />
        <path
          d="M26 34H36C38.2091 34 40 35.7909 40 38C40 40.2091 38.2091 42 36 42H26V34Z"
          fill="#07090F"
        />

        {/* Cyber Spark Accent Dot */}
        <circle cx="45" cy="18" r="2.5" fill="#E2FF4A" />
      </svg>

      {showText && <span className={textClassName}>Brandflux</span>}
    </div>
  )
}
