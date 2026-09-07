import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, readdir, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const themes = [
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
];

const features = [
  "dashboard",
  "sidebar",
  "repository-navigation",
  "pull-request-shortcuts",
  "hidden-files",
  "quote-navigation",
];

const states = ["before", "after"];

const palettes = {
  light: {
    canvas: "#ffffff",
    subtle: "#f6f8fa",
    inset: "#f6f8fa",
    overlay: "#ffffff",
  },
  "light-high-contrast": {
    canvas: "#ffffff",
    subtle: "#e6eaef",
    inset: "#eff2f5",
    overlay: "#ffffff",
  },
  "light-colorblind": {
    canvas: "#ffffff",
    subtle: "#f6f8fa",
    inset: "#f6f8fa",
    overlay: "#ffffff",
  },
  "light-colorblind-high-contrast": {
    canvas: "#ffffff",
    subtle: "#e6eaef",
    inset: "#eff2f5",
    overlay: "#ffffff",
  },
  dark: {
    canvas: "#0d1117",
    subtle: "#151b23",
    inset: "#010409",
    overlay: "#010409",
  },
  "dark-high-contrast": {
    canvas: "#010409",
    subtle: "#151b23",
    inset: "#010409",
    overlay: "#010409",
  },
  "dark-colorblind": {
    canvas: "#0d1117",
    subtle: "#151b23",
    inset: "#010409",
    overlay: "#010409",
  },
  "dark-colorblind-high-contrast": {
    canvas: "#010409",
    subtle: "#151b23",
    inset: "#010409",
    overlay: "#010409",
  },
  "dark-dimmed": {
    canvas: "#212830",
    subtle: "#262c36",
    inset: "#151b23",
    overlay: "#2a313c",
  },
  "dark-dimmed-high-contrast": {
    canvas: "#212830",
    subtle: "#262c36",
    inset: "#151b23",
    overlay: "#262c36",
  },
};

// The site shell keeps its own fixed palette; only the demo follows the GitHub theme.
const siteCanvas = "#101722";

const requiredSurfaceRoles = {
  dashboard: ["canvas", "header"],
  sidebar: ["canvas", "header"],
  "repository-navigation": ["canvas", "header", "navigation"],
  "pull-request-shortcuts": ["canvas", "header", "navigation"],
  "hidden-files": ["canvas", "header", "navigation", "subtle"],
  "quote-navigation": ["canvas", "header", "subtle"],
};

const expectedAssets = new Set([
  "dashboard-after.webp",
  "dashboard-before.webp",
  "hidden-files-after.webp",
  "hidden-files-before.webp",
  "pull-request-shortcuts-after.webp",
  "pull-request-shortcuts-before.webp",
  "quote-navigation-after.webp",
  "quote-navigation-before.webp",
  "repository-navigation-after.webp",
  "repository-navigation-before.webp",
  "sidebar-after.webp",
  "sidebar-before.webp",
]);

const siteUrl = process.argv[2] ?? process.env.GIBBOUS_AUDIT_URL ?? "http://127.0.0.1:4173/";
const outputDirectory = resolve(process.env.GIBBOUS_AUDIT_OUT ?? "/tmp/gibbous-site-audit");
const cdpPort = Number(process.env.GIBBOUS_CDP_PORT ?? 9227);
const cdpEndpoint = `http://127.0.0.1:${cdpPort}/json/list`;
const viewport = {width: 2128, height: 1014};
const failures = [];
const browserErrors = [];
const headerPixels = new Map();
let activeCase = "startup";

const sleep = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

const fail = (testCase, message, details = undefined) => {
  failures.push({case: testCase, message, details});
};

const findChrome = () => {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find(existsSync);
};

const findBrowserTarget = async () => {
  const targets = await fetch(cdpEndpoint).then(response => response.json());
  return targets.find(candidate => candidate.type === "page") ?? null;
};

