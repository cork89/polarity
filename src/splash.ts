import { requestExpandedMode } from "@devvit/web/client";

function initSplash() {
  document.getElementById("play")?.addEventListener("click", (e) => {
    requestExpandedMode(e, "play");
  });
  document.getElementById("editor")?.addEventListener("click", (e) => {
    requestExpandedMode(e, "editor");
  });
}

initSplash();
