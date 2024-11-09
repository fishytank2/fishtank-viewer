import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing or invalid `url` parameter.' });
    return;
  }

  const allowedDomains = ['ft-hetzner.flowstreams.cx', 'ftest.3045x.com'];

  try {
    const urlObj = new URL(url);
    if (!allowedDomains.includes(urlObj.hostname)) {
      res.status(403).json({ error: 'Forbidden: Domain not allowed.' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', 'https://fishtank-viewer.vercel.app');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(200).end();
      return;
    }

    const customHeaders = {
      Origin: 'https://ft-hetzner.flowstreams.cx',
      Referer: 'https://ft-hetzner.flowstreams.cx/',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    };

    const response = await fetch(url, {
      headers: customHeaders,
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `Failed to fetch resource: ${response.statusText}` });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', 'https://fishtank-viewer.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (response.body) {
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        start(controller) {
          function push() {
            reader.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                return;
              }
              controller.enqueue(value);
              push();
            });
          }
          push();
        }
      });

      const newResponse = new Response(stream);
      if (newResponse.body) {
        newResponse.body.pipeTo(new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          }
        }));
      } else {
        res.status(500).json({ error: 'Failed to create response stream.' });
      }
    } else {
      res.status(500).json({ error: 'No response body.' });
    }
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
