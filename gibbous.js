// One content script for three places, each section guarded by where it runs:
// GitHub's theme mirrored to the Gibbous site (both sites), the Mermaid viewer frame GitHub
// embeds (zoom and pan once enlarged), and GitHub itself.

// An element from a tag, attributes (on* become listeners) and children.
const create = (tag, attributes = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
};

// An element from markup. Line breaks, with the indentation after them, are layout only;
// interpolated strings are escaped, and nodes (or arrays of them) are inserted where they appear.
const html = (strings, ...values) => {
  const nodes = [];
  const template = document.createElement("template");
  template.innerHTML = strings.map(string => string.replace(/\n\s*/g, "")).reduce((markup, string, index) => {
    const value = values[index - 1];
    const slot = value instanceof Node || Array.isArray(value)
      ? `<template data-node="${nodes.push(value) - 1}"></template>`
      : String(value ?? "").replace(/[&<>"]/g, character => `&#${character.charCodeAt(0)};`);
    return markup + slot + string;
  });
  for (const slot of template.content.querySelectorAll("template[data-node]")) slot.replaceWith(...[nodes[slot.dataset.node]].flat());
  return template.content.firstElementChild;
};

(() => {
  const root = document.documentElement;
  const isTheme = theme => /^(light|dark)(-colorblind)?(-high-contrast)?$|^dark-dimmed(-high-contrast)?$/.test(theme);
  const fail = error => console.error("Gibbous could not synchronize the GitHub theme.", error);
  if (location.hostname === "netanel-haber.github.io") {
    const expose = theme => {
      if (isTheme(theme)) root.dataset.githubTheme = theme;
    };
    chrome.storage.local.get("githubTheme").then(({githubTheme}) => expose(githubTheme), fail);
    chrome.storage.onChanged.addListener((changes, area) => area === "local" && expose(changes.githubTheme?.newValue));
    return;
  }
  if (location.hostname !== "github.com") return;
  const storeTheme = () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const mode = root.dataset.colorMode === "auto" ? (dark ? "dark" : "light") : root.dataset.colorMode;
    const theme = root.dataset[`${mode}Theme`]?.replaceAll("_", "-");
    if (isTheme(theme)) chrome.storage.local.set({githubTheme: theme}).catch(fail);
  };
  new MutationObserver(storeTheme).observe(root, {
    attributes: true,
    attributeFilter: ["data-color-mode", "data-light-theme", "data-dark-theme"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", storeTheme);
  storeTheme();
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
  let zoomLabel;

  const svg = () => document.querySelector(".mermaid-view svg");
  const stage = () => svg()?.parentElement;
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
  const center = () => [innerWidth / 2, innerHeight / 2];

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
    const diagram = svg();
    const box = diagram?.viewBox?.baseVal;
    width = box?.width || diagram?.getBoundingClientRect().width || 0;
    height = box?.height || diagram?.getBoundingClientRect().height || 0;
    if (!(width > 0 && height > 0)) return;
    Object.assign(stage().style, {width: `${width}px`, height: `${height}px`});
    diagram.style.transform = "";
    fitScale = Math.min((innerWidth - 2 * PADDING) / width, (innerHeight - 2 * PADDING) / height, MAX_SCALE);
    scale = fitScale;
    x = (innerWidth - width * scale) / 2;
    y = (innerHeight - height * scale) / 2;
    apply(animate);
  };

  const zoomAt = (factor, clientX, clientY, animate = true) => {
    const next = clamp(scale * factor, fitScale / 2, MAX_SCALE);
    const ratio = next / scale;
    scale = next;
    place(clientX - (clientX - x) * ratio, clientY - (clientY - y) * ratio, animate);
  };

  const button = (label, text, onclick, className = "btn") =>
    create("button", {type: "button", class: className, "aria-label": label, title: label, onclick}, text);

  const endDrag = () => {
    drag = undefined;
    root.removeAttribute("data-gibbous-mermaid-dragging");
  };

  const setExpanded = value => {
    expanded = value;
    root.toggleAttribute("data-gibbous-mermaid-expanded", expanded);
    if (expanded) {
      if (!zoomLabel) {
        zoomLabel = button("Fit to view", "100%", () => fit(true), "btn gibbous-zoom-level");
        document.body.append(create(
          "div",
          {class: "gibbous-mermaid-controls"},
          button("Zoom out", "−", () => zoomAt(1 / ZOOM_STEP, ...center())),
          zoomLabel,
          button("Zoom in", "+", () => zoomAt(ZOOM_STEP, ...center())),
        ));
      }
      requestAnimationFrame(() => fit(false));
      return;
    }
    const target = stage();
    target?.classList.remove("gibbous-animate");
    for (const property of ["transform", "width", "height"]) target?.style.removeProperty(property);
    endDrag();
  };

  addEventListener("message", event => {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.type !== "gibbous-mermaid-expanded") return;
    setExpanded(Boolean(event.data.value));
  });

  // GitHub re-renders the diagram when the frame is resized; refit when it does.
  new MutationObserver(() => expanded && requestAnimationFrame(() => fit(false)))
    .observe(document.querySelector(".mermaid-view") ?? document.body, {childList: true});
  addEventListener("resize", () => expanded && fit(false));

  const onDiagram = event => expanded && event.target instanceof Element && !event.target.closest("a, .clickable, button");

  addEventListener("dblclick", event => {
    if (!onDiagram(event)) return;
    event.preventDefault();
    zoomAt(DOUBLE_CLICK_ZOOM, event.clientX, event.clientY);
  });

  addEventListener("wheel", event => {
    if (!expanded) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    zoomAt(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0025)), event.clientX, event.clientY, false);
  }, {passive: false});

  addEventListener("keydown", event => {
    if (!expanded || event.altKey || event.metaKey) return;
    const step = event.shiftKey ? 240 : 80;
    const pan = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}[event.key];
    if (event.key === "Escape") parent.postMessage({type: "gibbous-close-mermaid"}, parentOrigin);
    else if (event.key === "+" || event.key === "=") zoomAt(ZOOM_STEP, ...center());
    else if (event.key === "-" || event.key === "_") zoomAt(1 / ZOOM_STEP, ...center());
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
    if (drag?.id === event.pointerId) place(drag.x + event.clientX - drag.clientX, drag.y + event.clientY - drag.clientY, false);
  });

  for (const type of ["pointerup", "pointercancel"]) addEventListener(type, event => drag?.id === event.pointerId && endDrag());

  parent.postMessage({type: "gibbous-mermaid-ready"}, parentOrigin);
})();

