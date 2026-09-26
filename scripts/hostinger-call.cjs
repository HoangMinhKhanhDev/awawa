// Gọi tool Hostinger MCP bất kỳ: node scripts/hostinger-call.cjs <tool> '<json>'
const { spawn } = require('child_process');
const LIMIT = Number.parseInt(process.env.HOSTINGER_CALL_LIMIT || '6000', 10);
const child = spawn('npx -y @hostinger/mcp', [], { stdio: ['pipe', 'pipe', 'ignore'], shell: true });
let buf = '';
let id = 0;
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch (e) {}
  }
});
function send(method, params) {
  return new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
  });
}
function notify(m) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: m }) + '\n'); }
(async () => {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'awawa', version: '1' } });
  notify('notifications/initialized');
  if (process.argv[2].startsWith('@')) {
    const fs = require('fs');
    const payload = JSON.parse(fs.readFileSync(process.argv[2].slice(1), 'utf8').replace(/^\uFEFF/, ''));
    const res = await send('tools/call', { name: payload.tool, arguments: payload.args });
    console.log(JSON.stringify(res).slice(0, LIMIT));
    child.kill();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  const tool = process.argv[2];
  const raw = process.argv[3] || '';
  let args = {};
  if (raw.startsWith('{')) { args = JSON.parse(raw); }
  else if (raw) { for (const kv of raw.split(',')) { const p = kv.indexOf('='); args[kv.slice(0, p)] = kv.slice(p + 1); } }
  if (tool === '__categ') {
    const tools = await send('tools/list', {});
    const groups = {};
    for (const t of (tools.result.tools || [])) {
      const g = t.name.split(/[-_]/)[0];
      groups[g] = (groups[g] || 0) + 1;
    }
    console.log(JSON.stringify(groups));
  } else if (tool === '__find') {
    const tools = await send('tools/list', {});
    const re = new RegExp(raw, 'i');
    const names = (tools.result.tools || []).map((x) => x.name).filter((n) => re.test(n));
    console.log(JSON.stringify(names));
  } else if (tool === '__schema') {
    const tools = await send('tools/list', {});
    const t = (tools.result.tools || []).find((x) => x.name === args.name);
    console.log('REQUIRED: ' + JSON.stringify(t.inputSchema.required));
    console.log('PROPS: ' + JSON.stringify(Object.keys(t.inputSchema.properties)));
    console.log('SOURCE_OPTS: ' + JSON.stringify(t.inputSchema.properties.source_options || t.inputSchema.properties.sourceOptions || 'n/a').slice(0, 2000));
  } else {
    const res = await send('tools/call', { name: tool, arguments: args });
    const out = JSON.stringify(res);
    console.log(out.slice(0, LIMIT));
  }
  child.kill();
  setTimeout(() => process.exit(0), 500);
})();
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 90000);
