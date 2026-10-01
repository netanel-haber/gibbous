# Gibbous

GitHub, but with the UX you want.

## Features

- `🌔`/`🌘` global toggle for all of the tweaks
- Leaves GitHub untouched on mobile viewports
- 👀 button above files view: click to persistently hide files like CNAME in top-level repository views
- Hides unused buttons like Copilot and Workflows
- `forked in owner/repository` link to fork on upstream repositories when you have a fork
- On repositories you own, can push to, or have forked: no topics, resource links, social stats, Watch or Fork buttons, or sidebar extras; releases sit beside a tags panel, and contributors and languages become tabs next to `README`
- `My pull requests` tab on repositories where you have open pull requests, shown first; the license, conduct, contributing, and security tabs move into a `⋯` menu
- Enlarge Mermaid diagrams into a lightbox: scroll or double-click to zoom, drag to pan, Esc to close

### Try the Mermaid lightbox

With Gibbous on, use Enlarge on this diagram: scroll or double-click to zoom, drag to pan, press 0 to refit, and Esc to close.

```mermaid
sequenceDiagram
    participant Client
    participant GPUWatermarkSampler
    participant GumbelWatermark
    participant Detector

    Client->>GPUWatermarkSampler: Configure sampler
    loop Every generated token
        GPUWatermarkSampler->>GumbelWatermark: Sample logits with token context
        GumbelWatermark-->>GPUWatermarkSampler: Return watermarked token
    end
    Client->>Detector: Submit generated token IDs
    Detector-->>Client: Return score, p-value, and watermark flag
```

## Install

[![Download extension ZIP](https://img.shields.io/badge/download-extension.zip-e6c96f?style=for-the-badge&labelColor=161b22)](https://github.com/netanel-haber/gibbous/archive/refs/heads/main.zip)

1. Download and extract the ZIP.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted `gibbous-main` folder.

<p align="center">
  <a href="https://www.flickr.com/photos/john-spade/6680460959/">
    <img src="https://live.staticflickr.com/7022/6680460959_fb8336eb3a_k.jpg" width="2048" height="2048" alt="Moon Waxing Gibbous January 2012">
  </a>
</p>

<p align="center">
  <a href="https://www.flickr.com/photos/john-spade/6680460959/">Moon Waxing Gibbous January 2012</a>
  by <a href="https://www.flickr.com/photos/john-spade/">daspader</a>, licensed under
  <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>.
</p>
