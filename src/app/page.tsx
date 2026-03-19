'use client'
import { useEffect, useRef, useCallback } from 'react'

// ── Mock data (replace with real Supabase calls) ──────────────────────────────
const MOCK_FLIPS = [
  { user: 'SupremzRBX', color: '#ff4d8d', group: 'Shadow Army HQ', members: '4,821', status: 'open' },
  { user: 'VaultKing',  color: '#00d4ff', group: 'The Void Guild',  members: '2,103', status: 'pending' },
  { user: 'xShadowFlip',color: '#7c5cfc', group: 'Neon District',   members: '977',   status: 'open' },
  { user: 'FlipMaster99',color:'#ff9f43', group: 'Elite Forces',    members: '3,400', status: 'pending' },
]
const MOCK_CHAT = [
  { user:'SupremzRBX', rank:'god',   color:'#ff4d8d', msg:'just won a 5k member group lmaooo',                        time:'2:41 PM' },
  { user:'VaultKing',  rank:'whale', color:'#00d4ff', msg:'who wants to flip? got a fresh group to put up',           time:'2:41 PM' },
  { user:'xShadowFlip',rank:'',      color:'#7c5cfc', msg:'@VaultKing how many members',                              time:'2:42 PM' },
  { user:'StaffBot',   rank:'staff', color:'#00d4ff', msg:'Reminder: ownership must be 30+ days before wagering.',    time:'2:42 PM' },
  { user:'RoGroupLord',rank:'',      color:'#2ecc71', msg:'roulette just hit green and I was not on it 💀',            time:'2:43 PM' },
  { user:'OmegaClaim', rank:'god',   color:'#ff4d8d', msg:'I\'m up 8 groups this week alone, this site is different', time:'2:43 PM' },
  { user:'NeonWager',  rank:'whale', color:'#00d4ff', msg:'rolimons usually has a 10 min delay but manual is instant',time:'2:44 PM' },
]
const MOCK_ONLINE = [
  {name:'Nihal_R',rank:'owner'},{name:'SupremzRBX',rank:'god'},{name:'VaultKing',rank:'whale'},
  {name:'StaffBot',rank:'staff'},{name:'xShadowFlip',rank:''},{name:'RoGroupLord',rank:''},
  {name:'NeonWager',rank:'whale'},{name:'FlipMaster99',rank:''},{name:'GroupGoblin',rank:''},
]
const MOCK_LB = [
  {name:'SupremzRBX',wins:312,groups:87},{name:'OmegaClaim',wins:298,groups:76},
  {name:'VaultKing', wins:201,groups:55},{name:'Nihal_R',   wins:127,groups:34},
  {name:'NeonWager', wins:98, groups:29},{name:'FlipMaster99',wins:74,groups:21},
  {name:'xShadowFlip',wins:61,groups:18},{name:'RoGroupLord',wins:55,groups:16},
]
const MOCK_PENDING = [
  {user:'NewUser123',  group:'Solar Empire',      method:'Audit screenshot',     submitted:'10 min ago'},
  {user:'FlipRookie',  group:'The Dark Knights',  method:'Rolimons (flagged)',   submitted:'22 min ago'},
  {user:'GroupStarter',group:'Pixel Crew',        method:'Audit screenshot',     submitted:'1h ago'},
]
const GROUPS = ['Shadow Army HQ','The Void Guild','Neon District','Kingdom of Roblox','Elite Forces','Ghost Squadron','Pixel Mafia','Royal Claimers']
const RL_COLORS = ['r','r','r','r','r','r','r','b','b','b','b','b','b','b','g'] as const
const RANK_CLASS: Record<string, string> = { owner:'rb-owner', manager:'rb-manager', staff:'rb-staff', god:'rb-god', whale:'rb-whale' }

