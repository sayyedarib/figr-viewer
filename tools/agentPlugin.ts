import { build } from "esbuild";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Serves the in-page agent as a classic IIFE script at `/agent.js`.
 *
 * Each preview page carries exactly one `<script src="http://localhost:5173/agent.js">`.
 * In dev the bundle is rebuilt on every request (esbuild takes a few ms), so the
 * pages always get the current agent. In production builds it is emitted as an asset.
 */
export function agentPlugin(entry: string): Plugin {
  const bundle = async (minify: boolean) => {
    const result = await build({
      entryPoints: [path.resolve(entry)],
      bundle: true,
      format: "iife",
      target: "es2020",
      minify,
      write: false,
      sourcemap: minify ? false : "inline",
    });
    return result.outputFiles[0].text;
  };

  return {
    name: "figr-agent",
    configureServer(server) {
      server.middlewares.use("/agent.js", (_req, res, next) => {
        bundle(false)
          .then((code) => {
            res.setHeader("Content-Type", "text/javascript; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(code);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "agent.js", source: await bundle(true) });
    },
  };
}
