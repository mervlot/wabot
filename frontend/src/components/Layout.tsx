import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icons, StatusDot, Toasts, Badge } from './ui.tsx'
import { useStore } from '../lib/store.ts'

const NAV = [
  { to: '/', label: 'Overview', icon: Icons.home, end: true },
  { to: '/accounts', label: 'WhatsApp Accounts', icon: Icons.phone },
  { to: '/messaging', label: 'Messaging', icon: Icons.send },
  { to: '/rules', label: 'Auto-Reply Rules', icon: Icons.rules },
  { to: '/ai', label: 'AI Integration', icon: Icons.sparkle },
  { to: '/history', label: 'Message History', icon: Icons.clock },
  { to: '/settings', label: 'Settings', icon: Icons.gear },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const accounts = useStore((s) => s.accounts)
  const wsConnected = useStore((s) => s.wsConnected)
  const connected = accounts.filter((a) => a.status === 'connected').length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-900/40">W</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-zinc-100">WA Dashboard</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Automation</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-blue-600/15 text-blue-400 font-medium ring-1 ring-inset ring-blue-600/25' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`
            }
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-zinc-800/80 px-5 py-4 text-xs text-zinc-500">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            {wsConnected ? 'Live' : 'Offline'}
          </span>
          <span>
            {connected}/{accounts.length} connected
          </span>
        </div>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const accounts = useStore((s) => s.accounts)
  const logout = useStore((s) => s.logout)
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
  const connectedAccounts = accounts.filter((a) => a.status === 'connected')

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-zinc-800/80 bg-zinc-950/95 backdrop-blur lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-zinc-800 bg-zinc-950 animate-slide-up">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/85 px-4 backdrop-blur-md sm:px-6">
          <button className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Icons.menu size={20} />
          </button>
          <h1 className="truncate text-sm font-semibold text-zinc-100">{current?.label ?? 'Dashboard'}</h1>
          <div className="ml-auto flex items-center gap-2">
            {connectedAccounts.length > 0 && (
              <div className="hidden items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 sm:flex">
                <StatusDot status="connected" />
                {connectedAccounts.length} online
              </div>
            )}
            <Badge color="blue" className="hidden sm:inline-flex">
              localhost
            </Badge>
            <button onClick={logout} className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200" title="Sign out" aria-label="Sign out">
              <Icons.logout size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl animate-fade-in">{children}</div>
        </main>
      </div>

      <Toasts />
    </div>
  )
}
