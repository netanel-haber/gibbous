#!/usr/bin/env python3

from __future__ import annotations

import argparse
import html
import shutil
import subprocess
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "docs"
REPOSITORY_URL = "https://github.com/netanel-haber/gibbous"
ARCHIVE_URL = f"{REPOSITORY_URL}/archive/refs/heads/main.zip"
PAGES_URL = "https://netanel-haber.github.io/gibbous/"
TAILWIND_VERSION = "3.4.17"
SCREENSHOT_SIZE = (1440, 900)
SCREENSHOT_SCALE = 2
Variant = Literal["before", "after"]


@dataclass(frozen=True, slots=True)
class Feature:
    slug: str
    title: str
    description: str
    address: str
    render_scene: Callable[[bool], str]


def repository_header(*, title: str = "lunar-labs / orbit", enabled: bool = False) -> str:
    moon_state = "enabled" if enabled else "disabled"
    moon = f'<button class="moon-button {moon_state}" type="button" disabled aria-label="Gibbous {moon_state}">{"🌔" if enabled else "🌘"}</button>'
    return f"""
      <header class="github-header">
        <div class="github-brand">
          <span class="menu-button">☰</span>
          <span class="github-mark">◒</span>
          <strong>{html.escape(title)}</strong>
        </div>
        <div class="github-actions">
          <div class="search">⌕&nbsp;&nbsp; Type <kbd>/</kbd> to search</div>
          <span class="header-icon">＋</span>
          <span class="header-icon">◉</span>
          <span class="header-icon">⑂</span>
          <span class="header-icon">▣</span>
          <span class="header-icon">▰</span>
          {moon}
          <span class="avatar">N</span>
        </div>
      </header>
    """


def pull_request_card(title: str, repository: str, comments: int) -> str:
    return f"""
      <div class="list-row">
        <span class="status pull">⑂</span>
        <div class="row-copy">
          <strong>{html.escape(title)}</strong>
          <span>{html.escape(repository)} · Updated this week</span>
        </div>
        <span class="comments">▢ {comments}</span>
      </div>
    """


def dashboard_scene(after: bool) -> str:
    assistant = "" if after else """
      <section class="assistant-card">
        <div class="assistant-title">◉ <strong>Good morning, netanel-haber!</strong></div>
        <div class="prompt">Ask anything or type @ to add context</div>
        <div class="assistant-actions">
          <span>▱ Ask⌄</span><span>▣ All repositories⌄</span><span>＋</span>
          <span class="assistant-spacer"></span><span>◉ Auto⌄</span><span>➤</span>
        </div>
        <div class="quick-actions"><span>Agent</span><span>Create issue</span><span>Write code</span><span>Git</span><span>Pull requests</span></div>
      </section>
    """
    changelog = "" if after else """
      <aside class="changelog">
        <h3>Latest from our changelog</h3>
        <div><time>Yesterday</time><strong>Repository rules are easier to manage</strong></div>
        <div><time>Yesterday</time><strong>New model policies in public preview</strong></div>
        <div><time>2 days ago</time><strong>GitHub Models updates</strong></div>
        <a>View changelog →</a>
      </aside>
    """
    sidebar_navigation = "" if after else """
      <nav class="side-navigation">
        <span class="selected">⌂ Home</span>
        <span>◎ Feed</span>
      </nav>
    """
    return f"""
      {repository_header(title="Dashboard", enabled=after)}
      <div class="dashboard-layout {'clean' if after else ''}">
        <aside class="dashboard-sidebar">
          <div class="account"><span class="avatar">N</span><div><strong>netanel-haber</strong><span>Your personal account</span></div></div>
          {sidebar_navigation}
          <div class="top-repositories">
            <strong>Top repositories</strong>
            <span>◉ netanel-haber/snakepath</span>
            <span>◉ netanel-haber/gibbous</span>
            <span>◉ lunar-labs/orbit</span>
            <span>◉ lightseeker/tokenspeed</span>
            <span>◉ netanel-haber/profile</span>
          </div>
        </aside>
        <main class="dashboard-main">
          {assistant}
          <section class="dashboard-section">
            <div class="section-heading"><h2>Pull requests</h2><span>View all&nbsp;&nbsp;☷</span></div>
            <div class="list-card">
              {pull_request_card("Improve scheduler wide-N alignment", "lunar-labs/orbit#49099", 1)}
              {pull_request_card("Add SSD prefill backend", "lunar-labs/orbit#49425", 1)}
              {pull_request_card("Reduce warm startup below one second", "lunar-labs/orbit#41518", 22)}
            </div>
          </section>
          <section class="dashboard-section">
            <div class="section-heading"><h2>Issues</h2><span>View all&nbsp;&nbsp;☷</span></div>
            <div class="list-card">
              {pull_request_card("Raise when sampling parameters mismatch", "flashinfer-ai/flashinfer#1634", 3)}
            </div>
          </section>
        </main>
        {changelog}
      </div>
    """


