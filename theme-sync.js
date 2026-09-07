(() => {
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
  const root = document.documentElement;
  const normalize = theme => theme?.replaceAll("_", "-");

  const exposeStoredTheme = async () => {
    const {githubTheme} = await chrome.storage.local.get("githubTheme");
    if (themes.has(githubTheme)) root.dataset.githubTheme = githubTheme;
    chrome.storage.onChanged.addListener((changes, area) => {
      const theme = changes.githubTheme?.newValue;
      if (area === "local" && themes.has(theme)) root.dataset.githubTheme = theme;
    });
  };

  const activeGitHubTheme = () => {
    const colorMode = root.dataset.colorMode;
    const mode = colorMode === "auto"
      ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : colorMode;
    return normalize(root.dataset[`${mode}Theme`]);
  };

  const storeGitHubTheme = async () => {
    const theme = activeGitHubTheme();
    if (themes.has(theme)) await chrome.storage.local.set({githubTheme: theme});
  };

  const main = async () => {
    if (location.hostname !== "github.com") {
      await exposeStoredTheme();
      return;
    }
    new MutationObserver(() => void storeGitHubTheme()).observe(root, {
      attributes: true,
      attributeFilter: ["data-color-mode", "data-light-theme", "data-dark-theme"],
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => void storeGitHubTheme());
    await storeGitHubTheme();
  };

  void main().catch(error => console.error("Gibbous could not synchronize the GitHub theme.", error));
})();
