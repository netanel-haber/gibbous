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

const icons = {
  actions: '<path d="m1.5 8 5.5-5v10Z"/>',
  branch: '<path d="M5 3.25a1.75 1.75 0 1 1-2.5-1.58v7.66a1.75 1.75 0 1 1-1 0V3.25a.75.75 0 1 0 1.5 0v1.5A2.25 2.25 0 0 0 5.25 7h4.08a1.75 1.75 0 1 1 0 1H5.25A3.25 3.25 0 0 1 2 4.75v-1.5A1.75 1.75 0 0 1 5 2Z"/>',
  chevronDown: '<path d="M4.427 6.427a.75.75 0 0 1 1.06 0L8 8.939l2.513-2.512a.75.75 0 0 1 1.06 1.06l-3.043 3.043a.75.75 0 0 1-1.06 0L4.427 7.487a.75.75 0 0 1 0-1.06Z"/>',
  code: '<path d="m5.22 3.22-4.25 4.25a.75.75 0 0 0 0 1.06l4.25 4.25 1.06-1.06L2.56 8l3.72-3.72Zm5.56 0-1.06 1.06L13.44 8l-3.72 3.72 1.06 1.06 4.25-4.25a.75.75 0 0 0 0-1.06Z"/>',
  comment: '<path d="M1.75 2A1.75 1.75 0 0 0 0 3.75v6.5C0 11.216.784 12 1.75 12h2.78l2.94 2.94A.75.75 0 0 0 8.75 14v-2h5.5A1.75 1.75 0 0 0 16 10.25v-6.5A1.75 1.75 0 0 0 14.25 2Z"/>',
  discussion: '<path d="M1.75 1h8.5C11.216 1 12 1.784 12 2.75v5.5A1.75 1.75 0 0 1 10.25 10H6.5l-2.7 2.7A.75.75 0 0 1 2.5 12v-2h-.75A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1Zm11.5 4H14a2 2 0 0 1 2 2v5.25A1.75 1.75 0 0 1 14.25 14H13.5v1a.75.75 0 0 1-1.28.53L9.69 13H8a2 2 0 0 1-2-2h4.25A2.75 2.75 0 0 0 13 8.25Z"/>',
  eye: '<path d="M8 2c3.1 0 5.7 1.9 7.7 5.38a1.25 1.25 0 0 1 0 1.24C13.7 12.1 11.1 14 8 14S2.3 12.1.3 8.62a1.25 1.25 0 0 1 0-1.24C2.3 3.9 4.9 2 8 2Zm0 1.5c-2.42 0-4.53 1.55-6.26 4.5C3.47 10.95 5.58 12.5 8 12.5s4.53-1.55 6.26-4.5C12.53 5.05 10.42 3.5 8 3.5Zm0 1.75A2.75 2.75 0 1 1 8 10.75 2.75 2.75 0 0 1 8 5.25Z"/>',
  eyeSlash: '<path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/>',
  folder: '<path d="M1.75 2h4.01c.44 0 .86.18 1.17.49L8.44 4h5.81c.97 0 1.75.78 1.75 1.75v6.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.78.78 2 1.75 2Z"/>',
  fork: '<path d="M5 5.37v.88c0 .41.34.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.88a2.25 2.25 0 1 1 1.5 0v.88a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.13a2.25 2.25 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.88a2.25 2.25 0 1 1 1.5 0Z"/>',
  gift: '<path d="M8.75 6H13a2 2 0 0 1 2 2v1.25h-6.25Zm-1.5 0v3.25H1V8a2 2 0 0 1 2-2Zm1.5 4.75H14V14a1 1 0 0 1-1 1H8.75Zm-1.5 0V15H3a1 1 0 0 1-1-1v-3.25ZM4.5 1A2.5 2.5 0 0 1 7 3.5V5H5.5a2.5 2.5 0 0 1-1-4Zm7 0a2.5 2.5 0 0 1-1 4H9V3.5A2.5 2.5 0 0 1 11.5 1Z"/>',
  globe: '<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM3.1 4h2.1c.2-.86.48-1.64.84-2.27A6.54 6.54 0 0 0 3.1 4Zm4.12-2.36C6.8 2.18 6.45 3 6.2 4h3.6c-.25-1-.6-1.82-1.02-2.36A1 1 0 0 0 8 1.2a1 1 0 0 0-.78.44ZM10.8 4h2.1a6.54 6.54 0 0 0-2.94-2.27c.36.63.64 1.41.84 2.27ZM1.7 8c0 .86.17 1.68.47 2.42h2.75A15 15 0 0 1 4.75 8c0-.85.06-1.66.17-2.42H2.17A6.37 6.37 0 0 0 1.7 8Zm4.55 0c0 .85.07 1.66.2 2.42h3.1c.13-.76.2-1.57.2-2.42s-.07-1.66-.2-2.42h-3.1c-.13.76-.2 1.57-.2 2.42Zm4.83 0c0 .85-.06 1.66-.17 2.42h2.92A6.37 6.37 0 0 0 14.3 8c0-.86-.17-1.68-.47-2.42h-2.92c.11.76.17 1.57.17 2.42ZM3.1 12a6.54 6.54 0 0 0 2.94 2.27A9.38 9.38 0 0 1 5.2 12Zm3.1 0c.25 1 .6 1.82 1.02 2.36.24.3.51.44.78.44s.54-.14.78-.44c.42-.54.77-1.36 1.02-2.36Zm4.6 0a9.38 9.38 0 0 1-.84 2.27A6.54 6.54 0 0 0 12.9 12Z"/>',
  home: '<path d="m8.52 1.63 6.25 5.5a.75.75 0 0 1-.99 1.12L13 7.56v6.69a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75V10H5v4.25a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1-.75-.75V7.56l-.78.69a.75.75 0 1 1-.99-1.12l6.25-5.5a3 3 0 0 1 4.04 0Z"/>',
  issue: '<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 8 1.5ZM8 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>',
  menu: '<path d="M1 3.75A.75.75 0 0 1 1.75 3h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 3.75Zm0 4A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75Zm0 4A.75.75 0 0 1 1.75 11h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 11.75Z"/>',
  plus: '<path d="M7.25 1.75a.75.75 0 0 1 1.5 0v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5Z"/>',
  pullRequest: '<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>',
  pullRequestClosed: '<path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>',
  project: '<path d="M1.75 1h12.5C15.22 1 16 1.78 16 2.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.78.78 1 1.75 1ZM1.5 5h4V2.5H1.75a.25.25 0 0 0-.25.25Zm0 1.5v6.75c0 .14.11.25.25.25H5.5v-7Zm5.5 7h7.25a.25.25 0 0 0 .25-.25V9H7Zm0-6h7.5V2.75a.25.25 0 0 0-.25-.25H7Z"/>',
  repo: '<path d="M2 2.75C2 1.78 2.78 1 3.75 1h9.5c.97 0 1.75.78 1.75 1.75v10.5a.75.75 0 0 1-.75.75H5a2 2 0 1 0 0 4h9.25a.75.75 0 0 1 0 1.5H5A3.5 3.5 0 0 1 1.5 16V2.75Zm1.5 0V13c.47-.31.98-.5 1.5-.5h8.5V2.75a.25.25 0 0 0-.25-.25h-9.5a.25.25 0 0 0-.25.25Z"/>',
  search: '<path d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/>',
  star: '<path d="m8 12.03-4.7 2.47.9-5.23L.4 5.56l5.25-.76L8 .03l2.35 4.77 5.25.76-3.8 3.71.9 5.23Z"/>',
  tag: '<path d="M2.75 2h4.69c.46 0 .9.18 1.23.5l5.82 5.83a1.75 1.75 0 0 1 0 2.47l-3.69 3.69a1.75 1.75 0 0 1-2.47 0L2.5 8.66A1.75 1.75 0 0 1 2 7.44V2.75C2 2.34 2.34 2 2.75 2ZM5.5 4.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>',
  x: '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>',
};

