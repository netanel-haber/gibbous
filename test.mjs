// The extension's snapshot test, run from the repository root:
//   node test.mjs [ref]   run the extension at ref (default HEAD) and the working tree through the
//                         same scenarios, and report every difference in the DOM or on screen
// Each scenario loads the unpacked extension into a fresh headless Chrome, serves its pages at
// their real github.com URLs, and answers every request to GitHub with a fixture or a mock. Pages
// that need no login are real GitHub pages, fetched once into .test/ (delete it to refetch); the
// rest are built here from the selectors Gibbous relies on. Snapshots land in .test/base and
// .test/work: each element with its attributes sorted and whether it renders, and a screenshot.
import {execFileSync, spawn} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const ref = process.argv[2] ?? "HEAD";
const only = process.env.ONLY?.split(",");
const sleep = ms => new Promise(done => setTimeout(done, ms));
const viewer = "netanel-haber";

// Real pages, as GitHub serves them logged out.
const fixtures = resolve(".test/fixtures");
const realPages = {
  "repo-vllm": "https://github.com/vllm-project/vllm",
  "repo-gibbous": "https://github.com/netanel-haber/gibbous",
  "pr-conversation": "https://github.com/vllm-project/vllm/pull/41518",
  "pr-files": "https://github.com/vllm-project/vllm/pull/41518/files",
  "tags-vllm": "https://github.com/vllm-project/vllm/tags",
  "pulls-vllm": "https://github.com/vllm-project/vllm/pulls",
};
const download = async (name, url, headers = {}) => {
  const path = join(fixtures, `${name}.html`);
  if (existsSync(path)) return readFileSync(path, "utf8");
  const response = await fetch(url, {headers: {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/155.0", ...headers}});
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const html = await response.text();
  mkdirSync(fixtures, {recursive: true});
  writeFileSync(path, html);
  return html;
};
const raw = {};
for (const [name, url] of Object.entries(realPages)) raw[name] = await download(name, url);
// The pull request's collapsed comments, from the "Load more" form on its page.
const moreAction = raw["pr-conversation"].match(/<form[^>]+action="([^"]*timeline_more_items[^"]*)"/)[1].replaceAll("&amp;", "&");
raw["timeline-more"] = await download("timeline-more", `https://github.com${moreAction}`, {Accept: "text/html", "X-Requested-With": "XMLHttpRequest"});

// GitHub's scripts are removed so the DOM stays as served (its JSON payloads stay; Gibbous reads
// them), and the viewer is signed in: a user-login meta tag and the avatar button GitHub's header has.
const signIn = html => {
  const menu = html.indexOf(">", html.indexOf('data-testid="top-nav-right"')) + 1;
  return html.slice(0, menu) + `<div class="container__fixture"><button type="button" data-login="${viewer}">me</button></div>` + html.slice(menu);
};
const githubPage = name => signIn(raw[name]
  .replace(/<script\b([^>]*)>.*?<\/script>/gs, (script, attributes) => attributes.includes('type="application/json"') ? script : "")
  .replace(/<link[^>]+rel="modulepreload"[^>]*>/g, "")
  .replace("</head>", `<meta name="user-login" content="${viewer}"></head>`));
// Signed in, GitHub fills in the branch and tag counts after hydration; fixtures have no scripts.
const withCounts = html => html.replace(
  /(href="\/[^"]+\/(branches|tags)"[^>]*>(?:(?!<\/a>).)*?class="prc-Button-Label-FWkx3">)(Branches|Tags)</gs,
  (_, start, kind, label) => `${start}<span><strong class="color-fg-default">${kind === "tags" ? 175 : 376} </strong>${label}</span><`,
);

// Synthetic pages wear a real page's head and header.
const repository = githubPage("repo-vllm");
const head = repository.slice(repository.indexOf("<head"), repository.indexOf("</head>"));
const headerStart = repository.indexOf("<header", repository.indexOf('partial-name="global-nav-bar"'));
const header = repository.slice(headerStart, repository.indexOf("</header>", headerStart) + 9);
const page = (body, extraHead = "") => `<!doctype html><html lang="en" data-color-mode="dark" data-dark-theme="dark" data-light-theme="light">${head}${extraHead}</head><body>${header}<main>${body}</main></body></html>`;
const html = body => [200, body, "text/html; charset=utf-8"];
const json = value => [200, JSON.stringify(value), "application/json"];

// The search API: pull requests and issues by query.
const searchItem = (repo, number, title, {pr = true, draft = false, comments = 0, labels = []} = {}) => ({
  number, title, draft, comments, labels,
  html_url: `https://github.com/${repo}/${pr ? "pull" : "issues"}/${number}`,
  repository_url: `https://api.github.com/repos/${repo}`,
  user: {login: viewer},
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  ...(pr ? {pull_request: {url: "x"}} : {}),
});
const search = url => {
  const query = new URL(url).searchParams.get("q");
  if (query.startsWith("repo:vllm-project/vllm is:pr is:open author:")) return json({items: [
    searchItem("vllm-project/vllm", 41518, "Reduce warm startup below one second", {comments: 22, labels: [{name: "ready", color: "0e8a16"}, {name: "frontend", color: "c5def5"}]}),
    searchItem("vllm-project/vllm", 51204, "Select linear backends per quantization", {draft: true}),
  ]});
  if (query.startsWith("is:pr author:")) return json({items: [
    searchItem("vllm-project/vllm", 41518, "Reduce warm startup below one second", {comments: 22}),
    searchItem("flashinfer-ai/flashinfer", 6198, "GDP decode enablement", {draft: true, comments: 3}),
  ]});
  if (query.startsWith("is:issue involves:")) return json({items: [searchItem("sgl-project/sglang", 900, "Scheduler hangs on empty batch", {pr: false, comments: 1})]});
  return json({items: []});
};
const forkPage = (nwo, root) => html(`<html><head><meta name="octolytics-dimension-repository_nwo" content="${nwo}"><meta name="octolytics-dimension-repository_is_fork" content="true"><meta name="octolytics-dimension-repository_network_root_nwo" content="${root}"></head></html>`);
const repositoryRoutes = {"https://api.github.com/search/issues*": search, "https://github.com/vllm-project/vllm/tags": html(githubPage("tags-vllm"))};

// Dashboard repository lists, new and classic, and the global navigation drawer. "Show more" adds
// two rows; its listener is in the head, as GitHub renders the button with its handler.
const repoItem = (nwo, testid = true) => `<li><a ${testid ? 'data-testid="dynamic-side-panel-items-item"' : ""} href="/${nwo}"><span>${nwo}</span></a></li>`;
const repos = ["netanel-haber/vllm", "vllm-project/vllm", "sgl-project/sglang", "netanel-haber/gibbous", "pytorch/pytorch"].map(nwo => repoItem(nwo)).join("");
const showMore = list => `<script>document.addEventListener("click", event => {
  const button = event.target.closest("[data-testid=dynamic-side-panel-items-show-more], .show-more");
  if (!button || button.dataset.done) return;
  button.dataset.done = "1";
  document.querySelector(${JSON.stringify(list)}).insertAdjacentHTML("beforeend", ${JSON.stringify(repoItem("flashinfer-ai/flashinfer") + repoItem("netanel-haber/flashinfer"))});
});</script>`;
const searchButton = '<button data-testid="dynamic-side-panel-items-search-button"><svg class="octicon octicon-search"></svg></button>';
const showMoreButton = '<button data-testid="dynamic-side-panel-items-show-more">Show more</button>';
const dashboardNew = page(`<div data-testid="dashboard-repositories"><h2>Top repositories</h2>${searchButton}<ul id="top-repos">${repos}</ul>${showMoreButton}</div>
  <div class="feed-main"><h2>Home</h2></div>`, showMore("#top-repos"));
const dashboardClassic = page(`<div class="feed-left-sidebar"><div class="js-repos-container"><h2>Top repositories</h2><a href="/new">New</a>
  <ul class="js-dashboard-repos-list">${repos.replaceAll(' data-testid="dynamic-side-panel-items-item"', "")}</ul><button class="show-more">Show more</button></div></div>
  <div class="feed-main"><main><div class="news">Feed items</div></main></div>`, showMore(".js-dashboard-repos-list"));
const drawer = page(`<div role="dialog" aria-label="Navigation"><ul>
  <li data-component="ActionList.Item"><a data-testid="side-nav-menu-item-HOME" href="/">Home</a></li>
  <li data-component="ActionList.Item"><a data-testid="side-nav-menu-item-FEED" href="/feed">Feed</a></li>
  <li data-component="ActionList.Item"><a data-testid="side-nav-menu-item-PROJECTS" href="/projects">Projects</a></li>
  <li data-component="ActionList.Group"><a data-testid="side-nav-menu-item-EXPLORE" href="/explore">Explore</a></li></ul>
  <h3>Top repositories</h3>${searchButton}<ul id="drawer-repos">${repos}</ul>${showMoreButton}</div>`, showMore("#drawer-repos"));
const dashboardRoutes = {
  "https://api.github.com/search/issues*": search,
  "https://github.com/netanel-haber/vllm": forkPage("netanel-haber/vllm", "vllm-project/vllm"),
  "https://github.com/netanel-haber/flashinfer": forkPage("netanel-haber/flashinfer", "flashinfer-ai/flashinfer"),
};

// A classic pull request timeline with every quote case: one source, several, none, a full quote,
// and a source only among the collapsed comments.
const comment = (id, user, body) => `<div class="TimelineItem js-comment-container"><div class="timeline-comment" id="issuecomment-${id}">
  <div class="timeline-comment-header"><a class="author" href="/${user}">${user}</a> <a class="js-timestamp" href="#issuecomment-${id}"><relative-time datetime="2026-08-0${id % 9 + 1}T10:00:00Z">Aug ${id % 9 + 1}</relative-time></a></div>
  <div class="comment-body markdown-body">${body}</div></div></div>`;
const quote = text => `<blockquote><p>${text}</p></blockquote>`;
const quotesPage = page(`<div class="js-command-palette-pull-body"><div class="timeline-comment"><div class="comment-body markdown-body"><p>This pull request reduces warm startup of the vllm command line below one second by importing lazily.</p></div></div></div>
  <div class="js-discussion">
    ${comment(1, "alice", "<p>The scheduler change looks good to me, but the import of torch at module level still costs two seconds.</p>")}
    ${comment(2, "bob", "<p>Agreed: the import of torch at module level still costs two seconds on a cold cache.</p>")}
    ${comment(3, "carol", "<p>We should keep the environment setup shared between serve and bench subcommands.</p>")}
    <form class="ajax-pagination-form js-ajax-pagination" action="/vllm-project/vllm/pull/41518/timeline_more_items?cursor=fixture" method="get"><button type="submit" data-disable-with="Loading…">Load more…</button></form>
    ${comment(4, viewer, `${quote("the import of torch at module level still costs two seconds")}<p>Fixed in the latest push.</p>`)}
    ${comment(5, "dave", `${quote("We should keep the environment setup shared between serve and bench subcommands.")}<p>+1</p>`)}
    ${comment(6, "erin", quote("This quote matches nothing anywhere on this page at all, it was edited out."))}
    ${comment(7, "frank", quote("The collapsed comment explains why the cache key includes the platform name."))}
    ${comment(8, "grace", `${quote("This pull request reduces warm startup of the vllm command line below one second by importing lazily.")}<p>Nice.</p>`)}
  </div>`);
const collapsedComments = `<div>${comment(9, "heidi", "<p>The collapsed comment explains why the cache key includes the platform name.</p>")}</div>`;
// Quote previews open on pointerenter; dispatching it is deterministic where a hover races scrolling.
const enter = selector => page => page.evaluate(`(() => {
  for (const preview of document.querySelectorAll(".gibbous-quote-preview")) preview.dispatchEvent(new PointerEvent("pointerleave"));
  document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent("pointerenter"));
})()`);

// The new pull request view's header counter, React-split as GitHub renders it, and a file's count.
const changesPage = (additions, deletions) => page(`<div class="pr-header"><nav aria-label="Pull request tabs"><a href="#">Conversation <span>14</span></a><a href="#">Files changed <span>43</span></a></nav>
  <div class="d-flex flex-items-center"><span class="f6"><span class="fgColor-success text-bold">+<!-- -->${additions}</span> <span class="fgColor-danger text-bold">−<!-- -->${deletions}</span></span><span class="blocks"><span></span><span></span><span></span><span></span><span></span></span></div></div>
  <div class="file-header">vllm/config/compilation.py <span class="fgColor-success">+65</span> <span class="fgColor-danger">−36</span></div>`);
const openChanges = query => async page => {
  await page.evaluate(`location.href = "/vllm-project/vllm/pull/41518/changes${query}"`);
  await sleep(500);
  await page.waitFor(".gibbous-whitespace-diffstat");
};

// Files in the new view's split diff, in GitHub's markup and with its pull request stylesheets: a
// header with GitHub's own Viewed button, an @@ row per hunk, then a number and a line on each
// side. Lines are [left, right, text]; a missing side makes an addition or a deletion. ?pushed
// changes the first hunk and moves the second.
const pullRequestStyles = `app-runtime.9dc463b6ff92cfd5.module primer-react-css.41e8289c1ff152bd.module react-core.45fb94e912e16ebd.module
  nm.e3c799fa8d3553dc.module vf.2f67198b94a92b17.module f4.e198736a36d1f6a2.module igs.b49f80dd1968faa9.module h6.2986a44ec8a6b260.module
  5gc.c92e53e7a3364041.module d5.92880d126e569f59.module pv3.82e5e20290810377.module ke.ba94cc78202e6c94.module ai.117d305975092d28.module
  1i.d7369b10f2684743.module 0a.de0bcf898f126707.module pull-requests.626ee2e3f3e3903c.module pull-requests-4406857028d32735`
  .split(/\s+/).map(name => `<link rel="stylesheet" href="https://github.githubassets.com/assets/${name}.css">`).join("");
const octicon = (name, path) => `<svg aria-hidden="true" focusable="false" class="octicon octicon-${name}" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom;"><path d="${path}"></path></svg>`;
const foldIcon = direction => octicon(`fold-${direction}`, direction === "up"
  ? "M7.823 1.677 4.927 4.573A.25.25 0 0 0 5.104 5H7.25v3.236a.75.75 0 1 0 1.5 0V5h2.146a.25.25 0 0 0 .177-.427L8.177 1.677a.25.25 0 0 0-.354 0ZM13.75 11a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Zm-3.75.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75ZM7.75 11a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5ZM4 11.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75ZM1.75 11a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Z"
  : "m8.177 14.323 2.896-2.896a.25.25 0 0 0-.177-.427H8.75V7.764a.75.75 0 1 0-1.5 0V11H5.104a.25.25 0 0 0-.177.427l2.896 2.896a.25.25 0 0 0 .354 0ZM2.25 5a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5ZM6 4.25a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5a.75.75 0 0 1 .75.75ZM8.25 5a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5ZM12 4.25a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5a.75.75 0 0 1 .75.75Zm2.25.75a.75.75 0 0 0 0-1.5h-.5a.75.75 0 0 0 0 1.5h.5Z");
const iconButton = (name, path) => `<button data-component="IconButton" type="button" class="prc-Button-ButtonBase-9n-Xk prc-Button-IconButton-fyge7" data-loading="false" data-no-visuals="true" data-size="small" data-variant="invisible">${octicon(name, path)}</button>`;
const fileHeader = path => `<div class="diffHeaderWrapper__INiK1j" data-diff-header-wrapper="true"><div class="diff-file-header__CV6GPS">
  <div class="d-flex px-1 flex-items-center overflow-hidden file-path-section__ZYYNNI"><h3 class="file-name__8GKEHg file-name-truncate__1IBLuh"><a class="Link--primary prc-Link-Link-9ZwDx" data-component="Link" data-muted="true" href="#"><code>${path}</code></a></h3></div>
  <div class="d-flex flex-row flex-justify-end flex-items-center gap-2 flex-1"><div class="d-flex flex-items-center gap-2">
    <button data-component="Button" type="button" aria-pressed="false" aria-label="Not Viewed" class="prc-Button-ButtonBase-9n-Xk iconOnly__kjZ2po" data-loading="false" data-size="small" data-variant="default"><span data-component="buttonContent" data-align="center" class="prc-Button-ButtonContent-Iohp5"><span data-component="leadingVisual" class="prc-Button-Visual-YNt2F prc-Button-LeadingVisual-UySKu prc-Button-VisualWrap-E4cnq"><svg aria-hidden="true" fill="none" height="16" role="img" viewBox="0 0 16 16" width="16"><path clip-rule="evenodd" d="M2.5 2.75C2.5 2.61193 2.61193 2.5 2.75 2.5H13.25C13.3881 2.5 13.5 2.61193 13.5 2.75V13.25C13.5 13.3881 13.3881 13.5 13.25 13.5H2.75C2.61193 13.5 2.5 13.3881 2.5 13.25V2.75ZM2.75 1C1.7835 1 1 1.7835 1 2.75V13.25C1 14.2165 1.7835 15 2.75 15H13.25C14.2165 15 15 14.2165 15 13.25V2.75C15 1.7835 14.2165 1 13.25 1H2.75Z" fill="currentColor" fill-rule="evenodd"></path></svg></span><span data-component="text" class="prc-Button-Label-FWkx3"><span class="hide-on-mobile__6ak-TF">Viewed</span></span></span></button>
    ${iconButton("comment", "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z")}
    ${iconButton("kebab-horizontal", "M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z")}
  </div></div></div></div>`;
const lineBackgrounds = {"": ["var(--bgColor-default)", "var(--bgColor-default)"], ...Object.fromEntries(["addition", "deletion"].map(kind => [kind, [
  `var(--diffBlob-${kind}Num-bgColor, var(--diffBlob-${kind}-bgColor-num))`, `var(--diffBlob-${kind}Line-bgColor, var(--diffBlob-${kind}-bgColor-line))`]]))};
const diffCells = (side, number, kind, text) => {
  if (number === undefined) return `<td role="gridcell" class="focusable-grid-cell empty-diff-line left-side"></td>`.repeat(2);
  const [numberBackground, lineBackground] = lineBackgrounds[kind];
  return `<td class="focusable-grid-cell new-diff-line-number left-side${kind ? "" : " diff-line-number-neutral"}" data-diff-side="${side}" data-line-number="${number}" role="gridcell" style="background-color: ${numberBackground};">${number}</td>`
    + `<td class="diff-text-cell v-align-top focusable-grid-cell ${side}-side-diff-cell" data-diff-side="${side}" role="gridcell" style="background-color: ${lineBackground}; padding-right: 24px;"><code class="diff-text syntax-highlighted-line ${kind}">${kind ? `<span class="diff-text-marker">${kind === "addition" ? "+" : "-"}</span>` : ""}<div class="diff-text-inner">${text || "<br>"}</div></code></td>`;
};
const diffRow = row => {
  if (typeof row === "string") return `<tr class="diff-line-row"><td colspan="4" role="gridcell" valign="top" class="diff-hunk-cell focusable-grid-cell left-side" ${row ? `id="hunk-${row.match(/-(\d+)/)[1]}"` : ""} style="user-select: none; position: relative; background-color: var(--bgColor-accent-muted, var(--color-accent-subtle)); flex-grow: 1;">`
    + `<div class="d-flex flex-row"><button class="Button Button--iconOnly Button--invisible expand-button-line__i06Y9x" aria-label="Expand file" data-direction="${row ? "up" : "down"}" aria-hidden="true" tabindex="-1">${foldIcon(row ? "up" : "down")}</button>`
    + `<code class="diff-text-cell hunk"><div class="diff-text-inner color-fg-muted">${row}</div></code></div></td></tr>`;
  const [left, right, text] = row;
  const kind = left === undefined ? "addition" : right === undefined ? "deletion" : "";
  return `<tr class="diff-line-row">${diffCells("left", left, kind, text)}${diffCells("right", right, kind, text)}</tr>`;
};
const diffFile = (path, rows) => `<div class="diffEntry__YLOXdm"><div role="region" class="diffTargetable__jbrCub diff__GZFl4M">${fileHeader(path)}
  <div class="border position-relative rounded-bottom-2"><table aria-label="Diff for: ${path}" class="tab-size width-full tableLayoutFixed__5FTnfJ compact__U6o-zW" data-diff-anchor="diff-${Buffer.from(path).toString("hex")}" data-tab-size="4" role="grid" style="--line-number-cell-width: 44px; --line-number-cell-width-unified: 88px;">
  <colgroup><col width="44"><col><col width="44"><col></colgroup><tbody>${[...rows, ""].map(diffRow).join("")}</tbody></table></div></div></div>`;
const hunksPage = pushed => page(`<div data-testid="progressive-diffs-list" class="d-flex flex-column gap-3 p-3">
  ${diffFile("csrc/trtllm_batched_gemm_runner.cu", [
    "@@ -552,4 +552,4 @@",
    [552, 552, "return optionsA.mTileN > optionsB.mTileN;"],
    [553, undefined, "// Tier 2+: prefer the persistent tile scheduler."],
    [undefined, 553, pushed ? "// Tier 2+: rank by tile scheduler, static first." : "// Tier 2+: rank by tile scheduler."],
    [554, 554, "if (optionsA.mTileScheduler != optionsB.mTileScheduler) {"],
    [555, 555, "auto options = bmm.getOptionsFromConfigAndData(configs[idx0], gemmData);"],
    [556, 556, "auto numCtas = bmm.getNumCtas(options);"],
    `@@ -600,3 +${pushed ? 603 : 600},4 @@`,
    [600, pushed ? 603 : 600, "}"],
    [undefined, pushed ? 604 : 601, "return schedulerRank(optionsA) < schedulerRank(optionsB);"],
    [601, pushed ? 605 : 602, ""],
    [602, pushed ? 606 : 603, "return false;"],
  ])}
  ${diffFile("flashinfer/gemm.py", [
    "@@ -10,2 +10,2 @@", [10, undefined, "x = old()"], [undefined, 10, "x = new()"], [11, 11, "y = 1"],
    "@@ -40,2 +40,2 @@", [40, undefined, "x = old()"], [undefined, 40, "x = new()"], [41, 41, "y = 1"],
  ])}
</div>`, pullRequestStyles);

// A rendered Mermaid diagram in GitHub's viewer frame, kept in-process so its requests are mocked too.
const mermaidPage = page(`<article class="markdown-body"><h1>Diagram</h1><section class="js-render-needs-enrichment"><div class="render-container"><iframe class="render-viewer" src="https://viewscreen.githubusercontent.com/markdown/mermaid?docs_host=https%3A%2F%2Fdocs.github.com&color_mode=dark#fixture" width="600" height="300"></iframe></div></section></article>`);
const mermaidFrame = `<!doctype html><html><head><style>body{margin:0;background:#0d1117} .mermaid-view{width:100%;height:100%}</style></head><body><div class="mermaid-view"><div><svg viewBox="0 0 400 200" width="400" height="200"><rect x="10" y="10" width="380" height="180" fill="#30363d"/><text x="200" y="100" fill="white" text-anchor="middle">Client → Server</text></svg></div></div></body></html>`;

const toggle = [["toggle-off", page => page.click(".gibbous-header-button")], ["toggle-on", page => page.click(".gibbous-header-button")]];
const scenarios = [
  {
    name: "repo-outsider",
    url: "https://github.com/vllm-project/vllm",
    routes: {...repositoryRoutes, "https://github.com/vllm-project/vllm": html(withCounts(repository))},
    steps: [
      ["hidden-files-menu", page => page.click(".gibbous-hidden-files-control .gibbous-eyes-toggle")],
      ["hide-file", async page => {
        await page.key("Escape", "Escape", 27);
        await page.hover("tr.react-directory-row:nth-of-type(3) .react-directory-row-name-cell-large-screen");
        await page.click("tr.react-directory-row:nth-of-type(3) .gibbous-hide-file");
      }],
      ["show-file", async page => {
        await page.click(".gibbous-hidden-files-control .gibbous-eyes-toggle");
        await page.click(".gibbous-hidden-files-control .gibbous-list-button");
      }],
      ["my-pulls-tab-readme", page => page.click('nav[aria-label="Repository files"] a:not(.gibbous-tab-link)')],
      ["readme-menu", page => page.click(".gibbous-readme-menu > summary")],
      ...toggle,
    ],
  },
  {
    name: "repo-fork",
    url: "https://github.com/vllm-project/vllm",
    routes: {...repositoryRoutes, "https://github.com/vllm-project/vllm": html(withCounts(repository)), "https://github.com/netanel-haber/vllm": forkPage("netanel-haber/vllm", "vllm-project/vllm")},
    steps: [
      ["contributors", page => page.click('.gibbous-tab-link[data-tab="contributors"]')],
      ["languages", page => page.click('.gibbous-tab-link[data-tab="languages"]')],
      ["back-to-readme", page => page.click('nav[aria-label="Repository files"] a:not(.gibbous-tab-link)')],
      ...toggle,
    ],
  },
  {
    name: "repo-owner",
    url: "https://github.com/netanel-haber/gibbous",
    routes: {...repositoryRoutes, "https://github.com/netanel-haber/gibbous": html(withCounts(githubPage("repo-gibbous")))},
  },
  {
    name: "pulls-mine",
    url: "https://github.com/vllm-project/vllm/pulls?q=is%3Apr+is%3Aclosed+author%3A%40me",
    routes: {...repositoryRoutes, "https://github.com/vllm-project/vllm/pulls*": html(githubPage("pulls-vllm"))},
  },
  {
    name: "dashboard-new",
    url: "https://github.com/",
    routes: {...dashboardRoutes, "https://github.com/": html(dashboardNew)},
    steps: [
      ["hide-repo", page => page.click("#top-repos li:nth-of-type(3) .gibbous-hide-repository")],
      ["hidden-repos-menu", page => page.click(".gibbous-hidden-repositories-control .gibbous-eyes-toggle")],
      ["show-repo", page => page.click(".gibbous-hidden-repositories-control .gibbous-list-button")],
      ["toggle-off", async page => {
        await page.key("Escape", "Escape", 27);
        await page.click(".gibbous-header-button");
      }],
      toggle[1],
    ],
  },
  {name: "dashboard-classic", url: "https://github.com/dashboard", routes: {...dashboardRoutes, "https://github.com/dashboard": html(dashboardClassic)}, steps: toggle},
  {
    name: "drawer",
    url: "https://github.com/explore",
    routes: {...dashboardRoutes, "https://github.com/explore": html(drawer)},
    steps: [["hide-repo", page => page.click("#drawer-repos li:nth-of-type(2) .gibbous-hide-repository")]],
  },
  {
    name: "pr-real",
    url: "https://github.com/vllm-project/vllm/pull/41518",
    routes: {
      "https://github.com/vllm-project/vllm/pull/41518": html(githubPage("pr-conversation")),
      "https://github.com/vllm-project/vllm/pull/41518/timeline_more_items*": html(raw["timeline-more"]),
    },
    steps: [
      ["quotes", page => page.evaluate(`document.querySelectorAll(".js-discussion blockquote").forEach(quote => quote.scrollIntoView({block: "center", behavior: "instant"}))`)],
      ["hover-link", enter(".gibbous-quote-button")],
    ],
  },
  {
    name: "pr-quotes",
    url: "https://github.com/vllm-project/vllm/pull/41518",
    routes: {
      "https://github.com/vllm-project/vllm/pull/41518": html(quotesPage),
      "https://github.com/vllm-project/vllm/pull/41518/timeline_more_items*": html(collapsedComments),
    },
    steps: [
      ["quotes", page => page.evaluate(`document.querySelector("#issuecomment-4 blockquote").scrollIntoView({block: "center", behavior: "instant"})`)],
      ["hover-collapsed-source", enter("#issuecomment-7 .gibbous-quote-rail-source .gibbous-quote-button")],
      ["click-full-quote", page => page.click("#issuecomment-5 .gibbous-quote-rail-source .gibbous-quote-button")],
      ["picker", page => page.click("#issuecomment-4 .gibbous-quote-button[popovertarget]")],
      // Inside a popover: scrolling it into view would move it out from under the pointer.
      ["choose", page => page.evaluate(`document.querySelector('.gibbous-quote-picker:popover-open [data-gibbous-candidate="issuecomment-2"]').click()`)],
      ["hover-chosen", enter("#issuecomment-4 .gibbous-quote-button[popovertarget]")],
      ["hover-down", enter("#issuecomment-2 .gibbous-quote-rail-replies .gibbous-quote-button")],
      ["full-quote", enter("#issuecomment-8 .gibbous-quote-button")],
    ],
  },
  {
    // The diff's counts come from the real pull request, through the background worker.
    name: "pr-changes",
    url: "https://github.com/vllm-project/vllm/pull/41518/changes",
    waitFor: ".gibbous-whitespace-diffstat",
    routes: {"https://github.com/vllm-project/vllm/pull/41518/changes*": url => html(url.includes("ignored") ? changesPage(896, 380) : changesPage(997, 481))},
    steps: [["w1", openChanges("?w=1")], ["w1-ignored-header", openChanges("?w=1&header=ignored")], toggle[0]],
  },
  {
    // Line 556 is context expanded below the first hunk: it stays when the hunk folds.
    name: "pr-hunks",
    url: "https://github.com/vllm-project/vllm/pull/41518/changes",
    routes: {"https://github.com/vllm-project/vllm/pull/41518/changes*": url => html(hunksPage(url.includes("pushed")))},
    steps: [
      ["view-hunks", async page => {
        // One at a time: a fold moves everything below it.
        for (const hunk of ["552", "600", "40"]) {
          await page.click(`#hunk-${hunk} .gibbous-hunk-viewed`);
          await sleep(300);
        }
      }],
      ["pushed", async page => {
        await page.evaluate(`location.href = "/vllm-project/vllm/pull/41518/changes?pushed"`);
        await sleep(500);
        await page.waitFor(".gibbous-hunk-viewed");
      }],
      ...toggle,
      ["unview-hunk", page => page.click("#hunk-600 .gibbous-hunk-viewed")],
    ],
  },
  {
    name: "pr-files-classic",
    url: "https://github.com/vllm-project/vllm/pull/41518/files",
    routes: {"https://github.com/vllm-project/vllm/pull/41518/files": html(githubPage("pr-files"))},
  },
  {
    name: "mermaid",
    url: "https://github.com/netanel-haber/gibbous/blob/main/README.md",
    routes: {"https://github.com/netanel-haber/gibbous/blob/main/README.md": html(mermaidPage), "https://viewscreen.githubusercontent.com/markdown/mermaid*": html(mermaidFrame)},
    steps: [
      ["enlarge", page => page.click(".gibbous-mermaid-open")],
      ["zoom-in", page => page.key("+", "Equal", 187)],
      ["pan", page => page.key("ArrowLeft", "ArrowLeft", 37)],
      ["refit", page => page.key("0", "Digit0", 48)],
      ["close", page => page.key("Escape", "Escape", 27)],
    ],
  },
  {
    name: "theme-site",
    url: "https://github.com/explore",
    routes: {"https://github.com/explore": html(drawer), "https://netanel-haber.github.io/gibbous/": html("<!doctype html><title>Gibbous</title><h1>gibbous</h1>")},
    steps: [["site", page => page.evaluate(`location.href = "https://netanel-haber.github.io/gibbous/"`)]],
  },
].filter(scenario => !only || only.some(name => scenario.name.includes(name)));

// The page as text: every element with its attributes sorted and whether it renders, Gibbous's
// first-paint stylesheet, what is open, and the scroll position.
const serialize = `(() => {
  const out = ["<html " + [...document.documentElement.attributes].map(a => a.name + "=" + JSON.stringify(a.value)).sort().join(" ") + ">"];
  const walk = (node, depth) => {
    const indent = "  ".repeat(depth);
    if (node.nodeType === 3) {
      const text = node.data.replace(/\\s+/g, " ").trim();
      if (text) out.push(indent + JSON.stringify(text));
    } else if (node.nodeType === 1) {
      const attributes = [...node.attributes].map(a => a.name + "=" + JSON.stringify(a.value)).sort().join(" ");
      out.push(indent + "<" + node.localName + (attributes && " " + attributes) + ">" + (node.checkVisibility({checkVisibilityCSS: true}) ? "" : " (hidden)"));
      if (node.localName !== "script") for (const child of node.childNodes) walk(child, depth + 1);
    }
  };
  for (const style of document.head.querySelectorAll("style[id^=gibbous]")) out.push("STYLE " + style.id + " " + style.textContent);
  walk(document.body, 0);
  for (const open of document.querySelectorAll("[popover]:popover-open, dialog[open], details[open]")) out.push("OPEN: " + (open.id || open.className));
  out.push("SCROLL: " + Math.round(scrollX) + "," + Math.round(scrollY));
  return out.join("\\n");
})()`;

// A 1x1 gray PNG for every image, so avatars and README images render the same in every run.
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaGj4DwAD/AH/kN8LaQAAAABJRU5ErkJggg==";

// One headless Chrome, driven over its debugging pipe, with the unpacked extension when given.
const launch = async extension => {
  const chrome = spawn(process.env.CHROME_BIN ?? "google-chrome", [
    "--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", "--no-first-run",
    "--no-default-browser-check", "--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process",
    "--hide-scrollbars", "--force-color-profile=srgb", "--lang=en-US", `--user-data-dir=${mkdtempSync(join(tmpdir(), "gibbous-test-"))}`, "about:blank",
  ], {stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"], env: {...process.env, TZ: "UTC"}});
  let id = 0;
  let buffer = "";
  const pending = new Map();
  const listeners = new Set();
  chrome.stdio[4].on("data", chunk => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf("\0")) >= 0; buffer = buffer.slice(end + 1)) {
      const message = JSON.parse(buffer.slice(0, end));
      if (pending.has(message.id)) pending.get(message.id)(message);
      else for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, message => {
      pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    });
    chrome.stdio[3].write(JSON.stringify({id, method, params, sessionId}) + "\0");
  });
  if (extension) await send("Extensions.loadUnpacked", {path: extension});
  const {targetId} = await send("Target.createTarget", {url: "about:blank"});
  const {sessionId} = await send("Target.attachToTarget", {targetId, flatten: true});
  return {chrome, listeners, sessionId, send: (method, params) => send(method, params, sessionId)};
};

const runScenario = async (extension, outDir, scenario) => {
  const {chrome, listeners, sessionId, send} = await launch(extension);
  try {
    const errors = [];
    const frames = new Map();
    let inflight = 0;
    listeners.add(({method, params, sessionId: from}) => {
      if (from !== sessionId) return;
      if (method === "Runtime.executionContextCreated" && params.context.origin.startsWith("https://viewscreen")) frames.set(params.context.id, params.context);
      if (method === "Runtime.executionContextDestroyed") frames.delete(params.executionContextId);
      if (method === "Runtime.executionContextsCleared") frames.clear();
      if (method === "Runtime.exceptionThrown") errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      if (method === "Runtime.consoleAPICalled" && params.type === "error") errors.push(params.args.map(arg => arg.value ?? arg.description).join(" "));
      if (method !== "Fetch.requestPaused") return;
      const {requestId, request: {url}, resourceType} = params;
      const route = Object.entries(scenario.routes).find(([pattern]) => pattern.endsWith("*") ? url.startsWith(pattern.slice(0, -1)) : url === pattern)?.[1];
      const [status, body, type] = typeof route === "function" ? route(url) : route ?? (resourceType === "Image" ? [200, null, "image/png"] : [404, "", "text/plain"]);
      const mocked = route || resourceType === "Image" || /^https:\/\/(github\.com|api\.github\.com|viewscreen\.githubusercontent\.com|netanel-haber\.github\.io)\//.test(url);
      inflight++;
      const reply = mocked ? send("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [{name: "Content-Type", value: type}, {name: "Access-Control-Allow-Origin", value: "*"}],
        body: body === null ? PIXEL : Buffer.from(body).toString("base64"),
      }) : send("Fetch.continueRequest", {requestId});
      reply.catch(() => {}).finally(() => inflight--);
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false});
    await send("Emulation.setTimezoneOverride", {timezoneId: "UTC"});
    await send("Emulation.setLocaleOverride", {locale: "en-US"});
    await send("Fetch.enable", {patterns: [{urlPattern: "*", requestStage: "Request"}]});
    // No transitions or animations, so screenshots never catch one midway.
    await send("Page.addScriptToEvaluateOnNewDocument", {source: `addEventListener("DOMContentLoaded", () => document.head?.append(Object.assign(document.createElement("style"), {textContent: "*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }"})));`});

    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    // Settled: no real change to the DOM and no request in flight for 700ms, at most 15s. Rewrites
    // of an unchanged value do not count.
    const settle = async () => {
      let last = -1;
      for (let started = Date.now(), quietSince = started; Date.now() - started < 15000;) {
        await sleep(100);
        const count = await evaluate(`(() => {
          window.__changes ??= 0;
          window.__observer ??= new MutationObserver(records => {
            for (const r of records) {
              if (r.type === "attributes" && r.oldValue === r.target.getAttribute(r.attributeName)) continue;
              if (r.type === "characterData" && r.oldValue === r.target.data) continue;
              if (r.type === "childList" && r.addedNodes.length === r.removedNodes.length && [...r.addedNodes].every((node, i) => node.isEqualNode(r.removedNodes[i]))) continue;
              window.__changes++;
            }
          });
          window.__observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true});
          return window.__changes;
        })()`).catch(() => -2);
        if (count !== last || inflight > 0) {
          last = count;
          quietSince = Date.now();
        } else if (Date.now() - quietSince > 700) return;
      }
    };
    const pointAt = selector => evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element?.scrollIntoView({block: "center", behavior: "instant"});
      const rect = element?.getBoundingClientRect();
      return rect && {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`).then(point => point ?? Promise.reject(new Error(`No element for ${selector}`)));
    const page = {
      evaluate,
      async click(selector) {
        const point = await pointAt(selector);
        for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", {type, ...point, button: "left", clickCount: 1});
      },
      async hover(selector) {
        await send("Input.dispatchMouseEvent", {type: "mouseMoved", ...await pointAt(selector)});
      },
      async key(key, code, keyCode) {
        for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", {type, key, code, windowsVirtualKeyCode: keyCode});
      },
      // For work the page cannot see, like the worker's diff download: wait until selector renders.
      async waitFor(selector) {
        for (const started = Date.now(); Date.now() - started < 15000; await sleep(100)) {
          if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`).catch(() => false)) return;
        }
      },
    };

    await send("Page.navigate", {url: scenario.url});
    await sleep(300);
    await settle();
    for (const [label, step] of [["load", page => scenario.waitFor && page.waitFor(scenario.waitFor)], ...(scenario.steps ?? [])]) {
      await Promise.resolve().then(() => step(page)).catch(error => errors.push(`step ${label}: ${error.message}`));
      await sleep(200);
      await settle();
      const texts = [await evaluate(serialize)];
      for (const frame of frames.values()) {
        const result = await send("Runtime.evaluate", {expression: serialize, contextId: frame.id, returnByValue: true}).catch(() => null);
        if (result?.result?.value) texts.push(`FRAME ${frame.origin}\n${result.result.value}`);
      }
      writeFileSync(join(outDir, `${scenario.name}--${label}.txt`), texts.join("\n"));
      writeFileSync(join(outDir, `${scenario.name}--${label}.png`), Buffer.from((await send("Page.captureScreenshot", {format: "png"})).data, "base64"));
    }
    writeFileSync(join(outDir, `${scenario.name}--errors.txt`), errors.join("\n"));
  } finally {
    chrome.kill();
  }
};

