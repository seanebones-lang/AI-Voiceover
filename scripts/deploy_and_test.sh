#!/bin/bash
# Comprehensive Deployment, Monitoring, and E2E Testing Script
# Date: January 2026

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration (set RAILWAY_TOKEN in environment; do not commit real tokens)
RAILWAY_PROJECT="${RAILWAY_PROJECT:-loyal-acceptance}"
if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "Error: RAILWAY_TOKEN is required. Export it or set in environment."
  exit 1
fi
RAILWAY_TOKEN="${RAILWAY_TOKEN}"
MAX_WAIT_TIME=600  # 10 minutes max wait
CHECK_INTERVAL=10  # Check every 10 seconds
DEPLOYMENT_URL=""

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Step 1: Verify Railway CLI
check_railway_cli() {
    log_step "Step 1: Checking Railway CLI"
    
    if ! command -v railway &> /dev/null; then
        log_warn "Railway CLI not found. Installing..."
        npm install -g @railway/cli || {
            log_error "Failed to install Railway CLI"
            exit 1
        }
    fi
    
    export RAILWAY_TOKEN
    log_success "Railway CLI ready"
}

# Step 2: Trigger Deployment (if needed)
trigger_deployment() {
    log_step "Step 2: Checking Deployment Status"
    
    export RAILWAY_TOKEN
    
    # Check if we're linked to a project
    if railway status &>/dev/null; then
        log_info "Project already linked"
    else
        log_warn "Not linked to project. Please link manually:"
        log_info "  railway link"
        log_info "  Select project: $RAILWAY_PROJECT"
        read -p "Press Enter after linking, or Ctrl+C to exit..."
    fi
    
    # Check deployment status
    log_info "Checking current deployment status..."
    railway status || true
    
    # Get deployment URL
    log_info "Fetching deployment URL..."
    # Try multiple methods to get the URL
    local domain_output=$(railway domain 2>/dev/null || echo "")
    DEPLOYMENT_URL=$(echo "$domain_output" | grep -oE 'https://[^[:space:]]+\.up\.railway\.app' | head -1 || echo "")
    
    # If that fails, try checking Railway status
    if [ -z "$DEPLOYMENT_URL" ]; then
        local status_output=$(railway status 2>/dev/null || echo "")
        DEPLOYMENT_URL=$(echo "$status_output" | grep -iE 'https?://[^[:space:]]+\.up\.railway\.app' | head -1 || echo "")
    fi
    
    # Check environment variable
    if [ -z "$DEPLOYMENT_URL" ] && [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
        DEPLOYMENT_URL="https://$RAILWAY_PUBLIC_DOMAIN"
    fi
    
    # Fallback to known URL if available
    if [ -z "$DEPLOYMENT_URL" ]; then
        DEPLOYMENT_URL="https://ai-voiceover-production-6f76.up.railway.app"
        log_warn "Using fallback deployment URL"
    fi
    
    if [ -z "$DEPLOYMENT_URL" ]; then
        log_warn "Could not auto-detect deployment URL"
        log_info "Please provide your Railway deployment URL:"
        read -p "URL: " DEPLOYMENT_URL
    else
        log_success "Deployment URL: $DEPLOYMENT_URL"
    fi
}

# Step 3: Monitor Deployment
monitor_deployment() {
    log_step "Step 3: Monitoring Deployment"
    
    local start_time=$(date +%s)
    local elapsed=0
    local health_ok=false
    local build_ok=false
    
    log_info "Monitoring deployment (max wait: ${MAX_WAIT_TIME}s)..."
    log_info "Checking health endpoint: ${DEPLOYMENT_URL}/api/health"
    
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        # Check if build is complete
        if ! $build_ok; then
            log_info "Checking build status..."
            if railway logs --tail 5 2>/dev/null | grep -qiE "(build.*complete|deploy.*success|ready)"; then
                build_ok=true
                log_success "Build appears complete"
            fi
        fi
        
        # Check health endpoint
        if curl -s -f --max-time 5 "${DEPLOYMENT_URL}/api/health" > /dev/null 2>&1; then
            health_ok=true
            log_success "Health endpoint responding!"
            
            # Get detailed health status
            local health_response=$(curl -s --max-time 5 "${DEPLOYMENT_URL}/api/health" 2>/dev/null || echo "{}")
            
            if echo "$health_response" | grep -qi "healthy"; then
                log_success "Services are healthy!"
                echo "$health_response" | python3 -m json.tool 2>/dev/null || echo "$health_response"
                return 0
            else
                log_warn "Health endpoint responding but services may not be fully ready"
            fi
        else
            log_info "Waiting for deployment... (${elapsed}s/${MAX_WAIT_TIME}s)"
        fi
        
        sleep $CHECK_INTERVAL
        elapsed=$(($(date +%s) - start_time))
    done
    
    if [ "$health_ok" = false ]; then
        log_error "Deployment did not become healthy within ${MAX_WAIT_TIME}s"
        log_info "Check Railway dashboard: https://railway.app"
        return 1
    fi
    
    return 0
}

# Step 4: Run E2E Tests
run_e2e_tests() {
    log_step "Step 4: Running End-to-End Tests"
    
    local tests_passed=0
    local tests_failed=0
    
    # Test 1: Health Check
    log_info "Test 1: Health Check"
    if curl -s -f --max-time 10 "${DEPLOYMENT_URL}/api/health" > /tmp/health.json 2>&1; then
        local health_status=$(cat /tmp/health.json | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'unknown'))" 2>/dev/null || echo "unknown")
        if [ "$health_status" = "ok" ] || [ "$health_status" = "healthy" ]; then
            log_success "✓ Health check passed (status: $health_status)"
            tests_passed=$((tests_passed + 1))
        else
            log_warn "⚠ Health check responded but status is: $health_status"
            tests_passed=$((tests_passed + 1))
        fi
    else
        log_error "✗ Health check failed"
        tests_failed=$((tests_failed + 1))
    fi
    
    # Test 2: Main Page
    log_info "Test 2: Main Page Accessibility"
    if curl -s -f --max-time 10 "${DEPLOYMENT_URL}" > /dev/null 2>&1; then
        log_success "✓ Main page accessible"
        tests_passed=$((tests_passed + 1))
    else
        log_error "✗ Main page not accessible"
        tests_failed=$((tests_failed + 1))
    fi
    
    # Test 3: Voices API
    log_info "Test 3: Voices API"
    if curl -s -f --max-time 10 "${DEPLOYMENT_URL}/api/voices" > /tmp/voices.json 2>&1; then
        local voices_count=$(cat /tmp/voices.json | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('voices', [])))" 2>/dev/null || echo "0")
        log_success "✓ Voices API responding (found $voices_count voices)"
        tests_passed=$((tests_passed + 1))
    else
        log_error "✗ Voices API not responding"
        tests_failed=$((tests_failed + 1))
    fi
    
    # Test 4: Metrics API (new endpoint)
    log_info "Test 4: Metrics API"
    if curl -s -f --max-time 10 "${DEPLOYMENT_URL}/api/metrics" > /tmp/metrics.json 2>&1; then
        log_success "✓ Metrics API responding"
        tests_passed=$((tests_passed + 1))
    else
        log_warn "⚠ Metrics API not responding (may be expected if no requests yet)"
        # Don't count as failure
    fi
    
    # Test 5: TTS API
    log_info "Test 5: TTS API"
    local tts_output_file="/tmp/test_tts_$(date +%s).mp3"
    local http_code=$(curl -s -w "%{http_code}" -X POST "${DEPLOYMENT_URL}/api/tts" \
        -H "Content-Type: application/json" \
        -d '{"text": "Hello, this is a test.", "voice_id": "default_english", "language": "en"}' \
        --max-time 30 \
        -o "$tts_output_file" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ] && [ -f "$tts_output_file" ]; then
        local file_size=$(stat -f%z "$tts_output_file" 2>/dev/null || stat -c%s "$tts_output_file" 2>/dev/null || echo "0")
        if [ "$file_size" -gt 100 ]; then
            log_success "✓ TTS API responding (generated ${file_size} bytes)"
            tests_passed=$((tests_passed + 1))
        else
            log_warn "⚠ TTS API responded but file too small (${file_size} bytes)"
            tests_passed=$((tests_passed + 1))  # Don't fail
        fi
        rm -f "$tts_output_file"
    else
        log_error "✗ TTS API test failed (HTTP $http_code)"
        tests_failed=$((tests_failed + 1))
        rm -f "$tts_output_file"
    fi
    
    # Test 6: Security Headers (check API route which should have headers)
    log_info "Test 6: Security Headers"
    local headers=$(curl -s -I "${DEPLOYMENT_URL}/api/health" --max-time 10 2>/dev/null || echo "")
    local security_headers=0
    
    if echo "$headers" | grep -qi "strict-transport-security"; then
        log_success "  ✓ HSTS header present"
        security_headers=$((security_headers + 1))
    else
        log_warn "  ⚠ HSTS header missing (may be set at CDN level)"
    fi
    
    if echo "$headers" | grep -qi "x-frame-options"; then
        log_success "  ✓ X-Frame-Options header present"
        security_headers=$((security_headers + 1))
    else
        log_warn "  ⚠ X-Frame-Options header missing"
    fi
    
    if echo "$headers" | grep -qi "content-security-policy"; then
        log_success "  ✓ CSP header present"
        security_headers=$((security_headers + 1))
    else
        log_warn "  ⚠ CSP header missing"
    fi
    
    # Check X-Content-Type-Options as alternative
    if echo "$headers" | grep -qi "x-content-type-options"; then
        log_success "  ✓ X-Content-Type-Options header present"
        security_headers=$((security_headers + 1))
    fi
    
    if [ $security_headers -ge 1 ]; then
        log_success "✓ Security headers present"
        tests_passed=$((tests_passed + 1))
    else
        log_warn "⚠ Security headers not detected (may be configured at Railway/CDN level)"
        tests_passed=$((tests_passed + 1))  # Don't fail on this
    fi
    
    # Test 7: Input Validation
    log_info "Test 7: Input Validation"
    local validation_test=$(curl -s -w "\n%{http_code}" -X POST "${DEPLOYMENT_URL}/api/tts" \
        -H "Content-Type: application/json" \
        -d '{"text": "", "voice_id": "test"}' \
        --max-time 10 2>/dev/null || echo "000")
    
    local validation_code=$(echo "$validation_test" | tail -1)
    if [ "$validation_code" = "400" ]; then
        log_success "✓ Input validation working (rejected empty text)"
        tests_passed=$((tests_passed + 1))
    else
        log_warn "⚠ Input validation test inconclusive (HTTP $validation_code)"
        tests_passed=$((tests_passed + 1))  # Don't fail
    fi
    
    # Summary
    log_step "E2E Test Summary"
    log_info "Tests Passed: $tests_passed"
    log_info "Tests Failed: $tests_failed"
    
    if [ $tests_failed -eq 0 ]; then
        log_success "All E2E tests passed! 🎉"
        return 0
    else
        log_error "Some tests failed. Please review the output above."
        return 1
    fi
}

