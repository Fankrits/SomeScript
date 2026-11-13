import cp from 'node:child_process';

async function waitHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      console.log(`[waitHttp] successfully connected to ${url} (status: ${r.status})`);
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return false;
}

async function testApp(name, cmd, args, cwd, baseUrl, routes) {
  console.log(`\n=== Testing ${name} (${baseUrl}) ===`);
  const port = new URL(baseUrl).port;
  const proc = cp.spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: port, HOST: '0.0.0.0' }
  });

  proc.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[${name} err] ${d}`));

  try {
    const ready = await waitHttp(baseUrl, 35000);
    if (!ready) {
      throw new Error(`${name} failed to become ready at ${baseUrl}`);
    }

    let errors = 0;
    for (const route of routes) {
      const url = new URL(route, baseUrl).toString();
      const res = await fetch(url, { redirect: 'manual' });
      const status = res.status;
      const text = await res.text();
      const isError = status >= 500 || text.includes('Internal Server Error') || text.includes('Application error');
      console.log(`[${name}] Route ${route.padEnd(30)} -> status ${status} ${isError ? '❌ FAIL' : '✅ OK'}`);
      if (isError) {
        errors++;
      }
    }

    if (errors > 0) {
      throw new Error(`${name} had ${errors} route errors`);
    }
    console.log(`=== ${name}: All ${routes.length} pages passed without error! ===\n`);
  } finally {
    proc.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
    try {
      proc.kill('SIGKILL');
    } catch {}
  }
}

async function main() {
  // 1. apps/web (port 3000)
  await testApp(
    'apps/web',
    'bun',
    ['--bun', 'next', 'start', '-p', '3000'],
    'apps/web',
    'http://127.0.0.1:3000',
    [
      '/',
      '/about',
      '/pricing',
      '/contact',
      '/desktop',
      '/legal',
      '/sign-in',
      '/sign-up',
      '/dashboard',
      '/dashboard/templates',
      '/dashboard/trash'
    ]
  );

  // 2. apps/editor (port 3002)
  await testApp(
    'apps/editor',
    'bun',
    ['--bun', 'next', 'start', '-p', '3002'],
    'apps/editor',
    'http://127.0.0.1:3002',
    [
      '/',
      '/api/health'
    ]
  );

  // 3. apps/docs (port 3003)
  await testApp(
    'apps/docs',
    'node',
    ['.output/server/index.mjs'],
    'apps/docs',
    'http://127.0.0.1:3003',
    [
      '/',
      '/getting-started/introduction',
      '/getting-started/installation',
      '/ai-integration/mcp',
      '/document-fundamentals/document-structure',
      '/technical-writing/mathematics',
      '/reference/faq'
    ]
  );

  console.log('🎉 ALL WEBSITES AND PAGES VERIFIED WITHOUT ERROR!');
}

main().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
