'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ApprovalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string | undefined

  useEffect(() => {
    if (id) {
      router.replace(`/approvals?post_id=${id}`)
    } else {
      router.replace('/approvals')
    }
  }, [id, router])

  return (
    <div className="flex items-center justify-center p-20 text-muted text-sm">
      Loading approval review...
    </div>
  )
}
