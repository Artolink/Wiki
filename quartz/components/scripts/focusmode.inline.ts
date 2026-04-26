let isFocusMode = false

document.addEventListener("nav", () => {
  // Sincronizza l'attributo DOM con lo stato corrente all'inizio di ogni navigazione
  document.documentElement.setAttribute("focus-mode", isFocusMode ? "on" : "off")

  function toggle() {
    isFocusMode = !isFocusMode
    document.documentElement.setAttribute("focus-mode", isFocusMode ? "on" : "off")
  }

  for (const btn of document.getElementsByClassName("focusmode")) {
    btn.addEventListener("click", toggle)
    window.addCleanup(() => btn.removeEventListener("click", toggle))
  }
})