const waitForBrowser = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const target = await findBrowserTarget();
      if (target) return target;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Chrome DevTools endpoint did not become ready at ${cdpEndpoint}`);
};

const connectToBrowser = async () => {
  try {
    const target = await findBrowserTarget();
    if (target) return {target, process: null};
  } catch {
  }
  const executable = findChrome();
  if (!executable) throw new Error("Set CHROME_BIN to a Chrome or Chromium executable");
  const profileDirectory = await mkdtemp(join(tmpdir(), "gibbous-audit-chrome-"));
  const browserProcess = spawn(executable, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], {stdio: "ignore"});
  return {target: await waitForBrowser(), process: browserProcess};
};

const openProtocol = async target => {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, {once: true});
    socket.addEventListener("error", rejectPromise, {once: true});
  });

  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({data}) => {
    const message = JSON.parse(data);
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown") {
        browserErrors.push({case: activeCase, type: "exception", value: message.params.exceptionDetails.text});
      }
      if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) {
        browserErrors.push({
          case: activeCase,
          type: `console.${message.params.type}`,
          value: message.params.args.map(argument => argument.value ?? argument.description ?? "").join(" "),
        });
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        browserErrors.push({case: activeCase, type: "log", value: message.params.entry.text});
      }
      return;
    }
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
    const id = ++commandId;
    pending.set(id, {resolve: resolvePromise, reject: rejectPromise});
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return {evaluate, send, socket};
};

const waitForDocument = async protocol => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await protocol.evaluate("document.readyState === 'complete'");
    if (ready) return;
    await sleep(50);
  }
  throw new Error("Document did not finish loading");
};

const settle = async protocol => {
  await protocol.evaluate(`(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
    const frames = [...document.querySelectorAll("iframe")];
    await Promise.all(frames.map(async frame => {
      if (!frame.contentDocument) return;
      await frame.contentDocument.fonts.ready;
      await Promise.all([...frame.contentDocument.images].map(image => image.decode().catch(() => undefined)));
    }));
    await new Promise(resolvePromise => requestAnimationFrame(() => requestAnimationFrame(resolvePromise)));
  })()`);
};

const prepareCase = async (protocol, theme, feature, state) => {
  const result = await protocol.evaluate(`(async () => {
    const theme = ${JSON.stringify(theme)};
    const feature = ${JSON.stringify(feature)};
    const state = ${JSON.stringify(state)};
    const select = document.querySelector("#theme-select");
    if (!select) return {error: "Missing #theme-select"};
    select.value = theme;
    select.dispatchEvent(new Event("change", {bubbles: true}));
    const panel = document.querySelector('[data-feature="' + CSS.escape(feature) + '"]');
    if (!panel) return {error: "Missing panel for " + feature};
    location.hash = feature;
    const toggle = document.querySelector(".comparison-toggle");
    if (!toggle) return {error: "Missing .comparison-toggle"};
    const shouldBeAfter = state === "after";
    if ((toggle.getAttribute("aria-checked") === "true") !== shouldBeAfter) toggle.click();
    await new Promise(resolvePromise => requestAnimationFrame(() => requestAnimationFrame(resolvePromise)));
    return {
      active: panel.hasAttribute("data-active") || getComputedStyle(panel).visibility !== "hidden",
      checked: toggle.getAttribute("aria-checked"),
      selectedTheme: document.querySelector("#theme-select").value,
    };
  })()`);
  if (result.error) throw new Error(result.error);
  if (!result.active) fail(activeCase, "Feature panel is not active");
  if (result.checked !== String(state === "after")) {
    fail(activeCase, `Comparison switch is ${result.checked}, expected ${state === "after"}`);
  }
  if (result.selectedTheme !== theme) fail(activeCase, `Selected theme is ${result.selectedTheme}, expected ${theme}`);
};

const inspectCase = async (protocol, feature) => protocol.evaluate(`(() => {
  const feature = ${JSON.stringify(feature)};
  const panel = document.querySelector('[data-feature="' + CSS.escape(feature) + '"]');
  const iframe = panel?.querySelector("iframe");
  const demoDocument = iframe?.contentDocument ?? panel;
  const demoWindow = iframe?.contentWindow ?? window;
  const demoRoot = demoDocument?.querySelector?.("[data-demo-root], #demo") ?? demoDocument?.documentElement ?? panel;
  const rect = element => {
    const value = element.getBoundingClientRect();
    return {bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width};
  };
  const style = element => {
    const value = demoWindow.getComputedStyle(element);
    return {
      backdropFilter: value.backdropFilter,
      backgroundColor: value.backgroundColor,
      backgroundImage: value.backgroundImage,
      borderBottomWidth: value.borderBottomWidth,
      borderColor: value.borderColor,
      borderLeftWidth: value.borderLeftWidth,
      borderRadius: value.borderRadius,
      borderRightWidth: value.borderRightWidth,
      borderTopWidth: value.borderTopWidth,
      boxShadow: value.boxShadow,
      display: value.display,
      filter: value.filter,
      visibility: value.visibility,
    };
  };
  const describe = element => {
    if (element.id) return "#" + element.id;
    if (element.dataset.control) return '[data-control="' + element.dataset.control + '"]';
    if (element.dataset.surface) return '[data-surface="' + element.dataset.surface + '"]';
    if (element.dataset.token) return '[data-token="' + element.dataset.token + '"]';
    return element.tagName.toLowerCase() + (element.classList.length ? "." + [...element.classList].join(".") : "");
  };
  const filtered = [];
  const filterScopes = [demoDocument.documentElement, ...demoDocument.querySelectorAll("*")];
  for (const element of new Set(filterScopes)) {
    const elementWindow = element.ownerDocument.defaultView;
    const computed = elementWindow.getComputedStyle(element);
    if (computed.filter !== "none" || computed.backdropFilter !== "none") {
      filtered.push({backdropFilter: computed.backdropFilter, element: describe(element), filter: computed.filter});
    }
  }
  const tokenRoles = {
    "bgColor-default": element => element.matches(".app-header")
      ? "header"
      : element.matches(".repository-tabs")
        ? "navigation"
        : "canvas",
    "bgColor-inset": () => "inset",
    "bgColor-muted": () => "subtle",
    "overlay-bgColor": () => "overlay",
  };
  const surfaces = [...demoDocument.querySelectorAll("[data-surface], [data-token]")].map(element => ({
    element: describe(element),
    rect: rect(element),
    role: element.dataset.surface ?? tokenRoles[element.dataset.token]?.(element) ?? element.dataset.token,
    style: style(element),
  }));
  if (!surfaces.some(surface => surface.role === "canvas") && demoRoot) {
    surfaces.unshift({element: describe(demoRoot), rect: rect(demoRoot), role: "canvas", style: style(demoRoot)});
  }
  const controlType = element => {
    if (element.dataset.control) return element.dataset.control;
    if (element.matches(".gibbous-button")) return "gibbous";
    if (element.matches(".eyes-control")) return "files-menu";
    if (element.matches(".inline-action")) return "inline-action";
    if (element.matches(".button-label")) return "medium-peer";
    return "toolbar-peer";
  };
  const controls = [...demoDocument.querySelectorAll("[data-control], .gibbous-button, .eyes-control, .inline-action, .app-actions > .icon-button, .button-label")].map(element => ({
    control: controlType(element),
    enabled: element.classList.contains("enabled"),
    hasIcon: Boolean(element.querySelector("svg")),
    pressed: element.getAttribute("aria-pressed"),
    rect: rect(element),
    state: element.dataset.state,
    style: style(element),
    text: element.textContent.trim(),
  }));
  const visibleElements = [...demoDocument.querySelectorAll("[data-control], [data-audit-visible], .gibbous-button, .eyes-control, .inline-action")]
    .filter(element => {
      const computed = demoWindow.getComputedStyle(element);
      return computed.display !== "none" && computed.visibility !== "hidden";
    })
    .map(element => ({element: describe(element), rect: rect(element)}));
  const comparisonCard = panel?.querySelector(".comparison-card");
  const galleryFrame = panel?.closest(".gallery-frame, .gallery-viewport") ?? document.querySelector(".gallery-frame, .gallery-viewport");
  return {
    comparisonCard: comparisonCard ? {rect: rect(comparisonCard), style: getComputedStyle(comparisonCard).backgroundColor} : null,
    controls,
    demoOverflow: demoDocument.documentElement ? {
      clientHeight: demoDocument.documentElement.clientHeight,
      clientWidth: demoDocument.documentElement.clientWidth,
      scrollHeight: demoDocument.documentElement.scrollHeight,
      scrollWidth: demoDocument.documentElement.scrollWidth,
    } : null,
    demoRoot: demoRoot ? rect(demoRoot) : null,
    filtered,
    frame: iframe ? rect(iframe) : null,
    galleryFrame: galleryFrame ? rect(galleryFrame) : null,
    pageBackground: getComputedStyle(document.body).backgroundColor,
    pageOverflow: {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    },
    surfaces,
    theme: demoDocument.documentElement?.dataset.theme,
    visibleElements,
    viewport: {height: demoWindow.innerHeight, width: demoWindow.innerWidth},
  };
})()`);

const colorTuple = color => {
  if (color.startsWith("#")) {
    const digits = color.slice(1);
    const expanded = digits.length === 3 ? [...digits].map(value => value.repeat(2)).join("") : digits;
    return [
      ...[0, 2, 4].map(offset => Number.parseInt(expanded.slice(offset, offset + 2), 16)),
      expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    ];
  }
  const values = color.match(/[\d.]+/g)?.map(Number);
  return values && values.length >= 3 ? [...values.slice(0, 3), values[3] ?? 1] : null;
};

const colorsEqual = (actual, expected) => {
  const actualTuple = colorTuple(actual);
  const expectedTuple = colorTuple(expected);
  return actualTuple && expectedTuple && actualTuple.every((value, index) => value === expectedTuple[index]);
};

const expectedSurfaceColor = (palette, role) => {
  if (["canvas", "header", "navigation"].includes(role)) return palette.canvas;
  return palette[role];
};

const inside = (inner, outer, tolerance = 1) => inner.left >= outer.left - tolerance
  && inner.top >= outer.top - tolerance
  && inner.right <= outer.right + tolerance
  && inner.bottom <= outer.bottom + tolerance;

const auditInspection = (inspection, theme, feature, state) => {
  const palette = palettes[theme];
  if (inspection.theme !== theme) fail(activeCase, `Demo theme is ${inspection.theme}, expected ${theme}`);
  if (!colorsEqual(inspection.pageBackground, siteCanvas)) {
    fail(activeCase, `Page canvas is ${inspection.pageBackground}, expected ${siteCanvas}`);
  }
  if (inspection.comparisonCard && !colorsEqual(inspection.comparisonCard.style, palette.canvas)) {
    fail(activeCase, `Comparison card is ${inspection.comparisonCard.style}, expected ${palette.canvas}`);
  }
  for (const entry of inspection.filtered) {
    fail(activeCase, `${entry.element} uses a CSS filter`, {filter: entry.filter, backdropFilter: entry.backdropFilter});
  }
  const roles = new Set(inspection.surfaces.map(surface => surface.role));
  for (const requiredRole of requiredSurfaceRoles[feature]) {
    if (!roles.has(requiredRole)) fail(activeCase, `Missing [data-surface="${requiredRole}"]`);
  }
  for (const surface of inspection.surfaces) {
    const expected = expectedSurfaceColor(palette, surface.role);
    if (!expected) {
      fail(activeCase, `Unknown semantic surface ${surface.role}`);
      continue;
    }
    if (surface.style.backgroundImage !== "none") {
      fail(activeCase, `${surface.element} has background-image ${surface.style.backgroundImage}`);
    }
    if (!colorsEqual(surface.style.backgroundColor, expected)) {
      fail(activeCase, `${surface.element} is ${surface.style.backgroundColor}, expected ${expected}`);
    }
  }
  if (inspection.pageOverflow.scrollWidth > inspection.pageOverflow.clientWidth + 1) {
    fail(activeCase, `Page overflows horizontally by ${inspection.pageOverflow.scrollWidth - inspection.pageOverflow.clientWidth}px`);
  }
  if (inspection.demoOverflow) {
    if (inspection.demoOverflow.scrollWidth > inspection.demoOverflow.clientWidth + 1) {
      fail(activeCase, `Demo overflows horizontally by ${inspection.demoOverflow.scrollWidth - inspection.demoOverflow.clientWidth}px`);
    }
    if (inspection.demoOverflow.scrollHeight > inspection.demoOverflow.clientHeight + 1) {
      fail(activeCase, `Demo overflows vertically by ${inspection.demoOverflow.scrollHeight - inspection.demoOverflow.clientHeight}px`);
    }
  }
  if (inspection.frame && inspection.comparisonCard && !inside(inspection.frame, inspection.comparisonCard.rect)) {
    fail(activeCase, "Demo frame is clipped by the comparison card", {frame: inspection.frame, card: inspection.comparisonCard.rect});
  }
  if (inspection.comparisonCard && inspection.galleryFrame && !inside(inspection.comparisonCard.rect, inspection.galleryFrame)) {
    fail(activeCase, "Comparison card is clipped by the gallery frame", {card: inspection.comparisonCard.rect, gallery: inspection.galleryFrame});
  }
  if (inspection.comparisonCard && inspection.galleryFrame) {
    const bottomGap = inspection.galleryFrame.bottom - inspection.comparisonCard.rect.bottom;
    if (bottomGap < 15) fail(activeCase, `Comparison card bottom gap is ${bottomGap}px; expected at least 15px`);
  }
  const demoViewport = {bottom: inspection.viewport.height, left: 0, right: inspection.viewport.width, top: 0};
  for (const element of inspection.visibleElements) {
    if (!inside(element.rect, demoViewport)) fail(activeCase, `${element.element} is clipped`, element.rect);
  }
  const gibbous = inspection.controls.find(control => control.control === "gibbous");
  if (!gibbous) fail(activeCase, "Missing Gibbous header control");
  if (gibbous) {
    if (Math.abs(gibbous.rect.width - gibbous.rect.height) > 1) fail(activeCase, "Gibbous control is not square", gibbous.rect);
    if (gibbous.rect.width < 32 || gibbous.rect.height < 32) fail(activeCase, "Gibbous control is smaller than 32px", gibbous.rect);
    if (gibbous.pressed !== null && gibbous.pressed !== String(state === "after")) {
      fail(activeCase, `Gibbous aria-pressed is ${gibbous.pressed}, expected ${state === "after"}`);
    }
    if (gibbous.enabled !== (state === "after")) fail(activeCase, `Gibbous enabled state does not match ${state}`);
    const peer = inspection.controls.find(control => control.control === "toolbar-peer");
    if (!peer) fail(activeCase, "Missing toolbar peer for Gibbous control sizing");
    if (peer && (Math.abs(peer.rect.width - gibbous.rect.width) > 1 || Math.abs(peer.rect.height - gibbous.rect.height) > 1)) {
      fail(activeCase, "Gibbous control does not match adjacent GitHub controls", {gibbous: gibbous.rect, peer: peer.rect});
    }
  }
  for (const control of inspection.controls.filter(candidate => candidate.control === "inline-action")) {
    const borders = [
      control.style.borderTopWidth,
      control.style.borderRightWidth,
      control.style.borderBottomWidth,
      control.style.borderLeftWidth,
    ];
    if (borders.some(width => Number.parseFloat(width) !== 0)) fail(activeCase, "Inline action has a visible border", control.style);
    if (control.style.boxShadow !== "none") fail(activeCase, "Inline action has a visible box shadow", control.style.boxShadow);
  }
  if (feature === "pull-request-shortcuts" && state === "after") {
    const shortcuts = inspection.controls.filter(control => control.control === "pr-shortcut");
    if (shortcuts.length !== 2) fail(activeCase, `Found ${shortcuts.length} PR shortcuts, expected 2`);
    if (shortcuts.map(control => control.state).join(",") !== "open,closed") fail(activeCase, "PR shortcut states are wrong", shortcuts);
    if (shortcuts.some(control => !control.hasIcon || control.text)) fail(activeCase, "PR shortcuts must use Octicons, not text glyphs", shortcuts);
  }
  const filesMenu = inspection.controls.find(control => control.control === "files-menu");
  const mediumPeer = inspection.controls.find(control => control.control === "medium-peer");
  if (filesMenu && mediumPeer && Math.abs(filesMenu.rect.height - mediumPeer.rect.height) > 1) {
    fail(activeCase, "Files menu is shorter than adjacent medium controls", {filesMenu: filesMenu.rect, peer: mediumPeer.rect});
  }
};

const capture = async (protocol, path) => {
  const screenshot = await protocol.send("Page.captureScreenshot", {format: "png", fromSurface: true});
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
};

const auditHeaderPixel = async (protocol, inspection, theme, feature, state) => {
  const header = inspection.surfaces.find(surface => surface.role === "header");
  if (!header || !inspection.frame) return;
  const x = Math.floor(inspection.frame.left + header.rect.left + header.rect.width / 2);
  const y = Math.floor(inspection.frame.top + header.rect.top + 10);
  const screenshot = await protocol.send("Page.captureScreenshot", {
    clip: {height: 1, scale: 1, width: 1, x, y},
    format: "png",
    fromSurface: true,
  });
  const key = `${theme}/header`;
  const baseline = headerPixels.get(key);
  if (state === "before") {
    if (!baseline) headerPixels.set(key, screenshot.data);
    else if (baseline !== screenshot.data) fail(activeCase, `Header pixel differs from other ${theme} features`);
  } else if (feature !== "sidebar" && baseline !== screenshot.data) {
    fail(activeCase, `Header pixel changes between before and after for ${feature}`);
  }
};

const auditAssets = async () => {
  const assetsDirectory = resolve("docs/assets");
  const names = (await readdir(assetsDirectory)).filter(name => name.endsWith(".webp"));
  const actual = new Set(names);
  for (const name of expectedAssets) {
    if (!actual.has(name)) fail("assets", `Missing ${name}`);
  }
  for (const name of actual) {
    if (!expectedAssets.has(name)) fail("assets", `Unexpected WebP ${name}`);
    const details = await stat(join(assetsDirectory, name));
    if (details.size >= 100 * 1024) fail("assets", `${name} is ${details.size} bytes; expected less than 100 KiB`);
  }
};

const assertSiteAvailable = async () => {
  const response = await fetch(siteUrl);
  if (!response.ok) throw new Error(`${siteUrl} returned HTTP ${response.status}`);
};

const writeContactSheet = async () => {
  const cards = [];
  for (const theme of themes) {
    for (const feature of features) {
      for (const state of states) {
        const name = `${theme}-${feature}-${state}.png`;
        cards.push(`<figure><img src="${name}" loading="lazy"><figcaption>${theme} · ${feature} · ${state}</figcaption></figure>`);
      }
    }
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Gibbous visual audit</title><style>body{background:#010409;color:#fff;font:14px system-ui;margin:16px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0}img{border:1px solid #b7bdc8;display:block;width:100%}figcaption{padding-block:6px}</style><main>${cards.join("")}</main>`;
  await writeFile(join(outputDirectory, "index.html"), html);
};

