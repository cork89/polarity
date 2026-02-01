import { serve } from "bun";

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    
    if (path === "/") {
      path = "/index.html";
    }
    
    const filePath = path.slice(1);
    
    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }
      
      const ext = filePath.split(".").pop()?.toLowerCase();
      
      // Transpile TypeScript using Bun's transpiler
      if (ext === "ts") {
        const content = await file.text();
        const transpiler = new Bun.Transpiler({
          loader: "ts",
          target: "browser",
        });
        const result = await transpiler.transform(content);
        
        return new Response(result, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      }
      
      const contentTypes: Record<string, string> = {
        "html": "text/html",
        "js": "application/javascript",
        "css": "text/css",
        "woff2": "font/woff2",
        "woff": "font/woff",
        "ttf": "font/ttf",
        "otf": "font/otf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "svg": "image/svg+xml",
        "json": "application/json",
      };
      
      const contentType = contentTypes[ext || ""] || "application/octet-stream";
      
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error("Error serving file:", error);
      return new Response("Error serving file", { status: 500 });
    }
  },
});

console.log("Server running at http://localhost:3000");
