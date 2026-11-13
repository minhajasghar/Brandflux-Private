'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { 
  BarChart3, 
  Zap, 
  ShieldCheck, 
  ArrowRight, 
  Check, 
  Globe, 
  Layers, 
  Workflow, 
  Flame,
  Sparkles,
  Heart,
  MessageSquare,
  CheckCircle2,
  Users
} from 'lucide-react'
import BrandfluxLogo from '@/components/shared/BrandfluxLogo'
import api from '@/lib/api'

export default function Home() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [dbPlans, setDbPlans] = useState<any[]>([])

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await api.get('/billing/plans')
        const allPlans = res.data || []
        // Exclude legacy $0 'trial' row if 'starter' or paid plans exist, unless admin priced/customized it
        const filtered = allPlans.filter((p: any) => !(p.id === 'trial' && p.price_usd === 0 && allPlans.some((o: any) => o.id === 'starter')))
        if (filtered.length > 0) {
          setDbPlans(filtered)
        }
      } catch (err) {
        // Fallback handled below
      }
    }
    fetchPlans()
  }, [])

  const defaultPricingTiers = [
    {
      id: "starter",
      name: "Basic",
      price_monthly: 19,
      price_annual: 15,
      description: "Essential AI content generation, brand kit extraction & 1-click social publishing.",
      features: [
        "30 Post Credits / month (60 visuals)",
        "1 Brand Kit & Voice Profile",
        "3 Connected Social Platforms",
        "15 Image Re-rolls / month",
        "Auto Logo Background Removal",
        "1-Click Post Now & Calendar Scheduler",
        "1 Team Approver Seat"
      ],
      buttonText: "Choose Basic",
      href: "/signup",
      popular: false
    },
    {
      id: "growth",
      name: "Growth",
      price_monthly: 39,
      price_annual: 31,
      description: "Designed for small businesses & creators scaling across 5 social platforms.",
      features: [
        "100 Post Credits / month (200 visuals)",
        "3 Distinct Brand Kits",
        "5 Connected Platforms",
        "60 Image Re-rolls / month",
        "2K Ultra-HD Visual Generations",
        "Performance Analytics & Weekly Guidance",
        "3 Team Approver Seats"
      ],
      buttonText: "Choose Growth",
      href: "/signup",
      popular: true
    },
    {
      id: "pro",
      name: "Pro",
      price_monthly: 88,
      price_annual: 70,
      description: "For agencies and high-velocity teams seeking unlimited publishing & team seats.",
      features: [
        "200 Post Credits / month (400 visuals)",
        "10 Brand Kits & Multi-Brand Switcher",
        "All Platforms + X (Twitter) Publishing",
        "100 Image Re-rolls / month",
        "2K Ultra-HD Visual Generations",
        "Unlimited Daily Publishing",
        "10 Team Approver Seats & Priority Queue"
      ],
      buttonText: "Choose Pro",
      href: "/signup",
      popular: false
    }
  ]

  const pricingTiers = dbPlans.length > 0
    ? dbPlans.map((p) => {
        const monthly = p.price_usd ?? 19
        const annual = p.price_annual_usd ? Math.round(p.price_annual_usd / 12) : Math.round(monthly * 0.8)
        const isGrowth = p.id === 'growth'
        const rawName = (p.name || p.id || 'Basic').replace(/ Plan$/i, '')
        const cleanName = (p.id === 'starter' && rawName.toLowerCase() === 'starter') || (p.id === 'trial' && rawName.toLowerCase().includes('trial'))
          ? 'Basic'
          : rawName
        return {
          id: p.id,
          name: cleanName,
          price: billingPeriod === 'monthly' ? String(monthly) : String(annual),
          description: (p.id === 'starter' || p.id === 'trial')
            ? "Essential AI content generation, brand kit extraction & 1-click social publishing."
            : p.id === 'growth'
            ? "Designed for small businesses & creators scaling across 5 social platforms."
            : "For agencies and high-velocity teams seeking maximum automation.",
          features: (p.features && p.features.length > 0) ? p.features : [
            `${p.credits} Post Credits / month`,
            `${p.brands} Brand Kit(s)`,
            `${p.platforms} Connected Platforms`,
            `${p.reroll_pool ?? 15} Image Re-rolls / month`,
            "1-Click Post Now & Auto-Scheduler"
          ],
          buttonText: `Choose ${cleanName}`,
          href: "/signup",
          popular: isGrowth
        }
      })
    : defaultPricingTiers.map((t) => ({
        ...t,
        price: billingPeriod === 'monthly' ? String(t.price_monthly) : String(t.price_annual)
      }))

  return (
    <div className="relative flex flex-col min-h-screen bg-bg text-text selection:bg-accent selection:text-black overflow-x-hidden">
      {/* Sticky Header Navigation */}
      <nav className="z-50 flex justify-between items-center px-6 md:px-10 py-4 border-b border-border backdrop-blur-md bg-bg/85 sticky top-0">
        <div className="flex items-center gap-3">
          <BrandfluxLogo size={32} />
          <span className="text-xl font-extrabold tracking-tight text-text">Brandflux</span>
        </div>
        <div className="hidden md:flex space-x-8 text-sm font-medium text-muted">
          <a href="#features" className="hover:text-primary-light transition duration-200">Features</a>
          <a href="#how-it-works" className="hover:text-primary-light transition duration-200">How it Works</a>
          <a href="#pricing" className="hover:text-primary-light transition duration-200">Pricing</a>
        </div>
        <div className="flex items-center space-x-4">
          <Link href="/login" className="text-sm font-semibold text-muted hover:text-text transition">
            Login
          </Link>
          <Link 
            href="/signup" 
            className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-hover transition duration-200 active:scale-95 shadow-glow"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-20 pb-20 overflow-hidden">
        {/* Large radial cobalt glow behind headline (~25% opacity, ~800px, blurred) */}
        <div 
          aria-hidden="true" 
          className="absolute top-28 sm:top-36 left-1/2 -translate-x-1/2 w-[800px] max-w-[95vw] h-[450px] rounded-full bg-primary/25 blur-[120px] pointer-events-none -z-10" 
        />

        {/* Faint grid pattern masked to fade at edges */}
        <div 
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-20 -z-10"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(28, 32, 48, 0.8) 1px, transparent 1px), linear-gradient(to bottom, rgba(28, 32, 48, 0.8) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 50% at 50% 28%, #000 35%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 50% at 50% 28%, #000 35%, transparent 100%)',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          {/* Badge with primary-light dot */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-secondary border border-border text-xs font-semibold mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-light animate-pulse" />
            <span className="text-text font-medium tracking-wide">AI BRAND INTELLIGENCE &amp; SOCIAL AUTOMATION</span>
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Automate Your Brand&apos;s <br />
            <span className="text-accent">
              Social Media Strategy
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto leading-relaxed mb-10">
            Scan your website to extract your brand voice, palette, and logo. Generate 2 branded visual variants with hashtag-ready captions for Instagram, LinkedIn, Facebook, X &amp; TikTok — then approve, schedule, or post live in 1 click.
          </p>
          
          {/* Action buttons: Lime CTA + Secondary cobalt bordered button */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link 
              href="/signup" 
              className="px-8 py-3.5 bg-accent text-black font-extrabold text-base rounded-xl hover:bg-accent-hover transition-all flex items-center justify-center gap-2 active:scale-95 shadow-accent-glow"
            >
              Get Started
              <ArrowRight className="h-4 w-4 text-black" />
            </Link>
            <a 
              href="#how-it-works" 
              className="px-8 py-3.5 bg-surface border border-primary rounded-xl font-bold text-base text-text hover:bg-primary hover:text-white transition duration-200 flex items-center justify-center"
            >
              See How It Works
            </a>
          </div>
        </motion.div>

        {/* Dashboard Mockup with Floating Post Cards */}
        <div className="mt-16 sm:mt-20 w-full max-w-5xl relative mx-auto">
          {/* Cobalt glow under mockup */}
          <div 
            aria-hidden="true" 
            className="absolute -inset-1 rounded-3xl bg-primary/20 blur-2xl -z-10" 
          />

          {/* Main Mockup Window */}
          <div className="relative rounded-2xl md:rounded-3xl border border-primary/40 bg-surface/90 backdrop-blur-xl shadow-cobalt-lg p-4 sm:p-6 text-left">
            {/* Window Controls & Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-border mb-5">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#EF4444]/70" />
                <span className="h-3 w-3 rounded-full bg-[#F59E0B]/70" />
                <span className="h-3 w-3 rounded-full bg-[#10B981]/70" />
                <div className="hidden sm:flex items-center gap-2 ml-4 px-3 py-1 rounded-lg bg-surface-secondary border border-border text-xs text-muted">
                  <Globe className="h-3.5 w-3.5 text-primary-light" />
                  <span>app.brandflux.ai/studio</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary-light font-semibold text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-light animate-pulse" />
                  Brand Sync Live
                </span>
              </div>
            </div>

            {/* Mockup Internal Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left panel: Context check-in */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4 p-4 rounded-xl bg-surface-secondary/70 border border-border">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-text">Daily 15-Min Check-In</span>
                    <span className="text-[11px] font-semibold text-primary-light">Step 2 of 3</span>
                  </div>
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-lg bg-surface border border-border text-xs">
                      <span className="text-muted block text-[10px] uppercase font-bold tracking-wider mb-1">Today&apos;s Focus</span>
                      <span className="text-text font-medium">Launching our AI brand strategy sprint</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-border text-xs">
                      <span className="text-muted block text-[10px] uppercase font-bold tracking-wider mb-1">Target Audience</span>
                      <span className="text-text font-medium">Founders, growth marketers & creators</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-border text-xs">
                      <span className="text-muted block text-[10px] uppercase font-bold tracking-wider mb-1">Tone of Voice</span>
                      <span className="text-primary-light font-medium flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary-light" />
                        Confident, Authoritative, Inspiring
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/80 flex items-center justify-between text-xs text-muted">
                  <span>AI Generation ready</span>
                  <span className="px-2 py-0.5 rounded bg-primary/20 text-primary-light text-[10px] font-bold">100% Brand Match</span>
                </div>
              </div>

              {/* Right panel: Multi-platform generation preview */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-3 p-4 rounded-xl bg-surface-secondary/70 border border-border">
                {/* Platform tabs */}
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button className="px-2.5 py-1 rounded-lg text-xs font-bold bg-primary text-white">Instagram</button>
                    <button className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted hover:text-text">LinkedIn</button>
                    <button className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted hover:text-text">Facebook</button>
                    <button className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted hover:text-text">X</button>
                    <button className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted hover:text-text">TikTok</button>
                  </div>
                  <span className="text-[11px] text-muted hidden sm:inline">2 Visual Variants</span>
                </div>

                {/* Content generation preview */}
                <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-xs">BF</div>
                    <div>
                      <p className="text-xs font-bold text-text leading-tight">Brandflux Official</p>
                      <p className="text-[10px] text-muted">Generated by Brandflux AI Engine</p>
                    </div>
                  </div>
                  <p className="text-xs text-text/90 leading-relaxed font-normal">
                    &ldquo;Building a distinct brand voice shouldn&apos;t drain your daily hours. Brandflux automates your multi-platform output while safeguarding your original vision.&rdquo;
                  </p>
                  <p className="text-[11px] text-primary-light font-medium">
                    #BrandStrategy #ContentAutomation #GrowthHacking #AITools
                  </p>
                </div>

                {/* Action bar inside mockup */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-2 text-muted text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary-light" />
                    <span>Transparent Logo &amp; Hashtags Synced</span>
                  </div>
                  <span className="text-[11px] text-primary-light font-bold">⚡ 1-Click Post Now Ready</span>
                </div>
              </div>
            </div>

            {/* Floating Card 1: Instagram Post Card */}
            <div className="absolute -top-7 -right-3 sm:-right-6 md:-right-8 w-64 sm:w-72 bg-surface-secondary/95 border border-primary/40 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md hidden sm:block">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center text-white text-[10px] font-bold">
                    IG
                  </div>
                  <span className="text-xs font-bold text-text">@brandflux</span>
                </div>
                <span className="text-[10px] text-muted">2m ago</span>
              </div>
              <div className="h-24 w-full rounded-lg bg-gradient-to-br from-primary/30 to-surface border border-primary/20 p-2.5 flex flex-col justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-primary-light tracking-wide">Dynamic Template</span>
                <p className="text-xs font-extrabold text-text line-clamp-2">How 15 Mins Daily Scaled Our Social Reach by 340%</p>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-500 fill-red-500" /> 482</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> 39</span>
                </div>
                <span className="text-primary-light font-semibold text-[10px]">Ready to Post</span>
              </div>
            </div>

            {/* Floating Card 2: LinkedIn Post Card */}
            <div className="absolute -bottom-8 -left-3 sm:-left-6 md:-left-8 w-72 sm:w-80 bg-surface-secondary/95 border border-primary/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md hidden sm:block">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-[#0A66C2] flex items-center justify-center text-white font-bold text-xs">
                    in
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text leading-tight">Brandflux</p>
                    <p className="text-[10px] text-muted">12,450 followers</p>
                  </div>
                </div>
                <span className="text-[10px] text-primary-light font-bold bg-primary/15 px-2 py-0.5 rounded">High Engagement</span>
              </div>
              <p className="text-xs text-text/85 line-clamp-2 mb-2 font-medium">
                &ldquo;Consistency isn&apos;t working more hours. It&apos;s having AI systems that protect your tone while you sleep.&rdquo;
              </p>
              <div className="flex items-center justify-between text-[11px] text-primary-light border-t border-border/80 pt-2 font-semibold">
                <span>🚀 2,410 Impressions</span>
                <span className="text-muted text-[10px]">Scheduled 09:30 AM</span>
              </div>
            </div>

            {/* Floating Card 3: Metrics / Status Pill */}
            <div className="absolute -bottom-3 right-6 sm:right-12 bg-surface border border-primary/50 text-xs px-3.5 py-1.5 rounded-full flex items-center gap-2 shadow-glow text-text">
              <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
              <span className="font-semibold text-xs">5 Platforms Connected &amp; Auto-Scheduled</span>
            </div>
          </div>
        </div>

        {/* Section Divider (Cobalt-to-transparent gradient line) */}
        <div className="w-full max-w-5xl h-px my-24 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* Feature Grid */}
        <section id="features" className="scroll-mt-24 w-full max-w-6xl">
          <div className="text-center mb-14">
            <p className="text-primary-light text-xs font-bold tracking-widest uppercase mb-2">Platform Capabilities</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">Built for End-to-End Social Automation</h2>
            <p className="text-muted max-w-2xl mx-auto text-sm md:text-base">From website brand extraction and AI visual generation to team approvals and live auto-publishing.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { 
                icon: Globe, 
                title: "Website Brand DNA Extraction", 
                desc: "Enter your website URL to automatically extract your business identity, brand tone, products, and layered color palette into your Brand Kit." 
              },
              { 
                icon: Sparkles, 
                title: "Auto Logo Background Removal", 
                desc: "Upload your brand logo and Brandflux automatically removes solid backgrounds into crisp transparent PNGs for clean, studio-grade post visuals." 
              },
              { 
                icon: Layers, 
                title: "2-Variant AI Visual & Copy Studio", 
                desc: "Generate 2 distinct AI-designed visual layouts per check-in alongside platform-tailored captions with hashtags embedded automatically." 
              },
              { 
                icon: Zap, 
                title: "1-Click Post Now & 5-Platform Reach", 
                desc: "Publish immediately across Instagram, LinkedIn, Facebook, X (Twitter), and TikTok directly from Studio with zero extra forms." 
              },
              { 
                icon: Workflow, 
                title: "Batch Calendar & Auto-Publish Agent", 
                desc: "Select multiple platforms at once to batch-schedule posts on your Content Calendar. Our background agent publishes them live on time." 
              },
              { 
                icon: Users, 
                title: "Team Approvals & Growth Analytics", 
                desc: "Create dedicated Approver accounts under your brand to review, edit, or approve posts before publishing, plus track weekly guidance & analytics." 
              }
            ].map((feature, i) => (
              <div 
                key={i} 
                className="p-7 rounded-2xl bg-surface border border-border hover:border-primary hover:shadow-[0_0_25px_-5px_rgba(21,88,201,0.3)] transition-all duration-300 text-left group"
              >
                <div className="h-11 w-11 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <feature.icon className="h-5 w-5 text-primary-light" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-text">{feature.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section Divider (Cobalt-to-transparent gradient line) */}
        <div className="w-full max-w-5xl h-px my-28 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* How It Works Section */}
        <section id="how-it-works" className="scroll-mt-24 w-full max-w-6xl">
          <div className="text-center mb-16">
            <p className="text-primary-light text-xs font-bold tracking-widest uppercase mb-2">Workflow</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">How Brandflux Works</h2>
            <p className="text-muted max-w-xl mx-auto text-sm md:text-base">Go from your website URL to approved, scheduled, or live social posts in four steps.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Scan Website & Brand Kit",
                desc: "Enter your website URL and upload your logo. Brandflux extracts your brand colors, voice, and offerings while removing logo backgrounds automatically."
              },
              {
                step: "02",
                title: "Daily Check-In or AI Ideas",
                desc: "Answer 3 quick daily context questions—or pick from AI content ideas—and select your target social platforms."
              },
              {
                step: "03",
                title: "Generate 2 Branded Variants",
                desc: "Receive 2 custom AI visual designs and hashtag-ready captions tailored for Instagram, LinkedIn, Facebook, X & TikTok."
              },
              {
                step: "04",
                title: "Approve, Schedule, or Post Now",
                desc: "Send to your team approver for review, batch-schedule to your Content Calendar, or click Post Now to publish live immediately."
              }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center md:items-start text-center md:text-left p-6 bg-surface border border-border hover:border-border-light rounded-2xl transition">
                <div className="text-4xl font-black text-primary-light mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-bold mb-2 text-text">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section Divider (Cobalt-to-transparent gradient line) */}
        <div className="w-full max-w-5xl h-px my-28 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* Pricing Section */}
        <section id="pricing" className="scroll-mt-24 w-full max-w-6xl">
          <div className="text-center mb-14">
            <p className="text-primary-light text-xs font-bold tracking-widest uppercase mb-2">Pricing Plans</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">Flexible Pricing Plans</h2>
            <p className="text-muted max-w-xl mx-auto mb-8 text-sm md:text-base">Choose the plan that matches your business growth velocity.</p>
            
            {/* Billing period toggle */}
            <div className="inline-flex items-center gap-2 p-1 bg-surface border border-border rounded-xl">
              <button 
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${billingPeriod === 'monthly' ? 'bg-accent text-black font-extrabold shadow-sm' : 'text-muted hover:text-text'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${billingPeriod === 'yearly' ? 'bg-accent text-black font-extrabold shadow-sm' : 'text-muted hover:text-text'}`}
              >
                Yearly
                <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded font-extrabold">Save 20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {pricingTiers.map((tier, idx) => (
              <div 
                key={idx}
                className={`relative flex flex-col justify-between p-8 rounded-2xl border transition-all ${
                  tier.popular 
                    ? 'bg-surface-secondary border-primary shadow-[0_0_35px_-5px_rgba(21,88,201,0.35)] scale-[1.02] z-10' 
                    : 'bg-surface border-border hover:border-border-light'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider px-3.5 py-0.5 rounded-full flex items-center gap-1 shadow-glow">
                    <Flame className="h-3 w-3 text-accent" />
                    Most Popular
                  </div>
                )}
                
                <div>
                  <h3 className="text-xl font-bold mb-1 text-text">{tier.name}</h3>
                  <p className="text-muted text-xs mb-6 leading-relaxed">{tier.description}</p>
                  
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold tracking-tight text-text">${tier.price}</span>
                    <span className="text-muted text-xs">/ {billingPeriod === 'monthly' ? 'month' : 'mo, billed yearly'}</span>
                  </div>

                  <div className="border-t border-border pt-6 mb-8">
                    <ul className="flex flex-col gap-3 text-xs text-text text-left">
                      {tier.features.map((feature: any, fIdx: number) => (
                        <li key={fIdx} className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-primary-light mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Link 
                  href={tier.href}
                  className={`w-full py-3 font-bold rounded-xl text-xs transition text-center active:scale-98 ${
                    tier.popular 
                      ? 'bg-accent hover:bg-accent-hover text-black font-extrabold shadow-accent-glow' 
                      : 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                  }`}
                >
                  {tier.buttonText}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="z-10 border-t border-border py-12 bg-surface">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-muted text-xs">
          <div className="flex items-center gap-2.5 mb-6 md:mb-0">
            <BrandfluxLogo size={24} />
            <span className="font-bold text-text">Brandflux</span>
            <span className="ml-3">© 2026. All rights reserved.</span>
          </div>
          
          <div className="flex space-x-8">
            <a href="#features" className="hover:text-primary-light transition">Features</a>
            <a href="#how-it-works" className="hover:text-primary-light transition">How it works</a>
            <a href="#pricing" className="hover:text-primary-light transition">Pricing</a>
            <Link href="/login" className="hover:text-primary-light transition">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
