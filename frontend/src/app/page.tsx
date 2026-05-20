'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, 
  BarChart3, 
  Zap, 
  ShieldCheck, 
  ArrowRight, 
  Check, 
  Globe, 
  Layers, 
  Workflow, 
  Flame, 
  Send 
} from 'lucide-react'

export default function Home() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')

  const pricingTiers = [
    {
      name: "Starter",
      price: billingPeriod === 'monthly' ? "0" : "0",
      description: "Perfect for testing the AI content generation flow.",
      features: [
        "5 generated posts per month",
        "Standard caption generation",
        "1 brand profile scan",
        "Single platform scheduling",
        "Community support"
      ],
      buttonText: "Start Free Trial",
      href: "/signup",
      popular: false
    },
    {
      name: "Growth",
      price: billingPeriod === 'monthly' ? "19" : "15",
      description: "Designed for small businesses scaling their content.",
      features: [
        "30 generated posts per month",
        "Gemini-powered captions",
        "Parallel AI image generation",
        "Dynamic branded templates (Pillow)",
        "3 platform cross-publishing",
        "Email support"
      ],
      buttonText: "Go Growth",
      href: "/signup",
      popular: true
    },
    {
      name: "Pro",
      price: billingPeriod === 'monthly' ? "49" : "39",
      description: "For agencies and power users seeking maximum automation.",
      features: [
        "Unlimited generated posts",
        "Advanced custom brand strategy",
        "Premium multi-variant AI images",
        "Fully custom logo & canvas layouts",
        "All platform publishing (Insta, FB, LI)",
        "Priority 24/7 dedicated support",
        "API access & webhooks"
      ],
      buttonText: "Go Pro",
      href: "/signup",
      popular: false
    }
  ]

  return (
    <div className="relative flex flex-col min-h-screen bg-[#060608] text-white selection:bg-blue-500/30 overflow-x-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[130px]" />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="absolute bottom-10 left-1/3 w-[600px] h-[600px] rounded-full bg-pink-600/5 blur-[140px]" />
      </div>

      {/* Navigation */}
      <nav className="z-20 flex justify-between items-center px-8 py-6 border-b border-white/5 backdrop-blur-md bg-[#060608]/60 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold">B</div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">Brandflux</span>
        </div>
        <div className="hidden md:flex space-x-8 text-sm font-medium text-gray-400">
          <a href="#features" className="hover:text-white transition duration-200">Features</a>
          <a href="#how-it-works" className="hover:text-white transition duration-200">How it Works</a>
          <a href="#pricing" className="hover:text-white transition duration-200">Pricing</a>
        </div>
        <div className="flex items-center space-x-6">
          <Link href="/login" className="text-sm font-medium text-gray-400 hover:text-white transition">Login</Link>
          <Link href="/signup" className="px-5 py-2.5 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition duration-300 transform hover:scale-105 active:scale-95 shadow-md shadow-white/5">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-32 pb-24 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold mb-8">
            <Sparkles className="h-3 w-3" />
            <span>POWERED BY GEMINI 2.5 FLASH</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter leading-[1.1] mb-8">
            Automate Your Brand&apos;s <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
              Content Strategy
            </span>
          </h1>
          
          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Brandflux automatically syncs with your website, understands your brand identity, and generates professional multi-platform content daily.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link href="/signup" className="group px-8 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full font-bold text-lg hover:shadow-2xl hover:shadow-blue-500/30 transition-all flex items-center justify-center gap-2 transform hover:scale-105 active:scale-95">
              Start Free Trial
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="#how-it-works" className="px-8 py-4 bg-white/5 border border-white/10 rounded-full font-bold text-lg hover:bg-white/10 transition flex items-center justify-center">
              See How It Works
            </a>
          </div>
        </motion.div>

        {/* Feature Grid Preview */}
        <section id="features" className="scroll-mt-28 mt-40 w-full max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">Core Automation Features</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Everything you need to run your social media strategy completely on autopilot.</p>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              { 
                icon: Zap, 
                title: "Live Brand Sync", 
                desc: "Every time you open your dashboard, we scan your website for fresh updates and product changes automatically." 
              },
              { 
                icon: BarChart3, 
                title: "Smart Guidance", 
                desc: "Get weekly tailored posting schedules and ideal content mix suggestions generated specifically for your target audience." 
              },
              { 
                icon: ShieldCheck, 
                title: "AI Precision", 
                desc: "Gemini 2.5 Flash guarantees highly professional and brand-aligned captions, hashtags, and text overlays." 
              },
              { 
                icon: Globe, 
                title: "Multi-Platform Reach", 
                desc: "Simultaneously tailor captions and formats for Instagram Posts, Stories, LinkedIn, and Facebook with one single check-in." 
              },
              { 
                icon: Layers, 
                title: "Parallel Image Gen", 
                desc: "Concurrently generate 4 high-quality branded visual backdrops in 10 seconds flat using Pollinations AI." 
              },
              { 
                icon: Workflow, 
                title: "Dynamic Watermarking", 
                desc: "Automatically paint your exact brand primary colors, tagline, business name, and logo over post backdrops via Pillow canvas." 
              }
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 text-left hover:border-blue-500/30 transition-all hover:bg-white/[0.04] group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative z-10">
                  <feature.icon className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 relative z-10">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed relative z-10">{feature.desc}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="scroll-mt-28 mt-48 w-full max-w-6xl">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">How Brandflux Works</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Get ready-to-post, highly engaging social content in four simple steps.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 relative">
            {[
              {
                step: "01",
                title: "Scan Website",
                desc: "Provide your brand website. Our smart scrapers build your brand persona, core keywords, and color assets."
              },
              {
                step: "02",
                title: "Daily Check-in",
                desc: "Answer 3 extremely quick, daily context questions. What to focus on, active platforms, and custom promotions."
              },
              {
                step: "03",
                title: "AI Generation",
                desc: "Gemini decides the optimal strategy, writes tailored copy, and creates concurrent, high-end branded images."
              },
              {
                step: "04",
                title: "Publish & Track",
                desc: "Review the pre-formatted captions and watermarked graphics, then instantly schedule or post them online."
              }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center md:items-start text-center md:text-left relative p-6 bg-white/[0.01] border border-white/5 rounded-3xl group hover:border-purple-500/30 transition-all">
                <div className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-b from-blue-500/40 to-transparent mb-6 group-hover:scale-110 transition-transform">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="scroll-mt-28 mt-48 w-full max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">Flexible Pricing Tiers</h2>
            <p className="text-gray-400 max-w-xl mx-auto mb-8">Choose the plan that matches your business growth velocity.</p>
            
            {/* Billing period toggle */}
            <div className="inline-flex items-center gap-3 p-1 bg-white/5 border border-white/10 rounded-full">
              <button 
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${billingPeriod === 'monthly' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition flex items-center gap-1.5 ${billingPeriod === 'yearly' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                Yearly
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">Save 20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-stretch">
            {pricingTiers.map((tier, idx) => (
              <div 
                key={idx}
                className={`relative flex flex-col justify-between p-8 rounded-3xl border transition-all ${tier.popular ? 'bg-gradient-to-b from-blue-950/20 to-purple-950/20 border-blue-500/50 shadow-xl shadow-blue-500/5 scale-105 z-10' : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5" />
                    Most Popular
                  </div>
                )}
                
                <div>
                  <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                  <p className="text-gray-400 text-sm mb-6 leading-relaxed">{tier.description}</p>
                  
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-5xl font-black tracking-tight">${tier.price}</span>
                    <span className="text-gray-400 text-sm">/ {billingPeriod === 'monthly' ? 'month' : 'month, billed yearly'}</span>
                  </div>

                  <div className="border-t border-white/5 pt-6 mb-8">
                    <ul className="flex flex-col gap-4 text-sm text-gray-300 text-left">
                      {tier.features.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2.5">
                          <Check className="h-4.5 w-4.5 text-blue-400 mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Link 
                  href={tier.href}
                  className={`w-full py-3.5 font-bold rounded-full transition text-center ${tier.popular ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-95 transform active:scale-98' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white'}`}
                >
                  {tier.buttonText}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="z-10 border-t border-white/5 py-16 bg-[#060608]">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm">
          <div className="flex items-center gap-2 mb-8 md:mb-0">
            <div className="h-6 w-6 rounded bg-white/10 flex items-center justify-center font-bold text-xs">B</div>
            <span className="font-bold text-white tracking-tight">Brandflux</span>
            <span className="ml-4">© 2026. All rights reserved.</span>
          </div>
          
          <div className="flex space-x-12">
            <div className="flex flex-col gap-3">
              <span className="text-white font-bold mb-2">Product</span>
              <a href="#features" className="hover:text-white transition duration-200">Features</a>
              <a href="#how-it-works" className="hover:text-white transition duration-200">How it works</a>
              <a href="#pricing" className="hover:text-white transition duration-200">Pricing</a>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-white font-bold mb-2">Legal</span>
              <Link href="#" className="hover:text-white transition">Privacy Policy</Link>
              <Link href="#" className="hover:text-white transition">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}



