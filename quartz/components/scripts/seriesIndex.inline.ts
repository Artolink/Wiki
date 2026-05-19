// Toggle collapse del blocco "Index" nella sidebar destra.
// Stesso pattern del TOC (vedi toc.inline.ts): click sul button header →
// toggle classe `collapsed` su header e su `<ol>` adiacente.
function toggleSeriesIndex(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupSeriesIndex() {
  for (const idx of document.getElementsByClassName("series-index")) {
    const button = idx.querySelector(".series-index-header")
    const content = idx.querySelector(".series-index-list")
    if (!button || !content) continue
    button.addEventListener("click", toggleSeriesIndex)
    window.addCleanup(() => button.removeEventListener("click", toggleSeriesIndex))
  }
}

document.addEventListener("nav", () => {
  setupSeriesIndex()
})
