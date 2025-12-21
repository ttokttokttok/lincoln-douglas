import { Express, Request, Response } from 'express';
import { roomManager } from '../rooms/manager.js';

export function setupRoutes(app: Express): void {
  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Create a new room
  app.post('/api/rooms', (req: Request, res: Response) => {
    const { resolution } = req.body;

    if (!resolution) {
      res.status(400).json({ error: 'resolution is required' });
      return;
    }

    // Create empty room - participants will join via WebSocket
    const room = roomManager.createEmptyRoom(resolution);
    res.status(201).json({
      id: room.id,
      code: room.code,
      resolution: room.resolution,
    });
  });

  // Get room by ID
  app.get('/api/rooms/:roomId', (req: Request, res: Response) => {
    const room = roomManager.getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: roomManager.serializeRoom(room) });
  });

  // Get room by code
  app.get('/api/rooms/code/:code', (req: Request, res: Response) => {
    const room = roomManager.getRoomByCode(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: roomManager.serializeRoom(room) });
  });
}
