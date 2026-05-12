// Page progress widget — counts checked vs total `input.checkbox-toggle` in
// the page and reflects the ratio in a floating pill. Persistence of the
// checkbox state is handled by checkbox.inline.ts (localStorage); here we
// only read the DOM. A green toast + permanent green tick announce 100%.

const TOAST_DURATION_MS = 3000
const TOAST_CLASS = "page-progress-toast"

// Track wether we've already showed the "complete!" toast for the *current*
// page. Reset on every nav event. Without this the toast fires every time
// the user revisits a page that's already at 100%.
let toastShownForThisPage = false

function ensureToastEl(): HTMLElement {
  let el = document.querySelector("." + TOAST_CLASS) as HTMLElement | null
  if (!el) {
    el = document.createElement("div")
    el.className = TOAST_CLASS
    el.setAttribute("role", "status")
    el.setAttribute("aria-live", "polite")
    document.body.appendChild(el)
  }
  return el
}

function showToast(message: string) {
  const el = ensureToastEl()
  el.textContent = message
  // Force reflow so re-adding the class re-triggers the transition even if
  // the toast was still visible.
  el.classList.remove("visible")
  void el.offsetWidth
  el.classList.add("visible")
  window.setTimeout(() => {
    el.classList.remove("visible")
  }, TOAST_DURATION_MS)
}

document.addEventListener("nav", () => {
  const root = document.querySelector(".page-progress") as HTMLElement | null
  if (!root) return

  toastShownForThisPage = false

  const counterEl = root.querySelector(".page-progress-counter") as HTMLElement
  const percentEl = root.querySelector(".page-progress-percent") as HTMLElement
  const fillEl = root.querySelector(".page-progress-bar-fill") as HTMLElement
  const pillEl = root.querySelector(".page-progress-pill") as HTMLElement

  // Only checkboxes inside the article content. Excludes the topbar/sidebars
  // (none have checkboxes today, but future-proofs against accidental inclusion).
  const collectCheckboxes = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(
        ".center input.checkbox-toggle",
      ),
    )

  function update(animatePulse: boolean) {
    const all = collectCheckboxes()
    const total = all.length

    // No checkboxes on this page: keep the widget hidden.
    if (total === 0) {
      root!.setAttribute("data-progress-visible", "false")
      root!.classList.remove("completed")
      return
    }

    const checked = all.filter((c) => c.checked).length
    const pct = Math.round((checked / total) * 100)
    const isCompleted = checked === total

    root!.setAttribute("data-progress-visible", "true")
    counterEl.textContent = `${checked}/${total}`
    percentEl.textContent = `${pct}%`
    fillEl.style.width = `${pct}%`

    if (isCompleted) {
      root!.classList.add("completed")
      if (!toastShownForThisPage) {
        toastShownForThisPage = true
        showToast("Guide complete! ✓")
      }
    } else {
      root!.classList.remove("completed")
      // If the user un-checks something after a 100%, allow the toast to
      // fire again the next time they reach 100% on this page.
      toastShownForThisPage = false
    }

    if (animatePulse) {
      pillEl.classList.remove("pulse")
      void pillEl.offsetWidth
      pillEl.classList.add("pulse")
    }
  }

  function onCheckboxChange() {
    update(true)
  }

  const checkboxes = collectCheckboxes()
  for (const cb of checkboxes) {
    cb.addEventListener("change", onCheckboxChange)
    window.addCleanup(() => cb.removeEventListener("change", onCheckboxChange))
  }

  // Initial render: no pulse, no toast on already-completed pages.
  // We pre-flag toastShownForThisPage=true if we land on 100% so it doesn't
  // fire on simple page-load.
  const initialAll = checkboxes
  const initialChecked = initialAll.filter((c) => c.checked).length
  if (initialAll.length > 0 && initialChecked === initialAll.length) {
    toastShownForThisPage = true
  }
  update(false)
})
