import { success } from '../lib/response.js';

export function handlePing(req) {
  return success(req.requestId, {
    service: 'ai-worker',
    status: 'ok',
    version: 'v1'
  });
}