def repository_tabs(
    *,
    show_unused: bool,
    show_shortcuts: bool,
    selected: Literal["code", "pulls"] = "code",
) -> str:
    extra = """
      <span>☁ Agents</span><span>▱ Discussions</span><span>▦ Projects</span>
      <span>◈ Security and quality</span><span>⌁ Insights</span>
    """ if show_unused else ""
    books = '<span class="book-link active">📖︎</span><span class="book-link">📕︎</span>' if show_shortcuts else ""
    return f"""
      <nav class="repository-tabs">
        <span class="{'selected' if selected == 'code' else ''}">‹› Code</span>
        <span>◉ Issues <b>2.1k</b></span>
        <span class="{'selected' if selected == 'pulls' else ''}">⑂ Pull requests <b>4.3k</b></span>
        {books}
        <span>▷ Actions</span>
        {extra}
      </nav>
    """


def repository_scene(after: bool) -> str:
    fork = '<div class="forked">forked in <span>netanel-haber/orbit</span></div>' if after else ""
    tabs = repository_tabs(show_unused=not after, show_shortcuts=False)
    return f"""
      {repository_header(enabled=after)}
      {tabs}
      <main class="repository-page">
        <section class="repository-title">
          <div><span class="repo-logo">V</span><div><h1>orbit <small>Public</small></h1>{fork}</div></div>
          <div class="repo-actions"><span>♡ Sponsor</span><span>◉ Watch 585</span><span>⑂ Fork 20.1k</span><span>★ Starred 87.9k</span></div>
        </section>
        <section class="repository-toolbar">
          <span class="branch">⑂ main⌄</span><span>⑂ 376 Branches</span><span>◇ 175 Tags</span>
          <span class="toolbar-spacer"></span><span class="go-file">⌕ Go to file</span><span>Add file⌄</span><span class="code-button">‹› Code⌄</span>
        </section>
        <div class="repository-columns">
          <div class="file-list compact">
            <div class="commit-row"><span class="avatar coral">H</span><strong>hmellor</strong><span>[1/N] Harden scheduler startup</span><span class="toolbar-spacer"></span><span>19,437 Commits</span></div>
            <div><span class="folder">■</span><strong>scripts</strong><span>Improve benchmark launcher</span><time>yesterday</time></div>
            <div><span class="folder">■</span><strong>tests</strong><span>Extend scheduler coverage</span><time>5 hours ago</time></div>
            <div><span class="folder">■</span><strong>orbit</strong><span>Clean up worker lifecycle</span><time>5 hours ago</time></div>
          </div>
          <aside class="about"><h2>About</h2><p>A fast, memory-efficient inference and serving engine for language models.</p><span>🔗 orbit.dev</span><div class="topics"><b>cuda</b><b>inference</b><b>pytorch</b><b>transformers</b></div></aside>
        </div>
      </main>
    """


def pull_request_shortcuts_scene(after: bool) -> str:
    return f"""
      {repository_header(enabled=after)}
      {repository_tabs(show_unused=False, show_shortcuts=after, selected="pulls")}
      <main class="repository-page">
        <section class="dashboard-section">
          <div class="section-heading"><h1>Pull requests</h1><span>Labels&nbsp;&nbsp; Milestones</span></div>
          <div class="list-card">
            {pull_request_card("Improve scheduler wide-N alignment", "lunar-labs/orbit#49099", 1)}
            {pull_request_card("Add SSD prefill backend", "lunar-labs/orbit#49425", 1)}
            {pull_request_card("Reduce warm startup below one second", "lunar-labs/orbit#41518", 22)}
          </div>
        </section>
      </main>
    """


def file_row(name: str, message: str, *, hover: bool = False) -> str:
    hide = '<button class="hide-control">Hide</button>' if hover else ""
    return f"""
      <div class="file-row {'hover' if hover else ''}">
        <span class="folder">■</span><span class="file-name"><strong>{html.escape(name)}</strong>{hide}</span>
        <span>{html.escape(message)}</span><time>this week</time>
      </div>
    """


def files_scene(after: bool) -> str:
    rows = [
        (".github", "Refresh issue templates"),
        ("benchmarks", "Update latency harness"),
        ("docs", "Clarify deployment guide"),
        ("scripts", "Improve benchmark launcher"),
        ("tests", "Extend scheduler coverage"),
        ("orbit", "Clean up worker lifecycle"),
    ]
    if after:
        rows = rows[3:]
    rendered_rows = "".join(
        file_row(name, message, hover=after and name == "tests") for name, message in rows
    )
    hidden_control = "" if not after else """
      <div class="eyes-wrap">
        <span class="eyes-control">👀</span>
        <div class="hidden-menu">
          <strong>Hidden files</strong><code>lunar-labs/orbit</code>
          <div><code>.github</code><button>Show</button></div>
          <div><code>benchmarks</code><button>Show</button></div>
          <div><code>docs</code><button>Show</button></div>
        </div>
      </div>
    """
    return f"""
      {repository_header(enabled=after)}
      {repository_tabs(show_unused=not after, show_shortcuts=after)}
      <main class="repository-page files-page">
        <section class="repository-toolbar">
          <span class="branch">⑂ main⌄</span><span>⑂ 376 Branches</span><span>◇ 175 Tags</span>
          <span class="toolbar-spacer"></span><span class="go-file">⌕ Go to file</span><span>Add file⌄</span>{hidden_control}<span class="code-button">‹› Code⌄</span>
        </section>
        <div class="file-list">
          <div class="commit-row"><span class="avatar coral">H</span><strong>hmellor</strong><span>[1/N] Harden scheduler startup</span><span class="toolbar-spacer"></span><span>19,437 Commits</span></div>
          {rendered_rows}
          <div class="file-row"><span class="document">▤</span><strong>README.md</strong><span>Document local development</span><time>last month</time></div>
        </div>
        <section class="readme-card"><h2>README</h2><div class="readme-lines"><span></span><span></span><span></span><span></span></div></section>
      </main>
    """