(() => {
  if (location.hostname !== "github.com" || matchMedia("(max-width: 767px)").matches) return;
  const root = document.documentElement;

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
  root.toggleAttribute("data-gibbous-disabled", !enabled);
  let ready = false;
  let contextInvalidated = false;
  let hiddenRepositories = Array.isArray(mirror.hiddenRepositories) ? mirror.hiddenRepositories : [];
  let mirroredHiddenNames = mirror.hiddenNames && typeof mirror.hiddenNames === "object" ? mirror.hiddenNames : {};

  const reportError = error => console.error("Gibbous:", error);
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
  const storageGet = keys => extensionCall(() => chrome.storage.local.get(keys), null);
  const storageSet = values => extensionCall(() => chrome.storage.local.set(values));

  // Everything fetched from GitHub is persisted so a revisit paints the last known result in the
  // same frame the DOM appears, then revalidates quietly. Buckets: myPulls, dashboard, forks,
  // userForks, pushAccess, tags, whitespaceDiffstat. Entries are {value, at}.
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
    Object.keys(entries)
      .sort((left, right) => entries[right].at - entries[left].at)
      .slice(CACHE_ENTRY_LIMIT)
      .forEach(stale => delete entries[stale]);
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

  // Writes only what differs. A refresh that changes nothing must not mutate the page, or the
  // observer at the end would schedule the next refresh forever. "text" sets textContent; null or
  // false removes the attribute.
  const sync = (node, attributes) => {
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "text") {
        if (node.textContent !== value) node.textContent = value;
      } else if (value === null || value === false) node.removeAttribute(name);
      else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, value);
    }
    return node;
  };

  const setStyle = (node, property, value) => {
    if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
  };

  // Rules for what the user has hidden are generated from the mirror and inserted before any
  // paint, so hidden files and repositories never appear even for a frame. The JS below still
  // toggles the same classes; this stylesheet just gets there first.
  const cssString = value => JSON.stringify(String(value));
  const firstPaintStyle = create("style", {id: "gibbous-first-paint"});
  const renderFirstPaintStyle = () => {
    const on = "html:not([data-gibbous-disabled])";
    const repositories = hiddenRepositories.map(nwo => cssString(`/${nwo}`)).map(href =>
      // Innermost li only: the new dashboard nests the repository list inside a NavList group li.
      `${on} li:not(:has(li)):has(a[data-testid="dynamic-side-panel-items-item"][href=${href} i]),`
      + `${on} .js-dashboard-repos-list > li:has(a[href=${href} i]) { display: none !important; }`);
    const files = Object.entries(mirroredHiddenNames).filter(([, names]) => Array.isArray(names) && names.length).map(([rootNwo, names]) => {
      const scope = `${on}:has(meta[name="octolytics-dimension-repository_network_root_nwo"][content=${cssString(rootNwo)} i])`;
      const rows = names.map(name => `tr.react-directory-row:has(a.Link--primary[title=${cssString(name)}])`).join(",");
      return `${scope} table[aria-labelledby="folders-and-files"] :is(${rows}) { display: none !important; }`;
    });
    sync(firstPaintStyle, {text: [...repositories, ...files].join("\n")});
    if (!firstPaintStyle.isConnected) (document.head ?? root).append(firstPaintStyle);
  };
  renderFirstPaintStyle();

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
  const createOcticon = name => html`<svg aria-hidden="true" class="octicon octicon-${name}" fill="currentColor" height="16" viewBox="0 0 16 16" width="16">
    <path d="${octicons[name]}"></path>
  </svg>`;

  // Mermaid: an Enlarge button on each diagram moves GitHub's viewer frame into a dialog, where the
  // frame's own Gibbous section handles zoom and pan.
  let mermaidDialog;
  let activeMermaidFrame;
  const expandMermaid = (frame, value) =>
    frame.contentWindow.postMessage({type: "gibbous-mermaid-expanded", value}, new URL(frame.src).origin);

  const openMermaid = frame => {
    if (!enabled || activeMermaidFrame) return;
    if (!mermaidDialog?.isConnected) {
      mermaidDialog = html`<dialog class="gibbous-mermaid-dialog" closedby="any" aria-label="Enlarged Mermaid diagram">
        <button class="Button Button--secondary Button--medium Button--iconOnly gibbous-mermaid-close" type="button" aria-label="Close enlarged diagram" title="Close (Esc)">
          ${createOcticon("x")}
        </button>
      </dialog>`;
      mermaidDialog.firstChild.onclick = () => mermaidDialog.close();
      mermaidDialog.addEventListener("close", () => {
        if (!activeMermaidFrame) return;
        const {frame, placeholder} = activeMermaidFrame;
        root.removeAttribute("data-gibbous-mermaid-open");
        expandMermaid(frame, false);
        if (placeholder.parentNode) {
          placeholder.parentNode.moveBefore(frame, placeholder);
          placeholder.remove();
        } else frame.remove();
        activeMermaidFrame = undefined;
      });
      document.body.append(mermaidDialog);
    }
    const placeholder = document.createComment("gibbous-mermaid");
    frame.before(placeholder);
    activeMermaidFrame = {frame, placeholder};
    mermaidDialog.moveBefore(frame, null);
    root.setAttribute("data-gibbous-mermaid-open", "");
    mermaidDialog.showModal();
    expandMermaid(frame, true);
    frame.focus();
  };

  const mountMermaidLightboxes = () => {
    for (const frame of added('iframe[src*="/markdown/mermaid"]')) {
      if (frame.classList.contains("gibbous-mermaid-preview") || frame.closest(".gibbous-mermaid-dialog")) continue;
      frame.classList.add("gibbous-mermaid-preview");
      frame.parentElement.classList.add("gibbous-mermaid-surface");
      const open = html`<button class="Button Button--secondary Button--small gibbous-mermaid-open" type="button" aria-label="Enlarge Mermaid diagram">
        ${createOcticon("screen-full")}<span>Enlarge</span>
      </button>`;
      open.onclick = event => {
        event.stopPropagation();
        openMermaid(frame);
      };
      frame.parentElement.append(open);
    }
  };

  addEventListener("message", event => {
    if (!["gibbous-close-mermaid", "gibbous-mermaid-ready"].includes(event.data?.type)) return;
    const frame = [...document.querySelectorAll('iframe[src*="/markdown/mermaid"]')]
      .find(candidate => candidate.contentWindow === event.source && new URL(candidate.src).origin === event.origin);
    if (!frame) return;
    if (event.data.type === "gibbous-mermaid-ready") expandMermaid(frame, activeMermaidFrame?.frame === frame);
    else if (activeMermaidFrame?.frame === frame) mermaidDialog.close();
  });

  // Hidden files (per repository network) and hidden repositories (dashboard and sidebar lists):
  // stored as name lists, updated under a lock so tabs never overwrite each other.
  let repositoryKey;
  let hiddenNames = [];
  let loadedHiddenNamesKey;
  let hiddenFilesControl;
  let hiddenItemsControlId = 0;
  const hiddenStorageKey = () => repositoryKey && `hiddenNames:${repositoryKey}`;
  const normalizeNames = names => Array.isArray(names)
    ? [...new Set(names.filter(name => typeof name === "string").map(name => name.trim()).filter(Boolean))]
    : [];

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
  const toggleStoredName = (key, name, hide, apply) =>
    updateStoredNames(key, names => hide ? [...names, name] : names.filter(other => other !== name), apply);
  const updateHiddenName = (name, hide) => {
    const key = hiddenStorageKey();
    toggleStoredName(key, name, hide, names => key === hiddenStorageKey() && setHiddenNames(names));
  };
  const updateHiddenRepository = (nwo, hide) => toggleStoredName("hiddenRepositories", nwo, hide, setHiddenRepositories);

  // The eye button and its popover listing what is hidden, each with a Show button.
  const createHiddenItemsControl = ({title, detail = () => "", items, onShow, className, size = "small", variant = "invisible"}) => {
    const id = `gibbous-hidden-menu-${hiddenItemsControlId++}`;
    const element = html`<div class="gibbous-hidden-items-control ${className}">
      <button class="Button Button--${variant} Button--${size} Button--iconOnly gibbous-eyes-toggle" type="button" aria-label="${title}" popovertarget="${id}" title="${title}" style="anchor-name: --${id};">
        ${createOcticon("eye")}
      </button>
      <div id="${id}" class="gibbous-hidden-menu" popover="auto" style="position-anchor: --${id};">
        <strong>${title}</strong><code class="gibbous-hidden-menu-detail"></code><div class="gibbous-hidden-list"></div>
      </div>
    </div>`;
    const [toggle, menu] = element.children;
    const [, detailElement, list] = menu.children;
    let rendered;
    const render = () => {
      const names = items();
      const key = JSON.stringify([detail(), names]);
      if (key === rendered) return;
      rendered = key;
      detailElement.textContent = detail();
      detailElement.hidden = !detail();
      list.replaceChildren(...(names.length ? names.map(name => {
        const item = html`<div class="gibbous-hidden-item">
          <code title="${name}">${name}</code>
          <button class="Button Button--secondary Button--small gibbous-list-button" type="button" aria-label="Show ${name}">Show</button>
        </div>`;
        item.lastChild.onclick = () => onShow(name);
        return item;
      }) : [html`<span class="gibbous-hidden-menu-empty">Nothing hidden.</span>`]));
    };
    render();
    return {element, render, toggle};
  };

  const placeHiddenItemsControl = (control, anchor) => {
    control.render();
    sync(control.toggle, {hidden: !enabled && ""});
    if (control.element.nextElementSibling !== anchor) anchor.before(control.element);
  };

  const setHiddenNames = names => {
    const next = normalizeNames(names);
    if (JSON.stringify(next) === JSON.stringify(hiddenNames)) return;
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
    if (JSON.stringify(next) === JSON.stringify(hiddenRepositories)) return;
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

  const closeHiddenMenus = () => document.querySelectorAll(".gibbous-hidden-menu:popover-open").forEach(menu => menu.hidePopover());

  const createHideButton = (name, className, onHide) => {
    const button = html`<button class="Button Button--invisible Button--small Button--iconOnly gibbous-hide-button ${className}" type="button" aria-label="Hide ${name}" title="Hide ${name}">
      ${createOcticon("eye-closed")}
    </button>`;
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      onHide();
    };
    return button;
  };

  const refreshRows = () => {
    const hidden = new Set(hiddenNames);
    for (const row of document.querySelectorAll('table[aria-labelledby="folders-and-files"] tr.react-directory-row')) {
      const name = row.querySelector(".react-directory-row-name-cell-large-screen a.Link--primary, a.Link--primary")?.textContent.trim();
      if (!name || name === "..") continue;
      row.classList.toggle("gibbous-file-excluded", hidden.has(name));
      const cell = row.querySelector(".react-directory-row-name-cell-large-screen");
      if (cell && !cell.querySelector(":scope > .gibbous-hide-file")) {
        cell.append(createHideButton(name, "gibbous-hide-file", () => updateHiddenName(name, true)));
      }
    }
  };

  // Lookups that run every frame are scoped to where their element lives, so their cost does not
  // grow with the page: a query that finds nothing visits every element, every diff line included.
  // Repository metadata is in <head>; the viewer and the repository tabs are in the global
  // navigation, near the top of the page, found by its right-hand end.
  const metaContent = (root, name) => (root.head ?? root).querySelector(`meta[name="octolytics-dimension-${name}"]`)?.content;
  const topNavigation = () => document.querySelector('[data-testid="top-nav-right"]');

  const readRepositoryContext = (root = document) => {
    const nwo = metaContent(root, "repository_nwo")
      ?? root.querySelector("header")?.querySelector("qbsearch-input[data-current-repository]")?.dataset.currentRepository;
    return nwo && {
      nwo,
      rootNwo: metaContent(root, "repository_network_root_nwo") ?? metaContent(root, "repository_parent_nwo") ?? nwo,
      isFork: metaContent(root, "repository_is_fork") === "true",
    };
  };

  // Stable hooks only (see gibbous.css): GitHub's generated class names change with every build.
  const viewerButton = () => topNavigation()?.querySelector("button[data-login]");
  const viewerLogin = () => viewerButton()?.dataset.login ?? (document.head ?? document).querySelector('meta[name="user-login"]')?.content;
  // In the global header, or in the repository header of pages that still have one.
  const repositoryNavigation = () => [topNavigation()?.closest("header"), document.getElementById("repository-container-header")]
    .map(container => container?.querySelector('nav[aria-label="Repository"], nav[aria-label="Repository navigation"]')).find(Boolean);
  // A repository's code view, root or folder: where the file table, the sidebar and the README are.
  const onCodeView = () => /^\/[^/]+\/[^/]+(?:\/tree\/.+)?\/?$/.test(location.pathname);
  const textOf = element => element.textContent.replace(/\s+/g, " ").trim();

  const markRepositoryTabs = () => {
    const navigation = repositoryNavigation();
    for (const item of navigation?.querySelectorAll("a, button") ?? []) {
      const label = textOf(item);
      if (!/^(Agents|Discussions|Projects|Wiki|Security and quality|Insights|More)(?:\s|$)/.test(label)) continue;
      const more = label.startsWith("More") && item.parentElement !== navigation;
      (more ? item.parentElement : item.closest("li") ?? item).classList.toggle("gibbous-hidden-repository-tab", true);
    }
  };

  // The code view's embedded payload says whether the viewer can push. It goes stale after a
  // client-side navigation to another repository, so it only counts when it names this one, and
  // the answer is remembered per repository for the pages where it does not.
  const pushAccessPayloads = new WeakMap();
  const viewerCanPush = (context, viewer) => {
    const key = `${viewer}|${context.nwo}`.toLowerCase();
    const script = onCodeView() && document.querySelector('script[data-target="react-app.embeddedData"]');
    if (script && !pushAccessPayloads.has(script)) {
      let repo;
      try {
        repo = JSON.parse(script.textContent).payload?.codeViewLayoutRoute?.repo;
      } catch {
        // Not a payload we understand; fall back to what was remembered.
      }
      pushAccessPayloads.set(script, typeof repo?.currentUserCanPush === "boolean"
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
  const updateRepositoryInsider = () => {
    const context = readRepositoryContext();
    const viewer = viewerLogin();
    root.toggleAttribute("data-gibbous-repository-insider", Boolean(context && viewer && (
      context.nwo.split("/")[0].toLowerCase() === viewer.toLowerCase()
      || cacheEntry("userForks", `${viewer}|${context.nwo}|${context.rootNwo}`)?.value
      || viewerCanPush(context, viewer))));
  };

  // Sections are told apart by heading text, which is there even while they are still skeletons:
  // data-gibbous-section is about, releases, contributors, languages, or other.
  const markSidebarSections = () => {
    if (!onCodeView()) return;
    for (const section of document.querySelectorAll('[data-component="SplitPageLayout.Pane"] > div > div:has(> h2):not(.gibbous-sidebar-tags)')) {
      const title = section.querySelector(":scope > h2")?.textContent.trim() ?? "";
      sync(section, {"data-gibbous-section": title.match(/^(About|Releases|Contributors|Languages)(?![a-z])/i)?.[1].toLowerCase() ?? "other"});
    }
  };

  // A Tags panel beside Releases, shaped like its entry: the count, the newest tag, when it was made.
  const fetchPage = async url => {
    const response = await fetch(url, {credentials: "include"});
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), "text/html");
  };

  const fetchLatestTag = async nwo => {
    const row = (await fetchPage(`/${nwo}/tags`)).querySelector(".Box-row");
    const link = row?.querySelector("h2 a[href]");
    return link && {
      name: link.textContent.trim(),
      url: link.getAttribute("href"),
      createdAt: row.querySelector("relative-time")?.getAttribute("datetime") ?? "",
    };
  };

  let sidebarTags;
  const mountSidebarTags = () => {
    const releases = onCodeView() && document.querySelector('[data-gibbous-section="releases"]');
    const context = releases && readRepositoryContext();
    const count = context && document.querySelector(`a[href="/${context.nwo}/tags"]`)?.textContent.match(/\d[\d,.]*k?/i)?.[0];
    let panel = sidebarTags?.isConnected ? sidebarTags : undefined;
    if (!enabled || !releases || !count || !root.hasAttribute("data-gibbous-repository-insider")) return panel?.remove();
    if (!panel) {
      panel = releases.cloneNode(false);
      panel.classList.add("gibbous-sidebar-tags");
      panel.dataset.gibbousSection = "tags";
      sidebarTags = panel;
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
      const date = tag?.createdAt
        ? html`<relative-time datetime="${tag.createdAt}">${new Date(tag.createdAt).toLocaleDateString()}</relative-time>`
        : "";
      panel.replaceChildren(heading, ...(tag ? [html`<a class="gibbous-sidebar-tag" href="${tag.url}">
        ${createOcticon("tag")}<span><strong>${tag.name}</strong>${date}</span>
      </a>`] : []));
    };
    render(cached("tags", context.nwo, 10 * MINUTE, () => fetchLatestTag(context.nwo), fresh => panel.isConnected && render(fresh)));
  };

  const markSuggestedWorkflows = () => {
    if (!added("h1, h2, h3, a, button").some(element => /^(Suggested|More) workflows$/.test(element.textContent.trim()))) return;
    const heading = [...document.querySelectorAll("h1, h2, h3")].find(element => element.textContent.trim() === "Suggested workflows");
    if (!heading || heading.closest(".gibbous-suggested-workflows")) return;
    const more = [...document.querySelectorAll("a, button")].find(element => element.textContent.trim() === "More workflows");
    if (!more) return;
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
    const observer = new MutationObserver(() => done() && finish(true));
    const timer = setTimeout(abort, timeout);
    observer.observe(root, {childList: true, subtree: true, ...options});
    signal?.addEventListener("abort", abort, {once: true});
    if (done()) finish(true);
  });

  // Quote navigation on pull request conversations: each quote links up to the comment it quotes,
  // and each quoted comment down to its replies. Comments come from the page itself; only those
  // GitHub has collapsed behind "Load more" are fetched, from GitHub's own timeline endpoint rather
  // than the rate-limited REST API. The fuzzy matching runs in the background worker.
  let quoteContextKey;
  let quoteMatches = [];
  let quoteChoices = {};
  let quoteError = "";
  let quotePreview;
  let quotePreviewTimer;
  let quoteRevealController;
  let quoteScrollTarget;
  let quoteScrollTimer;
  let quoteLoadRequested = false;
  let quoteHiddenLoaded = false;
  let quoteSignature = "";
  let quoteStatus;
  let quoteObserver;
  const timelineChunks = new Map();

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

  const parseTimelineComment = root => {
    const body = root.querySelector(".comment-body");
    if (!body) return;
    const content = body.cloneNode(true);
    const quotes = quoteBlocks(content).map(({text}) => text);
    content.querySelectorAll("blockquote").forEach(quote => quote.remove());
    const id = /^issuecomment-\d+$/.test(root.id) ? root.id : "pullrequest-body";
    return {
      id,
      url: new URL(root.querySelector("a.js-timestamp[href]")?.getAttribute("href") ?? `#${id}`, location.href).href,
      user: root.querySelector(".author")?.textContent.trim() ?? "someone",
      createdAt: root.querySelector("relative-time")?.getAttribute("datetime") ?? "",
      html: body.innerHTML,
      text: normalizeQuote(content.textContent),
      quotes,
    };
  };

  // The pull request body, then the comments and "Load more" chunks in timeline order.
  const collectTimeline = root => {
    const scope = root.querySelector(".js-discussion") ?? root;
    const pullBody = root.querySelector(".js-command-palette-pull-body");
    return [pullBody, ...scope.querySelectorAll('[id^="issuecomment-"], form.ajax-pagination-form')].flatMap(node => {
      if (node instanceof HTMLFormElement) {
        const action = node.getAttribute("action");
        return action?.includes("/timeline_more_items") ? [{more: new URL(action, location.href).href}] : [];
      }
      const comment = node && (node === pullBody || /^issuecomment-\d+$/.test(node.id)) && parseTimelineComment(node);
      return comment ? [{comment}] : [];
    });
  };

  const expandTimeline = async (entries, depth = 0) => {
    const comments = [];
    for (const entry of entries) {
      if (entry.comment) comments.push(entry.comment);
      if (!entry.more || depth >= 4) continue;
      if (!timelineChunks.has(entry.more)) {
        const response = await fetch(entry.more, {
          credentials: "include",
          headers: {Accept: "text/html", "X-Requested-With": "XMLHttpRequest"},
        });
        if (!response.ok) throw new Error(`GitHub returned ${response.status} for hidden comments.`);
        timelineChunks.set(entry.more, collectTimeline(new DOMParser().parseFromString(await response.text(), "text/html").body));
        const chunks = Object.fromEntries(timelineChunks);
        void storageSet({quoteChunks: {version: 7, savedAt: Date.now(), chunks}}).catch(reportError);
      }
      comments.push(...await expandTimeline(timelineChunks.get(entry.more), depth + 1));
    }
    return comments;
  };

  // The pull request being viewed. tab is "" on the conversation, else "files", "changes", and so on.
  const pullRequestContext = () => {
    const match = location.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)(?:$|\/([^/]*))/);
    return match && {key: `${match[1]}#${match[2]}`, nwo: match[1], number: match[2], tab: match[3] ?? ""};
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
        sources: sourceIndices.map((index, position) => ({...comments[index], matchRate: sourceRates[position]})),
        fullSourceIds: fullSourceIndices.map(index => comments[index].id),
      };
    });
  };

  const isFullQuote = (match, source) => match.fullSourceIds.includes(source.id);
  const matchRateLabel = source => source.matchRate === 100 ? "full match" : `${source.matchRate}% match`;
  const matchLabel = (arrow, source) => `${arrow} ${matchRateLabel(source)}`;

  // The quote's text as a range in root, compared the way quotes are normalized. positions holds,
  // per UTF-16 unit of the normalized text, the source node and offsets it came from.
  const findQuoteRange = (root, quote) => {
    let text = "";
    const positions = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement.closest("blockquote, .gibbous-quote-rail") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node; (node = walker.nextNode());) {
      for (let offset = 0; offset < node.data.length;) {
        const input = String.fromCodePoint(node.data.codePointAt(offset));
        for (const output of input.normalize("NFKC").toLowerCase()) {
          const character = /\s/.test(output) ? " " : output;
          if (character === " " && text.endsWith(" ")) continue;
          text += character;
          for (let unit = 0; unit < character.length; unit++) positions.push({node, start: offset, end: offset + input.length});
        }
        offset += input.length;
      }
    }
    const start = text.indexOf(quote);
    if (start < 0) return;
    const range = document.createRange();
    range.setStart(positions[start].node, positions[start].start);
    const last = positions[start + quote.length - 1];
    range.setEnd(last.node, last.end);
    return range;
  };

  const highlightQuote = (root, quote) => {
    const range = findQuoteRange(root, quote);
    if (!range) return;
    const {startContainer, startOffset, endContainer, endOffset} = range;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node; (node = walker.nextNode());) if (range.intersectsNode(node)) nodes.push(node);
    for (const node of nodes.reverse()) {
      const selection = document.createRange();
      selection.setStart(node, node === startContainer ? startOffset : 0);
      selection.setEnd(node, node === endContainer ? endOffset : node.length);
      if (!selection.collapsed) selection.surroundContents(create("mark", {class: "gibbous-quote-highlight"}));
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

  // The other end of a link, in a popover: the comment from the page, or rebuilt from its HTML when
  // it is collapsed, scrolled so the quote shows.
  const showQuotePreview = (button, target) => {
    closeQuotePreview();
    if (target.fullQuote) return;
    const comment = target.source ?? target.match.reply;
    const parsed = new DOMParser().parseFromString(comment.html, "text/html").body;
    let content = quoteCommentRoot(comment)?.cloneNode(true);
    let body = content?.querySelector(".comment-body");
    if (!body) {
      content = html`<div class="gibbous-quote-fallback color-bg-overlay border rounded-2">
        <strong class="d-block border-bottom px-3 py-2">@${comment.user}</strong>
        <div class="comment-body markdown-body">${[...parsed.childNodes]}</div>
      </div>`;
      body = content.lastChild;
    }
    content.removeAttribute("id");
    content.querySelectorAll(".gibbous-quote-rail, script, style, iframe, form").forEach(node => node.remove());
    content.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    if (target.source) highlightQuote(body, target.match.quote);
    else quoteBlocks(body)[target.match.quoteIndex]?.element.classList.add("gibbous-quote-highlight");
    const side = target.source ? "source" : "reply";
    quotePreview = html`<div class="gibbous-quote-preview gibbous-quote-preview-${side} color-fg-default color-shadow-large" popover="manual">${content}</div>`;
    quotePreview.onpointerenter = () => clearTimeout(quotePreviewTimer);
    quotePreview.onpointerleave = hideQuotePreview;
    document.body.append(quotePreview);
    quotePreview.showPopover({source: button});
    const highlights = [...quotePreview.querySelectorAll(".gibbous-quote-highlight")].map(highlight => highlight.getBoundingClientRect());
    if (!highlights.length) return;
    const viewport = quotePreview.getBoundingClientRect();
    const middle = (Math.min(...highlights.map(rect => rect.top)) + Math.max(...highlights.map(rect => rect.bottom))) / 2;
    quotePreview.scrollTop += middle - (viewport.top + viewport.bottom) / 2;
  };

  // Hover previews the other end; a click scrolls to it, loading collapsed comments when needed.
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
      quoteRevealController?.abort();
      const controller = new AbortController();
      quoteRevealController = controller;
      const destination = {context: quoteContextKey, key: target.match.key, sourceId: target.source?.id};
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
    if (!target.sourceId) {
      const body = quoteCommentBody(match.reply);
      return body && quoteBlocks(body)[match.quoteIndex]?.element.getBoundingClientRect();
    }
    const source = match.sources.find(candidate => candidate.id === target.sourceId);
    const body = source && quoteCommentBody(source);
    return body && (isFullQuote(match, source) ? body.getBoundingClientRect() : findQuoteRange(body, match.quote)?.getBoundingClientRect());
  };

  // Scrolls the target just below GitHub's sticky headers.
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

  // Loads "Load more" pages toward the target until it renders, then holds it in place for 15
  // seconds while the page settles around it.
  const revealQuoteTarget = async (target, origin, upward, signal) => {
    const attempted = new Set();
    const deadline = performance.now() + 30_000;
    while (!signal.aborted && performance.now() < deadline) {
      if (scrollQuoteTarget(target)) {
        quoteScrollTarget = target;
        clearTimeout(quoteScrollTimer);
        quoteScrollTimer = setTimeout(releaseQuoteTarget, 15_000);
        return true;
      }
      const buttons = [...document.querySelectorAll(".js-discussion .ajax-pagination-form button[data-disable-with]")]
        .filter(button => !attempted.has(button.form.action) && !button.disabled && button.getClientRects().length);
      const directional = origin ? buttons.filter(button => upward
        ? button.compareDocumentPosition(origin) & Node.DOCUMENT_POSITION_FOLLOWING
        : origin.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
      const button = (upward ? directional.at(-1) : directional[0]) ?? buttons[0];
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

  // A rail in the margin of a comment, level with rect, holding its quote buttons.
  const mountQuoteRail = (body, direction, key, rect) => {
    const className = `gibbous-quote-rail-${direction}`;
    const comment = body.closest(".timeline-comment") ?? body;
    comment.classList.toggle("gibbous-source-comment", true);
    let rail = comment.querySelector(`:scope > .${className}[data-gibbous-rail-key="${key}"]`);
    if (!rail) comment.append(rail = create("span", {class: `gibbous-quote-rail ${className}`, "data-gibbous-rail-key": key}));
    const commentRect = comment.getBoundingClientRect();
    setStyle(rail, "--gibbous-quote-top", `${rect.top - commentRect.top}px`);
    setStyle(rail, "--gibbous-quote-height", `${rect.height}px`);
    return rail;
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
      button = html`<button class="Button Button--invisible Button--small Button--iconOnly gibbous-quote-button gibbous-quote-missing" type="button" disabled>?</button>`;
      rail.append(button);
    }
    sync(button, {"aria-label": label, title: label});
  };

  // Several comments match a quote: a picker of them, remembering the choice.
  const mountQuotePicker = (rail, match, selected) => {
    let button = rail.querySelector(`[data-gibbous-quote-key="${match.key}"]`);
    if (!button) {
      const id = `gibbous-quote-picker-${match.key}`;
      const picker = html`<div id="${id}" class="gibbous-quote-picker color-bg-overlay color-fg-default p-2 rounded-2 border color-shadow-large" popover="auto" aria-label="Matching source comments">
        <strong class="d-block px-2 py-1 text-small">Choose source</strong>
        ${match.sources.map(source => createQuoteLink(
          source,
          `@${source.user} · ${new Date(source.createdAt).toLocaleString()} · ${matchRateLabel(source)}`,
          {
            class: "Button Button--invisible Button--medium d-block width-full text-left gibbous-quote-option",
            "data-gibbous-candidate": source.id,
          },
          {match, source, fullQuote: isFullQuote(match, source)},
          () => {
            quoteChoices = {...quoteChoices, [match.key]: source.id};
            document.querySelectorAll(".gibbous-quote-rail-replies").forEach(node => node.remove());
            picker.hidePopover();
            refreshQuoteLinks();
            void storageSet({quoteChoices}).catch(reportError);
          },
        ))}
      </div>`;
      button = html`<button class="Button Button--invisible Button--small Button--iconOnly gibbous-quote-button" type="button" popovertarget="${id}" data-gibbous-quote-key="${match.key}">↑</button>`;
      rail.append(button, picker);
    }
    const fullQuote = selected && isFullQuote(match, selected);
    const label = selected
      ? `${matchRateLabel(selected)}; ${fullQuote ? "full comment quoted; " : ""}source is @${selected.user}; choose another`
      : `Choose among ${match.sources.length} sources`;
    sync(button, {"aria-label": label, title: label, text: selected ? matchLabel("↑", selected) : "↑"});
    button.classList.toggle("Button--iconOnly", !selected);
    button.onpointerenter = selected ? () => showQuotePreview(button, {match, source: selected, fullQuote}) : null;
    button.onpointerleave = selected ? hideQuotePreview : null;
    button.onfocus = button.onpointerenter;
    button.onblur = button.onpointerleave;
    for (const option of document.getElementById(button.getAttribute("popovertarget")).querySelectorAll("[data-gibbous-candidate]")) {
      sync(option, {"aria-current": String(option.dataset.gibbousCandidate === selected?.id)});
    }
  };

  const timelineSignature = () => [...document.querySelectorAll('.js-discussion [id^="issuecomment-"], .js-discussion form.ajax-pagination-form')]
    .map(node => node.id || node.getAttribute("action")).filter(Boolean).join("|");

  const loadQuoteMatches = async (context, includeHidden = false) => {
    const stored = await storageGet(["quoteChoices", "quoteChunks"]);
    quoteChoices = stored?.quoteChoices ?? quoteChoices;
    if (stored?.quoteChunks?.version === 7 && Date.now() - stored.quoteChunks.savedAt < 30 * MINUTE) {
      for (const [url, chunk] of Object.entries(stored.quoteChunks.chunks)) timelineChunks.set(url, chunk);
    }
    const entries = collectTimeline(document);
    quoteSignature = timelineSignature();
    const hasHidden = entries.some(entry => entry.more);
    const visible = entries.filter(entry => entry.comment).map(entry => entry.comment);
    let comments = visible;
    try {
      if (includeHidden && hasHidden) comments = await expandTimeline(entries);
      quoteHiddenLoaded = includeHidden && hasHidden;
      quoteError = "";
    } catch (error) {
      comments = visible;
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

  const refreshQuoteLinks = () => {
    const context = pullRequestContext();
    if (context?.tab !== "") {
      if (quoteContextKey === undefined) return;
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
      // Resolve lazily: nothing runs until a quoted reply actually scrolls into view.
      quoteObserver ??= new IntersectionObserver(entries => {
        if (quoteLoadRequested || !entries.some(entry => entry.isIntersecting)) return;
        quoteLoadRequested = true;
        quoteObserver.disconnect();
        void loadQuoteMatches(context).catch(error => {
          if (quoteContextKey !== context.key) return;
          quoteError = `Quote links unavailable — ${error.message}`;
          refreshQuoteLinks();
        });
      }, {rootMargin: "200px 0px"});
      const quotes = ".js-discussion .comment-body blockquote, .js-command-palette-pull-body .comment-body blockquote";
      for (const blockquote of document.querySelectorAll(quotes)) quoteObserver.observe(blockquote);
      return;
    }
    // Comments the visitor loaded since we matched are free to fold in: no request needed.
    if (quoteSignature && added('.js-discussion :is([id^="issuecomment-"], form.ajax-pagination-form)').length) {
      const signature = timelineSignature();
      if (signature !== quoteSignature) {
        quoteSignature = signature;
        void loadQuoteMatches(context, quoteHiddenLoaded).catch(reportError);
      }
    }
    const rateLimited = quoteError.includes("rate limit") && "GitHub rate limit (403/429)";

    for (const match of quoteMatches) {
      const {quote, quoteIndex, reply, sources} = match;
      const source = sources.length === 1 ? sources[0] : sources.find(candidate => candidate.id === quoteChoices[match.key]);
      const replyBody = quoteCommentBody(reply);
      const blockquote = replyBody && quoteBlocks(replyBody)[quoteIndex]?.element;
      // The quote GitHub renders must still read as the one matched (it may have been edited).
      if (blockquote && (blockquote.dataset.gibbousQuote ??= quote) === quote) {
        const rail = mountQuoteRail(replyBody, "source", match.key, blockquote.getBoundingClientRect());
        if (!sources.length) mountDisabledQuoteButton(rail, rateLimited || "Source not found (likely edited out)");
        else {
          // A source found later, among collapsed comments, replaces the "not found" button.
          rail.querySelector(".gibbous-quote-missing")?.remove();
          if (sources.length > 1) mountQuotePicker(rail, match, source);
          else mountQuoteLink(rail, match, source, true);
        }
      }
      const sourceBody = source && quoteCommentBody(source);
      const rect = sourceBody && (isFullQuote(match, source) ? sourceBody.getBoundingClientRect() : findQuoteRange(sourceBody, quote)?.getBoundingClientRect());
      if (rect?.height) mountQuoteLink(mountQuoteRail(sourceBody, "replies", match.key, rect), match, source, false);
    }

    if (!quoteMatches.length && quoteError) {
      for (const body of document.querySelectorAll(".js-discussion .comment-body")) {
        quoteBlocks(body).forEach(({element}, quoteIndex) => mountDisabledQuoteButton(
          mountQuoteRail(body, "source", `error:${quoteIndex}`, element.getBoundingClientRect()),
          rateLimited || "Source lookup unavailable",
        ));
      }
    }

    if (!quoteError) quoteStatus?.remove();
    else if (!quoteStatus?.isConnected) {
      quoteStatus = create("div", {class: "flash flash-warn mb-3 gibbous-quote-status", role: "status"}, quoteError);
      document.querySelector(".js-discussion")?.prepend(quoteStatus);
    } else sync(quoteStatus, {text: quoteError});
    if (quoteScrollTarget?.context === context.key) scrollQuoteTarget(quoteScrollTarget);
    else if (quoteScrollTarget) releaseQuoteTarget();
  };

  // My pull requests, open or closed, beside the Pull requests tab.
  let pullRequestShortcuts;
  const readPullRequestState = (context, viewer) => {
    const path = `/${context.nwo}/pulls`;
    const filters = new URLSearchParams(location.search).get("q")?.toLowerCase() ?? "";
    const author = filters.match(/\bauthor:([^\s]+)/)?.[1];
    const mine = location.pathname === `${path}/@me` || author === "@me" || Boolean(author && viewer && author === viewer.toLowerCase());
    if (location.pathname.startsWith(path) && mine) return filters.includes("is:closed") ? "closed" : "open";
  };

  const mountPullRequestShortcuts = (context, viewer) => {
    const pullRequests = [...(repositoryNavigation()?.querySelectorAll("a") ?? [])].find(link => textOf(link).startsWith("Pull requests"));
    const item = pullRequests?.closest("li") ?? pullRequests;
    if (!item) return;
    pullRequestShortcuts ??= html`<li class="gibbous-pull-request-shortcuts">
      ${[["open", "git-pull-request"], ["closed", "git-pull-request-closed"]].map(([state, icon]) => html`<a class="Button Button--invisible Button--small Button--iconOnly gibbous-pull-request-shortcut" data-state="${state}" aria-label="My ${state} pull requests" title="My ${state} pull requests">
        ${createOcticon(icon)}
      </a>`)}
    </li>`;
    if (pullRequestShortcuts.previousElementSibling !== item) item.after(pullRequestShortcuts);
    const active = context && readPullRequestState(context, viewer);
    sync(pullRequestShortcuts, {hidden: (!enabled || !context || !viewer) && ""});
    for (const link of pullRequestShortcuts.children) {
      const state = link.dataset.state;
      sync(link, {href: context ? `/${context.nwo}/pulls?q=${encodeURIComponent(`is:pr is:${state} author:@me`)}` : "#"});
      link.classList.toggle("gibbous-pull-request-shortcut-active", state === active);
    }
  };

  // Pull requests: beside GitHub's +A −D, the count with whitespace ignored (?w=1), or the full
  // count when GitHub's own one is already ignoring whitespace. GitHub's counter is found by its
  // text, not its markup, and only used once its numbers equal the pull request's diff, so the
  // counter never lands on another element or shows an older push.
  const diffstatPattern = /\+(\d[\d,]*)[−–-](\d[\d,]*)/;
  const whitespaceRequests = new Set();
  const swappedNumbers = new Set();
  let whitespaceDiffstat;
  let diffstatSwap;
  let diffstatHost;
  // The whole page is searched again only when what a counter is matched against changed: the
  // counter was lost, or counts arrived. Otherwise only what was added.
  let diffstatSearchAll = false;

  const formatCount = count => count.toLocaleString("en-US");

  // An element's text without what Gibbous adds to it (the counter, and on ?w=1 the swapped
  // numbers), whitespace removed.
  const diffstatText = element => [whitespaceDiffstat, diffstatSwap]
    .reduce((text, own) => own && element.contains(own) ? text.replace(own.textContent, "") : text, element.textContent)
    .replace(/\s+/g, "");

  function* diffstatCandidates(roots) {
    for (const root of roots) yield* diffstatCandidatesIn(root);
  }

  function* diffstatCandidatesIn(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => /^\s*\+[\d,\s]*$/.test(node.data) && !node.parentElement?.closest(".gibbous-whitespace-diffstat, .gibbous-diffstat-swap")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let element = node.parentElement, depth = 0; element && depth < 4; element = element.parentElement, depth++) {
        const text = diffstatText(element);
        if (text.length > 120) break;
        const match = diffstatPattern.exec(text);
        if (!match) continue;
        // GitHub's own number elements, whose look the counter copies. React splits "−" and "258"
        // into separate text nodes, so the minus is the first text after the whole "+1,655".
        const minusWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        minusWalker.currentNode = node;
        let minus;
        for (let read = node.data.replace(/\s+/g, ""), next = minusWalker.nextNode(); next && !minus; next = minusWalker.nextNode()) {
          if (read.length > match[1].length && next.data.trim()) minus = next.parentElement;
          read += next.data.replace(/\s+/g, "");
        }
        // Climb over wrappers that add no text, such as the one around GitHub's five squares.
        while (element.parentElement && element.parentElement !== document.body && diffstatText(element.parentElement) === text) {
          element = element.parentElement;
        }
        yield {element, plus: node.parentElement, minus: minus ?? node.parentElement, text, additions: Number(match[1].replaceAll(",", "")), deletions: Number(match[2].replaceAll(",", ""))};
        break;
      }
    }
  }

  const requestWhitespaceCounts = (context, shown) => {
    const request = `${context.key} ${shown.additions} ${shown.deletions}`;
    if (whitespaceRequests.has(request)) return;
    whitespaceRequests.add(request);
    const message = {type: "countPullRequestDiff", nwo: context.nwo, number: context.number};
    void extensionCall(() => chrome.runtime.sendMessage(message), null).then(counts => {
      if (!counts) return;
      if (counts.error) throw new Error(counts.error);
      cacheSet("whitespaceDiffstat", context.key, counts);
      diffstatSearchAll = true;
      scheduleRefresh();
    }).catch(reportError);
  };

  // GitHub's own numbers come back; only attributes and siblings were added, never its text.
  const restoreDiffstatNumbers = () => {
    diffstatSwap?.remove();
    for (const number of swappedNumbers) number.removeAttribute("data-gibbous-diffstat-swapped");
    swappedNumbers.clear();
  };

  // Same type as GitHub's numbers, whatever its markup: copied from the rendered elements.
  const copyStyle = (target, source, properties = ["font-family", "font-size", "line-height", "font-weight", "color"]) => {
    const computed = getComputedStyle(source);
    for (const property of properties) setStyle(target, property, computed.getPropertyValue(property));
  };

  const refreshWhitespaceDiffstat = () => {
    const context = pullRequestContext();
    if (!context || !enabled || !document.body) {
      whitespaceDiffstat?.remove();
      return restoreDiffstatNumbers();
    }
    const counts = cacheEntry("whitespaceDiffstat", context.key)?.value;
    const showsFull = shown => counts?.additions === shown.additions && counts.deletions === shown.deletions;
    // GitHub's own whitespace-ignored count, from git's diff, can only be at or a few lines above
    // the minimal one counted here, and never above the full count.
    const near = (github, minimal, full) => github >= minimal && github <= full && github - minimal <= Math.max(5, Math.ceil(minimal * 0.02));
    const showsIgnored = shown => Boolean(counts) && !showsFull(shown)
      && near(shown.additions, counts.whitespaceAdditions, counts.additions)
      && near(shown.deletions, counts.whitespaceDeletions, counts.deletions);
    // Keep the last host while it shows the same text. Until one matches the counts, look for
    // GitHub's full count, else its whitespace-ignored one, else the first +A −D to count.
    if (diffstatHost && !(diffstatHost.key === context.key && diffstatHost.element.isConnected && diffstatText(diffstatHost.element) === diffstatHost.text)) {
      diffstatHost = undefined;
      diffstatSearchAll = true;
    }
    if (!diffstatHost || (!showsFull(diffstatHost) && !showsIgnored(diffstatHost))) {
      let first;
      let ignored;
      let full;
      let seen = 0;
      for (const candidate of diffstatCandidates(diffstatSearchAll ? [document.body] : addedRoots)) {
        first ??= candidate;
        if (showsFull(candidate)) {
          full = candidate;
          break;
        }
        if (showsIgnored(candidate)) ignored ??= candidate;
        if (++seen >= 20) break;
      }
      diffstatSearchAll = false;
      const pick = full ?? ignored ?? (diffstatHost ? undefined : first);
      if (pick) diffstatHost = {...pick, key: context.key};
    }
    const host = diffstatHost;
    if (!host) return;
    const full = showsFull(host);
    if (!full && !showsIgnored(host)) {
      // Count this host's numbers once, and keep it until counts arrive or a host that matches.
      whitespaceDiffstat?.remove();
      restoreDiffstatNumbers();
      requestWhitespaceCounts(context, host);
      return;
    }
    // Close but not equal: shown the same, and counted again once in case the counts are stale.
    if (!full && (host.additions !== counts.whitespaceAdditions || host.deletions !== counts.whitespaceDeletions)) {
      requestWhitespaceCounts(context, host);
    }
    whitespaceDiffstat ??= html`<a class="gibbous-whitespace-diffstat">
      <span class="gibbous-whitespace-diffstat-label"></span><span class="gibbous-whitespace-diffstat-additions"></span><span class="gibbous-whitespace-diffstat-deletions"></span>
    </a>`;
    const [label, additions, deletions] = whitespaceDiffstat.children;
    const type = ["font-family", "font-size", "line-height"];
    copyStyle(whitespaceDiffstat, host.plus, type);
    copyStyle(label, host.plus, type);
    copyStyle(additions, host.plus);
    copyStyle(deletions, host.minus);
    // GitHub showing its whitespace-ignored count means whitespace is hidden, even when only a
    // saved setting, not ?w=1, says so.
    const hiding = !full || ["1", "true"].includes(new URLSearchParams(location.search).get("w"));
    // GitHub keeps its full count on ?w=1. Then the two swap: its numbers show the count of the
    // diff being viewed, and the counter the full one, labeled. Its number elements are hidden and
    // a copy takes their place, so its own text is never rewritten under React.
    const swap = full && hiding
      && (host.plus === host.minus || (!host.plus.contains(host.minus) && !host.minus.contains(host.plus)))
      && ![host.plus, host.minus].some(number => number.contains(host.element));
    if (swap) {
      diffstatSwap ??= html`<span class="gibbous-diffstat-swap"><span></span> <span></span></span>`;
      const [swapAdditions, swapDeletions] = diffstatSwap.querySelectorAll("span");
      copyStyle(swapAdditions, host.plus);
      copyStyle(swapDeletions, host.minus);
      sync(swapAdditions, {text: `+${formatCount(counts.whitespaceAdditions)}`});
      sync(swapDeletions, {text: `−${formatCount(counts.whitespaceDeletions)}`});
      sync(diffstatSwap, {title: "Lines changed with whitespace changes ignored, as in this diff"});
      for (const number of swappedNumbers) {
        if (number !== host.plus && number !== host.minus) number.removeAttribute("data-gibbous-diffstat-swapped");
      }
      swappedNumbers.clear();
      for (const number of [host.plus, host.minus]) {
        swappedNumbers.add(number);
        sync(number, {"data-gibbous-diffstat-swapped": ""});
      }
      if (diffstatSwap.nextSibling !== host.plus) host.plus.before(diffstatSwap);
    } else restoreDiffstatNumbers();
    // The counter shows whichever count GitHub's slot does not, and links to the other view of the
    // diff being viewed (files, or changes in the new view); from the other tabs, to the files.
    const ignoring = full && !swap;
    const onDiff = ["files", "changes"].includes(context.tab);
    const url = new URL(onDiff ? location.pathname + location.search : `/${context.nwo}/pull/${context.number}/files`, location.origin);
    url.searchParams.set("w", hiding ? "0" : "1");
    sync(label, {text: ignoring ? "ignoring whitespace" : "with whitespace"});
    sync(additions, {text: `+${formatCount(ignoring ? counts.whitespaceAdditions : counts.additions)}`});
    sync(deletions, {text: `−${formatCount(ignoring ? counts.whitespaceDeletions : counts.deletions)}`});
    sync(whitespaceDiffstat, {
      href: url.pathname + url.search,
      title: `${ignoring ? "Lines changed with whitespace changes ignored" : "Lines changed counting whitespace changes"}. `
        + `Click to ${hiding ? "show" : "hide"} whitespace in the diff.`,
    });
    if (host.element.lastChild !== whitespaceDiffstat) host.element.append(whitespaceDiffstat);
  };

  // Pull request diffs: a Viewed button on each hunk, in a column under GitHub's Viewed button for
  // the file (placed by the stylesheet). A viewed hunk folds to its @@ row; lines expanded around
  // it stay, as they are outside its @@ range. A hunk is known by its pull request, file and
  // changed lines, so a push that changes it shows it again, and one that only moves it does not.
  // Rows are tagged with their hunk once, as they are added; folding is a stylesheet naming the
  // viewed hunks, so a click changes one rule and walks no rows.
  const VIEWED_HUNK_LIMIT = 5000;
  let viewedHunks = new Set();
  // Clicks not yet stored: they win over what storage reports until their own write lands, so a
  // quick second click is not undone by the first one's write.
  const pendingHunks = new Map();
  const hunkStyle = create("style", {id: "gibbous-hunks", "data-pull-request": ""});
  const hunkViewed = key => pendingHunks.get(key) ?? viewedHunks.has(key);
  const hunkTitle = viewed => viewed ? "Unfold this hunk" : "Mark this hunk viewed and fold it";

  const renderViewedHunks = () => {
    const pullRequest = pullRequestContext()?.key ?? "";
    const keys = [...new Set([...viewedHunks, ...pendingHunks.keys()])].filter(key => key.startsWith(`${pullRequest} `) && hunkViewed(key));
    sync(hunkStyle, {
      "data-pull-request": pullRequest,
      text: keys.length ? `html:not([data-gibbous-disabled]) :is(${keys.map(key => `tr[data-gibbous-hunk=${cssString(key)}]`).join(",")}) { display: none; }` : "",
    });
    if (keys.length && !hunkStyle.isConnected) (document.head ?? root).append(hunkStyle);
    for (const button of document.querySelectorAll(".gibbous-hunk-viewed")) {
      const viewed = hunkViewed(button.dataset.hunk);
      sync(button, {"aria-pressed": String(viewed), title: hunkTitle(viewed)});
    }
  };
  const setViewedHunks = keys => {
    viewedHunks = new Set(keys);
    renderViewedHunks();
  };
  const toggleViewedHunk = (key, viewed) => {
    pendingHunks.set(key, viewed);
    renderViewedHunks();
    const update = keys => (viewed ? [...keys, key] : keys.filter(other => other !== key)).slice(-VIEWED_HUNK_LIMIT);
    updateStoredNames("viewedHunks", update, keys => {
      if (pendingHunks.get(key) === viewed) pendingHunks.delete(key);
      setViewedHunks(keys);
    });
  };
  // FNV-1a, 32 bits.
  const hash = text => {
    let value = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
    return (value >>> 0).toString(36);
  };

  // GitHub's file Viewed button, sized to the @@ row; the check shows once pressed.
  const createHunkButton = header => {
    const button = html`<button class="gibbous-hunk-viewed" type="button">
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><rect x="1.75" y="1.75" width="12.5" height="12.5" rx="1"></rect><path d="m4.75 8.25 2 2 4.5-4.5"></path></svg>
      Viewed
    </button>`;
    button.onclick = () => toggleViewedHunk(button.dataset.hunk, button.getAttribute("aria-pressed") !== "true");
    // Kept from GitHub's grid, which handles clicks and keys in its cells.
    for (const type of ["click", "keydown"]) button.addEventListener(type, event => event.stopPropagation());
    (header.firstElementChild ?? header).append(button);
    return button;
  };

  // A file's hunks: each @@ row and the rows in its range, read from the cells.
  const readHunkTable = (context, table) => {
    const hunks = [];
    for (const row of table.rows) {
      let header;
      const lines = {};
      for (const cell of row.cells) {
        if (cell.classList.contains("diff-hunk-cell")) header = cell;
        else if (cell.dataset.lineNumber) lines[cell.dataset.diffSide] = Number(cell.dataset.lineNumber);
      }
      const range = header && /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(textOf(header.querySelector("code") ?? header));
      if (range) {
        hunks.push({header, range: range.slice(1).map(number => Number(number ?? 1)), rows: []});
        continue;
      }
      const [oldStart, oldCount, newStart, newCount] = hunks.at(-1)?.range ?? [];
      const within = (number, start, count) => number >= start && number < start + count;
      if (within(lines.left, oldStart, oldCount) || within(lines.right, newStart, newCount)) hunks.at(-1).rows.push(row);
      else sync(row, {"data-gibbous-hunk": null});
    }
    const seen = new Map();
    for (const {header, rows} of hunks) {
      // Deletions and additions apart, so the split and unified views agree.
      const changed = rows.flatMap(row => [...row.querySelectorAll("code.deletion, code.addition")]);
      const text = kind => changed.filter(code => code.classList.contains(kind)).map(code => code.textContent).join("\n");
      const content = hash(`${table.dataset.diffAnchor}\n${text("deletion")}\0${text("addition")}`);
      // The same change twice in a file: each its own hunk.
      const occurrence = seen.get(content) ?? 0;
      seen.set(content, occurrence + 1);
      const key = `${context.key} ${content}${occurrence ? `.${occurrence}` : ""}`;
      const button = header.querySelector(".gibbous-hunk-viewed") ?? createHunkButton(header);
      sync(button, {"data-hunk": key, "aria-pressed": String(hunkViewed(key)), title: hunkTitle(hunkViewed(key))});
      for (const row of rows) sync(row, {"data-gibbous-hunk": key});
    }
  };

  // Files as they are added, and again when rows are added to them or GitHub redraws an @@ row.
  const refreshHunks = () => {
    const context = pullRequestContext();
    if (hunkStyle.dataset.pullRequest !== (context?.key ?? "")) renderViewedHunks();
    if (!context) return;
    const tables = added("table[data-diff-anchor], table[data-diff-anchor] :is(tr, .diff-hunk-cell > *)")
      .map(node => node.closest("table[data-diff-anchor]"));
    for (const table of new Set(tables)) readHunkTable(context, table);
  };

  // Top repositories, in the dashboard (new and classic) and in the global navigation drawer:
  // the viewer's forks of listed repositories first, a fork shortcut beside each, a hide button on
  // every row, and the list expanded while there is room.
  const expandingRepositoryLists = new WeakSet();
  const repositoryExpansionAttempts = new WeakMap();
  const topRepositoryOrders = new WeakMap();
  const hiddenRepositoryControls = new WeakMap();
  const knownRepositoryForks = new Map();
  const queuedRepositoryForks = new Set();
  const repositoryForkQueue = [];
  let resolvingRepositoryForks = false;
  const showMorePattern = /^Show (?:even )?more$/i;

  // The /owner/name of a repository link, split.
  const repositoryMatch = repository => repository.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);

  const repositoryEntries = (list, selector) => [...list.querySelectorAll(":scope > li")].flatMap(row => {
    const repository = [...row.querySelectorAll(selector ?? "a[href]")].find(link => link.closest("li") === row && (selector
      || (!link.classList.contains("gibbous-repository-fork") && repositoryMatch(link) && link.textContent.trim())));
    return repository ? [{repository, row}] : [];
  });

  const repositorySurface = (kind, root, list, selector) => ({
    kind,
    root,
    list,
    entries: () => repositoryEntries(list, selector),
    button: () => root.querySelector('[data-testid="dynamic-side-panel-items-show-more"]')
      ?? [...root.querySelectorAll("button")].find(candidate => showMorePattern.test(candidate.textContent.trim())),
    searchButton: () => root.querySelector('[data-testid="dynamic-side-panel-items-search-button"], button:has(svg.octicon-search), a[href="/new"]'),
  });

  // The navigation drawers that list repositories, found as they open.
  const drawers = new Set();
  const topRepositorySelector = '[data-testid="dynamic-side-panel-items-item"]';
  const noteDrawers = () => {
    for (const item of added(topRepositorySelector)) {
      const dialog = item.closest('[role="dialog"]');
      if (dialog) drawers.add(dialog);
    }
    for (const drawer of drawers) if (!drawer.isConnected) drawers.delete(drawer);
  };

  const topRepositorySurfaces = () => {
    const selector = topRepositorySelector;
    const onDashboard = ["/", "/dashboard"].includes(location.pathname);
    const items = [...drawers, ...onDashboard ? [document] : []].flatMap(container => [...container.querySelectorAll(selector)]);
    const lists = new Set(items.map(repository => repository.closest("ul")).filter(Boolean));
    const surfaces = [...lists].flatMap(list => {
      const dialog = list.closest('[role="dialog"]');
      const root = dialog ?? list.closest('[data-testid="dashboard-repositories"], .feed-left-sidebar');
      return root ? [repositorySurface(dialog ? "drawer" : "dashboard", root, list, selector)] : [];
    });
    if (onDashboard) {
      const root = document.querySelector('[data-testid="dashboard-repositories"]') ?? document.querySelector(".feed-left-sidebar .js-repos-container");
      const list = root && [...root.querySelectorAll("ul")].find(candidate => repositoryEntries(candidate).length);
      if (list && !lists.has(list)) surfaces.push(repositorySurface("dashboard", root, list));
    }
    return surfaces;
  };

  // Clicks "Show more" up to four times while the list's end is on screen with room to spare.
  const expandRepositoryList = async surface => {
    if (!enabled || !surface.button() || expandingRepositoryLists.has(surface.root)) return;
    expandingRepositoryLists.add(surface.root);
    try {
      for (let expansion = 0; expansion < 4; expansion += 1) {
        const button = surface.button();
        if (!enabled || !surface.root.isConnected || !button || button.disabled) return;
        const attempts = repositoryExpansionAttempts.get(surface.root) ?? 0;
        if (attempts >= 4) return;
        const availableBottom = surface.kind === "dashboard" ? innerHeight : Math.min(surface.root.getBoundingClientRect().bottom, innerHeight);
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

  const expandTopRepositories = () => {
    for (const surface of topRepositorySurfaces()) void expandRepositoryList(surface);
  };

  // Forks first, then the viewer's own repositories, then the rest, each in GitHub's order, by CSS
  // order so GitHub's own DOM stays as it rendered it.
  const sortTopRepositories = (entries, viewer, forkedRepositories) => {
    const list = entries[0]?.row.parentElement;
    if (!list || entries.some(({row}) => row.parentElement !== list)) return;
    if (!enabled) {
      list.classList.remove("gibbous-top-repositories-list");
      for (const {row} of entries) row.style.removeProperty("--gibbous-repository-order");
      return;
    }
    const originalOrder = topRepositoryOrders.get(list) ?? new Map();
    topRepositoryOrders.set(list, originalOrder);
    for (const {repository} of entries) {
      if (!originalOrder.has(repository.pathname)) originalOrder.set(repository.pathname, originalOrder.size);
    }
    const category = ({repository, row}) => forkedRepositories.has(row) ? 0
      : repository.pathname.match(/^\/([^/]+)\//)?.[1].toLowerCase() === viewer ? 1 : 2;
    const sorted = [...entries].sort((left, right) => category(left) - category(right)
      || originalOrder.get(left.repository.pathname) - originalOrder.get(right.repository.pathname));
    const firstSort = !list.classList.contains("gibbous-top-repositories-list");
    const scroller = list.closest('[data-component="ScrollableRegion"], .js-left-column-scroll-container, [role="dialog"]');
    const scrollTop = scroller?.scrollTop;
    scroller?.classList.toggle("gibbous-top-repositories-scroll", true);
    list.classList.toggle("gibbous-top-repositories-list", true);
    const rows = new Map(sorted.map(({row}, index) => [row, index + 1]));
    for (const child of list.children) {
      const button = child.querySelector("button");
      const showMore = button && showMorePattern.test(button.textContent.trim());
      setStyle(child, "--gibbous-repository-order", String(rows.get(child) ?? (showMore ? sorted.length + 1 : 0)));
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
    const candidate = response.ok && readRepositoryContext(new DOMParser().parseFromString(await response.text(), "text/html"));
    return candidate?.isFork && candidate.rootNwo.toLowerCase() === rootNwo.toLowerCase() ? candidate.nwo : null;
  };

  // Dashboard repositories the viewer may have forked, looked up three at a time.
  const queueRepositoryForkLookups = (entries, viewer) => {
    if (!enabled || !viewer) return;
    for (const {repository} of entries) {
      const match = repositoryMatch(repository);
      if (!match || match[1].toLowerCase() === viewer) continue;
      const key = `${match[1]}/${match[2]}`.toLowerCase();
      const entry = cacheEntry("forks", key);
      if (queuedRepositoryForks.has(key) || (knownRepositoryForks.has(key) && (!entry || cacheFresh(entry, entry.value ? 24 * 60 * MINUTE : 10 * MINUTE)))) continue;
      queuedRepositoryForks.add(key);
      repositoryForkQueue.push({key, rootNwo: `${match[1]}/${match[2]}`, candidateNwo: `${viewer}/${match[2]}`});
    }
    if (!repositoryForkQueue.length || resolvingRepositoryForks) return;
    resolvingRepositoryForks = true;
    void (async () => {
      while (repositoryForkQueue.length) {
        await Promise.all(repositoryForkQueue.splice(0, 3).map(async ({key, candidateNwo, rootNwo}) => {
          try {
            const nwo = await fetchFork(candidateNwo, rootNwo, AbortSignal.timeout(5000));
            knownRepositoryForks.set(key, nwo && `/${nwo}`);
            cacheSet("forks", key, nwo && `/${nwo}`);
          } catch {
            if (!knownRepositoryForks.has(key)) knownRepositoryForks.set(key, null);
          }
        }));
        mountTopRepositories();
      }
    })().catch(reportError).finally(() => resolvingRepositoryForks = false);
  };

  const mountTopRepositories = () => {
    const viewer = viewerLogin()?.toLowerCase();
    const context = readRepositoryContext();
    const surfaces = topRepositorySurfaces();
    const allEntries = surfaces.flatMap(surface => surface.entries());
    const ownedName = ({repository}) => {
      const match = repositoryMatch(repository);
      return match?.[1].toLowerCase() === viewer ? match[2].toLowerCase() : undefined;
    };
    // A fork listed anywhere names the repository it forks in every list.
    const allOwned = new Map(allEntries.filter(ownedName).map(entry => [ownedName(entry), entry.repository]));
    for (const {repository} of allEntries) {
      const match = repositoryMatch(repository);
      const fork = match && match[1].toLowerCase() !== viewer && allOwned.get(match[2].toLowerCase());
      if (fork) knownRepositoryForks.set(`${match[1]}/${match[2]}`.toLowerCase(), fork.pathname);
    }
    const hidden = new Set(hiddenRepositories);
    const forkedRepositories = new Set();
    const representedForks = new Set();
    for (const surface of surfaces) {
      const searchButton = surface.searchButton();
      if (searchButton) {
        let control = hiddenRepositoryControls.get(surface.root);
        if (!control?.element.isConnected) {
          control = createHiddenItemsControl({
            title: "Hidden repositories",
            items: () => hiddenRepositories,
            onShow: name => updateHiddenRepository(name, false),
            className: "gibbous-hidden-repositories-control",
          });
          hiddenRepositoryControls.set(surface.root, control);
        }
        placeHiddenItemsControl(control, searchButton);
      }
      const entries = surface.entries();
      const owned = new Map(entries.filter(ownedName).map(entry => [ownedName(entry), entry]));
      const surfaceForks = new Set();
      for (const {repository, row} of entries) {
        repository.classList.toggle("gibbous-top-repository-link", true);
        const match = repositoryMatch(repository);
        if (!match) continue;
        const nwo = `${match[1]}/${match[2]}`;
        const key = nwo.toLowerCase();
        row.classList.toggle("gibbous-repository-excluded", hidden.has(key));
        const hide = row.querySelector(":scope > .gibbous-hide-repository")
          ?? createHideButton(nwo, "gibbous-hide-repository", () => updateHiddenRepository(key, true));
        const existingFork = row.querySelector(":scope > .gibbous-repository-fork");
        if (hide.parentElement !== row || hide.nextElementSibling !== existingFork) row.insertBefore(hide, existingFork);
        if (!enabled || match[1].toLowerCase() === viewer) continue;
        const fork = owned.get(match[2].toLowerCase());
        if (context?.nwo.toLowerCase() === key && userFork) knownRepositoryForks.set(key, `/${userFork}`);
        const href = fork?.repository.pathname ?? knownRepositoryForks.get(key);
        if (!href) continue;
        surfaceForks.add(row);
        forkedRepositories.add(row);
        if (fork) representedForks.add(fork.row);
        const action = existingFork
          ?? html`<a class="Button Button--invisible Button--small Button--iconOnly gibbous-repository-fork">${createOcticon("repo-forked")}</a>`;
        sync(action, {href, title: `Open your fork: ${href.slice(1)}`, "aria-label": `Open your fork: ${href.slice(1)}`});
        if (action !== row.lastElementChild) row.append(action);
      }
      sortTopRepositories(entries, viewer, surfaceForks);
      if (surface.kind === "dashboard") queueRepositoryForkLookups(entries, viewer);
    }
    // Within the lists only: what Gibbous added anywhere else left with the list it was in.
    const rows = new Set(allEntries.map(({row}) => row));
    const controls = new Set(surfaces.map(surface => hiddenRepositoryControls.get(surface.root)?.element));
    const within = selector => surfaces.flatMap(surface => [...surface.root.querySelectorAll(selector)]);
    within(".gibbous-repository-fork").forEach(action => forkedRepositories.has(action.parentElement) || action.remove());
    within(".gibbous-hide-repository").forEach(hide => rows.has(hide.parentElement) || hide.remove());
    within(".gibbous-hidden-repositories-control").forEach(element => controls.has(element) || element.remove());
    within(".gibbous-represented-fork").forEach(row => representedForks.has(row) || row.classList.remove("gibbous-represented-fork"));
    for (const row of representedForks) row.classList.toggle("gibbous-represented-fork", true);
  };

  // Your fork of the repository being viewed, linked under its title.
  let forkLookup;
  let userFork;
  let forkedIn;
  const updateFork = () => {
    mountTopRepositories();
    updateRepositoryInsider();
    if (!forkedIn) return;
    sync(forkedIn, {hidden: (!enabled || !userFork) && ""});
    sync(forkedIn.lastChild, {
      text: userFork ?? "",
      href: userFork ? `/${userFork}` : "#",
      "data-hovercard-url": userFork ? `/${userFork}/hovercard` : "",
    });
  };

  const mountForkedIn = () => {
    const legacyTitle = document.getElementById("repository-container-header")?.querySelector('strong[itemprop="name"]');
    const title = document.getElementById("repo-title-component") ?? legacyTitle?.parentElement?.parentElement;
    if (!title) return;
    forkedIn ??= html`<span class="gibbous-forked-in text-small lh-condensed-ultra no-wrap mt-1" data-repository-hovercards-enabled="">
      forked in <a class="Link--inTextBlock" data-hovercard-type="repository"></a>
    </span>`;
    if (forkedIn.parentElement !== title) title.append(forkedIn);
    updateFork();
  };

  const resolveUserFork = (context, viewer) => {
    const lookup = `${viewer}|${context.nwo}|${context.rootNwo}`;
    if (lookup === forkLookup) return;
    forkLookup = lookup;
    userFork = undefined;
    updateFork();
    const candidateNwo = `${viewer}/${context.rootNwo.split("/").at(-1)}`;
    if (!viewer || context.isFork || candidateNwo.toLowerCase() === context.nwo.toLowerCase()) return;
    const maxAge = cacheEntry("userForks", lookup)?.value ? 24 * 60 * MINUTE : 10 * MINUTE;
    const known = cached("userForks", lookup, maxAge, () => fetchFork(candidateNwo, context.rootNwo), fresh => {
      if (forkLookup !== lookup) return;
      userFork = fresh ?? undefined;
      updateFork();
    });
    if (known) {
      userFork = known;
      updateFork();
    }
  };

  // Gibbous tabs in the README bar: "My pull requests" when the viewer has open pull requests here
  // (it opens first) and, behind the insider gate, Contributors and Languages lifted out of the
  // sidebar. While any is mounted the secondary file tabs collapse into a menu.
  let myPullRequestsLookup;
  const readmeNavigation = () => document.querySelector('nav[aria-label="Repository files"]');

  // GitHub's label colors as the CSS variables its IssueLabel styles read.
  const labelStyle = hex => {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    if (Number.isNaN(value)) return "";
    const [r, g, b] = [value >> 16 & 255, value >> 8 & 255, value & 255];
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
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return `--label-r:${r};--label-g:${g};--label-b:${b};--label-h:${h};--label-s:${Math.round(s * 100)};--label-l:${Math.round(l * 100)};`;
  };
  const labels = items => (items ?? []).map(label => ({name: label.name, style: labelStyle(label.color ?? "")}));

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
      labels: labels(item.labels),
    }));
  };

  // The pulls page is client-rendered; its embedded payload lists the matching pull requests.
  const fetchMyPullRequests = async (context, viewer) => {
    try {
      return (await searchIssues(`repo:${context.nwo} is:pr is:open author:${viewer}`, 50)).filter(item => item.pullRequest);
    } catch (error) {
      reportError(error);
      const query = encodeURIComponent(`is:pr is:open author:${viewer} sort:updated-desc`);
      const script = [...(await fetchPage(`/${context.nwo}/pulls?q=${query}`)).querySelectorAll('script[type="application/json"]')]
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
        labels: labels(item.labels),
      }));
    }
  };

  const itemIcon = item => item.pullRequest === false ? "issue-opened" : item.draft ? "git-pull-request-draft" : "git-pull-request";
  const commentsLink = (item, className) => item.comments
    ? html`<a class="${className}" href="${item.url}" aria-label="${item.comments} comments">${createOcticon("comment")}<span>${item.comments}</span></a>`
    : "";
  const relativeTime = datetime => html`<relative-time datetime="${datetime}">${new Date(datetime).toLocaleDateString()}</relative-time>`;

  const renderMyPullRequestRow = item => html`<div class="Box-row d-flex gibbous-my-pull">
    <span class="flex-shrink-0 pt-1 ${item.draft ? "color-fg-muted" : "color-fg-open"}" aria-label="${item.draft ? "Draft pull request" : "Open pull request"}">
      ${createOcticon(itemIcon(item))}
    </span>
    <div class="flex-auto min-width-0 px-2">
      <a class="Link--primary v-align-middle no-underline h4 markdown-title" href="${item.url}">${item.title}</a>
      ${item.labels.length ? html`<span class="lh-default d-block d-md-inline ml-md-1">
        ${item.labels.map(label => html`<span class="IssueLabel hx_IssueLabel v-align-middle" style="${label.style}">${label.name}</span>`)}
      </span>` : ""}
      <div class="mt-1 text-small color-fg-muted">
        #${item.number}${item.openedAt ? html`<span> opened ${relativeTime(item.openedAt)}</span>` : ""}${item.author ? ` by ${item.author}` : ""}
      </div>
    </div>
    ${commentsLink(item, "Link--muted flex-shrink-0 d-inline-flex gap-1 pt-1 text-small text-bold")}
  </div>`;

  // While a Gibbous tab is showing, GitHub's current tab gives up aria-current (its underline);
  // it gets it back on return unless GitHub has since marked another tab current.
  const selectRepositoryTab = (box, name) => {
    if (name) box.dataset.gibbousTab = name;
    else delete box.dataset.gibbousTab;
    const links = [...readmeNavigation()?.querySelectorAll("a") ?? []];
    const github = links.filter(link => !link.classList.contains("gibbous-tab-link"));
    for (const link of links) {
      if (link.classList.contains("gibbous-tab-link")) sync(link, {"aria-current": link.dataset.tab === name && "page"});
      else if (name && link.hasAttribute("aria-current")) {
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
    if (root.hasAttribute("data-gibbous-repository-insider")) {
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

    const linkClass = readmeItem.querySelector("a").className;
    readmeItem.after(...tabs.map(({name, label, icon, count, href}) => {
      const tab = html`<li class="${readmeItem.className} gibbous-tab">
        <a class="${linkClass} gibbous-tab-link" data-tab="${name}" href="${href}">
          <span data-component="icon">${createOcticon(icon)}</span><span data-component="text">${label}</span>${count ? html`<span class="Counter ml-1">${count}</span>` : ""}
        </a>
      </li>`;
      tab.firstChild.onclick = event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
        event.preventDefault();
        selectRepositoryTab(box, name);
      };
      return tab;
    }));

    // One menu replaces GitHub's Outline button: the collapsed file tabs, then the outline of
    // whichever document is showing. Reuse GitHub's own icon so nothing looks foreign.
    const fileTab = (root, name) => root?.querySelector(`a [data-content="${name}"]`)?.closest("a");
    const outlineIcon = header.querySelector('button[aria-label="Outline"]')?.querySelector("svg")?.cloneNode(true) ?? createOcticon("list-unordered");
    const menu = html`<details class="details-reset details-overlay gibbous-readme-menu">
      <summary class="Button Button--invisible Button--iconOnly Button--medium" aria-label="Files and outline" title="Files and outline">${outlineIcon}</summary>
      <div class="gibbous-readme-menu-list" role="menu">
        ${[...list.querySelectorAll("a [data-content]")].map(label => label.dataset.content).filter(name => name !== "README").map(name => {
          const entry = html`<button class="gibbous-readme-menu-item" type="button" role="menuitem">
            ${[...fileTab(list, name).children].map(child => child.cloneNode(true))}
          </button>`;
          entry.onclick = () => {
            closeMenu();
            // GitHub may have re-rendered the tab since we mounted; find the live anchor by name.
            fileTab(readmeNavigation(), name)?.click();
          };
          return entry;
        })}
        <div class="gibbous-readme-menu-outline" role="group" aria-label="Outline"></div>
      </div>
    </details>`;
    const outline = menu.lastChild.lastChild;
    const closeMenu = () => {
      menu.removeAttribute("open");
      selectRepositoryTab(box, null);
    };
    menu.ontoggle = () => {
      if (!menu.open) return;
      const headings = [...box.querySelectorAll("article.markdown-body :is(h1, h2, h3, h4, h5, h6)")]
        .map(heading => ({heading, anchor: heading.parentElement?.querySelector("a.anchor[href]") ?? heading.querySelector("a.anchor[href]")}))
        .filter(({anchor}) => anchor);
      outline.replaceChildren(...(headings.length ? [html`<div class="gibbous-readme-menu-divider" role="separator"></div>`] : []), ...headings.map(({heading, anchor}) => {
        const entry = html`<a class="gibbous-readme-menu-item" role="menuitem" href="${anchor.getAttribute("href")}" style="--outline-level: ${heading.tagName.slice(1)}">
          ${heading.textContent.trim()}
        </a>`;
        entry.onclick = closeMenu;
        return entry;
      }));
    };
    header.append(menu);

    if (!navigation.dataset.gibbousTabsListener) {
      navigation.dataset.gibbousTabsListener = "";
      navigation.addEventListener("click", event => {
        const link = event.target instanceof Element && event.target.closest("a");
        if (link && !link.classList.contains("gibbous-tab-link") && list.contains(link)) selectRepositoryTab(box, null);
      });
    }

    // Plain navigation in the panels: Turbo cannot load their links into the code view's frame.
    header.after(...tabs.map(({name}) => html`<div class="gibbous-tab-panel" data-tab="${name}" data-turbo="false">
      ${name === "pulls" ? pulls.map(renderMyPullRequestRow) : []}
    </div>`));
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
    mountRepositoryTabs(context, cached("myPulls", lookup, 5 * MINUTE, () => fetchMyPullRequests(context, viewer), fresh => {
      if (myPullRequestsLookup === lookup && box.isConnected) mountRepositoryTabs(context, fresh);
    }));
  };

  // Classic dashboard with Gibbous on: replace the feed column with the same "Pull requests" and
  // "Issues" lists the new dashboard shows, so both dashboards render the one Gibbous experience.
  let classicDashboardLookup;
  let classicDashboard;

  const renderDashboardRow = item => html`<div class="gibbous-dashboard-row">
    <span class="${item.pullRequest && item.draft ? "color-fg-muted" : "color-fg-open"}" aria-hidden="true">${createOcticon(itemIcon(item))}</span>
    <div class="gibbous-dashboard-copy">
      <a class="Link--primary gibbous-dashboard-title" href="${item.url}">${item.title}</a>
      <div class="gibbous-dashboard-meta">${item.nwo}#${item.number} · Opened by ${item.author} · Updated ${relativeTime(item.updatedAt)}</div>
    </div>
    ${commentsLink(item, "Link--muted gibbous-dashboard-comments")}
  </div>`;

  // Until the first result arrives, a section shows a skeleton row.
  const renderDashboardSection = (title, href, items, empty) => html`<section class="gibbous-dashboard-section">
    <div class="gibbous-dashboard-heading"><h2>${title}</h2><a class="Link--primary" href="${href}">View all</a></div>
    <div class="Box gibbous-dashboard-list">
      ${!items ? html`<div class="gibbous-dashboard-row">
        <div class="gibbous-dashboard-copy"><div class="gibbous-dashboard-skeleton"></div><div class="gibbous-dashboard-skeleton" style="width: 35%"></div></div>
      </div>` : items.length ? items.map(renderDashboardRow) : html`<div class="gibbous-dashboard-empty">${empty}</div>`}
    </div>
  </section>`;

  const mountClassicDashboard = () => {
    const onClassic = ["/", "/dashboard"].includes(location.pathname) && !document.querySelector('[data-testid="dashboard-repositories"]')
      && document.querySelector(".feed-left-sidebar .js-repos-container");
    const main = onClassic && document.querySelector(".feed-main > main, .feed-content main");
    const existing = classicDashboard?.isConnected ? classicDashboard : undefined;
    root.toggleAttribute("data-gibbous-classic-dashboard", Boolean(main && enabled));
    if (!main || !enabled) {
      existing?.remove();
      classicDashboardLookup = undefined;
      return;
    }
    const viewer = viewerLogin();
    if (!viewer || (existing?.isConnected && classicDashboardLookup === viewer)) return;
    classicDashboardLookup = viewer;
    const container = classicDashboard = existing ?? create("div", {class: "gibbous-classic-dashboard"});
    if (container.parentElement !== main) main.prepend(container);
    const render = ({pulls, issues}) => container.replaceChildren(
      renderDashboardSection("Pull requests", `/pulls?q=${encodeURIComponent("is:open is:pr author:@me")}`, pulls, "No pull requests found, try a different filter."),
      renderDashboardSection("Issues", `/issues?q=${encodeURIComponent("is:open is:issue involves:@me")}`, issues, "No issues found, try a different filter."),
    );
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const fetchItems = async () => {
      const [pulls, issues] = await Promise.all([`is:pr author:${viewer}`, `is:issue involves:${viewer}`]
        .map(scope => searchIssues(`${scope} is:open updated:>=${since}`, 10)));
      return {pulls, issues};
    };
    const items = cached("dashboard", viewer, 5 * MINUTE, fetchItems, fresh => {
      if (container.isConnected && classicDashboardLookup === viewer) render(fresh);
    });
    if (items || !container.childElementCount) render(items ?? {});
  };

  const refreshRepository = () => {
    const pageContext = readRepositoryContext();
    const table = pageContext && onCodeView() && document.querySelector('table[aria-labelledby="folders-and-files"]');
    const context = table && pageContext;
    const viewer = viewerLogin();
    if (pageContext) markRepositoryTabs();
    mountPullRequestShortcuts(pageContext, viewer);
    mountSidebarTags();
    if (!context) {
      // Once, on leaving the file table.
      if (repositoryKey === undefined && forkLookup === undefined) return;
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
    const codeButton = (table.closest("#repo-content-pjax-container, #repo-content-turbo-frame") ?? document)
      .querySelector('button[data-component="Button"]:has(svg.octicon-code), summary:has(svg.octicon-code)');
    if (codeButton) {
      if (!hiddenFilesControl?.element.isConnected) {
        hiddenFilesControl = createHiddenItemsControl({
          title: "Hidden files",
          detail: () => repositoryKey ?? "",
          items: () => hiddenNames,
          onShow: name => updateHiddenName(name, false),
          className: "gibbous-hidden-files-control",
          size: "medium",
          variant: "secondary",
        });
      }
      placeHiddenItemsControl(hiddenFilesControl, codeButton);
    }
    void loadHiddenNames().catch(reportError);
    refreshMyPullRequests(context, viewer);
    if (enabled) {
      refreshRows();
      resolveUserFork(context, viewer);
    }
  };

  // The 🌔/🌘 button in GitHub's header turns every tweak on or off.
  let control;
  const updateControl = () => control && sync(control, {
    text: enabled ? "🌔" : "🌘",
    "aria-label": `${enabled ? "Disable" : "Enable"} Gibbous`,
    "aria-pressed": String(enabled),
    title: `${enabled ? "Disable" : "Enable"} Gibbous`,
  });

  const applyEnabled = value => {
    if (!value) closeHiddenMenus();
    if (!value && mermaidDialog?.open) mermaidDialog.close();
    enabled = value;
    writeMirror({enabled: value});
    root.toggleAttribute("data-gibbous-disabled", !value);
    updateControl();
    refresh();
  };

  const mountControl = () => {
    const anchor = viewerButton()?.parentElement
      ?? topNavigation()?.querySelector('a[href^="/login"]')
      ?? document.querySelector('header .HeaderMenu-link-wrap:has(a.HeaderMenu-link--sign-in)');
    if (!anchor) return;
    if (!control) {
      control = create("button", {
        class: "Button Button--secondary Button--medium Button--iconOnly gibbous-header-button",
        type: "button",
        onclick: () => {
          applyEnabled(!enabled);
          void storageSet({enabled}).catch(reportError);
        },
      });
      updateControl();
    }
    if (control.nextElementSibling !== anchor) anchor.before(control);
  };

  // What the page added since the last refresh, for the features whose elements can appear on any
  // page: they look only there, so a refresh costs what changed, not what the page holds. First
  // the parser's work, then GitHub's renders. Only the topmost added elements are kept; a selector
  // searches each one and everything in it.
  let addedNodes = [];
  let addedRoots = [];
  const added = selector => addedRoots.flatMap(node => [...node.matches(selector) ? [node] : [], ...node.querySelectorAll(selector)]);
  const takeAddedRoots = () => {
    const nodes = new Set(addedNodes);
    addedNodes = [];
    addedRoots = [...nodes].filter(node => {
      for (let parent = node.parentNode; parent; parent = parent.parentNode) if (nodes.has(parent)) return false;
      return node.isConnected;
    });
  };

  function refresh() {
    // Needs only the DOM, so it runs before storage is loaded and the gate is right on first paint.
    updateRepositoryInsider();
    markSidebarSections();
    if (!ready) return;
    takeAddedRoots();
    mountControl();
    mountClassicDashboard();
    mountMermaidLightboxes();
    markSuggestedWorkflows();
    noteDrawers();
    expandTopRepositories();
    refreshRepository();
    mountTopRepositories();
    refreshQuoteLinks();
    refreshWhitespaceDiffstat();
    refreshHunks();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) applyEnabled(changes.enabled.newValue ?? true);
    // Keep the newer of each entry: an echo of an older write must not drop what was fetched since.
    for (const [bucket, entries] of Object.entries(changes.cache?.newValue ?? {})) {
      for (const [key, entry] of Object.entries(entries)) {
        if (!(cache[bucket]?.[key]?.at >= entry.at)) (cache[bucket] ??= {})[key] = entry;
      }
    }
    if (changes.quoteChoices) {
      quoteChoices = changes.quoteChoices.newValue ?? {};
      document.querySelectorAll(".gibbous-quote-rail-replies").forEach(node => node.remove());
      refreshQuoteLinks();
    }
    if (changes.hiddenRepositories) setHiddenRepositories(changes.hiddenRepositories.newValue ?? []);
    if (changes.viewedHunks) setViewedHunks(normalizeNames(changes.viewedHunks.newValue));
    const key = hiddenStorageKey();
    if (key && changes[key]) setHiddenNames(changes[key].newValue ?? []);
  });

  void (async () => {
    const stored = await storageGet({enabled: true, hiddenRepositories: [], cache: {}, viewedHunks: []});
    if (!stored) return;
    cache = stored.cache && typeof stored.cache === "object" ? stored.cache : {};
    viewedHunks = new Set(normalizeNames(stored.viewedHunks));
    for (const [key, entry] of Object.entries(cache.forks ?? {})) {
      if (entry && typeof entry === "object" && "value" in entry) knownRepositoryForks.set(key, entry.value);
    }
    writeMirror({enabled: stored.enabled, hiddenRepositories: stored.hiddenRepositories});
    ready = true;
    setHiddenRepositories(stored.hiddenRepositories);
    applyEnabled(stored.enabled);
  })().catch(reportError);

  let refreshScheduled = false;
  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      refresh();
    });
  }

  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) addedNodes.push(node);
    if (ready && enabled && records.some(record => record.target instanceof Element && record.target.closest('[role="dialog"]'))) {
      mountTopRepositories();
    }
    scheduleRefresh();
  }).observe(root, {childList: true, subtree: true});
  addEventListener("pointerdown", releaseQuoteTarget, {capture: true, passive: true});
  addEventListener("wheel", releaseQuoteTarget, {passive: true});
  addEventListener("keydown", releaseQuoteTarget);
  addEventListener("resize", scheduleRefresh);
  refresh();
})();
