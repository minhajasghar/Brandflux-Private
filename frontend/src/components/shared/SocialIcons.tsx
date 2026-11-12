import React from 'react'

export function FacebookIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1877F2" />
      <path
        d="M15.1 13.2l.5-3.3h-3.1V7.8c0-.9.4-1.7 1.8-1.7H15.7V3.3s-1.3-.2-2.5-.2c-2.5 0-4.2 1.5-4.2 4.3v2.5H6.2v3.3H9v8.2a12.5 12.5 0 003.5 0v-8.2h2.6z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function InstagramIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="igIconGradShared" cx="20%" cy="115%" r="140%">
          <stop offset="0%" stopColor="#FFDC80" />
          <stop offset="10%" stopColor="#FCAF45" />
          <stop offset="30%" stopColor="#F77737" />
          <stop offset="50%" stopColor="#F56040" />
          <stop offset="70%" stopColor="#FD1D1D" />
          <stop offset="85%" stopColor="#E1306C" />
          <stop offset="95%" stopColor="#C13584" />
          <stop offset="100%" stopColor="#833AB4" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#igIconGradShared)" />
      <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" stroke="#FFFFFF" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="3.6" stroke="#FFFFFF" strokeWidth="1.8" fill="none" />
      <circle cx="16.5" cy="7.5" r="1.1" fill="#FFFFFF" />
    </svg>
  )
}

export function LinkedInIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#0A66C2" />
      <path
        d="M7.1 6.1a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM3.8 9.5h3.1V20H3.8V9.5zm5.1 0H12v1.4h.1c.4-.8 1.5-1.6 3-1.6 3.2 0 3.8 2.1 3.8 4.9V20h-3.1v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V20H8.9V9.5z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function TikTokIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#000000" />
      <path
        d="M16.5 8.3a4.5 4.5 0 01-2.9-1.6v6.9a4.8 4.8 0 11-4.8-4.8c.4 0 .8 0 1.2.1v2.5a2.4 2.4 0 101.4 2.2V3.5h2.5a4.5 4.5 0 004.1 3.9v2.4a6.7 6.7 0 01-1.5-.1v-1.4z"
        fill="#25F4EE"
        transform="translate(-0.5, -0.5)"
      />
      <path
        d="M16.5 8.3a4.5 4.5 0 01-2.9-1.6v6.9a4.8 4.8 0 11-4.8-4.8c.4 0 .8 0 1.2.1v2.5a2.4 2.4 0 101.4 2.2V3.5h2.5a4.5 4.5 0 004.1 3.9v2.4a6.7 6.7 0 01-1.5-.1v-1.4z"
        fill="#FE2C55"
        transform="translate(0.5, 0.5)"
      />
      <path
        d="M16.5 8.3a4.5 4.5 0 01-2.9-1.6v6.9a4.8 4.8 0 11-4.8-4.8c.4 0 .8 0 1.2.1v2.5a2.4 2.4 0 101.4 2.2V3.5h2.5a4.5 4.5 0 004.1 3.9v2.4a6.7 6.7 0 01-1.5-.1v-1.4z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function XTwitterIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#000000" />
      <path
        d="M17.3 4h2.4l-5.3 6.1 6.3 8.3h-4.9l-3.8-5-4.4 5H5.1l5.7-6.5L4.8 4h5l3.5 4.6L17.3 4zm-.9 13h1.3L8.6 5.3H7.2L16.4 17z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function SocialIcon({ platform, className = 'h-5 w-5' }: { platform: string; className?: string }) {
  const p = (platform || '').toLowerCase()
  if (p.includes('facebook') || p === 'fb') return <FacebookIcon className={className} />
  if (p.includes('instagram') || p === 'ig') return <InstagramIcon className={className} />
  if (p.includes('linkedin') || p === 'li') return <LinkedInIcon className={className} />
  if (p.includes('tiktok') || p === 'tt') return <TikTokIcon className={className} />
  if (p.includes('twitter') || p.includes('x')) return <XTwitterIcon className={className} />
  return <div className={`rounded-md bg-white/10 ${className}`} />
}

