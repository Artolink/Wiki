let isFocusMode = false

function createFocusBar(onExit: () => void): HTMLDivElement {
  const bar = document.createElement("div")
  bar.className = "focusmode-bar"

  // Proxy del bottone darkmode: clicca sull'originale nascosto
  const originalDarkmode = document.querySelector("button.darkmode") as HTMLButtonElement | null
  if (originalDarkmode) {
    const dmProxy = originalDarkmode.cloneNode(true) as HTMLButtonElement
    dmProxy.addEventListener("click", () => originalDarkmode.click())
    bar.appendChild(dmProxy)
  }

  // Bottone per uscire dalla focus mode
  const exitBtn = document.createElement("button")
  exitBtn.className = "focusmode-exit"
  exitBtn.title = "Esci dalla modalità focus"
  exitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <rect x="1" y="3" width="4" height="18" rx="1"/>
    <rect x="7" y="3" width="10" height="18" rx="1"/>
    <rect x="19" y="3" width="4" height="18" rx="1"/>
  </svg>`
  exitBtn.addEventListener("click", onExit)
  bar.appendChild(exitBtn)

  return bar
}

document.addEventListener("nav", () => {
  document.querySelector(".focusmode-bar")?.remove()

  if (isFocusMode) {
    document.documentElement.setAttribute("focus-mode", "on")
    const bar = createFocusBar(deactivate)
    document.body.appendChild(bar)
    window.addCleanup(() => bar.remove())
  } else {
    document.documentElement.setAttribute("focus-mode", "off")
  }

  function activate() {
    isFocusMode = true
    document.documentElement.setAttribute("focus-mode", "on")
    const bar = createFocusBar(deactivate)
    document.body.appendChild(bar)
    window.addCleanup(() => bar.remove())
  }

  function deactivate() {
    isFocusMode = false
    document.documentElement.setAttribute("focus-mode", "off")
    document.querySelector(".focusmode-bar")?.remove()
  }

  for (const btn of document.getElementsByClassName("focusmode")) {
    btn.addEventListener("click", activate)
    window.addCleanup(() => btn.removeEventListener("click", activate))
  }
})
