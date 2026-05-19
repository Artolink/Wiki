import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/buyMeCoffee.scss"

// Pulsante "Buy me a coffee" che appare SOLO sulla home (slug === "index").
// Self-hide via `return null` sulle altre pagine, così il Flex parent non
// riserva spazio per un elemento invisibile.
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
      {/* Icona tazza di caffè + vapore — stile feather-icons "coffee" */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" />
        <line x1="6" x2="6" y1="2" y2="4" />
        <line x1="10" x2="10" y1="2" y2="4" />
        <line x1="14" x2="14" y1="2" y2="4" />
      </svg>
      <span class="bmc-text">Buy me a coffee</span>
    </a>
  )
}

BuyMeCoffee.css = style

export default (() => BuyMeCoffee) satisfies QuartzComponentConstructor
