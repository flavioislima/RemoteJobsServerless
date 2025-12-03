# Deployment Guide - Remote Jobs Caching System

## Overview

This guide covers deploying the optimized remote jobs system with Firestore caching and scheduled updates.

## What Changed

### New Components
1. **Scheduled Function**: [`updateRemoteJobsCache`](functions/index.js:547) - Runs every hour to fetch and cache jobs
2. **Firestore Collection**: `remoteJobs` - Stores cached job data
3. **Security Rules**: [`firestore.rules`](firestore.rules) - Controls access to Firestore
4. **Helper Function**: [`fetchAndAggregateJobs()`](functions/index.js:465) - Shared logic for fetching jobs

### Modified Components
1. **HTTP Function**: [`getRemoteJobs`](functions/index.js:583) - Now reads from Firestore cache instead of fetching live

## Prerequisites

- Firebase CLI installed and logged in
- Firebase project with Firestore enabled
- Billing enabled (required for Cloud Scheduler)

## Deployment Steps

### Step 1: Enable Firestore (if not already enabled)

```bash
# Navigate to Firebase Console
# https://console.firebase.google.com/project/YOUR-PROJECT/firestore

# Or use CLI
firebase firestore:databases:create
```

### Step 2: Deploy Firestore Rules and Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

This deploys:
- [`firestore.rules`](firestore.rules) - Security rules allowing public read, Cloud Functions only write
- [`firestore.indexes.json`](firestore.indexes.json) - Index configuration (empty for now)

### Step 3: Deploy Cloud Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy individually
firebase deploy --only functions:updateRemoteJobsCache
firebase deploy --only functions:getRemoteJobs
```

### Step 4: Verify Cloud Scheduler

After deployment, Cloud Scheduler should automatically create a job for the scheduled function.

Verify in Firebase Console:
1. Go to Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
2. Look for job named: `firebase-schedule-updateRemoteJobsCache`
3. Schedule should be: `every 1 hours`

### Step 5: Manually Trigger First Cache Update

```bash
# Trigger the scheduled function manually to populate initial cache
gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1

# Or use Firebase Console to trigger the function
```

Alternatively, wait up to 1 hour for the first automatic run.

### Step 6: Test the HTTP Endpoint

```bash
# Get your function URL
firebase functions:config:get

# Test the endpoint
curl https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/getRemoteJobs

# Should return JSON with jobs array and metadata
```

## Monitoring

### View Function Logs

```bash
# View all function logs
firebase functions:log

# View specific function logs
firebase functions:log --only updateRemoteJobsCache
firebase functions:log --only getRemoteJobs
```

### Check Firestore Data

1. Go to Firebase Console: https://console.firebase.google.com/project/YOUR-PROJECT/firestore
2. Navigate to `remoteJobs` collection
3. Check the `latest` document
4. Verify it contains:
   - `jobs` array with job listings
   - `metadata` object with lastUpdated, jobCount, sources, etc.

### Monitor Cloud Scheduler

```bash
# List all scheduler jobs
gcloud scheduler jobs list

# View specific job details
gcloud scheduler jobs describe firebase-schedule-updateRemoteJobsCache --location=us-central1

# View execution history in Cloud Console
# https://console.cloud.google.com/cloudscheduler
```

## Performance Comparison

### Before Optimization
- Response time: 10-30 seconds
- API calls per request: 5+ external APIs
- Cost per 1000 requests: ~$0.50-1.00

### After Optimization
- Response time: < 100ms
- API calls per request: 0 (reads from cache)
- Cost per 1000 requests: ~$0.05-0.10
- Scheduled updates: 24 times per day

## Troubleshooting

### Cache Not Updating

Check scheduler job status:
```bash
gcloud scheduler jobs describe firebase-schedule-updateRemoteJobsCache --location=us-central1
```

Manually trigger:
```bash
gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1
```

Check function logs:
```bash
firebase functions:log --only updateRemoteJobsCache
```

### HTTP Function Returning Errors

1. Check if cache document exists in Firestore
2. Review function logs: `firebase functions:log --only getRemoteJobs`
3. The function has fallback logic - it will fetch live data if cache fails

### Cache Too Old

If cache is older than expected:
- Check Cloud Scheduler job status
- Verify billing is enabled (required for Cloud Scheduler)
- Check for function timeout errors in logs

## Updating the Schedule

To change the update frequency, modify the schedule in [`functions/index.js`](functions/index.js:550):

```javascript
.pubsub.schedule('every 1 hours')  // Current setting

// Examples:
.pubsub.schedule('every 30 minutes')  // Every 30 minutes
.pubsub.schedule('0 */2 * * *')      // Every 2 hours (cron syntax)
.pubsub.schedule('0 9 * * *')        // Daily at 9 AM UTC
```

After changing, redeploy:
```bash
firebase deploy --only functions:updateRemoteJobsCache
```

## Rollback Procedure

If you need to revert to the original implementation:

1. Checkout the previous version from git
2. Deploy functions: `firebase deploy --only functions`
3. Optionally delete the cache collection (data will be cleaned up automatically)

## Cost Estimation

### Firestore
- Storage: ~1MB for cache document (negligible cost)
- Writes: 24 per day (1 per hour)
- Reads: Depends on API usage

### Cloud Functions
- Scheduled function: 24 invocations/day × ~30s = 720s/day
- HTTP function: Much faster execution (< 100ms vs 10-30s)

### Cloud Scheduler
- Free tier: 3 jobs/month
- Additional: $0.10 per job per month

**Total estimated cost**: $0.10-0.50 per month for the scheduling system + function execution costs (significantly reduced)

## Next Steps

1. Monitor performance for 24-48 hours
2. Set up Cloud Monitoring alerts for:
   - Function failures
   - Cache age > 90 minutes
   - Significant drop in job count
3. Consider adding analytics to track popular jobs
4. Implement client-side caching for even better performance

## Support

For issues or questions:
1. Check Firebase Console logs
2. Review function deployment status
3. Verify Firestore security rules are deployed
4. Ensure billing is enabled for Cloud Scheduler