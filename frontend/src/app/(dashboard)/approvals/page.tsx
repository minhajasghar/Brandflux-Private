'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  Layers,
  MessageSquare,
  Sparkles,
  Send,
  Edit3,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Copy,
  Calendar,
  Share2,
  ArrowLeft,
  UserPlus,
  Users,
  Trash2,
  Shield,
  Key,
  CheckCircle,
  Lock,
  Zap
} from 'lucide-react'
import api, {
  getApprovalsInbox,
  getApprovalPostDetail,
  approvePost,
  editAndApprovePost,
  requestPostChanges,
  rejectPost,
  resubmitPost,
  getApprovalsTeam,
  createApproverAccount,
  removeApproverMember
} from '@/lib/api'
import toast from 'react-hot-toast'

function ApprovalsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialPostId = searchParams.get('post_id')

  const [activeTab, setActiveTab] = useState<'waiting' | 'changes_requested' | 'approved' | 'all'>('waiting')
  const [loading, setLoading] = useState(true)
  const [inboxData, setInboxData] = useState<any>(null)

  // Review Drawer / Modal State
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialPostId)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [postDetail, setPostDetail] = useState<any>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<string>('instagram')

  // Review Action Modals
  const [showRequestChangesModal, setShowRequestChangesModal] = useState(false)
  const [changeComment, setChangeComment] = useState('')
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [submittingAction, setSubmittingAction] = useState(false)

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const [showEditApproveModal, setShowEditApproveModal] = useState(false)
  const [editCaptions, setEditCaptions] = useState<Record<string, string>>({})
  const [editImage, setEditImage] = useState<string>('')
  const [editNotes, setEditNotes] = useState('')

  // Approver Account Creation & Team Modal State (Requirement 3)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [teamData, setTeamData] = useState<any>(null)
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [approverEmail, setApproverEmail] = useState('')
  const [approverName, setApproverName] = useState('')
  const [approverPassword, setApproverPassword] = useState('')
  const [createInstantLogin, setCreateInstantLogin] = useState(true)
  const [submittingApprover, setSubmittingApprover] = useState(false)
  const [createdResult, setCreatedResult] = useState<any>(null)

  const fetchTeam = async () => {
    try {
      setLoadingTeam(true)
      const data = await getApprovalsTeam(inboxData?.brand_id)
      setTeamData(data)
    } catch (err: any) {
      console.error('Failed to load approvers team:', err)
    } finally {
      setLoadingTeam(false)
    }
  }

  const handleOpenTeamModal = () => {
    setShowTeamModal(true)
    setCreatedResult(null)
    fetchTeam()
  }

  const handleCreateApprover = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!approverEmail.trim()) {
      toast.error('Email is required')
      return
    }
    if (createInstantLogin && (!approverPassword || approverPassword.length < 6)) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      setSubmittingApprover(true)
      setCreatedResult(null)
      const res = await createApproverAccount({
        brand_id: inboxData?.brand_id,
        email: approverEmail.trim(),
        full_name: approverName.trim() || undefined,
        password: createInstantLogin ? approverPassword.trim() : undefined
      })
      toast.success(res.message || 'Approver account created successfully!')
      setCreatedResult(res)
      setApproverEmail('')
      setApproverName('')
      setApproverPassword('')
      fetchTeam()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create approver account')
    } finally {
      setSubmittingApprover(false)
    }
  }

  const handleRemoveApprover = async (memberId: string) => {
    try {
      await removeApproverMember(memberId, inboxData?.brand_id)
      toast.success('Approver removed successfully')
      fetchTeam()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to remove approver')
    }
  }

  // Creator Fix & Resubmit Modal
  const [showResubmitModal, setShowResubmitModal] = useState(false)
  const [resubmitCaptions, setResubmitCaptions] = useState<Record<string, string>>({})
  const [resubmitNote, setResubmitNote] = useState('')

  const [showScheduleApprovedModal, setShowScheduleApprovedModal] = useState(false)
  const [scheduleApprovedAt, setScheduleApprovedAt] = useState('')
  const [scheduleApprovedPlatforms, setScheduleApprovedPlatforms] = useState<string[]>([
    'instagram', 'facebook', 'linkedin', 'twitter', 'tiktok'
  ])

  const fetchInbox = async (tab = activeTab, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await getApprovalsInbox(tab)
      setInboxData(data)
    } catch (err: any) {
      if (!silent) {
        console.error('Failed to load approvals:', err)
        toast.error(err.response?.data?.detail || 'Failed to load approvals inbox.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const fetchDetail = async (postId: string, silent = false) => {
    try {
      if (!silent) setLoadingDetail(true)
      const data = await getApprovalPostDetail(postId)
      setPostDetail(data)
      if (!silent) {
        if (data.platform_copies?.length > 0) {
          setSelectedPlatform(data.platform_copies[0].platform)
        }
        // Seed edit form state
        const capMap: Record<string, string> = {}
        data.platform_copies?.forEach((c: any) => {
          capMap[c.platform] = c.caption || ''
        })
        setEditCaptions(capMap)
        setResubmitCaptions(capMap)
        const defaultImg = data.image_variants?.find((img: any) => img.is_selected)?.image_url || data.platform_copies?.[0]?.image_url || ''
        setEditImage(defaultImg)
      }
    } catch (err: any) {
      if (!silent) {
        console.error('Failed to load post detail:', err)
        toast.error(err.response?.data?.detail || 'Failed to load post details.')
        setSelectedPostId(null)
      }
    } finally {
      if (!silent) setLoadingDetail(false)
    }
  }

  useEffect(() => {
    fetchInbox(activeTab)
    const timer = setInterval(() => {
      fetchInbox(activeTab, true)
    }, 5000)
    return () => clearInterval(timer)
  }, [activeTab])

  useEffect(() => {
    if (selectedPostId) {
      fetchDetail(selectedPostId)
      const detailTimer = setInterval(() => {
        fetchDetail(selectedPostId, true)
      }, 5000)
      return () => clearInterval(detailTimer)
    } else {
      setPostDetail(null)
    }
  }, [selectedPostId])

  const handleApprove = async () => {
    if (!selectedPostId) return
    try {
      setSubmittingAction(true)
      const res = await approvePost(selectedPostId)
      if (res.fully_approved) {
        toast.success('Post successfully approved and scheduled!')
      } else {
        toast.success(res.message || 'Approval recorded. Awaiting other approvers.')
      }
      fetchDetail(selectedPostId)
      fetchInbox()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to approve post.')
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostId || !changeComment.trim()) {
      toast.error('Please enter a feedback comment for the creator.')
      return
    }

    try {
      setSubmittingAction(true)
      await requestPostChanges(selectedPostId, changeComment.trim(), selectedChips)
      toast.success('Revisions requested. Creator notified.')
      setShowRequestChangesModal(false)
      setChangeComment('')
      setSelectedChips([])
      fetchDetail(selectedPostId)
      fetchInbox()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to request changes.')
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostId || !rejectReason.trim()) {
      toast.error('Please enter a rejection reason.')
      return
    }

    try {
      setSubmittingAction(true)
      await rejectPost(selectedPostId, rejectReason.trim())
      toast.success('Post has been rejected.')
      setShowRejectModal(false)
      setRejectReason('')
      fetchDetail(selectedPostId)
      fetchInbox()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to reject post.')
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleEditAndApprove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostId) return

    try {
      setSubmittingAction(true)
      await editAndApprovePost(selectedPostId, {
        captions: editCaptions,
        image_url: editImage,
        notes: editNotes
      })
      toast.success('Post revised and approved! Creator notified.')
      setShowEditApproveModal(false)
      fetchDetail(selectedPostId)
      fetchInbox()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to edit and approve.')
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostId) return

    try {
      setSubmittingAction(true)
      await resubmitPost(selectedPostId, {
        captions: resubmitCaptions,
        image_url: editImage,
        note: resubmitNote
      })
      toast.success('Post resubmitted for approval! Approvers notified.')
      setShowResubmitModal(false)
      fetchDetail(selectedPostId)
      fetchInbox()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to resubmit post.')
    } finally {
      setSubmittingAction(false)
    }
  }

  const toggleChip = (chip: string) => {
    if (selectedChips.includes(chip)) {
      setSelectedChips(selectedChips.filter((c) => c !== chip))
    } else {
      setSelectedChips([...selectedChips, chip])
    }
  }

  const currentCopy = postDetail?.platform_copies?.find((c: any) => c.platform === selectedPlatform) || postDetail?.platform_copies?.[0]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-surface border border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-5 w-5 text-accent" />
            <h1 className="text-xl font-extrabold text-text">Content Approvals Inbox</h1>
          </div>
          <p className="text-sm text-muted">
            Review proposed social posts, inspect tailored captions per channel, verify visual graphics, and sign off.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {inboxData?.brand_name && (
            <div className="px-3.5 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-semibold text-text flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent"></span>
              <span>{inboxData.brand_name}</span>
              <span className="text-muted text-[10px] uppercase tracking-wider">({inboxData.user_role})</span>
            </div>
          )}

          {inboxData?.user_role !== 'approver' && (
            <button
              onClick={handleOpenTeamModal}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-black font-extrabold text-xs transition flex items-center gap-2 shadow-sm"
            >
              <UserPlus className="h-4 w-4" />
              <span>Make Approver Account</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Inbox Tabs ─── */}
      <div className="flex items-center gap-2 p-1.5 bg-surface border border-border rounded-2xl overflow-x-auto scrollbar-none">
        {[
          { id: 'waiting', label: 'Waiting Approval', count: inboxData?.counts?.waiting || 0, icon: Clock },
          { id: 'changes_requested', label: 'Changes Requested', count: inboxData?.counts?.changes_requested || 0, icon: AlertTriangle },
          { id: 'approved', label: 'Approved', count: inboxData?.counts?.approved || 0, icon: CheckCircle2 },
          { id: 'all', label: 'All Posts', count: inboxData?.counts?.all || 0, icon: Layers }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-accent text-black shadow-sm font-extrabold'
                  : 'text-muted hover:text-text hover:bg-surface-secondary'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isActive ? 'bg-black/20 text-black' : 'bg-surface-secondary text-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ─── Posts Grid / List ─── */}
      {loading ? (
        <div className="flex items-center justify-center p-20">
          <RefreshCw className="h-6 w-6 animate-spin text-accent" />
          <span className="ml-3 text-muted text-sm">Loading approval queue...</span>
        </div>
      ) : inboxData?.posts?.length === 0 ? (
        <div className="p-16 rounded-2xl bg-surface border border-border text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-muted mx-auto" />
          <h3 className="text-base font-bold text-text">No posts in this queue</h3>
          <p className="text-xs text-muted max-w-md mx-auto">
            {activeTab === 'waiting'
              ? 'All submitted posts have been reviewed! When new drafts are ready, they will appear here.'
              : 'There are currently no items under this filter tab.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inboxData.posts.map((post: any) => {
            const isWaiting = post.status === 'in_review' || post.status === 'pending_approval'
            const isChanges = post.status === 'changes_requested'
            const isApproved = post.status === 'approved'

            return (
              <div
                key={post.id}
                onClick={() => setSelectedPostId(post.id)}
                className="group p-5 rounded-2xl bg-surface border border-border hover:border-accent/40 transition cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Thumbnail / Header */}
                  {post.thumbnail_url ? (
                    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-surface-secondary border border-border/80">
                      <img
                        src={post.thumbnail_url}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-bold text-white uppercase tracking-wider">
                        v{post.version_number}
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video w-full rounded-xl bg-surface-secondary border border-border flex items-center justify-center text-muted">
                      <FileText className="h-8 w-8 text-muted/60" />
                    </div>
                  )}

                  {/* Title & Platforms */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {isWaiting && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400">
                          Waiting Review
                        </span>
                      )}
                      {isChanges && (
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/30 text-[10px] font-bold text-orange-400">
                          Changes Requested
                        </span>
                      )}
                      {isApproved && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>Approved</span>
                        </span>
                      )}

                      {post.scheduled_time && (
                        <span className="px-2 py-0.5 rounded-md bg-surface-secondary text-[10px] text-muted flex items-center gap-1 font-medium">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(post.scheduled_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-text line-clamp-2 group-hover:text-accent transition">
                      {post.title}
                    </h3>
                  </div>

                  {/* Excerpt feedback if changes requested */}
                  {isChanges && post.decision_notes && (
                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300 italic line-clamp-2">
                      &ldquo;{post.decision_notes}&rdquo;
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border/60 mt-4 flex items-center justify-between">
                  <div className="text-xs text-muted">
                    By <span className="text-text font-medium">{post.creator_name}</span>
                  </div>
                  <div className="text-xs font-bold text-accent group-hover:underline flex items-center gap-1">
                    <span>Review Post</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── REVIEW DETAIL MODAL / DRAWER ─── */}
      {selectedPostId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-surface border border-border w-full max-w-4xl max-h-[92vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedPostId(null)}
                  className="p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-hover text-muted hover:text-text transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-text line-clamp-1">{postDetail?.post?.title || 'Review Post'}</h2>
                    {postDetail?.post?.status && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-surface-secondary text-muted">
                        {postDetail.post.status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Submitted by {postDetail?.post?.creator_name || 'Creator'} &bull; Target Time: {postDetail?.post?.scheduled_time ? new Date(postDetail.post.scheduled_time).toLocaleString() : 'Unscheduled'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedPostId(null)}
                className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface-secondary transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            {loadingDetail ? (
              <div className="p-16 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-accent" />
                <span className="ml-3 text-sm text-muted">Loading post details & variants...</span>
              </div>
            ) : postDetail ? (
              <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
                {/* 1. Status & Feedback Banner */}
                {postDetail.post.status === 'changes_requested' && (
                  <div className="p-4 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-200 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-orange-300">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Revision Requested by Approver</span>
                    </div>
                    {postDetail.versions?.[postDetail.versions.length - 1]?.decision_notes && (
                      <p className="text-xs italic bg-black/30 p-2.5 rounded-lg">
                        &ldquo;{postDetail.versions[postDetail.versions.length - 1].decision_notes}&rdquo;
                      </p>
                    )}
                    {postDetail.versions?.[postDetail.versions.length - 1]?.changes_requested_chips?.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[11px] text-orange-300 font-semibold">Focus Areas:</span>
                        {postDetail.versions[postDetail.versions.length - 1].changes_requested_chips.map((chip: string) => (
                          <span key={chip} className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[10px] font-bold">
                            {chip}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Visual Variants & Platform Previews Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Visual Artwork & Variants */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted">
                        Visual Artwork ({postDetail.image_variants?.length || 1} Variants)
                      </label>
                      <span className="text-[10px] text-muted">Click thumbnail to select</span>
                    </div>

                    <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black border border-border shadow-lg">
                      <img
                        src={editImage || currentCopy?.image_url || postDetail.image_variants?.[0]?.image_url}
                        alt="Post Visual"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Variant thumbnails picker */}
                    {postDetail.image_variants?.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {postDetail.image_variants.map((v: any, idx: number) => {
                          const isSelected = editImage === v.image_url
                          return (
                            <button
                              key={v.id || idx}
                              onClick={() => setEditImage(v.image_url)}
                              className={`relative aspect-square w-16 rounded-xl overflow-hidden border-2 transition shrink-0 ${
                                isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border opacity-70 hover:opacity-100'
                              }`}
                            >
                              <img src={v.image_url} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                              <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[8px] font-bold text-white">
                                #{idx + 1}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Platform Copies Preview */}
                  <div className="space-y-4 flex flex-col justify-between">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-muted mb-2 block">
                        Platform-Tailored Copy
                      </label>

                      {/* Platform Tabs */}
                      <div className="flex items-center gap-1.5 p-1 bg-surface-secondary border border-border rounded-xl overflow-x-auto scrollbar-none mb-3">
                        {postDetail.platform_copies?.map((c: any) => {
                          const isSelected = selectedPlatform === c.platform
                          return (
                            <button
                              key={c.platform}
                              onClick={() => setSelectedPlatform(c.platform)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition whitespace-nowrap ${
                                isSelected
                                  ? 'bg-accent text-black font-extrabold shadow-sm'
                                  : 'text-muted hover:text-text'
                              }`}
                            >
                              {c.platform}
                            </button>
                          )
                        })}
                      </div>

                      {/* Formatted Copy Preview */}
                      <div className="p-4 rounded-xl bg-surface-secondary/70 border border-border space-y-3 min-h-[220px]">
                        <div className="flex items-center justify-between text-xs text-muted border-b border-border/60 pb-2">
                          <span className="capitalize font-semibold text-text">{selectedPlatform} Caption</span>
                          <button
                            onClick={() => {
                              const text = `${currentCopy?.caption || ''}\n\n${(currentCopy?.hashtags || []).join(' ')}`
                              navigator.clipboard.writeText(text)
                              toast.success('Caption copied to clipboard')
                            }}
                            className="flex items-center gap-1 text-[11px] text-muted hover:text-accent transition"
                          >
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </button>
                        </div>

                        <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                          {currentCopy?.caption || 'No caption generated for this channel.'}
                        </p>

                        {currentCopy?.hashtags && currentCopy.hashtags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-2">
                            {currentCopy.hashtags.map((tag: string) => (
                              <span key={tag} className="text-xs text-accent/90 font-medium">
                                {tag.startsWith('#') ? tag : `#${tag}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Version Details */}
                    <div className="p-3 rounded-xl bg-surface-secondary/40 border border-border text-xs text-muted flex items-center justify-between">
                      <div>
                        Snapshot Hash: <code className="text-text font-mono text-[10px]">{postDetail.post.approved_version_hash?.slice(0, 16) || 'Pending Sign-off'}</code>
                      </div>
                      <div>
                        Total Versions: <strong className="text-text">{postDetail.versions?.length || 1}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Version Diff Section (if multiple versions) */}
                {postDetail.diff?.has_diff && (
                  <div className="p-4 rounded-xl bg-surface-secondary/50 border border-border space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-text uppercase tracking-wider">
                      <Layers className="h-4 w-4 text-accent" />
                      <span>Version Diff (Changes in Current Snapshot)</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {postDetail.diff.image && (
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300">
                          &bull; Visual artwork was swapped to a different variant.
                        </div>
                      )}
                      {postDetail.diff.time && (
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300">
                          &bull; Scheduled publishing date/time was adjusted.
                        </div>
                      )}
                      {Object.keys(postDetail.diff.captions || {}).map((plat) => (
                        <div key={plat} className="p-2.5 rounded-lg bg-surface border border-border space-y-1">
                          <span className="font-bold capitalize text-accent">{plat} Caption Changed:</span>
                          <div className="text-red-400/80 line-through text-[11px]">{postDetail.diff.captions[plat].previous}</div>
                          <div className="text-emerald-400 text-[11px]">{postDetail.diff.captions[plat].current}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Modal Action Bar (Fixed at bottom) */}
            <div className="p-4 sm:p-6 border-t border-border bg-surface shrink-0 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-muted">
                Mode: <strong className="text-text capitalize">{postDetail?.brand?.approval_mode || 'Anyone'}</strong>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Approver Actions */}
                {postDetail?.permissions?.can_approve && (
                  <>
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => setShowRejectModal(true)}
                      className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs transition border border-red-500/20"
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => setShowRequestChangesModal(true)}
                      className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-xs transition border border-amber-500/30 flex items-center gap-1.5"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Request Changes</span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => setShowEditApproveModal(true)}
                      className="px-4 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 font-bold text-xs transition border border-blue-500/30 flex items-center gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit & Approve</span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={handleApprove}
                      className="px-5 py-2 rounded-xl bg-accent text-black font-extrabold text-xs hover:bg-accent/90 transition shadow-sm flex items-center gap-1.5"
                    >
                      <Check className="h-4 w-4" />
                      <span>Approve Post</span>
                    </button>
                  </>
                )}

                {/* Creator Action: Fix & Resubmit */}
                {postDetail?.permissions?.can_resubmit && (
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => setShowResubmitModal(true)}
                    className="px-5 py-2 rounded-xl bg-accent text-black font-extrabold text-xs hover:bg-accent/90 transition shadow-sm flex items-center gap-1.5"
                  >
                    <Send className="h-4 w-4" />
                    <span>Fix & Resubmit</span>
                  </button>
                )}

                {/* Publish Live & Schedule Buttons (Approved Post) */}
                {(postDetail?.permissions?.can_publish || postDetail?.post?.status === 'approved') && (
                  <>
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => {
                        const tomorrow = new Date()
                        tomorrow.setDate(tomorrow.getDate() + 1)
                        tomorrow.setHours(10, 0, 0, 0)
                        const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 16)
                        setScheduleApprovedAt(localIso)
                        setShowScheduleApprovedModal(true)
                      }}
                      className="px-4 py-2 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-xs transition flex items-center gap-1.5"
                    >
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>Schedule</span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={async () => {
                        if (!selectedPostId) return
                        setSubmittingAction(true)
                        try {
                          const res = await api.post(`/approvals/${selectedPostId}/publish-now`)
                          const pubPlats = res.data?.published_platforms || []
                          const discMsgs: string[] = res.data?.disconnected_messages || []
                          const discPlats = res.data?.skipped_disconnected || []
                          if (pubPlats.length > 0) {
                            toast.success(`Published live to ${pubPlats.join(', ')}! 🎉`)
                          }
                          if (discMsgs.length > 0) {
                            discMsgs.forEach((m: string) => toast.error(m, { duration: 6000 }))
                          } else if (discPlats.length > 0) {
                            toast.error(`Your ${discPlats.join(', ')} account is not connected. Please connect it before publishing.`, { duration: 6000 })
                          }
                          await fetchInbox()
                          if (selectedPostId) fetchDetail(selectedPostId)
                        } catch (err: any) {
                          toast.error(err.response?.data?.detail?.message || err.response?.data?.detail || 'Publishing failed.')
                        } finally {
                          setSubmittingAction(false)
                        }
                      }}
                      className="px-5 py-2 rounded-xl bg-accent text-black font-extrabold text-xs hover:bg-accent-hover transition shadow-accent-glow flex items-center gap-1.5"
                    >
                      <Zap className="h-4 w-4" />
                      <span>Post Now</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SCHEDULE APPROVED POST MODAL ─── */}
      {showScheduleApprovedModal && selectedPostId && (
        <div
          onClick={() => setShowScheduleApprovedModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface max-w-md w-full rounded-3xl border border-border p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-extrabold text-text">Schedule Approved Content</h3>
                <p className="text-[11px] text-muted">Automatically reuses approved image, captions, and hashtags.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleApprovedModal(false)}
                className="p-1.5 rounded-xl hover:bg-surface-secondary text-muted hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted uppercase">Platforms</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleApprovedPlatforms(['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok'])}
                    className="text-[11px] font-bold text-accent hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-muted text-[10px]">|</span>
                  <button
                    type="button"
                    onClick={() => setScheduleApprovedPlatforms([])}
                    className="text-[11px] font-bold text-muted hover:text-text hover:underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'instagram', label: 'Instagram' },
                  { id: 'facebook', label: 'Facebook' },
                  { id: 'linkedin', label: 'LinkedIn' },
                  { id: 'twitter', label: 'Twitter / X' },
                  { id: 'tiktok', label: 'TikTok' },
                ].map(p => {
                  const checked = scheduleApprovedPlatforms.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                        checked ? 'bg-primary/15 border-primary text-text' : 'bg-surface-secondary border-border text-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setScheduleApprovedPlatforms(prev =>
                            prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                          )
                        }
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span>{p.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase block">Publish Date &amp; Time</label>
              <input
                type="datetime-local"
                value={scheduleApprovedAt}
                onChange={(e) => setScheduleApprovedAt(e.target.value)}
                className="w-full bg-surface-secondary border border-border rounded-xl px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowScheduleApprovedModal(false)}
                className="px-4 py-2 rounded-xl bg-surface-secondary text-muted hover:text-text text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={async () => {
                  if (!scheduleApprovedAt) {
                    toast.error('Please select a date and time.')
                    return
                  }
                  if (scheduleApprovedPlatforms.length === 0) {
                    toast.error('Please select at least one platform.')
                    return
                  }
                  setSubmittingAction(true)
                  try {
                    const copiesMap: Record<string, any> = {}
                    postDetail?.platform_copies?.forEach((c: any) => {
                      copiesMap[c.platform] = { caption: c.caption, hashtags: c.hashtags || [] }
                    })
                    const defaultImg = postDetail?.image_variants?.find((img: any) => img.is_selected)?.image_url || postDetail?.platform_copies?.[0]?.image_url || null
                    const defaultCaption = postDetail?.platform_copies?.[0]?.caption || ''
                    const res = await api.post('/calendar/posts/batch', {
                      platforms: scheduleApprovedPlatforms,
                      caption: defaultCaption,
                      media_url: defaultImg,
                      scheduled_at: new Date(scheduleApprovedAt).toISOString(),
                      status: 'Scheduled',
                      post_id: selectedPostId,
                      platform_copies: copiesMap
                    })
                    const count = res.data?.count || 0
                    const discMsgs: string[] = res.data?.disconnected_messages || []
                    if (count > 0) {
                      toast.success(`Approved post scheduled across ${count} platform(s)!`)
                    }
                    if (discMsgs.length > 0) {
                      discMsgs.forEach(m => toast.error(m, { duration: 6000 }))
                    }
                    setShowScheduleApprovedModal(false)
                    await fetchInbox(activeTab, true)
                  } catch (err: any) {
                    toast.error(err.response?.data?.detail || 'Failed to schedule approved post.')
                  } finally {
                    setSubmittingAction(false)
                  }
                }}
                className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-black font-extrabold text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{submittingAction ? 'Scheduling...' : 'Confirm Schedule'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── REQUEST CHANGES MODAL ─── */}
      {showRequestChangesModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border w-full max-w-lg rounded-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Request Changes from Creator</span>
              </h3>
              <button onClick={() => setShowRequestChangesModal(false)} className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Select focus chips and provide actionable feedback. The creator will receive an immediate in-app and email notification to revise and resubmit.
            </p>

            {/* Quick Chips */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">Quick Focus Chips</label>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { id: 'image', label: '🖼️ Image' },
                  { id: 'caption', label: '📝 Caption' },
                  { id: 'time', label: '⏰ Time' },
                  { id: 'hashtags', label: '#️⃣ Hashtags' }
                ].map((chip) => {
                  const isSel = selectedChips.includes(chip.id)
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => toggleChip(chip.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                        isSel
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-surface-secondary text-muted border-border hover:bg-surface-hover'
                      }`}
                    >
                      {chip.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Required Comment */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">Feedback Comment (Required)</label>
              <textarea
                value={changeComment}
                onChange={(e) => setChangeComment(e.target.value)}
                placeholder="e.g. Please sharpen the hook in line 1 and switch to the darker image variant with higher contrast."
                rows={4}
                required
                className="w-full p-3 rounded-xl bg-surface-secondary border border-border text-text placeholder-muted text-sm focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestChangesModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestChanges}
                disabled={submittingAction || !changeComment.trim()}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs transition disabled:opacity-50"
              >
                {submittingAction ? 'Submitting...' : 'Send Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── REJECT MODAL ─── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border w-full max-w-lg rounded-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-400" />
                <span>Reject Post</span>
              </h3>
              <button onClick={() => setShowRejectModal(false)} className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Rejecting will archive this post and cancel any scheduled publishing. Please provide a clear reason for the creator.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">Reason for Rejection (Required)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Campaign canceled due to product delay."
                rows={4}
                required
                className="w-full p-3 rounded-xl bg-surface-secondary border border-border text-text placeholder-muted text-sm focus:outline-none focus:border-red-400 transition"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={submittingAction || !rejectReason.trim()}
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs transition disabled:opacity-50"
              >
                {submittingAction ? 'Rejecting...' : 'Reject Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT & APPROVE MODAL ─── */}
      {showEditApproveModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-border w-full max-w-2xl max-h-[90vh] rounded-2xl p-6 space-y-4 my-auto overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-400" />
                <span>Edit & Approve (Minor Tweaks)</span>
              </h3>
              <button onClick={() => setShowEditApproveModal(false)} className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              You can tweak captions or pick an alternate image variant. This saves a new snapshot version and immediately approves it for scheduling. The creator is notified of the edits.
            </p>

            {/* Captions per platform */}
            <div className="space-y-3">
              {postDetail?.platform_copies?.map((c: any) => (
                <div key={c.platform} className="space-y-1">
                  <label className="text-xs font-bold text-text capitalize">{c.platform} Caption</label>
                  <textarea
                    value={editCaptions[c.platform] || ''}
                    onChange={(e) => setEditCaptions({ ...editCaptions, [c.platform]: e.target.value })}
                    rows={3}
                    className="w-full p-2.5 rounded-xl bg-surface-secondary border border-border text-text text-xs focus:outline-none focus:border-blue-400"
                  />
                </div>
              ))}
            </div>

            {/* Note to Creator */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted">Summary Note of Edits (Optional)</label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="e.g. Fixed typo in paragraph 2 and tightened hashtags."
                className="w-full px-3 py-2 rounded-xl bg-surface-secondary border border-border text-text text-xs focus:outline-none focus:border-blue-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditApproveModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditAndApprove}
                disabled={submittingAction}
                className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs transition disabled:opacity-50"
              >
                {submittingAction ? 'Saving & Approving...' : 'Save Edits & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

            {/* ─── MAKE APPROVER ACCOUNT & TEAM MODAL (Instruction 3) ─── */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text">Make Approver Account</h3>
                  <p className="text-xs text-muted">Create an account or invite a reviewer to approve social posts</p>
                </div>
              </div>
              <button
                onClick={() => setShowTeamModal(false)}
                className="p-1.5 text-muted hover:text-text rounded-lg hover:bg-surface-secondary transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Created Account Result Notification Card */}
            {createdResult && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-200">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span>Approver Account Ready!</span>
                </div>
                <p className="text-emerald-100">{createdResult.message}</p>
                {createdResult.invite_url && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={createdResult.invite_url}
                      className="flex-1 bg-black/40 border border-emerald-500/30 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdResult.invite_url)
                        toast.success('Invite URL copied!')
                      }}
                      className="px-3 py-1.5 bg-emerald-500 text-black font-bold text-xs rounded-lg hover:bg-emerald-400 transition"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Create Approver Form */}
            <form onSubmit={handleCreateApprover} className="space-y-4 p-4 rounded-xl bg-surface-secondary border border-border">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-accent" />
                <span>New Approver Credentials</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted">Approver Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="client@company.com"
                    value={approverEmail}
                    onChange={(e) => setApproverEmail(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted">Full Name / Title (Optional)</label>
                  <input
                    type="text"
                    placeholder="Sarah Miller (Marketing Lead)"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Mode Toggle: Instant Login Account vs Email Invite */}
              <div className="pt-1">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-text">
                    <input
                      type="radio"
                      name="creation_mode"
                      checked={createInstantLogin}
                      onChange={() => setCreateInstantLogin(true)}
                      className="accent-[#D4FF24]"
                    />
                    <span>Create with Direct Password (Instant Login)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-muted">
                    <input
                      type="radio"
                      name="creation_mode"
                      checked={!createInstantLogin}
                      onChange={() => setCreateInstantLogin(false)}
                      className="accent-[#D4FF24]"
                    />
                    <span>Send Email Invitation Link</span>
                  </label>
                </div>

                {createInstantLogin && (
                  <div className="mt-3 space-y-1 max-w-sm">
                    <label className="text-xs font-bold text-muted">Set Initial Password * (min 6 chars)</label>
                    <input
                      type="text"
                      required={createInstantLogin}
                      placeholder="e.g. Client2026!Approve"
                      value={approverPassword}
                      onChange={(e) => setApproverPassword(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent font-mono"
                    />
                    <p className="text-[10px] text-muted">
                      Directly set up their password so they can log in right away without checking an inbox.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingApprover}
                  className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-black font-extrabold text-xs transition disabled:opacity-50 flex items-center gap-2"
                >
                  {submittingApprover ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  <span>{createInstantLogin ? 'Create Approver Account' : 'Send Invite Link'}</span>
                </button>
              </div>
            </form>

            {/* Existing Approvers List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-accent" />
                  <span>Existing Approvers ({teamData?.members?.length || 0})</span>
                </h4>
                {teamData && (
                  <span className="text-[11px] text-muted">
                    Limit: {teamData.active_approvers_count} / {teamData.plan_limit > 900 ? 'Unlimited' : teamData.plan_limit}
                  </span>
                )}
              </div>

              {loadingTeam ? (
                <div className="p-6 text-center text-xs text-muted">Loading approvers...</div>
              ) : teamData?.members?.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-surface-secondary/40 border border-dashed border-border text-xs text-muted">
                  No approver accounts added yet. Use the form above to add an approver for this brand.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-surface">
                  {teamData?.members?.map((m: any) => (
                    <div key={m.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent/15 text-accent font-bold flex items-center justify-center text-xs">
                          {m.name ? m.name.charAt(0).toUpperCase() : 'A'}
                        </div>
                        <div>
                          <p className="font-bold text-text">{m.name || m.email}</p>
                          <p className="text-[11px] text-muted">{m.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          m.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}>
                          {m.status}
                        </span>

                        {m.role !== 'creator' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveApprover(m.id)}
                            className="p-1.5 text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition"
                            title="Remove approver"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

{/* ─── CREATOR FIX & RESUBMIT MODAL ─── */}
      {showResubmitModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-border w-full max-w-2xl max-h-[90vh] rounded-2xl p-6 space-y-4 my-auto overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <Send className="h-4 w-4 text-accent" />
                <span>Fix & Resubmit for Approval</span>
              </h3>
              <button onClick={() => setShowResubmitModal(false)} className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Update your copy based on the approver&apos;s feedback. This will create a new version snapshot and alert approvers for sign-off.
            </p>

            {/* Approver Feedback Box */}
            {postDetail?.versions?.[postDetail.versions.length - 1]?.decision_notes && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Approver&apos;s Revision Instructions:</span>
                </div>
                <p className="italic bg-black/30 p-2.5 rounded-lg">&ldquo;{postDetail.versions[postDetail.versions.length - 1].decision_notes}&rdquo;</p>
              </div>
            )}

            <div className="space-y-3">
              {postDetail?.platform_copies?.map((c: any) => (
                <div key={c.platform} className="space-y-1">
                  <label className="text-xs font-bold text-text capitalize">{c.platform} Caption</label>
                  <textarea
                    value={resubmitCaptions[c.platform] || ''}
                    onChange={(e) => setResubmitCaptions({ ...resubmitCaptions, [c.platform]: e.target.value })}
                    rows={3}
                    className="w-full p-2.5 rounded-xl bg-surface-secondary border border-border text-text text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted">Revision Note to Approver</label>
              <input
                type="text"
                value={resubmitNote}
                onChange={(e) => setResubmitNote(e.target.value)}
                placeholder="e.g. Revised headline, added requested CTA."
                className="w-full px-3 py-2 rounded-xl bg-surface-secondary border border-border text-text text-xs focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResubmitModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResubmit}
                disabled={submittingAction}
                className="px-5 py-2 rounded-xl bg-accent hover:bg-accent/90 text-black font-bold text-xs transition disabled:opacity-50"
              >
                {submittingAction ? 'Resubmitting...' : 'Resubmit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">Loading approvals...</div>}>
      <ApprovalsContent />
    </Suspense>
  )
}
