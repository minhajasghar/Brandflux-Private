with open('frontend/src/app/(dashboard)/settings/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add updateUserProfile to import
if 'updateUserProfile' not in content:
    content = content.replace(
        '  rejectSinglePost\n} from \'@/lib/api\'',
        '  rejectSinglePost,\n  updateUserProfile\n} from \'@/lib/api\''
    )

# 2. Add updatingProfile state
state_marker = '  const [uploadingLogo, setUploadingLogo] = useState<\'primary\' | \'alt\' | null>(null)'
if 'const [updatingProfile, setUpdatingProfile]' not in content and state_marker in content:
    content = content.replace(
        state_marker,
        state_marker + '\n  const [updatingProfile, setUpdatingProfile] = useState(false)'
    )

# 3. Add handleUpdateProfile function
func_marker = '  const handleConnectOAuth = async (platform:'
handle_profile_code = """  const handleUpdateProfile = async () => {
    if (!userProfile.email) {
      toast.error('Email address is required')
      return
    }
    try {
      setUpdatingProfile(true)
      const res = await updateUserProfile({
        full_name: userProfile.full_name,
        email: userProfile.email
      })
      toast.success(res?.message || 'Profile updated successfully')
      if (res?.user) {
        setUserProfile(prev => ({
          ...prev,
          full_name: res.user.full_name,
          email: res.user.email
        }))
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally {
      setUpdatingProfile(false)
    }
  }

"""
if 'handleUpdateProfile' not in content and func_marker in content:
    content = content.replace(func_marker, handle_profile_code + func_marker)

# 4. Make SocialAccountItem platform flexible
old_soc_type = "platform: 'instagram' | 'facebook' | 'linkedin'"
new_soc_type = "platform: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'twitter' | string"
content = content.replace(old_soc_type, new_soc_type)

# 5. Make handleConnectOAuth platform flexible
old_oauth_type = "const handleConnectOAuth = async (platform: 'meta' | 'linkedin') => {"
new_oauth_type = "const handleConnectOAuth = async (platform: string) => {"
content = content.replace(old_oauth_type, new_oauth_type)

# 6. Make Email Address editable and add Save Profile button
old_profile_card = """                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase">Email Address</label>
                    <input
                      type="email"
                      disabled
                      value={userProfile.email}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary/50 border border-border text-sm font-semibold text-muted cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>"""

new_profile_card = """                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase">Email Address (Login)</label>
                    <input
                      type="email"
                      value={userProfile.email}
                      onChange={(e) => setUserProfile(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleUpdateProfile}
                    disabled={updatingProfile}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white shadow-glow rounded-xl text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{updatingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </div>"""

content = content.replace(old_profile_card, new_profile_card)

# 7. Add TikTok and Twitter/X cards in Connected Accounts tab
new_channels = """
                  {/* TikTok */}
                  {(() => {
                    const ttAccounts = socialAccounts.filter(a => a.platform === 'tiktok')
                    const isConnected = ttAccounts.length > 0
                    const hasExpiring = ttAccounts.some(a => a.needs_reconnect || (a.days_until_expiry !== undefined && a.days_until_expiry <= 7))

                    return (
                      <div className="p-5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">🎵</span>
                              <div>
                                <h4 className="text-sm font-bold text-text">TikTok</h4>
                                <p className="text-[11px] text-muted">TikTok Content Posting API (Direct Video &amp; Photos)</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isConnected 
                                ? 'bg-success/15 border border-success/40 text-success' 
                                : 'bg-surface border border-border text-muted'
                            }`}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {isConnected ? (
                            <div className="space-y-2 pt-1">
                              {ttAccounts.map(acc => (
                                <div key={acc.id} className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs">🎵</span>
                                      <p className="text-xs font-bold text-text truncate">
                                        {acc.account_name || '@tiktok_user'}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                      {acc.days_until_expiry !== undefined ? `Expires in ${acc.days_until_expiry}d` : 'Active OAuth Token'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDisconnectAccount(acc.id, acc.account_name || 'TikTok')}
                                    className="text-[11px] font-bold text-muted hover:text-danger px-2 py-1 rounded transition"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}

                              {hasExpiring && (
                                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>Token expiring soon. Reconnect to keep publishing active.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">
                              Publish branded photo carousels and short-form videos directly to your authorized TikTok creator profile.
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <button
                            onClick={() => handleConnectOAuth('tiktok')}
                            disabled={connectingPlatform === 'tiktok'}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              isConnected
                                ? 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                                : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>{connectingPlatform === 'tiktok' ? 'Connecting...' : (isConnected ? 'Reconnect TikTok' : 'Connect TikTok')}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* X / Twitter */}
                  {(() => {
                    const twAccounts = socialAccounts.filter(a => a.platform === 'twitter' || a.platform === 'x')
                    const isConnected = twAccounts.length > 0
                    const hasExpiring = twAccounts.some(a => a.needs_reconnect || (a.days_until_expiry !== undefined && a.days_until_expiry <= 7))

                    return (
                      <div className="p-5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">𝕏</span>
                              <div>
                                <h4 className="text-sm font-bold text-text">X (Twitter)</h4>
                                <p className="text-[11px] text-muted">X API v2 (Tweets, Threads &amp; Media)</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isConnected 
                                ? 'bg-success/15 border border-success/40 text-success' 
                                : 'bg-surface border border-border text-muted'
                            }`}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {isConnected ? (
                            <div className="space-y-2 pt-1">
                              {twAccounts.map(acc => (
                                <div key={acc.id} className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs">𝕏</span>
                                      <p className="text-xs font-bold text-text truncate">
                                        {acc.account_name || '@x_user'}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                      {acc.days_until_expiry !== undefined ? `Expires in ${acc.days_until_expiry}d` : 'Active OAuth 2.0 Token'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDisconnectAccount(acc.id, acc.account_name || 'X')}
                                    className="text-[11px] font-bold text-muted hover:text-danger px-2 py-1 rounded transition"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}

                              {hasExpiring && (
                                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>Token expiring soon. Reconnect to keep publishing active.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">
                              Publish branded tweets, image attachments, and short-form announcements directly to your X profile.
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <button
                            onClick={() => handleConnectOAuth('twitter')}
                            disabled={connectingPlatform === 'twitter'}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              isConnected
                                ? 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                                : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>{connectingPlatform === 'twitter' ? 'Connecting...' : (isConnected ? 'Reconnect X' : 'Connect X')}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}
"""

grid_end_marker = """                    )
                  })()}
                </div>"""

# Ensure we replace only the one right before Automation & Worker Status Banner
target_pos = content.find('{/* Automation & Worker Status Banner */}')
if target_pos != -1:
    last_grid_end = content.rfind('                </div>', 0, target_pos)
    if last_grid_end != -1:
        content = content[:last_grid_end] + new_channels + content[last_grid_end:]

with open('frontend/src/app/(dashboard)/settings/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Successfully applied all settings upgrades!')

