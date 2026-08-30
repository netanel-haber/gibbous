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
  let quoteContextKey;
  let quoteMatches = [];
  let quoteChoices = {};
  let quoteError = "";
  let quotePreview;
  let quotePreviewTimer;
  let quoteRevealController;
  let quoteScrollTarget;
  let quoteScrollTimer;

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

  const parseQuoteComment = (comment, id = `issuecomment-${comment.id}`) => {
    const body = new DOMParser().parseFromString(comment.body_html ?? "", "text/html").body;
    const quotes = quoteBlocks(body).map(({text}) => text);
    body.querySelectorAll("blockquote").forEach(quote => quote.remove());
    return {
      id,
      url: comment.html_url,
      user: comment.user?.login ?? "someone",
      createdAt: comment.created_at,
      html: comment.body_html ?? "",
      text: normalizeQuote(body.textContent),
      quotes,
    };
  };

  const currentQuoteContext = () => {
    const match = location.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)\/?$/);
    return match && {key: `${match[1]}#${match[2]}`, nwo: match[1], number: match[2]};
  };

  const fetchQuoteComments = async ({nwo, number}) => {
    const repository = nwo.split("/").map(encodeURIComponent).join("/");
    const issueUrl = `https://api.github.com/repos/${repository}/issues/${number}`;
    const request = async url => {
      const response = await fetch(url, {
        headers: {Accept: "application/vnd.github.full+json", "X-GitHub-Api-Version": "2022-11-28"},
      });
      if (response.ok) return response.json();
      const message = [403, 429].includes(response.status)
        ? "GitHub rate limit reached; try again later."
        : `GitHub API returned ${response.status}.`;
      throw new Error(message);
    };
    const comments = [parseQuoteComment(await request(issueUrl), "pullrequest-body")];
    for (let page = 1; ; page++) {
      const batch = await request(`${issueUrl}/comments?per_page=100&page=${page}`);
      comments.push(...batch.map(comment => parseQuoteComment(comment)));
      if (batch.length < 100) return comments;
    }
  };

  const quoteCommentRoot = comment => comment.id === "pullrequest-body"
    ? document.querySelector(".js-command-palette-pull-body")
    : document.getElementById(comment.id);

  const quoteCommentBody = comment => quoteCommentRoot(comment)?.querySelector(".comment-body");

  const findQuoteMatches = async comments => {
    const response = await Promise.race([
      extensionCall(() => chrome.runtime.sendMessage({
        type: "findQuoteMatches",
        comments: comments.map(({text, quotes}) => ({text, quotes})),
      }), null),
      new Promise(resolve => setTimeout(() => resolve({error: "Quote matching timed out."}), 1000)),
    ]);
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

  const loadQuoteMatches = async context => {
    const stored = await storageGet(["quoteComments", "quoteChoices"]);
    const cached = stored?.quoteComments?.version === 6 && stored.quoteComments;
    quoteChoices = stored?.quoteChoices ?? quoteChoices;
    let comments;
    try {
      comments = cached?.key === context.key && Date.now() - cached.savedAt < 30 * 60_000
        ? cached.comments
        : await fetchQuoteComments(context);
      if (comments !== cached?.comments) {
        await storageSet({quoteComments: {version: 6, key: context.key, savedAt: Date.now(), comments}});
      }
      quoteError = "";
    } catch (error) {
      if (cached?.key !== context.key) throw error;
      comments = cached.comments;
      quoteError = `Using cached quote links — ${error.message}`;
    }
    const matches = await findQuoteMatches(comments);
    if (quoteContextKey !== context.key) return;
    quoteMatches = matches;
    refreshQuoteLinks();
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
      void loadQuoteMatches(context).catch(error => {
        if (quoteContextKey !== context.key) return;
        quoteError = `Quote links unavailable — ${error.message}`;
        refreshQuoteLinks();
      });
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
  addEventListener("pointerdown", releaseQuoteTarget, {capture: true, passive: true});
  addEventListener("wheel", releaseQuoteTarget, {passive: true});
  addEventListener("keydown", releaseQuoteTarget);
  addEventListener("resize", scheduleRefresh);
  refresh();
})();
