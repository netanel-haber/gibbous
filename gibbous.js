(() => {
  if (matchMedia("(max-width: 767px)").matches) return;

  let enabled = true;
  let contextInvalidated = false;
  let repositoryKey;
  let hiddenNames = [];
  let hiddenRepositories = [];
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

  const moveBefore = (parent, node, before = null) => {
    if ("moveBefore" in Element.prototype) parent.moveBefore(node, before);
    else parent.insertBefore(node, before);
  };
  const expandingRepositoryLists = new WeakSet();
  const repositoryExpansionAttempts = new WeakMap();
  const topRepositoryOrders = new WeakMap();
  const knownRepositoryForks = new Map();
  const queuedRepositoryForks = new Set();
  const repositoryForkQueue = [];
  const hiddenRepositoryControls = new WeakMap();
  let resolvingRepositoryForks = false;
  let hiddenItemsControlId = 0;

  const create = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  };

  const octicons = {
    screenFull: [
      "octicon-screen-full",
      "M2 3.75C2 2.784 2.784 2 3.75 2h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0Zm7.75-1.75a.75.75 0 0 0 0 1.5h2.5a.25.25 0 0 1 .25.25v2.5a.75.75 0 0 0 1.5 0v-2.5A1.75 1.75 0 0 0 12.25 2ZM2.75 9a.75.75 0 0 1 .75.75v2.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 12.25v-2.5A.75.75 0 0 1 2.75 9Zm10.5 0a.75.75 0 0 1 .75.75v2.5A1.75 1.75 0 0 1 12.25 14h-2.5a.75.75 0 0 1 0-1.5h2.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 .75-.75Z",
    ],
    x: [
      "octicon-x",
      "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z",
    ],
    listUnordered: [
      "octicon-list-unordered",
      "M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 0 1-1 1 1 1 0 1 1 1-1ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    ],
    comment: [
      "octicon-comment",
      "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z",
    ],
    pullRequestDraft: [
      "octicon-git-pull-request-draft",
      "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z",
    ],
    eye: [
      "octicon-eye",
      "M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z",
    ],
    eyeClosed: [
      "octicon-eye-closed",
      "M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z",
    ],
    pullRequest: [
      "octicon-git-pull-request",
      "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
    ],
    pullRequestClosed: [
      "octicon-git-pull-request-closed",
      "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0 0-1.5ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
    ],
    repoForked: [
      "octicon-repo-forked",
      "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z",
    ],
  };

  const createOcticon = name => {
    const [className, pathData] = octicons[name];
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("class", `octicon ${className}`);
    icon.setAttribute("fill", "currentColor");
    icon.setAttribute("height", "16");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("width", "16");
    path.setAttribute("d", pathData);
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
        moveBefore(placeholder.parentNode, frame, placeholder);
        placeholder.remove();
      } else frame.remove();
      activeMermaidFrame = undefined;
    });
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      mermaidDialog.addEventListener("click", event => {
        if (event.target !== mermaidDialog) return;
        const bounds = mermaidDialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) mermaidDialog.close();
      });
    }
    document.body.append(mermaidDialog);
  };

  const openMermaid = frame => {
    if (!enabled || activeMermaidFrame) return;
    mountMermaidDialog();
    const placeholder = document.createComment("gibbous-mermaid");
    frame.before(placeholder);
    activeMermaidFrame = {frame, placeholder};
    moveBefore(mermaidDialog, frame);
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
        createOcticon("screenFull"),
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
    hiddenFilesControl?.render();
    if (enabled) refreshRows();
  };

  const setHiddenRepositories = names => {
    const next = [...new Set(normalizeNames(names).map(name => name.replace(/^\/+|\/+$/g, "").toLowerCase()))];
    if (sameNames(next, hiddenRepositories)) return;
    hiddenRepositories = next;
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
    createOcticon("eyeClosed"),
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
      const cell = row.querySelector(".react-directory-row-name-cell-large-screen .react-directory-filename-cell");
      if (cell && !cell.querySelector(".gibbous-hide-file")) {
        cell.classList.add("gibbous-filename-cell");
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

  // Fold the repository tab bar into the global header row when everything fits on one line.
  let headerLayoutScheduled = false;
  const navigationHomes = new WeakMap();

  const headerRow = header => header.querySelector(':scope > [data-component="Stack"][data-direction="horizontal"], :scope > .AppHeader-globalBar');

  const layoutHeader = () => {
    const navigation = repositoryNavigation();
    const header = navigation?.closest('header[role="banner"], header.AppHeader')
      ?? document.querySelector('header[role="banner"]:has(nav[aria-label="Repository"])');
    const row = header && headerRow(header);
    if (!header || !row) return;
    const end = row.querySelector('[data-testid="top-nav-right"], .AppHeader-globalBar-end');
    if (!enabled || !navigation) {
      const home = navigation && navigationHomes.get(navigation);
      if (home && navigation.parentElement === row) moveBefore(home.parent, navigation, home.next?.isConnected ? home.next : null);
      header.classList.remove("gibbous-header-merged", "gibbous-header-inline");
      return;
    }
    if (navigation.parentElement !== row) {
      navigationHomes.set(navigation, {parent: navigation.parentElement, next: navigation.nextSibling});
      moveBefore(row, navigation, end ?? null);
    }
    header.classList.add("gibbous-header-merged");
    // Measure with the tabs on their own line so nothing is collapsed, then decide.
    header.classList.remove("gibbous-header-inline");
    const contentWidth = element => [...element.children]
      .reduce((total, child) => total + child.getBoundingClientRect().width, 0);
    const list = navigation.querySelector("ul") ?? navigation;
    const others = [...row.children].filter(child => child !== navigation);
    const needed = others.reduce((total, child) => total + contentWidth(child), 0) + list.scrollWidth + others.length * 32;
    const inline = needed <= row.clientWidth;
    header.classList.toggle("gibbous-header-inline", inline);
    console.debug("Gibbous header layout", {inline, needed: Math.round(needed), available: row.clientWidth, tabs: list.scrollWidth, blocks: others.map(child => Math.round(contentWidth(child)))});
  };

  const scheduleHeaderLayout = () => {
    if (headerLayoutScheduled) return;
    headerLayoutScheduled = true;
    requestAnimationFrame(() => {
      headerLayoutScheduled = false;
      layoutHeader();
    });
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

  const waitForRepositoryGrowth = (surface, previousCount) => new Promise(resolve => {
    let finished = false;
    const finish = grew => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(grew);
    };
    const check = () => {
      mountTopRepositories();
      const button = surface.button();
      const count = surface.entries().length;
      if (count > previousCount && !button?.disabled) finish(true);
    };
    const observer = new MutationObserver(check);
    const timeout = setTimeout(() => finish(false), 5000);
    observer.observe(surface.root, {
      attributes: true,
      attributeFilter: ["disabled"],
      childList: true,
      subtree: true,
    });
    check();
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
        if (!await waitForRepositoryGrowth(surface, count)) return;
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

  const waitForTimelinePage = (button, target, signal) => new Promise(resolve => {
    let timeout;
    const observer = new MutationObserver(() => {
      if (!button.isConnected || quoteTargetRect(target)?.height) finish();
    });
    const finish = () => {
      clearTimeout(timeout);
      observer.disconnect();
      signal.removeEventListener("abort", finish);
      resolve();
    };
    observer.observe(document.querySelector(".js-discussion") ?? document.body, {childList: true, subtree: true});
    signal.addEventListener("abort", finish, {once: true});
    timeout = setTimeout(finish, 5_000);
  });

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
      const loaded = waitForTimelinePage(button, target, signal);
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
        else if (rail && source && !rail.querySelector(`[data-gibbous-quote-key="${match.key}"]`)) {
          const fullQuote = isFullQuote(match, source);
          rail.append(createQuoteLink(
            source,
            matchLabel("↑", source),
            {
              class: "Button Button--invisible Button--small gibbous-quote-button",
              "data-gibbous-quote-key": match.key,
              "data-gibbous-source": source.id,
              "aria-label": `${fullQuote ? "Full comment quoted; go" : "Go"} to source comment by @${source.user}`,
              title: fullQuote ? `Full comment quoted · @${source.user}` : `Source: @${source.user}`,
            },
            {match, source, fullQuote},
          ));
        }
      }

      if (!source) continue;
      const sourceBody = quoteCommentBody(source);
      if (!sourceBody) continue;
      const replies = mountReplyRail(sourceBody, match, source);
      if (!replies) continue;
      if (!replies.querySelector(`[data-gibbous-quote-key="${match.key}"]`)) {
        const fullQuote = isFullQuote(match, source);
        replies.append(createQuoteLink(
          reply,
          matchLabel("↓", source),
          {
            class: "Button Button--invisible Button--small gibbous-quote-button",
            "data-gibbous-quote-key": match.key,
            "data-gibbous-reply": reply.id,
            "aria-label": `${fullQuote ? "Full comment quoted; go" : "Go"} to reply by @${reply.user}`,
            title: fullQuote ? `Full comment quoted · @${reply.user}` : `Quoted by @${reply.user}`,
          },
          {match, fullQuote},
        ));
      }
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
        ...[["open", "pullRequest"], ["closed", "pullRequestClosed"]].map(([state, iconName]) => create(
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
    '[data-testid="dynamic-side-panel-items-search-button"], button:has(svg.octicon-search)',
  );

  const dashboardRepositorySurface = () => {
    if (!["/", "/dashboard"].includes(location.pathname)) return;
    const root = document.querySelector('[data-testid="dashboard-repositories"]')
      ?? document.querySelector(".feed-left-sidebar");
    const list = root && [...root.querySelectorAll("ul")]
      .find(candidate => repositoryEntries(candidate).length);
    if (!list) return;

    const button = () => repositoryShowMoreButton(root);
    const searchButton = () => repositorySearchButton(root);
    return {kind: "dashboard", root, list, entries: () => repositoryEntries(list), button, searchButton};
  };

  const topRepositorySurfaces = () => {
    const selector = '[data-testid="dynamic-side-panel-items-item"]';
    const lists = new Set([...document.querySelectorAll(selector)].map(repository => repository.closest("ul")));
    const surfaces = [...lists].filter(Boolean).flatMap(list => {
      const dialog = list.closest('[role="dialog"]');
      const dashboard = list.closest('[data-testid="dashboard-repositories"], .feed-left-sidebar');
      const root = dialog ?? dashboard;
      if (!root) return [];
      return [{
        kind: dialog ? "drawer" : "dashboard",
        root,
        list,
        entries: () => repositoryEntries(list, selector),
        button: () => repositoryShowMoreButton(root),
        searchButton: () => repositorySearchButton(root),
      }];
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
    const scroller = list.closest('[data-component="ScrollableRegion"], .feed-left-sidebar, [role="dialog"]');
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

  const resolveRepositoryForkQueue = async () => {
    if (resolvingRepositoryForks) return;
    resolvingRepositoryForks = true;
    try {
      while (repositoryForkQueue.length) {
        const batch = repositoryForkQueue.splice(0, 3);
        await Promise.all(batch.map(async ({key, candidateNwo, rootNwo}) => {
          try {
            const response = await fetch(`/${candidateNwo}`, {
              credentials: "include",
              signal: AbortSignal.timeout(5000),
            });
            const candidate = response.ok && readRepositoryContext(
              new DOMParser().parseFromString(await response.text(), "text/html"),
            );
            const fork = candidate?.isFork && candidate.rootNwo.toLowerCase() === rootNwo.toLowerCase()
              ? `/${candidate.nwo}`
              : null;
            if (!knownRepositoryForks.has(key)) knownRepositoryForks.set(key, fork);
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
      if (knownRepositoryForks.has(key) || queuedRepositoryForks.has(key)) continue;
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
          createOcticon("repoForked"),
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

  // "My pull requests" tab on the repository overview. Active only when the viewer has open pull
  // requests here; then the secondary file tabs collapse into a menu and the PR list opens first.
  const myPullRequestCache = new Map();
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

  const parseClassicPullRequests = root => [...root.querySelectorAll(".js-issue-row")].map(row => {
    const link = row.querySelector("a.js-navigation-open, a.markdown-title");
    const opened = row.querySelector(".opened-by");
    return link && {
      number: Number(row.id.replace(/\D/g, "")),
      title: link.textContent.trim(),
      url: link.getAttribute("href"),
      draft: Boolean(row.querySelector(".octicon-git-pull-request-draft")),
      author: opened?.querySelector("a")?.textContent.trim() ?? "",
      openedAt: opened?.querySelector("relative-time")?.getAttribute("datetime") ?? "",
      comments: Number(row.querySelector('a[aria-label$="comment"], a[aria-label$="comments"]')?.textContent.trim() ?? 0) || 0,
      labels: [...row.querySelectorAll(".IssueLabel")].map(label => ({
        name: label.dataset.name ?? label.textContent.trim(),
        style: label.getAttribute("style") ?? "",
      })),
    };
  }).filter(Boolean);

  const parseEmbeddedPullRequests = root => {
    const found = new Map();
    const walk = node => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.__typename === "PullRequest" && node.number && node.title && !found.has(node.number)) {
        found.set(node.number, {
          number: node.number,
          title: node.title,
          url: node.resourcePath ?? new URL(node.url ?? "/", location.origin).pathname,
          draft: Boolean(node.isDraft),
          author: node.author?.login ?? "",
          openedAt: node.createdAt ?? "",
          comments: node.totalCommentsCount ?? node.comments?.totalCount ?? 0,
          labels: (node.labels?.nodes ?? node.labels?.edges?.map(edge => edge.node) ?? [])
            .map(label => ({name: label.name, style: labelStyle(label.color ?? "")})),
        });
      }
      Object.values(node).forEach(walk);
    };
    for (const script of root.querySelectorAll('script[type="application/json"]')) {
      try {
        walk(JSON.parse(script.textContent));
      } catch {
        // Not every JSON island is ours to read.
      }
    }
    return [...found.values()];
  };

  // The public search API answers for public repositories without a token; the signed-in pulls
  // page is client-rendered, so HTML parsing is only a fallback for private repositories.
  const searchMyPullRequests = async (context, viewer) => {
    const query = encodeURIComponent(`repo:${context.nwo} is:pr is:open author:${viewer}`);
    const response = await fetch(`https://api.github.com/search/issues?q=${query}&sort=updated&per_page=50`, {
      headers: {Accept: "application/vnd.github+json"},
    });
    if (!response.ok) throw new Error(`Search API ${response.status}`);
    const {items = []} = await response.json();
    return items.filter(item => item.pull_request).map(item => ({
      number: item.number,
      title: item.title,
      url: new URL(item.html_url).pathname,
      draft: Boolean(item.draft),
      author: item.user?.login ?? "",
      openedAt: item.created_at ?? "",
      comments: item.comments ?? 0,
      labels: (item.labels ?? []).map(label => ({name: label.name, style: labelStyle(label.color ?? "")})),
    }));
  };

  const scrapeMyPullRequests = async (context, viewer) => {
    const query = encodeURIComponent(`is:pr is:open author:${viewer} sort:updated-desc`);
    const response = await fetch(`/${context.nwo}/pulls?q=${query}`, {credentials: "include"});
    if (!response.ok) throw new Error(`Pull request lookup failed (${response.status})`);
    const root = new DOMParser().parseFromString(await response.text(), "text/html");
    const items = parseClassicPullRequests(root);
    return items.length ? items : parseEmbeddedPullRequests(root);
  };

  const loadMyPullRequests = async (context, viewer) => {
    const key = `${viewer}|${context.nwo}`;
    const cached = myPullRequestCache.get(key);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.items;
    let result;
    try {
      result = await searchMyPullRequests(context, viewer);
    } catch (error) {
      reportError(error);
      result = await scrapeMyPullRequests(context, viewer);
    }
    myPullRequestCache.set(key, {at: Date.now(), items: result});
    return result;
  };

  const renderMyPullRequestRow = item => create(
    "div",
    {class: "Box-row d-flex gibbous-my-pull"},
    create(
      "span",
      {class: `flex-shrink-0 pt-1 ${item.draft ? "color-fg-muted" : "color-fg-open"}`, "aria-label": item.draft ? "Draft pull request" : "Open pull request"},
      createOcticon(item.draft ? "pullRequestDraft" : "pullRequest"),
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

  const selectMyPullRequests = (box, selected) => {
    box.toggleAttribute("data-gibbous-pulls-selected", selected);
    const tab = box.querySelector(".gibbous-pulls-tab-link");
    if (!tab) return;
    if (selected) {
      tab.setAttribute("aria-current", "page");
      for (const link of readmeNavigation()?.querySelectorAll('a[aria-current="page"]') ?? []) {
        if (link !== tab) link.removeAttribute("aria-current");
      }
    } else tab.removeAttribute("aria-current");
  };

  const mountMyPullRequestsTab = (context, items) => {
    const navigation = readmeNavigation();
    const list = navigation?.querySelector("ul");
    const readmeItem = [...(list?.children ?? [])].find(item => item.querySelector('[data-content="README"]'));
    const header = navigation?.parentElement;
    const box = header?.parentElement;
    if (!list || !readmeItem || !box) return;
    const existing = box.querySelector(".gibbous-my-pulls");
    if (existing?.dataset.nwo === context.nwo && existing.dataset.count === String(items.length)) return;
    existing?.remove();
    box.querySelector(".gibbous-pulls-tab")?.remove();
    box.querySelector(".gibbous-readme-menu")?.remove();
    box.toggleAttribute("data-gibbous-pulls-active", items.length > 0);
    if (!items.length) {
      selectMyPullRequests(box, false);
      return;
    }

    const sampleLink = readmeItem.querySelector("a");
    const tabLink = create(
      "a",
      {class: `${sampleLink.className} gibbous-pulls-tab-link`, href: `/${context.nwo}/pulls?q=${encodeURIComponent("is:pr is:open author:@me")}`},
      create("span", {"data-component": "icon"}, createOcticon("pullRequest")),
      create("span", {"data-component": "text"}, "My pull requests"),
      create("span", {class: "Counter ml-1"}, String(items.length)),
    );
    tabLink.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      event.preventDefault();
      selectMyPullRequests(box, true);
    });
    const tab = create("li", {class: `${readmeItem.className} gibbous-pulls-tab`}, tabLink);
    readmeItem.after(tab);

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
          selectMyPullRequests(box, false);
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
        outlineButton?.querySelector("svg")?.cloneNode(true) ?? createOcticon("listUnordered"),
      ),
      create("div", {class: "gibbous-readme-menu-list", role: "menu"}, ...hidden.map(name => {
        const source = list.querySelector(`a [data-content="${name}"]`).closest("a");
        const entry = create("button", {class: "gibbous-readme-menu-item", type: "button", role: "menuitem"});
        entry.append(...[...source.children].map(child => child.cloneNode(true)));
        entry.addEventListener("click", () => {
          menu.removeAttribute("open");
          selectMyPullRequests(box, false);
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

    if (!navigation.dataset.gibbousPullsListener) {
      navigation.dataset.gibbousPullsListener = "";
      navigation.addEventListener("click", event => {
        const link = event.target instanceof Element && event.target.closest("a");
        if (link && !link.classList.contains("gibbous-pulls-tab-link") && list.contains(link)) selectMyPullRequests(box, false);
      });
    }

    const panel = create(
      "div",
      {class: "Box gibbous-my-pulls", "data-nwo": context.nwo, "data-count": String(items.length)},
      ...items.map(renderMyPullRequestRow),
      create(
        "div",
        {class: "Box-row text-small color-fg-muted gibbous-my-pulls-footer"},
        create("a", {class: "Link--muted", href: tabLink.href}, "Open in pull requests"),
      ),
    );
    header.after(panel);
    selectMyPullRequests(box, true);
  };

  const refreshMyPullRequests = (context, viewer) => {
    const box = readmeNavigation()?.parentElement?.parentElement;
    if (!box) return;
    if (!enabled || !viewer) {
      box.querySelector(".gibbous-my-pulls")?.remove();
      box.querySelector(".gibbous-pulls-tab")?.remove();
      box.querySelector(".gibbous-readme-menu")?.remove();
      box.removeAttribute("data-gibbous-pulls-active");
      selectMyPullRequests(box, false);
      myPullRequestsLookup = undefined;
      return;
    }
    const lookup = `${viewer}|${context.nwo}`;
    if (box.dataset.gibbousPullsChecked === lookup) return;
    box.dataset.gibbousPullsChecked = lookup;
    myPullRequestsLookup = lookup;
    loadMyPullRequests(context, viewer).then(items => {
      if (myPullRequestsLookup === lookup && box.isConnected) mountMyPullRequestsTab(context, items);
    }).catch(error => {
      delete box.dataset.gibbousPullsChecked;
      reportError(error);
    });
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
    try {
      const response = await fetch(`/${candidateNwo}`, {credentials: "include"});
      if (!response.ok) return;
      const candidate = readRepositoryContext(
        new DOMParser().parseFromString(await response.text(), "text/html"),
      );
      if (forkLookup === lookup && candidate?.isFork && candidate.rootNwo.toLowerCase() === context.rootNwo.toLowerCase()) {
        userFork = candidate.nwo;
        updateFork();
      }
    } catch {
      if (forkLookup === lookup) updateFork();
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
    mountControl();
    layoutHeader();
    mountMermaidLightboxes();
    expandTopRepositories();
    refreshRepository();
    mountTopRepositories();
    refreshQuoteLinks();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) applyEnabled(changes.enabled.newValue ?? true);
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
    const stored = await storageGet({enabled: true, hiddenRepositories: []});
    if (!stored) return;
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
    if (enabled && records.some(record => record.target instanceof Element && record.target.closest('[role="dialog"]'))) {
      mountTopRepositories();
    }
    scheduleRefresh();
  }).observe(document.documentElement, {childList: true, subtree: true});
  addEventListener("pointerdown", releaseQuoteTarget, {capture: true, passive: true});
  addEventListener("wheel", releaseQuoteTarget, {passive: true});
  addEventListener("keydown", releaseQuoteTarget);
  addEventListener("resize", scheduleRefresh);
  addEventListener("resize", scheduleHeaderLayout);
  refresh();
})();