FEATURES: tuple[Feature, ...] = (
    Feature(
        slug="dashboard",
        title="Dashboard",
        description="Removes the Copilot prompt, changelog, and Home / Feed navigation.",
        address="github.com",
        render_scene=dashboard_scene,
    ),
    Feature(
        slug="repository-navigation",
        title="Repository navigation",
        description="Hides unused tabs and links upstream repositories to your fork.",
        address="github.com/lunar-labs/orbit",
        render_scene=repository_scene,
    ),
    Feature(
        slug="pull-request-shortcuts",
        title="Pull request shortcuts",
        description="Adds direct links to your open and closed pull requests beside the repository tab.",
        address="github.com/lunar-labs/orbit/pulls",
        render_scene=pull_request_shortcuts_scene,
    ),
    Feature(
        slug="hidden-files",
        title="Files and folders",
        description="Hides top-level entries on hover. Restore them from the eyes menu. The list persists per fork network.",
        address="github.com/lunar-labs/orbit",
        render_scene=files_scene,
    ),
)


FIXTURE_CSS = r"""
:root {
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --canvas: #010409;
  --subtle: #0d1117;
  --raised: #161b22;
  --border: #3d444d;
  --muted: #9198a1;
  --text: #f0f6fc;
  --blue: #58a6ff;
  --accent: #f0a28e;
  --green: #238636;
  --moon: rgb(246 214 112 / 38%);
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; overflow: hidden; }
body { background: #24292f; color: var(--text); font-size: 16px; }
.browser { background: var(--canvas); height: 900px; width: 1440px; }
.browser-bar { align-items: center; background: #2b2d30; display: flex; gap: 18px; height: 64px; padding: 0 24px; }
.traffic { display: flex; gap: 8px; }
.traffic i { background: #7d8590; border-radius: 50%; display: block; height: 11px; opacity: .6; width: 11px; }
.browser-nav { color: #c7cbd1; font-size: 25px; }
.address { align-items: center; background: #202124; border-radius: 24px; color: #e8eaed; display: flex; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 18px; height: 42px; padding: 0 20px; width: 760px; }
.browser-spacer, .toolbar-spacer, .assistant-spacer { flex: 1; }
.github-header { align-items: center; border-bottom: 1px solid var(--border); display: flex; height: 72px; justify-content: space-between; padding: 0 24px; }
.github-brand, .github-actions { align-items: center; display: flex; gap: 12px; }
.github-brand { font-size: 18px; }
.menu-button, .header-icon, .moon-button { align-items: center; border: 1px solid var(--border); border-radius: 7px; display: inline-flex; height: 34px; justify-content: center; width: 34px; }
.moon-button { background: transparent; color: inherit; font: inherit; opacity: 1; padding: 0; box-shadow: inset 0 0 0 1px var(--moon); }
.github-mark { align-items: center; background: var(--text); border-radius: 50%; color: var(--canvas); display: inline-flex; font-size: 24px; font-weight: 800; height: 34px; justify-content: center; width: 34px; }
.github-actions { color: #c9d1d9; }
.search { border: 1px solid var(--border); border-radius: 7px; color: var(--muted); padding: 8px 18px; width: 270px; }
kbd { border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.avatar { align-items: center; background: linear-gradient(135deg, #e8c59b, #825d45); border: 1px solid #8c959f; border-radius: 50%; display: inline-flex; font-size: 12px; height: 32px; justify-content: center; width: 32px; }
.moon-button.enabled, .book-link.active, .eyes-control, .hide-control { background: radial-gradient(circle at 28% 32%, rgb(96 78 50 / 30%) 0 1px, transparent 2px), radial-gradient(circle at 66% 66%, rgb(96 78 50 / 24%) 0 2px, transparent 3px), radial-gradient(circle at 35% 35%, rgb(246 214 112 / 65%), rgb(225 180 72 / 45%) 65%, rgb(174 159 102 / 24%)); box-shadow: inset 0 0 0 1px var(--moon); }
.dashboard-layout { display: grid; grid-template-columns: 285px 1fr 310px; height: 764px; }
.dashboard-layout.clean { grid-template-columns: 285px 1fr; }
.dashboard-sidebar { border-right: 1px solid var(--border); padding: 28px 22px; }
.account { align-items: center; display: flex; gap: 12px; padding-bottom: 24px; }
.account div { display: grid; gap: 4px; }
.account span { color: var(--muted); font-size: 13px; }
.side-navigation { border-bottom: 1px solid var(--border); display: grid; gap: 4px; padding-bottom: 22px; }
.side-navigation span { border-radius: 7px; padding: 9px 12px; }
.side-navigation .selected { background: #262c36; border-left: 3px solid #4493f8; }
.top-repositories { border-top: 1px solid var(--border); display: grid; gap: 15px; margin-top: 22px; padding-top: 22px; }
.top-repositories strong { color: var(--muted); font-size: 13px; margin-bottom: 3px; }
.top-repositories span { font-size: 14px; }
.dashboard-main { min-width: 0; padding: 32px 38px; }
.assistant-card { margin-bottom: 30px; }
.assistant-title { align-items: center; display: flex; font-size: 26px; gap: 10px; margin-bottom: 18px; }
.prompt { border: 1px solid var(--border); border-bottom: 0; border-radius: 12px 12px 0 0; color: var(--muted); font-size: 18px; height: 84px; padding: 20px; }
.assistant-actions { align-items: center; border: 1px solid var(--border); border-radius: 0 0 12px 12px; display: flex; gap: 8px; padding: 10px; }
.assistant-actions span:not(.assistant-spacer), .quick-actions span { border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; }
.quick-actions { display: flex; gap: 10px; justify-content: center; margin-top: 12px; }
.dashboard-section { margin-bottom: 28px; }
.section-heading { align-items: center; display: flex; justify-content: space-between; margin-bottom: 12px; }
.section-heading h2 { color: #b7bec7; font-size: 16px; margin: 0; }
.section-heading span { color: var(--blue); font-size: 14px; }
.list-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.list-row { align-items: center; display: flex; gap: 14px; min-height: 76px; padding: 12px 18px; }
.list-row + .list-row { border-top: 1px solid var(--border); }
.row-copy { display: grid; flex: 1; gap: 6px; }
.row-copy span { color: var(--muted); font-size: 13px; }
.status.pull { color: #3fb950; font-size: 20px; }
.comments { color: var(--muted); }
.changelog { border: 1px solid var(--border); border-radius: 12px; height: max-content; margin: 34px 28px 0 0; padding: 22px; }
.changelog h3 { font-size: 17px; margin: 0 0 20px; }
.changelog div { border-left: 1px solid var(--border); display: grid; gap: 5px; padding: 0 0 20px 20px; position: relative; }
.changelog div::before { background: #b7bec7; border-radius: 50%; content: ""; height: 9px; left: -5px; position: absolute; top: 6px; width: 9px; }
.changelog time { color: #8eb7e8; font-size: 13px; }
.changelog a { color: var(--blue); }
.repository-tabs { align-items: center; border-bottom: 1px solid var(--border); display: flex; gap: 26px; height: 58px; overflow: hidden; padding: 0 28px; white-space: nowrap; }
.repository-tabs > span { align-items: center; display: inline-flex; gap: 7px; height: 100%; }
.repository-tabs > span.selected { border-bottom: 2px solid var(--accent); font-weight: 600; }
.repository-tabs b { border: 1px solid var(--border); border-radius: 16px; font-size: 12px; padding: 2px 7px; }
.book-link { border-radius: 6px; height: 26px !important; justify-content: center; margin-left: -18px; width: 26px; }
.repository-page { margin: 0 auto; max-width: 1160px; padding: 26px 0; }
.repository-title { align-items: flex-start; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; padding-bottom: 24px; }
.repository-title > div { align-items: flex-start; display: flex; gap: 10px; }
.repo-logo { align-items: center; background: white; border-radius: 7px; color: #6e94e7; display: inline-flex; font-size: 24px; font-weight: 800; height: 38px; justify-content: center; width: 38px; }
.repository-title h1 { font-size: 24px; margin: 0; }
.repository-title small { border: 1px solid var(--border); border-radius: 16px; color: #c9d1d9; font-size: 12px; font-weight: 400; padding: 3px 8px; }
.forked { font-size: 14px; margin-top: 7px; }
.forked span { border-radius: 3px; box-shadow: inset 0 0 0 1px var(--moon); color: var(--blue); padding: 1px 4px; text-decoration: underline; }
.repo-actions { gap: 8px !important; }
.repo-actions span, .repository-toolbar > span { border: 1px solid var(--border); border-radius: 7px; padding: 7px 12px; }
.repository-toolbar { align-items: center; display: flex; gap: 10px; min-height: 76px; }
.repository-toolbar > span:not(.branch, .go-file, .code-button) { border-color: transparent; }
.repository-toolbar .branch { background: #252c35; padding: 10px 18px; }
.repository-toolbar .go-file { color: var(--muted); width: 240px; }
.repository-toolbar .code-button { background: var(--green); border-color: #2ea043; }
.repository-columns { display: grid; gap: 36px; grid-template-columns: 1fr 300px; }
.file-list { border: 1px solid var(--border); border-radius: 10px; overflow: visible; position: relative; }
.file-list > div { align-items: center; display: grid; gap: 12px; grid-template-columns: 22px 210px 1fr 120px; min-height: 58px; padding: 0 18px; }
.file-list > div + div { border-top: 1px solid var(--border); }
.file-list.compact > div { grid-template-columns: 22px 170px 1fr 120px; }
.file-list .commit-row { background: var(--raised); display: flex; }
.coral { background: linear-gradient(135deg, #ff8c7a, #7d2720); }
.folder { color: #b7bec7; }
.document { color: #8c959f; }
.file-list time { color: var(--muted); text-align: right; }
.file-row.hover { background: var(--raised); }
.file-name { align-items: center; display: flex; gap: 8px; }
.hide-control { border: 0; border-radius: 6px; color: #cdd9e5; font: inherit; font-size: 12px; margin-left: 8px; padding: 4px 8px; }
.about h2 { font-size: 16px; margin-top: 0; }
.about p { color: #c9d1d9; line-height: 1.55; }
.about > span { color: var(--blue); }
.topics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
.topics b { border: 1px solid #316dca; border-radius: 14px; color: #79c0ff; font-size: 12px; padding: 4px 10px; }
.files-page { max-width: 1080px; }
.eyes-wrap { display: inline-flex; position: relative; }
.eyes-control { align-items: center; border-radius: 7px; display: inline-flex; height: 34px; justify-content: center; width: 34px; }
.hidden-menu { background: var(--raised); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 32px rgb(0 0 0 / 50%); display: grid; gap: 8px; padding: 14px; position: absolute; right: 0; top: 43px; width: 245px; z-index: 2; }
.hidden-menu > code { color: var(--muted); font-size: 12px; }
.hidden-menu > div { align-items: center; display: flex; justify-content: space-between; }
.hidden-menu button { background: #21262d; border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 4px 9px; }
.readme-card { border: 1px solid var(--border); border-radius: 10px; margin-top: 26px; padding: 24px; }
.readme-card h2 { font-size: 16px; margin: 0 0 20px; }
.readme-lines { display: grid; gap: 12px; }
.readme-lines span { background: #30363d; border-radius: 4px; height: 8px; width: 90%; }
.readme-lines span:nth-child(2) { width: 72%; }
.readme-lines span:nth-child(3) { width: 84%; }
.readme-lines span:nth-child(4) { width: 55%; }
"""


