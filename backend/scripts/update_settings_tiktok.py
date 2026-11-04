with open('frontend/src/app/(dashboard)/settings/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\r\n', '\n')

old_func = "const handleConnectOAuth = async (platform: 'meta' | 'linkedin') => {"
new_func = "const handleConnectOAuth = async (platform: 'meta' | 'linkedin' | 'tiktok') => {"
content = content.replace(old_func, new_func)

tiktok_card = """                  {/* TikTok */}
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
"""

idx = content.find('{/* Automation & Worker Status Banner */}')
if idx == -1:
    print('Failed to find Automation banner')
else:
    div_idx = content.rfind('</div>', 0, idx)
    content = content[:div_idx] + tiktok_card + '\n                ' + content[div_idx:]
    with open('frontend/src/app/(dashboard)/settings/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success!')
