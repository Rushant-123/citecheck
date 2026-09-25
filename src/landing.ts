/** Human-facing landing page. Agents get /llms.txt; this is for the builder who follows a link from a thread. */
export const LANDING = (origin: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>citecheck</title>
<meta name="description" content="Citation integrity checks for AI agents. Dead link, drifted page, or contradicted claim: know before your user clicks.">
<style>
:root { --bg:#0b0c0e; --fg:#e8e6e1; --mute:#8d8a83; --line:#23252a; --ok:#6fcf97; --bad:#eb5757; --warn:#f2c94c; --accent:#f4178a; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg:#fbfaf7; --fg:#15161a; --mute:#6a6a66; --line:#e3e1db; } }
* { box-sizing:border-box }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 ui-sans-serif,-apple-system,"Inter",system-ui,sans-serif; }
main { max-width:760px; margin:0 auto; padding:56px 16px 96px; }
h1 { font-size:40px; letter-spacing:-0.02em; margin:0 0 8px; }
h1 span { color:var(--accent) }
.lede { font-size:19px; color:var(--mute); margin:0 0 40px; max-width:600px }
h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--mute); margin:48px 0 12px }
pre, code { font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
pre { background:rgba(127,127,127,.08); border:1px solid var(--line); border-radius:8px; padding:14px 16px; overflow:auto; margin:0 0 12px }
table { border-collapse:collapse; width:100%; margin:0 0 12px }
td, th { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top }
th { color:var(--mute); font-weight:500; font-size:13px }
.demo { border:1px solid var(--line); border-radius:10px; padding:18px; }
.demo label { display:block; font-size:13px; color:var(--mute); margin:10px 0 4px }
.demo input { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:6px; background:transparent; color:var(--fg); font:inherit }
.demo button { margin-top:14px; padding:10px 18px; border:0; border-radius:6px; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer }
.demo button[disabled] { opacity:.5 }
.v { font-weight:600 }
.v.verified, .v.live { color:var(--ok) } .v.dead, .v.contradicted, .v.invalid { color:var(--bad) } .v.drift, .v.unclear { color:var(--warn) }
#out { margin-top:16px; font-size:14px }
#out .row { padding:8px 0; border-top:1px solid var(--line) }
.foot { margin-top:64px; color:var(--mute); font-size:13px }
a { color:inherit }
</style>
</head>
<body>
<main>
<h1>cite<span>check</span></h1>
<p class="lede">Your agent cited a URL. Is it alive, is the quote actually on the page, and does the page still say what your agent claims? One call, per URL, before a human clicks it.</p>

<div class="demo">
  <strong>Try it (free lane, no signup)</strong>
  <label>URL</label><input id="url" value="https://en.wikipedia.org/wiki/Golden_Gate_Bridge">
  <label>Quote expected on the page (optional)</label><input id="quote" value="opened in 1937">
  <button id="go">Check</button>
  <div id="out"></div>
</div>

<h2>Why</h2>
<p>Deep-research agents ship links that do not resolve (5 to 18 percent in a 2026 measurement) or never said what the agent claims (3 to 13 percent). Search APIs give you sources. Nobody checks them afterwards. citecheck is that check, and it composes with Exa, Tavily, Parallel, Perplexity or anything else.</p>

<h2>What you get per URL</h2>
<table>
<tr><th>field</th><th>meaning</th></tr>
<tr><td><code>status</code></td><td>live, dead, unreachable, invalid</td></tr>
<tr><td><code>archived</code></td><td>closest Wayback Machine snapshot, when one exists</td></tr>
<tr><td><code>quote</code></td><td>is the quoted text on the page, with a 0 to 1 score and the matching snippet</td></tr>
<tr><td><code>stance</code></td><td>supports, contradicts or unclear for the claim (stance lane)</td></tr>
<tr><td><code>verdict</code></td><td><span class="v verified">verified</span>, <span class="v drift">drift</span>, <span class="v contradicted">contradicted</span>, <span class="v unclear">unclear</span>, <span class="v dead">dead</span></td></tr>
</table>

<h2>Pricing</h2>
<table>
<tr><th>route</th><th>price</th><th>limit</th></tr>
<tr><td><code>POST /v1/check/free</code></td><td>free</td><td>3 URLs, no stance</td></tr>
<tr><td><code>POST /v1/check</code></td><td>$0.02 per request</td><td>10 URLs</td></tr>
<tr><td><code>POST /v1/check/stance</code></td><td>$0.10 per request</td><td>10 URLs, adds stance per claim</td></tr>
</table>
<p>Paid lanes take machine payments (MPP on Tempo, USDC). No key, no account. An unpaid call returns a 402 challenge your wallet can settle.</p>

<h2>Use it</h2>
<pre>curl -X POST ${origin}/v1/check/free \\
  -H 'content-type: application/json' \\
  -d '{"items":[{"url":"https://arxiv.org/abs/2604.03173","quote":"citation"}]}'</pre>
<pre># paid, with the tempo CLI
tempo request -X POST --json '{"items":[...]}' ${origin}/v1/check</pre>
<pre># as an MCP tool in Claude Code
claude mcp add citecheck -- npx -y citecheck-mcp</pre>
<p>Agent docs: <a href="${origin}/llms.txt">llms.txt</a>. Discovery: <a href="${origin}/openapi.json">openapi.json</a>. Public counters: <a href="${origin}/ledger">ledger</a>.</p>

<p class="foot">Run by an agent. Prices and the shutdown rule are public in the <a href="https://github.com/Rushant-123/citecheck">repo</a>.</p>
</main>
<script>
const $ = (id) => document.getElementById(id);
$('go').onclick = async () => {
  const b = $('go'); b.disabled = true; $('out').textContent = 'checking...';
  const item = { url: $('url').value.trim() };
  if ($('quote').value.trim()) item.quote = $('quote').value.trim();
  try {
    const r = await fetch('/v1/check/free', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ items:[item] }) });
    const j = await r.json();
    if (!r.ok) { $('out').textContent = j.error || ('error ' + r.status); return; }
    $('out').innerHTML = j.results.map(x => '<div class="row"><span class="v ' + x.verdict + '">' + x.verdict + '</span> &middot; HTTP ' + (x.http_status ?? '-') +
      (x.quote ? ' &middot; quote ' + (x.quote.found ? 'found' : 'missing') + ' (' + x.quote.score + ')' : '') +
      (x.archived && x.archived.available ? ' &middot; <a href="' + x.archived.url + '">archived</a>' : '') +
      (x.quote && x.quote.snippet ? '<div style="color:var(--mute);margin-top:4px">&ldquo;' + x.quote.snippet.replace(/</g,'&lt;') + '&rdquo;</div>' : '') +
      '</div>').join('');
  } catch (e) { $('out').textContent = String(e); } finally { b.disabled = false; }
};
</script>
</body>
</html>`;
