const THEME_NAMES = {
  light: "Light default",
  "light-high-contrast": "Light · high contrast",
  "light-colorblind": "Light colorblind",
  "light-colorblind-high-contrast": "Light colorblind · high contrast",
  dark: "Dark default",
  "dark-high-contrast": "Dark · high contrast",
  "dark-colorblind": "Dark colorblind",
  "dark-colorblind-high-contrast": "Dark colorblind · high contrast",
  "dark-dimmed": "Soft dark",
  "dark-dimmed-high-contrast": "Soft dark · high contrast",
};

const FEATURE_HASHES = {
  dashboard: "dashboard",
  sidebar: "sidebar",
  "repository-navigation": "repo-nav",
  "pull-request-shortcuts": "pr-shortcuts",
  "hidden-files": "files-hider",
  "quote-navigation": "quote-replies",
  mermaid: "mermaid",
};

const HASH_FEATURES = Object.fromEntries(
  Object.entries(FEATURE_HASHES).flatMap(([feature, hash]) => [[feature, feature], [hash, feature]]),
);

const root = document.documentElement;
const siteHeader = document.querySelector(".site-header");
const themeSelect = document.querySelector("#theme-select");
const githubThemeOption = themeSelect.querySelector('[value="github"]');
const gallery = document.querySelector(".gallery-scroll");
const gallerySticky = document.querySelector(".gallery-sticky");
const track = document.querySelector(".gallery-track");
const [previous, next] = document.querySelectorAll(".gallery-navigation");
const comparisonToggle = document.querySelector(".comparison-toggle");
const status = document.querySelector(".gallery-sticky > .sr-only");
const panels = [...document.querySelectorAll(".feature-panel")];
const cards = [...document.querySelectorAll(".comparison-card")];
const desktop = matchMedia("(min-width: 1024px)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let githubTheme = "dark";
let selectedTheme = githubTheme;
let currentPanel = -1;
let comparisonsEnabled = false;
let galleryUpdateScheduled = false;
let phaseTimers = [];

const renderFrame = frame => {
  if (!frame) return;
  frame.style.setProperty("--demo-scale", frame.parentElement.clientWidth / 1280);
  const demoRoot = frame.contentDocument?.documentElement;
  if (!demoRoot) return;
  demoRoot.dataset.theme = selectedTheme;
  demoRoot.dataset.state = comparisonsEnabled ? "after" : "before";
  const body = frame.contentDocument.body;
  if (body) frame.parentElement.style.background = frame.contentWindow.getComputedStyle(body).backgroundColor;
};

const renderFrames = () => document.querySelectorAll(".demo-frame").forEach(renderFrame);

const readGitHubTheme = () => {
  const theme = root.dataset.githubTheme;
  if (THEME_NAMES[theme]) githubTheme = theme;
};

const renderTheme = () => {
  readGitHubTheme();
  selectedTheme = themeSelect.value === "github" ? githubTheme : themeSelect.value;
  githubThemeOption.textContent = `GitHub · ${THEME_NAMES[githubTheme]}`;
  renderFrames();
};

const setHash = feature => history.replaceState(null, "", `#${FEATURE_HASHES[feature]}`);

const showPanel = (index, syncHash = false) => {
  const changed = index !== currentPanel;
  if (changed) track.dataset.direction = index < currentPanel ? "previous" : "next";
  currentPanel = index;
  previous.disabled = index === 0;
  next.disabled = index === panels.length - 1;
  panels.forEach((panel, panelIndex) => {
    const active = panelIndex === index;
    panel.inert = desktop.matches && !active;
    panel.toggleAttribute("data-active", active);
  });
  status.textContent = `${panels[index].dataset.title}, ${index + 1} of ${panels.length}`;
  const featureHash = FEATURE_HASHES[panels[index].dataset.feature];
  if (syncHash && (changed || location.hash.slice(1) !== featureHash)) setHash(panels[index].dataset.feature);
};

const updateGallery = (syncHash = true) => {
  if (!desktop.matches) return;
  const distance = gallery.offsetHeight - gallerySticky.offsetHeight;
  const progress = Math.min(1, Math.max(0, (siteHeader.offsetHeight - gallery.getBoundingClientRect().top) / distance));
  showPanel(Math.min(panels.length - 1, Math.floor(progress * panels.length)), syncHash);
};

const scheduleGalleryUpdate = () => {
  if (galleryUpdateScheduled) return;
  galleryUpdateScheduled = true;
  requestAnimationFrame(() => {
    galleryUpdateScheduled = false;
    updateGallery();
  });
};

const goToPanel = index => {
  const bounded = Math.min(panels.length - 1, Math.max(0, index));
  if (!desktop.matches) {
    showPanel(bounded, true);
    panels[bounded].scrollIntoView({block: "start"});
    return;
  }
  const distance = gallery.offsetHeight - gallerySticky.offsetHeight;
  const galleryTop = scrollY + gallery.getBoundingClientRect().top;
  scrollTo({top: galleryTop - siteHeader.offsetHeight + (bounded + .5) / panels.length * distance});
  showPanel(bounded, true);
};

const navigateToHash = () => {
  const feature = HASH_FEATURES[location.hash.slice(1)];
  const index = panels.findIndex(panel => panel.dataset.feature === feature);
  if (index < 0) return false;
  const bounded = Math.min(panels.length - 1, Math.max(0, index));
  if (desktop.matches) {
    const distance = gallery.offsetHeight - gallerySticky.offsetHeight;
    const galleryTop = scrollY + gallery.getBoundingClientRect().top;
    scrollTo({top: galleryTop - siteHeader.offsetHeight + (bounded + .5) / panels.length * distance});
    showPanel(bounded);
  } else {
    showPanel(bounded);
    panels[bounded].scrollIntoView({block: "start"});
  }
  return true;
};

const configureGallery = () => {
  root.style.setProperty("--site-header-height", `${siteHeader.offsetHeight}px`);
  if (desktop.matches) return updateGallery(false);
  panels.forEach(panel => panel.inert = false);
  if (currentPanel >= 0) showPanel(currentPanel);
};

const animateMoon = enabled => {
  phaseTimers.forEach(clearTimeout);
  const moon = comparisonToggle.querySelector(".comparison-moon");
  const phases = enabled
    ? ["🌘", "🌑", "🌒", "🌓", "🌔"]
    : ["🌔", "🌕", "🌖", "🌗", "🌘"];
  if (reducedMotion.matches) {
    moon.textContent = phases.at(-1);
    return;
  }
  phaseTimers = phases.map((phase, index) => setTimeout(() => moon.textContent = phase, index * 90));
};

// Crossfade to the other clip: keep the old frame on top and fade it out once the new one has loaded.
const swapAnimation = (animation, source) => {
  const ghost = animation.cloneNode();
  ghost.classList.add("demo-gif-ghost");
  ghost.removeAttribute("loading");
  animation.after(ghost);
  animation.setAttribute("src", source);
  const fade = () => {
    ghost.classList.add("demo-gif-fading");
    ghost.addEventListener("transitionend", () => ghost.remove(), {once: true});
    setTimeout(() => ghost.remove(), 600);
  };
  if (animation.complete) requestAnimationFrame(fade);
  else animation.addEventListener("load", fade, {once: true});
};

const pulseCards = () => {
  for (const card of cards) {
    card.classList.remove("comparison-card-pulse");
    void card.offsetWidth;
    card.classList.add("comparison-card-pulse");
  }
};

const renderComparison = () => {
  const state = comparisonsEnabled ? "after" : "before";
  const action = comparisonsEnabled ? "Disable" : "Enable";
  root.dataset.comparison = state;
  comparisonToggle.ariaChecked = String(comparisonsEnabled);
  comparisonToggle.ariaLabel = `${action} Gibbous for every example`;
  comparisonToggle.title = `${action} Gibbous (Space)`;
  for (const panel of panels) {
    const label = `GitHub ${comparisonsEnabled ? "with" : "before"} Gibbous: ${panel.dataset.title}`;
    const frame = panel.querySelector(".demo-frame");
    if (frame) {
      frame.title = label;
      renderFrame(frame);
    }
    const animation = panel.querySelector(".demo-gif");
    if (animation) {
      const source = animation.dataset[state];
      if (animation.getAttribute("src") !== source) swapAnimation(animation, source);
      animation.alt = label;
    }
  }
};

themeSelect.value = "github";
themeSelect.addEventListener("change", renderTheme);
new MutationObserver(renderTheme).observe(root, {attributes: true, attributeFilter: ["data-github-theme"]});
document.querySelectorAll(".demo-frame").forEach(frame => frame.addEventListener("load", () => renderFrame(frame)));
const frameResizeObserver = new ResizeObserver(entries => {
  for (const {target} of entries) renderFrame(target.querySelector(".demo-frame"));
});
cards.forEach(card => {
  frameResizeObserver.observe(card);
  card.tabIndex = 0;
  card.role = "button";
  card.ariaLabel = `Toggle Gibbous for ${card.closest(".feature-panel").dataset.title}`;
  card.addEventListener("click", () => comparisonToggle.click());
  card.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    comparisonToggle.click();
  });
});
previous.addEventListener("click", () => goToPanel(currentPanel - 1));
next.addEventListener("click", () => goToPanel(currentPanel + 1));
comparisonToggle.addEventListener("click", () => {
  comparisonsEnabled = !comparisonsEnabled;
  comparisonToggle.dataset.orbit = comparisonsEnabled ? "on" : "off";
  animateMoon(comparisonsEnabled);
  pulseCards();
  renderComparison();
});
comparisonToggle.querySelector(".comparison-moon").addEventListener("animationend", () => delete comparisonToggle.dataset.orbit);
addEventListener("scroll", scheduleGalleryUpdate, {passive: true});
addEventListener("hashchange", () => requestAnimationFrame(navigateToHash));
addEventListener("resize", configureGallery);
desktop.addEventListener("change", configureGallery);
addEventListener("keydown", event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest?.("a, button, input, textarea, select, [contenteditable], [role=button]")) return;
  if (event.key === "ArrowLeft") goToPanel(currentPanel - 1);
  else if (event.key === "ArrowRight") goToPanel(currentPanel + 1);
  else if (event.key === " ") comparisonToggle.click();
  else return;
  event.preventDefault();
});

renderTheme();
renderComparison();
configureGallery();
if (!navigateToHash()) updateGallery();
root.dataset.siteReady = "";
