export {};
Bun.build({
  entrypoints: ["editor.html", "play.html", "splash.html"],
  outdir: "../dist",
  sourcemap: "inline",
  external: [
    "coingather.ogg",
    "synth1.ogg",
    "synth2.ogg",
    "DSEG7ClassicMini-Bold.woff2",
    "polaritypenguin.webp",
    "penguin.png",
    "fish.png",
  ],
});

Bun.build({
  entrypoints: ["server.ts"],
  outdir: "../dist",
  format: "cjs",
  target: "node",
  sourcemap: "inline",
  naming: "[dir]/[name].cjs",
});

console.log("rebuilt");
