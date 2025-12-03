# RemoteJobsServerless

Serverless function to populate Remote Jobs for the [RemoteJobs Android App](https://github.com/flavioislima/remote-jobs-app)

## Overview

This Firebase Cloud Functions project aggregates remote job listings from multiple sources and provides them through a fast, cached API endpoint.

### Job Sources

- **RemoteOK** - Remote jobs API
- **WeWorkRemotely** - Multiple RSS feeds for different categories
- **Remotive** - Remote jobs RSS feed
- **Remote.co** - Remote jobs RSS feed
- **Web3Jobs** - Web3 career API

## Architecture

The system uses a two-function architecture for optimal performance:

1. **Scheduled Function** ([`updateRemoteJobsCache`](functions/index.js:547)) - Runs every hour to fetch and cache jobs
2. **HTTP Function** ([`getRemoteJobs`](functions/index.js:583)) - Serves cached data to clients

### Performance

- **Response Time**: < 100ms (vs 10-30s before optimization)
- **Cache Updates**: Every hour via Cloud Scheduler
- **Data Storage**: Firestore with public read access
- **Cost Reduction**: ~90% reduction in execution costs

## API Endpoint

### GET /getRemoteJobs

Returns cached remote job listings with metadata.

**Response Format:**
```json
{
  "jobs": [
    {
      "id": "string",
      "company": "string",
      "position": "string",
      "date": "UTC timestamp",
      "image": { "uri": "string" },
      "description": "string",
      "url": "string",
      "tags": ["string"],
      "source": "string",
      "location": "string (optional)"
    }
  ],
  "metadata": {
    "lastUpdated": "ISO timestamp",
    "jobCount": 150,
    "cacheAgeMinutes": 5,
    "cacheStatus": "cached"
  }
}
```

**Cache Status Values:**
- `cached` - Data served from Firestore cache
- `live-fetch` - Cache didn't exist, fetched live data
- `fallback-fetch` - Cache read failed, fetched live data as fallback

## Setup

### Prerequisites

- Node.js 22
- Firebase CLI
- Firebase project with Firestore enabled
- Billing enabled (required for Cloud Scheduler)

### Installation

```bash
# Clone the repository
git clone https://github.com/flavioislima/RemoteJobsServerless.git
cd RemoteJobsServerless

# Install dependencies
cd functions
npm install
```

### Local Development

```bash
# Start Firebase emulators
firebase emulators:start

# Functions will be available at:
# http://localhost:5001/YOUR-PROJECT/us-central1/getRemoteJobs
```

See [TESTING.md](TESTING.md) for detailed testing instructions.

## Deployment

```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes

# Deploy Cloud Functions
firebase deploy --only functions

# Manually trigger first cache update
gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Project Structure

```
RemoteJobsServerless/
├── functions/
│   ├── index.js           # Main Cloud Functions code
│   ├── package.json       # Node.js dependencies
│   └── .eslintrc         # ESLint configuration
├── firestore.rules       # Firestore security rules
├── firestore.indexes.json # Firestore indexes
├── firebase.json         # Firebase configuration
├── DEPLOYMENT.md         # Deployment guide
├── TESTING.md           # Testing guide
└── README.md            # This file
```

## Key Functions

### [`fetchAndAggregateJobs()`](functions/index.js:465)
Helper function that fetches jobs from all sources, aggregates them, and returns formatted data with metadata.

### [`updateRemoteJobsCache`](functions/index.js:547)
Scheduled function that runs hourly to update the Firestore cache with fresh job data.

### [`getRemoteJobs`](functions/index.js:583)
HTTP function that serves cached job data to clients with fallback to live fetching if cache is unavailable.

## Monitoring

### View Logs

```bash
# All function logs
firebase functions:log

# Specific function
firebase functions:log --only updateRemoteJobsCache
```

### Check Cache Status

1. Open Firebase Console
2. Navigate to Firestore Database
3. Check `remoteJobs/latest` document
4. Review metadata for source status and timestamps

### Cloud Scheduler

View scheduled job status:
```bash
gcloud scheduler jobs describe firebase-schedule-updateRemoteJobsCache --location=us-central1
```

## Configuration

### Change Update Frequency

Modify the schedule in [`functions/index.js`](functions/index.js:550):

```javascript
.pubsub.schedule('every 1 hours')  // Current: hourly

// Options:
.pubsub.schedule('every 30 minutes')  // Every 30 minutes
.pubsub.schedule('0 */2 * * *')      // Every 2 hours
.pubsub.schedule('0 9 * * *')        // Daily at 9 AM UTC
```

After changing, redeploy:
```bash
firebase deploy --only functions:updateRemoteJobsCache
```

## Troubleshooting

### Cache Not Updating

Check Cloud Scheduler status and manually trigger:
```bash
gcloud scheduler jobs run firebase-schedule-updateRemoteJobsCache --location=us-central1
```

### Slow Response Times

1. Verify cache exists in Firestore
2. Check `cacheStatus` in API response
3. Review function logs for errors

### Source Failures

Individual source failures are normal and expected. The system continues operating with data from successful sources. Check the `metadata.sources` object in Firestore for per-source status.

## Cost Estimation

- **Firestore**: ~$0.01-0.05/month (storage + operations)
- **Cloud Scheduler**: $0.10/month (1 job)
- **Cloud Functions**: ~$0.05-0.20/month (execution time)

**Total**: ~$0.15-0.35/month

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with emulators
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Related Projects

- [RemoteJobs Android App](https://github.com/flavioislima/remote-jobs-app) - Android client application

## Support

For issues or questions:
1. Check [TESTING.md](TESTING.md) and [DEPLOYMENT.md](DEPLOYMENT.md)
2. Review Firebase Console logs
3. Open an issue on GitHub