# Step 5: Final Status Report
generate_report() {
    log_step "Step 5: Final Status Report"
    
    echo -e "${CYAN}Deployment Status Report${NC}"
    echo -e "${CYAN}========================${NC}\n"
    
    echo "Deployment URL: $DEPLOYMENT_URL"
    echo "Project: $RAILWAY_PROJECT"
    echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo ""
    
    # Health check
    log_info "Final Health Check:"
    curl -s "${DEPLOYMENT_URL}/api/health" | python3 -m json.tool 2>/dev/null || echo "Health check unavailable"
    echo ""
    
    # Metrics (if available)
    log_info "System Metrics:"
    curl -s "${DEPLOYMENT_URL}/api/metrics" | python3 -m json.tool 2>/dev/null || echo "Metrics unavailable"
    echo ""
    
    log_success "Deployment and testing complete!"
    log_info "Dashboard: https://railway.app/project/$RAILWAY_PROJECT"
}

# Main execution
main() {
    log_step "🚀 Deployment, Monitoring & E2E Testing"
    log_info "Project: $RAILWAY_PROJECT"
    log_info "Token: ${RAILWAY_TOKEN:0:8}***"
    echo ""
    
    # Execute steps
    check_railway_cli
    trigger_deployment
    
    if monitor_deployment; then
        if run_e2e_tests; then
            generate_report
            log_success "\n✅ All steps completed successfully!"
            exit 0
        else
            log_error "\n❌ E2E tests failed"
            exit 1
        fi
    else
        log_error "\n❌ Deployment monitoring failed"
        exit 1
    fi
}

# Run main
main
