const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let comments = []; // Armazenamento temporário (memória)
let replies = []; // Armazenamento temporário

const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

// Broadcast para todos os clientes conectados
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Middleware de autenticação (simples, expanda com Discord OAuth)
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  // Simule usuário do token (em produção, valide com Discord API)
  req.user = { id: 'example_user_id', name: 'Akisil', avatar: 'https://example.com/avatar.png' };
  next();
}

// GET /api/forum/comments
app.get('/api/forum/comments', authenticate, (req, res) => {
  res.json(comments.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

// POST /api/forum/comments
app.post('/api/forum/comments', authenticate, (req, res) => {
  const { title, content, anonymous } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Título e conteúdo obrigatórios' });
  const newComment = {
    id: uuidv4(),
    title,
    content,
    anonymous: !!anonymous,
    user_id: req.user.id,
    user_name: anonymous ? null : req.user.name,
    user_avatar: anonymous ? null : req.user.avatar,
    date: new Date().toISOString()
  };
  comments.push(newComment);
  broadcast({ type: 'new_comment', ...newComment });
  res.status(201).json(newComment);
});

// DELETE /api/forum/comments/:id
app.delete('/api/forum/comments/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const index = comments.findIndex(c => c.id === id && c.user_id === req.user.id);
  if (index === -1) return res.status(403).json({ error: 'Sem permissão ou não encontrado' });
  comments.splice(index, 1);
  replies = replies.filter(r => r.comment_id !== id);
  broadcast({ type: 'delete_comment', id });
  res.status(204).send();
});

// GET /api/forum/replies?comment_id=ID
app.get('/api/forum/replies', authenticate, (req, res) => {
  const commentId = req.query.comment_id;
  if (!commentId) return res.status(400).json({ error: 'comment_id obrigatório' });
  res.json(replies.filter(r => r.comment_id === commentId).sort((a, b) => new Date(a.date) - new Date(b.date)));
});

// POST /api/forum/replies
app.post('/api/forum/replies', authenticate, (req, res) => {
  const { comment_id, content } = req.body;
  if (!comment_id || !content) return res.status(400).json({ error: 'comment_id e content obrigatórios' });
  if (!comments.find(c => c.id === comment_id)) return res.status(404).json({ error: 'Comentário não encontrado' });
  const newReply = {
    id: uuidv4(),
    comment_id,
    content,
    user_id: req.user.id,
    user_name: req.user.name,
    user_avatar: req.user.avatar,
    date: new Date().toISOString()
  };
  replies.push(newReply);
  broadcast({ type: 'new_reply', ...newReply });
  res.status(201).json(newReply);
});

// DELETE /api/forum/replies/:id
app.delete('/api/forum/replies/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const index = replies.findIndex(r => r.id === id && r.user_id === req.user.id);
  if (index === -1) return res.status(403).json({ error: 'Sem permissão ou não encontrado' });
  const deleted = replies.splice(index, 1)[0];
  broadcast({ type: 'delete_reply', id, comment_id: deleted.comment_id });
  res.status(204).send();
});

// Upgrade para WebSocket
app.get('/ws', (req, res) => {
  res.status(426).send('Upgrade Required');
});

// Server listen
const server = app.listen(process.env.PORT || 3000, () => console.log('Server running'));

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

module.exports = app; // Para Vercel
