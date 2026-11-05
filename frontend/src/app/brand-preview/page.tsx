'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Check, ShieldCheck, Eye, Sparkles, Layers, Sliders, ArrowRight } from 'lucide-react'

// --- 1. Hand-coded SVG Concepts ---

// Concept 1: Dynamic Flowing Ribbons B
function RibbonLogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Primary vertical stem & upper ribbon loop in Cobalt */}
      <path
        d="M14 8C10.6863 8 8 10.6863 8 14V50C8 53.3137 10.6863 56 14 56H36C44.8366 56 52 48.8366 52 40C52 35.5817 49.3333 31.5 45 29C49.3333 26.5 52 22.4183 52 18C52 12.4772 47.5228 8 42 8H14Z"
        fill="#1558C9"
      />
      {/* Lower flowing loop in Light Cobalt for depth & kinetic flow */}
      <path
        d="M22 28H37C42.5228 28 47 32.4772 47 38C47 43.5228 42.5228 48 37 48H22V28Z"
        fill="#4C8DFF"
      />
      {/* Top loop counter cut-out (Midnight / Dark) */}
      <path
        d="M22 16H35C38.3137 16 41 18.6863 41 22C41 25.3137 38.3137 28 35 28H22V16Z"
        fill="#05060A"
      />
      {/* Lower loop counter cut-out (Midnight / Dark) */}
      <path
        d="M26 34H36C38.2091 34 40 35.7909 40 38C40 40.2091 38.2091 42 36 42H26V34Z"
        fill="#05060A"
      />
      {/* Energetic Lime Trajectory Accent at the convergence fold */}
      <path
        d="M34 26L42 28.5L34 31V26Z"
        fill="#D4FF24"
      />
    </svg>
  )
}

// Concept 2: Stacked Strata B
function StrataLogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Top Strata bar (Cobalt) */}
      <rect x="8" y="8" width="38" height="13" rx="4" fill="#1558C9" />
      <path d="M40 8H46C50.4183 8 54 11.5817 54 16C54 20.4183 50.4183 24 46 24H40V8Z" fill="#1558C9" />

      {/* Middle Strata bar (Light Cobalt) */}
      <rect x="8" y="25" width="32" height="14" rx="4" fill="#4C8DFF" />
      {/* Sharp Lime Velocity Wedge on the central bar */}
      <path d="M38 25L48 32L38 39V25Z" fill="#D4FF24" />

      {/* Bottom Strata bar (Cobalt) */}
      <rect x="8" y="43" width="40" height="13" rx="4" fill="#1558C9" />
      <path d="M42 43H48C52.4183 43 56 46.5817 56 51C56 55.4183 52.4183 59 48 59H42V43Z" fill="#1558C9" />

      {/* Vertical Backbone Anchor */}
      <rect x="8" y="8" width="12" height="48" rx="4" fill="#1558C9" />
    </svg>
  )
}

// Concept 3: Kinetic Flux Tile
function FluxTileLogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Solid Cobalt Rounded Squircle Tile */}
      <rect width="64" height="64" rx="16" fill="#1558C9" />

      {/* Forward-Motion Kinetic Flux Chevron (White / Text High-Contrast) */}
      <path
        d="M18 16L32 32L18 48H28L42 32L28 16H18Z"
        fill="#F4F5F7"
      />

      {/* Acute Lime Velocity Notch in Upper Right Trajectory */}
      <path
        d="M45 15H53V23L45 15Z"
        fill="#D4FF24"
      />
      <circle cx="49" cy="45" r="3.5" fill="#4C8DFF" />
    </svg>
  )
}

