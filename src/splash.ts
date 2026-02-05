import { requestExpandedMode } from "@devvit/web/client";

const svg = document.getElementById("arc-svg");
const arcCount = 60;
const speedMult = 0.1;

function createSwirl() {
  for (let i = 0; i < arcCount; i++) {
    const isRed = i % 2 === 0;
    const color = isRed ? "#ff1e5677" : "#002c9a77";
    const radius = 150 + Math.random() * 450;
    const angleOffset = Math.random() * 360;
    const arcLength = 10 + Math.random() * 40;
    const speed =
      (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 1.5) * speedMult;
    const strokeWidth = 2 + Math.random() * 3;

    // Create an SVG path for the arc
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    // Calculate SVG path data (approximating an arc)
    const startAngle = 0;
    const endAngle = (arcLength * Math.PI) / 180;
    const x1 = 1000 + radius * Math.cos(startAngle);
    const y1 = 1000 + radius * Math.sin(startAngle);
    const x2 = 1000 + radius * Math.cos(endAngle);
    const y2 = 1000 + radius * Math.sin(endAngle);

    const d = `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;

    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", `${strokeWidth}`);
    path.setAttribute("stroke-linecap", "round");
    path.style.transformOrigin = "1000px 1000px";

    svg.appendChild(path);

    // Animate the rotation
    path.animate(
      [
        { transform: `rotate(${angleOffset}deg)` },
        { transform: `rotate(${angleOffset + (speed > 0 ? 360 : -360)}deg)` },
      ],
      {
        duration: Math.abs(10000 / speed),
        iterations: Infinity,
      },
    );
  }
}

createSwirl();

function initSplash() {
  document.getElementById("play")?.addEventListener("click", (e) => {
    requestExpandedMode(e, "play");
  });
  document.getElementById("editor")?.addEventListener("click", (e) => {
    requestExpandedMode(e, "editor");
  });
}

initSplash();