// The extension at ref, and the working tree, through every scenario four at a time.
const base = resolve(".test/base-extension");
rmSync(base, {recursive: true, force: true});
mkdirSync(base, {recursive: true});
execFileSync("tar", ["-x", "-C", base], {input: execFileSync("git", ["archive", ref, "manifest.json", "gibbous.js", "gibbous.css", "worker.js"])});
const runs = [[base, resolve(".test/base")], [resolve("."), resolve(".test/work")]];
for (const [, outDir] of runs) {
  rmSync(outDir, {recursive: true, force: true});
  mkdirSync(outDir, {recursive: true});
}
const queue = scenarios.flatMap(scenario => runs.map(([extension, outDir]) => [extension, outDir, scenario]));
await Promise.all(Array.from({length: Number(process.env.JOBS ?? 4)}, async () => {
  while (queue.length) await runScenario(...queue.shift());
}));

// Text must match exactly. Screenshots are compared in Chrome; anti-aliasing varies run to run, so a
// screenshot differs when 20 or more pixels change by more than 40 in luminance.
const [baseDir, workDir] = runs.map(([, outDir]) => outDir);
const names = scenarios.flatMap(scenario => ["errors", "load", ...(scenario.steps ?? []).map(([label]) => label)].map(label => `${scenario.name}--${label}`));
let differences = 0;
for (const name of names) {
  const [before, after] = [baseDir, workDir].map(dir => readFileSync(join(dir, `${name}.txt`), "utf8").split("\n"));
  const first = before.findIndex((line, index) => line !== after[index]);
  if (first < 0 && before.length === after.length) continue;
  differences++;
  const at = first < 0 ? Math.min(before.length, after.length) : first;
  console.log(`DOM ${name}, line ${at + 1}:\n  - ${(before[at] ?? "(end)").trim().slice(0, 200)}\n  + ${(after[at] ?? "(end)").trim().slice(0, 200)}`);
}
const {chrome, send} = await launch();
try {
  const pngs = names.filter(name => !name.endsWith("--errors")).map(name => [name, ...[baseDir, workDir].map(dir => readFileSync(join(dir, `${name}.png`)).toString("base64"))]);
  const {result} = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `Promise.all(${JSON.stringify(pngs)}.map(async ([name, ...images]) => {
      const [a, b] = await Promise.all(images.map(async data => {
        const bitmap = await createImageBitmap(await (await fetch("data:image/png;base64," + data)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        return canvas.getContext("2d").getImageData(0, 0, bitmap.width, bitmap.height).data;
      }));
      let changed = a.length === b.length ? 0 : Infinity;
      for (let i = 0; i < a.length && changed < Infinity; i += 4) {
        if (Math.abs(0.299 * (a[i] - b[i]) + 0.587 * (a[i + 1] - b[i + 1]) + 0.114 * (a[i + 2] - b[i + 2])) > 40) changed++;
      }
      return [name, changed];
    }))`,
  });
  for (const [name, changed] of result.value) {
    if (changed < 20) continue;
    differences++;
    console.log(`PIXELS ${name}: ${changed} pixels`);
  }
} finally {
  chrome.kill();
}
console.log(`${scenarios.length} scenarios, ${names.length - scenarios.length} snapshots against ${ref}: ${differences ? `${differences} differences` : "identical"}. Snapshots: .test/base, .test/work`);
process.exitCode = differences ? 1 : 0;
