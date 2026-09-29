// MCP transports. With the app open, a Streamable HTTP server listens on 127.0.0.1 only, with a
// random token per session of the app, written to <userData>/mcp.json (readable by this user only).
// `BoardPilot --mcp-stdio` is what an MCP client launches: it proxies to the running app (so write
// requests reach the user in the app window) or, when the app is not running, serves headless with
// every write refused.

import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOLS, callMcpTool, mcpResources, readMcpResource, type McpDeps } from './tools';

const INSTRUCTIONS =
  'BoardPilot gives you the user’s real development board: live pin levels, I2C scans with decoded traces, ADC readings, board and part definitions, and wiring and code checks. ' +
  'Every result says whether it was measured or documented; never state a value you did not get from a tool. ' +
  'Measurements need the diagnostic agent on the board: if a tool says it is missing, call request_flash and wait for the user. ' +
  'Writes (flash, driving a pin) only happen after the user clicks Confirm in BoardPilot.';

/** One MCP server (protocol side) over the shared tool implementation. */
export function createMcpServer(deps: Omit<McpDeps, 'clientName'>, version: string): Server {
  const server = new Server({ name: 'boardpilot', version }, { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS });
  const full: McpDeps = { ...deps, clientName: () => server.getClientVersion()?.name ?? 'MCP client' };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as { type: 'object' } })) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => callMcpTool(req.params.name, req.params.arguments ?? {}, full));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: mcpResources(full) }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const text = readMcpResource(req.params.uri, full);
    if (text === null) throw new Error(`Unknown resource ${req.params.uri}`);
    return { contents: [{ uri: req.params.uri, mimeType: 'application/json', text }] };
  });
  return server;
}

export interface McpConnectionInfo {
  url: string;
  token: string;
  pid: number;
}

export const connectionFile = (dataDir: string) => join(dataDir, 'mcp.json');

/** The localhost HTTP server the app runs while the MCP switch is on. */
export class McpHttpServer {
  private http: HttpServer | null = null;
  private sessions = new Map<string, StreamableHTTPServerTransport>();
  private token = '';

  constructor(
    private deps: Omit<McpDeps, 'clientName'>,
    private dataDir: string,
    private version: string,
  ) {}

  get running() {
    return !!this.http;
  }

  async start(): Promise<McpConnectionInfo> {
    if (this.http) return this.info();
    this.token = randomBytes(24).toString('hex');
    this.http = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.http?.listen(0, '127.0.0.1', resolve));
    const info = this.info();
    writeFileSync(connectionFile(this.dataDir), JSON.stringify(info), { mode: 0o600 });
    return info;
  }

  async stop() {
    for (const t of this.sessions.values()) await t.close().catch(() => undefined);
    this.sessions.clear();
    await new Promise<void>((resolve) => (this.http ? this.http.close(() => resolve()) : resolve()));
    this.http = null;
    try {
      unlinkSync(connectionFile(this.dataDir));
    } catch {
      /* already gone */
    }
  }

  private info(): McpConnectionInfo {
    const addr = this.http?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    return { url: `http://127.0.0.1:${port}/mcp`, token: this.token, pid: process.pid };
  }

  private authorized(req: IncomingMessage): boolean {
    const got = Buffer.from(String(req.headers.authorization ?? ''));
    const want = Buffer.from(`Bearer ${this.token}`);
    return got.length === want.length && timingSafeEqual(got, want);
  }

  private async handle(req: IncomingMessage, res: import('node:http').ServerResponse) {
    // Local only, with the session token; no browser origins (blocks DNS-rebinding pages).
    if (!req.url?.startsWith('/mcp') || !this.authorized(req) || req.headers.origin) {
      res.writeHead(401).end();
      return;
    }
    const sid = req.headers['mcp-session-id'];
    let transport = typeof sid === 'string' ? this.sessions.get(sid) : undefined;
    if (!transport) {
      if (sid) {
        res.writeHead(404).end();
        return;
      }
      const t: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => void this.sessions.set(id, t),
      });
      t.onclose = () => {
        if (t.sessionId) this.sessions.delete(t.sessionId);
      };
      await createMcpServer(this.deps, this.version).connect(t);
      transport = t;
    }
    let body: unknown;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400).end();
        return;
      }
    }
    await transport.handleRequest(req, res, body);
  }
}

/** `BoardPilot --mcp-stdio`: proxy to the running app, or serve headless (writes refused). */
export async function runStdio(dataDir: string, version: string, headlessDeps: () => Omit<McpDeps, 'clientName'>): Promise<void> {
  let info: McpConnectionInfo | null = null;
  try {
    info = JSON.parse(readFileSync(connectionFile(dataDir), 'utf8')) as McpConnectionInfo;
  } catch {
    info = null;
  }
  if (info) {
    try {
      const client = new Client({ name: 'boardpilot-stdio-proxy', version });
      await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.token}` } } }));
      const proxy = new Server({ name: 'boardpilot', version }, { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS });
      proxy.setRequestHandler(ListToolsRequestSchema, () => client.listTools());
      proxy.setRequestHandler(CallToolRequestSchema, async (req) => (await client.callTool(req.params)) as { content: { type: 'text'; text: string }[]; [key: string]: unknown });
      proxy.setRequestHandler(ListResourcesRequestSchema, () => client.listResources());
      proxy.setRequestHandler(ReadResourceRequestSchema, (req) => client.readResource(req.params));
      await proxy.connect(new StdioServerTransport());
      return;
    } catch {
      // The app is not running any more (stale file): fall through to headless.
    }
  }
  await createMcpServer({ ...headlessDeps(), headless: true }, version).connect(new StdioServerTransport());
}
