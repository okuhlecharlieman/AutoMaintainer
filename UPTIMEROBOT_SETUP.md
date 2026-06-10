# UptimeRobot Setup for AutoMaintainer Backend

## Why UptimeRobot?
Render's free tier puts web services to sleep after 15 minutes of inactivity. UptimeRobot sends periodic HTTP requests to keep your backend awake 24/7.

## Step-by-Step Setup

### 1. Create UptimeRobot Account
1. Go to [UptimeRobot.com](https://uptimerobot.com)
2. Click **"Sign Up Free"**
3. Enter your email and create a password
4. Verify your email address

### 2. Create Monitor for Your Backend
1. In UptimeRobot dashboard, click **"Add New Monitor"**
2. Fill in the details:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `AutoMaintainer Backend`
   - **URL**: `https://your-backend-url.onrender.com/api/health`
     - Replace `your-backend-url` with your actual Render backend URL
   - **Monitoring Interval**: `5 minutes` (free tier limit)
   - **Alert Contacts**: Add your email if desired
3. Click **"Create Monitor"**

### 3. Verify It's Working
1. Wait 5-10 minutes
2. Check your UptimeRobot dashboard
3. You should see status: **"Up"** with response time
4. Check your Render backend logs - you'll see periodic GET requests from UptimeRobot

## Advanced Configuration (Optional)

### Multiple Monitors for Redundancy
If you want extra reliability, create a second monitor with a different interval:
- **Monitor 2**: Same URL, but set interval to `10 minutes`

### Custom Alert Settings
- Set up SMS or Slack alerts for downtime
- Configure maintenance windows if needed

## Troubleshooting

**Monitor shows "Down":**
- Verify your backend URL is correct
- Check if your Render backend is actually running
- Ensure your backend has a working `/api/health` endpoint

**Backend still sleeping:**
- Wait at least 15 minutes after setup
- Check UptimeRobot logs to confirm pings are being sent
- Verify your backend responds with HTTP 200 to health checks

## Cost
- **Free tier**: 50 monitors, 5-minute intervals, email alerts
- **Perfect for AutoMaintainer**: Uses only 1 monitor

---