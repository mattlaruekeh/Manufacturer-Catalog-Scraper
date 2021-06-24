/* 
    Load in common functions and variables
*/
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const jspdf = COMMON.jspdf
const fs = COMMON.fs
const html2canvas = COMMON.html2canvas
const jsdom = COMMON.jsdom
const { JSDOM } = jsdom;
const axios = COMMON.axios
const SCRAPINGBEE = COMMON.SCRAPINGBEE

const self = {
    dataSource: 'Panasonic',
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    url: 'https://shop.panasonic.com/cameras-and-camcorders/cameras',

    /* 
        Get product links for deeper scraping
    */
    getLinks: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                console.log("Getting product links")
                let res = axios.get('https://app.scrapingbee.com/api/v1', {
                    params: {
                        'api_key': SCRAPINGBEE,
                        'url': self.url,
                        'render_js': 'false',
                        'extract_rules': '{ "all_links" : { "selector": "a",  "type": "list", "output": "@href" }}',
                    }
                }).then(function (response) {
                    // handle success
                    // Store links in productLinks array for later use
                    let urls = response.data

                    
                    var urlsDesired = [
                        '/cameras-and-camcorders/cameras/lumix-point-and-shoot-cameras/',
                        '/cameras-and-camcorders/cameras/lumix-interchangeable-lens-ilc-cameras/',

                    ]
                    for (var i = 0; i < urls.all_links.length; i++) {
                        if (urls.all_links[i] && urls.all_links[i].includes('/cameras-and-camcorders/cameras/')) {
                            self.productLinks.push(urls.all_links[i])
                        }
                    }
                    // get rid of variant links
                    self.productLinks = self.productLinks.filter(item => !(item.includes('?')))
                    // get rid of overview links
                    self.productLinks = self.productLinks.filter(item => (item.includes('html')))
                    console.log("Got product links")
                    console.log(self.productLinks)
                    console.log(self.productLinks.length)

                    fs.writeFileSync(`./data/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks))
                    return resolve(urls)
                })
            } catch (e) {
                console.log(e)
                return reject(e)
            }
        })
    },

    initPuppeteer: async() => {
        console.log("Initializing Puppeteer")

        return new Promise(async (resolve, reject) => { 
            self.browser = await puppeteer.launch({ 
                headless: true,
                args: [`--window-size=${1920},${1080}`] // new option 
            })

            self.page = await self.browser.newPage();
            
            // change size of window
            await self.page.setViewport({
                width: 1920,
                height: 1080
            })
            
            //turns request interceptor on
            await self.page.setRequestInterception(true);
        
            //if the page makes a  request to a resource type of image or stylesheet then abort that request
            self.page.on('request', request => {
                // to block stylesheets as well add request.resourceType() === 'stylesheet'
                if (request.resourceType() === 'image')
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

    scrapePage: async() => { 
        return new Promise(async (resolve, reject) => { 
            try { 
                await self.initPuppeteer();
                // need to loop through all links still
                let goTo = self.productLinks[0]
                console.log(`Going to individual product page ${goTo}`)

                if (self.browser) { 
                    await self.page.goto(goTo, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 0
                    })
                    self.content = await self.page.content()
                    let $ = cheerio.load(self.content)
                    let html = $.html() 
                    global.document = new JSDOM(html).window.document
                    let url = await self.page.url()
                    console.log("Got html")

                    // parsing time 
                    let dateScraped = new Date().toISOString().slice(0, 10)

                    let productName = $('.pdp-prod-name').text()

                    let productSKU = $('span[itemprop=productID]').text()
                    
                    let productPrice = $('span.price-sales').attr('warrantyprice')

                    let images = await self.page.$$eval('img', images => { 
                        // get the image source 
                        images = images.map(el => el.src)
                        return images
                    })

                    // all images on the page including the copy
                    images = images.filter(item => (item.includes('/product/images/')))

                    // all product images
                    let productImages = []
                    productImages = images.filter(item => (item.includes('ALT')))
                    let editedImages = []
                    
                    // resize the images from 80 x 80 to 400 x 400 
                    for (var i = 0; i< productImages.length; i++) { 
                        if (productImages[i].includes('80')) { 
                            const result = productImages[i].split('80').join('400');
                            editedImages.push(result)
                        }
                    }
                    
                    let rawfeatures = $('span.feature-content').text().split('\n\t')
                    rawfeatures = rawfeatures.filter(item => item != '')
                    let features = []

                    for (var i = 0; i < rawfeatures.length; i++) { 
                        const result = rawfeatures[i].split('\n').join('');
                        features.push(result)
                    }

                    const metadata = { 
                        dateScraped: dateScraped,
                        dataSource:self.dataSource,
                        url: url,
                        productName: productName,
                        productSKU: productSKU,
                        productPrice: productPrice,
                        images: editedImages,
                        // overview: overview,
                        features: features
                    }

                    console.log(metadata)

                    await self.browser.close()
                }
            } catch (e){ 
                console.log(e)
                await self.browser.close()
            }
        })
    },

    /* 
        APP: main wrapper script
    */
    app: async () => {
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