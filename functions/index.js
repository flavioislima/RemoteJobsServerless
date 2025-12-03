/* eslint-disable no-undef */
const {onRequest} = require('firebase-functions/v2/https')
const {onSchedule} = require('firebase-functions/v2/scheduler')
const {setGlobalOptions} = require('firebase-functions/v2')
const admin = require('firebase-admin')
const Parser = require('rss-parser')
const axios = require('axios')

// Initialize Firebase Admin
admin.initializeApp()

// Set global options for all v2 functions
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10
})

/**
 * Utility function to perform HTTP GET requests with automatic retries and exponential backoff
 * @param {string} url - URL to fetch
 * @param {Object} options - Axios request options
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<Object>} - Axios response object
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Fetching ${url} - attempt ${attempt + 1}`);
      return await axios.get(url, options);
    } catch (error) {
      console.log(`Attempt ${attempt + 1} failed for ${url}: ${error.message}`);
      lastError = error;
      
      // Don't wait on the last attempt
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff: 500ms, 1500ms, 4500ms, etc.
        const delay = 500 * Math.pow(3, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Removes duplicate job listings based on their ID
 * @param {Array} jobsWithId - Array of job objects with ID property
 * @returns {Array} - Array with duplicates removed
 */
function removeDuplicates(jobsWithId) {
  return jobsWithId.reduce((acc, current) => {
    const duplicated = acc.find((job) => job.id === current.id)
    if (!duplicated) {
      return acc.concat(current)
    }
    return acc
  }, [])
}

/**
 * Fetches remote job listings from RemoteOK API
 * @returns {Array} - Formatted job listings
 */
async function fetchRemoteOkJobs() {
  try {
    const remoteOkApi = 'https://remoteok.io/api'
    const response = await fetchWithRetry(remoteOkApi, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    })
    let remoteOkJobs = response.data
    
    // The first item contains API information, not a job
    remoteOkJobs.shift()
    
    return remoteOkJobs.map((job) => {
      const { logo, company_logo, id, company, position, date, url, description, tags } = job
      const rLogo = 'https://remoteok.io/assets/logo.png'
      const logoUri = logo || company_logo
      const image = logoUri ? { uri: logoUri } : { uri: rLogo }
      const formattedDate = new Date(date).toUTCString()
      let jobsTags = tags === null ? ['remote work'] : tags
      
      // Handle case where tags is an object
      if (!jobsTags.length) {
        jobsTags = Object.values(tags)
      }

      return { 
        id, 
        company, 
        position, 
        date: formattedDate, 
        image, 
        description, 
        url, 
        tags: jobsTags,
        source: 'RemoteOK'
      }
    })
  } catch (error) {
    console.error('Error fetching RemoteOK jobs:', error.message)
    return []
  }
}

/**
 * Cleans HTML content and special characters from text
 * @param {string} content - HTML content to clean
 * @returns {string} - Clean text
 */