const icon = (name, className = "") => `<svg class="octicon ${className}" viewBox="0 0 16 16" aria-hidden="true">${icons[name]}</svg>`;

const iconButton = (name, label, className = "") => `<span class="icon-button ${className}" aria-label="${label}">${icon(name)}</span>`;

const githubMark = () => `
  <svg class="github-mark" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.91c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>`;

const gibbousButton = state => `
  <span class="gibbous-button ${state === "after" ? "enabled" : ""}" aria-label="Gibbous ${state === "after" ? "enabled" : "disabled"}">
    <span aria-hidden="true">${state === "after" ? "🌔" : "🌘"}</span>
  </span>`;

const avatar = (label, className = "") => `<span class="avatar ${className}" aria-hidden="true">${label}</span>`;

const appHeader = (state, title = "lunar-labs / orbit") => `
  <header class="app-header" data-token="bgColor-default">
    <div class="app-brand">
      ${iconButton("menu", "Open global navigation")}
      ${githubMark()}
      <strong>${title}</strong>
    </div>
    <div class="app-actions">
      <span class="search-control">${icon("search")}<span>Type <kbd>/</kbd> to search</span></span>
      ${iconButton("plus", "Create new")}
      ${iconButton("issue", "Issues")}
      ${iconButton("fork", "Pull requests")}
      ${iconButton("repo", "Repositories")}
      ${gibbousButton(state)}
      ${avatar("N")}
    </div>
  </header>`;

