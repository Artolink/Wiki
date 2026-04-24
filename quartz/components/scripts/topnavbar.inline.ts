document.addEventListener("nav", () => {
  // Proxy search button
  const topSearch = document.getElementById("topnav-search-btn")
  const realSearch = document.querySelector<HTMLElement>(".search > .search-button")
  if (topSearch && realSearch) {
    topSearch.addEventListener("click", () => realSearch.click())
    window.addCleanup(() => topSearch.removeEventListener("click", () => realSearch.click()))
  }

  // Proxy darkmode button
  const topDark = document.getElementById("topnav-dark-btn")
  const realDark = document.querySelector<HTMLElement>("button.darkmode")
  if (topDark && realDark) {
    topDark.addEventListener("click", () => realDark.click())
    window.addCleanup(() => topDark.removeEventListener("click", () => realDark.click()))
  }

  // Proxy focusmode button
  const topFocus = document.getElementById("topnav-focus-btn")
  const realFocus = document.querySelector<HTMLElement>("button.focusmode")
  if (topFocus && realFocus) {
    topFocus.addEventListener("click", () => realFocus.click())
    window.addCleanup(() => topFocus.removeEventListener("click", () => realFocus.click()))
  }
})
