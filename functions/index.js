/* eslint-disable no-undef */
const functions = require('firebase-functions')
const Parser = require('rss-parser')
const axios = require('axios')

function removeDuplicates(jobsWithId) {
  return jobsWithId.reduce((acc, current) => {
    const duplicated = acc.find((job) => job.id === current.id)
    if (!duplicated) {
      return acc.concat(current)
    }
    return acc
  }, [])
}

exports.getRemoteJobs = functions.https.onRequest(async (request, response) => {
  // Get RemoteOk Jobs
  const remoteOkApi = 'https://remoteok.io/api'
  let remoteOkJobs = [];
  await axios.get(remoteOkApi)
   .then(res => remoteOkJobs = res.data)
   .catch(() => console.error('remoteOkApi is Down'))
  remoteOkJobs.shift() // removes api information
  
  let allJobs =  remoteOkJobs.length ? remoteOkJobs.map((job) => {
    const { logo, company_logo, id, company, position, date, url, description, tags } = job
    const rLogo = 'https://remoteok.io/assets/logo.png'
    const logoUri = logo ? logo : company_logo
    const image = logoUri ? { uri: logoUri } : { uri: rLogo }
    const formatedDate = new Date(date).toUTCString()

    return { id, company, position, date: formatedDate, image, description, url, tags }
  }) : [];

  // Get weWorkRemotely Jobs
  const parser = new Parser()
  const urls = [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-customer-support-jobs.rss',
    'https://weworkremotely.com/categories/remote-product-jobs.rss',
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss',
    'https://weworkremotely.com/categories/remote-copywriting-jobs.rss',
    'https://weworkremotely.com/categories/remote-design-jobs.rss',
    'https://weworkremotely.com/categories/remote-jobs.rss',
    'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  ]
  const imgRegex = /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg|webp))/g
    
  return Promise.all(urls.map(async (url) => 
    await parser.parseURL(url)
      .then((feed) => feed.items.map((item) => {
        const { title, content, pubDate, link } = item  
        const company = title.split(':')[0]
        const position = title.split(':')[1].slice(1)
        const fallBackImage = 'https://weworkremotely.com/assets/wwr-social-fd7d545c56e975b65fae9cf49346aac95a8cdb4774b2c269af89ac8993141380.png'
        const imageUrl = content.match(imgRegex)
        const image = { uri: imageUrl ? imageUrl[0] : fallBackImage}
        const tags = url.slice(45).split('.')[0].split('-')
        tags.pop()
        const date = new Date(pubDate).toUTCString()
        const description = content
        .replace(/<(?:.|\n)*?>/gm, '')
        .replace(/&amp;/gm, '&')
        .replace(/&#8211;/gm, '-')
        .replace(
          /&rsquo;|&#8217;|&#8216;|&#8220;|&#8221;|&nbsp;|&ldquo;|&rdquo;/gm,
          '"'
          )
          .trim()
          
          return { company, position, image, date, description, id: link, url: link, tags: [tags.join(' ')] }
      })
    )
    .catch(() => console.error(`${url} is not working`))
  ))
    .then((res) => {
      if (res.length < 5) console.log(res)
      res.forEach((jobs) => jobs ? allJobs = [...allJobs, ...jobs] : allJobs = [...allJobs])
      const sortedJobs = allJobs.sort((job1, job2) => {
        const firstDate = Date.parse(job1.date)
        const secondDate = Date.parse(job2.date)
        if (firstDate > secondDate) {
          return -1
        } else if (firstDate < secondDate) {
          return 1
        } else {
          return 0
        }
      })
      
      const jobsFinalList = removeDuplicates(sortedJobs)

      return response.json(jobsFinalList)
    }
  )
  .catch((err) => console.error(err))
})
  