/* 
    Load in common functions and variables
*/
const { text } = require('cheerio/lib/api/manipulation');
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const axios = COMMON.axios
const SCRAPINGBEE = COMMON.SCRAPINGBEE

const self = {
    dataSource: 'Canon',
    productLinks: [],
    browser: null,
    page: null,
    content: null,
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
                    let urls = response.data
                    self.productLinks.push(urls)
                    console.log("Got product links")
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

        return new Promise(async (resolve, reject) => { 
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

            if (self.page) { 
                return resolve(self.page)
            } else { 
                return reject('Could not load page')
            }
        })
        
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
                let goTo = 'https://shop.usa.canon.com' + self.productLinks[0].all_links[0]
                console.log(`Going to url ${goTo}`)
                // make sure browser is initialized 
                if (self.browser) { 
                    // open up the page
                    await self.page.goto(goTo, {waitUntil: 'domcontentloaded', timeout: 0});
                    
                    // grab the html source
                    self.content = await self.page.content();
                    let $ = cheerio.load(self.content);
                    let html = $.html()
                    let url = self.page.url()
                    console.log("Got the html");

                    // start parsing through the html for what we want 

                    /* 
                        What we want: 
                        - Date Scraped 
                        - Camera Name 
                        - SKU 
                        - Price 
                        - Images 
                        - Overview 
                        - Features 
                        - Specifications 
                    */
                    
                    let dateScraped = new Date().toISOString().slice(0, 10)
                    
                    let productName = $('span[itemprop=name]').text()

                    let productSKU = $('span.sku').text().split(' ')[1]

                    let productPrice = $('span.final_price').text().trim().replace('$', '').replace(',', '')


                    let images = await self.page.$$eval('div.pdpImageCarosel > a > img', images => { 
                        // get the image source 
                        images = images.map(el => el.src)
                        return images
                    })
                    
                    let overview = await self.page.$$eval('div[aria-labelledby=tab1] > div.content p', texts => { 
                        texts = texts.map(el => el.innerText.trim())

                        
                        return texts
                    })
                    
                    // filter out null items and disclaimer text
                    overview = overview.filter(item => !(item.includes('Disclaimer')))
                    overview = overview.filter(item => item != '')

                    const metadata = { 
                        dateScraped: dateScraped,
                        dataSource:self.dataSource,
                        url: url,
                        productName: productName,
                        productSKU: productSKU,
                        productPrice: productPrice,
                        images: images,
                        overview: overview

                    }

                    console.log(metadata)


                    // close browser and resolve the promise once finished
                    self.browser.close() 
                    return resolve(html)
                }

            } catch (e) { 
                return reject(e)
            }
        })

        
    },

    /* 
        APP: wrapper function to execute the tasks in order
    */
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