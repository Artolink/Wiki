function toggleToc(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupToc() {
  for (const toc of document.getElementsByClassName("toc")) {
    const button = toc.querySelector(".toc-header")
    const content = toc.querySelector(".toc-content")
    if (!button || !content) return
    button.addEventListener("click", toggleToc)
    window.addCleanup(() => button.removeEventListener("click", toggleToc))
  }
}

// Evidenziazione TOC: una sola voce alla volta, controllata dal click.
// All'apertura della pagina è attiva la prima voce; cliccando un'altra voce
// si sposta lì l'evidenziazione (tipo "tu sei qui per scelta", non
// scroll-spy automatico).
function setupTocActiveState() {
  for (const toc of document.getElementsByClassName("toc")) {
    const entries = toc.querySelectorAll<HTMLAnchorElement>(".toc-content a[data-for]")
    if (entries.length === 0) continue

    // Stato iniziale: solo la prima voce evidenziata.
    entries.forEach((entry, idx) => {
      entry.classList.toggle("in-view", idx === 0)
    })

    for (const entry of entries) {
      const handler = () => {
        entries.forEach((e) => e.classList.remove("in-view"))
        entry.classList.add("in-view")
      }
      entry.addEventListener("click", handler)
      window.addCleanup(() => entry.removeEventListener("click", handler))
    }
  }
}

document.addEventListener("nav", () => {
  setupToc()
  setupTocActiveState()
})