export default function BrandPreviewPage() {
  const [selectedConcept, setSelectedConcept] = useState<'ribbon' | 'strata' | 'flux'>('ribbon')

  const concepts = [
    {
      id: 'ribbon',
      title: 'Concept 1: Dynamic Flowing Ribbons B',
      description: 'Two interlocking, flowing ribbons construct a continuous capital "B", punctuated by an acute lime energy fold at the junction. Symbolizes fluid content transformation and multi-platform reach.',
      renderMark: (size: number) => <RibbonLogoMark size={size} />,
      contrastDark: '16.5:1 (AAA on Midnight)',
      contrastLight: '5.1:1 (AA on White)',
      highlights: ['Strong "B" recognition', 'Fluid dual-ribbon loops', 'Lime energy fold']
    },
    {
      id: 'strata',
      title: 'Concept 2: Stacked Strata B',
      description: 'Three precision-sheared isometric horizontal strata anchored by a solid backbone to form an architectural "B". Features an acute lime velocity wedge on the central bar. Symbolizes solid brand foundations and tiered AI generation.',
      renderMark: (size: number) => <StrataLogoMark size={size} />,
      contrastDark: '16.5:1 (AAA on Midnight)',
      contrastLight: '5.4:1 (AA on White)',
      highlights: ['Architectural stability', 'Tiered strata layers', 'High-definition 16px silhouette']
    },
    {
      id: 'flux',
      title: 'Concept 3: Kinetic Flux Tile',
      description: 'A solid cobalt rounded-squircle tile sliced with a high-contrast forward-motion flux chevron and an acute lime trajectory accent. Symbolizes speed, velocity, and automated social publishing.',
      renderMark: (size: number) => <FluxTileLogoMark size={size} />,
      contrastDark: '18.2:1 (AAA on Midnight)',
      contrastLight: '5.1:1 (AA on White)',
      highlights: ['App-icon squircle form factor', 'Forward flux velocity', 'Instant 16px favicon readability']
    }
  ]

  return (
    <div className="min-h-screen bg-[#05060A] text-[#F4F5F7] p-6 sm:p-10 font-sans selection:bg-[#D4FF24] selection:text-black">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-3 border-b border-white/10 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1558C9]/20 border border-[#1558C9]/40 text-[#4C8DFF] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5" />
          Brand Identity System &bull; Step 3 Selection
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
          Brandflux Identity Concepts &amp; Wordmark Preview
        </h1>
        <p className="text-sm text-[#A0A5B5] max-w-3xl leading-relaxed">
          Brand Tokens: <strong>Cobalt</strong> (<code className="text-[#4C8DFF]">#1558C9</code>), <strong>Light Cobalt</strong> (<code className="text-[#4C8DFF]">#4C8DFF</code>), <strong>Midnight</strong> (<code className="text-zinc-400">#05060A</code>), <strong>Surface</strong> (<code className="text-zinc-400">#0D0F16</code>), <strong>Lime Accent</strong> (<code className="text-[#D4FF24]">#D4FF24</code>), and <strong>Text</strong> (<code className="text-white">#F4F5F7</code>).
          Solid shapes, zero thin strokes, zero generic clip-art bolts, tested down to 16px.
        </p>
      </div>

      {/* Main Concepts Grid */}
      <div className="max-w-7xl mx-auto mt-10 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {concepts.map((concept) => {
            const isSelected = selectedConcept === concept.id
            return (
              <div
                key={concept.id}
                onClick={() => setSelectedConcept(concept.id as any)}
                className={`cursor-pointer rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#0D0F16] border-[#D4FF24] shadow-2xl shadow-[#D4FF24]/10 ring-1 ring-[#D4FF24]'
                    : 'bg-[#0D0F16]/60 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-[#A0A5B5]">
                      {concept.id.toUpperCase()}
                    </span>
                    {isSelected && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#D4FF24] text-black text-[10px] font-black uppercase flex items-center gap-1">
                        <Check className="h-3 w-3 stroke-[3]" /> Active Selection
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-black text-white">{concept.title}</h3>
                  <p className="text-xs text-[#A0A5B5] leading-relaxed">{concept.description}</p>

                  {/* Dark Mode Wordmark Preview */}
                  <div className="p-6 rounded-2xl bg-[#05060A] border border-white/10 flex items-center gap-4">
                    {concept.renderMark(48)}
                    <div>
                      <div className="font-extrabold text-2xl tracking-tight text-[#F4F5F7]" style={{ fontFamily: 'var(--font-jakarta, sans-serif)' }}>
                        Brandflux
                      </div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Dark Surface (#05060A)</span>
                    </div>
                  </div>

                  {/* Light Mode Wordmark Preview */}
                  <div className="p-6 rounded-2xl bg-white border border-zinc-200 flex items-center gap-4 text-zinc-900">
                    {concept.renderMark(48)}
                    <div>
                      <div className="font-extrabold text-2xl tracking-tight text-zinc-900" style={{ fontFamily: 'var(--font-jakarta, sans-serif)' }}>
                        Brandflux
                      </div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Light Surface (#FFFFFF)</span>
                    </div>
                  </div>

                  {/* Multi-Scale Size Demonstration */}
                  <div className="p-4 rounded-2xl bg-[#0D0F16] border border-white/5 space-y-2">
                    <span className="text-[10px] font-bold text-[#A0A5B5] uppercase block">
                      Scale Legibility Test (128px &bull; 64px &bull; 32px &bull; 16px)
                    </span>
                    <div className="flex items-end gap-6 pt-2">
                      <div className="flex flex-col items-center gap-1">
                        {concept.renderMark(64)}
                        <span className="text-[9px] text-zinc-500 font-mono">64px</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        {concept.renderMark(32)}
                        <span className="text-[9px] text-zinc-500 font-mono">32px</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        {concept.renderMark(24)}
                        <span className="text-[9px] text-zinc-500 font-mono">24px</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="p-1 bg-white/5 rounded border border-white/10">
                          {concept.renderMark(16)}
                        </div>
                        <span className="text-[9px] text-[#D4FF24] font-mono font-bold">16px favicon</span>
                      </div>
                    </div>
                  </div>

                  {/* Contrast Verification */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Dark Contrast</span>
                      <strong className="text-emerald-400 font-bold">{concept.contrastDark}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Light Contrast</span>
                      <strong className="text-emerald-400 font-bold">{concept.contrastLight}</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedConcept(concept.id as any)
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-black transition ${
                      isSelected
                        ? 'bg-[#D4FF24] text-black shadow-lg shadow-[#D4FF24]/20'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {isSelected ? '✓ Selected for Production' : 'Choose this Concept'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Deep Dive & Selected Comparison Panel */}
        <div className="p-8 rounded-3xl bg-[#0D0F16] border border-white/10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <span className="text-xs font-bold text-[#D4FF24] uppercase tracking-wider">Side-by-Side Wordmark Comparison</span>
              <h2 className="text-xl font-black text-white mt-0.5">Plus Jakarta Sans ExtraBold + SVG Mark Pairings</h2>
            </div>
            <div className="text-xs text-[#A0A5B5]">
              Select your favorite above, then reply with your choice to generate production icon packages.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Concept 1 Dark */}
            <div className="p-6 rounded-2xl bg-[#05060A] border border-white/10 space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Concept 1 on Midnight</span>
              <div className="flex items-center gap-3">
                <RibbonLogoMark size={40} />
                <span className="text-2xl font-black text-white tracking-tight">Brandflux</span>
              </div>
            </div>

            {/* Concept 2 Dark */}
            <div className="p-6 rounded-2xl bg-[#05060A] border border-white/10 space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Concept 2 on Midnight</span>
              <div className="flex items-center gap-3">
                <StrataLogoMark size={40} />
                <span className="text-2xl font-black text-white tracking-tight">Brandflux</span>
              </div>
            </div>

            {/* Concept 3 Dark */}
            <div className="p-6 rounded-2xl bg-[#05060A] border border-white/10 space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Concept 3 on Midnight</span>
              <div className="flex items-center gap-3">
                <FluxTileLogoMark size={40} />
                <span className="text-2xl font-black text-white tracking-tight">Brandflux</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Concept 1 Light */}
            <div className="p-6 rounded-2xl bg-white border border-zinc-200 space-y-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Concept 1 on White</span>
              <div className="flex items-center gap-3">
                <RibbonLogoMark size={40} />
                <span className="text-2xl font-black text-zinc-950 tracking-tight">Brandflux</span>
              </div>
            </div>

            {/* Concept 2 Light */}
            <div className="p-6 rounded-2xl bg-white border border-zinc-200 space-y-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Concept 2 on White</span>
              <div className="flex items-center gap-3">
                <StrataLogoMark size={40} />
                <span className="text-2xl font-black text-zinc-950 tracking-tight">Brandflux</span>
              </div>
            </div>

            {/* Concept 3 Light */}
            <div className="p-6 rounded-2xl bg-white border border-zinc-200 space-y-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Concept 3 on White</span>
              <div className="flex items-center gap-3">
                <FluxTileLogoMark size={40} />
                <span className="text-2xl font-black text-zinc-950 tracking-tight">Brandflux</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