function cleanDescription(content) {
  return content
    .replace(/<(?:.|\n)*?>/gm, '')
    .replace(/&amp;/gm, '&')
    .replace(/&#8211;/gm, '-')
    .replace(/&rsquo;|&#8217;|&#8216;|&#8220;|&#8221;|&nbsp;|&ldquo;|&rdquo;/gm, '"')
    .trim()
}

/**
 * Fetches remote job listings from WeWorkRemotely RSS feeds
 * @returns {Array} - Formatted job listings
 */
async function fetchWeWorkRemotelyJobs() {
  // Use axios directly instead of rss-parser to bypass 403 errors
  const urls = [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-customer-support-jobs.rss',
    'https://weworkremotely.com/categories/remote-product-jobs.rss',
    'https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss',
    'https://weworkremotely.com/categories/remote-copywriting-jobs.rss',
    'https://weworkremotely.com/categories/remote-design-jobs.rss',
    'https://weworkremotely.com/remote-jobs.rss',
    'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  ]
  const imgRegex = /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg|webp))/g
  const fallBackImage = 'https://weworkremotely.com/assets/wwr-social-fd7d545c56e975b65fae9cf49346aac95a8cdb4774b2c269af89ac8993141380.png'
  
  try {
    const jobResults = await Promise.all(
      urls.map(async (url) => {
        try {
          // Use fetchWithRetry with browser-like headers
          const response = await fetchWithRetry(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Referer': 'https://weworkremotely.com/',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            timeout: 15000 // 15 second timeout
          });
          
          // Extract items from XML using regex patterns
          const xmlData = response.data;
          const itemPattern = /<item>([\s\S]*?)<\/item>/g;
          const titlePattern = /<title>([\s\S]*?)<\/title>/;
          const linkPattern = /<link>([\s\S]*?)<\/link>/;
          const pubDatePattern = /<pubDate>([\s\S]*?)<\/pubDate>/;
          const descPattern = /<description>([\s\S]*?)<\/description>/;
          
          const items = [];
          let match;
          
          while ((match = itemPattern.exec(xmlData)) !== null) {
            try {
              const itemContent = match[1];
              const title = (itemContent.match(titlePattern) || [])[1] || '';
              const link = (itemContent.match(linkPattern) || [])[1] || '';
              const pubDate = (itemContent.match(pubDatePattern) || [])[1] || '';
              const content = (itemContent.match(descPattern) || [])[1] || '';
              
              // Skip if missing essential data
              if (!title || !link) continue;
              
              // Parse company and position
              const company = title.split(':')[0];
              const position = title.split(':')[1].slice(1) || 'Unknown Position';
              const imageUrl = content.match(imgRegex);
              const image = { uri: imageUrl ? imageUrl[0] : fallBackImage };
              
              // Extract tags from URL
              let tags = ['remote work'];
              if (url !== 'https://weworkremotely.com/remote-jobs.rss') {
                const urlTags = url.slice(45).split('.')[0].split('-');
                urlTags.pop(); // Remove 'jobs' from tags
                tags = [urlTags.join(' ')];
              }
              
              const date = new Date(pubDate).toUTCString();
              const description = cleanDescription(content);
              
              items.push({
                company,
                position,
                image,
                date,
                description,
                id: link,
                url: link,
                tags,
                source: 'WeWorkRemotely'
              });
            } catch (itemError) {
              console.error('Error processing WeWorkRemotely item:', itemError.message);
              // Continue with next item
            }
          }
          
          return items;
        } catch (error) {
          console.error(`Error fetching ${url}:`, error.message);
          return [];
        }
      })
    );
    
    // Flatten results and remove null/undefined entries
    return jobResults.flat().filter(Boolean);
  } catch (error) {
    console.error('Error fetching WeWorkRemotely jobs:', error.message);
    return []
  }
}

/**
 * Fetches RSS feed with retry capability
 * @param {string} url - The RSS feed URL to fetch
 * @param {Object} parserOptions - Options for the RSS parser
 * @returns {Promise<Object>} - Parsed RSS feed
 */
