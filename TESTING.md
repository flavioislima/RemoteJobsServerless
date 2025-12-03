# Testing Guide - Remote Jobs Caching System

## Local Testing with Firebase Emulators

### Prerequisites

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Ensure you're in the project directory
cd /home/flavio/Develop/RemoteJobsServerless
```

### Start Emulators

```bash
# Start all emulators (Firestore + Functions)
firebase emulators:start

# Or start specific emulators
firebase emulators:start --only functions,firestore
```

The emulators will start on:
- Firestore Emulator: http://localhost:8080
- Functions Emulator: http://localhost:5001
- Emulator UI: http://localhost:4000

### Test the Scheduled Function

Since Cloud Scheduler isn't available in the emulator, you need to manually trigger the scheduled function:

#### Option 1: Using Firebase Functions Shell

```bash
# In a new terminal, start the functions shell
firebase functions:shell

# Then in the shell, run:
updateRemoteJobsCache()
```

#### Option 2: Using the Emulator UI

1. Open http://localhost:4000
2. Navigate to Functions tab
3. Find `updateRemoteJobsCache`
4. Click "Run function"

#### Option 3: Using curl (Pub/Sub trigger simulation)

```bash
# This simulates the Cloud Scheduler trigger
curl -X POST \
  http://localhost:5001/YOUR-PROJECT/us-central1/updateRemoteJobsCache \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Test the HTTP Function

```bash
# Call the HTTP function endpoint
curl http://localhost:5001/YOUR-PROJECT/us-central1/getRemoteJobs

# Or open in browser
# http://localhost:5001/YOUR-PROJECT/us-central1/getRemoteJobs
```

### Verify Firestore Data

1. Open Firestore Emulator UI: http://localhost:4000/firestore
2. Look for the `remoteJobs` collection
3. Check the `latest` document
4. Verify structure:
   - `jobs` array exists and has job objects
   - `metadata` object contains:
     - `lastUpdated` timestamp
     - `jobCount` number
     - `sources` object with per-source statistics
     - `updateDurationMs` number

## Testing Workflow

### Step 1: Start Emulators

```bash
firebase emulators:start
```

Wait until you see:
```
✔  All emulators ready!
```

### Step 2: Populate Initial Cache

Using functions shell:
```bash
# In new terminal
firebase functions:shell

# In shell
updateRemoteJobsCache()
```

Expected output:
```javascript
Starting scheduled job cache update...
Fetching https://remoteok.io/api - attempt 1
Fetching https://weworkremotely.com/... - attempt 1
...
Cache updated successfully: XXX jobs from 5 sources
Update took XXXXXms
```

### Step 3: Verify Cache in Firestore

Open http://localhost:4000/firestore and verify data structure.

### Step 4: Test HTTP Endpoint

```bash
curl http://localhost:5001/YOUR-PROJECT/us-central1/getRemoteJobs | jq
```

Expected response:
```json
{
  "jobs": [
    {
      "id": "...",
      "company": "...",
      "position": "...",
      "date": "...",
      "image": { "uri": "..." },
      "description": "...",
      "url": "...",
      "tags": ["..."],
      "source": "..."
    }
  ],
  "metadata": {
    "lastUpdated": "2024-12-03T23:00:00.000Z",
    "jobCount": 150,
    "cacheAgeMinutes": 5,
    "cacheStatus": "cached"
  }
}
```

### Step 5: Test Fallback Behavior

To test the fallback when cache doesn't exist:

1. Delete the Firestore document via emulator UI
2. Call the HTTP endpoint
3. Should see `"cacheStatus": "live-fetch"` in response
4. Cache document should be recreated

## Production Testing

### After Deployment

1. **Trigger Initial Cache Update**
   ```bash
   gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1
   ```

2. **Wait 30 seconds** for function to complete

3. **Check Firestore**
   - Open Firebase Console
   - Navigate to Firestore Database
   - Verify `remoteJobs/latest` document exists

4. **Test HTTP Endpoint**
   ```bash
   curl https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/getRemoteJobs
   ```

5. **Verify Response Time**
   - Should be < 200ms (vs previous 10-30s)

### Monitor First 24 Hours

```bash
# Watch function logs in real-time
firebase functions:log --only updateRemoteJobsCache

# Check for any errors
firebase functions:log | grep ERROR
```

### Key Metrics to Check

1. **Scheduled Function Success Rate**
   - Should run every hour
   - Check logs for successful updates
   - Verify job counts are reasonable

2. **HTTP Function Response Time**
   - Should be < 100ms for cached responses
   - Check `cacheAgeMinutes` in response

3. **Source Success Rates**
   - Check metadata.sources in Firestore
   - Some sources may occasionally fail (acceptable)

## Test Scenarios

### Scenario 1: Normal Operation

1. Scheduled function runs every hour
2. Cache is updated successfully
3. HTTP requests return cached data quickly
4. All 5 sources provide data

**Expected**: Fast responses, fresh data, no errors

### Scenario 2: Partial Source Failure

1. One or more job sources fail
2. Scheduled function continues with available data
3. HTTP requests still work with partial data

**Expected**: Reduced job count, warnings in logs, but system continues working

### Scenario 3: Complete Source Failure

1. All job sources fail temporarily
2. Scheduled function logs errors but doesn't crash
3. HTTP requests serve stale cached data

**Expected**: Old cache data served, errors logged, system remains available

### Scenario 4: Cache Miss

1. Cache document deleted or expired
2. HTTP request triggers fallback fetch
3. New cache created for next request

**Expected**: Slower first request, subsequent requests fast

### Scenario 5: High Traffic

1. Multiple concurrent HTTP requests
2. All read from same Firestore document

**Expected**: Consistent fast responses, no rate limiting

## Performance Benchmarks

### Target Metrics

- **Scheduled Function Execution**: 20-60 seconds
- **HTTP Function Response Time**: < 100ms
- **Cache Update Frequency**: Every 60 minutes
- **Job Count**: 100-500 jobs (varies by day)

### Measuring Performance

```bash
# Time the HTTP request
time curl https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/getRemoteJobs > /dev/null

# Should show:
# real    0m0.150s  (under 200ms total)
```

## Troubleshooting Tests

### Emulator Issues

**Functions not starting:**
```bash
# Clear emulator data
firebase emulators:start --export-on-exit=./emulator-data --import=./emulator-data
```

**Port conflicts:**
```bash
# Change ports in firebase.json
{
  "emulators": {
    "functions": { "port": 5002 },
    "firestore": { "port": 8081 }
  }
}
```

### Function Errors

**Scheduled function timing out:**
- Check internet connectivity
- Some sources may be slow (normal)
- Increase timeout if needed (max 540s for scheduled functions)

**HTTP function returning 500:**
- Check Firestore access
- Verify cache document exists
- Review function logs

## Clean Up After Testing

```bash
# Stop emulators
# Press Ctrl+C in the terminal running emulators

# Remove emulator data (optional)
rm -rf .firebase/
```

## Next Steps After Successful Testing

1. Deploy to production (see DEPLOYMENT.md)
2. Set up monitoring alerts
3. Update client applications to use new response format
4. Monitor costs and performance