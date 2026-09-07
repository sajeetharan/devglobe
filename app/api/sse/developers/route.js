import { diffLivePresence } from '../../../../lib/live-presence.js';
import { listLivePresence } from '../../../../lib/live-presence-store.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();
const UPDATE_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 20000;

function event(name, data) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request) {
  let developers;
  try {
    developers = await listLivePresence();
  } catch (error) {
    console.error('Live presence initialization failed:', error.message);
    return Response.json({ error: 'Live presence is unavailable' }, { status: 503 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let current = developers;
      let closed = false;
      let checking = false;
      controller.enqueue(event('init', current));

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(updateTimer);
        clearInterval(heartbeatTimer);
        try { controller.close(); } catch {}
      };
      const updateTimer = setInterval(async () => {
        if (closed || checking) return;
        checking = true;
        try {
          const next = await listLivePresence();
          for (const update of diffLivePresence(current, next)) controller.enqueue(event('update', update));
          current = next;
        } catch (error) {
          console.error('Live presence refresh failed:', error.message);
        } finally {
          checking = false;
        }
      }, UPDATE_INTERVAL_MS);
      const heartbeatTimer = setInterval(() => {
        if (!closed) controller.enqueue(event('heartbeat', { at: new Date().toISOString() }));
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  });
}