let isFocusMode = false

document.addEventListener("nav", () => {
  // Sincronizza l'attributo DOM con lo stato corrente all'inizio di ogni navigazione
  document.documentElement.setAttribute("focus-mode", isFocusMode ? "on" : "off")

  function toggle() {
    isFocusMode = !isFocusMode
    document.documentElement.setAttribute("focus-mode", isFocusMode ? "on" : "off")
    // Cambiare il focus mode nasconde/mostra le sidebar e ricompone il grid:
    // riemettiamo lo stesso evento del sidebar toggle così componenti come il
    // graph (canvas Pixi) si re-misurano e ridisegnano sulle nuove dimensioni.
    window.dispatchEvent(new CustomEvent("sidebartoggled"))
  }

  for (const btn of document.getElementsByClassName("focusmode")) {
    btn.addEventListener("click", toggle)
    window.addCleanup(() => btn.removeEventListener("click", toggle))
  }
})
