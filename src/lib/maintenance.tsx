// Bakım duyurusu: giriş ekranında ve giriş yapanların ekranının üstünde görünür.
// Bakım bitince MAINTENANCE.active = false yapıp yayınlamak yeterli.
export const MAINTENANCE = {
  active: false,
  title: 'Sunucu bakımda',
  text: 'Sesli kanallarda sorun var, düzeltiyoruz. Bu sürede sesli sohbet çalışmayabilir; metin kanalları açık.',
}

export function MaintenanceBanner({ variant }: { variant: 'auth' | 'app' }) {
  if (!MAINTENANCE.active) return null
  return (
    <div className={`maint-banner maint-${variant}`} role="status">
      <span className="maint-dot" aria-hidden="true" />
      <div>
        <strong>{MAINTENANCE.title}</strong>
        <span>{MAINTENANCE.text}</span>
      </div>
    </div>
  )
}
