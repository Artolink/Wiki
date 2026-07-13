const svgCopy =
  '<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true"><path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>'
const svgCheck =
  '<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true"><path fill-rule="evenodd" fill="rgb(63, 185, 80)" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path></svg>'

document.addEventListener("nav", () => {
  const els = document.getElementsByTagName("pre")
  for (let i = 0; i < els.length; i++) {
    const pre = els[i]
    const codeBlock = pre.getElementsByTagName("code")[0]
    if (codeBlock) {
      // I diagrammi Mermaid (```mermaid ... ```) ricevono la classe `mermaid`
      // sul <code> in ofm.ts (transformers). Non hanno senso da "copiare" come
      // sorgente — l'output renderizzato è un SVG — e cliccare sul diagramma
      // per copiare il codice DSL sottostante è anti-intuitivo. Skippiamo sia
      // il bottone che l'handler di click sul <pre>.
      if (codeBlock.classList.contains("mermaid")) continue

      const source = (
        codeBlock.dataset.clipboard ? JSON.parse(codeBlock.dataset.clipboard) : codeBlock.innerText
      ).replace(/\n\n/g, "\n")
      const button = document.createElement("button")
      button.className = "clipboard-button"
      button.type = "button"
      button.innerHTML = svgCopy
      button.ariaLabel = "Copy source"

      // Triggera la copia + feedback visivo. Usato sia dal click sul button
      // che dal click ovunque sul <pre> (vedi onPreClick sotto).
      function triggerCopy() {
        navigator.clipboard.writeText(source).then(
          () => {
            button.blur()
            button.innerHTML = svgCheck
            // Classe `copied` per lo stile verde + label "Copied!" via CSS
            // (vedi pre > .clipboard-button.copied in custom.scss).
            button.classList.add("copied")
            setTimeout(() => {
              button.innerHTML = svgCopy
              button.classList.remove("copied")
              button.style.borderColor = ""
            }, 2000)
          },
          (error) => console.error(error),
        )
      }

      function onClick() {
        triggerCopy()
      }

      // Click su una RIGA del code block = copia solo quella riga (il copy-all
      // resta compito del bottone in alto a destra). Skip se:
      //   - l'utente sta selezionando del testo (drag-to-select) → window.getSelection
      //   - il click è sul .clipboard-button stesso → lo gestisce il suo handler
      //   - il click è sul .expand-button di Mermaid → non c'entra
      //   - il click non atterra su uno span[data-line] (padding del pre, o code
      //     block non processato da rehype-pretty-code) → nessuna copia
      // Il feedback è locale: flash verde sulla riga copiata (classe
      // `line-copied`, stile in custom.scss), non sul bottone.
      function onPreClick(e: MouseEvent) {
        const target = e.target as Element
        if (target.closest(".clipboard-button")) return
        if (target.closest(".expand-button")) return
        const sel = window.getSelection()
        if (sel && sel.toString().length > 0) return

        const line = target.closest("code > span[data-line]") as HTMLElement | null
        if (!line) return
        // innerText di una riga vuota è "" o "\n": copiare il nulla svuoterebbe
        // la clipboard dell'utente senza motivo.
        const text = line.innerText.replace(/\n$/, "")
        if (text.trim() === "") return

        navigator.clipboard.writeText(text).then(
          () => {
            line.classList.add("line-copied")
            setTimeout(() => line.classList.remove("line-copied"), 800)
          },
          (error) => console.error(error),
        )
      }

      button.addEventListener("click", onClick)
      pre.addEventListener("click", onPreClick)
      window.addCleanup(() => {
        button.removeEventListener("click", onClick)
        pre.removeEventListener("click", onPreClick)
      })
      pre.prepend(button)
    }
  }
})
