import Icon from './Icon'

// Ekran paylaşırken pencere kenarında yumuşak kırmızı çerçeve + üstte küçük "Yayındasın" hapı.
// Çerçeve tıklamaları engellemez (pointer-events: none); yalnız hap tıklanabilir.
export default function LiveFrame({ onStop }: { onStop: () => void }) {
  return (
    <>
      <div className="live-frame" aria-hidden="true" />
      <div className="live-pill" role="status">
        <span className="live-dot" />
        <span>Yayındasın</span>
        <button onClick={onStop} title="Ekran paylaşımını durdur">
          <Icon name="stop" size={13} />
          Durdur
        </button>
      </div>
    </>
  )
}
