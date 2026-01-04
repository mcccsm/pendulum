import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Debug middleware: Log every request
app.use((req, res, next) => {
    console.log(`[DEBUG] Request: ${req.method} ${req.url}`);
    next();
});

// Check if dist exists
if (!fs.existsSync(path.join(__dirname, 'dist'))) {
    console.error('[CRITICAL] dist folder not found! Run npm run build.');
} else {
    console.log('[INFO] dist folder found.');
}

// Serve static files - Attempt 1: via /pendulum mount
app.use('/pendulum', express.static(path.join(__dirname, 'dist'), {
    fallthrough: true,
    setHeaders: (res, path) => {
        console.log(`[STATIC] Serving: ${path}`);
    }
}));

// Serve static files - Attempt 2: root mount (in case URL is stripped)
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for React routing
// Match everything EXCEPT files with extensions (to avoid serving HTML for missing assets)
app.get(/.*/, (req, res) => {
    // Basic heuristic: if it has a dot, it's probably a file, not a route
    if (req.url.lastIndexOf('.') > req.url.lastIndexOf('/')) {
        console.log(`[404] Missing Asset: ${req.url}`);
        return res.status(404).send('Not Found');
    }

    const indexHtml = path.join(__dirname, 'dist', 'index.html');
    console.log(`[HTML] Serving index.html for ${req.url}`);

    if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
    } else {
        res.status(500).send('CRITICAL: dist/index.html is missing!');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
