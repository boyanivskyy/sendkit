import { Hono, type Context } from 'hono';
import { createClerkClient } from '@clerk/backend';
import { generateClerkProtectedResourceMetadata } from '@clerk/mcp-tools/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import {
  sendTelegramMessage,
  telegramMessageInputSchema,
} from '@boyanivskyy-packages/sendkit-core';

const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecreteKey = process.env.CLERK_SECRET_KEY;

if (!clerkPublishableKey) {
  throw new Error('CLERK_PUBLISHABLE_KEY environment variable is required');
}

if (!clerkSecreteKey) {
  throw new Error('CLERK_SECRET_KEY environment variable is required');
}

const clerkClient = createClerkClient({
  publishableKey: clerkPublishableKey,
  secretKey: clerkSecreteKey,
});

function createServer(botToken: string): McpServer {
  const server = new McpServer({
    name: 'sendkit-remote',
    version: '0.0.0',
  });

  server.registerTool(
    'telegram',
    {
      title: 'Telegram',
      description: 'Send a Telegram message',
      inputSchema: telegramMessageInputSchema.shape,
    },
    async (input) => {
      const result = await sendTelegramMessage({
        ...input,
        botToken,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Sent Telegram message ${result.messageId} to chat ${result.chatId}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  return server;
}

const app = new Hono();

function protectResourceMetadataUrl(c: Context, botToken: string): string {
  return new URL(`/.well-known/oauth-protected-resource/${botToken}/mcp`, c.req.url).toString();
}

function unathorizedMcpResponse(c: Context, botToken: string) {
  c.header(
    'WWW-Authenticate',
    `Bearer resource_metadata="${protectResourceMetadataUrl(c, botToken)}"`,
  );

  return c.json({ error: 'Unathorized' }, 401);
}

app.get('/.well-known/oauth-protected-resource/:botToken/mcp', (c) => {
  return c.json(
    generateClerkProtectedResourceMetadata({
      publishableKey: clerkPublishableKey,
      resourceUrl: new URL(`/${c.req.param('botToken')}/mcp`, c.req.url).toString(),
    }),
  );
});

app.post('/:botToken/mcp', async (c) => {
  const botToken = c.req.param('botToken');
  const authHeader = c.req.header('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return unathorizedMcpResponse(c, botToken);
  }

  try {
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      acceptsToken: 'oauth_token',
    });

    if (!requestState.isAuthenticated) {
      return unathorizedMcpResponse(c, botToken);
    }
  } catch {
    return unathorizedMcpResponse(c, botToken);
  }

  const server = createServer(botToken);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  server.connect(transport);

  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await server.close();
  }
});

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: (req: Request) => {
    const url = new URL(req.url);

    url.protocol = req.headers.get('x-forwarded-proto') ?? url.protocol;
    url.host = req.headers.get('x-forwarded-host') ?? url.host;

    return app.fetch(new Request(url, req));
  },
};