await mkdir(outputDirectory, {recursive: true});
await auditAssets();
await assertSiteAvailable();

const browser = await connectToBrowser();
const protocol = await openProtocol(browser.target);

try {
  await protocol.send("Page.enable");
  await protocol.send("Runtime.enable");
  await protocol.send("Log.enable");
  await protocol.send("Network.enable");
  await protocol.send("Network.setCacheDisabled", {cacheDisabled: true});
  await protocol.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: viewport.height,
    mobile: false,
    width: viewport.width,
  });
  await protocol.send("Emulation.setEmulatedMedia", {
    features: [{name: "prefers-reduced-motion", value: "reduce"}],
  });

  for (const theme of themes) {
    for (const feature of features) {
      activeCase = `${theme}/${feature}/navigation`;
      const url = new URL(siteUrl);
      url.searchParams.set("audit", `${theme}-${feature}-${Date.now()}`);
      url.hash = feature;
      await protocol.send("Page.navigate", {url: url.href});
      await waitForDocument(protocol);
      await settle(protocol);
      for (const state of states) {
        activeCase = `${theme}/${feature}/${state}`;
        try {
          await prepareCase(protocol, theme, feature, state);
          await settle(protocol);
          const inspection = await inspectCase(protocol, feature);
          auditInspection(inspection, theme, feature, state);
          await auditHeaderPixel(protocol, inspection, theme, feature, state);
          await capture(protocol, join(outputDirectory, `${theme}-${feature}-${state}.png`));
        } catch (error) {
          fail(activeCase, error.message);
        }
      }
    }
  }
} finally {
  protocol.socket.close();
  browser.process?.kill("SIGTERM");
}

for (const error of browserErrors) fail(error.case, `${error.type}: ${error.value}`);
await writeContactSheet();
const report = {
  failures,
  outputDirectory,
  renders: themes.length * features.length * states.length,
  siteUrl,
};
await writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`Visual audit failed: ${failures.length} failures across ${report.renders} renders`);
  for (const failure of failures) console.error(`${failure.case}: ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`Visual audit passed: ${report.renders} renders`);
}
console.log(`Artifacts: ${outputDirectory}`);
