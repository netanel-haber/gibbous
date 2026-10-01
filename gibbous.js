// One content script for three places, each section guarded by where it runs:
// GitHub's theme mirrored to the Gibbous site (both sites), the Mermaid viewer frame GitHub
// embeds (zoom and pan once enlarged), and GitHub itself.

(() => {
  const themes = new Set([
    "light",
    "light-high-contrast",
    "light-colorblind",
    "light-colorblind-high-contrast",
    "dark",
    "dark-high-contrast",
    "dark-colorblind",
    "dark-colorblind-high-contrast",
    "dark-dimmed",
    "dark-dimmed-high-contrast",
  ]);
  const root = document.documentElement;

  const exposeStoredTheme = async () => {
    const {githubTheme} = await chrome.storage.local.get("githubTheme");
    if (themes.has(githubTheme)) root.dataset.githubTheme = githubTheme;
    chrome.storage.onChanged.addListener((changes, area) => {
      const theme = changes.githubTheme?.newValue;
      if (area === "local" && themes.has(theme)) root.dataset.githubTheme = theme;
    });
  };

  const activeGitHubTheme = () => {
    const colorMode = root.dataset.colorMode;
    const mode = colorMode === "auto"
      ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : colorMode;
    return root.dataset[`${mode}Theme`]?.replaceAll("_", "-");
  };

  const storeGitHubTheme = async () => {
    const theme = activeGitHubTheme();
    if (themes.has(theme)) await chrome.storage.local.set({githubTheme: theme});
  };

  const main = async () => {
    if (location.hostname === "netanel-haber.github.io") {
      await exposeStoredTheme();
      return;
    }
    if (location.hostname !== "github.com") return;
    new MutationObserver(() => void storeGitHubTheme()).observe(root, {
      attributes: true,
      attributeFilter: ["data-color-mode", "data-light-theme", "data-dark-theme"],
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => void storeGitHubTheme());
    await storeGitHubTheme();
  };

  void main().catch(error => console.error("Gibbous could not synchronize the GitHub theme.", error));
})();

(() => {
  if (location.hostname !== "viewscreen.githubusercontent.com" || !document.referrer) return;
  const parentOrigin = new URL(document.referrer).origin;
  const MAX_SCALE = 8;
  const PADDING = 48;
  const VISIBLE_EDGE = 96;
  const ZOOM_STEP = 1.25;
  const DOUBLE_CLICK_ZOOM = 1.6;
  const root = document.documentElement;
  let expanded = false;
  let scale = 1;
  let fitScale = 1;
  let x = 0;
  let y = 0;
  let width = 0;
  let height = 0;
  let drag;
  let controls;
  let zoomLabel;

  const svg = () => document.querySelector(".mermaid-view svg");
  const stage = () => svg()?.parentElement;
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
  const clampScale = value => clamp(value, fitScale / 2, MAX_SCALE);

  const measure = () => {
    const diagram = svg();
    const box = diagram?.viewBox?.baseVal;
    width = box?.width || diagram?.getBoundingClientRect().width || 0;
    height = box?.height || diagram?.getBoundingClientRect().height || 0;
    return width > 0 && height > 0;
  };

  const apply = animate => {
    const target = stage();
    if (!target) return;
    target.classList.toggle("gibbous-animate", animate);
    target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };

  // Moves the diagram, keeping at least VISIBLE_EDGE of it on screen.
  const place = (nextX, nextY, animate) => {
    x = clamp(nextX, VISIBLE_EDGE - width * scale, innerWidth - VISIBLE_EDGE);
    y = clamp(nextY, VISIBLE_EDGE - height * scale, innerHeight - VISIBLE_EDGE);
    apply(animate);
  };

  const fit = animate => {
    if (!measure()) return;
    const target = stage();
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    svg().style.transform = "";
    fitScale = Math.min((innerWidth - 2 * PADDING) / width, (innerHeight - 2 * PADDING) / height, MAX_SCALE);
    scale = fitScale;
    x = (innerWidth - width * scale) / 2;
    y = (innerHeight - height * scale) / 2;
    apply(animate);
  };

  const zoomAt = (factor, clientX, clientY, animate = true) => {
    const next = clampScale(scale * factor);
    const ratio = next / scale;
    scale = next;
    place(clientX - (clientX - x) * ratio, clientY - (clientY - y) * ratio, animate);
  };

  const button = (label, text, onclick) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "btn";
    node.setAttribute("aria-label", label);
    node.title = label;
    node.textContent = text;
    node.addEventListener("click", onclick);
    return node;
  };

  const mountControls = () => {
    if (controls) return;
    controls = document.createElement("div");
    controls.className = "gibbous-mermaid-controls";
    zoomLabel = button("Fit to view", "100%", () => fit(true));
    zoomLabel.classList.add("gibbous-zoom-level");
    controls.append(
      button("Zoom out", "−", () => zoomAt(1 / ZOOM_STEP, innerWidth / 2, innerHeight / 2)),
      zoomLabel,
      button("Zoom in", "+", () => zoomAt(ZOOM_STEP, innerWidth / 2, innerHeight / 2)),
    );
    document.body.append(controls);
  };

  const collapse = () => {
    const target = stage();
    if (target) {
      target.classList.remove("gibbous-animate");
      target.style.removeProperty("transform");
      target.style.removeProperty("width");
      target.style.removeProperty("height");
    }
    drag = undefined;
    root.removeAttribute("data-gibbous-mermaid-dragging");
  };

  const setExpanded = value => {
    expanded = value;
    root.toggleAttribute("data-gibbous-mermaid-expanded", expanded);
    if (!expanded) return collapse();
    mountControls();
    requestAnimationFrame(() => fit(false));
  };

  addEventListener("message", event => {
    if (event.source !== parent || event.origin !== parentOrigin
      || event.data?.type !== "gibbous-mermaid-expanded") return;
    setExpanded(Boolean(event.data.value));
  });

  // GitHub re-renders the diagram when the frame is resized; refit when it does.
  new MutationObserver(() => {
    if (expanded) requestAnimationFrame(() => fit(false));
  }).observe(document.querySelector(".mermaid-view") ?? document.body, {childList: true});
  addEventListener("resize", () => {
    if (expanded) fit(false);
  });

  const onDiagram = event => {
    const target = event.target instanceof Element && event.target;
    return expanded && target && !target.closest("a, .clickable, button");
  };

  addEventListener("dblclick", event => {
    if (!onDiagram(event)) return;
    event.preventDefault();
    zoomAt(DOUBLE_CLICK_ZOOM, event.clientX, event.clientY);
  });

  addEventListener("wheel", event => {
    if (!expanded) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0025));
    zoomAt(factor, event.clientX, event.clientY, false);
  }, {passive: false});

  addEventListener("keydown", event => {
    if (!expanded || event.altKey || event.metaKey) return;
    const center = [innerWidth / 2, innerHeight / 2];
    const step = event.shiftKey ? 240 : 80;
    const pan = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}[event.key];
    if (event.key === "Escape") parent.postMessage({type: "gibbous-close-mermaid"}, parentOrigin);
    else if (event.key === "+" || event.key === "=") zoomAt(ZOOM_STEP, ...center);
    else if (event.key === "-" || event.key === "_") zoomAt(1 / ZOOM_STEP, ...center);
    else if (event.key === "0") fit(true);
    else if (pan) place(x + pan[0], y + pan[1], true);
    else return;
    event.preventDefault();
  });

  addEventListener("pointerdown", event => {
    if (!onDiagram(event) || event.button !== 0) return;
    event.preventDefault();
    root.setPointerCapture?.(event.pointerId);
    drag = {id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y};
    root.setAttribute("data-gibbous-mermaid-dragging", "");
  });

  addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    place(drag.x + event.clientX - drag.clientX, drag.y + event.clientY - drag.clientY, false);
  });

  const finishDrag = event => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    root.removeAttribute("data-gibbous-mermaid-dragging");
  };
  addEventListener("pointerup", finishDrag);
  addEventListener("pointercancel", finishDrag);

  parent.postMessage({type: "gibbous-mermaid-ready"}, parentOrigin);
})();