SITE_CSS = r"""
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: dark;
    --site-header-height: 6.75rem;
    --gibbous-moon-border: rgb(246 214 112 / 38%);
    --gibbous-moon-background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.18' numOctaves='2' seed='7'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E"),
      radial-gradient(circle at 28% 32%, rgb(96 78 50 / 25%) 0 1px, transparent 1.5px),
      radial-gradient(circle at 68% 43%, rgb(96 78 50 / 20%) 0 1.5px, transparent 2px),
      radial-gradient(circle at 44% 76%, rgb(96 78 50 / 22%) 0 .75px, transparent 1.25px),
      radial-gradient(circle at 35% 35%, rgb(246 214 112 / 62%), rgb(225 180 72 / 45%) 65%, rgb(174 159 102 / 24%));
    --gibbous-moon-background-blend: soft-light, normal, normal, normal, normal;
  }
  html { @apply bg-[#101722]; }
  body { @apply min-h-screen overflow-x-clip bg-[#101722] font-mono text-[#e6edf3] antialiased; }
  ::selection { @apply bg-[#f6d670]/30 text-white; }
  a { @apply text-[#79c0ff] underline decoration-[#79c0ff]/50 underline-offset-4; }
  :focus-visible { @apply outline outline-2 outline-offset-2 outline-[#e6c96f]; }
}

@layer components {
  .site-shell {
    @apply w-full px-4;
    padding-top: var(--site-header-height);
  }
  .gallery-navigation { @apply hidden; }
  .gallery-navigation:disabled { @apply cursor-default opacity-20; }
  .feature-panel { @apply py-10; }
  .comparison-card { @apply overflow-hidden rounded border border-[#30363d] bg-[#0d1117]; }
  .comparison-link { @apply block no-underline; }
  .comparison-switch { @apply hidden; }
  .gibbous-comparisons .comparison-switch { @apply inline-flex items-center; }
  .comparison-state {
    @apply absolute top-1/2 z-20 -translate-y-1/2 text-base font-semibold text-[#8b949e];
    transition: color 160ms ease;
  }
  .comparison-state-off { @apply left-3; }
  .comparison-state-on { @apply right-3; }
  .comparison-state-active { @apply text-[#e6c96f]; }
  .comparison-toggle {
    @apply relative h-10 w-44 cursor-pointer border-0 bg-transparent p-0;
  }
  .comparison-toggle::before {
    @apply absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full border border-[#6f633d];
    content: "";
    background: rgb(246 214 112 / 22%);
    transition: background-color 160ms ease, border-color 160ms ease;
  }
  .comparison-toggle:is(:hover, :focus-visible)::before { background: rgb(246 214 112 / 28%); }
  .comparison-moon {
    @apply absolute left-12 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-[2.5rem] leading-none;
    filter: drop-shadow(0 3px 4px rgb(0 0 0 / 28%));
    will-change: left, transform;
  }
  .comparison-toggle[aria-checked="true"] .comparison-moon {
    left: calc(100% - 5.5rem);
  }
  .gallery-image { @apply block h-auto w-full bg-[#010409]; }
}

@keyframes moon-orbit-on {
  0% { left: 3rem; transform: translateY(-50%); }
  12.5% { left: 3.095rem; transform: translateY(calc(-50% - .478rem)); }
  25% { left: 3.366rem; transform: translateY(calc(-50% - .884rem)); }
  37.5% { left: 3.772rem; transform: translateY(calc(-50% - 1.155rem)); }
  50% { left: 4.25rem; transform: translateY(calc(-50% - 1.25rem)); }
  62.5% { left: 4.728rem; transform: translateY(calc(-50% - 1.155rem)); }
  75% { left: 5.134rem; transform: translateY(calc(-50% - .884rem)); }
  87.5% { left: 5.405rem; transform: translateY(calc(-50% - .478rem)); }
  100% { left: calc(100% - 5.5rem); transform: translateY(-50%); }
}

@keyframes moon-orbit-off {
  0% { left: calc(100% - 5.5rem); transform: translateY(-50%); }
  12.5% { left: 5.405rem; transform: translateY(calc(-50% + .478rem)); }
  25% { left: 5.134rem; transform: translateY(calc(-50% + .884rem)); }
  37.5% { left: 4.728rem; transform: translateY(calc(-50% + 1.155rem)); }
  50% { left: 4.25rem; transform: translateY(calc(-50% + 1.25rem)); }
  62.5% { left: 3.772rem; transform: translateY(calc(-50% + 1.155rem)); }
  75% { left: 3.366rem; transform: translateY(calc(-50% + .884rem)); }
  87.5% { left: 3.095rem; transform: translateY(calc(-50% + .478rem)); }
  100% { left: 3rem; transform: translateY(-50%); }
}

@keyframes case-arrive-next {
  from { transform: translateX(2rem); }
}

@keyframes case-arrive-previous {
  from { transform: translateX(-2rem); }
}

@media (prefers-reduced-motion: no-preference) {
  .comparison-toggle[data-orbit="on"] .comparison-moon {
    animation: moon-orbit-on 360ms linear;
  }
  .comparison-toggle[data-orbit="off"] .comparison-moon {
    animation: moon-orbit-off 360ms linear;
  }
}

@media (min-width: 1024px) and (prefers-reduced-motion: no-preference) {
  .horizontal-gallery .gallery-scroll { height: var(--gallery-height); }
  .horizontal-gallery .gallery-sticky {
    @apply sticky grid overflow-hidden;
    top: var(--site-header-height);
    height: calc(100vh - var(--site-header-height));
    grid-template-columns: 3.5rem minmax(0, 1fr) 3.5rem;
  }
  .horizontal-gallery .gallery-frame { @apply overflow-hidden; }
  .horizontal-gallery .gallery-navigation {
    @apply my-auto flex h-12 w-12 items-center justify-center rounded border border-[#455160] bg-[#161e2a] text-2xl text-[#e6c96f];
  }
  .horizontal-gallery .gallery-track { @apply relative h-full; }
  .horizontal-gallery .feature-panel { @apply invisible absolute inset-0 flex w-full flex-col justify-start pb-0 pt-6; }
  .horizontal-gallery .feature-panel[data-active] { @apply visible; }
  .horizontal-gallery .gallery-track[data-direction="next"] .feature-panel[data-active] .comparison-card {
    animation: case-arrive-next 100ms cubic-bezier(.2, .9, .35, 1);
  }
  .horizontal-gallery .gallery-track[data-direction="previous"] .feature-panel[data-active] .comparison-card {
    animation: case-arrive-previous 100ms cubic-bezier(.2, .9, .35, 1);
  }
  .horizontal-gallery .comparison-content {
    margin-inline: auto;
    width: min(100%, calc((100vh - var(--site-header-height) - 7rem) * 1.6));
  }
}
"""


