import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { OrquestraArtifact } from "../../types/artifact";
import { OrquestraReporter, type ReporterContext } from "./orquestra-reporter";

export interface OrquestraHtmlReporterOptions {
	outputDir?: string;
}

const DEFAULT_SUBDIR = "report";

export class OrquestraHtmlReporter extends OrquestraReporter {
	private readonly customOutputDir?: string;

	constructor(options: OrquestraHtmlReporterOptions = {}) {
		super();
		this.customOutputDir = options.outputDir;
	}

	run(artifact: OrquestraArtifact, ctx?: ReporterContext): void {
		const dir = this.resolveDir(ctx);

		mkdirSync(dir, { recursive: true });
		mkdirSync(join(dir, "assets"), { recursive: true });

		writeFileSync(join(dir, "index.html"), renderHtml(artifact));
		writeFileSync(join(dir, "assets", "styles.css"), stylesCss());
		writeFileSync(join(dir, "assets", "app.js"), appJs());
		writeFileSync(join(dir, "assets", "artifact.js"), `window.__ORQUESTRA_ARTIFACT__ = ${JSON.stringify(artifact)};`);

		console.log(`[orquestra] HTML report: ${join(dir, "index.html")}`);
	}

	private resolveDir(ctx?: ReporterContext): string {
		if (this.customOutputDir) {
			if (isAbsolute(this.customOutputDir)) return this.customOutputDir;
			const base = ctx?.outputDir ?? process.cwd();
			return resolve(base, this.customOutputDir);
		}
		if (ctx?.outputDir) return join(ctx.outputDir, DEFAULT_SUBDIR);
		return resolve(process.cwd(), DEFAULT_SUBDIR);
	}
}

function renderHtml(artifact: OrquestraArtifact): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Orquestra Report</title>
<link rel="stylesheet" href="./assets/styles.css">
</head>
<body>
<header class="header">
  <div class="container header-inner">
    <div class="header-left">
      <h1>Orquestra</h1>
      <span class="run-meta">${escapeHtml(formatDate(artifact.generatedAt))}</span>
    </div>
    <div class="summary">
      <span class="stat stat-passed">${artifact.summary.passed} passed</span>
      <span class="stat stat-failed">${artifact.summary.failed} failed</span>
      <span class="stat stat-pending">${artifact.summary.pending} pending</span>
      <span class="stat-sep"></span>
      <span class="stat-muted">${artifact.summary.totalFeatures} features · ${artifact.summary.totalScenarios} scenarios</span>
    </div>
  </div>
</header>

<nav class="tabs">
  <div class="container tabs-inner">
    <button class="tab active" data-tab="suites">Suites</button>
    <button class="tab" data-tab="personas">Personas</button>
    <button class="tab" data-tab="glossary">Glossary</button>
  </div>
</nav>

<main>
  <div class="container" id="content"></div>
</main>

<script src="./assets/artifact.js"></script>
<script src="./assets/app.js"></script>
</body>
</html>`;
}

function formatDate(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleString();
	} catch {
		return iso;
	}
}

function stylesCss(): string {
	return `:root {
  --bg: #ffffff;
  --bg-subtle: #fafbfc;
  --border: #e5e7eb;
  --border-subtle: #f0f1f3;
  --text: #1f2328;
  --text-muted: #656d76;
  --text-faint: #9ca3af;
  --accent: #0969da;
  --success: #1a7f37;
  --success-bg: #dafbe1;
  --danger: #cf222e;
  --danger-bg: #ffebe9;
  --pending: #9a6700;
  --pending-bg: #fff8c5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --bg-subtle: #161b22;
    --border: #30363d;
    --border-subtle: #21262d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --text-faint: #6e7681;
    --accent: #2f81f7;
    --success: #3fb950;
    --success-bg: #0d3b1a;
    --danger: #f85149;
    --danger-bg: #3c0c0c;
    --pending: #d29922;
    --pending-bg: #3a2c05;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 32px;
  width: 100%;
}

