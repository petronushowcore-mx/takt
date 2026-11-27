import type { LucideIcon } from 'lucide-react'

export function StatCard({ label, value, unit, icon: Icon, detail, accent = false }: { label: string; value: string | number; unit?: string; icon: LucideIcon; detail?: string; accent?: boolean }) {
  return (
    <article className={`stat-card ${accent ? 'accent' : ''}`}>
      <div className="stat-card-top"><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
      <div className="stat-value">{value}<small>{unit}</small></div>
      {detail && <p>{detail}</p>}
    </article>
  )
}