const tab = (iconName, label, selected = false, count = "") => `
  <span class="repository-tab ${selected ? "selected" : ""}">${icon(iconName)}<span>${label}</span>${count ? `<b>${count}</b>` : ""}</span>`;

const repositoryTabs = ({state, selected = "code", shortcuts = false}) => {
  const unused = state === "before" ? [
    tab("project", "Projects"),
    tab("discussion", "Discussions"),
    tab("tag", "Security"),
    tab("actions", "Insights"),
  ].join("") : "";
  const shortcutsMarkup = shortcuts && state === "after" ? `<span class="shortcut-group"><span class="shortcut active" data-control="pr-shortcut" data-state="open" aria-label="My open pull requests">${icon("pullRequest")}</span><span class="shortcut" data-control="pr-shortcut" data-state="closed" aria-label="My closed pull requests">${icon("pullRequestClosed")}</span></span>` : "";
  return `
    <nav class="repository-tabs" data-token="bgColor-default">
      ${tab("code", "Code", selected === "code")}
      ${tab("issue", "Issues", selected === "issues", "2.1k")}
      ${tab("fork", "Pull requests", selected === "pulls", "4.3k")}
      ${shortcutsMarkup}
      ${tab("actions", "Actions", selected === "actions")}
      ${unused}
    </nav>`;
};

const repositoryToolbar = ({files = false, state}) => `
  <section class="repository-toolbar">
    <span class="button-control">${icon("branch")}<span>main</span>${icon("chevronDown", "control-chevron")}</span>
    <span>${icon("branch")} <strong>376</strong> Branches</span>
    <span>${icon("tag")} <strong>175</strong> Tags</span>
    <span class="toolbar-spacer"></span>
    <span class="go-to-file">${icon("search")} Go to file <kbd>T</kbd></span>
    <span class="button-label">Add file${icon("chevronDown", "control-chevron")}</span>
    ${files && state === "after" ? `<span class="eyes-wrap">${iconButton("eye", "Hidden files", "eyes-control")}<span class="hidden-menu" data-token="overlay-bgColor"><strong>Hidden files</strong><code>lunar-labs/orbit</code><span><code>.github</code><b>Show</b></span><span><code>benchmarks</code><b>Show</b></span><span><code>docs</code><b>Show</b></span></span></span>` : ""}
    <span class="primary-button">${icon("code")}<span>Code</span>${icon("chevronDown", "control-chevron")}</span>
  </section>`;

