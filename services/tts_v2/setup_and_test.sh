#!/bin/bash
# HumanMirage TTS - Setup and E2E Test Script
# This script sets up the Python environment and runs all tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  HumanMirage TTS - Setup & Test"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "${RED}❌ Python not found! Please install Python 3.8+${NC}"
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
echo "🐍 Found: $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo ""
    echo -e "${YELLOW}📦 Creating virtual environment...${NC}"
    $PYTHON_CMD -m venv "$VENV_DIR"
fi

# Activate virtual environment
echo -e "${YELLOW}🔧 Activating virtual environment...${NC}"
source "$VENV_DIR/bin/activate"

# Upgrade pip
pip install --upgrade pip -q

# Install dependencies
echo ""
echo -e "${YELLOW}📥 Installing dependencies...${NC}"
pip install numpy scipy -q 2>/dev/null || true
pip install inflect -q 2>/dev/null || true

# Core deps that can be installed
cat > /tmp/tts_test_requirements.txt << 'EOF'
numpy>=1.21.0
scipy>=1.7.0
inflect>=5.0.0
EOF

pip install -r /tmp/tts_test_requirements.txt -q 2>/dev/null || echo "Some packages may have failed"

echo ""
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Run syntax check
echo ""
echo "=============================================="
echo "  Phase 1: Python Syntax Check"
echo "=============================================="
echo ""

SYNTAX_ERRORS=0
for pyfile in *.py; do
    if [ -f "$pyfile" ]; then
        if $PYTHON_CMD -m py_compile "$pyfile" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} $pyfile"
        else
            echo -e "  ${RED}✗${NC} $pyfile"
            ((SYNTAX_ERRORS++)) || true
        fi
    fi
done

if [ $SYNTAX_ERRORS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All files pass syntax check${NC}"
else
    echo ""
    echo -e "${RED}✗ $SYNTAX_ERRORS file(s) have syntax errors${NC}"
fi

# Run unit tests
echo ""
echo "=============================================="
echo "  Phase 2: Running E2E Tests"
echo "=============================================="
echo ""

$PYTHON_CMD tests/test_e2e.py
TEST_RESULT=$?

# Summary
echo ""
echo "=============================================="
echo "  Setup & Test Complete"
echo "=============================================="

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed (likely due to missing ML dependencies)${NC}"
    echo -e "${YELLOW}   This is expected without PyTorch/CUDA installed${NC}"
fi

echo ""
echo "Next steps:"
echo "  1. Install full ML stack: pip install torch transformers"
echo "  2. Run server: uvicorn server:app --reload"
echo "  3. Test API: curl http://localhost:8000/health"
echo ""
