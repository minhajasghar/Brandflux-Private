'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { 
  Building2, 
  ChevronDown, 
  Plus, 
  Check, 
  Globe, 
  Sparkles, 
  ArrowUpRight, 
  Loader2, 
  X,
  Palette
} from 'lucide-react'
import { getUserBrands, switchActiveBrand, addNewBrand, scanWebsite } from '@/lib/api'

interface BrandItem {
  id: string
  name: string
  business_name?: string
  website_url?: string
  logo_url?: string
  primary_color?: string
  secondary_color?: string
  colors?: string[]
  is_active?: boolean
}

export default function BrandSwitcher() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [brands, setBrands] = useState<BrandItem[]>([])
  const [activeBrandId, setActiveBrandId] = useState<string>('')
  const [plan, setPlan] = useState<string>('starter')
  const [brandLimit, setBrandLimit] = useState<number>(1)
  const [totalBrands, setTotalBrands] = useState<number>(1)
  const [canAddBrand, setCanAddBrand] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [switching, setSwitching] = useState<boolean>(false)

  // Add Brand Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [scannedKit, setScannedKit] = useState<any>(null)
  const [brandName, setBrandName] = useState('')

  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchBrands = async () => {
    try {
      const data = await getUserBrands()
      if (data) {
        setBrands(data.brands || [])
        setActiveBrandId(data.active_brand_id || (data.brands?.[0]?.id ?? ''))
        setPlan(data.plan || 'starter')
        setBrandLimit(data.brand_limit || 1)
        setTotalBrands(data.total_brands || 1)
        setCanAddBrand(Boolean(data.can_add_brand))
      }
    } catch (err) {
      console.error('Failed to load user brands:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBrands()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const activeBrand = brands.find((b) => b.id === activeBrandId) || brands[0]

  const handleSwitchBrand = async (brandId: string) => {
    if (brandId === activeBrandId || switching) return
    try {
      setSwitching(true)
      await switchActiveBrand(brandId)
      setActiveBrandId(brandId)
      setIsOpen(false)
      toast.success('Switched active brand')
      // Refresh current page context to reload brand data
      window.location.reload()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to switch brand')
      setSwitching(false)
    }
  }

  const handleScanNewWebsite = async () => {
    if (!newUrl.trim()) {
      toast.error('Please enter a website URL')
      return
    }

    let formattedUrl = newUrl.trim()
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`
      setNewUrl(formattedUrl)
    }

    try {
      setScanning(true)
      const res = await scanWebsite(formattedUrl)
      if (res && res.brand_data) {
        setScannedKit(res.brand_data)
        setBrandName(res.brand_data.business_name || '')
        toast.success('Website scanned! Review brand profile below.')
      } else {
        toast.error('Could not extract brand details from this URL.')
      }
    } catch (err: any) {
      console.error('Scan error:', err)
      toast.error(err.response?.data?.detail || 'Failed to scan website')
    } finally {
      setScanning(false)
    }
  }

  const handleCreateBrand = async () => {
    if (!newUrl.trim()) {
      toast.error('Website URL is required')
      return
    }

    let formattedUrl = newUrl.trim()
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`
    }

    try {
      setCreating(true)
      const res = await addNewBrand({
        name: brandName.trim() || undefined,
        website_url: formattedUrl,
        brand_kit: scannedKit || undefined,
      })
      toast.success(`Brand "${res.name || brandName || 'New Brand'}" created successfully!`)
      setIsAddModalOpen(false)
      setNewUrl('')
      setScannedKit(null)
      setBrandName('')
      window.location.reload()
    } catch (err: any) {
      console.error('Create brand error:', err)
      toast.error(err.response?.data?.detail || 'Failed to create brand')
      setCreating(false)
    }
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* ─── Top Bar Trigger Button ─── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-surface border border-border hover:border-primary/50 hover:bg-surface-secondary/70 transition duration-200 text-left group"
        aria-label="Switch Brand"
      >
        {/* Brand Logo / Avatar Swatch */}
        <div 
          className="h-6 w-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border border-border overflow-hidden"
          style={{ 
            backgroundColor: activeBrand?.primary_color || '#1558C9',
            color: '#FFFFFF'
          }}
        >
          {activeBrand?.logo_url ? (
            <img 
              src={activeBrand.logo_url} 
              alt={activeBrand.name || 'Brand'} 
              className="h-full w-full object-cover"
              onError={(e) => {
                // fallback to letter initial on broken image
                (e.target as HTMLElement).style.display = 'none'
              }}
            />
          ) : (
            <span>{(activeBrand?.name || activeBrand?.business_name || 'B').charAt(0).toUpperCase()}</span>
          )}
        </div>

        {/* Brand Name & Quota */}
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-text truncate max-w-[120px] sm:max-w-[160px]">
              {activeBrand?.name || activeBrand?.business_name || 'My Brand'}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary/15 text-primary-light border border-primary/20">
              {totalBrands}/{brandLimit}
            </span>
          </div>
        </div>

        <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-text' : 'group-hover:text-text'}`} />
      </button>

      {/* ─── Dropdown Menu ─── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-surface border border-border shadow-2xl p-2 z-50 backdrop-blur-xl"
          >
            {/* Header: Plan Limit Status */}
            <div className="px-3 py-2.5 rounded-xl bg-surface-secondary/70 border border-border mb-2">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-bold text-text flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary-light" />
                  Brands
                </span>
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  {plan} • {totalBrands}/{brandLimit} used
                </span>
              </div>
              <div className="w-full bg-bg h-1.5 rounded-full overflow-hidden border border-border/50">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (totalBrands / Math.max(1, brandLimit)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Brands List */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
              {brands.map((b) => {
                const isActive = b.id === activeBrandId
                const displayName = b.name || b.business_name || 'Untitled Brand'
                const displayUrl = b.website_url ? b.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null

                return (
                  <button
                    key={b.id}
                    onClick={() => handleSwitchBrand(b.id)}
                    disabled={switching}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition duration-150 group ${
                      isActive 
                        ? 'bg-primary/15 border border-primary/40 text-text' 
                        : 'hover:bg-surface-secondary text-muted hover:text-text border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div 
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border border-border overflow-hidden"
                        style={{ 
                          backgroundColor: b.primary_color || '#1558C9',
                          color: '#FFFFFF'
                        }}
                      >
                        {b.logo_url ? (
                          <img 
                            src={b.logo_url} 
                            alt={displayName} 
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <span>{displayName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isActive ? 'text-text' : 'group-hover:text-text'}`}>
                          {displayName}
                        </p>
                        {displayUrl && (
                          <p className="text-[10px] text-muted truncate flex items-center gap-1">
                            <Globe className="h-2.5 w-2.5" />
                            {displayUrl}
                          </p>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <span className="h-5 w-5 rounded-full bg-primary/20 text-primary-light flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Divider */}
            <div className="h-px bg-border my-2" />

            {/* Add Brand Action */}
            {canAddBrand ? (
              <button
                onClick={() => {
                  setIsOpen(false)
                  setIsAddModalOpen(true)
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-surface-secondary border border-border hover:border-primary text-text hover:text-white hover:bg-primary transition duration-200 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Brand ({totalBrands}/{brandLimit})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push('/pricing')
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-surface-secondary border border-accent/30 hover:border-accent text-accent transition duration-200 text-xs font-bold group"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Upgrade to add more brands
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add Brand Flow Modal ─── */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!creating && !scanning) setIsAddModalOpen(false)
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-2xl z-10 space-y-6"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary-light" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-text">Add New Brand</h3>
                    <p className="text-xs text-muted">
                      Enter your website URL to automatically extract colors, typography, and tone.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={creating || scanning}
                  className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface-secondary transition"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* URL Input & Scan Action */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-text uppercase tracking-wider block">
                  Website URL
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="url"
                      placeholder="https://acme-analytics.com"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleScanNewWebsite()
                        }
                      }}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm text-text placeholder-muted focus:outline-none focus:border-primary transition"
                    />
                  </div>
                  <button
                    onClick={handleScanNewWebsite}
                    disabled={scanning || !newUrl.trim()}
                    className="px-4 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Scanning...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Scan URL</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Scanned Preview Card */}
              {scannedKit && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-surface-secondary border border-border space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <span className="text-xs font-bold text-text flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                      Detected Brand Kit
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                      Scan Ready
                    </span>
                  </div>

                  {/* Brand Name Input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted uppercase">Brand Name</label>
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Brand Name"
                      className="w-full px-3 py-1.5 rounded-lg bg-bg border border-border text-xs font-bold text-text focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  {/* Extracted Colors Swatches */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted uppercase flex items-center gap-1">
                      <Palette className="h-3 w-3" /> Extracted Palette
                    </label>
                    <div className="flex items-center gap-2">
                      {(scannedKit.colors && scannedKit.colors.length > 0 
                        ? scannedKit.colors 
                        : [scannedKit.primary_color || '#1558C9', scannedKit.secondary_color || '#D4FF24']
                      ).slice(0, 5).map((color: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1 bg-bg px-2 py-1 rounded-lg border border-border">
                          <span 
                            className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0" 
                            style={{ backgroundColor: color }} 
                          />
                          <span className="text-[10px] font-mono text-muted">{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tone / Tagline */}
                  {(scannedKit.brand_tone || scannedKit.tagline) && (
                    <div className="text-[11px] text-muted space-y-0.5 bg-bg/50 p-2.5 rounded-lg border border-border/50">
                      {scannedKit.tagline && (
                        <p><strong className="text-text">Tagline:</strong> &ldquo;{scannedKit.tagline}&rdquo;</p>
                      )}
                      {scannedKit.brand_tone && (
                        <p><strong className="text-text">Voice & Tone:</strong> {scannedKit.brand_tone}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={creating || scanning}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-muted hover:text-text bg-surface-secondary border border-border transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateBrand}
                  disabled={creating || scanning || !newUrl.trim()}
                  className="px-5 py-2 rounded-xl bg-accent text-black font-extrabold hover:bg-accent-hover disabled:opacity-50 transition shadow-accent-glow flex items-center gap-1.5 text-xs"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating Brand...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create Brand</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

