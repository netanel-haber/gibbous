const {a, button, code, div, span} = van.tags;

const enabled = van.state(true);
let contextInvalidated = false;

const extensionCall = async (operation, fallback) => {
  if (contextInvalidated) {
    return fallback;
  }

  try {
    return await operation();
  } catch (error) {
    if (!String(error).includes("Extension context invalidated")) {
      throw error;
    }
    contextInvalidated = true;
    return fallback;
  }
};

const reportUnexpectedError = error => console.error("Gibbous:", error);

const storageGet = keys => extensionCall(
  () => chrome.storage.local.get(keys),
  null,
);

const storageSet = values => extensionCall(() => chrome.storage.local.set(values));

const setEnabled = value => {
  enabled.val = value;
  document.documentElement.toggleAttribute("data-gibbous-disabled", !value);
};

const createRepositoryPage = () => {
  const active = van.state(false);
  const menuOpen = van.state(false);
  const repositoryKey = van.state(null);
  const hiddenNames = van.state([]);
  const userFork = van.state(null);
  let forkLookup = null;
  let loadedHiddenNamesKey = null;
  let forkedIn;
  let hiddenFilesControl;

  const normalizeNames = names => Array.isArray(names)
    ? [...new Set(
        names
          .filter(name => typeof name === "string")
          .map(name => name.trim())
          .filter(Boolean),
      )]
    : [];

  const setHiddenNames = value => {
    const normalized = normalizeNames(value);
    if (
      normalized.length === hiddenNames.val.length
      && normalized.every((name, index) => name === hiddenNames.val[index])
    ) {
      return;
    }

    hiddenNames.val = normalized;
    if (enabled.val) {
      refreshRows();
    }
  };

  const hiddenNamesKey = () => repositoryKey.val
    ? `hiddenNames:${repositoryKey.val}`
    : null;

  const loadHiddenNames = async () => {
    const key = hiddenNamesKey();
    if (!key || key === loadedHiddenNamesKey) {
      return;
    }

    const stored = await storageGet(key);
    if (!stored) {
      return;
    }
    loadedHiddenNamesKey = key;
    if (key === hiddenNamesKey()) {
      setHiddenNames(stored[key] ?? []);
    }
  };

  const updateHiddenNames = update => {
    const key = hiddenNamesKey();
    if (!key) {
      return;
    }

    void navigator.locks.request(`gibbous:${key}`, async () => {
      const stored = await storageGet(key);
      if (!stored) {
        return;
      }
      const next = normalizeNames(update(normalizeNames(stored[key])));
      if (key === hiddenNamesKey()) {
        setHiddenNames(next);
      }
      await storageSet({[key]: next});
    }).catch(reportUnexpectedError);
  };

  const hideName = name => {
    updateHiddenNames(names => names.includes(name) ? names : [...names, name]);
  };

  const showName = name => {
    updateHiddenNames(names => names.filter(hiddenName => hiddenName !== name));
  };

  const metaContent = (root, name) => root
    .querySelector(`meta[name="octolytics-dimension-${name}"]`)
    ?.content || null;

  const readRepositoryContext = (root = document) => {
    const nwo = metaContent(root, "repository_nwo")
      ?? root.querySelector("qbsearch-input[data-current-repository]")?.dataset.currentRepository;
    if (!nwo) {
      return null;
    }

    return {
      nwo,
      rootNwo: metaContent(root, "repository_network_root_nwo")
        ?? metaContent(root, "repository_parent_nwo")
        ?? nwo,
      isFork: metaContent(root, "repository_is_fork") === "true",
    };
  };

  const viewerLogin = () => document
    .querySelector('[class*="GlobalNavUserMenu-module__container"] [data-login]')
    ?.dataset.login
    ?? document.querySelector('meta[name="user-login"]')?.content
    ?? null;

  const createHiddenList = () => {
    const names = hiddenNames.val;
    return div(
      {class: "gibbous-hidden-list"},
      names.length
        ? names.map(name => div(
            {class: "gibbous-hidden-item"},
            code({title: name}, name),
            button(
              {
                class: "gibbous-list-button",
                type: "button",
                "aria-label": `Show ${name}`,
                onclick: () => showName(name),
              },
              "Show",
            ),
          ))
        : span({class: "gibbous-hidden-menu-empty"}, "Nothing hidden."),
    );
  };

  const createMenuButton = () => button(
    {
      class: "gibbous-eyes-toggle",
      type: "button",
      hidden: () => !enabled.val || !active.val,
      "aria-label": "Hidden files",
      "aria-controls": "gibbous-hidden-menu",
      "aria-expanded": () => String(menuOpen.val),
      title: "Hidden files",
      onclick: () => menuOpen.val = !menuOpen.val,
    },
    "👀",
  );

  const createMenu = () => div(
    {
      id: "gibbous-hidden-menu",
      class: "gibbous-hidden-menu",
      hidden: () => !enabled.val || !active.val || !menuOpen.val,
    },
    div({class: "gibbous-hidden-menu-title"}, "Hidden files"),
    code(
      {class: "gibbous-hidden-menu-repository"},
      () => repositoryKey.val ?? "",
    ),
    createHiddenList,
  );

  const createHideButton = name => button(
    {
      class: "gibbous-hide-file",
      type: "button",
      "aria-label": `Hide ${name}`,
      title: `Hide ${name}`,
      onclick: event => {
        event.preventDefault();
        event.stopPropagation();
        hideName(name);
      },
    },
    "Hide",
  );

  function refreshRows() {
    const table = document.querySelector('table[aria-labelledby="folders-and-files"]');
    if (!table) {
      return;
    }

    const hidden = new Set(hiddenNames.val);
    for (const row of table.querySelectorAll("tr.react-directory-row")) {
      const nameLink = row.querySelector(
        ".react-directory-row-name-cell-large-screen a.Link--primary",
      ) ?? row.querySelector("a.Link--primary");
      const name = nameLink?.textContent.trim();
      if (!name || name === "..") {
        continue;
      }

      row.classList.toggle("gibbous-file-excluded", hidden.has(name));

      const filenameCell = row.querySelector(
        ".react-directory-row-name-cell-large-screen .react-directory-filename-cell",
      );
      if (filenameCell && !filenameCell.querySelector(".gibbous-hide-file")) {
        filenameCell.classList.add("gibbous-filename-cell");
        filenameCell.append(createHideButton(name));
      }
    }
  }

  const markSuggestedWorkflows = () => {
    if (!readRepositoryContext()) {
      return;
    }

    const heading = [...document.querySelectorAll("h1, h2, h3")]
      .find(element => element.textContent.trim() === "Suggested workflows");
    if (!heading || heading.closest(".gibbous-suggested-workflows")) {
      return;
    }

    const moreWorkflows = [...document.querySelectorAll("a, button")]
      .find(element => element.textContent.trim() === "More workflows");
    let section = heading.parentElement;
    while (section && moreWorkflows && !section.contains(moreWorkflows)) {
      section = section.parentElement;
    }
    if (moreWorkflows && section && section !== document.body) {
      section.classList.add("gibbous-suggested-workflows");
    }
  };

  const createForkedIn = () => span(
    {
      class: "gibbous-forked-in text-small lh-condensed-ultra no-wrap mt-1",
      hidden: () => !enabled.val || !active.val || !userFork.val,
      "data-repository-hovercards-enabled": "",
    },
    "forked in ",
    a(
      {
        class: "Link--inTextBlock",
        href: () => userFork.val ? `/${userFork.val}` : "#",
        "data-hovercard-type": "repository",
        "data-hovercard-url": () => userFork.val ? `/${userFork.val}/hovercard` : "",
      },
      () => userFork.val ?? "",
    ),
  );

  const createHiddenFilesControl = () => div(
    {class: "gibbous-hidden-files-control"},
    createMenuButton(),
    createMenu(),
  );

  const mountForkedIn = () => {
    const legacyTitle = document.querySelector(
      '#repository-container-header strong[itemprop="name"]',
    );
    const titleBlock = document.querySelector("#repo-title-component")
      ?? legacyTitle?.parentElement?.parentElement;
    if (!titleBlock) {
      return;
    }

    if (!forkedIn?.isConnected) {
      forkedIn = createForkedIn();
    }
    if (forkedIn.parentElement !== titleBlock) {
      titleBlock.append(forkedIn);
    }
  };

  const mountHiddenFilesControl = table => {
    const root = table.closest("#repo-content-pjax-container, #repo-content-turbo-frame")
      ?? document;
    const codeButton = root.querySelector(
      'button[data-component="Button"]:has(svg.octicon-code), summary:has(svg.octicon-code)',
    );
    if (!codeButton) {
      return;
    }

    if (!hiddenFilesControl?.isConnected) {
      hiddenFilesControl = createHiddenFilesControl();
    }
    if (hiddenFilesControl.nextElementSibling !== codeButton) {
      codeButton.before(hiddenFilesControl);
    }
  };

  const resolveUserFork = async context => {
    const viewer = viewerLogin();
    const lookup = `${viewer}|${context.nwo}|${context.rootNwo}`;
    if (lookup === forkLookup) {
      return;
    }

    forkLookup = lookup;
    userFork.val = null;
    if (!viewer || context.isFork) {
      return;
    }

    const repositoryName = context.rootNwo.split("/").at(-1);
    const candidateNwo = `${viewer}/${repositoryName}`;
    if (candidateNwo.toLowerCase() === context.nwo.toLowerCase()) {
      return;
    }

    try {
      const response = await fetch(`/${candidateNwo}`, {credentials: "include"});
      if (!response.ok) {
        return;
      }

      const candidateDocument = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const candidate = readRepositoryContext(candidateDocument);
      if (
        forkLookup === lookup
        && candidate?.isFork
        && candidate.rootNwo.toLowerCase() === context.rootNwo.toLowerCase()
      ) {
        userFork.val = candidate.nwo;
      }
    } catch {
      if (forkLookup === lookup) {
        userFork.val = null;
      }
    }
  };

  const refresh = () => {
    const table = document.querySelector('table[aria-labelledby="folders-and-files"]');
    const pageContext = readRepositoryContext();
    const context = table ? pageContext : null;
    active.val = Boolean(context);

    if (enabled.val && pageContext) {
      markSuggestedWorkflows();
    }

    if (!context) {
      repositoryKey.val = null;
      hiddenNames.val = [];
      loadedHiddenNamesKey = null;
      menuOpen.val = false;
      userFork.val = null;
      forkLookup = null;
      return;
    }

    if (repositoryKey.val !== context.rootNwo) {
      repositoryKey.val = context.rootNwo;
      hiddenNames.val = [];
    }
    void loadHiddenNames().catch(reportUnexpectedError);
    mountForkedIn();
    mountHiddenFilesControl(table);
    if (enabled.val) {
      refreshRows();
      resolveUserFork(context);
    }
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    const key = hiddenNamesKey();
    if (area === "local" && key && changes[key]) {
      setHiddenNames(changes[key].newValue ?? []);
    }
  });

  return {
    active,
    menuOpen,
    contains: target => hiddenFilesControl?.contains(target) ?? false,
    refresh,
  };
};

