'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Flame } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'

export default function StreakWidget() {
  const [streakData, setStreakData] = useState<{ streak_count: number; history: boolean[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStreak = async () => {
      try {
        const res = await api.get('/sessions/streak')
        if (res.data) {
          setStreakData(res.data)
        }
      } catch (err) {
        console.error('Failed to fetch streak data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStreak()
  }, [])

  if (loading) {
    return (
      <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl space-y-4">
        <Skeleton width="60%" height="24px" rounded="md" />
        <Skeleton width="100%" height="32px" rounded="md" />
      </div>
    )
  }

  const streak = streakData?.streak_count || 0
  const history = streakData?.history || [false, false, false, false, false, false, false]

  // Day labels helper starting 6 days ago up to today
  const getDayLabels = () => {
    const labels = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      labels.push(d.toLocaleDateString('en-US', { weekday: 'narrow' }))
    }
    return labels
  }

  const days = getDayLabels()

  return (
    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl relative overflow-hidden backdrop-blur-md flex flex-col justify-between h-full">
      <div className="absolute top-0 right-0 h-24 w-24 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
          <Flame className={`h-5.5 w-5.5 ${streak > 0 ? 'animate-pulse' : ''}`} />
        </div>
        <div>
          <p className="text-2xl font-black text-white tracking-tight">{streak} Day Streak!</p>
          <p className="text-xs font-bold text-gray-400">Keep generating daily content to grow</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3 pl-1">Last 7 Days Activity</p>
        <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 rounded-2xl p-4">
          {history.map((active, idx) => (
            <div key={idx} className="flex flex-col items-center gap-2">
              <div 
                className={`h-3 w-3 rounded-full transition-all duration-300 ${
                  active 
                    ? 'bg-gradient-to-r from-emerald-400 to-green-500 ring-4 ring-emerald-500/20 scale-110 shadow-lg shadow-emerald-500/20' 
                    : 'bg-white/10'
                }`}
              />
              <span className={`text-[10px] font-black uppercase ${active ? 'text-emerald-400' : 'text-gray-500'}`}>
                {days[idx]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
