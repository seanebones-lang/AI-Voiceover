# 🧹 Dependency Cleanup Plan

## Unused Dependencies Identified

### Can Be Removed ✅

1. **axios** - Not used anywhere
   - Next.js provides `fetch` API
   - No imports found in codebase

2. **form-data** - Not used anywhere
   - No imports found
   - May have been used previously

3. **react-hook-form** - Not used anywhere
   - No imports found
   - No form components using it

4. **@hookform/resolvers** - Not used anywhere
   - Depends on react-hook-form
   - No usage found

### Removal Commands

```bash
# Remove unused dependencies
npm uninstall axios form-data react-hook-form @hookform/resolvers

# Verify removal
npm test
npm run build
```

**Impact:**
- Reduces bundle size
- Cleaner dependency tree
- Faster installs

---

## Transitive Dependency Issues

### lodash (via recharts)

**Issue:** lodash@4.17.21 has moderate vulnerability  
**Source:** recharts@2.15.4  
**Solution:** Update recharts to v3.7.0 (includes fixed lodash)

```bash
# Update recharts (fixes lodash vulnerability)
npm install recharts@latest

# Test the update
npm test
# Check waveform visualizer still works
```

---

## Bundle Size Impact

### After Cleanup

| Package | Size | Status |
|---------|------|--------|
| **axios** | ~15KB | ❌ Remove |
| **form-data** | ~10KB | ❌ Remove |
| **react-hook-form** | ~50KB | ❌ Remove |
| **@hookform/resolvers** | ~5KB | ❌ Remove |

**Total Savings:** ~80KB (uncompressed)

---

## Verification Steps

### Before Removal

1. **Search for usage:**
   ```bash
   grep -r "axios" app/ lib/ components/
   grep -r "form-data" app/ lib/ components/
   grep -r "react-hook-form" app/ components/
   grep -r "@hookform" app/ components/
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Build project:**
   ```bash
   npm run build
   ```

### After Removal

1. **Verify build:**
   ```bash
   npm run build
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Check bundle size:**
   ```bash
   npm run build
   # Check .next/analyze or bundle analyzer
   ```

---

## Recommended Actions

### Immediate (This Week)

1. ✅ Remove unused dependencies
2. ✅ Update recharts (fixes lodash vulnerability)
3. ✅ Test thoroughly

### Short Term (Next Week)

1. Consider recharts alternative (if bundle size is concern)
2. Update remaining dependencies
3. Monitor for new vulnerabilities

---

**Cleanup Impact:**
- Removes 4 unused packages
- Fixes lodash vulnerability
- Reduces bundle size by ~80KB
- Cleaner dependency tree
