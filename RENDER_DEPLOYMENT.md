# AutoMaintainer Deployment Guide - Render + UptimeRobot (100% Free)

This guide will help you deploy AutoMaintainer using **Render** (for hosting) and **UptimeRobot** (to keep your backend awake).

## Prerequisites

1. **GitHub account** with the AutoMaintainer repository forked
2. **DashScope API key** (free 1M tokens per model)
3. **GitHub Personal Access Token** (for GitHub integration)

## Step 1: Prepare Your Environment Variables

### Backend Environment Variables (.env.render)
Copy the template from `backend/.env.render` and replace the placeholder values:

- `DASHSCOPE_API_KEY`: Your actual DashScope API key
- `GITHUB_TOKEN`: Your GitHub Personal Access Token
- `GITHUB_WEBHOOK_SECRET`: A random secret string for webhook security

### Frontend Environment Variables
You'll configure this in Render's dashboard later:
- `NEXT_PUBLIC_API_URL`: Will be set to your backend URL after deployment

## Step 2: Deploy Backend to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +" → Web Service**
3. Connect your GitHub repository (`AutoMaintainer`)
4. Configure the service:
   - **Name**: `automaintainer-backend`
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: Python 3.13
   - **Build Command**: `chmod +x render-build.sh && ./render-build.sh`
   - **Start Command**: `chmod +x render-start.sh && ./render-start.sh`
   - **Plan**: Free

> Note: Render may default to Python 3.14 for the generic "Python 3" runtime. Use Python 3.13 to avoid `pydantic-core`/PyO3 build failures in this repo.
> Do not include extra backticks around the build or start command in Render's UI.
5. Add Environment Variables:
   - Copy all variables from your `backend/.env.render` file (with actual values)
   - **Important**: Set `PORT` to `10000` (Render requires this)
6. Click **"Create Web Service"**

Wait 3-5 minutes for the backend to deploy. Note your backend URL (e.g., `https://automaintainer-backend.onrender.com`).

## Step 3: Deploy Frontend to Render

1. In Render Dashboard, click **"New +" → Static Site**
2. Connect the same GitHub repository
3. Configure the site:
   - **Name**: `automaintainer-frontend`
   - **Branch**: `main`
   - **Root Directory**: `frontend`
   - **Build Command**: `chmod +x render-build.sh && ./render-build.sh`
   - **Publish Directory**: `frontend/.next`

> Do not include extra backticks around the build command in Render's UI.
4. Add Environment Variable:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://automaintainer-backend.onrender.com/api` (use your actual backend URL)
5. Click **"Create Static Site"**

Wait 2-3 minutes for the frontend to deploy. Note your frontend URL (e.g., `https://automaintainer-frontend.onrender.com`).

## Step 4: Update Backend CORS Settings

Go back to your backend service in Render:
1. Click on your backend service
2. Go to **Environment** tab
3. Update the `CORS_ORIGINS` variable to include your frontend URL:
   ```
   https://automaintainer-frontend.onrender.com,http://localhost:3000
   ```
4. Click **Save Changes** (this will restart your backend)

## Step 5: Set Up UptimeRobot (Keep Backend Awake)

1. Go to [UptimeRobot](https://uptimerobot.com)
2. Sign up for a free account
3. Click **"Add New Monitor"**
4. Configure the monitor:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: `AutoMaintainer Backend`
   - **URL**: `https://automaintainer-backend.onrender.com/api/health`
   - **Monitoring Interval**: 5 minutes
5. Click **"Create Monitor"**

✅ **Done!** Your AutoMaintainer is now deployed and will stay awake 24/7.

## Verification Steps

1. Open your frontend URL in a browser
2. You should see the AutoMaintainer dashboard
3. Click **"Run Demo Pipeline"** to test the full workflow
4. Check UptimeRobot dashboard to confirm your backend is "Up"

## Troubleshooting

### Common Issues:

**Frontend shows blank page or errors:**
- Verify `NEXT_PUBLIC_API_URL` is set correctly in frontend environment
- Check browser console for CORS errors

**Backend not responding:**
- Check Render logs for backend service
- Verify all environment variables are set correctly
- Ensure UptimeRobot is pinging the correct health endpoint

**Pipeline stuck or failing:**
- Check backend logs for LLM API errors
- Verify your DashScope API key has free quota enabled
- Ensure GitHub token has appropriate permissions

### Updating Your Deployment:

**To update frontend:**
- Push changes to `main` branch → Render auto-deploys

**To update backend:**
- Push changes to `main` branch → Render auto-deploys
- If you change environment variables, manually trigger a redeploy in Render dashboard

## Cost Summary

| Service | Cost | Limits |
|---------|------|--------|
| Render Frontend | Free | Unlimited bandwidth, auto SSL |
| Render Backend | Free | 512MB RAM, sleeps after 15m idle (prevented by UptimeRobot) |
| UptimeRobot | Free | 5-minute monitoring intervals |
| DashScope | Free | 1M tokens per model |
| GitHub | Free | Public repositories |
| **Total** | **$0/month** | **Forever** |

---