def render_fixture(feature: Feature, variant: Variant) -> str:
    after = variant == "after"
    scene = feature.render_scene(after)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(feature.title)} — {variant.title()}</title>
  <style>{FIXTURE_CSS}</style>
</head>
<body>
  {scene}
</body>
</html>
"""


def render_gallery_item(feature: Feature, index: int) -> str:
    before = f"assets/{feature.slug}-before.png"
    after = f"assets/{feature.slug}-after.png"
    image_loading = (
        'loading="eager" fetchpriority="high"'
        if index == 1
        else 'loading="lazy" fetchpriority="low"'
    )
    return f"""
      <section class="feature-panel border-t border-[#30363d]" id="example-{feature.slug}" aria-labelledby="example-{feature.slug}-title">
        <div class="comparison-content" data-comparison>
          <div class="mb-5 flex items-start gap-4">
            <span class="mt-3 text-sm text-[#e6c96f]" aria-hidden="true">{index}.</span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center justify-between gap-4">
                <h2 class="text-2xl font-semibold text-white" id="example-{feature.slug}-title">{html.escape(feature.title)}</h2>
                <span class="comparison-switch" data-comparison-switch>
                  <button class="comparison-toggle" type="button" role="switch" data-comparison-toggle aria-label="Enable Gibbous for {html.escape(feature.title)}" aria-checked="false" title="Enable Gibbous">
                    <span class="comparison-state comparison-state-off comparison-state-active" data-comparison-off aria-hidden="true">OFF</span>
                    <span class="comparison-moon" data-comparison-moon aria-hidden="true">🌘</span>
                    <span class="comparison-state comparison-state-on" data-comparison-on aria-hidden="true">ON</span>
                  </button>
                </span>
              </div>
              <p class="mt-1 text-base leading-7 text-[#9da7b3] lg:whitespace-nowrap">{html.escape(feature.description)}</p>
            </div>
          </div>
          <div class="comparison-card">
            <a class="comparison-link" data-comparison-link href="{before}">
              <img class="gallery-image" data-comparison-image data-before="{before}" data-after="{after}" src="{before}" width="{SCREENSHOT_SIZE[0] * SCREENSHOT_SCALE}" height="{SCREENSHOT_SIZE[1] * SCREENSHOT_SCALE}" {image_loading} alt="GitHub before Gibbous: {html.escape(feature.title)}">
            </a>
          </div>
        </div>
      </section>
    """


def render_index(stylesheet: str = "") -> str:
    gallery = "".join(
        render_gallery_item(feature, index)
        for index, feature in enumerate(FEATURES, start=1)
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Gibbous is a lean Chrome extension that removes GitHub clutter and adds focused repository controls.">
  <meta property="og:title" content="Gibbous — GitHub, minus the clutter">
  <meta property="og:description" content="A before-and-after gallery of a leaner GitHub.">
  <meta property="og:image" content="{PAGES_URL}assets/dashboard-after.png">
  <meta property="og:url" content="{PAGES_URL}">
  <meta property="og:type" content="website">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='50' font-size='82' text-anchor='middle' dominant-baseline='central'%3E🌔%3C/text%3E%3C/svg%3E">
  <link rel="canonical" href="{PAGES_URL}">
  <style>{stylesheet}</style>
  <title>Gibbous — GitHub, minus the clutter</title>
</head>
<body>
  <main class="site-shell">
    <header class="site-header fixed inset-x-0 top-0 z-50 flex flex-col gap-4 border-b border-[#30363d] bg-[#101722] px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8" data-site-header>
      <div>
        <h1 class="text-3xl font-semibold text-white">gibbous 🌔</h1>
        <p class="mt-2 text-base text-[#9da7b3]">A Chrome extension for hiding the useless parts of GitHub UI.</p>
      </div>
      <nav class="flex items-center gap-5 text-base" aria-label="Project links">
        <a class="rounded border border-[#455160] px-3 py-1 no-underline" href="{ARCHIVE_URL}">download .zip</a>
        <a class="flex items-center gap-2 rounded border border-[#455160] px-3 py-1 text-white no-underline" href="{REPOSITORY_URL}">
          <span>source</span>
          <svg class="h-5 w-5 text-[#8b949e]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.91c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
        </a>
      </nav>
    </header>
    <section class="gallery-scroll" data-gallery style="--gallery-height: {len(FEATURES) + 1}00vh" aria-label="Before and after examples">
      <div class="gallery-sticky">
        <button class="gallery-navigation" type="button" data-gallery-previous aria-label="Previous example" aria-controls="gibbous-examples"><span aria-hidden="true">⇐</span></button>
        <div class="gallery-frame" data-gallery-frame id="gibbous-examples">
          <div class="gallery-track" data-gallery-track>{gallery}</div>
        </div>
        <button class="gallery-navigation justify-self-end" type="button" data-gallery-next aria-label="Next example" aria-controls="gibbous-examples"><span aria-hidden="true">⇒</span></button>
        <p class="sr-only" data-gallery-status aria-live="polite" aria-atomic="true"></p>
      </div>
    </section>
  </main>
  <script>
    const gallery = document.querySelector("[data-gallery]");
    const gallerySticky = gallery.querySelector(".gallery-sticky");
    const siteHeader = document.querySelector("[data-site-header]");
    const track = document.querySelector("[data-gallery-track]");
    const previous = document.querySelector("[data-gallery-previous]");
    const next = document.querySelector("[data-gallery-next]");
    const status = document.querySelector("[data-gallery-status]");
    const panels = [...track.children];
    const motion = matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let currentPanel = -1;
    let galleryUpdateScheduled = false;

    const showPanel = panel => {{
      if (panel === currentPanel) return;
      track.dataset.direction = panel < currentPanel ? "previous" : "next";
      currentPanel = panel;
      previous.disabled = panel === 0;
      next.disabled = panel === panels.length - 1;
      panels.forEach((item, index) => {{
        const active = index === panel;
        item.inert = !active;
        item.toggleAttribute("data-active", active);
      }});
      status.textContent = `${{panels[panel].querySelector("h2").textContent}}, ${{panel + 1}} of ${{panels.length}}`;
    }};

    const updateGallery = () => {{
      if (!motion.matches) return;

      const distance = gallery.offsetHeight - gallerySticky.offsetHeight;
      const progress = Math.min(1, Math.max(0, (siteHeader.offsetHeight - gallery.getBoundingClientRect().top) / distance));
      const panel = Math.min(panels.length - 1, Math.floor(progress * panels.length));
      showPanel(panel);
    }};

    const goToPanel = panel => {{
      const boundedPanel = Math.min(panels.length - 1, Math.max(0, panel));
      const distance = gallery.offsetHeight - gallerySticky.offsetHeight;
      const galleryTop = scrollY + gallery.getBoundingClientRect().top;
      const progress = (boundedPanel + .5) / panels.length;
      scrollTo({{top: galleryTop - siteHeader.offsetHeight + progress * distance}});
      showPanel(boundedPanel);
    }};

    const configureGallery = () => {{
      document.documentElement.style.setProperty("--site-header-height", `${{siteHeader.offsetHeight}}px`);
      document.documentElement.classList.toggle("horizontal-gallery", motion.matches);
      currentPanel = -1;
      if (motion.matches) return updateGallery();
      panels.forEach(panel => panel.inert = false);
    }};

    const scheduleGalleryUpdate = () => {{
      if (galleryUpdateScheduled) return;
      galleryUpdateScheduled = true;
      requestAnimationFrame(() => {{
        galleryUpdateScheduled = false;
        updateGallery();
      }});
    }};

    previous.addEventListener("click", () => goToPanel(currentPanel - 1));
    next.addEventListener("click", () => goToPanel(currentPanel + 1));
    addEventListener("scroll", scheduleGalleryUpdate, {{passive: true}});
    addEventListener("resize", configureGallery);
    motion.addEventListener("change", configureGallery);
    configureGallery();

    for (const comparison of document.querySelectorAll("[data-comparison]")) {{
      const toggle = comparison.querySelector("[data-comparison-toggle]");
      const off = comparison.querySelector("[data-comparison-off]");
      const on = comparison.querySelector("[data-comparison-on]");
      const moon = comparison.querySelector("[data-comparison-moon]");
      const link = comparison.querySelector("[data-comparison-link]");
      const image = comparison.querySelector("[data-comparison-image]");
      const title = comparison.closest("section").querySelector("h2").textContent;
      let phaseTimers = [];

      const animatePhases = enabled => {{
        phaseTimers.forEach(clearTimeout);
        const phases = enabled ? ["🌘", "🌑", "🌒", "🌓", "🌔"] : ["🌔", "🌓", "🌒", "🌑", "🌘"];
        if (reducedMotion.matches) return moon.textContent = phases.at(-1);
        phaseTimers = phases.map((phase, index) => setTimeout(() => moon.textContent = phase, index * 90));
      }};

      toggle.addEventListener("click", () => {{
        const enabled = toggle.getAttribute("aria-checked") !== "true";
        const action = enabled ? "Disable" : "Enable";
        const source = enabled ? image.dataset.after : image.dataset.before;
        toggle.dataset.orbit = enabled ? "on" : "off";
        toggle.setAttribute("aria-checked", String(enabled));
        toggle.setAttribute("aria-label", `${{action}} Gibbous for ${{title}}`);
        toggle.title = `${{action}} Gibbous`;
        animatePhases(enabled);
        off.classList.toggle("comparison-state-active", !enabled);
        on.classList.toggle("comparison-state-active", enabled);
        link.setAttribute("href", source);
        image.src = source;
        image.alt = `GitHub ${{enabled ? "with" : "before"}} Gibbous: ${{title}}`;
      }});
      moon.addEventListener("animationend", () => delete toggle.dataset.orbit);
    }}

    document.documentElement.classList.add("gibbous-comparisons");
  </script>
</body>
</html>
"""


