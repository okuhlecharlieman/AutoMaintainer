# Deploy AutoMaintainer on Alibaba Cloud ECS (Free Tier)

## Free Tier Resources Used

| Service | Free Tier | What It's For |
|---------|-----------|---------------|
| **Model Studio (DashScope)** | 70M+ tokens | Qwen LLM for all 7 agents |
| **ECS** | $90 credits (3 months) | Host the full app stack |

**Total: $0 for 3 months**, then ~$5-15/month.

---

## Step 1: Get Your API Keys

### DashScope (Qwen) API Key
1. Sign up at [Alibaba Cloud](https://alibabacloud.com/free)
2. Claim the **Model Studio** free tier (70M tokens)
3. Go to [Model Studio Console](https://dashscope.console.alibabacloud.com) → **API Key** → Create
4. Copy the key

### GitHub Token
1. GitHub → Settings → Developer Settings → Personal Access Tokens → Generate
2. Required scopes: `repo` (full control of private repositories)
3. Copy the token

---

## Step 2: Launch ECS Instance

1. Go to [ECS Console](https://ecs.console.alibabacloud.com)
2. Create instance using your **$90 free credit**:
   - **Region:** Singapore / US (closest to you)
   - **Instance type:** `ecs.t6-c1m2.large` (2 vCPU, 4 GB RAM) — ~$0.04/hr
   - **OS:** Ubuntu 22.04 LTS
   - **Disk:** 40 GB SSD (default)
   - **Security group:** Allow inbound ports **80** (HTTP) and **22** (SSH)
3. Note the **Public IP** of your instance

---

## Step 3: Install Docker on ECS

```bash
ssh root@<YOUR_ECS_IP>

# Install Docker + Git
apt-get update && apt-get install -y docker.io docker-compose-plugin git
systemctl enable docker && systemctl start docker
```

---

## Step 4: Deploy

```bash
# Clone the repo
git clone https://github.com/YOUR_USER/AutoMaintainer.git
cd AutoMaintainer

# Configure environment
cp .env.example .env
nano .env
```

Set your keys:
```
DASHSCOPE_API_KEY=sk-...your_dashscope_key...
GITHUB_TOKEN=ghp_...your_github_token...
GITHUB_WEBHOOK_SECRET=any_random_string_here
```

Build and start:
```bash
docker compose up -d --build
```

This starts three containers behind nginx:
```
Internet → :80 (nginx)
              ├── /api/*  → backend:8000  (FastAPI + Qwen)
              └── /*      → frontend:3000 (Next.js)
```

---

## Step 5: Verify

```bash
# Check containers
docker compose ps

# Health check
curl http://localhost/api/health
# → {"status":"healthy","service":"automaintainer-backend"}
```

Open `http://<YOUR_ECS_IP>` in your browser.

---

## Useful Commands

```bash
# View live logs
docker compose logs -f

# View backend logs only
docker compose logs -f backend

# Restart services
docker compose restart

# Stop everything
docker compose down

# Rebuild after code changes
git pull && docker compose up -d --build

# Check resource usage
docker stats
```

---

## Cost Estimate

| Resource | Free Tier | Usage |
|----------|-----------|-------|
| ECS ($90 credit) | ~2,250 hours | 24/7 for **~93 days** |
| DashScope (70M tokens) | ~1,700+ pipeline runs | Full hackathon demo |
| SQLite | Included in OS | Zero additional cost |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 80 not accessible | Check ECS security group allows inbound TCP 80 |
| Backend 500 errors | `docker compose logs backend` — likely API key issue |
| Frontend blank page | `docker compose logs frontend` — check build errors |
| Out of disk | `docker system prune -a` to clean unused images |
| Token budget worried | Switch to `qwen-turbo` in .env (cheaper per token) |
