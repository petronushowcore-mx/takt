import { useI18n } from '@/lib/i18n'

export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <div className="brand" role="img" aria-label="takt..">
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="36" height="36" rx="11" fill="currentColor" />
        <path d="M15 10v18h6M10 16h11" fill="none" stroke="var(--bg)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="27" cy="28" r="2" fill="var(--bg)" />
        <circle cx="33" cy="28" r="2" fill="var(--bg)" />
      </svg>
      {!compact && <><strong>takt..</strong><span>{t("тренажёр ритма")}</span></>}
    </div>
  )
}