const fileRows = ({state, files = false}) => {
  const allRows = [
    [".github", "Refresh issue templates", "this week"],
    ["benchmarks", "Update latency harness", "this week"],
    ["docs", "Clarify deployment guide", "this week"],
    ["scripts", "Improve benchmark launcher", "yesterday"],
    ["tests", "Extend scheduler coverage", "5 hours ago"],
    ["orbit", "Clean up worker lifecycle", "5 hours ago"],
  ];
  const rows = files && state === "after" ? allRows.slice(3) : allRows.slice(files ? 0 : 3);
  return `
    <div class="file-list">
      <div class="commit-row" data-token="bgColor-muted">${avatar("H", "coral")}<strong>hmellor</strong><span>[1/N] Harden scheduler startup</span><span class="toolbar-spacer"></span><span>19,437 Commits</span></div>
      ${rows.map(([name, message, time]) => `
        <div class="file-row ${files && state === "after" && name === "tests" ? "hovered" : ""}">
          ${icon("folder")}<strong>${name}</strong><span>${message}</span><time>${time}</time>
          ${files && state === "after" && name === "tests" ? `<span class="row-action inline-action" data-control="inline-action" aria-label="Hide tests">${icon("eyeSlash")}</span>` : ""}
        </div>`).join("")}
    </div>`;
};

const repositoryBody = ({state, files = false}) => `
  <main class="repository-page">
    ${files ? "" : `
      <section class="repository-title">
        <div class="repository-identity"><span class="repo-logo">V</span><span><strong>orbit</strong><small>Public</small>${state === "after" ? '<em>forked in <u>netanel-haber/orbit</u></em>' : ""}</span></div>
        <div class="repo-actions"><span>♡ Sponsor</span><span>◉ Watch 585</span><span>${icon("fork")} Fork 20.1k</span><span>${icon("star")} Starred 87.9k</span></div>
      </section>`}
    ${repositoryToolbar({files, state})}
    <div class="repository-columns ${files ? "single" : ""}">
      ${fileRows({state, files})}
      ${files ? `
        <section class="readme-card"><strong>README</strong><span></span><span></span><span></span><span></span></section>` : `
        <aside class="about"><strong>About</strong><p>A fast, memory-efficient inference and serving engine for language models.</p><a>🔗 orbit.dev</a><div><b>cuda</b><b>inference</b><b>pytorch</b><b>transformers</b></div></aside>`}
    </div>
  </main>`;

const pullRequestRow = (title, repository, comments) => `
  <div class="list-row">
    <span class="status-icon">${icon("fork")}</span>
    <span class="list-copy"><strong>${title}</strong><small>${repository} · Updated this week</small></span>
    <span class="comment-count">${icon("comment")} ${comments}</span>
  </div>`;

const topRepositories = state => {
  const upstream = [
    ["V", "vllm-project/vllm", true],
    ["S", "sgl-project/sglang", true],
    ["T", "lightseeker/tokenspeed", true],
    ["F", "fla-org/flash-linear-attention", true],
    ["F", "flashinfer-ai/flashinfer", true],
  ];
  const personal = [
    ["N", "netanel-haber/snakepath", false],
    ["N", "netanel-haber/dash-dash-help", false],
    ["N", "netanel-haber/localfiles.stream", false],
    ["N", "netanel-haber/profile", false],
  ];
  const mixed = [personal[0], personal[1], ["V", "vllm-project/vllm", false], personal[2], personal[3]];
  const repositories = state === "after" ? [...upstream, ...personal.slice(0, 3)] : mixed;
  return `
    <section class="top-repositories">
      <div class="top-repositories-heading"><strong>Top repositories</strong><span>${state === "after" ? icon("eye") : ""}${icon("search")}</span></div>
      ${repositories.map(([letter, name, fork]) => `<span class="repository-link">${avatar(letter, letter === "N" ? "personal" : "organization")}<b>${name}</b>${fork ? `<span class="inline-action">${icon("fork")}</span>` : ""}</span>`).join("")}
      <small>Show ${state === "after" ? "even " : ""}more</small>
    </section>`;
};