(() => {
  if (location.hostname !== "github.com" || matchMedia("(max-width: 767px)").matches) return;

  // First paint must already be right. chrome.storage is async, so the settings that decide what
  // the page looks like are mirrored into localStorage (synchronous, same origin) and read here,
  // before GitHub's <body> exists. chrome.storage.local stays the source of truth; the mirror is
  // rewritten whenever it changes.
  const MIRROR_KEY = "gibbous";
  const readMirror = () => {
    try {
      const value = JSON.parse(localStorage.getItem(MIRROR_KEY) ?? "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };
  const writeMirror = patch => {
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify({...readMirror(), ...patch}));
    } catch {
      // Storage may be full or blocked; the async path still applies everything, just later.
    }
  };
  const mirror = readMirror();
  let enabled = mirror.enabled !== false;
  document.documentElement.toggleAttribute("data-gibbous-disabled", !enabled);
  let ready = false;
  let contextInvalidated = false;
  let repositoryKey;
  let hiddenNames = [];
  let hiddenRepositories = Array.isArray(mirror.hiddenRepositories) ? mirror.hiddenRepositories : [];
  let mirroredHiddenNames = mirror.hiddenNames && typeof mirror.hiddenNames === "object" ? mirror.hiddenNames : {};
  let loadedHiddenNamesKey;
  let forkLookup;
  let userFork;
  let control;
  let forkedIn;
  let forkLink;
  let hiddenFilesControl;
  let pullRequestShortcuts;
  let quoteContextKey;
  let quoteMatches = [];
  let quoteChoices = {};
  let quoteError = "";
  let quotePreview;
  let quotePreviewTimer;
  let quoteRevealController;
  let quoteScrollTarget;
  let quoteScrollTimer;
  let mermaidDialog;
  let activeMermaidFrame;

  const expandingRepositoryLists = new WeakSet();
  const repositoryExpansionAttempts = new WeakMap();
  const topRepositoryOrders = new WeakMap();
  const knownRepositoryForks = new Map();
  const queuedRepositoryForks = new Set();
  const repositoryForkQueue = [];
  const hiddenRepositoryControls = new WeakMap();
  let resolvingRepositoryForks = false;
  let hiddenItemsControlId = 0;

  // Everything fetched from GitHub is persisted so a revisit paints the last known result in the
  // same frame the DOM appears, then revalidates quietly. Buckets: myPulls, dashboard, forks,
  // userForks, pushAccess, tags. Entries are {value, at}.
  const CACHE_ENTRY_LIMIT = 80;
  const MINUTE = 60_000;
  let cache = {};
  let cacheWriteTimer;
  const revalidating = new Set();
  const cacheEntry = (bucket, key) => cache[bucket]?.[key];
  const cacheFresh = (entry, maxAge) => Boolean(entry) && Date.now() - entry.at < maxAge;
  const cacheSet = (bucket, key, value) => {
    const entries = (cache[bucket] ??= {});
    entries[key] = {value, at: Date.now()};
    const keys = Object.keys(entries);
    if (keys.length > CACHE_ENTRY_LIMIT) {
      keys.sort((left, right) => entries[left].at - entries[right].at)
        .slice(0, keys.length - CACHE_ENTRY_LIMIT)
        .forEach(stale => delete entries[stale]);
    }
    clearTimeout(cacheWriteTimer);
    cacheWriteTimer = setTimeout(() => void storageSet({cache}).catch(reportError), 200);
  };
  // Returns the cached value right away (possibly stale) and, when it is stale, fetches a fresh one
  // once and hands it to onFresh. Errors keep the stale value on screen.
  const cached = (bucket, key, maxAge, fetcher, onFresh) => {
    const entry = cacheEntry(bucket, key);
    const token = `${bucket}\n${key}`;
    if (!cacheFresh(entry, maxAge) && !revalidating.has(token)) {
      revalidating.add(token);
      fetcher().then(value => {
        cacheSet(bucket, key, value);
        if (JSON.stringify(value) !== JSON.stringify(entry?.value)) onFresh(value);
      }).catch(reportError).finally(() => revalidating.delete(token));
    }
    return entry?.value;
  };

  // Rules for what the user has hidden are generated from the mirror and inserted before any
  // paint, so hidden files and repositories never appear even for a frame. The JS below still
  // toggles the same classes; this stylesheet just gets there first.
  const cssString = value => JSON.stringify(String(value));
  const firstPaintStyle = document.createElement("style");
  firstPaintStyle.id = "gibbous-first-paint";
  const renderFirstPaintStyle = () => {
    const rules = [];
    for (const nwo of hiddenRepositories) {
      const href = cssString(`/${nwo}`);
      rules.push(
        // Innermost li only: the new dashboard nests the repository list inside a NavList group li.
        `html:not([data-gibbous-disabled]) li:not(:has(li)):has(a[data-testid="dynamic-side-panel-items-item"][href=${href} i]),`
        + `html:not([data-gibbous-disabled]) .js-dashboard-repos-list > li:has(a[href=${href} i]) { display: none !important; }`,
      );
    }
    for (const [rootNwo, names] of Object.entries(mirroredHiddenNames)) {
      if (!Array.isArray(names) || !names.length) continue;
      const scope = `html:not([data-gibbous-disabled]):has(meta[name="octolytics-dimension-repository_network_root_nwo"][content=${cssString(rootNwo)} i])`;
      const rows = names.map(name => `tr.react-directory-row:has(a.Link--primary[title=${cssString(name)}])`).join(",");
      rules.push(`${scope} table[aria-labelledby="folders-and-files"] :is(${rows}) { display: none !important; }`);
    }
    const text = rules.join("\n");
    if (firstPaintStyle.textContent !== text) firstPaintStyle.textContent = text;
    if (!firstPaintStyle.isConnected) (document.head ?? document.documentElement).append(firstPaintStyle);
  };
  renderFirstPaintStyle();

  const create = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  };

  // Octicon paths by octicon name; the icon gets GitHub's own octicon-<name> class.
  const octicons = {
    "screen-full": "M2 3.75C2 2.784 2.784 2 3.75 2h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0Zm7.75-1.75a.75.75 0 0 0 0 1.5h2.5a.25.25 0 0 1 .25.25v2.5a.75.75 0 0 0 1.5 0v-2.5A1.75 1.75 0 0 0 12.25 2ZM2.75 9a.75.75 0 0 1 .75.75v2.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 12.25v-2.5A.75.75 0 0 1 2.75 9Zm10.5 0a.75.75 0 0 1 .75.75v2.5A1.75 1.75 0 0 1 12.25 14h-2.5a.75.75 0 0 1 0-1.5h2.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 .75-.75Z",
    "x": "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z",
    "issue-opened": "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
    "list-unordered": "M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 0 1-1 1 1 1 0 1 1 1-1ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    "comment": "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z",
    "git-pull-request-draft": "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z",
    "eye": "M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z",
    "eye-closed": "M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z",
    "git-pull-request": "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
    "git-pull-request-closed": "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0 0-1.5ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
    "people": "M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z",
    "code": "m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z",
    "tag": "M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
    "repo-forked": "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z",
  };

  const createOcticon = name => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("class", `octicon octicon-${name}`);
    icon.setAttribute("fill", "currentColor");
    icon.setAttribute("height", "16");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("width", "16");
    path.setAttribute("d", octicons[name]);
    icon.append(path);
    return icon;
  };

  const mountMermaidDialog = () => {
    if (mermaidDialog?.isConnected) return;
    mermaidDialog = create(
      "dialog",
      {
        class: "gibbous-mermaid-dialog",
        closedby: "any",
        "aria-label": "Enlarged Mermaid diagram",
      },
      create("button", {
        class: "Button Button--secondary Button--medium Button--iconOnly gibbous-mermaid-close",
        type: "button",
        "aria-label": "Close enlarged diagram",
        title: "Close (Esc)",
        onclick: () => mermaidDialog.close(),
      }, createOcticon("x")),
    );
    mermaidDialog.addEventListener("close", () => {
      if (!activeMermaidFrame) return;
      const {frame, placeholder} = activeMermaidFrame;
      document.documentElement.removeAttribute("data-gibbous-mermaid-open");
      frame.contentWindow.postMessage({type: "gibbous-mermaid-expanded", value: false}, new URL(frame.src).origin);
      if (placeholder.parentNode) {
        placeholder.parentNode.moveBefore(frame, placeholder);
        placeholder.remove();
      } else frame.remove();
      activeMermaidFrame = undefined;
    });
    document.body.append(mermaidDialog);
  };

  const openMermaid = frame => {
    if (!enabled || activeMermaidFrame) return;
    mountMermaidDialog();
    const placeholder = document.createComment("gibbous-mermaid");
    frame.before(placeholder);
    activeMermaidFrame = {frame, placeholder};
    mermaidDialog.moveBefore(frame, null);
    document.documentElement.setAttribute("data-gibbous-mermaid-open", "");
    mermaidDialog.showModal();
    frame.contentWindow.postMessage({type: "gibbous-mermaid-expanded", value: true}, new URL(frame.src).origin);
    frame.focus();
  };

  const mountMermaidLightboxes = () => {
    for (const frame of document.querySelectorAll('iframe[src*="/markdown/mermaid"]')) {
      if (frame.closest(".gibbous-mermaid-dialog") || frame.classList.contains("gibbous-mermaid-preview")) continue;
      frame.classList.add("gibbous-mermaid-preview");
      const surface = frame.parentElement;
      surface.classList.add("gibbous-mermaid-surface");
      surface.append(create(
        "button",
        {
          class: "Button Button--secondary Button--small gibbous-mermaid-open",
          type: "button",
          "aria-label": "Enlarge Mermaid diagram",
          onclick: event => {
            event.stopPropagation();
            openMermaid(frame);
          },
        },
        createOcticon("screen-full"),
        create("span", {}, "Enlarge"),
      ));
    }
  };

  addEventListener("message", event => {
    if (!["gibbous-close-mermaid", "gibbous-mermaid-ready"].includes(event.data?.type)) return;
    const frame = [...document.querySelectorAll('iframe[src*="/markdown/mermaid"]')]
      .find(candidate => candidate.contentWindow === event.source && new URL(candidate.src).origin === event.origin);
    if (!frame) return;
    if (event.data.type === "gibbous-close-mermaid" && activeMermaidFrame?.frame === frame) {
      mermaidDialog.close();
    } else if (event.data.type === "gibbous-mermaid-ready") {
      frame.contentWindow.postMessage({
        type: "gibbous-mermaid-expanded",
        value: activeMermaidFrame?.frame === frame,
      }, event.origin);
    }
  });

  const extensionCall = async (operation, fallback) => {
    if (contextInvalidated) return fallback;
    try {
      return await operation();
    } catch (error) {
      if (!String(error).includes("Extension context invalidated")) throw error;
      contextInvalidated = true;
      return fallback;
    }
  };

  const reportError = error => console.error("Gibbous:", error);
  const storageGet = keys => extensionCall(() => chrome.storage.local.get(keys), null);
  const storageSet = values => extensionCall(() => chrome.storage.local.set(values));
  const hiddenStorageKey = () => repositoryKey && `hiddenNames:${repositoryKey}`;

  const normalizeNames = names => Array.isArray(names)
    ? [...new Set(names.filter(name => typeof name === "string").map(name => name.trim()).filter(Boolean))]
    : [];

  const sameNames = (left, right) => left.length === right.length
    && left.every((name, index) => name === right[index]);

  const updateStoredNames = (key, update, apply) => {
    if (!key) return;
    void navigator.locks.request(`gibbous:${key}`, async () => {
      const stored = await storageGet(key);
      if (!stored) return;
      const next = normalizeNames(update(normalizeNames(stored[key])));
      apply(next);
      await storageSet({[key]: next});
    }).catch(reportError);
  };

  const createHiddenItemsControl = ({
    title,
    detail = () => "",
    items,
    onShow,
    className = "",
    size = "small",
    variant = "invisible",
  }) => {
    const id = `gibbous-hidden-menu-${hiddenItemsControlId++}`;
    const anchor = `--${id}`;
    const toggle = create(
      "button",
      {
        class: `Button Button--${variant} Button--${size} Button--iconOnly gibbous-eyes-toggle`,
        type: "button",
        "aria-label": title,
        popovertarget: id,
        title,
      },
      createOcticon("eye"),
    );
    const detailElement = create("code", {class: "gibbous-hidden-menu-detail"});
    const list = create("div", {class: "gibbous-hidden-list"});
    const menu = create(
      "div",
      {id, class: "gibbous-hidden-menu", popover: "auto"},
      create("strong", {}, title),
      detailElement,
      list,
    );
    toggle.style.anchorName = anchor;
    menu.style.positionAnchor = anchor;
    let rendered = "";
    const render = () => {
      const names = items();
      const detailText = detail();
      const nextRendered = `${detailText}\0${names.join("\0")}`;
      if (nextRendered === rendered) return;
      rendered = nextRendered;
      detailElement.textContent = detailText;
      detailElement.hidden = !detailText;
      list.replaceChildren(...(names.length ? names.map(name => create(
        "div",
        {class: "gibbous-hidden-item"},
        create("code", {title: name}, name),
        create(
          "button",
          {
            class: "Button Button--secondary Button--small gibbous-list-button",
            type: "button",
            "aria-label": `Show ${name}`,
            onclick: () => onShow(name),
          },
          "Show",
        ),
      )) : [create("span", {class: "gibbous-hidden-menu-empty"}, "Nothing hidden.")]));
    };
    render();
    return {
      element: create("div", {class: `gibbous-hidden-items-control ${className}`}, toggle, menu),
      render,
      toggle,
    };
  };

  const setHiddenNames = names => {
    const next = normalizeNames(names);
    if (sameNames(next, hiddenNames)) return;
    hiddenNames = next;
    if (repositoryKey) {
      const entries = Object.entries(mirroredHiddenNames).filter(([key]) => key !== repositoryKey).slice(-40);
      if (next.length) entries.push([repositoryKey, next]);
      mirroredHiddenNames = Object.fromEntries(entries);
      writeMirror({hiddenNames: mirroredHiddenNames});
      renderFirstPaintStyle();
    }
    hiddenFilesControl?.render();
    if (enabled) refreshRows();
  };

  const setHiddenRepositories = names => {
    const next = [...new Set(normalizeNames(names).map(name => name.replace(/^\/+|\/+$/g, "").toLowerCase()))];
    if (sameNames(next, hiddenRepositories)) return;
    hiddenRepositories = next;
    writeMirror({hiddenRepositories: next});
    renderFirstPaintStyle();
    for (const surface of topRepositorySurfaces()) repositoryExpansionAttempts.delete(surface.root);
    mountTopRepositories();
    expandTopRepositories();
  };

  const loadHiddenNames = async () => {
    const key = hiddenStorageKey();
    if (!key || key === loadedHiddenNamesKey) return;
    loadedHiddenNamesKey = key;
    const stored = await storageGet(key);
    if (stored && key === hiddenStorageKey()) setHiddenNames(stored[key] ?? []);
  };

  const updateHiddenNames = update => {
    const key = hiddenStorageKey();
    updateStoredNames(key, update, names => {
      if (key === hiddenStorageKey()) setHiddenNames(names);
    });
  };

  const updateHiddenRepositories = update => updateStoredNames(
    "hiddenRepositories",
    update,
    setHiddenRepositories,
  );

  const closeHiddenMenus = () => document.querySelectorAll(".gibbous-hidden-menu:popover-open")
    .forEach(menu => menu.hidePopover());

  const createHideButton = (name, className, onHide) => create(
    "button",
    {
      class: `Button Button--invisible Button--small Button--iconOnly gibbous-hide-button ${className}`,
      type: "button",
      "aria-label": `Hide ${name}`,
      title: `Hide ${name}`,
      onclick: event => {
        event.preventDefault();
        event.stopPropagation();
        onHide();
      },
    },
    createOcticon("eye-closed"),
  );

  const refreshRows = () => {
    const table = document.querySelector('table[aria-labelledby="folders-and-files"]');
    if (!table) return;
    const hidden = new Set(hiddenNames);
    for (const row of table.querySelectorAll("tr.react-directory-row")) {
      const nameLink = row.querySelector(".react-directory-row-name-cell-large-screen a.Link--primary, a.Link--primary");
      const name = nameLink?.textContent.trim();
      if (!name || name === "..") continue;
      row.classList.toggle("gibbous-file-excluded", hidden.has(name));
      const cell = row.querySelector(".react-directory-row-name-cell-large-screen");
      if (cell && !cell.querySelector(":scope > .gibbous-hide-file")) {
        cell.append(createHideButton(
          name,
          "gibbous-hide-file",
          () => updateHiddenNames(names => names.includes(name) ? names : [...names, name]),
        ));
      }
    }
  };

  const metaContent = (root, name) => root.querySelector(`meta[name="octolytics-dimension-${name}"]`)?.content;

  const readRepositoryContext = (root = document) => {
    const nwo = metaContent(root, "repository_nwo")
      ?? root.querySelector("qbsearch-input[data-current-repository]")?.dataset.currentRepository;
    return nwo && {
      nwo,
      rootNwo: metaContent(root, "repository_network_root_nwo")
        ?? metaContent(root, "repository_parent_nwo")
        ?? nwo,
      isFork: metaContent(root, "repository_is_fork") === "true",
    };
  };

  const viewerLogin = () => document.querySelector(
    '[class*="GlobalNavUserMenu-module__container"] [data-login]',
  )?.dataset.login ?? document.querySelector('meta[name="user-login"]')?.content;

  const repositoryNavigation = () => document.querySelector(
    'nav[aria-label="Repository"], nav[aria-label="Repository navigation"]',
  );

  const markRepositoryTabs = () => {
    const navigation = repositoryNavigation();
    if (!navigation) return;
    for (const item of navigation.querySelectorAll("a, button")) {
      const label = item.textContent.replace(/\s+/g, " ").trim();
      if (/^(Agents|Discussions|Projects|Wiki|Security and quality|Insights|More)(?:\s|$)/.test(label)) {
        const container = label.startsWith("More") && item.parentElement !== navigation
          ? item.parentElement
          : item.closest("li") ?? item;
        container.classList.add("gibbous-hidden-repository-tab");
      }
    }
  };

  // The code view's embedded payload says whether the viewer can push. It goes stale after a
  // client-side navigation to another repository, so it only counts when it names this one, and
  // the answer is remembered per repository for the pages where it does not.
  const pushAccessPayloads = new WeakMap();
  const viewerCanPush = (context, viewer) => {
    const key = `${viewer}|${context.nwo}`.toLowerCase();
    const script = document.querySelector('script[data-target="react-app.embeddedData"]');
    if (script && !pushAccessPayloads.has(script)) {
      let repo;
      try {
        repo = JSON.parse(script.textContent).payload?.codeViewLayoutRoute?.repo;
      } catch {
        // Not a payload we understand; fall back to what was remembered.
      }
      pushAccessPayloads.set(script, repo && typeof repo.currentUserCanPush === "boolean"
        ? {nwo: `${repo.ownerLogin}/${repo.name}`.toLowerCase(), canPush: repo.currentUserCanPush}
        : null);
    }
    const payload = script && pushAccessPayloads.get(script);
    if (payload?.nwo !== context.nwo.toLowerCase()) return Boolean(cacheEntry("pushAccess", key)?.value);
    if (ready && cacheEntry("pushAccess", key)?.value !== payload.canPush) cacheSet("pushAccess", key, payload.canPush);
    return payload.canPush;
  };

  // The one gate for hiding what only matters to outsiders (topics, social stats, Watch and Fork):
  // the viewer owns the repository, can push to it, or has a fork of it.
  const isRepositoryInsider = (context, viewer) => {
    if (context.nwo.split("/")[0].toLowerCase() === viewer.toLowerCase()) return true;
    if (cacheEntry("userForks", `${viewer}|${context.nwo}|${context.rootNwo}`)?.value) return true;
    return viewerCanPush(context, viewer);
  };

  const updateRepositoryInsider = () => {
    const context = readRepositoryContext();
    const viewer = viewerLogin();
    document.documentElement.toggleAttribute(
      "data-gibbous-repository-insider",
      Boolean(context && viewer && isRepositoryInsider(context, viewer)),
    );
  };

  // Sections are told apart by heading text, which is there even while they are still skeletons:
  // data-gibbous-section is about, releases, contributors, languages, or other.
  const keptSidebarSection = /^(About|Releases|Contributors|Languages)(?![a-z])/i;
  const markSidebarSections = () => {
    for (const section of document.querySelectorAll(
      '[class*="CodeViewSidebar-module__borderGrid"] > [class*="SidebarSection-module__sidebarSection"]:not(.gibbous-sidebar-tags)',
    )) {
      const title = section.querySelector(":scope > h2")?.textContent.trim() ?? "";
      const name = title.match(keptSidebarSection)?.[1].toLowerCase() ?? "other";
      if (section.dataset.gibbousSection !== name) section.dataset.gibbousSection = name;
    }
  };

  // A Tags panel beside Releases, shaped like its entry: the count, the newest tag, when it was made.
  const fetchLatestTag = async nwo => {
    const response = await fetch(`/${nwo}/tags`, {credentials: "include"});
    if (!response.ok) throw new Error(`Tags lookup failed (${response.status})`);
    const row = new DOMParser().parseFromString(await response.text(), "text/html").querySelector(".Box-row");
    const link = row?.querySelector("h2 a[href]");
    return link && {
      name: link.textContent.trim(),
      url: link.getAttribute("href"),
      createdAt: row.querySelector("relative-time")?.getAttribute("datetime") ?? "",
    };
  };

  const mountSidebarTags = () => {
    const releases = document.querySelector('[data-gibbous-section="releases"]');
    const context = readRepositoryContext();
    const count = context && document.querySelector(`a[href="/${context.nwo}/tags"]`)?.textContent.match(/\d[\d,.]*k?/i)?.[0];
    let panel = document.querySelector(".gibbous-sidebar-tags");
    if (!enabled || !releases || !count || !document.documentElement.hasAttribute("data-gibbous-repository-insider")) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = releases.cloneNode(false);
      panel.classList.add("gibbous-sidebar-tags");
      panel.dataset.gibbousSection = "tags";
    }
    if (releases.nextElementSibling !== panel) releases.after(panel);
    const render = tag => {
      // GitHub's own heading once it has loaded, so the title and counter match Releases exactly.
      const heading = releases.querySelector(":scope > h2").cloneNode(true);
      const link = heading.querySelector("a");
      const key = JSON.stringify([context.nwo, count, tag, Boolean(link)]);
      if (panel.dataset.key === key) return;
      panel.dataset.key = key;
      if (link) {
        link.href = `/${context.nwo}/tags`;
        link.textContent = "Tags";
        const counter = heading.querySelector('[data-component="CounterLabel"]');
        if (counter) counter.textContent = count;
        if (counter?.nextElementSibling) counter.nextElementSibling.textContent = ` (${count})`;
      } else heading.replaceChildren("Tags ", create("span", {class: "Counter"}, count));
      panel.replaceChildren(heading, ...(tag ? [create(
        "a",
        {class: "gibbous-sidebar-tag", href: tag.url},
        createOcticon("tag"),
        create(
          "span",
          {},
          create("strong", {}, tag.name),
          tag.createdAt ? create("relative-time", {datetime: tag.createdAt}, new Date(tag.createdAt).toLocaleDateString()) : "",
        ),
      )] : []));
    };
    render(cached("tags", context.nwo, 10 * MINUTE, () => fetchLatestTag(context.nwo), fresh => {
      if (panel.isConnected) render(fresh);
    }));
  };

  const markSuggestedWorkflows = () => {
    const heading = [...document.querySelectorAll("h1, h2, h3")]
      .find(element => element.textContent.trim() === "Suggested workflows");
    const more = [...document.querySelectorAll("a, button")]
      .find(element => element.textContent.trim() === "More workflows");
    if (!heading || !more || heading.closest(".gibbous-suggested-workflows")) return;
    let section = heading.parentElement;
    while (section && !section.contains(more)) section = section.parentElement;
    if (section && section !== document.body) section.classList.add("gibbous-suggested-workflows");
  };

  // Resolves true once done() holds after a change under root, false on timeout or abort.
  const waitForMutation = (root, options, done, timeout, signal) => new Promise(resolve => {
    const finish = value => {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => finish(false);
    const observer = new MutationObserver(() => {
      if (done()) finish(true);
    });
    const timer = setTimeout(abort, timeout);
    observer.observe(root, {childList: true, subtree: true, ...options});
    signal?.addEventListener("abort", abort, {once: true});
    if (done()) finish(true);
  });

  const expandRepositoryList = async surface => {
    const initialButton = surface.button();
    if (!enabled || !initialButton || expandingRepositoryLists.has(surface.root)) return;
    expandingRepositoryLists.add(surface.root);
    try {
      for (let expansion = 0; expansion < 4; expansion += 1) {
        const button = surface.button();
        if (!enabled || !surface.root.isConnected || !button || button.disabled) return;
        const attempts = repositoryExpansionAttempts.get(surface.root) ?? 0;
        if (attempts >= 4) return;
        const availableBottom = surface.kind === "dashboard"
          ? innerHeight
          : Math.min(surface.root.getBoundingClientRect().bottom, innerHeight);
        if (availableBottom - button.getBoundingClientRect().bottom <= 32) return;
        const count = surface.entries().length;
        repositoryExpansionAttempts.set(surface.root, attempts + 1);
        button.click();
        const grew = await waitForMutation(surface.root, {attributes: true, attributeFilter: ["disabled"]}, () => {
          mountTopRepositories();
          return surface.entries().length > count && !surface.button()?.disabled;
        }, 5000);
        if (!grew) return;
        mountTopRepositories();
      }
    } finally {
      expandingRepositoryLists.delete(surface.root);
      mountTopRepositories();
    }
  };

  const normalizeQuote = text => text
    .normalize("NFKC")
    .replace(/\[([^\]]+)]\(https?:\/\/[^)\s]+\)/g, "$1")
    .replace(/(^|\n)\s*[*+-]\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const quoteBlocks = root => [...root.querySelectorAll("blockquote")]
    .filter(blockquote => !blockquote.parentElement.closest("blockquote"))
    .map(element => {
      const content = element.cloneNode(true);
      content.querySelectorAll("blockquote").forEach(blockquote => blockquote.remove());
      return {element, text: normalizeQuote(content.textContent)};
    })
    .filter(({text}) => text.length >= 24);

  // Comments come from the page itself; only comments GitHub has collapsed behind "Load more" are
  // fetched, and then from GitHub's own timeline endpoint rather than the rate-limited REST API.
  const parseTimelineComment = root => {
    const body = root.querySelector(".comment-body");
    if (!body) return;
    const content = body.cloneNode(true);
    const quotes = quoteBlocks(content).map(({text}) => text);
    content.querySelectorAll("blockquote").forEach(quote => quote.remove());
    const id = /^issuecomment-\d+$/.test(root.id) ? root.id : "pullrequest-body";
    const permalink = root.querySelector("a.js-timestamp[href]")?.getAttribute("href");
    return {
      id,
      url: new URL(permalink ?? `#${id}`, location.href).href,
      user: root.querySelector(".author")?.textContent.trim() ?? "someone",
      createdAt: root.querySelector("relative-time")?.getAttribute("datetime") ?? "",
      html: body.innerHTML,
      text: normalizeQuote(content.textContent),
      quotes,
    };
  };

  const collectTimeline = root => {
    const entries = [];
    const pullBody = root.querySelector(".js-command-palette-pull-body");
    const pullComment = pullBody && parseTimelineComment(pullBody);
    if (pullComment) entries.push({comment: pullComment});
    const scope = root.querySelector(".js-discussion") ?? root;
    for (const node of scope.querySelectorAll('[id^="issuecomment-"], form.ajax-pagination-form')) {
      if (node instanceof HTMLFormElement) {
        const action = node.getAttribute("action");
        if (action?.includes("/timeline_more_items")) entries.push({more: new URL(action, location.href).href});
      } else if (/^issuecomment-\d+$/.test(node.id)) {
        const comment = parseTimelineComment(node);
        if (comment) entries.push({comment});
      }
    }
    return entries;
  };

  const timelineChunks = new Map();

  const fetchTimelineChunk = async url => {
    const response = await fetch(url, {
      credentials: "include",
      headers: {Accept: "text/html", "X-Requested-With": "XMLHttpRequest"},
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for hidden comments.`);
    return collectTimeline(new DOMParser().parseFromString(await response.text(), "text/html").body);
  };

  const expandTimeline = async (entries, depth = 0) => {
    const comments = [];
    for (const entry of entries) {
      if (entry.comment) {
        comments.push(entry.comment);
        continue;
      }
      if (depth >= 4) continue;
      let chunk = timelineChunks.get(entry.more);
      if (!chunk) {
        chunk = await fetchTimelineChunk(entry.more);
        timelineChunks.set(entry.more, chunk);
        void storageSet({quoteChunks: {version: 7, savedAt: Date.now(), chunks: Object.fromEntries(timelineChunks)}}).catch(reportError);
      }
      comments.push(...await expandTimeline(chunk, depth + 1));
    }
    return comments;
  };

  const currentQuoteContext = () => {
    const match = location.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)\/?$/);
    return match && {key: `${match[1]}#${match[2]}`, nwo: match[1], number: match[2]};
  };

  const quoteCommentRoot = comment => comment.id === "pullrequest-body"
    ? document.querySelector(".js-command-palette-pull-body")
    : document.getElementById(comment.id);

  const quoteCommentBody = comment => quoteCommentRoot(comment)?.querySelector(".comment-body");

  const findQuoteMatches = async comments => {
    const response = await extensionCall(() => chrome.runtime.sendMessage({
      type: "findQuoteMatches",
      comments: comments.map(({text, quotes}) => ({text, quotes})),
    }), null);
    if (response?.error) throw new Error(response.error);
    if (!response?.matches) throw new Error("Quote worker unavailable.");
    return response.matches.map(({replyIndex, quoteIndex, sourceIndices, sourceRates, fullSourceIndices}) => {
      const reply = comments[replyIndex];
      return {
        key: `${reply.id}:${quoteIndex}`,
        quoteIndex,
        quote: reply.quotes[quoteIndex],
        reply,
        sources: sourceIndices.map((index, position) => ({
          ...comments[index],
          matchRate: sourceRates[position],
        })),
        fullSourceIds: fullSourceIndices.map(index => comments[index].id),
      };
    });
  };

  const isFullQuote = (match, source) => match.fullSourceIds.includes(source.id);
  const matchRateLabel = source => source.matchRate === 100
    ? "full match"
    : `${source.matchRate}% match`;
  const matchLabel = (arrow, source) => `${arrow} ${matchRateLabel(source)}`;

  const findQuoteRange = (root, quote) => {
    const characters = [];
    const positions = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement.closest("blockquote, .gibbous-quote-rail")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    for (let node; (node = walker.nextNode());) {
      for (let offset = 0; offset < node.data.length;) {
        const input = String.fromCodePoint(node.data.codePointAt(offset));
        for (const output of input.normalize("NFKC").toLowerCase()) {
          const character = /\s/.test(output) ? " " : output;
          if (character === " " && characters.at(-1) === " ") continue;
          characters.push(character);
          positions.push({node, start: offset, end: offset + input.length});
        }
        offset += input.length;
      }
    }
    const flattened = characters.join("");
    const exact = flattened.indexOf(quote);
    if (exact < 0) return;
    const offsets = [];
    let offset = 0;
    for (const character of characters) {
      offsets.push(offset);
      offset += character.length;
    }
    const start = offsets.indexOf(exact);
    const end = exact + quote.length === flattened.length
      ? characters.length
      : offsets.indexOf(exact + quote.length);
    const range = document.createRange();
    range.setStart(positions[start].node, positions[start].start);
    const last = positions[end - 1];
    range.setEnd(last.node, last.end);
    return range;
  };

  const findQuoteRect = (root, quote) => findQuoteRange(root, quote)?.getBoundingClientRect();

  const highlightQuote = (root, quote) => {
    const range = findQuoteRange(root, quote);
    if (!range) return;
    const boundaries = {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node; (node = walker.nextNode());) {
      if (range.intersectsNode(node)) nodes.push(node);
    }
    for (const node of nodes.reverse()) {
      const selection = document.createRange();
      selection.setStart(node, node === boundaries.startContainer ? boundaries.startOffset : 0);
      selection.setEnd(node, node === boundaries.endContainer ? boundaries.endOffset : node.length);
      if (selection.collapsed) continue;
      const mark = create("mark", {class: "gibbous-quote-highlight"});
      selection.surroundContents(mark);
    }
  };

  const closeQuotePreview = () => {
    clearTimeout(quotePreviewTimer);
    quotePreview?.remove();
    quotePreview = undefined;
  };

  const hideQuotePreview = () => {
    clearTimeout(quotePreviewTimer);
    quotePreviewTimer = setTimeout(closeQuotePreview, 500);
  };

  const showQuotePreview = (button, target) => {
    closeQuotePreview();
    if (target.fullQuote) return;
    const comment = target.source ?? target.match.reply;
    const parsed = new DOMParser().parseFromString(comment.html, "text/html").body;
    let content = quoteCommentRoot(comment)?.cloneNode(true);
    let body = content?.querySelector(".comment-body");
    if (!body) {
      body = create("div", {class: "comment-body markdown-body"}, ...parsed.childNodes);
      content = create(
        "div",
        {class: "gibbous-quote-fallback color-bg-overlay border rounded-2"},
        create("strong", {class: "d-block border-bottom px-3 py-2"}, `@${comment.user}`),
        body,
      );
    }
    content.removeAttribute("id");
    content.querySelectorAll(".gibbous-quote-rail, script, style, iframe, form").forEach(node => node.remove());
    content.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    if (target.source) highlightQuote(body, target.match.quote);
    else quoteBlocks(body)[target.match.quoteIndex]?.element.classList.add("gibbous-quote-highlight");
    quotePreview = create(
      "div",
      {
        class: `gibbous-quote-preview gibbous-quote-preview-${target.source ? "source" : "reply"} color-fg-default color-shadow-large`,
        popover: "manual",
        onpointerenter: () => clearTimeout(quotePreviewTimer),
        onpointerleave: hideQuotePreview,
      },
      content,
    );
    document.body.append(quotePreview);
    quotePreview.showPopover({source: button});
    const highlights = [...quotePreview.querySelectorAll(".gibbous-quote-highlight")]
      .map(highlight => highlight.getBoundingClientRect());
    if (highlights.length) {
      const viewport = quotePreview.getBoundingClientRect();
      const highlightTop = Math.min(...highlights.map(rect => rect.top));
      const highlightBottom = Math.max(...highlights.map(rect => rect.bottom));
      quotePreview.scrollTop += (highlightTop + highlightBottom - viewport.top - viewport.bottom) / 2;
    }
  };

  const createQuoteLink = (comment, label, attributes, target, onactivate) => create("a", {
    ...attributes,
    href: comment.url,
    onpointerenter: event => showQuotePreview(event.currentTarget, target),
    onpointerleave: hideQuotePreview,
    onfocus: event => showQuotePreview(event.currentTarget, target),
    onblur: hideQuotePreview,
    onclick: async event => {
      event.preventDefault();
      closeQuotePreview();
      const origin = event.currentTarget.closest(".timeline-comment");
      onactivate?.();
      const destination = {
        context: quoteContextKey,
        key: target.match.key,
        sourceId: target.source?.id,
      };
      quoteRevealController?.abort();
      const controller = new AbortController();
      quoteRevealController = controller;
      try {
        if (!await revealQuoteTarget(destination, origin, Boolean(target.source), controller.signal)) {
          throw new Error("Target comment could not be revealed.");
        }
      } catch (error) {
        if (!controller.signal.aborted) reportError(error);
      } finally {
        if (quoteRevealController === controller) quoteRevealController = undefined;
      }
    },
  }, label);

  const quoteTargetRect = target => {
    const match = quoteMatches.find(candidate => candidate.key === target.key);
    if (!match) return;
    if (target.sourceId) {
      const source = match.sources.find(candidate => candidate.id === target.sourceId);
      const body = source && quoteCommentBody(source);
      return body && (isFullQuote(match, source) ? body.getBoundingClientRect() : findQuoteRect(body, match.quote));
    }
    const body = quoteCommentBody(match.reply);
    return body && quoteBlocks(body)[match.quoteIndex]?.element.getBoundingClientRect();
  };

  const scrollQuoteTarget = target => {
    const rect = quoteTargetRect(target);
    if (!rect?.height) return false;
    const stickyBottom = Math.max(0, ...document.elementsFromPoint(innerWidth / 2, 1)
      .filter(element => ["fixed", "sticky"].includes(getComputedStyle(element).position))
      .map(element => element.getBoundingClientRect().bottom));
    const top = scrollY + rect.top - stickyBottom;
    if (Math.abs(scrollY - top) > 1) scrollTo({top, behavior: "instant"});
    return true;
  };

  const releaseQuoteTarget = () => {
    quoteRevealController?.abort();
    quoteRevealController = undefined;
    quoteScrollTarget = undefined;
    clearTimeout(quoteScrollTimer);
  };

  const holdQuoteTarget = target => {
    if (!scrollQuoteTarget(target)) return false;
    quoteScrollTarget = target;
    clearTimeout(quoteScrollTimer);
    quoteScrollTimer = setTimeout(releaseQuoteTarget, 15_000);
    return true;
  };

  const nextTimelinePage = (origin, upward, attempted) => {
    const buttons = [...document.querySelectorAll(
      ".js-discussion .ajax-pagination-form button[data-disable-with]",
    )].filter(button => !attempted.has(button.form.action) && !button.disabled && button.getClientRects().length);
    if (!origin) return buttons[0];
    const directional = buttons.filter(button => upward
      ? button.compareDocumentPosition(origin) & Node.DOCUMENT_POSITION_FOLLOWING
      : origin.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
    return (upward ? directional.at(-1) : directional[0]) ?? buttons[0];
  };

  const revealQuoteTarget = async (target, origin, upward, signal) => {
    const attempted = new Set();
    const deadline = performance.now() + 30_000;
    while (!signal.aborted && performance.now() < deadline) {
      if (holdQuoteTarget(target)) return true;
      const button = nextTimelinePage(origin, upward, attempted);
      if (!button) return false;
      attempted.add(button.form.action);
      const loaded = waitForMutation(
        document.querySelector(".js-discussion") ?? document.body,
        {},
        () => !button.isConnected || Boolean(quoteTargetRect(target)?.height),
        5_000,
        signal,
      );
      button.click();
      await loaded;
    }
    return false;
  };

  const mountQuoteRail = (body, direction, key, rect) => {
    const className = `gibbous-quote-rail-${direction}`;
    const comment = body.closest(".timeline-comment") ?? body;
    comment.classList.add("gibbous-source-comment");
    let rail = comment.querySelector(`:scope > .${className}[data-gibbous-rail-key="${key}"]`);
    if (!rail) {
      rail = create("span", {
        class: `gibbous-quote-rail ${className}`,
        "data-gibbous-rail-key": key,
      });
      comment.append(rail);
    }
    const commentRect = comment.getBoundingClientRect();
    rail.style.setProperty("--gibbous-quote-top", `${rect.top - commentRect.top}px`);
    rail.style.setProperty("--gibbous-quote-height", `${rect.height}px`);
    return rail;
  };

  const mountReplyRail = (body, match, source) => {
    const rect = isFullQuote(match, source) ? body.getBoundingClientRect() : findQuoteRect(body, match.quote);
    return rect?.height && mountQuoteRail(body, "replies", match.key, rect);
  };

  // The arrow on a quote: up from the reply's quote to its source, or down from the source to the reply.
  const mountQuoteLink = (rail, match, source, upward) => {
    if (rail.querySelector(`[data-gibbous-quote-key="${match.key}"]`)) return;
    const comment = upward ? source : match.reply;
    const fullQuote = isFullQuote(match, source);
    rail.append(createQuoteLink(
      comment,
      matchLabel(upward ? "↑" : "↓", source),
      {
        class: "Button Button--invisible Button--small gibbous-quote-button",
        "data-gibbous-quote-key": match.key,
        "aria-label": `${fullQuote ? "Full comment quoted; go" : "Go"} to ${upward ? "source comment" : "reply"} by @${comment.user}`,
        title: fullQuote ? `Full comment quoted · @${comment.user}` : `${upward ? "Source:" : "Quoted by"} @${comment.user}`,
      },
      upward ? {match, source, fullQuote} : {match, fullQuote},
    ));
  };

  const mountDisabledQuoteButton = (rail, label) => {
    let button = rail.querySelector(".gibbous-quote-missing");
    if (!button) {
      button = create(
        "button",
        {
          class: "Button Button--invisible Button--small Button--iconOnly gibbous-quote-button gibbous-quote-missing",
          type: "button",
          disabled: "",
        },
        "?",
      );
      rail.append(button);
    }
    button.setAttribute("aria-label", label);
    button.title = label;
  };

  const chooseQuoteSource = (key, source, picker) => {
    quoteChoices = {...quoteChoices, [key]: source.id};
    document.querySelectorAll(".gibbous-quote-rail-replies").forEach(node => node.remove());
    picker.hidePopover();
    refreshQuoteLinks();
    void storageSet({quoteChoices}).catch(reportError);
  };

  const mountQuotePicker = (rail, match, selected) => {
    let button = rail.querySelector(`[data-gibbous-quote-key="${match.key}"]`);
    if (!button) {
      const id = `gibbous-quote-picker-${match.key}`;
      const picker = create(
        "div",
        {
          id,
          class: "gibbous-quote-picker color-bg-overlay color-fg-default p-2 rounded-2 border color-shadow-large",
          popover: "auto",
          "aria-label": "Matching source comments",
        },
        create("strong", {class: "d-block px-2 py-1 text-small"}, "Choose source"),
        ...match.sources.map(source => createQuoteLink(
          source,
          `@${source.user} · ${new Date(source.createdAt).toLocaleString()} · ${matchRateLabel(source)}`,
          {
            class: "Button Button--invisible Button--medium d-block width-full text-left gibbous-quote-option",
            "data-gibbous-candidate": source.id,
          },
          {match, source, fullQuote: isFullQuote(match, source)},
          () => chooseQuoteSource(match.key, source, picker),
        )),
      );
      button = create(
        "button",
        {
          class: "Button Button--invisible Button--small Button--iconOnly gibbous-quote-button",
          type: "button",
          popovertarget: id,
          "data-gibbous-quote-key": match.key,
        },
        "↑",
      );
      rail.append(button, picker);
    }
    const fullQuote = selected && isFullQuote(match, selected);
    button.setAttribute("aria-label", selected
      ? `${matchRateLabel(selected)}; ${fullQuote ? "full comment quoted; " : ""}source is @${selected.user}; choose another`
      : `Choose among ${match.sources.length} sources`);
    button.title = button.getAttribute("aria-label");
    button.textContent = selected ? matchLabel("↑", selected) : "↑";
    button.classList.toggle("Button--iconOnly", !selected);
    button.onpointerenter = selected
      ? () => showQuotePreview(button, {match, source: selected, fullQuote})
      : null;
    button.onpointerleave = selected ? hideQuotePreview : null;
    button.onfocus = button.onpointerenter;
    button.onblur = button.onpointerleave;
    const picker = document.getElementById(button.getAttribute("popovertarget"));
    for (const option of picker.querySelectorAll("[data-gibbous-candidate]")) {
      option.setAttribute("aria-current", option.dataset.gibbousCandidate === selected?.id);
    }
  };

  let quoteLoadRequested = false;
  let quoteHiddenLoaded = false;
  let quoteSignature = "";
  let quoteObserver;

  const timelineSignature = () => [...document.querySelectorAll(
    '.js-discussion [id^="issuecomment-"], .js-discussion form.ajax-pagination-form',
  )].map(node => node.id || node.getAttribute("action")).filter(Boolean).join("|");

  const loadQuoteMatches = async (context, includeHidden = false) => {
    const stored = await storageGet(["quoteChoices", "quoteChunks"]);
    quoteChoices = stored?.quoteChoices ?? quoteChoices;
    if (stored?.quoteChunks?.version === 7 && Date.now() - stored.quoteChunks.savedAt < 30 * 60_000) {
      for (const [url, chunk] of Object.entries(stored.quoteChunks.chunks)) timelineChunks.set(url, chunk);
    }
    const entries = collectTimeline(document);
    quoteSignature = timelineSignature();
    const hasHidden = entries.some(entry => entry.more);
    let comments;
    try {
      comments = includeHidden && hasHidden
        ? await expandTimeline(entries)
        : entries.filter(entry => entry.comment).map(entry => entry.comment);
      quoteHiddenLoaded = includeHidden && hasHidden;
      quoteError = "";
    } catch (error) {
      comments = entries.filter(entry => entry.comment).map(entry => entry.comment);
      quoteError = `Hidden comments unavailable — ${error.message}`;
    }
    const matches = await findQuoteMatches(comments);
    if (quoteContextKey !== context.key) return;
    quoteMatches = matches;
    refreshQuoteLinks();
    // Only reach for collapsed comments when a quote on the page has no visible source.
    if (!includeHidden && hasHidden && matches.some(match => !match.sources.length)) {
      void loadQuoteMatches(context, true).catch(reportError);
    }
  };

  const startQuoteLoad = context => {
    if (quoteLoadRequested) return;
    quoteLoadRequested = true;
    quoteObserver?.disconnect();
    void loadQuoteMatches(context).catch(error => {
      if (quoteContextKey !== context.key) return;
      quoteError = `Quote links unavailable — ${error.message}`;
      refreshQuoteLinks();
    });
  };

  // Resolve lazily: nothing runs until a quoted reply actually scrolls into view.
  const watchQuotes = context => {
    quoteObserver ??= new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) startQuoteLoad(context);
    }, {rootMargin: "200px 0px"});
    for (const blockquote of document.querySelectorAll(".js-discussion .comment-body blockquote, .js-command-palette-pull-body .comment-body blockquote")) {
      quoteObserver.observe(blockquote);
    }
  };

  const refreshQuoteLinks = () => {
    const context = currentQuoteContext();
    if (!context) {
      quoteContextKey = undefined;
      quoteMatches = [];
      releaseQuoteTarget();
      document.querySelectorAll(".gibbous-quote-link, .gibbous-quote-rail, .gibbous-quote-picker, .gibbous-quote-replies, .gibbous-quote-status")
        .forEach(node => node.remove());
      return;
    }
    if (context.key !== quoteContextKey) {
      releaseQuoteTarget();
      quoteContextKey = context.key;
      quoteMatches = [];
      quoteError = "";
      quoteLoadRequested = false;
      quoteHiddenLoaded = false;
      quoteSignature = "";
      quoteObserver?.disconnect();
      quoteObserver = undefined;
    }
    if (!quoteLoadRequested) {
      watchQuotes(context);
      return;
    }
    // Comments the visitor loaded since we matched are free to fold in: no request needed.
    const signature = timelineSignature();
    if (quoteSignature && signature !== quoteSignature) {
      quoteSignature = signature;
      void loadQuoteMatches(context, quoteHiddenLoaded).catch(reportError);
    }

    for (const match of quoteMatches) {
      const {quote, quoteIndex, reply, sources} = match;
      const source = sources.length === 1
        ? sources[0]
        : sources.find(candidate => candidate.id === quoteChoices[match.key]);
      const replyBody = quoteCommentBody(reply);
      const blockquote = replyBody && quoteBlocks(replyBody)[quoteIndex]?.element;
      if (blockquote) {
        const text = blockquote.dataset.gibbousQuote ??= quote;
        const rail = text === quote && mountQuoteRail(
          replyBody,
          "source",
          match.key,
          blockquote.getBoundingClientRect(),
        );
        if (rail && !sources.length) mountDisabledQuoteButton(
          rail,
          quoteError.includes("rate limit")
            ? "GitHub rate limit (403/429)"
            : "Source not found (likely edited out)",
        );
        else if (rail && sources.length > 1) mountQuotePicker(rail, match, source);
        else if (rail && source) mountQuoteLink(rail, match, source, true);
      }

      const sourceBody = source && quoteCommentBody(source);
      const replies = sourceBody && mountReplyRail(sourceBody, match, source);
      if (replies) mountQuoteLink(replies, match, source, false);
    }

    if (!quoteMatches.length && quoteError) {
      const label = quoteError.includes("rate limit")
        ? "GitHub rate limit (403/429)"
        : "Source lookup unavailable";
      document.querySelectorAll(".js-discussion .comment-body").forEach(body => {
        quoteBlocks(body).forEach(({element}, quoteIndex) => {
          const rail = mountQuoteRail(
            body,
            "source",
            `error:${quoteIndex}`,
            element.getBoundingClientRect(),
          );
          mountDisabledQuoteButton(rail, label);
        });
      });
    }

    let status = document.querySelector(".gibbous-quote-status");
    if (!quoteError) status?.remove();
    else if (!status) {
      status = create("div", {class: "flash flash-warn mb-3 gibbous-quote-status", role: "status"}, quoteError);
      document.querySelector(".js-discussion")?.prepend(status);
    } else status.textContent = quoteError;
    document.querySelectorAll(".gibbous-quote-rail, .gibbous-quote-picker, .gibbous-quote-status")
      .forEach(node => node.toggleAttribute("hidden", !enabled));
    if (quoteScrollTarget?.context === context.key) scrollQuoteTarget(quoteScrollTarget);
    else if (quoteScrollTarget) releaseQuoteTarget();
  };

  const readPullRequestState = (context, viewer) => {
    const path = `/${context.nwo}/pulls`;
    const filters = new URLSearchParams(location.search).get("q")?.toLowerCase() ?? "";
    const author = filters.match(/\bauthor:([^\s]+)/)?.[1];
    const mine = location.pathname === `${path}/@me`
      || author === "@me"
      || Boolean(author && viewer && author === viewer.toLowerCase());
    if (!location.pathname.startsWith(path) || !mine) return;
    return filters.includes("is:closed") ? "closed" : "open";
  };

  const mountPullRequestShortcuts = (context, viewer) => {
    const navigation = repositoryNavigation();
    const pullRequests = [...(navigation?.querySelectorAll("a") ?? [])]
      .find(link => link.textContent.replace(/\s+/g, " ").trim().startsWith("Pull requests"));
    const item = pullRequests?.closest("li") ?? pullRequests;
    if (!item) return;
    if (!pullRequestShortcuts) {
      pullRequestShortcuts = create(
        "li",
        {class: "gibbous-pull-request-shortcuts"},
        ...[["open", "git-pull-request"], ["closed", "git-pull-request-closed"]].map(([state, iconName]) => create(
          "a",
          {
            class: "Button Button--invisible Button--small Button--iconOnly gibbous-pull-request-shortcut",
            "data-state": state,
            "aria-label": `My ${state} pull requests`,
            title: `My ${state} pull requests`,
          },
          createOcticon(iconName),
        )),
      );
    }
    if (pullRequestShortcuts.previousElementSibling !== item) item.after(pullRequestShortcuts);
    const active = context && readPullRequestState(context, viewer);
    pullRequestShortcuts.hidden = !enabled || !context || !viewer;
    for (const link of pullRequestShortcuts.children) {
      const state = link.dataset.state;
      link.href = context
        ? `/${context.nwo}/pulls?q=${encodeURIComponent(`is:pr is:${state} author:@me`)}`
        : "#";
      link.classList.toggle("gibbous-pull-request-shortcut-active", state === active);
    }
  };

  const repositoryMatch = repository => repository.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);

  const repositoryEntries = (list, selector) => [...list.querySelectorAll(":scope > li")].flatMap(row => {
    const repositories = selector
      ? row.querySelectorAll(selector)
      : row.querySelectorAll("a[href]");
    const repository = [...repositories].find(link =>
      link.closest("li") === row
      && (
        selector
        || (
          !link.classList.contains("gibbous-repository-fork")
          && repositoryMatch(link)
          && link.textContent.trim()
        )
      ),
    );
    return repository ? [{repository, row}] : [];
  });

  const repositoryShowMoreButton = root => root.querySelector(
    '[data-testid="dynamic-side-panel-items-show-more"]',
  ) ?? [...root.querySelectorAll("button")].find(candidate =>
    /^Show (?:even )?more$/i.test(candidate.textContent.trim()),
  );

  const repositorySearchButton = root => root.querySelector(
    '[data-testid="dynamic-side-panel-items-search-button"], button:has(svg.octicon-search), a[href="/new"]',
  );

  const repositorySurface = (kind, root, list, selector) => ({
    kind,
    root,
    list,
    entries: () => repositoryEntries(list, selector),
    button: () => repositoryShowMoreButton(root),
    searchButton: () => repositorySearchButton(root),
  });

  const dashboardRepositorySurface = () => {
    if (!["/", "/dashboard"].includes(location.pathname)) return;
    const root = document.querySelector('[data-testid="dashboard-repositories"]')
      ?? document.querySelector(".feed-left-sidebar .js-repos-container");
    const list = root && [...root.querySelectorAll("ul")]
      .find(candidate => repositoryEntries(candidate).length);
    return list && repositorySurface("dashboard", root, list);
  };

  const topRepositorySurfaces = () => {
    const selector = '[data-testid="dynamic-side-panel-items-item"]';
    const lists = new Set([...document.querySelectorAll(selector)].map(repository => repository.closest("ul")));
    const surfaces = [...lists].filter(Boolean).flatMap(list => {
      const dialog = list.closest('[role="dialog"]');
      const dashboard = list.closest('[data-testid="dashboard-repositories"], .feed-left-sidebar');
      const root = dialog ?? dashboard;
      return root ? [repositorySurface(dialog ? "drawer" : "dashboard", root, list, selector)] : [];
    });
    const dashboard = dashboardRepositorySurface();
    if (dashboard && !lists.has(dashboard.list)) surfaces.push(dashboard);
    return surfaces;
  };

  const mountHiddenRepositoriesControl = surface => {
    const searchButton = surface.searchButton();
    if (!searchButton) return;
    let control = hiddenRepositoryControls.get(surface.root);
    if (!control?.element.isConnected) {
      control = createHiddenItemsControl({
        title: "Hidden repositories",
        items: () => hiddenRepositories,
        onShow: name => updateHiddenRepositories(names => names.filter(repository => repository !== name)),
        className: "gibbous-hidden-repositories-control",
      });
      hiddenRepositoryControls.set(surface.root, control);
    }
    control.render();
    control.toggle.hidden = !enabled;
    if (control.element.nextElementSibling !== searchButton) searchButton.before(control.element);
  };

  const sortTopRepositories = (entries, viewer, forkedRepositories) => {
    const list = entries[0]?.row.parentElement;
    if (!list || entries.some(({row}) => row.parentElement !== list)) return;

    if (!enabled) {
      list.classList.remove("gibbous-top-repositories-list");
      for (const {row} of entries) row.style.removeProperty("--gibbous-repository-order");
      return;
    }

    let originalOrder = topRepositoryOrders.get(list);
    if (!originalOrder) {
      originalOrder = new Map();
      topRepositoryOrders.set(list, originalOrder);
    }
    for (const {repository} of entries) {
      if (!originalOrder.has(repository.pathname)) {
        originalOrder.set(repository.pathname, originalOrder.size);
      }
    }

    const category = ({repository, row}) => {
      if (forkedRepositories.has(row)) return 0;
      const owner = repository.pathname.match(/^\/([^/]+)\//)?.[1].toLowerCase();
      return owner === viewer ? 1 : 2;
    };
    const sorted = [...entries].sort((left, right) =>
      category(left) - category(right)
      || originalOrder.get(left.repository.pathname) - originalOrder.get(right.repository.pathname),
    );
    const firstSort = !list.classList.contains("gibbous-top-repositories-list");
    const scroller = list.closest('[data-component="ScrollableRegion"], .js-left-column-scroll-container, [role="dialog"]');
    const scrollTop = scroller?.scrollTop;
    const rows = new Set(sorted.map(({row}) => row));
    scroller?.classList.add("gibbous-top-repositories-scroll");
    list.classList.add("gibbous-top-repositories-list");
    sorted.forEach(({row}, index) => {
      row.style.setProperty("--gibbous-repository-order", index + 1);
    });
    for (const child of list.children) {
      if (rows.has(child)) continue;
      const button = child.querySelector("button");
      const showMore = button && /^Show (?:even )?more$/i.test(button.textContent.trim());
      child.style.setProperty("--gibbous-repository-order", showMore ? sorted.length + 1 : 0);
    }
    if (firstSort && scroller) {
      scroller.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        if (scroller.isConnected) scroller.scrollTop = scrollTop;
      });
    }
  };

  // The viewer's repository of the same name, if it is a fork in the same network as rootNwo.
  const fetchFork = async (candidateNwo, rootNwo, signal) => {
    const response = await fetch(`/${candidateNwo}`, {credentials: "include", signal});
    const candidate = response.ok && readRepositoryContext(
      new DOMParser().parseFromString(await response.text(), "text/html"),
    );
    return candidate?.isFork && candidate.rootNwo.toLowerCase() === rootNwo.toLowerCase() ? candidate.nwo : null;
  };

  const resolveRepositoryForkQueue = async () => {
    if (resolvingRepositoryForks) return;
    resolvingRepositoryForks = true;
    try {
      while (repositoryForkQueue.length) {
        const batch = repositoryForkQueue.splice(0, 3);
        await Promise.all(batch.map(async ({key, candidateNwo, rootNwo}) => {
          try {
            const nwo = await fetchFork(candidateNwo, rootNwo, AbortSignal.timeout(5000));
            const fork = nwo && `/${nwo}`;
            knownRepositoryForks.set(key, fork);
            cacheSet("forks", key, fork);
          } catch {
            if (!knownRepositoryForks.has(key)) knownRepositoryForks.set(key, null);
          }
        }));
        mountTopRepositories();
      }
    } finally {
      resolvingRepositoryForks = false;
    }
  };

  const queueRepositoryForkLookups = (entries, viewer) => {
    if (!enabled || !viewer) return;
    for (const {repository} of entries) {
      const match = repositoryMatch(repository);
      if (!match || match[1].toLowerCase() === viewer) continue;
      const rootNwo = `${match[1]}/${match[2]}`;
      const key = rootNwo.toLowerCase();
      if (queuedRepositoryForks.has(key)) continue;
      const entry = cacheEntry("forks", key);
      if (knownRepositoryForks.has(key) && (!entry || cacheFresh(entry, entry.value ? 24 * 60 * MINUTE : 10 * MINUTE))) continue;
      queuedRepositoryForks.add(key);
      repositoryForkQueue.push({key, rootNwo, candidateNwo: `${viewer}/${match[2]}`});
    }
    if (repositoryForkQueue.length) void resolveRepositoryForkQueue().catch(reportError);
  };

  const mountTopRepositories = () => {
    const viewer = viewerLogin()?.toLowerCase();
    const context = readRepositoryContext();
    const surfaces = topRepositorySurfaces();
    const allEntries = surfaces.flatMap(surface => surface.entries());
    const repositoryRows = new Set(allEntries.map(({row}) => row));
    const allOwned = new Map(allEntries.flatMap(({repository}) => {
      const match = repositoryMatch(repository);
      return match?.[1].toLowerCase() === viewer ? [[match[2].toLowerCase(), repository]] : [];
    }));
    const hidden = new Set(hiddenRepositories);
    const forkedRepositories = new Set();
    const representedForks = new Set();
    for (const {repository} of allEntries) {
      const match = repositoryMatch(repository);
      if (!match || match[1].toLowerCase() === viewer) continue;
      const fork = allOwned.get(match[2].toLowerCase());
      if (fork) knownRepositoryForks.set(`${match[1]}/${match[2]}`.toLowerCase(), fork.pathname);
    }
    for (const surface of surfaces) {
      mountHiddenRepositoriesControl(surface);
      const entries = surface.entries();
      const owned = new Map(entries.flatMap(entry => {
        const {repository} = entry;
        const match = repositoryMatch(repository);
        return match?.[1].toLowerCase() === viewer ? [[match[2].toLowerCase(), entry]] : [];
      }));
      const surfaceForks = new Set();
      for (const {repository, row} of entries) {
        repository.classList.add("gibbous-top-repository-link");
        const match = repositoryMatch(repository);
        if (!match) continue;
        const nwo = `${match[1]}/${match[2]}`;
        row.classList.toggle("gibbous-repository-excluded", hidden.has(nwo.toLowerCase()));
        let hide = row.querySelector(":scope > .gibbous-hide-repository");
        hide ??= createHideButton(
          nwo,
          "gibbous-hide-repository",
          () => updateHiddenRepositories(names => names.includes(nwo.toLowerCase())
            ? names
            : [...names, nwo.toLowerCase()]),
        );
        const existingFork = row.querySelector(":scope > .gibbous-repository-fork");
        if (hide.parentElement !== row || hide.nextElementSibling !== existingFork) {
          row.insertBefore(hide, existingFork);
        }
        if (!enabled || match[1].toLowerCase() === viewer) continue;
        const key = `${match[1]}/${match[2]}`.toLowerCase();
        const fork = owned.get(match[2].toLowerCase());
        const pageFork = context
          && userFork
          && context.nwo.toLowerCase() === key
          ? `/${userFork}`
          : undefined;
        if (pageFork) knownRepositoryForks.set(key, pageFork);
        const href = fork?.repository.pathname
          ?? knownRepositoryForks.get(key)
          ?? pageFork;
        if (!href) continue;
        surfaceForks.add(row);
        forkedRepositories.add(row);
        if (fork) representedForks.add(fork.row);
        let action = row.querySelector(":scope > .gibbous-repository-fork");
        action ??= create(
          "a",
          {class: "Button Button--invisible Button--small Button--iconOnly gibbous-repository-fork"},
          createOcticon("repo-forked"),
        );
        action.href = href;
        action.title = `Open your fork: ${href.slice(1)}`;
        action.setAttribute("aria-label", action.title);
        if (action !== row.lastElementChild) row.append(action);
      }
      sortTopRepositories(entries, viewer, surfaceForks);
      if (surface.kind === "dashboard") queueRepositoryForkLookups(entries, viewer);
    }
    for (const action of document.querySelectorAll(".gibbous-repository-fork")) {
      if (!forkedRepositories.has(action.parentElement)) action.remove();
    }
    for (const hide of document.querySelectorAll(".gibbous-hide-repository")) {
      if (!repositoryRows.has(hide.parentElement)) hide.remove();
    }
    const controls = new Set(surfaces.flatMap(surface => {
      const element = hiddenRepositoryControls.get(surface.root)?.element;
      return element ? [element] : [];
    }));
    for (const element of document.querySelectorAll(".gibbous-hidden-repositories-control")) {
      if (!controls.has(element)) element.remove();
    }
    for (const row of document.querySelectorAll(".gibbous-represented-fork")) {
      if (!representedForks.has(row)) row.classList.remove("gibbous-represented-fork");
    }
    for (const row of representedForks) row.classList.add("gibbous-represented-fork");
  };

  const expandTopRepositories = () => {
    for (const surface of topRepositorySurfaces()) void expandRepositoryList(surface);
  };

  const updateFork = () => {
    mountTopRepositories();
    updateRepositoryInsider();
    if (!forkedIn) return;
    forkedIn.hidden = !enabled || !userFork;
    forkLink.textContent = userFork ?? "";
    forkLink.href = userFork ? `/${userFork}` : "#";
    forkLink.dataset.hovercardUrl = userFork ? `/${userFork}/hovercard` : "";
  };

  const mountForkedIn = () => {
    const legacyTitle = document.querySelector('#repository-container-header strong[itemprop="name"]');
    const title = document.querySelector("#repo-title-component") ?? legacyTitle?.parentElement?.parentElement;
    if (!title) return;
    if (!forkedIn) {
      forkLink = create("a", {class: "Link--inTextBlock", "data-hovercard-type": "repository"});
      forkedIn = create(
        "span",
        {class: "gibbous-forked-in text-small lh-condensed-ultra no-wrap mt-1", "data-repository-hovercards-enabled": ""},
        "forked in ",
        forkLink,
      );
    }
    if (forkedIn.parentElement !== title) title.append(forkedIn);
    updateFork();
  };

  const mountHiddenFilesControl = table => {
    const root = table.closest("#repo-content-pjax-container, #repo-content-turbo-frame") ?? document;
    const codeButton = root.querySelector(
      'button[data-component="Button"]:has(svg.octicon-code), summary:has(svg.octicon-code)',
    );
    if (!codeButton) return;
    if (!hiddenFilesControl?.element.isConnected) {
      hiddenFilesControl = createHiddenItemsControl({
        title: "Hidden files",
        detail: () => repositoryKey ?? "",
        items: () => hiddenNames,
        onShow: name => updateHiddenNames(names => names.filter(hiddenName => hiddenName !== name)),
        className: "gibbous-hidden-files-control",
        size: "medium",
        variant: "secondary",
      });
    }
    hiddenFilesControl.render();
    hiddenFilesControl.toggle.hidden = !enabled;
    if (hiddenFilesControl.element.nextElementSibling !== codeButton) {
      codeButton.before(hiddenFilesControl.element);
    }
  };

  // Gibbous tabs in the README bar: "My pull requests" when the viewer has open pull requests here
  // (it opens first) and, behind the insider gate, Contributors and Languages lifted out of the
  // sidebar. While any is mounted the secondary file tabs collapse into a menu.
  let myPullRequestsLookup;

  const readmeNavigation = () => document.querySelector('nav[aria-label="Repository files"]');

  const labelStyle = hex => {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    if (Number.isNaN(value)) return "";
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r / 255) h = ((g - b) / 255 / d) % 6;
      else if (max === g / 255) h = (b - r) / 255 / d + 2;
      else h = (r - g) / 255 / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return `--label-r:${r};--label-g:${g};--label-b:${b};--label-h:${h};--label-s:${Math.round(sat * 100)};--label-l:${Math.round(l * 100)};`;
  };

  // The public search API answers for public repositories without a token; the pulls page is the
  // fallback for private repositories.
  const searchIssues = async (query, perPage) => {
    const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&per_page=${perPage}`, {
      headers: {Accept: "application/vnd.github+json"},
    });
    if (!response.ok) throw new Error(`Search API ${response.status}`);
    const {items = []} = await response.json();
    return items.map(item => ({
      number: item.number,
      title: item.title,
      url: new URL(item.html_url).pathname,
      nwo: item.repository_url.replace(/^.*\/repos\//, ""),
      draft: Boolean(item.draft),
      author: item.user?.login ?? "",
      openedAt: item.created_at ?? "",
      updatedAt: item.updated_at ?? "",
      comments: item.comments ?? 0,
      pullRequest: Boolean(item.pull_request),
      labels: (item.labels ?? []).map(label => ({name: label.name, style: labelStyle(label.color ?? "")})),
    }));
  };

  // The pulls page is client-rendered; its embedded payload lists the matching pull requests.
  const scrapeMyPullRequests = async (context, viewer) => {
    const query = encodeURIComponent(`is:pr is:open author:${viewer} sort:updated-desc`);
    const response = await fetch(`/${context.nwo}/pulls?q=${query}`, {credentials: "include"});
    if (!response.ok) throw new Error(`Pull request lookup failed (${response.status})`);
    const root = new DOMParser().parseFromString(await response.text(), "text/html");
    const script = [...root.querySelectorAll('script[type="application/json"]')]
      .find(candidate => candidate.textContent.includes('"repoPullsDashboardContentRoute"'));
    const results = script ? JSON.parse(script.textContent).payload?.repoPullsDashboardContentRoute?.results ?? [] : [];
    return results.map(item => ({
      number: item.number,
      title: item.title,
      url: new URL(item.permalink).pathname,
      draft: Boolean(item.isDraft),
      author: item.author?.displayLogin ?? "",
      openedAt: item.createdAt ?? "",
      comments: item.commentCount ?? 0,
      labels: (item.labels ?? []).map(label => ({name: label.name, style: labelStyle(label.color ?? "")})),
    }));
  };

  const fetchMyPullRequests = async (context, viewer) => {
    try {
      const items = await searchIssues(`repo:${context.nwo} is:pr is:open author:${viewer}`, 50);
      return items.filter(item => item.pullRequest);
    } catch (error) {
      reportError(error);
      return scrapeMyPullRequests(context, viewer);
    }
  };

  const renderMyPullRequestRow = item => create(
    "div",
    {class: "Box-row d-flex gibbous-my-pull"},
    create(
      "span",
      {class: `flex-shrink-0 pt-1 ${item.draft ? "color-fg-muted" : "color-fg-open"}`, "aria-label": item.draft ? "Draft pull request" : "Open pull request"},
      createOcticon(item.draft ? "git-pull-request-draft" : "git-pull-request"),
    ),
    create(
      "div",
      {class: "flex-auto min-width-0 px-2"},
      create("a", {class: "Link--primary v-align-middle no-underline h4 markdown-title", href: item.url}, item.title),
      ...(item.labels.length ? [create(
        "span",
        {class: "lh-default d-block d-md-inline ml-md-1"},
        ...item.labels.map(label => create("span", {class: "IssueLabel hx_IssueLabel v-align-middle", style: label.style}, label.name)),
      )] : []),
      create(
        "div",
        {class: "mt-1 text-small color-fg-muted"},
        `#${item.number}`,
        item.openedAt ? create("span", {}, " opened ", create("relative-time", {datetime: item.openedAt}, new Date(item.openedAt).toLocaleDateString())) : "",
        item.author ? ` by ${item.author}` : "",
      ),
    ),
    item.comments ? create(
      "a",
      {class: "Link--muted flex-shrink-0 d-inline-flex gap-1 pt-1 text-small text-bold", href: item.url, "aria-label": `${item.comments} comments`},
      createOcticon("comment"),
      create("span", {}, String(item.comments)),
    ) : "",
  );

  // While a Gibbous tab is showing, GitHub's current tab gives up aria-current (its underline);
  // it gets it back on return unless GitHub has since marked another tab current.
  const selectRepositoryTab = (box, name) => {
    if (name) box.dataset.gibbousTab = name;
    else delete box.dataset.gibbousTab;
    const links = [...readmeNavigation()?.querySelectorAll("a") ?? []];
    const github = links.filter(link => !link.classList.contains("gibbous-tab-link"));
    for (const link of links) {
      if (link.classList.contains("gibbous-tab-link")) {
        if (link.dataset.tab === name) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      } else if (name && link.hasAttribute("aria-current")) {
        link.removeAttribute("aria-current");
        link.dataset.gibbousCurrent = "";
      }
    }
    if (!name) {
      const live = github.some(link => link.hasAttribute("aria-current"));
      for (const link of github.filter(link => "gibbousCurrent" in link.dataset)) {
        if (!live) link.setAttribute("aria-current", "page");
        delete link.dataset.gibbousCurrent;
      }
    }
    // Sidebar panels are copied when shown, so they are as current as the sidebar.
    for (const panel of box.querySelectorAll(":scope > .gibbous-tab-panel")) {
      panel.hidden = panel.dataset.tab !== name;
      const section = !panel.hidden && document.querySelector(`[data-gibbous-section="${name}"]`);
      if (section) panel.replaceChildren(...[...section.children].slice(1).map(child => child.cloneNode(true)));
    }
  };

  const unmountRepositoryTabs = box => {
    box.querySelectorAll(":scope > .gibbous-tab-panel, .gibbous-tab, .gibbous-readme-menu").forEach(node => node.remove());
    box.removeAttribute("data-gibbous-tabs-active");
    delete box.dataset.gibbousTabsSignature;
    selectRepositoryTab(box, null);
  };

  const mountRepositoryTabs = (context, pulls) => {
    const navigation = readmeNavigation();
    const list = navigation?.querySelector("ul");
    const readmeItem = [...(list?.children ?? [])].find(item => item.querySelector('[data-content="README"]'));
    const header = navigation?.parentElement;
    const box = header?.parentElement;
    if (!list || !readmeItem || !box) return;
    const tabs = pulls?.length ? [{
      name: "pulls",
      label: "My pull requests",
      icon: "git-pull-request",
      count: String(pulls.length),
      href: `/${context.nwo}/pulls?q=${encodeURIComponent("is:pr is:open author:@me")}`,
    }] : [];
    if (document.documentElement.hasAttribute("data-gibbous-repository-insider")) {
      for (const [name, label, icon] of [["contributors", "Contributors", "people"], ["languages", "Languages", "code"]]) {
        const section = document.querySelector(`[data-gibbous-section="${name}"]`);
        if (section) tabs.push({
          name,
          label,
          icon,
          count: section.querySelector(':scope > h2 [data-component="CounterLabel"]')?.textContent.trim(),
          href: section.querySelector(":scope > h2 a[href]")?.getAttribute("href") ?? "#",
        });
      }
    }
    const signature = JSON.stringify([context.nwo, pulls, tabs]);
    if (box.dataset.gibbousTabsSignature === signature) return;
    const selected = box.dataset.gibbousTab;
    unmountRepositoryTabs(box);
    if (!tabs.length) return;
    box.dataset.gibbousTabsSignature = signature;
    box.setAttribute("data-gibbous-tabs-active", "");

    const sampleLink = readmeItem.querySelector("a");
    let previous = readmeItem;
    for (const {name, label, icon, count, href} of tabs) {
      const tabLink = create(
        "a",
        {class: `${sampleLink.className} gibbous-tab-link`, "data-tab": name, href},
        create("span", {"data-component": "icon"}, createOcticon(icon)),
        create("span", {"data-component": "text"}, label),
        count ? create("span", {class: "Counter ml-1"}, count) : "",
      );
      tabLink.addEventListener("click", event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
        event.preventDefault();
        selectRepositoryTab(box, name);
      });
      const tab = create("li", {class: `${readmeItem.className} gibbous-tab`}, tabLink);
      previous.after(tab);
      previous = tab;
    }

    const hidden = [...list.querySelectorAll("a [data-content]")]
      .map(label => label.dataset.content)
      .filter(name => name !== "README");
    // One menu replaces GitHub's Outline button: the collapsed file tabs, then the outline of
    // whichever document is showing. Reuse GitHub's own icon so nothing looks foreign.
    const outlineButton = header.querySelector('button[aria-label="Outline"]');
    const outline = create("div", {class: "gibbous-readme-menu-outline", role: "group", "aria-label": "Outline"});
    const rebuildOutline = () => {
      outline.replaceChildren();
      const headings = [...box.querySelectorAll("article.markdown-body :is(h1, h2, h3, h4, h5, h6)")]
        .map(heading => ({heading, anchor: heading.parentElement?.querySelector("a.anchor[href]") ?? heading.querySelector("a.anchor[href]")}))
        .filter(({anchor}) => anchor);
      if (!headings.length) return;
      outline.append(create("div", {class: "gibbous-readme-menu-divider", role: "separator"}));
      for (const {heading, anchor} of headings) {
        const entry = create(
          "a",
          {class: "gibbous-readme-menu-item", role: "menuitem", href: anchor.getAttribute("href"), style: `--outline-level: ${heading.tagName.slice(1)}`},
          heading.textContent.trim(),
        );
        entry.addEventListener("click", () => {
          menu.removeAttribute("open");
          selectRepositoryTab(box, null);
        });
        outline.append(entry);
      }
    };
    const menu = create(
      "details",
      {class: "details-reset details-overlay gibbous-readme-menu"},
      create(
        "summary",
        {class: "Button Button--invisible Button--iconOnly Button--medium", "aria-label": "Files and outline", title: "Files and outline"},
        outlineButton?.querySelector("svg")?.cloneNode(true) ?? createOcticon("list-unordered"),
      ),
      create("div", {class: "gibbous-readme-menu-list", role: "menu"}, ...hidden.map(name => {
        const source = list.querySelector(`a [data-content="${name}"]`).closest("a");
        const entry = create("button", {class: "gibbous-readme-menu-item", type: "button", role: "menuitem"});
        entry.append(...[...source.children].map(child => child.cloneNode(true)));
        entry.addEventListener("click", () => {
          menu.removeAttribute("open");
          selectRepositoryTab(box, null);
          // GitHub may have re-rendered the tab since we mounted; find the live anchor by name.
          readmeNavigation()?.querySelector(`a [data-content="${name}"]`)?.closest("a")?.click();
        });
        return entry;
      }), outline),
    );
    menu.addEventListener("toggle", () => {
      if (menu.open) rebuildOutline();
    });
    header.append(menu);

    if (!navigation.dataset.gibbousTabsListener) {
      navigation.dataset.gibbousTabsListener = "";
      navigation.addEventListener("click", event => {
        const link = event.target instanceof Element && event.target.closest("a");
        if (link && !link.classList.contains("gibbous-tab-link") && list.contains(link)) selectRepositoryTab(box, null);
      });
    }

    header.after(...tabs.map(({name}) => create(
      "div",
      // Plain navigation: Turbo cannot load these links into the code view's frame.
      {class: "gibbous-tab-panel", "data-tab": name, "data-turbo": "false"},
      ...(name === "pulls" ? pulls.map(renderMyPullRequestRow) : []),
    )));
    // The pull request list opens first; otherwise keep whatever tab was showing.
    selectRepositoryTab(box, tabs.some(tab => tab.name === selected) ? selected : pulls?.length ? "pulls" : null);
  };

  const refreshMyPullRequests = (context, viewer) => {
    const box = readmeNavigation()?.parentElement?.parentElement;
    if (!box) return;
    if (!enabled || !viewer) {
      if (box.dataset.gibbousTabsSignature) unmountRepositoryTabs(box);
      myPullRequestsLookup = undefined;
      return;
    }
    const lookup = `${viewer}|${context.nwo}`;
    myPullRequestsLookup = lookup;
    const items = cached("myPulls", lookup, 5 * MINUTE, () => fetchMyPullRequests(context, viewer), fresh => {
      if (myPullRequestsLookup === lookup && box.isConnected) mountRepositoryTabs(context, fresh);
    });
    mountRepositoryTabs(context, items);
  };

  // Classic dashboard with Gibbous on: replace the feed column with the same "Pull requests" and
  // "Issues" lists the new dashboard shows, so both dashboards render the one Gibbous experience.
  let classicDashboardLookup;

  const classicDashboardMain = () => {
    if (!["/", "/dashboard"].includes(location.pathname)) return;
    if (document.querySelector('[data-testid="dashboard-repositories"]')) return;
    const feed = document.querySelector(".feed-left-sidebar .js-repos-container");
    const main = document.querySelector(".feed-main > main, .feed-content main");
    return feed && main ? main : undefined;
  };

  const fetchDashboardItems = async viewer => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [pulls, issues] = await Promise.all([`is:pr author:${viewer}`, `is:issue involves:${viewer}`]
      .map(scope => searchIssues(`${scope} is:open updated:>=${since}`, 10)));
    return {pulls, issues};
  };

  const renderDashboardRow = item => create(
    "div",
    {class: "gibbous-dashboard-row"},
    create(
      "span",
      {class: item.pullRequest ? (item.draft ? "color-fg-muted" : "color-fg-open") : "color-fg-open", "aria-hidden": "true"},
      createOcticon(item.pullRequest ? (item.draft ? "git-pull-request-draft" : "git-pull-request") : "issue-opened"),
    ),
    create(
      "div",
      {class: "gibbous-dashboard-copy"},
      create("a", {class: "Link--primary gibbous-dashboard-title", href: item.url}, item.title),
      create(
        "div",
        {class: "gibbous-dashboard-meta"},
        `${item.nwo}#${item.number} · Opened by ${item.author} · Updated `,
        create("relative-time", {datetime: item.updatedAt}, new Date(item.updatedAt).toLocaleDateString()),
      ),
    ),
    item.comments ? create(
      "a",
      {class: "Link--muted gibbous-dashboard-comments", href: item.url, "aria-label": `${item.comments} comments`},
      createOcticon("comment"),
      create("span", {}, String(item.comments)),
    ) : "",
  );

  const dashboardSkeletonRow = () => create(
    "div",
    {class: "gibbous-dashboard-row"},
    create(
      "div",
      {class: "gibbous-dashboard-copy"},
      create("div", {class: "gibbous-dashboard-skeleton"}),
      create("div", {class: "gibbous-dashboard-skeleton", style: "width: 35%"}),
    ),
  );

  const renderDashboardSection = (title, href, items, empty) => create(
    "section",
    {class: "gibbous-dashboard-section"},
    create(
      "div",
      {class: "gibbous-dashboard-heading"},
      create("h2", {}, title),
      create("a", {class: "Link--primary", href}, "View all"),
    ),
    create(
      "div",
      {class: "Box gibbous-dashboard-list"},
      ...(!items ? [dashboardSkeletonRow()]
        : items.length ? items.map(renderDashboardRow)
          : [create("div", {class: "gibbous-dashboard-empty"}, empty)]),
    ),
  );

  const mountClassicDashboard = () => {
    const main = classicDashboardMain();
    const existing = document.querySelector(".gibbous-classic-dashboard");
    if (!main || !enabled) {
      existing?.remove();
      document.documentElement.removeAttribute("data-gibbous-classic-dashboard");
      classicDashboardLookup = undefined;
      return;
    }
    document.documentElement.setAttribute("data-gibbous-classic-dashboard", "");
    const viewer = viewerLogin();
    if (!viewer) return;
    if (existing?.isConnected && classicDashboardLookup === viewer) return;
    classicDashboardLookup = viewer;
    const container = existing ?? create("div", {class: "gibbous-classic-dashboard"});
    if (container.parentElement !== main) main.prepend(container);
    const render = ({pulls, issues}) => container.replaceChildren(
      renderDashboardSection("Pull requests", `/pulls?q=${encodeURIComponent("is:open is:pr author:@me")}`, pulls, "No pull requests found, try a different filter."),
      renderDashboardSection("Issues", `/issues?q=${encodeURIComponent("is:open is:issue involves:@me")}`, issues, "No issues found, try a different filter."),
    );
    const items = cached("dashboard", viewer, 5 * MINUTE, () => fetchDashboardItems(viewer), fresh => {
      if (container.isConnected && classicDashboardLookup === viewer) render(fresh);
    });
    // Until the first result arrives, each section shows a skeleton row.
    if (items || !container.childElementCount) render(items ?? {});
  };

  const resolveUserFork = async (context, viewer) => {
    const lookup = `${viewer}|${context.nwo}|${context.rootNwo}`;
    if (lookup === forkLookup) return;
    forkLookup = lookup;
    userFork = undefined;
    updateFork();
    if (!viewer || context.isFork) return;
    const candidateNwo = `${viewer}/${context.rootNwo.split("/").at(-1)}`;
    if (candidateNwo.toLowerCase() === context.nwo.toLowerCase()) return;
    const entry = cacheEntry("userForks", lookup);
    const known = cached("userForks", lookup, entry?.value ? 24 * 60 * MINUTE : 10 * MINUTE, () => fetchFork(candidateNwo, context.rootNwo), fresh => {
      if (forkLookup !== lookup) return;
      userFork = fresh ?? undefined;
      updateFork();
    });
    if (known) {
      userFork = known;
      updateFork();
    }
  };

  const refreshRepository = () => {
    const pageContext = readRepositoryContext();
    const table = document.querySelector('table[aria-labelledby="folders-and-files"]');
    const context = table && pageContext;
    const viewer = viewerLogin();
    if (pageContext) {
      markRepositoryTabs();
      if (enabled) markSuggestedWorkflows();
    }
    mountPullRequestShortcuts(pageContext, viewer);
    mountSidebarTags();
    if (!context) {
      repositoryKey = undefined;
      hiddenNames = [];
      loadedHiddenNamesKey = undefined;
      forkLookup = undefined;
      userFork = undefined;
      closeHiddenMenus();
      updateFork();
      return;
    }
    if (repositoryKey !== context.rootNwo) {
      repositoryKey = context.rootNwo;
      hiddenNames = [];
      hiddenFilesControl?.render();
    }
    mountForkedIn();
    mountHiddenFilesControl(table);
    void loadHiddenNames().catch(reportError);
    refreshMyPullRequests(context, viewer);
    if (enabled) {
      refreshRows();
      void resolveUserFork(context, viewer);
    }
  };

  const updateControl = () => {
    if (!control) return;
    const action = enabled ? "Disable" : "Enable";
    control.textContent = enabled ? "🌔" : "🌘";
    control.setAttribute("aria-label", `${action} Gibbous`);
    control.setAttribute("aria-pressed", enabled);
    control.title = `${action} Gibbous`;
  };

  const applyEnabled = value => {
    if (!value) closeHiddenMenus();
    if (!value && mermaidDialog?.open) mermaidDialog.close();
    enabled = value;
    writeMirror({enabled: value});
    document.documentElement.toggleAttribute("data-gibbous-disabled", !value);
    updateControl();
    refresh();
  };

  const mountControl = () => {
    const anchor = document.querySelector('[class*="GlobalNavUserMenu-module__container"]')
      ?? document.querySelector('header [data-testid="top-nav-right"] a[href^="/login"], header .HeaderMenu-link-wrap:has(a.HeaderMenu-link--sign-in)');
    if (!anchor) return;
    if (!control) {
      control = create(
        "button",
        {
          class: "Button Button--secondary Button--medium Button--iconOnly gibbous-header-button",
          type: "button",
          onclick: () => {
            applyEnabled(!enabled);
            void storageSet({enabled}).catch(reportError);
          },
        },
      );
      updateControl();
    }
    if (control.nextElementSibling !== anchor) anchor.before(control);
  };

  function refresh() {
    // Needs only the DOM, so it runs before storage is loaded and the gate is right on first paint.
    updateRepositoryInsider();
    markSidebarSections();
    if (!ready) return;
    mountControl();
    mountClassicDashboard();
    mountMermaidLightboxes();
    expandTopRepositories();
    refreshRepository();
    mountTopRepositories();
    refreshQuoteLinks();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) applyEnabled(changes.enabled.newValue ?? true);
    if (changes.cache && changes.cache.newValue && typeof changes.cache.newValue === "object") cache = changes.cache.newValue;
    if (changes.quoteChoices) {
      quoteChoices = changes.quoteChoices.newValue ?? {};
      document.querySelectorAll(".gibbous-quote-rail-replies").forEach(node => node.remove());
      refreshQuoteLinks();
    }
    if (changes.hiddenRepositories) setHiddenRepositories(changes.hiddenRepositories.newValue ?? []);
    const key = hiddenStorageKey();
    if (key && changes[key]) setHiddenNames(changes[key].newValue ?? []);
  });

  void (async () => {
    const stored = await storageGet({enabled: true, hiddenRepositories: [], cache: {}});
    if (!stored) return;
    cache = stored.cache && typeof stored.cache === "object" ? stored.cache : {};
    for (const [key, entry] of Object.entries(cache.forks ?? {})) {
      if (entry && typeof entry === "object" && "value" in entry) knownRepositoryForks.set(key, entry.value);
    }
    writeMirror({enabled: stored.enabled, hiddenRepositories: stored.hiddenRepositories});
    ready = true;
    setHiddenRepositories(stored.hiddenRepositories);
    applyEnabled(stored.enabled);
  })().catch(reportError);

  let refreshScheduled = false;
  const scheduleRefresh = () => {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      refresh();
    });
  };

  new MutationObserver(records => {
    if (ready && enabled && records.some(record => record.target instanceof Element && record.target.closest('[role="dialog"]'))) {
      mountTopRepositories();
    }
    scheduleRefresh();
  }).observe(document.documentElement, {childList: true, subtree: true});
  addEventListener("pointerdown", releaseQuoteTarget, {capture: true, passive: true});
  addEventListener("wheel", releaseQuoteTarget, {passive: true});
  addEventListener("keydown", releaseQuoteTarget);
  addEventListener("resize", scheduleRefresh);
  refresh();
})();
