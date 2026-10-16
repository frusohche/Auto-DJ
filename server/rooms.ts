// Pairing rooms for the phone remote. The computer ("player") posts its state; phones
// ("remotes") get it over Server-Sent Events and post commands back, which are relayed
// to the player the same way. No database: rooms live in memory and expire when idle.
import { randomInt } from 'node:crypto';
import express, { type Response, type Router } from 'express';

interface Room {
  state: unknown;
  players: Set<Response>;
  remotes: Set<Response>;
  touched: number;
}

const rooms = new Map<string, Room>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to misread
const IDLE_MS = 12 * 60 * 60 * 1000;

function newCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function getRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (room) room.touched = Date.now();
  return room;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.touched > IDLE_MS && r.players.size === 0 && r.remotes.size === 0) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

export function roomsRouter(): Router {
  const r = express.Router();
  r.use(express.json({ limit: '2mb' }));

  r.post('/', (_req, res) => {
    const code = newCode();
    rooms.set(code, { state: null, players: new Set(), remotes: new Set(), touched: Date.now() });
    res.json({ code });
  });

  r.get('/:code/events', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return void res.status(404).json({ error: 'No such room - check the code on the computer.' });
    const role = req.query.role === 'player' ? 'player' : 'remote';
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // stop proxies buffering the stream
    });
    res.flushHeaders();
    const set = role === 'player' ? room.players : room.remotes;
    set.add(res);
    if (role === 'remote' && room.state) send(res, 'state', room.state);
    for (const p of room.players) send(p, 'remotes', { count: room.remotes.size });
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      set.delete(res);
      for (const p of room.players) send(p, 'remotes', { count: room.remotes.size });
    });
  });

  r.post('/:code/state', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return void res.status(404).end();
    room.state = req.body;
    for (const v of room.remotes) send(v, 'state', room.state);
    res.status(204).end();
  });

  r.post('/:code/command', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return void res.status(404).json({ error: 'No such room' });
    if (room.players.size === 0) return void res.status(409).json({ error: 'The computer is not connected.' });
    for (const p of room.players) send(p, 'command', req.body);
    res.status(204).end();
  });

  return r;
}