export default function App() {
  const initialized = useRef(false)

  const initApp = useCallback(() => {
    // ── State ────────────────────────────────────────────────
    let currentSide = 'heads'
    let flipping    = false
    let rlSpinning  = false
    let rlCountdown = 30
    let chatData    = [...MOCK_CHAT]
    let rlHistData  = ['r','b','r','r','g','b','r','b','r','r','b','r']

    // ── Nav ──────────────────────────────────────────────────
    const titles: Record<string, string> = {
      home:'Lobby', coinflip:'Coinflip', roulette:'Roulette',
      chat:'Live Chat', leaderboard:'Leaderboard', profile:'Profile', admin:'Admin Panel',
    }
    ;(window as any).nav = (page: string) => {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
      const el = document.getElementById('page-' + page)
      if (el) el.classList.add('active')
      const title = document.getElementById('pageTitle')
      if (title) title.textContent = titles[page] ?? page
      // highlight nav
      document.querySelectorAll('.nav-item').forEach(n => {
        const txt = n.textContent?.toLowerCase() ?? ''
        if (
          (page === 'home' && txt.includes('lobby')) ||
          txt.includes(page.replace('-', ' '))
        ) n.classList.add('active')
      })
    }

    // ── Toast ────────────────────────────────────────────────
    ;(window as any).showToast = (msg: string, type = 'success') => {
      const icons: Record<string, string> = { success:'✅', error:'❌', info:'ℹ️' }
      const tc = document.getElementById('toastContainer')
      if (!tc) return
      const t = document.createElement('div')
      t.className = `toast ${type}`
      t.innerHTML = `<span style="font-size:16px">${icons[type] ?? 'ℹ️'}</span><span>${msg}</span>`
      tc.appendChild(t)
      setTimeout(() => {
        t.style.animation = 'slideOut 0.3s ease forwards'
        setTimeout(() => t.remove(), 300)
      }, 3000)
    }

    // ── Coinflip ─────────────────────────────────────────────
    ;(window as any).pickSide = (side: string) => {
      currentSide = side
      document.getElementById('btnHeads')?.classList.toggle('active', side === 'heads')
      document.getElementById('btnTails')?.classList.toggle('active', side === 'tails')
      const choice = document.getElementById('cfP1Choice')
      if (choice) choice.textContent = `— ${side.toUpperCase()}`
    }

    ;(window as any).createFlip = () => {
      const url = (document.getElementById('groupUrl') as HTMLInputElement)?.value.trim()
      if (!url) { ;(window as any).showToast('Enter your group URL first', 'error'); return }
      const g = document.getElementById('cfP1Group')
      if (g) g.textContent = url.split('/').filter(Boolean).slice(-1)[0] ?? 'Your Group'
      ;(window as any).showToast('Flip created! Waiting for challenger...', 'success')
      setTimeout(() => {
        const p2 = document.getElementById('cfP2')
        if (!p2) return
        p2.className = 'cf-player challenger'
        p2.innerHTML = `
          <div class="avatar" style="width:36px;height:36px;font-size:13px;background:linear-gradient(135deg,#ff4d8d,#f0c040)">S</div>
          <div class="cf-player-name">SupremzRBX</div>
          <div class="cf-player-group">Shadow Army HQ</div>
          <div class="cf-choice" style="color:var(--muted)">— TAILS</div>`
        ;(window as any).showToast('SupremzRBX accepted your flip!', 'info')
      }, 2000)
    }

    ;(window as any).startFlip = () => {
      if (flipping) return
      flipping = true
      const coin = document.getElementById('theCoin')
      const banner = document.getElementById('winnerBanner')
      if (!coin) return
      coin.classList.remove('spin')
      void coin.offsetWidth
      coin.classList.add('spin')
      banner?.classList.remove('show')
      setTimeout(() => {
        flipping = false
        const win = Math.random() < 0.5
        const emoji = document.getElementById('winnerEmoji')
        const text  = document.getElementById('winnerText')
        const sub   = document.getElementById('winnerSub')
        if (emoji) emoji.textContent = win ? '🏆' : '💀'
        if (text)  text.textContent  = win ? 'Nihal_R Wins!' : 'SupremzRBX Wins!'
        if (sub)   sub.textContent   = win ? 'You claimed Shadow Army HQ!' : 'They claimed your group.'
        banner?.classList.add('show')
        ;(window as any).showToast(win ? '🎉 You won the flip!' : '💀 You lost this one.', win ? 'success' : 'error')
        coin.classList.remove('spin')
      }, 1600)
    }

    ;(window as any).resetFlip = () => {
      document.getElementById('winnerBanner')?.classList.remove('show')
      const p2 = document.getElementById('cfP2')
      if (p2) {
        p2.className = 'cf-player empty'
        p2.innerHTML = `<span style="font-size:22px">+</span><div class="cf-player-name">Waiting...</div><div class="cf-player-group">No challenger yet</div>`
        p2.onclick = () => (window as any).showToast('Share your flip link to invite someone!', 'info')
      }
      const g = document.getElementById('cfP1Group')
      if (g) g.textContent = 'Waiting for group...'
      const u = document.getElementById('groupUrl') as HTMLInputElement
      if (u) u.value = ''
      flipping = false
    }

    ;(window as any).copyLink = () => (window as any).showToast('Flip link copied to clipboard!', 'success')

    // ── Roulette strip ───────────────────────────────────────
    const buildStrip = () => {
      const strip = document.getElementById('rlStrip')
      if (!strip) return
      strip.innerHTML = Array.from({ length: 80 }, () => {
        const c = RL_COLORS[Math.floor(Math.random() * RL_COLORS.length)]
        const name = GROUPS[Math.floor(Math.random() * GROUPS.length)].substring(0, 6)
        return `<div class="rl-item ${c}">${name}</div>`
      }).join('')
    }

    const renderRlHistory = () => {
      const el = document.getElementById('rlHistory')
      if (!el) return
      const label: Record<string, string> = { r:'R', b:'B', g:'G' }
      el.innerHTML = rlHistData.slice(0, 20)
        .map(c => `<div class="rl-item ${c}" style="width:36px;height:36px;font-size:12px;font-weight:700">${label[c]}</div>`)
        .join('')
    }

    ;(window as any).spinRoulette = () => {
      if (rlSpinning) { ;(window as any).showToast('Round already spinning!', 'error'); return }
      rlSpinning = true
      const strip = document.getElementById('rlStrip')
      if (!strip) return
      const px = 40 * 56 + Math.random() * 40 - 20
      strip.style.transition = 'transform 5s cubic-bezier(0.25,0.1,0.1,1)'
      strip.style.transform  = `translateX(-${px}px)`
      ;(window as any).showToast('Spinning! 🎡', 'info')
      setTimeout(() => {
        const result = RL_COLORS[Math.floor(Math.random() * RL_COLORS.length)]
        const labels = { r:'RED 🔴', b:'BLACK ⚫', g:'GREEN 🟢' }
        ;(window as any).showToast(`Result: ${labels[result]}!`, result === 'g' ? 'success' : result === 'r' ? 'error' : 'info')
        rlHistData.unshift(result)
        renderRlHistory()
        strip.style.transition = 'none'
        strip.style.transform  = 'translateX(0)'
        buildStrip()
        rlSpinning  = false
        rlCountdown = 30
      }, 5500)
    }

    ;(window as any).placeBet = (color: string) =>
      (window as any).showToast(`Bet locked on ${color.toUpperCase()}. Submit your group URL.`, 'info')

    // ── Chat ─────────────────────────────────────────────────
    const renderChat = () => {
      const c = document.getElementById('chatMessages')
      if (!c) return
      c.innerHTML = chatData.map(m => `
        <div class="chat-msg">
          <div class="avatar-sm" style="background:${m.color}">${m.user[0]}</div>
          <div class="chat-msg-content">
            <div class="chat-msg-header">
              <span class="chat-username" style="color:${m.color}">${m.user}</span>
              ${m.rank ? `<span class="rank-badge ${RANK_CLASS[m.rank] ?? ''}">${m.rank.toUpperCase()}</span>` : ''}
              <span class="chat-time">${m.time}</span>
            </div>
            <div class="chat-text">${m.msg}</div>
          </div>
        </div>`).join('')
      c.scrollTop = c.scrollHeight
    }

    ;(window as any).sendChat = () => {
      const input = document.getElementById('chatInput') as HTMLInputElement
      const msg = input?.value.trim()
      if (!msg) return
      chatData.push({
        user:'Nihal_R', rank:'owner', color:'#7c5cfc', msg,
        time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      })
      renderChat()
      if (input) input.value = ''
    }

    // ── Active flips table ───────────────────────────────────
    const renderFlips = () => {
      const b = document.getElementById('flipsBody')
      if (!b) return
      b.innerHTML = MOCK_FLIPS.map(f => `
        <tr>
          <td><div class="flip-user"><div class="avatar-sm" style="background:${f.color}">${f.user[0]}</div><span style="font-weight:500">${f.user}</span></div></td>
          <td><span class="group-pill">${f.group}</span></td>
          <td style="font-family:'DM Mono',monospace;font-size:12px">${f.members}</td>
          <td><span class="status-badge status-${f.status}">${f.status === 'open' ? '● OPEN' : '⏳ PENDING'}</span></td>
          <td style="color:var(--dim);font-size:11px;font-family:'DM Mono',monospace">2m ago</td>
          <td><button class="btn btn-outline btn-sm" onclick="nav('coinflip');showToast('Joining flip...','info')">Join</button></td>
        </tr>`).join('')
    }

    // ── Open challenges ──────────────────────────────────────
    const renderChallenges = () => {
      const el = document.getElementById('openChallenges')
      if (!el) return
      el.innerHTML = MOCK_FLIPS.slice(0, 3).map(f => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;cursor:pointer;transition:all 0.15s"
             onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600">${f.user}</span>
            <span class="status-badge status-open" style="font-size:10px">OPEN</span>
          </div>
          <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace">${f.group} · ${f.members} members</div>
        </div>`).join('')
    }

    // ── Online users ─────────────────────────────────────────
    const renderOnline = () => {
      const el = document.getElementById('onlineList')
      if (!el) return
      el.innerHTML = MOCK_ONLINE.map(u => `
        <div class="online-item">
          <div class="online-dot"></div>
          <span class="online-name">${u.name}</span>
          ${u.rank ? `<span class="rank-badge ${RANK_CLASS[u.rank] ?? ''}" style="font-size:9px">${u.rank.toUpperCase()}</span>` : ''}
        </div>`).join('')
    }

    // ── Leaderboard ──────────────────────────────────────────
    const renderLb = () => {
      const rankClass = ['gold','silver','bronze']
      const colors    = ['var(--gold)','#b0b8c8','#cd7f32']
      ;['lbList','lbMonthList'].forEach((id, mi) => {
        const el = document.getElementById(id)
        if (!el) return
        el.innerHTML = MOCK_LB.map((p, i) => `
          <div class="lb-row">
            <div class="lb-rank ${rankClass[i] ?? ''}">${i + 1}</div>
            <div class="avatar-sm" style="background:#7c5cfc;font-size:11px">${p.name[0]}</div>
            <div class="lb-info">
              <div class="lb-name">${p.name}</div>
              <div class="lb-detail">${p.groups} groups claimed</div>
            </div>
            <div class="lb-wins" style="color:${colors[i] ?? 'var(--text)'}">
              ${mi === 0 ? p.wins : Math.floor(p.wins * 0.3)}
              <small style="font-size:10px;color:var(--muted);font-family:'DM Sans',sans-serif;font-weight:400;display:block">wins</small>
            </div>
          </div>`).join('')
      })
    }

    // ── Profile ──────────────────────────────────────────────
    const renderProfile = () => {
      const acts = [
        {type:'win',  desc:'Won Shadow Army HQ vs SupremzRBX', time:'2h ago'},
        {type:'win',  desc:'Won Neon District vs xShadowFlip',  time:'5h ago'},
        {type:'loss', desc:'Lost Elite Forces vs VaultKing',    time:'1d ago'},
        {type:'win',  desc:'Won The Void Guild vs FlipMaster99',time:'2d ago'},
      ]
      const actEl = document.getElementById('profileActivity')
      if (actEl) {
        actEl.innerHTML = acts.map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
            <span style="font-size:16px">${a.type === 'win' ? '🏆' : '💀'}</span>
            <div style="flex:1">
              <div style="font-size:12px;font-weight:500">${a.desc}</div>
              <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace">${a.time}</div>
            </div>
            <span style="font-size:11px;color:${a.type === 'win' ? 'var(--green)' : 'var(--red)'}">
              ${a.type === 'win' ? '+ 1 group' : '- 1 group'}
            </span>
          </div>`).join('')
      }

      const gwEl = document.getElementById('groupsWon')
      if (gwEl) {
        gwEl.innerHTML = GROUPS.slice(0, 5).map(g => `
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:13px;font-weight:500">${g}</div>
              <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace">${(Math.floor(Math.random()*5000)+500).toLocaleString()} members</div>
            </div>
            <span style="font-size:11px;color:var(--green)">Won</span>
          </div>`).join('')
      }
    }

    // ── Admin ────────────────────────────────────────────────
    const renderAdmin = () => {
      const pvEl = document.getElementById('pendingVerifications')
      if (pvEl) {
        pvEl.innerHTML = MOCK_PENDING.map(p => `
          <div class="pending-item">
            <div class="pending-info">
              <div class="pending-name">${p.user} → ${p.group}</div>
              <div class="pending-detail">${p.method} · ${p.submitted}</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-green btn-sm" onclick="this.closest('.pending-item').remove();showToast('${p.user} approved!','success')">✓ Approve</button>
              <button class="btn btn-red btn-sm"   onclick="this.closest('.pending-item').remove();showToast('${p.user} rejected','error')">✗ Deny</button>
            </div>
          </div>`).join('')
      }

      const slEl = document.getElementById('staffList')
      if (slEl) {
        const staff = [{name:'Nihal_R',role:'Owner'},{name:'StaffBot',role:'Manager'},{name:'VerifyMod',role:'Staff'}]
        slEl.innerHTML = staff.map(s => `
          <div class="pending-item">
            <div class="pending-info"><div class="pending-name">${s.name}</div></div>
            <span class="rank-badge rb-${s.role.toLowerCase()}">${s.role.toUpperCase()}</span>
          </div>`).join('')
      }

      const rlEl = document.getElementById('reportsList')
      if (rlEl) {
        rlEl.innerHTML = [
          {user:'AnonUser12',  reason:'Suspected alt account',         time:'1h ago'},
          {user:'GroupThief99',reason:'Refusing to transfer won group', time:'3h ago'},
        ].map(r => `
          <div class="pending-item">
            <div class="pending-info">
              <div class="pending-name">${r.user}</div>
              <div class="pending-detail">${r.reason} · ${r.time}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="showToast('Reviewing...','info')">Review</button>
          </div>`).join('')
      }
    }

    // ── Roulette bettors ─────────────────────────────────────
    const renderRlBettors = () => {
      const el = document.getElementById('rlBettors')
      if (!el) return
      const colors = ['#ff4d8d','#00d4ff','#7c5cfc','#2ecc71','#f0c040','#ff9f43']
      el.innerHTML = MOCK_ONLINE.slice(0, 5).map((u, i) => `
        <div class="online-item">
          <div class="avatar-sm" style="background:${colors[i % colors.length]};font-size:9px">${u.name[0]}</div>
          <span style="font-size:12px;flex:1">${u.name}</span>
          <div class="rl-item r" style="width:30px;height:20px;font-size:9px">RED</div>
        </div>`).join('')
    }

    // ── Timers ───────────────────────────────────────────────
    setInterval(() => {
      rlCountdown = Math.max(0, rlCountdown - 1)
      if (rlCountdown <= 0) rlCountdown = 30
      const el = document.getElementById('rlTimer')
      if (el) el.textContent = `0:${String(rlCountdown).padStart(2, '0')}`
    }, 1000)

    setInterval(() => {
      const el = document.getElementById('activeFlipsCount')
      if (el) el.textContent = String(44 + Math.floor(Math.random() * 8))
    }, 4000)

    // ── Init all renders ─────────────────────────────────────
    renderFlips()
    renderChallenges()
    renderChat()
    renderOnline()
    renderLb()
    renderProfile()
    renderAdmin()
    buildStrip()
    renderRlHistory()
    renderRlBettors()
  }, [])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    initApp()
  }, [initApp])

  return (
    <>
      {/* ── LOGIN ─────────────────────────────────────────── */}
      <div className="login-screen" id="loginScreen">
        <div className="login-glow" />
        <div className="login-box">
          <div className="login-logo">G</div>
          <div className="login-title">GroupFlip</div>
          <div className="login-sub">The first platform for wagering Roblox groups. Wager yours, win theirs.</div>
          <div className="features">
            <div className="login-feature"><span className="login-feature-icon">🏆</span><span className="login-feature-text">1v1 Coinflips &amp; Roulette using Roblox groups as wagers</span></div>
            <div className="login-feature"><span className="login-feature-icon">🛡️</span><span className="login-feature-text">30-day ownership verification protects all players</span></div>
            <div className="login-feature"><span className="login-feature-icon">🎖️</span><span className="login-feature-text">Earn Discord roles — God, Whale, and more — by winning</span></div>
          </div>
          <button className="btn-roblox" onClick={() => { window.location.href = '/api/auth/roblox' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M5 3.5L18.5 7 15 20.5 1.5 17z" /></svg>
            Continue with Roblox
          </button>
          <div className="login-terms">By logging in you confirm you are 18+ and agree to our Terms of Service.</div>
        </div>
      </div>

      {/* ── SHELL ─────────────────────────────────────────── */}
      <div className="shell">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-icon">G</div>
            <div className="logo-text">Group<span>Flip</span></div>
          </div>
          <nav className="nav">
            <div className="nav-section">
              <div className="nav-label">Games</div>
              <div className="nav-item active" onClick={() => (window as any).nav('home')}><span className="nav-icon">⬡</span> Lobby<span className="badge live">LIVE</span></div>
              <div className="nav-item" onClick={() => (window as any).nav('coinflip')}><span className="nav-icon">🪙</span> Coinflip</div>
              <div className="nav-item" onClick={() => (window as any).nav('roulette')}><span className="nav-icon">🎰</span> Roulette</div>
            </div>
            <div className="nav-section">
              <div className="nav-label">Social</div>
              <div className="nav-item" style={{position:'relative'}} onClick={() => (window as any).nav('chat')}><span className="nav-icon">💬</span> Live Chat<div className="notif-dot" /></div>
              <div className="nav-item" onClick={() => (window as any).nav('leaderboard')}><span className="nav-icon">📊</span> Leaderboard</div>
            </div>
            <div className="nav-section">
              <div className="nav-label">Account</div>
              <div className="nav-item" onClick={() => (window as any).nav('profile')}><span className="nav-icon">👤</span> Profile</div>
              <div className="nav-item" onClick={() => (window as any).nav('admin')}><span className="nav-icon">⚙️</span> Admin Panel<span className="badge" style={{background:'var(--red)'}}>3</span></div>
            </div>
          </nav>
          <div className="sidebar-user" onClick={() => (window as any).nav('profile')}>
            <div className="avatar">N</div>
            <div className="user-info">
              <div className="user-name">Nihal_R</div>
              <div className="user-rank">★ OWNER</div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="topbar">
            <div className="page-title" id="pageTitle">Lobby</div>
            <div className="topbar-right">
              <div className="topbar-stat"><div className="dot" /><span style={{color:'var(--muted)',fontSize:11}}>Online:</span><span style={{color:'var(--green)',fontWeight:600}}>214</span></div>
              <div className="topbar-stat"><span style={{color:'var(--muted)',fontSize:11}}>Flips today:</span><span style={{fontWeight:600}}>1,847</span></div>
              <button className="btn btn-primary btn-sm" onClick={() => (window as any).nav('coinflip')}>+ New Flip</button>
            </div>
          </div>

          <div className="content">

            {/* ── HOME ──────────────────────────────────── */}
            <div className="page active" id="page-home">
              <div className="stats-row">
                <div className="stat-card s1"><div className="stat-label">GROUPS WAGERED TODAY</div><div className="stat-value">2,391</div><div className="stat-sub up">↑ 18% from yesterday</div></div>
                <div className="stat-card s2"><div className="stat-label">ACTIVE FLIPS</div><div className="stat-value" id="activeFlipsCount">47</div><div className="stat-sub">right now</div></div>
                <div className="stat-card s3"><div className="stat-label">BIGGEST WAGER TODAY</div><div className="stat-value">8.2K</div><div className="stat-sub" style={{color:'var(--muted)'}}>members group</div></div>
                <div className="stat-card s4"><div className="stat-label">YOUR WIN RATE</div><div className="stat-value">67%</div><div className="stat-sub up">12W / 6L</div></div>
              </div>
              <div className="lobby-grid">
                <div className="game-card coinflip" onClick={() => (window as any).nav('coinflip')}>
                  <span className="game-icon">🪙</span>
                  <div className="game-name">Coinflip</div>
                  <div className="game-desc">Pure 1v1. Pick heads or tails, wager your group. Winner takes both. Groups need 30 days ownership.</div>
                  <div className="game-meta"><span className="game-tag tag-live">● LIVE</span><span className="game-tag tag-hot">HOT</span><span className="game-players">38 active</span></div>
                </div>
                <div className="game-card roulette" onClick={() => (window as any).nav('roulette')}>
                  <span className="game-icon">🎡</span>
                  <div className="game-name">Roulette</div>
                  <div className="game-desc">Bet your group on red, black, or green. Multiple players, one color wins the entire pot.</div>
                  <div className="game-meta"><span className="game-tag tag-live">● LIVE</span><span className="game-tag tag-new">NEW</span><span className="game-players">9 active</span></div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Active Coinflips</span><button className="btn btn-outline btn-sm" onClick={() => (window as any).nav('coinflip')}>View all</button></div>
                <table className="flips-table">
                  <thead><tr><th>PLAYER</th><th>GROUP WAGERED</th><th>MEMBERS</th><th>STATUS</th><th>TIME</th><th /></tr></thead>
                  <tbody id="flipsBody" />
                </table>
              </div>
            </div>

            {/* ── COINFLIP ───────────────────────────────── */}
            <div className="page" id="page-coinflip">
              <div className="cf-layout">
                <div>
                  <div className="cf-arena" id="cfArena">
                    <div className="coin-wrapper">
                      <div className="coin" id="theCoin">
                        <div className="coin-face coin-heads">H</div>
                        <div className="coin-face coin-tails">T</div>
                      </div>
                    </div>
                    <div className="cf-vs">
                      <div className="cf-player challenger" id="cfP1">
                        <div className="avatar" style={{width:36,height:36,fontSize:13}}>N</div>
                        <div className="cf-player-name">Nihal_R</div>
                        <div className="cf-player-group" id="cfP1Group">Waiting for group...</div>
                        <div className="cf-choice" id="cfP1Choice">— HEADS</div>
                      </div>
                      <div className="cf-vs-badge">VS</div>
                      <div className="cf-player empty" id="cfP2" onClick={() => (window as any).showToast('Share your flip link to invite someone!','info')}>
                        <span style={{fontSize:22}}>+</span>
                        <div className="cf-player-name">Waiting...</div>
                        <div className="cf-player-group">No challenger yet</div>
                      </div>
                    </div>
                    <div className="cf-actions">
                      <button className="btn btn-gold" onClick={() => (window as any).startFlip()}>🪙 Flip Now</button>
                      <button className="btn btn-outline" onClick={() => (window as any).copyLink()}>🔗 Share Flip</button>
                      <button className="btn btn-outline btn-sm" onClick={() => (window as any).resetFlip()}>Cancel</button>
                    </div>
                    <div className="winner-banner" id="winnerBanner">
                      <span style={{fontSize:40,display:'block',marginBottom:8}} id="winnerEmoji">🏆</span>
                      <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:20,color:'var(--gold)'}} id="winnerText">Nihal_R Wins!</div>
                      <div style={{fontSize:12,color:'var(--muted)',marginTop:4}} id="winnerSub">Claimed both groups</div>
                      <button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={() => (window as any).resetFlip()}>New Flip</button>
                    </div>
                  </div>
                  <div className="card" style={{marginTop:16}}>
                    <div className="card-header"><span className="card-title">Recent Flips</span></div>
                    <table className="flips-table">
                      <thead><tr><th>WINNER</th><th>LOSER</th><th>SIDE</th><th>TIME</th></tr></thead>
                      <tbody id="recentFlips" />
                    </table>
                  </div>
                </div>
                <div className="side-panel">
                  <div className="panel">
                    <div className="panel-header">Create Flip</div>
                    <div className="panel-body">
                      <div className="wager-row"><div className="wager-label">Your Group URL</div><input className="group-input" id="groupUrl" placeholder="roblox.com/groups/12345..." /></div>
                      <div className="wager-row">
                        <div className="wager-label">Pick Your Side</div>
                        <div className="side-choice">
                          <div className="side-btn heads active" id="btnHeads" onClick={() => (window as any).pickSide('heads')}>🌕 Heads</div>
                          <div className="side-btn tails" id="btnTails" onClick={() => (window as any).pickSide('tails')}>⚫ Tails</div>
                        </div>
                      </div>
                      <div className="warn-box"><div className="warn-box-title">⚠️ OWNERSHIP VERIFICATION</div><div className="warn-box-text">Your group must be owned by you for 30+ days. We check via Rolimons automatically, or you can upload an audit log screenshot.</div></div>
                      <button className="btn btn-primary" style={{width:'100%'}} onClick={() => (window as any).createFlip()}>Create Flip</button>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-header">Open Challenges</div>
                    <div className="panel-body" id="openChallenges" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── ROULETTE ───────────────────────────────── */}
            <div className="page" id="page-roulette">
              <div className="rl-layout">
                <div>
                  <div className="rl-wheel-wrap">
                    <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:16,marginBottom:8,alignSelf:'flex-start'}}>Roulette Round #1,294</div>
                    <div style={{fontSize:12,color:'var(--muted)',marginBottom:16,alignSelf:'flex-start'}}>Next spin in <span id="rlTimer" style={{color:'var(--accent2)',fontFamily:'DM Mono,monospace',fontWeight:600}}>0:30</span></div>
                    <div className="rl-strip-wrapper"><div className="rl-needle" /><div className="rl-strip" id="rlStrip" /></div>
                    <div style={{margin:'20px 0',width:'100%',maxWidth:600}}>
                      <div style={{fontSize:11,color:'var(--muted)',marginBottom:12,letterSpacing:'0.5px'}}>PLACE YOUR BET — GROUP AS WAGER</div>
                      <div className="rl-bets">
                        <div className="rl-bet-zone red" onClick={() => (window as any).placeBet('red')}><div className="rl-zone-label">RED</div><div className="rl-zone-multi">2x</div><div className="rl-zone-players">5 groups</div></div>
                        <div className="rl-bet-zone black" onClick={() => (window as any).placeBet('black')}><div className="rl-zone-label">BLACK</div><div className="rl-zone-multi">2x</div><div className="rl-zone-players">3 groups</div></div>
                        <div className="rl-bet-zone green" onClick={() => (window as any).placeBet('green')}><div className="rl-zone-label">GREEN</div><div className="rl-zone-multi">14x</div><div className="rl-zone-players">0 groups</div></div>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => (window as any).spinRoulette()}>Spin &amp; Bet My Group</button>
                  </div>
                  <div className="card" style={{marginTop:16}}>
                    <div className="card-header"><span className="card-title">Round History</span></div>
                    <div style={{padding:'14px 18px',display:'flex',gap:6,flexWrap:'wrap'}} id="rlHistory" />
                  </div>
                </div>
                <div className="side-panel">
                  <div className="panel">
                    <div className="panel-header">Your Wager</div>
                    <div className="panel-body">
                      <div className="wager-row"><div className="wager-label">Group URL</div><input className="group-input" placeholder="roblox.com/groups/..." /></div>
                      <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',marginBottom:14}}>
                        <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>Pot breakdown</div>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:'#ff8080'}}>Red (5)</span><span style={{fontSize:12,fontFamily:'DM Mono,monospace'}}>58%</span></div>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:'var(--muted)'}}>Black (3)</span><span style={{fontSize:12,fontFamily:'DM Mono,monospace'}}>35%</span></div>
                        <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:12,color:'var(--green)'}}>Green (0)</span><span style={{fontSize:12,fontFamily:'DM Mono,monospace'}}>7%</span></div>
                      </div>
                      <button className="btn btn-primary" style={{width:'100%'}}>Place Bet</button>
                    </div>
                  </div>
                  <div className="panel"><div className="panel-header">Current Bettors</div><div style={{padding:12}} id="rlBettors" /></div>
                </div>
              </div>
            </div>

            {/* ── CHAT ──────────────────────────────────── */}
            <div className="page" id="page-chat">
              <div className="chat-layout">
                <div className="chat-main">
                  <div className="card-header" style={{padding:'14px 18px'}}><span className="card-title">Live Chat</span><span style={{fontSize:11,color:'var(--green)',fontFamily:'DM Mono,monospace'}}>● 214 online</span></div>
                  <div className="chat-messages" id="chatMessages" />
                  <div className="chat-input-row">
                    <input className="chat-input" id="chatInput" placeholder="Say something..." onKeyDown={e => { if (e.key === 'Enter') (window as any).sendChat() }} />
                    <button className="btn btn-primary btn-sm" onClick={() => (window as any).sendChat()}>Send</button>
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  <div className="panel">
                    <div className="panel-header">Online Now <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'var(--green)'}}>214</span></div>
                    <div style={{padding:8,maxHeight:260,overflowY:'auto'}} id="onlineList" />
                  </div>
                  <div className="panel">
                    <div className="panel-header">Discord Integration</div>
                    <div className="panel-body">
                      <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5,marginBottom:12}}>Connect Discord to auto-receive roles when you hit win milestones.</div>
                      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:12}}>🎖️ Whale</span><span style={{fontSize:11,color:'var(--muted)',fontFamily:'DM Mono,monospace'}}>25+ wins</span></div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:12}}>👑 God</span><span style={{fontSize:11,color:'var(--muted)',fontFamily:'DM Mono,monospace'}}>100+ wins</span></div>
                      </div>
                      <button className="btn btn-discord btn-sm" style={{width:'100%',padding:10,borderRadius:8}} onClick={() => { window.location.href = '/api/discord/link' }}>Connect Discord</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── LEADERBOARD ────────────────────────────── */}
            <div className="page" id="page-leaderboard">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                <div className="card"><div className="card-header"><span className="card-title">🏆 All-Time Wins</span></div><div id="lbList" /></div>
                <div className="card"><div className="card-header"><span className="card-title">📅 This Month</span></div><div id="lbMonthList" /></div>
              </div>
            </div>

            {/* ── PROFILE ────────────────────────────────── */}
            <div className="page" id="page-profile">
              <div className="profile-hero">
                <div className="profile-top">
                  <div className="avatar-lg">N</div>
                  <div>
                    <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:22,marginBottom:4}}>Nihal_R</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <span className="rank-badge rb-owner">OWNER</span>
                      <span className="rank-badge rb-god">GOD</span>
                    </div>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:8,fontFamily:'DM Mono,monospace'}}>Member since March 2024 · Discord connected</div>
                  </div>
                </div>
                <div className="profile-stats-grid">
                  <div className="profile-stat"><div className="profile-stat-val" style={{color:'var(--green)'}}>127</div><div className="profile-stat-label">Total Wins</div></div>
                  <div className="profile-stat"><div className="profile-stat-val" style={{color:'var(--red)'}}>48</div><div className="profile-stat-label">Total Losses</div></div>
                  <div className="profile-stat"><div className="profile-stat-val" style={{color:'var(--gold)'}}>72%</div><div className="profile-stat-label">Win Rate</div></div>
                  <div className="profile-stat"><div className="profile-stat-val" style={{color:'var(--cyan)'}}>8.2K</div><div className="profile-stat-label">Biggest Group Won</div></div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div className="card"><div className="card-header"><span className="card-title">Recent Activity</span></div><div id="profileActivity" /></div>
                <div className="card"><div className="card-header"><span className="card-title">Groups Won</span></div><div style={{padding:'14px 18px',display:'flex',flexDirection:'column',gap:8}} id="groupsWon" /></div>
              </div>
            </div>

            {/* ── ADMIN ──────────────────────────────────── */}
            <div className="page" id="page-admin">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                <div>
                  <div className="card" style={{marginBottom:16}}>
                    <div className="card-header"><span className="card-title">Pending Verifications</span><span className="badge" style={{background:'var(--red)'}}>3</span></div>
                    <div style={{padding:14,display:'flex',flexDirection:'column',gap:8}} id="pendingVerifications" />
                  </div>
                  <div className="card">
                    <div className="card-header"><span className="card-title">Platform Stats</span></div>
                    <div style={{padding:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      <div className="profile-stat"><div className="profile-stat-val">2,391</div><div className="profile-stat-label">Today&apos;s Flips</div></div>
                      <div className="profile-stat"><div className="profile-stat-val" style={{color:'var(--green)'}}>$0</div><div className="profile-stat-label">Real Money</div></div>
                      <div className="profile-stat"><div className="profile-stat-val">47</div><div className="profile-stat-label">Active Now</div></div>
                      <div className="profile-stat"><div className="profile-stat-val" style={{color:'var(--accent2)'}}>1,204</div><div className="profile-stat-label">Registered Users</div></div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="card" style={{marginBottom:16}}><div className="card-header"><span className="card-title">Staff Management</span></div><div style={{padding:14,display:'flex',flexDirection:'column',gap:8}} id="staffList" /></div>
                  <div className="card"><div className="card-header"><span className="card-title">Recent Reports</span></div><div style={{padding:14,display:'flex',flexDirection:'column',gap:8}} id="reportsList" /></div>
                </div>
              </div>
            </div>

          </div>{/* /content */}
        </div>{/* /main */}
      </div>{/* /shell */}

      {/* TOAST */}
      <div className="toast-container" id="toastContainer" />
    </>
  )
}