const dashboardScene = state => `
  ${appHeader(state, "Dashboard")}
  <div class="dashboard-layout ${state}">
    <aside class="dashboard-sidebar">
      <div class="account">${avatar("N")}<span><strong>netanel-haber</strong><small>Your personal account</small></span></div>
      ${state === "before" ? `<nav class="dashboard-mini-nav"><span>${icon("home")} Home</span><span>${icon("globe")} Feed</span></nav>` : ""}
      ${topRepositories(state)}
    </aside>
    <main class="dashboard-main">
      ${state === "before" ? `
        <section class="copilot-card">
          <h1>◉ Good afternoon, netanel-haber!</h1>
          <div class="prompt">Ask anything or type @ to add context</div>
          <div class="quick-actions"><span>Debug</span><span>Agent</span><span>Create issue</span><span>Write code</span><span>Git</span></div>
        </section>` : ""}
      <section class="dashboard-section"><div class="section-heading"><h2>Pull requests</h2><a>View all&nbsp; ☷</a></div><div class="list-card">${pullRequestRow("[Misc] Reduce `time vllm --help` and `time vllm serve --help` to <1s warm", "vllm-project/vllm#41518", 25)}${pullRequestRow("[Quantization] Select linear backends per quantization", "vllm-project/vllm#51204", 1)}</div></section>
      <section class="dashboard-section"><div class="section-heading"><h2>Issues</h2><a>View all&nbsp; ☷</a></div><div class="list-card">${pullRequestRow("Raise when sampling parameters mismatch", "flashinfer-ai/flashinfer#1634", 3)}</div></section>
    </main>
    ${state === "before" ? `<aside class="changelog"><strong>Latest from our changelog</strong><span><small>2 days ago</small>GitHub Copilot weekly releases</span><span><small>2 days ago</small>GPT-6 Astra is generally available</span><span><small>3 days ago</small>Multiple trusted publishing configurations</span></aside>` : ""}
  </div>`;

const repositoryScene = state => `
  ${appHeader(state)}
  ${repositoryTabs({state})}
  ${repositoryBody({state})}`;

const pullRequestsScene = state => `
  ${appHeader(state)}
  ${repositoryTabs({state, selected: "pulls", shortcuts: true})}
  <main class="pulls-page">
    <div class="pulls-heading"><h1>Pull requests</h1><span>Labels&nbsp;&nbsp; Milestones</span></div>
    <div class="list-card">${pullRequestRow("Improve scheduler wide-N alignment", "lunar-labs/orbit#49099", 1)}${pullRequestRow("Add SSD prefill backend", "lunar-labs/orbit#49425", 1)}${pullRequestRow("Reduce warm startup below one second", "lunar-labs/orbit#41518", 22)}</div>
  </main>`;

const filesScene = state => `
  ${appHeader(state)}
  ${repositoryTabs({state, shortcuts: true})}
  ${repositoryBody({state, files: true})}`;

const navigationItems = [
  ["home", "Home", "primary"],
  ["globe", "Feed", "main"],
  ["issue", "All issues", "primary"],
  ["fork", "All pull requests", "primary"],
  ["repo", "All repositories", "primary"],
  ["project", "Projects", "main"],
  ["discussion", "Discussions", "main"],
  ["repo", "Codespaces", "main"],
  ["discussion", "Copilot", "main"],
  ["globe", "Explore", "secondary"],
  ["gift", "Marketplace", "secondary"],
  ["discussion", "MCP registry", "secondary"],
];

const sidebarNavigation = state => {
  const items = navigationItems.filter(([, , group]) => state === "before" || group === "primary");
  return items.map(([iconName, label, group], index) => {
    const divider = index > 0 && group === "secondary" && items[index - 1][2] !== "secondary" ? '<span class="navigation-divider"></span>' : "";
    return `${divider}<span class="navigation-link ${index === 0 ? "selected" : ""}">${icon(iconName)} ${label}</span>`;
  }).join("");
};

const sidebarScene = state => `
  <div class="sidebar-underlay">${dashboardScene(state)}</div>
  <div class="modal-scrim"></div>
  <aside class="global-sidebar" data-token="bgColor-default">
    <div class="sidebar-head">${githubMark()}${icon("x")}</div>
    <nav>${sidebarNavigation(state)}</nav>
    <span class="navigation-divider"></span>
    ${topRepositories(state)}
  </aside>`;

