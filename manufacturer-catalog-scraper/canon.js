/* 
    Load in common functions and variables
*/
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const axios = COMMON.axios
const SCRAPINGBEE = COMMON.SCRAPINGBEE

const self = {
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    $: null,
    url: 'https://shop.usa.canon.com/shop/en/catalog/cameras/eos-dslr-and-mirrorless-interchangeable-lens-cameras',
    

    /* 
        Gets product links from main page for later scraping
    */
    getLinks: async() => { 
        return new Promise(async (resolve, reject) => { 

            try {
                console.log("Getting product links") 
                let res = axios.get('https://app.scrapingbee.com/api/v1', {
                    params: {
                        'api_key': SCRAPINGBEE,
                        'url': self.url, 
                        'render_js': 'false',
                        'extract_rules': '{ "all_links" : { "selector": "div.product_name > a",  "type": "list", "output": "@href" }}', 
                    } 
                }).then(function (response) {
                    // handle success
                    // Store links in productLinks array for later use
                    self.productLinks.push(response.data)
                    let urls = response.data
                    console.log("Got product links")
                    // self.productLinks[0].all_links
                    return resolve(urls) 
                })

            } catch (error) { 
                return reject(error)
            }
        })
         
    },

    /* 
        Initialize new puppeteer headless browser
        Don't load CSS or images for improved speed
    */
    initPuppeteer: async() => {
        console.log("Initializing Puppeteer")

        self.browser = await puppeteer.launch({
            headless: false,
        });
        self.page = await self.browser.newPage();
    
        //turns request interceptor on
        await self.page.setRequestInterception(true);
    
        //if the page makes a  request to a resource type of image or stylesheet then abort that request
        self.page.on('request', request => {
            if (request.resourceType() === 'image' || request.resourceType() === 'stylesheet')
                request.abort();
            else
                request.continue();
        });
    },

    /* 
        SCRAPING FUNCTION: Scrape individual product page for all the info we want to collect
    */
    scrapePage: async() => {
        console.log("Going to website") 

        return new Promise(async (resolve, reject) => { 
            try { 
                await self.initPuppeteer() 
                console.log(self.productLinks[0].all_links)
                let url = 'https://shop.usa.canon.com' + self.productLinks[0].all_links[0]
                console.log(`Going to url ${url}`)
                // make sure browser is initialized 
                if (self.browser) { 
                    // open up the page
                    
                    await self.page.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
        
                    self.content = await self.page.content();
                    self.$ = cheerio.load(self.content);
                    let html = self.$.html()
                
                    console.log("Got the html");
                    self.browser.close() 
                    return resolve(html)
                }

            } catch (e) { 
                return reject(e)
            }
        })

        
    },

    app: async() => { 
        try { 
            var tasks = [self.getLinks, self.scrapePage]
            for (const fn of tasks) { 
                await fn()
            }
        } catch (e) { 
            console.log(e);
            throw e;
        }
    }

}

module.exports = self