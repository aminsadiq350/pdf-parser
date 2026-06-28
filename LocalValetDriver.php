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

    /** Files that must never be cached — served manually so we can set headers. */
    private const NO_CACHE_URIS = ['/index.html', '/sw.js', '/manifest.webmanifest', '/registerSW.js'];

    /**
     * Resolve a request URI to a concrete file under dist/ (if one exists).
     * Anything not pointing to a real file returns false so Valet hands the
     * request to frontControllerPath().
     */
    public function isStaticFile(string $sitePath, string $siteName, string $uri): string|false
    {
        // Force no-cache files through frontControllerPath so we can set headers.
        if (in_array($uri, self::NO_CACHE_URIS, true)) {
            return false;
        }

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
     * No-cache files (sw.js, manifest) are also served here with explicit
     * Cache-Control headers so browsers always re-fetch them.
     */
    public function frontControllerPath(string $sitePath, string $siteName, string $uri): ?string
    {
        $dist = $sitePath . '/dist';

        // Serve no-cache files (sw.js etc.) directly with the right headers.
        if (in_array($uri, self::NO_CACHE_URIS, true)) {
            $file = $dist . $uri;
            if (file_exists($file)) {
                header('Cache-Control: no-store, no-cache, must-revalidate');
                header('Pragma: no-cache');
                $ext = pathinfo($file, PATHINFO_EXTENSION);
                $mime = $ext === 'js' ? 'application/javascript' : 'application/manifest+json';
                header('Content-Type: ' . $mime . '; charset=utf-8');
                readfile($file);
                exit;
            }
        }

        $index = $dist . '/index.html';

        if (! file_exists($index)) {
            http_response_code(503);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Notebook build missing.\n";
            echo "Run `npm run build` from " . $sitePath . " first.\n";
            exit;
        }

        // index.html must never be cached: it embeds content-hashed asset URLs
        // and any stale copy will load the wrong JS/CSS bundles.
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        readfile($index);
        exit;
    }
}
