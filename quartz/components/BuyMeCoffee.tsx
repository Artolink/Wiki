import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/buyMeCoffee.scss"

// Pulsante "Buy me a coffee" che appare SOLO sulla home (slug === "index").
// Self-hide via `return null` sulle altre pagine.
//
// Usiamo il bottone ufficiale dal CDN di BMC (`cdn.buymeacoffee.com`) che è
// il pattern di embedding consigliato da Buy Me a Coffee per i creator —
// il visual resta sempre allineato all'identità di brand BMC, e qualsiasi
// aggiornamento del bottone si propaga automaticamente.
const BuyMeCoffee: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  if (fileData.slug !== "index") return null
  return (
    <a
      class="bmc-button"
      href="https://buymeacoffee.com/farnetiaas"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee"
    >
      <img
        src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
        alt="Buy me a coffee"
        loading="lazy"
        decoding="async"
      />
    </a>
  )
}

BuyMeCoffee.css = style

export default (() => BuyMeCoffee) satisfies QuartzComponentConstructor
