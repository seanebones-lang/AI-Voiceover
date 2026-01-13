# Railway Environment Variables Setup

## Required Environment Variables

Set these in Railway dashboard under your project settings:

### Core Application
```bash
NODE_ENV=production
PORT=8080
```

### XTTS Service
```bash
XTTS_PORT=8081
XTTS_URL=http://xtts-service:8081  # Internal service URL
VOICES_DIR=/app/cloned_voices
PYTHONUNBUFFERED=1
```

### OpenVoice (Optional - Auto-detected)
```bash
PYTHONPATH=/app/services/xtts/OpenVoice:/app/services/xtts
```

### Next.js Public Variables
```bash
NEXT_PUBLIC_XTTS_URL=http://xtts-service:8081
```

## Railway Service Discovery

Railway automatically provides:
- Service names as hostnames
- Internal networking between services
- Port mapping

## Setting Variables in Railway

1. Go to Railway dashboard
2. Select your project
3. Go to Variables tab
4. Add each variable above
5. Redeploy if needed

## Verification

After setting variables:
1. Check service logs for correct URLs
2. Verify health checks pass
3. Test API endpoints
4. Check OpenVoice initialization logs