async function fetchRssWithRetry(url, parserOptions, maxRetries = 3) {
  let lastError;
  const parser = new Parser(parserOptions);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Fetching RSS from ${url} - attempt ${attempt + 1}`);
      return await parser.parseURL(url);
    } catch (error) {
      console.log(`RSS fetch attempt ${attempt + 1} failed for ${url}: ${error.message}`);
      lastError = error;
      
      // Don't wait on the last attempt
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff: 500ms, 1500ms, 4500ms, etc.
        const delay = 500 * Math.pow(3, attempt);
        console.log(`Retrying RSS fetch in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Fetches remote job listings from Remotive.io RSS feed
 * @returns {Array} - Formatted job listings
 */
async function fetchRemotiveJobs() {
  const parserOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/rss+xml, text/xml, application/xml;q=0.9, */*;q=0.8'
    },
    timeout: 10000 // 10 second timeout
  }
  const remotiveRssUrl = 'https://remotive.com/remote-jobs/feed'
  const fallBackImage = 'https://remotive.com/web/image/website/1/logo/Remotive?unique=33c627c'
  
  try {
    const feed = await fetchRssWithRetry(remotiveRssUrl, parserOptions)
    return feed.items.map(item => {
      const { title, content, pubDate, link, guid } = item
      
      // Parse company and position from title (format varies)
      let company = 'Unknown Company'
      let position = title
      
      // Try to extract company name from title patterns
      const titleMatch = title.match(/(.+) at (.+)/) || title.match(/(.+): (.+)/)
      if (titleMatch) {
        position = titleMatch[1].trim()
        company = titleMatch[2].trim()
      }
      
      // Extract image URL from content if available
      const imgRegex = /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg|webp))/g
      const imageUrl = content.match(imgRegex)
      const image = { uri: imageUrl ? imageUrl[0] : fallBackImage }
      
      // Clean description and extract categories
      const description = cleanDescription(content)
      const categoryMatch = content.match(/Categories: (.+?)</i)
      const tags = categoryMatch ? categoryMatch[1].split(',').map(tag => tag.trim()) : ['remote work']
      
      const date = new Date(pubDate).toUTCString()
      const id = guid || link
      
      return {
        id,
        company,
        position,
        date,
        image,
        description,
        url: link,
        tags,
        source: 'Remotive'
      }
    })
  } catch (error) {
    console.error('Error fetching Remotive jobs:', error.message)
    return []
  }
}

/**
 * Fetches remote job listings from Web3.career API
 * @returns {Array} - Formatted job listings
 */
async function fetchWeb3Jobs() {
  try {
    // Using the provided API token
    const web3JobsApi = 'https://web3.career/api/v1?token=oUKT4YEswSKx4DpAaxM5DwZJt3E9Nun2&remote=true&limit=100'
    
    const response = await fetchWithRetry(web3JobsApi, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    })
    
    // As per the API documentation, the array starts at index 2
    const web3Jobs = response.data[2] || []
    
    return web3Jobs.map((job) => {
      const { 
        id, 
        title, 
        company, 
        date_epoch,
        country, 
        city, 
        location,
        apply_url,
        tags,
        description 
      } = job
      
      // Use company logo if available, otherwise use a fallback image
      const fallBackImage = 'https://web3.career/img/web3-career-logo.png'
      const image = { uri: fallBackImage }
      
      // Format date to be consistent with other sources
      const formattedDate = new Date(parseInt(date_epoch) * 1000).toUTCString()
      
      // Process tags to match our format
      const jobTags = Array.isArray(tags) ? tags : ['web3', 'blockchain']
      
      // Ensure we include proper attribution via apply_url as requested by Web3.career
      
      return {
        id: `web3-${id}`, // Adding a prefix to ensure unique IDs across sources
        company,
        position: title,
        date: formattedDate,
        image,
        description,
        url: apply_url, // Using apply_url as required by the API provider
        tags: jobTags,
        location: location || `${city || ''} ${country || ''}`.trim(),
        source: 'Web3Jobs'
      }
    })
  } catch (error) {
    console.error('Error fetching Web3 jobs:', error.message)
    return []
  }
}

/**
 * Splits an array into chunks to stay under Firestore 1MB limit
 * @param {Array} jobs - Array of job objects
 * @param {number} chunkSize - Number of jobs per chunk
 * @returns {Array} - Array of job chunks
 */
function chunkJobs(jobs, chunkSize = 100) {
  const chunks = []
  for (let i = 0; i < jobs.length; i += chunkSize) {
    chunks.push(jobs.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * Helper function to fetch and aggregate jobs from all sources
 * Used by both the scheduled function and HTTP fallback
 */
async function fetchAndAggregateJobs(useServerTimestamp = true) {
  const startTime = Date.now()
  const sourcesMetadata = {}
  
  // Fetch jobs from all sources in parallel (Remote.co removed as it no longer works)
  const [remoteOkJobs, weWorkRemotelyJobs, remotiveJobs, web3Jobs] = await Promise.all([
    fetchRemoteOkJobs().catch(err => {
      console.error('RemoteOK fetch failed:', err.message)
      sourcesMetadata.RemoteOK = { count: 0, success: false, error: err.message }
      return []
    }),
    fetchWeWorkRemotelyJobs().catch(err => {
      console.error('WeWorkRemotely fetch failed:', err.message)
      sourcesMetadata.WeWorkRemotely = { count: 0, success: false, error: err.message }
      return []
    }),
    fetchRemotiveJobs().catch(err => {
      console.error('Remotive fetch failed:', err.message)
      sourcesMetadata.Remotive = { count: 0, success: false, error: err.message }
      return []
    }),
    fetchWeb3Jobs().catch(err => {
      console.error('Web3Jobs fetch failed:', err.message)
      sourcesMetadata.Web3Jobs = { count: 0, success: false, error: err.message }
      return []
    })
  ])
  
  // Track successful sources
  if (remoteOkJobs.length > 0) {
    sourcesMetadata.RemoteOK = { count: remoteOkJobs.length, success: true, error: null }
  }
  if (weWorkRemotelyJobs.length > 0) {
    sourcesMetadata.WeWorkRemotely = { count: weWorkRemotelyJobs.length, success: true, error: null }
  }
  if (remotiveJobs.length > 0) {
    sourcesMetadata.Remotive = { count: remotiveJobs.length, success: true, error: null }
  }
  if (web3Jobs.length > 0) {
    sourcesMetadata.Web3Jobs = { count: web3Jobs.length, success: true, error: null }
  }
  
  // Combine jobs from all sources
  const allJobs = [...remoteOkJobs, ...weWorkRemotelyJobs, ...remotiveJobs, ...web3Jobs]
  
  // Sort by date (newest first)
  const sortedJobs = allJobs.sort((job1, job2) => {
    const firstDate = Date.parse(job1.date)
    const secondDate = Date.parse(job2.date)
    return secondDate - firstDate
  })
  
  // Remove duplicates
  const jobsFinalList = removeDuplicates(sortedJobs)
  
  const updateDurationMs = Date.now() - startTime
  
  return {
    jobs: jobsFinalList,
    metadata: {
      lastUpdated: useServerTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
      jobCount: jobsFinalList.length,
      sources: sourcesMetadata,
      updateDurationMs
    }
  }
}

/**
 * Scheduled Cloud Function to update remote jobs cache hourly
 * Runs every hour via Cloud Scheduler (v2 API)
 * Splits jobs into chunks to avoid Firestore 1MB document limit
 */
exports.updateRemoteJobsCache = onSchedule({
  schedule: 'every 1 hours',
  timeoutSeconds: 540,
  memory: '512MiB'
}, async () => {
  try {
    console.log('Starting scheduled job cache update...')
    
    const result = await fetchAndAggregateJobs()
    
    // If no jobs were found from any source, log warning but don't fail
    if (result.jobs.length === 0) {
      console.warn('No jobs found from any source during scheduled update')
    }
    
    const db = admin.firestore()
    
    // Save jobs to cache using shared helper function
    await saveJobsToCache(result.jobs, result.metadata, db)
    
    console.log(`Cache updated successfully: ${result.jobs.length} jobs from ${Object.keys(result.metadata.sources).length} sources`)
    console.log(`Update took ${result.metadata.updateDurationMs}ms`)
  } catch (error) {
    console.error('Error updating job cache:', error)
    throw error
  }
})

/**
 * Helper function to save jobs to Firestore in chunks
 * Used by both scheduled function and HTTP fallback
 */
async function saveJobsToCache(jobs, metadata, db) {
  const batch = db.batch()
  
  // Split jobs into chunks of 100
  const jobChunks = chunkJobs(jobs, 100)
  console.log(`Splitting ${jobs.length} jobs into ${jobChunks.length} chunks`)
  
  // Store metadata in main document
  const metadataDoc = db.collection('remoteJobs').doc('metadata')
  batch.set(metadataDoc, {
    ...metadata,
    chunkCount: jobChunks.length,
    jobCount: jobs.length
  })
  
  // Delete old chunks (clean up previous data)
  const oldChunks = await db.collection('remoteJobs')
    .where('isChunk', '==', true)
    .get()
  
  oldChunks.forEach(doc => {
    batch.delete(doc.ref)
  })
  
  // Store each chunk as a separate document
  jobChunks.forEach((chunk, index) => {
    const chunkDoc = db.collection('remoteJobs').doc(`chunk_${index}`)
    batch.set(chunkDoc, {
      jobs: chunk,
      chunkIndex: index,
      isChunk: true,
      lastUpdated: metadata.lastUpdated
    })
  })
  
  // Commit all writes in a batch
  await batch.commit()
  console.log(`Saved ${jobs.length} jobs in ${jobChunks.length} chunks to cache`)
}

/**
 * Firebase function to get remote job listings from cache
 * Reads from Firestore chunks and aggregates them for fast response times
 * Returns a plain array for backward compatibility with existing clients (v2 API)
 */
exports.getRemoteJobs = onRequest({
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true
}, async (request, response) => {
      try {
        const db = admin.firestore()
        const metadataDoc = await db.collection('remoteJobs').doc('metadata').get()
        
        if (!metadataDoc.exists) {
          console.warn('Cache metadata does not exist, fetching live data and populating cache')
          
          // Fallback: fetch live data if cache doesn't exist
          const result = await fetchAndAggregateJobs(true)
          
          // Save to cache for next time using chunked approach
          try {
            await saveJobsToCache(result.jobs, result.metadata, db)
            console.log('Successfully populated initial cache')
          } catch (cacheError) {
            console.error('Failed to populate cache:', cacheError)
          }
          
          // Return plain array for backward compatibility
          return response.json(result.jobs)
        }
        
        const metadata = metadataDoc.data()
        
        // Read all job chunks in parallel
        const chunkCount = metadata.chunkCount || 0
        const chunkPromises = []
        
        for (let i = 0; i < chunkCount; i++) {
          chunkPromises.push(
            db.collection('remoteJobs').doc(`chunk_${i}`).get()
          )
        }
        
        const chunkDocs = await Promise.all(chunkPromises)
        
        // Aggregate all jobs from chunks
        const allJobs = []
        chunkDocs.forEach(doc => {
          if (doc.exists) {
            const chunkData = doc.data()
            allJobs.push(...chunkData.jobs)
          }
        })
        
        // Log cache metadata for monitoring (but don't return it to maintain compatibility)
        console.log(`Returning ${allJobs.length} jobs from cache (age: ${Math.floor((Date.now() - metadata.lastUpdated.toDate().getTime()) / 60000)} minutes)`)
        
        // Return plain array for backward compatibility with existing clients
        return response.json(allJobs)
      } catch (error) {
        console.error('Error reading from cache:', error)
        
        // Final fallback: try to fetch live data
        try {
          console.log('Attempting live fetch as final fallback')
          const result = await fetchAndAggregateJobs(true)
          
          // Try to save to cache
          try {
            await saveJobsToCache(result.jobs, result.metadata, db)
            console.log('Successfully populated cache after error recovery')
          } catch (cacheError) {
            console.error('Failed to populate cache during error recovery:', cacheError)
          }
          
          // Return plain array for backward compatibility
          return response.json(result.jobs)
        } catch (fallbackError) {
          console.error('Fallback fetch also failed:', fallbackError)
          return response.status(500).json({
            error: 'Failed to fetch jobs',
            message: error.message,
            timestamp: new Date().toISOString()
          })
        }
      }
})

