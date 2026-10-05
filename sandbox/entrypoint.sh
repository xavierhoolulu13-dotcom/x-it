#!/bin/bash
set -e

echo "[Sandbox] Starting sandbox environment..."
echo "[Sandbox] User: $(whoami)"
echo "[Sandbox] Working directory: $(pwd)"
echo "[Sandbox] Node.js: $(node --version)"
echo "[Sandbox] Python: $(python3 --version)"
echo "[Sandbox] Chromium: $(chromium-browser --version 2>/dev/null || echo 'not available')"

# Set up a simple health endpoint
cat > /tmp/health-server.js << 'EOF'
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(8080, '0.0.0.0', () => {
  console.log('[Sandbox] Health endpoint running on port 8080');
});
EOF

# Start health server in background
node /tmp/health-server.js &

echo "[Sandbox] Sandbox environment ready."

# Keep the container running
tail -f /dev/null