(() => {
  if (!document.referrer) return;
  const parentOrigin = new URL(document.referrer).origin;
  const MAX_SCALE = 8;
  const PADDING = 48;
  const VISIBLE_EDGE = 96;
  const ZOOM_STEP = 1.25;
  const DOUBLE_CLICK_ZOOM = 1.6;
  const root = document.documentElement;
  let expanded = false;
  let scale = 1;
  let fitScale = 1;
  let x = 0;
  let y = 0;
  let width = 0;
  let height = 0;
  let drag;
  let controls;
  let zoomLabel;

  const svg = () => document.querySelector(".mermaid-view svg");
  const stage = () => svg()?.parentElement;
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
  const clampScale = value => clamp(value, fitScale / 2, MAX_SCALE);

  const measure = () => {
    const diagram = svg();
    const box = diagram?.viewBox?.baseVal;
    width = box?.width || diagram?.getBoundingClientRect().width || 0;
    height = box?.height || diagram?.getBoundingClientRect().height || 0;
    return width > 0 && height > 0;
  };

  const clampPan = () => {
    x = clamp(x, VISIBLE_EDGE - width * scale, innerWidth - VISIBLE_EDGE);
    y = clamp(y, VISIBLE_EDGE - height * scale, innerHeight - VISIBLE_EDGE);
  };

  const apply = animate => {
    const target = stage();
    if (!target) return;
    target.classList.toggle("gibbous-animate", animate);
    target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };

  const fit = animate => {
    if (!measure()) return;
    const target = stage();
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    svg().style.transform = "";
    fitScale = Math.min((innerWidth - 2 * PADDING) / width, (innerHeight - 2 * PADDING) / height, MAX_SCALE);
    scale = fitScale;
    x = (innerWidth - width * scale) / 2;
    y = (innerHeight - height * scale) / 2;
    apply(animate);
  };

  const zoomAt = (factor, clientX, clientY, animate = true) => {
    const next = clampScale(scale * factor);
    const ratio = next / scale;
    x = clientX - (clientX - x) * ratio;
    y = clientY - (clientY - y) * ratio;
    scale = next;
    clampPan();
    apply(animate);
  };

  const panBy = (dx, dy, animate = true) => {
    x += dx;
    y += dy;
    clampPan();
    apply(animate);
  };

  const button = (label, text, onclick) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "btn";
    node.setAttribute("aria-label", label);
    node.title = label;
    node.textContent = text;
    node.addEventListener("click", onclick);
    return node;
  };

  const mountControls = () => {
    if (controls) return;
    controls = document.createElement("div");
    controls.className = "gibbous-mermaid-controls";
    zoomLabel = button("Fit to view", "100%", () => fit(true));
    zoomLabel.classList.add("gibbous-zoom-level");
    controls.append(
      button("Zoom out", "−", () => zoomAt(1 / ZOOM_STEP, innerWidth / 2, innerHeight / 2)),
      zoomLabel,
      button("Zoom in", "+", () => zoomAt(ZOOM_STEP, innerWidth / 2, innerHeight / 2)),
    );
    document.body.append(controls);
  };

  const collapse = () => {
    const target = stage();
    if (target) {
      target.classList.remove("gibbous-animate");
      target.style.removeProperty("transform");
      target.style.removeProperty("width");
      target.style.removeProperty("height");
    }
    drag = undefined;
    root.removeAttribute("data-gibbous-mermaid-dragging");
  };

  const setExpanded = value => {
    expanded = value;
    root.toggleAttribute("data-gibbous-mermaid-expanded", expanded);
    if (!expanded) return collapse();
    mountControls();
    requestAnimationFrame(() => fit(false));
  };

  addEventListener("message", event => {
    if (event.source !== parent || event.origin !== parentOrigin
      || event.data?.type !== "gibbous-mermaid-expanded") return;
    setExpanded(Boolean(event.data.value));
  });

  // GitHub re-renders the diagram when the frame is resized; refit when it does.
  new MutationObserver(() => {
    if (expanded) requestAnimationFrame(() => fit(false));
  }).observe(document.querySelector(".mermaid-view") ?? document.body, {childList: true});
  addEventListener("resize", () => {
    if (expanded) fit(false);
  });

  const onDiagram = event => {
    const target = event.target instanceof Element && event.target;
    return expanded && target && !target.closest("a, .clickable, button");
  };

  addEventListener("dblclick", event => {
    if (!onDiagram(event)) return;
    event.preventDefault();
    zoomAt(DOUBLE_CLICK_ZOOM, event.clientX, event.clientY);
  });

  addEventListener("wheel", event => {
    if (!expanded) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0025));
    zoomAt(factor, event.clientX, event.clientY, false);
  }, {passive: false});

  addEventListener("keydown", event => {
    if (!expanded || event.altKey || event.metaKey) return;
    const center = [innerWidth / 2, innerHeight / 2];
    const step = event.shiftKey ? 240 : 80;
    if (event.key === "Escape") parent.postMessage({type: "gibbous-close-mermaid"}, parentOrigin);
    else if (event.key === "+" || event.key === "=") zoomAt(ZOOM_STEP, ...center);
    else if (event.key === "-" || event.key === "_") zoomAt(1 / ZOOM_STEP, ...center);
    else if (event.key === "0") fit(true);
    else if (event.key === "ArrowLeft") panBy(step, 0);
    else if (event.key === "ArrowRight") panBy(-step, 0);
    else if (event.key === "ArrowUp") panBy(0, step);
    else if (event.key === "ArrowDown") panBy(0, -step);
    else return;
    event.preventDefault();
  });

  addEventListener("pointerdown", event => {
    if (!onDiagram(event) || event.button !== 0) return;
    event.preventDefault();
    root.setPointerCapture?.(event.pointerId);
    drag = {id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y};
    root.setAttribute("data-gibbous-mermaid-dragging", "");
  });

  addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.clientX;
    y = drag.y + event.clientY - drag.clientY;
    clampPan();
    apply(false);
  });

  const finishDrag = event => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    root.removeAttribute("data-gibbous-mermaid-dragging");
  };
  addEventListener("pointerup", finishDrag);
  addEventListener("pointercancel", finishDrag);

  parent.postMessage({type: "gibbous-mermaid-ready"}, parentOrigin);
})();
