(() => {
  if (matchMedia("(max-width: 767px)").matches) return;

  let enabled = true;
  let contextInvalidated = false;
  let repositoryKey;
  let hiddenNames = [];
  let loadedHiddenNamesKey;
  let forkLookup;
  let userFork;
  let control;
  let forkedIn;
  let forkLink;
  let hiddenFilesControl;
  let hiddenFilesToggle;
  let hiddenFilesMenu;
  let hiddenFilesMenuRepository;
  let hiddenFilesMenuList;
  let pullRequestShortcuts;

  const create = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  };

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

  const setHiddenNames = names => {
    const next = normalizeNames(names);
    if (next.length === hiddenNames.length && next.every((name, index) => name === hiddenNames[index])) return;
    hiddenNames = next;
    renderHiddenMenu();
    if (enabled) refreshRows();
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
    if (!key) return;
    void navigator.locks.request(`gibbous:${key}`, async () => {
      const stored = await storageGet(key);
      if (!stored) return;
      const next = normalizeNames(update(normalizeNames(stored[key])));
      if (key === hiddenStorageKey()) setHiddenNames(next);
      await storageSet({[key]: next});
    }).catch(reportError);
  };

  const renderHiddenMenu = () => {
    if (!hiddenFilesMenuList) return;
    const items = hiddenNames.map(name => create(
      "div",
      {class: "gibbous-hidden-item"},
      create("code", {title: name}, name),
      create(
        "button",
        {
          class: "Button Button--secondary Button--small gibbous-list-button",
          type: "button",
          "aria-label": `Show ${name}`,
          onclick: () => updateHiddenNames(names => names.filter(hiddenName => hiddenName !== name)),
        },
        "Show",
      ),
    ));
    hiddenFilesMenuList.replaceChildren(
      ...(items.length ? items : [create("span", {class: "gibbous-hidden-menu-empty"}, "Nothing hidden.")]),
    );
  };

  const closeMenu = () => {
    if (hiddenFilesMenu?.matches(":popover-open")) hiddenFilesMenu.hidePopover();
  };

  const createHiddenFilesControl = () => {
    hiddenFilesToggle = create(
      "button",
      {
        class: "Button Button--secondary Button--medium Button--iconOnly gibbous-eyes-toggle",
        type: "button",
        "aria-label": "Hidden files",
        popovertarget: "gibbous-hidden-menu",
        title: "Hidden files",
      },
      "👀",
    );
    hiddenFilesMenuRepository = create("code", {class: "gibbous-hidden-menu-repository"});
    hiddenFilesMenuList = create("div", {class: "gibbous-hidden-list"});
    hiddenFilesMenu = create(
      "div",
      {id: "gibbous-hidden-menu", class: "gibbous-hidden-menu", popover: "auto"},
      create("strong", {}, "Hidden files"),
      hiddenFilesMenuRepository,
      hiddenFilesMenuList,
    );
    renderHiddenMenu();
    return create("div", {class: "gibbous-hidden-files-control"}, hiddenFilesToggle, hiddenFilesMenu);
  };

  const createHideButton = name => create(
    "button",
    {
      class: "Button Button--invisible Button--small gibbous-hide-file",
      type: "button",
      "aria-label": `Hide ${name}`,
      title: `Hide ${name}`,
      onclick: event => {
        event.preventDefault();
        event.stopPropagation();
        updateHiddenNames(names => names.includes(name) ? names : [...names, name]);
      },
    },
    "Hide",
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
        cell.append(createHideButton(name));
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
        ...[["open", "📖\uFE0E"], ["closed", "📕\uFE0E"]].map(([state, icon]) => create(
          "a",
          {
            class: "Button Button--invisible Button--small Button--iconOnly gibbous-pull-request-shortcut",
            "data-state": state,
            "aria-label": `My ${state} pull requests`,
            title: `My ${state} pull requests`,
          },
          icon,
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

  const updateFork = () => {
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
    if (!hiddenFilesControl?.isConnected) hiddenFilesControl = createHiddenFilesControl();
    if (hiddenFilesControl.nextElementSibling !== codeButton) codeButton.before(hiddenFilesControl);
    hiddenFilesToggle.hidden = !enabled;
    hiddenFilesMenuRepository.textContent = repositoryKey ?? "";
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
      closeMenu();
      updateFork();
      return;
    }
    if (repositoryKey !== context.rootNwo) {
      repositoryKey = context.rootNwo;
      hiddenNames = [];
      renderHiddenMenu();
    }
    mountForkedIn();
    mountHiddenFilesControl(table);
    void loadHiddenNames().catch(reportError);
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
    if (!value) closeMenu();
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
    refreshRepository();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) applyEnabled(changes.enabled.newValue ?? true);
    const key = hiddenStorageKey();
    if (key && changes[key]) setHiddenNames(changes[key].newValue ?? []);
  });

  void (async () => {
    const stored = await storageGet({enabled: true});
    if (stored) applyEnabled(stored.enabled);
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

  new MutationObserver(scheduleRefresh).observe(document.documentElement, {childList: true, subtree: true});
  refresh();
})();
