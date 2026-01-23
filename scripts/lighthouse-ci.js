#!/usr/bin/env node

/**
 * Lighthouse CI Report Generator
 * Runs Lighthouse audits and generates reports
 */

const fs = require('fs')
const path = require('path')

// Dynamic import for ES modules
let lighthouse, chromeLauncher

async function loadLighthouse() {
  if (!lighthouse) {
    const lhModule = await import('lighthouse')
    lighthouse = lhModule.default || lhModule
    const chromeModule = await import('chrome-launcher')
    chromeLauncher = chromeModule.default || chromeModule
  }
  return { lighthouse, chromeLauncher }
}

const REPORT_DIR = path.join(process.cwd(), 'lighthouse-reports')
const URLS = [
  { name: 'home', url: 'http://localhost:3000' },
  { name: 'playground', url: 'http://localhost:3000/playground' },
]

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
}

async function runLighthouse(url, name) {
  console.log(`\n🔍 Running Lighthouse audit for ${name}...`)
  console.log(`   URL: ${url}`)

  const { lighthouse: lh, chromeLauncher: chromeLauncherModule } = await loadLighthouse()

  const chrome = await chromeLauncherModule.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  })

  try {
    const options = {
      logLevel: 'info',
      output: 'html',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
    }

    const runnerResult = await lh(url, options)

    // Save HTML report
    const htmlReportPath = path.join(REPORT_DIR, `${name}-report.html`)
    fs.writeFileSync(htmlReportPath, runnerResult.report)
    console.log(`   ✅ HTML report saved: ${htmlReportPath}`)

    // Save JSON report
    const jsonReportPath = path.join(REPORT_DIR, `${name}-report.json`)
    fs.writeFileSync(jsonReportPath, JSON.stringify(runnerResult.lhr, null, 2))
    console.log(`   ✅ JSON report saved: ${jsonReportPath}`)

    // Extract scores
    const scores = {
      performance: Math.round(runnerResult.lhr.categories.performance.score * 100),
      accessibility: Math.round(runnerResult.lhr.categories.accessibility.score * 100),
      'best-practices': Math.round(runnerResult.lhr.categories['best-practices'].score * 100),
      seo: Math.round(runnerResult.lhr.categories.seo.score * 100),
    }

    // Extract metrics
    const metrics = {
      fcp: Math.round(runnerResult.lhr.audits['first-contentful-paint'].numericValue),
      lcp: Math.round(runnerResult.lhr.audits['largest-contentful-paint'].numericValue),
      cls: runnerResult.lhr.audits['cumulative-layout-shift'].numericValue.toFixed(3),
      tbt: Math.round(runnerResult.lhr.audits['total-blocking-time'].numericValue),
      tti: Math.round(runnerResult.lhr.audits['interactive'].numericValue),
      speedIndex: Math.round(runnerResult.lhr.audits['speed-index'].numericValue),
    }

    return { name, url, scores, metrics }
  } finally {
    await chrome.kill()
  }
}

async function generateReport() {
  console.log('🚀 Starting Lighthouse CI Report Generation\n')
  console.log('⚠️  Make sure the Next.js server is running on http://localhost:3000')
  console.log('   Run: npm run build && npm start\n')

  const results = []

  for (const { name, url } of URLS) {
    try {
      const result = await runLighthouse(url, name)
      results.push(result)
    } catch (error) {
      console.error(`   ❌ Error auditing ${name}:`, error.message)
      results.push({ name, url, error: error.message })
    }
  }

  // Generate summary report
  const summaryPath = path.join(REPORT_DIR, 'summary.md')
  const summary = generateSummary(results)
  fs.writeFileSync(summaryPath, summary)
  console.log(`\n✅ Summary report saved: ${summaryPath}`)

  console.log('\n' + '='.repeat(80))
  console.log('📊 LIGHTHOUSE CI REPORT SUMMARY')
  console.log('='.repeat(80))
  console.log(summary)
  console.log('='.repeat(80) + '\n')

  return results
}