const repositoryPage = createRepositoryPage();
let control;

const createControl = () => div(
  {class: "gibbous-control"},
  button(
    {
      class: "gibbous-header-button gibbous-moon-toggle",
      type: "button",
      "aria-label": () => enabled.val ? "Disable Gibbous" : "Enable Gibbous",
      "aria-pressed": () => String(enabled.val),
      title: () => enabled.val ? "Disable Gibbous" : "Enable Gibbous",
      onclick: () => {
        const nextEnabled = !enabled.val;
        if (!nextEnabled) {
          repositoryPage.menuOpen.val = false;
        }
        setEnabled(nextEnabled);
        refresh();
        void storageSet({enabled: enabled.val}).catch(reportUnexpectedError);
      },
    },
    () => enabled.val ? "🌔" : "🌘",
  ),
);

const mountControl = () => {
  const anchor = document.querySelector(
    '[class*="GlobalNavUserMenu-module__container"]',
  ) ?? document.querySelector(
    'header [data-testid="top-nav-right"] a[href^="/login"], header .HeaderMenu-link-wrap:has(a.HeaderMenu-link--sign-in)',
  );
  if (!anchor) {
    return;
  }

  if (!control?.isConnected) {
    control = createControl();
  }
  if (control.nextElementSibling !== anchor) {
    anchor.before(control);
  }
};

void storageGet({enabled: true})
  .then(stored => {
    if (!stored) {
      return;
    }
    setEnabled(stored.enabled);
    refresh();
  })
  .catch(reportUnexpectedError);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    const nextEnabled = changes.enabled.newValue ?? true;
    if (!nextEnabled) {
      repositoryPage.menuOpen.val = false;
    }
    setEnabled(nextEnabled);
    refresh();
  }
});

document.addEventListener("click", event => {
  if (
    repositoryPage.menuOpen.val
    && event.target instanceof Node
    && !repositoryPage.contains(event.target)
  ) {
    repositoryPage.menuOpen.val = false;
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    repositoryPage.menuOpen.val = false;
  }
});

function refresh() {
  mountControl();
  repositoryPage.refresh();
}

let refreshScheduled = false;
const scheduleRefresh = () => {
  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    refresh();
  });
};

new MutationObserver(scheduleRefresh).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

refresh();