def resolve_executable(explicit: Path | None, names: Sequence[str]) -> Path:
    if explicit:
        executable = explicit.expanduser().resolve()
        if executable.is_file():
            return executable
        raise FileNotFoundError(executable)

    for name in names:
        found = shutil.which(name)
        if found:
            return Path(found)
    raise FileNotFoundError(f"Could not find any of: {', '.join(names)}")


def run(command: Sequence[str], *, timeout: int = 120) -> None:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())


def capture_screenshot(chrome: Path, fixture: Path, output: Path) -> None:
    width, height = SCREENSHOT_SIZE
    run((
        str(chrome),
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-features=PaintHolding",
        "--hide-scrollbars",
        "--incognito",
        "--no-first-run",
        "--allow-file-access-from-files",
        f"--force-device-scale-factor={SCREENSHOT_SCALE}",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=300",
        f"--window-size={width},{height}",
        f"--screenshot={output}",
        fixture.as_uri(),
    ), timeout=30)


def compile_tailwind(npx: Path, index: Path, output: Path, temporary: Path) -> None:
    source = temporary / "site.css"
    source.write_text(SITE_CSS, encoding="utf-8")
    run((
        str(npx),
        "--yes",
        f"tailwindcss@{TAILWIND_VERSION}",
        "-i",
        str(source),
        "-o",
        str(output),
        "--minify",
        "--content",
        str(index),
    ))


