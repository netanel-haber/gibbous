const {button} = van.tags;
const enabled = van.state(true);

const setEnabled = value => {
  enabled.val = value;
  document.documentElement.toggleAttribute("data-gibbous-disabled", !value);
};

chrome.storage.local.get({enabled: true}, ({enabled: storedEnabled}) => {
  setEnabled(storedEnabled);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    setEnabled(changes.enabled.newValue ?? true);
  }
});

const toggle = button(
  {
    class: "gibbous-toggle",
    type: "button",
    "aria-label": () => enabled.val ? "Disable Gibbous" : "Enable Gibbous",
    "aria-pressed": () => String(enabled.val),
    title: () => enabled.val ? "Disable Gibbous" : "Enable Gibbous",
    onclick: () => {
      setEnabled(!enabled.val);
      chrome.storage.local.set({enabled: enabled.val});
    },
  },
  () => enabled.val ? "🌔" : "🌘",
);

const mountToggle = () => {
  if (toggle.isConnected) {
    return;
  }

  document
    .querySelector('[class*="GlobalNavUserMenu-module__container"]')
    ?.before(toggle);
};

new MutationObserver(mountToggle).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

mountToggle();
