# Quick Start Guide

## Deploy in 5 Steps

### 1. Enable Firestore (if not already enabled)

Visit: https://console.firebase.google.com/project/YOUR-PROJECT/firestore

Or use CLI:
```bash
firebase firestore:databases:create
```

### 2. Deploy Firestore Configuration

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 3. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

This will deploy:
- `updateRemoteJobsCache` - Scheduled function (runs every hour)
- `getRemoteJobs` - HTTP endpoint (reads from cache)

### 4. Trigger Initial Cache Update

```bash
gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1
```

Wait ~30 seconds for completion.

### 5. Test the API

```bash
# Replace YOUR-REGION and YOUR-PROJECT with your values
curl https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/getRemoteJobs
```

## Expected Response

```json
{
  "jobs": [ /* array of job objects */ ],
  "metadata": {
    "lastUpdated": "2024-12-03T23:00:00.000Z",
    "jobCount": 150,
    "cacheAgeMinutes": 5,
    "cacheStatus": "cached"
  }
}
```

## Verify Deployment

### Check Functions

```bash
firebase functions:list
```

Should show:
- `updateRemoteJobsCache(us-central1)`
- `getRemoteJobs(us-central1)`

### Check Cloud Scheduler

```bash
gcloud scheduler jobs list
```

Should show:
- `firebase-schedule-updateRemoteJobsCache` with schedule `every 1 hours`

### Check Firestore

1. Open: https://console.firebase.google.com/project/YOUR-PROJECT/firestore
2. Look for collection: `remoteJobs`
3. Document: `latest` should contain jobs array and metadata

## Troubleshooting

### "Billing account not configured"

Enable billing: https://console.cloud.google.com/billing

Cloud Scheduler requires billing to be enabled.

### "Function deployment failed"

Check logs:
```bash
firebase functions:log
```

Common issues:
- ESLint errors: Run `cd functions && npm run lint`
- Missing dependencies: Run `cd functions && npm install`

### "Cache not updating"

Manually trigger:
```bash
gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1
```

Check logs:
```bash
firebase functions:log --only updateRemoteJobsCache
```

## What's Next?

- See [TESTING.md](TESTING.md) for local testing with emulators
- See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide
- See [README.md](README.md) for complete documentation

## Monitor Your Deployment

```bash
# Watch function logs
firebase functions:log

# Check specific function
firebase functions:log --only getRemoteJobs

# View in Firebase Console
# https://console.firebase.google.com/project/YOUR-PROJECT/functions
```

## Update Schedule (Optional)

To change from hourly to different frequency:

Edit [`functions/index.js`](functions/index.js:550):
```javascript
.pubsub.schedule('every 1 hours')  // Change this line
```

Examples:
- `'every 30 minutes'` - Every 30 minutes
- `'0 */2 * * *'` - Every 2 hours
- `'0 9 * * *'` - Daily at 9 AM UTC

Then redeploy:
```bash
firebase deploy --only functions:updateRemoteJobsCache
```

## Performance Expectations

- **Initial deployment**: 2-5 minutes
- **Cache update duration**: 20-60 seconds
- **HTTP response time**: < 100ms
- **Cache refresh**: Every 60 minutes

## Cost

Expected monthly cost: **$0.15-0.35**

Breakdown:
- Cloud Scheduler: $0.10/month (1 job)
- Cloud Functions: $0.05-0.20/month (execution)
- Firestore: $0.01-0.05/month (storage + reads)

## Getting Help

1. Check logs: `firebase functions:log`
2. Review [DEPLOYMENT.md](DEPLOYMENT.md)
3. See [TESTING.md](TESTING.md)
4. Open GitHub issue