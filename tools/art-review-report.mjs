// SPDX-License-Identifier: AGPL-3.0-or-later
const escape = (value) => String(value ?? 'unavailable').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fileName = (path) => String(path).split(/[\\/]/).at(-1);
const number = (value) => Number.isFinite(value) ? value.toFixed(2) : 'unavailable';
const settings = (report, row) => ({
  seed: report.seed, flock: report.flockSize, tick: report.sampleTick,
  viewport: row.viewport, dpr: row.deviceScaleFactor, camera: row.camera,
  cameraVerification: row.cameraVerification ?? 'legacy-unspecified',
  backend: row.backend, requestedBackend: row.requestedBackend,
  quality: row.quality?.requested, tier: row.quality?.tier, canvas: row.canvas,
  emulation: row.emulation, seconds: row.runtime?.seconds,
  frameBudget: row.runtime?.frameBudgetMs, bootBudget: row.boot?.budgetMs,
});

export function compareReports(baseline, candidate) {
  const names = new Set([...baseline.results, ...candidate.results].map((row) => row.name));
  return [...names].map((name) => {
    const before = baseline.results.find((row) => row.name === name);
    const after = candidate.results.find((row) => row.name === name);
    const reasons = [];
    if (!before || !after) reasons.push('Scenario missing from one run');
    else if (before.error || after.error) reasons.push('Scenario failed to capture');
    else {
      if (before.checks?.cameraVerified === false || after.checks?.cameraVerified === false
        || before.quality?.tier === 'unverified' || after.quality?.tier === 'unverified') reasons.push('Camera or quality not verified');
      const a = settings(baseline, before);
      const b = settings(candidate, after);
      for (const key of Object.keys(a)) {
        if (a[key] === undefined || b[key] === undefined || JSON.stringify(a[key]) !== JSON.stringify(b[key])) reasons.push(`Different or missing ${key}`);
      }
    }
    if (!baseline.build?.stableDuringProbe || !candidate.build?.stableDuringProbe) reasons.push('Build changed or stability not recorded');
    return { name, comparable: reasons.length === 0, reasons,
      p95DeltaMs: reasons.length === 0 ? (after.runtime.frameTimes.p95 - before.runtime.frameTimes.p95) : null };
  });
}

function picture(row, label, baseline = false) {
  if (!row?.screenshot) return '<p>No capture available.</p>';
  const src = `${baseline ? `../${encodeURIComponent(label)}/` : ''}${encodeURIComponent(fileName(row.screenshot))}`;
  return `<a href="${src}"><img src="${src}" alt="${escape(row.name)} ${baseline ? 'baseline' : 'candidate'}"></a>`;
}

function metrics(row) {
  if (!row) return '<p>Scenario missing.</p>';
  if (row.error) return `<pre class="fail">${escape(row.error)}</pre>`;
  const failures = Object.entries(row.checks ?? {}).filter(([, pass]) => pass !== true).map(([key]) => key);
  return `<p class="${row.pass ? 'pass' : 'fail'}">${row.pass ? 'Measured gates passed' : `FAILED: ${escape(failures.join(', ') || 'missing gate evidence')}`}</p>${row.note ? `<p>${escape(row.note)}</p>` : ''}
  <p>${escape(row.backend)} / ${escape(row.quality?.tier)} / ${escape(row.camera)} / ${escape(row.canvas?.bufferWidth)} × ${escape(row.canvas?.bufferHeight)}</p>
  <table><tr><th>Boot ms</th><th>Frame p50 / p95 / p99 ms</th><th>Worst gap ms</th><th>Draw max</th><th>Triangles max</th></tr>
  <tr><td>${number(row.boot?.interactiveMs)}</td><td>${number(row.runtime?.frameTimes?.p50)} / ${number(row.runtime?.frameTimes?.p95)} / ${number(row.runtime?.frameTimes?.p99)}</td><td>${number(row.runtime?.frameTimes?.max)}</td><td>${number(row.runtime?.drawCalls?.max)}</td><td>${number(row.runtime?.triangles?.max)}</td></tr></table>`;
}

export function renderArtReview(report, baseline, review, sources) {
  const rows = [...new Set([...(baseline?.results ?? []), ...report.results].map((row) => row.name))];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Art review ${escape(review.label)}</title>
  <style>body{font:16px system-ui;background:#18231f;color:#eee;margin:24px;line-height:1.5}main{max-width:1600px;margin:auto}h1,h2{font-weight:600}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}img{width:100%;height:auto}section{border-top:1px solid #617469;margin-top:28px;padding-top:16px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;border:1px solid #617469;padding:7px}.fail{color:#ffb7a1}.pass{color:#b5e8bc}a{color:#d0e4f0}pre{white-space:pre-wrap;overflow-wrap:anywhere}.strip{display:flex;gap:8px}.strip a{width:33%}code{overflow-wrap:anywhere}</style><main>
  <h1>Art review: ${escape(review.label)}</h1>
  <p>Art verdict: <strong>${escape(review.artVerdict)}</strong>. Physical mobile: <strong>${escape(review.physicalMobile)}</strong>.</p>
  <p>${escape(review.note)}</p><p>${review.duration < 60 ? 'SHORT ITERATION RUN: does not satisfy the 60-second performance gate.' : '60-second measurement duration met; hardware and art acceptance remain separate.'}</p>
  <p class="${review.releaseExit || review.profileExit || !review.sourceStable ? 'fail' : 'pass'}">Release probe exit: ${escape(review.releaseExit)}. Profile exit: ${escape(review.profileExit)}. Sources stable: ${escape(review.sourceStable)}. Build stable: ${escape(report.build?.stableDuringProbe)}.</p>
  <p>Source HEAD: <code>${escape(report.source?.gitHead)}</code>. This may include uncommitted changes; inspect source and build hashes in the JSON receipts.</p>
  <p><a href="report.json">Runtime receipt</a> · <a href="review.json">Review receipt</a> · <a href="sources.json">Source hashes</a></p>
  ${rows.map((name) => {
    const row = report.results.find((item) => item.name === name);
    const old = baseline?.results.find((item) => item.name === name);
    const comparison = review.comparison.find((item) => item.name === name);
    return `<section><h2>${escape(name)}</h2>${comparison ? `<p class="${comparison.comparable ? 'pass' : 'fail'}">${comparison.comparable ? `Comparable settings; p95 delta ${number(comparison.p95DeltaMs)} ms (positive is slower).` : `NOT COMPARABLE: ${escape(comparison.reasons.join('; '))}`}</p>` : ''}<div class="pair">${baseline ? `<div><h3>Baseline: ${escape(baseline.label)}</h3>${picture(old, baseline.label, true)}${metrics(old)}</div>` : ''}<div><h3>Candidate</h3>${picture(row, report.label)}${metrics(row)}</div></div>${row?.motionScreenshots?.length ? `<details><summary>Motion samples (not continuous video)</summary><div class="strip">${row.motionScreenshots.map((path) => picture({ ...row, screenshot: path }, report.label)).join('')}</div></details>` : ''}</section>`;
  }).join('')}
  <section><h2>Editable sources</h2>${sources.map((system) => `<h3>${escape(system.system)}</h3><p>${escape(system.intent)}</p><ul>${system.files.map((file) => `<li><code>${escape(file.file)}</code> (${escape(file.bytes)} bytes), SHA-256 <code>${escape(file.sha256)}</code></li>`).join('')}</ul>`).join('')}</section></main></html>`;
}
