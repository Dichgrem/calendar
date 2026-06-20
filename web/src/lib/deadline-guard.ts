/**
 * Last-resort safety net.
 * If the React tree hasn't produced visible content within `deadlineMs`,
 * inject a plain-DOM fallback. Handles the case where JS executes but
 * React is stuck (infinite render loop, deadlocked async, etc.).
 */
export function injectDeadlineGuard(deadlineMs = 15_000) {
  const root = document.getElementById("root");
  if (!root) return;

  let fired = false;

  setTimeout(() => {
    if (fired) return;
    // React has rendered meaningful content — no need for fallback
    if (root.children.length > 0 && (root.textContent?.length ?? 0) > 50) return;

    fired = true;
    root.innerHTML = "";
    root.className =
      "flex flex-col items-center justify-center h-screen gap-4 bg-neutral-50 dark:bg-neutral-950 font-sans";

    const msg = document.createElement("p");
    msg.className = "text-sm text-neutral-400";
    msg.textContent = "Something went wrong. Please close this tab and reopen.";

    root.appendChild(msg);
  }, deadlineMs);
}
