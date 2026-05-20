import type { ContentDetails } from "../../plugins/emitters/contentIndex"
import {
  SimulationNodeDatum,
  SimulationLinkDatum,
  Simulation,
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceLink,
  forceCollide,
  forceRadial,
  zoomIdentity,
  select,
  drag,
  zoom,
} from "d3"
import { Text, Graphics, Application, Container, Circle } from "pixi.js"
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js"
import { registerEscapeHandler, removeAllChildren } from "./util"
import { FullSlug, SimpleSlug, getFullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { D3Config } from "../Graph"

type GraphicsInfo = {
  color: string
  gfx: Graphics
  alpha: number
  active: boolean
}

type NodeData = {
  id: SimpleSlug
  text: string
  tags: string[]
} & SimulationNodeDatum

type SimpleLinkData = {
  source: SimpleSlug
  target: SimpleSlug
}

type LinkData = {
  source: NodeData
  target: NodeData
} & SimulationLinkDatum<NodeData>

type LinkRenderData = GraphicsInfo & {
  simulationData: LinkData
}

type NodeRenderData = GraphicsInfo & {
  simulationData: NodeData
  label: Text
  isTag: boolean
  defaultFill: string
  defaultStroke?: string
  radius: number
}

const localStorageKey = "graph-visited"
function getVisited(): Set<SimpleSlug> {
  return new Set(JSON.parse(localStorage.getItem(localStorageKey) ?? "[]"))
}

function addToVisited(slug: SimpleSlug) {
  const visited = getVisited()
  visited.add(slug)
  localStorage.setItem(localStorageKey, JSON.stringify([...visited]))
}

type TweenNode = {
  update: (time: number) => void
  stop: () => void
}

async function renderGraph(graph: HTMLElement, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  removeAllChildren(graph)

  let {
    drag: enableDrag,
    zoom: enableZoom,
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    removeTags,
    showTags,
    focusOnHover,
    enableRadial,
    tagColors,
    currentNodeColor,
    showFilters,
  } = JSON.parse(graph.dataset["cfg"]!) as D3Config
  const tagColorMap: Record<string, string> = tagColors ?? {}

  const data: Map<SimpleSlug, ContentDetails> = new Map(
    Object.entries<ContentDetails>(await fetchData).map(([k, v]) => [
      simplifySlug(k as FullSlug),
      v,
    ]),
  )
  const links: SimpleLinkData[] = []
  const tags: SimpleSlug[] = []
  const validLinks = new Set(data.keys())

  const tweens = new Map<string, TweenNode>()
  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []

    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
      }
    }

    if (showTags) {
      const localTags = details.tags
        .filter((tag) => !removeTags.includes(tag))
        .map((tag) => simplifySlug(("tags/" + tag) as FullSlug))

      tags.push(...localTags.filter((tag) => !tags.includes(tag)))

      for (const tag of localTags) {
        links.push({ source: source, target: tag })
      }
    }
  }

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  if (depth >= 0) {
    while (depth >= 0 && wl.length > 0) {
      // compute neighbours
      const cur = wl.shift()!
      if (cur === "__SENTINEL") {
        depth--
        wl.push("__SENTINEL")
      } else {
        neighbourhood.add(cur)
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id))
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
  }

  const nodes = [...neighbourhood].map((url) => {
    const text = url.startsWith("tags/") ? "#" + url.substring(5) : (data.get(url)?.title ?? url)
    return {
      id: url,
      text,
      tags: data.get(url)?.tags ?? [],
    }
  })
  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes,
    links: links
      .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
      .map((l) => ({
        source: nodes.find((n) => n.id === l.source)!,
        target: nodes.find((n) => n.id === l.target)!,
      })),
  }

  const width = graph.offsetWidth
  const height = Math.max(graph.offsetHeight, 250)

  // we virtualize the simulation and use pixi to actually render it
  const simulation: Simulation<NodeData, LinkData> = forceSimulation<NodeData>(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance))
    .force("collide", forceCollide<NodeData>((n) => nodeRadius(n)).iterations(3))

  const radius = (Math.min(width, height) / 2) * 0.8
  if (enableRadial) simulation.force("radial", forceRadial(radius).strength(0.2))

  // precompute style prop strings as pixi doesn't support css variables
  const cssVars = [
    "--secondary",
    "--tertiary",
    "--gray",
    "--light",
    "--lightgray",
    "--dark",
    "--darkgray",
    "--bodyFont",
  ] as const
  const computedStyleMap = cssVars.reduce(
    (acc, key) => {
      acc[key] = getComputedStyle(document.documentElement).getPropertyValue(key)
      return acc
    },
    {} as Record<(typeof cssVars)[number], string>,
  )

  // calculate color
  const currentColor = currentNodeColor ?? computedStyleMap["--secondary"]
  const color = (d: NodeData) => {
    const isCurrent = d.id === slug
    if (isCurrent) {
      return currentColor
    }
    if (d.id.startsWith("tags/")) {
      const tagName = d.id.substring("tags/".length)
      return tagColorMap[tagName] ?? computedStyleMap["--tertiary"]
    }
    if (visited.has(d.id)) {
      return computedStyleMap["--tertiary"]
    }
    return computedStyleMap["--gray"]
  }

  function nodeRadius(d: NodeData) {
    const numLinks = graphData.links.filter(
      (l) => l.source.id === d.id || l.target.id === d.id,
    ).length
    return 2 + Math.sqrt(numLinks)
  }

  let hoveredNodeId: string | null = null
  let hoveredNeighbours: Set<string> = new Set()
  const linkRenderData: LinkRenderData[] = []
  const nodeRenderData: NodeRenderData[] = []
  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId

    if (newHoveredId === null) {
      hoveredNeighbours = new Set()
      for (const n of nodeRenderData) {
        n.active = false
      }

      for (const l of linkRenderData) {
        l.active = false
      }
    } else {
      hoveredNeighbours = new Set()
      for (const l of linkRenderData) {
        const linkData = l.simulationData
        if (linkData.source.id === newHoveredId || linkData.target.id === newHoveredId) {
          hoveredNeighbours.add(linkData.source.id)
          hoveredNeighbours.add(linkData.target.id)
        }

        l.active = linkData.source.id === newHoveredId || linkData.target.id === newHoveredId
      }

      for (const n of nodeRenderData) {
        n.active = hoveredNeighbours.has(n.simulationData.id)
      }
    }
  }

  let dragStartTime = 0
  let dragging = false

  // Long press touch: tenere premuto un nodo (>LONG_PRESS_MS) attiva
  // l'highlight come l'hover desktop e impedisce la navigazione al rilascio.
  // Tap rapido continua a navigare normalmente (gestito dal drag end di d3).
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressActive = false
  const LONG_PRESS_MS = 400
  function clearLongPressTimer() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  // Ridisegna un Graphics di un nodo con i parametri richiesti. Pixi Graphics non
  // supporta cambiare fill/stroke a posteriori: bisogna fare clear + ridisegnare.
  function drawNode(gfx: Graphics, r: number, fill: string, stroke?: string) {
    gfx.clear().circle(0, 0, r).fill({ color: fill })
    if (stroke) {
      gfx.stroke({ width: 2, color: stroke })
    }
  }

  // Se l'hover è su un tag che ha un colore custom, ritorna quel colore;
  // altrimenti null. Usato per tingere link e vicini durante l'hover.
  function getHoveredTagColor(): string | null {
    if (hoveredNodeId === null || !hoveredNodeId.startsWith("tags/")) return null
    return tagColorMap[hoveredNodeId.substring("tags/".length)] ?? null
  }

  function renderLinks() {
    tweens.get("link")?.stop()
    const tweenGroup = new TweenGroup()
    const hoverTagColor = getHoveredTagColor()

    for (const l of linkRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      // with full alpha and the rest with default alpha
      if (hoveredNodeId) {
        alpha = l.active ? 1 : 0.2
      }

      if (l.active) {
        l.color = hoverTagColor ?? computedStyleMap["--gray"]
      } else {
        l.color = computedStyleMap["--lightgray"]
      }
      tweenGroup.add(new Tweened<LinkRenderData>(l).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("link", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderLabels() {
    tweens.get("label")?.stop()
    const tweenGroup = new TweenGroup()

    const defaultScale = 1 / scale
    const activeScale = defaultScale * 1.1
    for (const n of nodeRenderData) {
      const nodeId = n.simulationData.id

      if (hoveredNodeId === nodeId) {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: 1,
              scale: { x: activeScale, y: activeScale },
            },
            100,
          ),
        )
      } else {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: n.label.alpha,
              scale: { x: defaultScale, y: defaultScale },
            },
            100,
          ),
        )
      }
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("label", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderNodes() {
    tweens.get("hover")?.stop()
    const hoverTagColor = getHoveredTagColor()

    const tweenGroup = new TweenGroup()
    for (const n of nodeRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      if (hoveredNodeId !== null && focusOnHover) {
        alpha = n.active ? 1 : 0.2
      }

      // Quando l'hover è su un tag con colore custom, tingiamo i suoi vicini con
      // quel colore: le note (cerchi pieni) cambiano fill, eventuali altri tag
      // vicini cambiano stroke. Il tag hovered mantiene il proprio aspetto.
      const isHoveredNode = n.simulationData.id === hoveredNodeId
      const shouldTint = hoverTagColor !== null && n.active && !isHoveredNode
      if (shouldTint) {
        if (n.isTag) {
          drawNode(n.gfx, n.radius, n.defaultFill, hoverTagColor!)
        } else {
          drawNode(n.gfx, n.radius, hoverTagColor!, n.defaultStroke)
        }
      } else {
        drawNode(n.gfx, n.radius, n.defaultFill, n.defaultStroke)
      }

      tweenGroup.add(new Tweened<Graphics>(n.gfx, tweenGroup).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("hover", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderPixiFromD3() {
    renderNodes()
    renderLinks()
    renderLabels()
  }

  tweens.forEach((tween) => tween.stop())
  tweens.clear()

  const app = new Application()
  await app.init({
    width,
    height,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgpu",
    resolution: window.devicePixelRatio,
    eventMode: "static",
  })
  graph.appendChild(app.canvas)

  const stage = app.stage
  stage.interactive = false

  const labelsContainer = new Container<Text>({ zIndex: 3, isRenderGroup: true })
  const nodesContainer = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
  const linkContainer = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })
  stage.addChild(nodesContainer, labelsContainer, linkContainer)

  for (const n of graphData.nodes) {
    const nodeId = n.id

    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.text,
      alpha: 0,
      anchor: { x: 0.5, y: 1.2 },
      style: {
        fontSize: fontSize * 15,
        fill: computedStyleMap["--dark"],
        fontFamily: computedStyleMap["--bodyFont"],
      },
      resolution: window.devicePixelRatio * 4,
    })
    label.scale.set(1 / scale)

    let oldLabelOpacity = 0
    const isTagNode = nodeId.startsWith("tags/")
    const isCurrentNode = nodeId === slug
    const customTagColor = isTagNode
      ? tagColorMap[nodeId.substring("tags/".length)]
      : undefined
    // I tag restano sempre cerchi "vuoti" (fill --light) per essere riconoscibili
    // come tag. Il colore custom — se presente — finisce sul bordo. Se il tag è
    // la pagina corrente, il bordo prende il currentColor per spiccare.
    const defaultFill = isTagNode ? computedStyleMap["--light"] : color(n)
    const defaultStroke = isTagNode
      ? (isCurrentNode
          ? currentColor
          : (customTagColor ?? computedStyleMap["--tertiary"]))
      : undefined
    const radius = nodeRadius(n)
    const gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, radius),
      cursor: "pointer",
    })
      .on("pointerover", (e) => {
        updateHoverInfo(e.target.label)
        oldLabelOpacity = label.alpha
        if (!dragging) {
          renderPixiFromD3()
        }
      })
      .on("pointerdown", (e) => {
        // Su touch il pointerover non scatta (o scatta e poi pointerleave
        // arriva subito al touchend). Attiviamo qui il long press timer:
        // se l'utente tiene premuto >LONG_PRESS_MS mostriamo l'highlight e
        // saltiamo la navigazione al rilascio.
        // Settiamo anche subito hoveredNodeId, altrimenti il drag d3 non
        // trova il subject e la navigazione non parte nemmeno con tap rapido.
        const targetId = e.target.label as string
        if (hoveredNodeId !== targetId) {
          updateHoverInfo(targetId)
          oldLabelOpacity = label.alpha
          if (!dragging) {
            renderPixiFromD3()
          }
        }
        if (e.pointerType === "touch") {
          clearLongPressTimer()
          longPressActive = false
          longPressTimer = setTimeout(() => {
            longPressActive = true
            longPressTimer = null
            // Re-render per assicurarsi che l'highlight sia visibile
            // (in caso il dragging fosse iniziato e l'avesse oscurato).
            updateHoverInfo(targetId)
            if (!dragging) {
              renderPixiFromD3()
            }
          }, LONG_PRESS_MS)
        }
      })
      .on("pointerup", clearLongPressTimer)
      .on("pointerupoutside", clearLongPressTimer)
      .on("pointerleave", () => {
        clearLongPressTimer()
        // Se il long press è attivo (utente ha tenuto premuto e poi rilasciato),
        // manteniamo l'highlight visibile finché un altro nodo non viene
        // selezionato — così il colore dei vicini resta osservabile dopo il
        // rilascio del dito su mobile.
        if (longPressActive) return
        updateHoverInfo(null)
        label.alpha = oldLabelOpacity
        if (!dragging) {
          renderPixiFromD3()
        }
      })
    drawNode(gfx, radius, defaultFill, defaultStroke)

    nodesContainer.addChild(gfx)
    labelsContainer.addChild(label)

    const nodeRenderDatum: NodeRenderData = {
      simulationData: n,
      gfx,
      label,
      color: color(n),
      alpha: 1,
      active: false,
      isTag: isTagNode,
      defaultFill,
      defaultStroke,
      radius,
    }

    nodeRenderData.push(nodeRenderDatum)
  }

  for (const l of graphData.links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" })
    linkContainer.addChild(gfx)

    const linkRenderDatum: LinkRenderData = {
      simulationData: l,
      gfx,
      color: computedStyleMap["--lightgray"],
      alpha: 1,
      active: false,
    }

    linkRenderData.push(linkRenderDatum)
  }

  // ── FILTRI (solo se showFilters: true nel D3Config) ─────────────────────
  // Multi-select tag + checkbox "hide orphan nodes" sopra al canvas. Filtraggio
  // "soft": nasconde nodi/link via gfx.visible senza ricostruire la simulation
  // (i nodi nascosti continuano a contribuire al layout d3-force).
  if (showFilters) {
    const graphRoot = graph.closest(".graph") as HTMLElement | null
    const filtersEl = graphRoot?.querySelector(".graph-filters") as HTMLElement | null
    if (filtersEl) {
      const tagsListEl = filtersEl.querySelector(
        ".graph-filter-tags-list",
      ) as HTMLElement | null
      const tagsCountEl = filtersEl.querySelector(
        ".graph-filter-tags-count",
      ) as HTMLElement | null
      const orphanInput = filtersEl.querySelector(
        ".graph-filter-orphans input",
      ) as HTMLInputElement | null
      const resetBtn = filtersEl.querySelector(
        ".graph-filter-reset",
      ) as HTMLButtonElement | null

      const availableTags = graphData.nodes
        .filter((n) => n.id.startsWith("tags/"))
        .map((n) => ({ id: n.id, name: n.id.substring("tags/".length) }))
        .sort((a, b) => a.name.localeCompare(b.name))

      if (tagsListEl) {
        tagsListEl.innerHTML = availableTags
          .map(
            (t) =>
              `<label><input type="checkbox" value="${t.id}"><span>#${t.name}</span></label>`,
          )
          .join("")
      }

      const linkSourceId = (s: NodeData["id"] | NodeData) =>
        typeof s === "string" ? s : s.id

      function applyFilters() {
        const selectedTags = tagsListEl
          ? Array.from(
              tagsListEl.querySelectorAll<HTMLInputElement>("input:checked"),
            ).map((i) => i.value)
          : []
        const hideOrphans = orphanInput?.checked ?? false

        const visible = new Map<string, boolean>()

        if (selectedTags.length === 0) {
          for (const n of graphData.nodes) visible.set(n.id, true)
        } else {
          const allowed = new Set<string>(selectedTags)
          for (const l of graphData.links) {
            const sId = linkSourceId(l.source as NodeData["id"] | NodeData)
            const tId = linkSourceId(l.target as NodeData["id"] | NodeData)
            if (selectedTags.includes(sId) || selectedTags.includes(tId)) {
              allowed.add(sId)
              allowed.add(tId)
            }
          }
          for (const n of graphData.nodes) visible.set(n.id, allowed.has(n.id))
        }

        if (hideOrphans) {
          const linked = new Set<string>()
          for (const l of graphData.links) {
            const sId = linkSourceId(l.source as NodeData["id"] | NodeData)
            const tId = linkSourceId(l.target as NodeData["id"] | NodeData)
            if (visible.get(sId) && visible.get(tId)) {
              linked.add(sId)
              linked.add(tId)
            }
          }
          for (const n of graphData.nodes) {
            if (!linked.has(n.id)) visible.set(n.id, false)
          }
        }

        for (const n of nodeRenderData) {
          const v = visible.get(n.simulationData.id) ?? true
          n.gfx.visible = v
          n.label.visible = v
          n.gfx.eventMode = v ? "static" : "none"
        }
        for (const l of linkRenderData) {
          const sId = linkSourceId(
            l.simulationData.source as NodeData["id"] | NodeData,
          )
          const tId = linkSourceId(
            l.simulationData.target as NodeData["id"] | NodeData,
          )
          l.gfx.visible = (visible.get(sId) ?? true) && (visible.get(tId) ?? true)
        }
      }

      function updateTagCount() {
        if (!tagsCountEl || !tagsListEl) return
        const n = tagsListEl.querySelectorAll<HTMLInputElement>(
          "input:checked",
        ).length
        tagsCountEl.textContent = n === 0 ? "All" : `${n} selected`
        tagsCountEl.dataset.empty = n === 0 ? "true" : "false"
      }

      tagsListEl?.addEventListener("change", () => {
        updateTagCount()
        applyFilters()
      })
      orphanInput?.addEventListener("change", applyFilters)
      resetBtn?.addEventListener("click", () => {
        tagsListEl
          ?.querySelectorAll<HTMLInputElement>("input")
          .forEach((i) => (i.checked = false))
        if (orphanInput) orphanInput.checked = false
        updateTagCount()
        applyFilters()
      })

      updateTagCount()
    }
  }

  let currentTransform = zoomIdentity
  if (enableDrag) {
    select<HTMLCanvasElement, NodeData | undefined>(app.canvas).call(
      drag<HTMLCanvasElement, NodeData | undefined>()
        .container(() => app.canvas)
        .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
        .on("start", function dragstarted(event) {
          if (!event.active) simulation.alphaTarget(1).restart()
          event.subject.fx = event.subject.x
          event.subject.fy = event.subject.y
          event.subject.__initialDragPos = {
            x: event.subject.x,
            y: event.subject.y,
            fx: event.subject.fx,
            fy: event.subject.fy,
          }
          dragStartTime = Date.now()
          dragging = true
        })
        .on("drag", function dragged(event) {
          const initPos = event.subject.__initialDragPos
          event.subject.fx = initPos.x + (event.x - initPos.x) / currentTransform.k
          event.subject.fy = initPos.y + (event.y - initPos.y) / currentTransform.k
        })
        .on("end", function dragended(event) {
          if (!event.active) simulation.alphaTarget(0)
          event.subject.fx = null
          event.subject.fy = null
          dragging = false
          clearLongPressTimer()

          // if the time between mousedown and mouseup is short, we consider it a click
          // — ma se il long press è scattato (touch) non navighiamo: l'utente
          // voleva vedere l'highlight, non aprire la pagina.
          const isClick = Date.now() - dragStartTime < 500
          if (isClick && !longPressActive) {
            const node = graphData.nodes.find((n) => n.id === event.subject.id) as NodeData
            const targ = resolveRelative(fullSlug, node.id)
            window.spaNavigate(new URL(targ, window.location.toString()))
          }
        }),
    )
  } else {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () => {
        const targ = resolveRelative(fullSlug, node.simulationData.id)
        window.spaNavigate(new URL(targ, window.location.toString()))
      })
    }
  }

  if (enableZoom) {
    select<HTMLCanvasElement, NodeData>(app.canvas).call(
      zoom<HTMLCanvasElement, NodeData>()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }) => {
          currentTransform = transform
          stage.scale.set(transform.k, transform.k)
          stage.position.set(transform.x, transform.y)

          // zoom adjusts opacity of labels too
          const scale = transform.k * opacityScale
          let scaleOpacity = Math.max((scale - 1) / 3.75, 0)
          const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label)

          for (const label of labelsContainer.children) {
            if (!activeNodes.includes(label)) {
              label.alpha = scaleOpacity
            }
          }
        }),
    )
  }

  let stopAnimation = false
  function animate(time: number) {
    if (stopAnimation) return
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData
      if (!x || !y) continue
      n.gfx.position.set(x + width / 2, y + height / 2)
      if (n.label) {
        n.label.position.set(x + width / 2, y + height / 2)
      }
    }

    for (const l of linkRenderData) {
      const linkData = l.simulationData
      l.gfx.clear()
      l.gfx.moveTo(linkData.source.x! + width / 2, linkData.source.y! + height / 2)
      l.gfx
        .lineTo(linkData.target.x! + width / 2, linkData.target.y! + height / 2)
        .stroke({ alpha: l.alpha, width: 1, color: l.color })
    }

    tweens.forEach((t) => t.update(time))
    app.renderer.render(stage)
    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)
  return () => {
    stopAnimation = true
    app.destroy()
  }
}

