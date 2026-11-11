'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)

  useEffect(() => {
    if (resolvedParams?.id) {
      router.replace(`/approvals?post_id=${resolvedParams.id}`)
    } else {
      router.replace('/approvals')
    }
  }, [resolvedParams, router])

  return (
    <div className="flex items-center justify-center p-20 text-muted text-sm">
      Loading approval review...
    </div>
  )
}