function generateSummary(results) {
  let summary = '# Lighthouse CI Report\n\n'
  summary += `**Generated:** ${new Date().toISOString()}\n\n`
  summary += '---\n\n'

  for (const result of results) {
    if (result.error) {
      summary += `## ${result.name.toUpperCase()} - ERROR\n\n`
      summary += `**Error:** ${result.error}\n\n`
      continue
    }

    summary += `## ${result.name.toUpperCase()}\n\n`
    summary += `**URL:** ${result.url}\n\n`

    summary += '### Scores\n\n'
    summary += '| Category | Score | Status |\n'
    summary += '|----------|-------|--------|\n'
    summary += `| Performance | ${result.scores.performance}/100 | ${getStatus(result.scores.performance, 80)} |\n`
    summary += `| Accessibility | ${result.scores.accessibility}/100 | ${getStatus(result.scores.accessibility, 90)} |\n`
    summary += `| Best Practices | ${result.scores['best-practices']}/100 | ${getStatus(result.scores['best-practices'], 85)} |\n`
    summary += `| SEO | ${result.scores.seo}/100 | ${getStatus(result.scores.seo, 80)} |\n\n`

    summary += '### Core Web Vitals\n\n'
    summary += '| Metric | Value | Target | Status |\n'
    summary += '|--------|-------|--------|--------|\n'
    summary += `| First Contentful Paint (FCP) | ${result.metrics.fcp}ms | < 2000ms | ${getMetricStatus(result.metrics.fcp, 2000)} |\n`
    summary += `| Largest Contentful Paint (LCP) | ${result.metrics.lcp}ms | < 2500ms | ${getMetricStatus(result.metrics.lcp, 2500)} |\n`
    summary += `| Cumulative Layout Shift (CLS) | ${result.metrics.cls} | < 0.1 | ${getMetricStatus(parseFloat(result.metrics.cls), 0.1, true)} |\n`
    summary += `| Total Blocking Time (TBT) | ${result.metrics.tbt}ms | < 300ms | ${getMetricStatus(result.metrics.tbt, 300)} |\n`
    summary += `| Time to Interactive (TTI) | ${result.metrics.tti}ms | < 3800ms | ${getMetricStatus(result.metrics.tti, 3800)} |\n`
    summary += `| Speed Index | ${result.metrics.speedIndex}ms | < 3400ms | ${getMetricStatus(result.metrics.speedIndex, 3400)} |\n\n`

    summary += '---\n\n'
  }

  // Overall summary
  const avgPerformance = results
    .filter(r => r.scores)
    .reduce((sum, r) => sum + r.scores.performance, 0) / results.filter(r => r.scores).length

  const avgAccessibility = results
    .filter(r => r.scores)
    .reduce((sum, r) => sum + r.scores.accessibility, 0) / results.filter(r => r.scores).length

  summary += '## Overall Summary\n\n'
  summary += `| Metric | Average Score |\n`
  summary += `|--------|---------------|\n`
  summary += `| Performance | ${Math.round(avgPerformance)}/100 |\n`
  summary += `| Accessibility | ${Math.round(avgAccessibility)}/100 |\n\n`

  return summary
}

function getStatus(score, threshold) {
  if (score >= threshold) return '🟢 Pass'
  if (score >= threshold - 10) return '🟡 Warning'
  return '🔴 Fail'
}

function getMetricStatus(value, target, lowerIsBetter = false) {
  if (lowerIsBetter) {
    if (value <= target) return '🟢 Pass'
    if (value <= target * 1.5) return '🟡 Warning'
    return '🔴 Fail'
  } else {
    if (value >= target) return '🟢 Pass'
    if (value >= target * 0.8) return '🟡 Warning'
    return '🔴 Fail'
  }
}

// Run if called directly
if (require.main === module) {
  generateReport()
    .then(() => {
      console.log('✅ Lighthouse CI report generation complete!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error generating Lighthouse CI report:', error)
      process.exit(1)
    })
}

module.exports = { generateReport, runLighthouse }