.header {
  border-bottom: 1px solid var(--border);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  padding-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header h1 {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.run-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.summary {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stat::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.stat-passed::before { background: var(--success); }
.stat-failed::before { background: var(--danger); }
.stat-pending::before { background: var(--pending); }
.stat-passed { color: var(--success); }
.stat-failed { color: var(--danger); }
.stat-pending { color: var(--pending); }

.stat-sep {
  width: 1px;
  height: 14px;
  background: var(--border);
}

.stat-muted {
  color: var(--text-muted);
}

.tabs {
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.tabs-inner {
  display: flex;
  gap: 0;
}

.tab {
  padding: 10px 16px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

main {
  padding: 24px 0 80px;
}

.domain-group {
  margin-bottom: 24px;
}

.domain-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 0;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border-subtle);
}

.domain-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.domain-count {
  font-size: 11px;
  color: var(--text-faint);
}

.domain-context {
  margin: 6px 0 12px 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  padding-left: 10px;
  border-left: 2px solid var(--border);
}

.feature {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--bg);
}

.feature-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.feature-summary::-webkit-details-marker { display: none; }

.feature-summary::before {
  content: "▸";
  font-size: 10px;
  color: var(--text-faint);
  width: 10px;
  transition: transform 0.15s;
}

details[open] > .feature-summary::before {
  transform: rotate(90deg);
}

.feature-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.feature-status-dot.success { background: var(--success); }
.feature-status-dot.failed { background: var(--danger); }
.feature-status-dot.pending { background: var(--pending); }

.feature-name {
  font-weight: 500;
  flex: 1;
}

.feature-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.feature-body {
  padding: 4px 12px 12px 34px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
}

.feature-story {
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.feature-story .label {
  color: var(--text-faint);
  font-weight: 600;
  margin-right: 4px;
}

.feature-context {
  padding: 8px 10px;
  margin: 6px 0;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  border-left: 2px solid var(--border);
  line-height: 1.5;
}

.scenarios {
  margin-top: 6px;
}

.scenario {
  border-top: 1px solid var(--border-subtle);
}

.scenario:first-child {
  border-top: none;
}

.scenario-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
  user-select: none;
  list-style: none;
  font-size: 13px;
}

.scenario-summary::-webkit-details-marker { display: none; }

.scenario-summary::before {
  content: "▸";
  font-size: 9px;
  color: var(--text-faint);
  width: 9px;
  transition: transform 0.15s;
}

details[open] > .scenario-summary::before {
  transform: rotate(90deg);
}

.scenario-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.scenario-status.success { background: var(--success); }
.scenario-status.failed { background: var(--danger); }
.scenario-status.pending { background: var(--pending); }

.scenario-name {
  flex: 1;
}

.scenario-stats {
  font-size: 11px;
  color: var(--text-faint);
}

.steps {
  padding: 4px 0 8px 24px;
  font-size: 13px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
  font-family: "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 12px;
}

.step-symbol {
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}

.step.success .step-symbol { color: var(--success); }
.step.failed .step-symbol { color: var(--danger); }
.step.pending .step-symbol { color: var(--pending); }

.step-keyword {
  color: var(--text-faint);
  font-weight: 600;
  min-width: 44px;
}

.step-name {
  color: var(--text);
  flex: 1;
}

.step-duration {
  color: var(--text-faint);
  font-size: 11px;
}

.step-error {
  display: block;
  margin: 4px 0 8px 44px;
  padding: 8px 10px;
  background: var(--danger-bg);
  color: var(--danger);
  border-radius: 4px;
  font-size: 12px;
  font-family: "SF Mono", ui-monospace, Menlo, monospace;
  white-space: pre-wrap;
}

.empty-state {
  padding: 48px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.persona, .glossary-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 16px;
  margin-bottom: 8px;
  background: var(--bg);
}

.persona-name, .glossary-term {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
}

.persona-features {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.persona-features li {
  font-size: 12px;
  padding: 3px 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
}

.glossary-def {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

.controls {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.control-btn {
  padding: 5px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}

.control-btn:hover {
  color: var(--text);
  border-color: var(--text-faint);
}
`;
}

function appJs(): string {
	return `(function () {
  const data = window.__ORQUESTRA_ARTIFACT__;
  const content = document.getElementById("content");
  const tabs = document.querySelectorAll(".tab");

  const views = {
    suites: renderSuites,
    personas: renderPersonas,
    glossary: renderGlossary,
  };

  function setActiveTab(name) {
    tabs.forEach((t) => {
      if (t.getAttribute("data-tab") === name) t.classList.add("active");
      else t.classList.remove("active");
    });
    content.innerHTML = views[name](data);
    attachControlHandlers();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.getAttribute("data-tab")));
  });

  setActiveTab("suites");

  function attachControlHandlers() {
    const expandBtn = document.querySelector('[data-action="expand-all"]');
    const collapseBtn = document.querySelector('[data-action="collapse-all"]');
    if (expandBtn) {
      expandBtn.addEventListener("click", () => {
        content.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
      });
    }
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => {
        content.querySelectorAll("details").forEach((d) => d.removeAttribute("open"));
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function symbolFor(status) {
    return status === "success" ? "✓" : status === "failed" ? "✗" : "○";
  }

  function groupByDomain(features) {
    const groups = new Map();
    for (const f of features) {
      const key = f.domain || "__none__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    return groups;
  }

  function renderSuites(d) {
    if (d.features.length === 0) {
      return '<div class="empty-state">No features yet.</div>';
    }

    const controls =
      '<div class="controls">' +
      '<button class="control-btn" data-action="expand-all">Expand all</button>' +
      '<button class="control-btn" data-action="collapse-all">Collapse all</button>' +
      '</div>';

    const groups = groupByDomain(d.features);
    const declaredDomains = d.domains || [];
    const domainContextMap = new Map(declaredDomains.map((x) => [x.name, x.context]));

    const orderedKeys = [];
    for (const dom of declaredDomains) {
      if (groups.has(dom.name)) orderedKeys.push(dom.name);
    }
    for (const key of groups.keys()) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }

    const sections = orderedKeys.map((key) => {
      const features = groups.get(key);
      const isNone = key === "__none__";
      const title = isNone ? "No domain" : key;
      const context = isNone ? null : domainContextMap.get(key);

      return (
        '<section class="domain-group">' +
        '<div class="domain-header">' +
        '<span class="domain-title">' + escapeHtml(title) + '</span>' +
        '<span class="domain-count">' + features.length + ' feature' + (features.length === 1 ? '' : 's') + '</span>' +
        '</div>' +
        (context ? '<div class="domain-context">' + escapeHtml(context) + '</div>' : '') +
        features.map(renderFeature).join("") +
        '</section>'
      );
    }).join("");

    return controls + sections;
  }

  function renderFeature(f) {
    const scenarioCount = f.scenarios.length;
    const passed = f.scenarios.filter((s) => s.status === "success").length;
    const metaLabel = passed + '/' + scenarioCount + ' · ' + f.as;

    return (
      '<details class="feature">' +
      '<summary class="feature-summary">' +
      '<span class="feature-status-dot ' + f.status + '"></span>' +
      '<span class="feature-name">' + escapeHtml(f.name) + '</span>' +
      '<span class="feature-meta">' + escapeHtml(metaLabel) + '</span>' +
      '</summary>' +
      '<div class="feature-body">' +
      '<div class="feature-story">' +
      '<span class="label">As</span>' + escapeHtml(f.as) + ' · ' +
      '<span class="label">I</span>' + escapeHtml(f.I) + ' · ' +
      '<span class="label">so that</span>' + escapeHtml(f.so) +
      '</div>' +
      (f.context ? '<div class="feature-context">' + escapeHtml(f.context) + '</div>' : '') +
      '<div class="scenarios">' +
      f.scenarios.map(renderScenario).join("") +
      '</div>' +
      '</div>' +
      '</details>'
    );
  }

  function renderScenario(s) {
    const stepsCount = s.steps.length;
    return (
      '<details class="scenario">' +
      '<summary class="scenario-summary">' +
      '<span class="scenario-status ' + s.status + '"></span>' +
      '<span class="scenario-name">' + escapeHtml(s.name) + '</span>' +
      '<span class="scenario-stats">' + stepsCount + ' step' + (stepsCount === 1 ? '' : 's') + '</span>' +
      '</summary>' +
      '<div class="steps">' +
      s.steps.map(renderStep).join("") +
      '</div>' +
      '</details>'
    );
  }

  function renderStep(st) {
    const durationPart = st.durationMs != null ? '<span class="step-duration">' + st.durationMs + 'ms</span>' : '';
    const errorPart = st.error && st.error.message ? '<div class="step-error">' + escapeHtml(st.error.message) + '</div>' : '';
    return (
      '<div class="step ' + st.status + '">' +
      '<span class="step-symbol">' + symbolFor(st.status) + '</span>' +
      '<span class="step-keyword">' + st.keyword + '</span>' +
      '<span class="step-name">' + escapeHtml(st.name) + '</span>' +
      durationPart +
      '</div>' +
      errorPart
    );
  }

  function renderPersonas(d) {
    if (d.personas.length === 0) return '<div class="empty-state">No personas.</div>';
    return d.personas.map((p) =>
      '<div class="persona">' +
      '<div class="persona-name">' + escapeHtml(p.name) + '</div>' +
      '<ul class="persona-features">' + p.features.map((f) => '<li>' + escapeHtml(f) + '</li>').join("") + '</ul>' +
      '</div>'
    ).join("");
  }

  function renderGlossary(d) {
    const entries = Object.entries(d.glossary || {});
    if (entries.length === 0) return '<div class="empty-state">No glossary terms.</div>';
    return entries.map(([term, def]) =>
      '<div class="glossary-item">' +
      '<div class="glossary-term">' + escapeHtml(term) + '</div>' +
      '<div class="glossary-def">' + escapeHtml(def) + '</div>' +
      '</div>'
    ).join("");
  }
})();`;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