def generate(output: Path, chrome: Path | None = None) -> None:
    destination = output.expanduser().resolve()
    if destination in {ROOT, Path.home(), Path("/")}:
        raise ValueError(f"Refusing generated output directory: {destination}")

    chrome_executable = resolve_executable(
        chrome,
        ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"),
    )
    npx = resolve_executable(None, ("npx",))
    assets = destination / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    for stale_image in assets.glob("*.png"):
        stale_image.unlink()

    with tempfile.TemporaryDirectory(prefix="gibbous-site-") as temporary_name:
        temporary = Path(temporary_name)
        for feature in FEATURES:
            for variant in ("before", "after"):
                fixture = temporary / f"{feature.slug}-{variant}.html"
                fixture.write_text(render_fixture(feature, variant), encoding="utf-8")
                capture_screenshot(
                    chrome_executable,
                    fixture,
                    assets / f"{feature.slug}-{variant}.png",
                )

        template = temporary / "index.html"
        template.write_text(render_index(), encoding="utf-8")
        stylesheet = temporary / "styles.css"
        compile_tailwind(npx, template, stylesheet, temporary)
        (destination / "index.html").write_text(
            render_index(stylesheet.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        (destination / "styles.css").unlink(missing_ok=True)

    (destination / ".nojekyll").write_text("", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the Gibbous GitHub Pages gallery and screenshots.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--chrome", type=Path)
    return parser.parse_args()


def main() -> None:
    arguments = parse_args()
    generate(arguments.output, arguments.chrome)
    print(f"Generated {arguments.output.resolve() / 'index.html'}")


if __name__ == "__main__":
    main()