let localGraphCleanups: (() => void)[] = []
let globalGraphCleanups: (() => void)[] = []

function cleanupLocalGraphs() {
  for (const cleanup of localGraphCleanups) {
    cleanup()
  }
  localGraphCleanups = []
}

function cleanupGlobalGraphs() {
  for (const cleanup of globalGraphCleanups) {
    cleanup()
  }
  globalGraphCleanups = []
}

// Toggle del popup "info connessioni" sopra il mini-graph della sidebar.
// Click sull'icona info → toggle classe .open sul .info-graph-popup adiacente.
// Click ovunque fuori dall'icona/popup → chiudi tutti i popup aperti.
// Esc → idem.
function setupInfoButton() {
  const buttons = document.querySelectorAll<HTMLElement>(".info-graph-icon")
  if (buttons.length === 0) return

  const closeAll = () => {
    for (const popup of document.querySelectorAll<HTMLElement>(".info-graph-popup.open")) {
      popup.classList.remove("open")
      popup.setAttribute("aria-hidden", "true")
    }
  }

  for (const btn of buttons) {
    const popup = btn.nextElementSibling as HTMLElement | null
    if (!popup || !popup.classList.contains("info-graph-popup")) continue
    const onClick = (e: Event) => {
      e.stopPropagation()
      const isOpen = popup.classList.toggle("open")
      popup.setAttribute("aria-hidden", isOpen ? "false" : "true")
    }
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }

  const onDocClick = (e: MouseEvent) => {
    const t = e.target as Element
    if (!t.closest(".info-graph-icon") && !t.closest(".info-graph-popup")) {
      closeAll()
    }
  }
  document.addEventListener("click", onDocClick)
  window.addCleanup(() => document.removeEventListener("click", onDocClick))

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeAll()
  }
  document.addEventListener("keydown", onKey)
  window.addCleanup(() => document.removeEventListener("keydown", onKey))
}

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const slug = e.detail.url
  addToVisited(simplifySlug(slug))

  async function renderLocalGraph() {
    cleanupLocalGraphs()
    const localGraphContainers = document.getElementsByClassName("graph-container")
    for (const container of localGraphContainers) {
      localGraphCleanups.push(await renderGraph(container as HTMLElement, slug))
    }
  }

  await renderLocalGraph()
  setupInfoButton()
  const handleThemeChange = () => {
    void renderLocalGraph()
  }

  document.addEventListener("themechange", handleThemeChange)
  window.addCleanup(() => {
    document.removeEventListener("themechange", handleThemeChange)
  })

  // Re-render dei grafi quando la sidebar sinistra viene mostrata/nascosta:
  // la grid si ricomponee i container cambiano larghezza, ma il canvas Pixi
  // resta dimensionato sul vecchio layout. requestAnimationFrame attende che
  // il browser abbia applicato il nuovo grid prima di rimisurare offsetWidth.
  const handleSidebarToggle = () => {
    requestAnimationFrame(() => {
      void renderLocalGraph()
    })
  }
  window.addEventListener("sidebartoggled", handleSidebarToggle)
  window.addCleanup(() => {
    window.removeEventListener("sidebartoggled", handleSidebarToggle)
  })

  // Re-render anche su window.resize: aprire/chiudere DevTools, ruotare
  // un tablet, cambiare layout responsive… qualunque cambio di larghezza
  // della finestra ridimensiona il container ma il canvas Pixi resta sulla
  // misura vecchia. Debounce a 250ms per evitare spam durante il drag.
  let resizeTimer: number | undefined
  const handleResize = () => {
    if (resizeTimer) window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      void renderLocalGraph()
    }, 250)
  }
  window.addEventListener("resize", handleResize)
  window.addCleanup(() => {
    if (resizeTimer) window.clearTimeout(resizeTimer)
    window.removeEventListener("resize", handleResize)
  })

  const containers = [...document.getElementsByClassName("global-graph-outer")] as HTMLElement[]
  async function renderGlobalGraph() {
    const slug = getFullSlug(window)
    for (const container of containers) {
      container.classList.add("active")
      const sidebar = container.closest(".sidebar") as HTMLElement
      if (sidebar) {
        sidebar.style.zIndex = "1"
      }

      const graphContainer = container.querySelector(".global-graph-container") as HTMLElement
      registerEscapeHandler(container, hideGlobalGraph)
      if (graphContainer) {
        globalGraphCleanups.push(await renderGraph(graphContainer, slug))
      }
    }
  }

  function hideGlobalGraph() {
    cleanupGlobalGraphs()
    for (const container of containers) {
      container.classList.remove("active")
      const sidebar = container.closest(".sidebar") as HTMLElement
      if (sidebar) {
        sidebar.style.zIndex = ""
      }
    }
  }

  async function shortcutHandler(e: HTMLElementEventMap["keydown"]) {
    if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      const anyGlobalGraphOpen = containers.some((container) =>
        container.classList.contains("active"),
      )
      anyGlobalGraphOpen ? hideGlobalGraph() : renderGlobalGraph()
    }
  }

  const containerIcons = document.getElementsByClassName("global-graph-icon")
  Array.from(containerIcons).forEach((icon) => {
    icon.addEventListener("click", renderGlobalGraph)
    window.addCleanup(() => icon.removeEventListener("click", renderGlobalGraph))
  })

  document.addEventListener("keydown", shortcutHandler)
  window.addCleanup(() => {
    document.removeEventListener("keydown", shortcutHandler)
    cleanupLocalGraphs()
    cleanupGlobalGraphs()
  })
})
