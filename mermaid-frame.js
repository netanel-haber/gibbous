(() => {
  let expanded = false;
  let drag;
  let x = 0;
  let y = 0;
  if (!document.referrer) return;
  const parentOrigin = new URL(document.referrer).origin;
  const diagram = () => document.querySelector("#diagram");

  const reset = () => {
    x = 0;
    y = 0;
    diagram()?.style.removeProperty("translate");
  };

  addEventListener("message", event => {
    if (event.source !== parent || event.origin !== parentOrigin
      || event.data?.type !== "gibbous-mermaid-expanded") return;
    expanded = Boolean(event.data.value);
    document.documentElement.toggleAttribute("data-gibbous-mermaid-expanded", expanded);
    if (!expanded) reset();
  });

  addEventListener("click", event => {
    const target = event.target instanceof Element && event.target;
    if (!target) return;
    if (target.closest('button[aria-label="Reset view"]')) {
      reset();
      return;
    }
    if (target.closest("a, button, .clickable")) return;
    if (!expanded && target.closest("#diagram")) {
      parent.postMessage({type: "gibbous-open-mermaid"}, parentOrigin);
    }
  });

  addEventListener("keydown", event => {
    if (expanded && event.key === "Escape") {
      parent.postMessage({type: "gibbous-close-mermaid"}, parentOrigin);
    }
  });

  addEventListener("pointerdown", event => {
    const target = event.target instanceof Element && event.target;
    const svg = target?.closest("#diagram");
    if (!expanded || !svg || target.closest("a, .clickable") || event.button !== 0) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, x, y};
    document.documentElement.setAttribute("data-gibbous-mermaid-dragging", "");
  });

  addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.pointerX;
    y = drag.y + event.clientY - drag.pointerY;
    diagram().style.translate = `${x}px ${y}px`;
  });

  const finishDrag = event => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    document.documentElement.removeAttribute("data-gibbous-mermaid-dragging");
  };
  addEventListener("pointerup", finishDrag);
  addEventListener("pointercancel", finishDrag);
  parent.postMessage({type: "gibbous-mermaid-ready"}, parentOrigin);
})();
