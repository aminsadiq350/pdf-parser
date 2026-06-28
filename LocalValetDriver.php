<?php

use Valet\Drivers\BasicValetDriver;

/**
 * Valet driver for the Vite-built Notebook SPA.
 *
 * Serves everything under dist/ as static, and falls back to dist/index.html
 * for any unmatched route (SPA history-API style). Drop the file in the
 * project root; Valet picks it up automatically for this site only.
 *
 * Workflow:
 *   1. npm run build      (regenerates dist/)
 *   2. https://pdf-parser.test/ now serves the built app
 *
 * For HMR / dev mode, run `npm run dev` and use either localhost:5173
 * directly or `valet proxy pdf-parser http://localhost:5173 --secure`.
 */
class LocalValetDriver extends BasicValetDriver
{
    public function serves(string $sitePath, string $siteName, string $uri): bool
    {
        return true;
    }

    /**
     * Resolve a request URI to a concrete file under dist/ (if one exists).
     * Anything not pointing to a real file returns false so Valet hands the
     * request to frontControllerPath().
     */
    public function isStaticFile(string $sitePath, string $siteName, string $uri): string|false
    {
        $dist = $sitePath . '/dist';
        $candidate = $dist . $uri;

        if ($uri !== '/' && file_exists($candidate) && ! is_dir($candidate)) {
            return $candidate;
        }

        return false;
    }

    /**
     * SPA fallback: every non-static request returns the built index.html
     * so the Vue app boots and handles the route client-side.
     */
    public function frontControllerPath(string $sitePath, string $siteName, string $uri): ?string
    {
        $index = $sitePath . '/dist/index.html';

        if (! file_exists($index)) {
            http_response_code(503);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Notebook build missing.\n";
            echo "Run `npm run build` from " . $sitePath . " first.\n";
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        readfile($index);
        exit;
    }
}
