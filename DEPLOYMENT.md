# 🚀 Deployment Guide

## Quick Deploy Options

### Option 1: Vercel (Recommended - Easiest)

1. **Install Vercel CLI**
```bash
npm i -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Set Environment Variable**
   - Go to your Vercel dashboard
   - Select your project
   - Go to Settings → Environment Variables
   - Add:
     - Name: `ELEVENLABS_API_KEY`
     - Value: `sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191`
   - Redeploy

**That's it! Your app is live.**

---

### Option 2: Railway (Very Easy)

1. **Go to https://railway.app**

2. **Connect GitHub**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose this repository

3. **Add Environment Variable**
   - Click on your service
   - Go to "Variables" tab
   - Add:
     ```
     ELEVENLABS_API_KEY=sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191
     ```

4. **Deploy**
   - Railway auto-deploys
   - Get your URL from the deployment

**Live in 2 minutes!**

---

### Option 3: Heroku

1. **Create Heroku account** at https://heroku.com

2. **Install Heroku CLI**
```bash
npm install -g heroku
```

3. **Login**
```bash
heroku login
```

4. **Create app**
```bash
heroku create your-voiceover-app
```

5. **Set environment variable**
```bash
heroku config:set ELEVENLABS_API_KEY=sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191
```

6. **Deploy**
```bash
git push heroku main
```

**Your app URL**: `https://your-voiceover-app.herokuapp.com`

---

### Option 4: DigitalOcean App Platform

1. **Go to https://cloud.digitalocean.com/apps**

2. **Create New App**
   - Select GitHub
   - Choose this repository
   - Select branch

3. **Configure**
   - Detected buildpack: Node.js ✓
   - Run command: `npm start`
   - HTTP port: 3000

4. **Environment Variables**
   - Add `ELEVENLABS_API_KEY`

5. **Deploy**
   - Click "Create Resources"
   - Wait 3-5 minutes

---

### Option 5: AWS (Advanced)

#### Using AWS Elastic Beanstalk:

1. **Install EB CLI**
```bash
pip install awsebcli
```

2. **Initialize**
```bash
eb init
```

3. **Create environment**
```bash
eb create voiceover-env
```

4. **Set environment variable**
```bash
eb setenv ELEVENLABS_API_KEY=sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191
```

5. **Deploy**
```bash
eb deploy
```

---

### Option 6: VPS (Ubuntu/Linux)

For full control on VPS (DigitalOcean, Linode, AWS EC2):

1. **SSH into your server**
```bash
ssh user@your-server-ip
```

2. **Install Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Clone repository**
```bash
git clone https://github.com/yourusername/AI-Voiceover.git
cd AI-Voiceover
```

4. **Install dependencies**
```bash
npm install
```

5. **Create .env file**
```bash
nano .env
```
Add:
```
ELEVENLABS_API_KEY=sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191
PORT=3000
```

6. **Install PM2 (Process Manager)**
```bash
sudo npm install -g pm2
```

7. **Start app**
```bash
pm2 start server.js --name voiceover
pm2 save
pm2 startup
```

8. **Setup Nginx reverse proxy**
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/voiceover
```

Add:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/voiceover /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

9. **Setup SSL (Let's Encrypt)**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

**Done! Your app is live with HTTPS.**

---

## Environment Variables

All platforms need this environment variable:

```
ELEVENLABS_API_KEY=sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191
```

Optional:
```
PORT=3000
```

---

## Custom Domain Setup

### After deployment:

1. **Get your deployment URL** (e.g., `your-app.vercel.app`)

2. **Go to your domain registrar** (Namecheap, GoDaddy, etc.)

3. **Add DNS records**:
   - Type: `CNAME`
   - Name: `@` or `www`
   - Value: Your deployment URL

4. **Update in platform**:
   - Vercel: Settings → Domains → Add Domain
   - Railway: Settings → Domains → Custom Domain
   - Heroku: Settings → Domains → Add Domain

5. **Wait for DNS propagation** (5-60 minutes)

---

## Performance Tips

### 1. Enable Compression
Add to `server.js`:
```javascript
const compression = require('compression');
app.use(compression());
```

### 2. Cache Static Files
```javascript
app.use(express.static('public', {
    maxAge: '1d'
}));
```

### 3. Use CDN
Upload `public/` folder to Cloudflare/CDN and update paths.

---

## Monitoring

### Simple uptime monitoring:

1. **UptimeRobot** (Free)
   - https://uptimerobot.com
   - Monitor your URL every 5 minutes

2. **Better Stack** (Free tier)
   - https://betterstack.com
   - Advanced monitoring + alerts

3. **Built-in health check**
   Already implemented at `/health` endpoint

---

## Cost Estimates

| Platform | Free Tier | Paid (starts at) |
|----------|-----------|------------------|
| Vercel | ✓ (Hobby) | $20/mo (Pro) |
| Railway | $5 credit/mo | $5/mo |
| Heroku | 7 (Eco dyno) | $7/mo |
| DigitalOcean | ✗ | $5/mo |
| VPS | ✗ | $5/mo |

**Recommendation**: Start with Vercel (free), upgrade when needed.

---

## Troubleshooting Deployment

### "Application error" or 500 error
- Check logs: `vercel logs` or `heroku logs --tail`
- Verify environment variable is set
- Check Node.js version compatibility

### "Cannot find module"
- Run `npm install` on server
- Check `package.json` dependencies

### API not working
- Check CORS settings
- Verify API key in environment
- Test `/health` endpoint

---

## Next Steps After Deployment

1. ✅ Test all features on production URL
2. ✅ Set up custom domain
3. ✅ Enable analytics (Google Analytics/Plausible)
4. ✅ Set up monitoring (UptimeRobot)
5. ✅ Share on social media
6. ✅ Submit to Product Hunt
7. ✅ Add to your portfolio

---

## Quick Links

- **Vercel**: https://vercel.com/new
- **Railway**: https://railway.app/new
- **Heroku**: https://dashboard.heroku.com/new-app
- **DigitalOcean**: https://cloud.digitalocean.com/apps/new

---

**Need help?** Open an issue on GitHub or contact support.

**Ready to make money?** Check out the Stripe integration guide in README.md
