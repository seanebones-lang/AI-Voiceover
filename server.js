// Graceful Prod Server v2.2
import express from 'express';
import http from 'http';
import WebSocket from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Env Safe
if (!process.env.ELEVENLABS_API_KEY) {
  console.log('⚠️ No ELEVENLABS_API_KEY - APIs in demo mode');
}

// APIs with fallback
app.get('/api/voices', (req, res) => {
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'Setup ELEVENLABS_API_KEY in Railway env', voices: [] });
  }
  // Existing axios...
});

// Similar for /text-to-speech, /clone-voice

// WS Chat Stub
wss.on('connection', (ws) => {
  ws.send('Connected to Voice Chat');
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server on port ${process.env.PORT || 3000}`);
});