const comment = ({author, initial, text, quoted = false, direction = ""}) => `
  <article class="timeline-comment ${quoted ? "matched" : ""}">
    ${avatar(initial, author === "netanel-haber" ? "personal" : "contributor")}
    <div class="comment-card">
      <header data-token="bgColor-muted"><strong>${author}</strong><span>commented ${author === "netanel-haber" ? "last week" : "2 weeks ago"}</span><small>${author === "netanel-haber" ? "Author" : "Contributor"}</small>•••</header>
      <div class="comment-body">
        ${author === "netanel-haber" ? `<blockquote class="${quoted ? "highlight" : ""}">Hi <a>@netanel-haber</a>, I have a narrower CLI-dispatch patch ready that overlaps the user-facing goal here, so I wanted to coordinate before opening it.</blockquote><p>Push whichever approach you think is best. This also reduces feedback time for misspelled flags and invalid argument values.</p>` : `<p class="${quoted ? "highlight" : ""}">Hi <a>@netanel-haber</a>, I have a narrower CLI-dispatch patch ready that overlaps the user-facing goal here, so I wanted to coordinate before opening it.</p><p>I based the shape on two review points in this PR: keep imports lazy and share the environment setup. The boundary is different, but the result preserves fast, complete help.</p>`}
      </div>
    </div>
    ${direction ? `<span class="match-link ${direction}">${direction === "down" ? "↓" : "↑"} full match</span>` : ""}
  </article>`;

const quoteScene = state => `
  ${appHeader(state)}
  <section class="pull-request-title"><span>Open</span><div><h1>Reduce CLI startup below one second <small>#41518</small></h1><p><strong>netanel-haber</strong> wants to merge into <code>lunar-labs:main</code></p></div></section>
  <main class="timeline">
    ${comment({author: "matteso1", initial: "M", text: "", quoted: state === "after", direction: state === "after" ? "down" : ""})}
    <div class="hidden-comments"><span></span><b>36 hidden items<br><a>Load more…</a></b><span></span></div>
    ${comment({author: "netanel-haber", initial: "N", text: "", quoted: state === "after", direction: state === "after" ? "up" : ""})}
  </main>`;

const scenes = {
  dashboard: dashboardScene,
  sidebar: sidebarScene,
  "repository-navigation": repositoryScene,
  "pull-request-shortcuts": pullRequestsScene,
  "hidden-files": filesScene,
  "quote-navigation": quoteScene,
};

const states = new Set(["before", "after"]);
const demo = document.querySelector("#demo");

const renderDemo = options => {
  const feature = scenes[options.feature] ? options.feature : "dashboard";
  const state = states.has(options.state) ? options.state : "before";
  const theme = themes.has(options.theme) ? options.theme : "dark";
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  if (root.dataset.feature !== feature) root.dataset.feature = feature;
  if (root.dataset.state !== state) root.dataset.state = state;
  const sceneChanged = demo.dataset.feature !== feature || demo.dataset.state !== state;
  demo.dataset.feature = feature;
  demo.dataset.state = state;
  demo.dataset.theme = theme;
  demo.ariaLabel = `${feature.replaceAll("-", " ")}, ${state}, ${theme}`;
  if (sceneChanged) demo.innerHTML = scenes[feature](state);
};

const params = new URLSearchParams(location.search);
renderDemo({
  feature: params.get("feature"),
  state: params.get("state"),
  theme: params.get("theme"),
});

new MutationObserver(() => renderDemo(document.documentElement.dataset)).observe(document.documentElement, {
  attributeFilter: ["data-feature", "data-state", "data-theme"],
  attributes: true,
});

addEventListener("message", event => {
  if (event.origin !== location.origin || event.data?.type !== "gibbous-demo") return;
  renderDemo({...demo.dataset, ...event.data});
});

window.renderGibbousDemo = renderDemo;
