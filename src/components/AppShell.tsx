import { useEffect, useState } from 'react'
import { BarChart3, Gamepad2, Home, Keyboard, ListChecks, Medal, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Logo } from '@/components/Logo'
import { getDesktopInfo } from '@/lib/storage'
import type { DesktopInfo } from '@/types'
import { useI18n } from '@/lib/i18n'

const navigation = [
  { to: '/', label: 'Обзор', icon: Home, end: true },
  { to: '/lessons', label: 'Уроки', icon: Keyboard },
  { to: '/training-lab', label: 'Практика', icon: ListChecks },
  { to: '/arcade', label: 'Аркады', icon: Gamepad2 },
  { to: '/stats', label: 'Прогресс', icon: BarChart3 },
  { to: '/achievements', label: 'Достижения', icon: Medal },
]

export function AppShell() {
  const { t } = useI18n()
  const [info, setInfo] = useState<DesktopInfo | null>(null)
  useEffect(() => { getDesktopInfo().then(setInfo) }, [])
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label={t('Основная навигация')}>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={19} aria-hidden="true" /><span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}><Settings size={19} /><span>{t("Настройки")}</span></NavLink>
          <div className="runtime-badge"><i className={info?.isDesktop ? 'online' : ''} /><span>{info?.isDesktop ? `Windows · ${info.arch}` : t('Локальный предпросмотр')}</span></div>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
      <nav className="mobile-nav" aria-label={t('Мобильная навигация')}>
        {navigation.filter(({ to }) => to !== '/achievements').map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={20} /><span>{t(label)}</span></NavLink>)}
        <NavLink to="/settings"><Settings size={20} aria-hidden="true" /><span>{t("Настройки")}</span></NavLink>
      </nav>
    </div>
  )
}
