#!/bin/bash

# Lighthouse CI Report Script
# Generates Lighthouse reports for the application

set -e

REPORT_DIR="./lighthouse-reports"
mkdir -p "$REPORT_DIR"

echo "🚀 Starting Lighthouse CI Report Generation"
echo ""
echo "⚠️  Make sure the Next.js server is running on http://localhost:3000"
echo "   Run: npm run build && npm start"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "❌ Server is not running on http://localhost:3000"
  echo "   Please start the server first: npm start"
  exit 1
fi

echo "✅ Server is running"
echo ""

# Run Lighthouse for home page
echo "🔍 Running Lighthouse audit for home page..."
npx lighthouse http://localhost:3000 \
  --output=html,json \
  --output-path="$REPORT_DIR/home" \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox" \
  --quiet

echo "   ✅ Home page report saved"
echo ""

# Run Lighthouse for playground
echo "🔍 Running Lighthouse audit for playground..."
npx lighthouse http://localhost:3000/playground \
  --output=html,json \
  --output-path="$REPORT_DIR/playground" \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox" \
  --quiet

echo "   ✅ Playground report saved"
echo ""

# Generate summary
echo "📊 Generating summary report..."
node -e "
const fs = require('fs');
const path = require('path');

const reportDir = './lighthouse-reports';
const reports = ['home', 'playground'];
const results = [];

for (const name of reports) {
  try {
    const jsonPath = path.join(reportDir, \`\${name}.report.json\`);
    if (!fs.existsSync(jsonPath)) {
      results.push({ name, error: 'Report not found' });
      continue;
    }
    
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const categories = data.categories;
    const audits = data.audits;
    
    results.push({
      name,
      scores: {
        performance: Math.round(categories.performance.score * 100),
        accessibility: Math.round(categories.accessibility.score * 100),
        'best-practices': Math.round(categories['best-practices'].score * 100),
        seo: Math.round(categories.seo.score * 100),
      },
      metrics: {
        fcp: Math.round(audits['first-contentful-paint'].numericValue),
        lcp: Math.round(audits['largest-contentful-paint'].numericValue),
        cls: audits['cumulative-layout-shift'].numericValue.toFixed(3),
        tbt: Math.round(audits['total-blocking-time'].numericValue),
        tti: Math.round(audits['interactive'].numericValue),
        speedIndex: Math.round(audits['speed-index'].numericValue),
      }
    });
  } catch (error) {
    results.push({ name, error: error.message });
  }
}

let summary = '# Lighthouse CI Report\\n\\n';
summary += \`**Generated:** \${new Date().toISOString()}\\n\\n\`;
summary += '---\\n\\n';

for (const result of results) {
  if (result.error) {
    summary += \`## \${result.name.toUpperCase()} - ERROR\\n\\n\`;
    summary += \`**Error:** \${result.error}\\n\\n\`;
    continue;
  }

  summary += \`## \${result.name.toUpperCase()}\\n\\n\`;
  summary += '### Scores\\n\\n';
  summary += '| Category | Score | Status |\\n';
  summary += '|----------|-------|--------|\\n';
  summary += \`| Performance | \${result.scores.performance}/100 | \${result.scores.performance >= 80 ? '🟢 Pass' : result.scores.performance >= 70 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Accessibility | \${result.scores.accessibility}/100 | \${result.scores.accessibility >= 90 ? '🟢 Pass' : result.scores.accessibility >= 80 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Best Practices | \${result.scores['best-practices']}/100 | \${result.scores['best-practices'] >= 85 ? '🟢 Pass' : result.scores['best-practices'] >= 75 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| SEO | \${result.scores.seo}/100 | \${result.scores.seo >= 80 ? '🟢 Pass' : result.scores.seo >= 70 ? '🟡 Warning' : '🔴 Fail'} |\\n\\n\`;

  summary += '### Core Web Vitals\\n\\n';
  summary += '| Metric | Value | Target | Status |\\n';
  summary += '|--------|-------|--------|--------|\\n';
  summary += \`| First Contentful Paint (FCP) | \${result.metrics.fcp}ms | < 2000ms | \${result.metrics.fcp <= 2000 ? '🟢 Pass' : result.metrics.fcp <= 3000 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Largest Contentful Paint (LCP) | \${result.metrics.lcp}ms | < 2500ms | \${result.metrics.lcp <= 2500 ? '🟢 Pass' : result.metrics.lcp <= 4000 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Cumulative Layout Shift (CLS) | \${result.metrics.cls} | < 0.1 | \${parseFloat(result.metrics.cls) <= 0.1 ? '🟢 Pass' : parseFloat(result.metrics.cls) <= 0.25 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Total Blocking Time (TBT) | \${result.metrics.tbt}ms | < 300ms | \${result.metrics.tbt <= 300 ? '🟢 Pass' : result.metrics.tbt <= 600 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Time to Interactive (TTI) | \${result.metrics.tti}ms | < 3800ms | \${result.metrics.tti <= 3800 ? '🟢 Pass' : result.metrics.tti <= 7300 ? '🟡 Warning' : '🔴 Fail'} |\\n\`;
  summary += \`| Speed Index | \${result.metrics.speedIndex}ms | < 3400ms | \${result.metrics.speedIndex <= 3400 ? '🟢 Pass' : result.metrics.speedIndex <= 5800 ? '🟡 Warning' : '🔴 Fail'} |\\n\\n\`;
  summary += '---\\n\\n';
}

const avgPerf = results.filter(r => r.scores).reduce((sum, r) => sum + r.scores.performance, 0) / results.filter(r => r.scores).length;
const avgA11y = results.filter(r => r.scores).reduce((sum, r) => sum + r.scores.accessibility, 0) / results.filter(r => r.scores).length;

summary += '## Overall Summary\\n\\n';
summary += '| Metric | Average Score |\\n';
summary += '|--------|---------------|\\n';
summary += \`| Performance | \${Math.round(avgPerf)}/100 |\\n\`;
summary += \`| Accessibility | \${Math.round(avgA11y)}/100 |\\n\\n\`;

fs.writeFileSync(path.join(reportDir, 'summary.md'), summary);
console.log(summary);
"

echo ""
echo "✅ Lighthouse CI report generation complete!"
echo ""
echo "📁 Reports saved in: $REPORT_DIR"
echo "   - home.report.html"
echo "   - home.report.json"
echo "   - playground.report.html"
echo "   - playground.report.json"
echo "   - summary.md"
echo ""
