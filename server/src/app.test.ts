import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';

describe('API foundation', () => {
  it('reports service health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
  it('rejects gym profile access without a session', async () => {
    const response = await request(app).get('/api/gym/profile');
    expect(response.status).toBe(401);
  });
});
