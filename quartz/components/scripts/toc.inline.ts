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

// Collapse/expand dei sotto-livelli della TOC. Gli item con figli hanno un
// caret cliccabile (vedi TableOfContents.tsx). Click → toggle `data-collapsed`
// sull'<li> + ricalcolo della visibilità di tutti gli item.
//
// Algoritmo "ancestor stack" (O(n)): iteriamo gli item in ordine documento,
// mantenendo uno stack degli antenati attivi. Per ogni item:
//   1. pop dallo stack tutti gli antenati con depth >= depth corrente
//   2. l'item è nascosto sse un qualunque elemento nello stack è collapsed
//   3. push dell'item corrente sullo stack (per i suoi futuri discendenti)
function setupTocFolding() {
  for (const toc of document.getElementsByClassName("toc")) {
    const items = Array.from(toc.querySelectorAll<HTMLLIElement>(".toc-content > li"))
    if (items.length === 0) continue

    const recompute = () => {
      const stack: { depth: number; collapsed: boolean }[] = []
      for (const item of items) {
        const depth = parseInt(item.dataset.depth ?? "0", 10)
        while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
          stack.pop()
        }
        const hidden = stack.some((a) => a.collapsed)
        item.classList.toggle("hidden-by-fold", hidden)
        stack.push({ depth, collapsed: item.dataset.collapsed === "true" })
      }
    }

    recompute()

    const folds = toc.querySelectorAll<HTMLButtonElement>(".toc-content > li > button.toc-fold")
    for (const fold of folds) {
      const li = fold.parentElement as HTMLLIElement | null
      if (!li) continue
      const handler = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        li.dataset.collapsed = li.dataset.collapsed === "true" ? "false" : "true"
        recompute()
      }
      fold.addEventListener("click", handler)
      window.addCleanup(() => fold.removeEventListener("click", handler))
    }
  }
}

document.addEventListener("nav", () => {
  setupToc()
  setupTocActiveState()
  setupTocFolding()
})
