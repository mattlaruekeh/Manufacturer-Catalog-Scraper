/* 
    Load in common functions and variables
*/
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const fs = COMMON.fs
const jsdom = COMMON.jsdom
const { JSDOM } = jsdom;
const axios = COMMON.axios
const SCRAPINGBEE = COMMON.SCRAPINGBEE
const DEV_BUCKET = COMMON.DEV_BUCKET
const DEV_PROJECT_ID = COMMON.DEV_PROJECT_ID
const DEV_PROJECT_KEY = COMMON.DEV_PROJECT_KEY

const self = {
    dataSource: 'Nikon',
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    url: 'https://www.nikonusa.com/en/nikon-products/dslr-cameras/index.page',

    /* 
        Get products from main page for later scraping
    */
    getLinks: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Getting product links')
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

                    for (var i = 0; i < urls.all_links.length; i++) {
                        if (urls.all_links[i] && urls.all_links[i].includes('/product/')) {
                            self.productLinks.push(urls.all_links[i])
                        }
                    }
                    console.log("Got product links")
                    console.log(self.productLinks)
                    
                    // write links to file
                    fs.writeFileSync(`./data/Nikon/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks))

                    // write to GCP
                    let filename = `${self.dataSource}/productURLS/${self.dataSource}.json`
                    COMMON.saveToGCP(DEV_BUCKET, filename, self.productLinks) 

                    return resolve(urls)
                })

            } catch (e) {
                return reject(e)
            }
        })
    },

    /* 
         Initialize headless browser
    */
    initPuppeteer: async () => {
        console.log("Initializing Puppeteer")

        return new Promise(async (resolve, reject) => {
            self.browser = await puppeteer.launch({
                headless: true,
                args: [`--window-size=${1920},${1080}`]
            })
            self.page = await self.browser.newPage();

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

        }) // end promise
    },

    scrapePage: async () => {


        return new Promise(async (resolve, reject) => {
            try {
                await self.initPuppeteer();
                /* 
                    currently set to go to the first product, need to make
                    this an array to loop through all of the products
                */
                let goTo = 'https://www.nikonusa.com' + self.productLinks[0]
                console.log(`Going to individual product page ${goTo}`)

                if (self.browser) {
                    await self.page.goto(goTo, {
                        waitUntil: 'domcontentloaded',
                        timeout: 0 // don't timeout request
                    })

                    self.content = await self.page.content();
                    let $ = cheerio.load(self.content)
                    let html = $.html()
                    global.document = new JSDOM(html).window.document;
                    let url = self.page.url()
                    let title = await self.page.title()

                    // let's start parsing! 

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

                    // luckily a lot of the information we want is already in a json format on the website

                    let arr = document.querySelectorAll('script[type="application/ld+json"]')

                    /* 
                        fix weird case for some product where first json doesn't have all images,
                        may have to get images another way 
                    */
                    var jsonObj
                    if (arr.length == 3) {
                        jsonObj = JSON.parse(JSON.stringify(arr[1].innerHTML))
                    } else {
                        jsonObj = JSON.parse(JSON.stringify(arr[0].innerHTML))
                    }

                    let json = self.readJSON(jsonObj)
                    
                    const metadata = {
                        dateScraped: dateScraped,
                        dataSource: self.dataSource,
                        url: url,
                        productName: json.name,
                        productSKU: json.sku,
                        productPrice: json.price,
                        images: json.images,
                        overview: json.description,
                        gtin12: json.gtin12
                    }

                    console.log(metadata)

                    /* 
                        Generate PDF of specs
                    */

                    let specsContent = $('div.full-specs').html()
                    let prodTitle = title.split('|')[0]

                    // save images to GCP
                    let images = metadata.images
                    for (var i = 0; i < images.length; i++) {
                        COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, `${self.dataSource}/images/${prodTitle}/${prodTitle} ${i}`)
                        .then(res => {
                        console.log(`Image saved`, res);
                        })
                        .catch(err => {
                        console.log(`Image error`, err);
                        });
                    }

                    let fileName = `${prodTitle}Specs`
                    fs.writeFileSync(`./data/Nikon/TXT/${fileName}.txt`, specsContent)

                    // save to GCP 
                    COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)

                    try { 
                        console.log("Printing specs content to PDF")
                        let data = fs.readFileSync(`./data/Nikon/TXT/${fileName}.txt`, "utf-8");
                        const browser = await puppeteer.launch() 
                        const page = browser.newPage()

                        await (await page).setContent(data);
                        await (await page).emulateMediaType('screen');
                        await (await page).addStyleTag({ path: './css/nikon.css'})
                        const pdfBuffer = await (await page).pdf({ 
                            path: `./data/Nikon/PDF/${fileName}.pdf`,
                            format: 'A4',
                            printBackground: true,
                            margin: {top: '35px', left: '35px', right: '35px'}
                        })

                        // save PDF to GCP 
                        COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/PDF/${fileName}.pdf`, pdfBuffer, 'pdf')
                
                        console.log('Done printing to pdf')
                        await browser.close() 

                    } catch (e) { 
                        console.log(e)
                    }

                    // write data to file 
                    fs.writeFileSync(`./data/Nikon/JSON/${fileName}.json`, JSON.stringify(metadata))

                    // save JSON to GCP 
                    COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/JSON/${fileName}.json`, metadata)

                    console.log('Done')
                    await self.browser.close()
                    return resolve(html)
                }

            } catch (e) {
                console.log(e)
                await self.browser.close()
                return reject(e)
            }
        })
    },

    readJSON: function (obj) {
        let json = JSON.parse(obj)

        console.log("Found the following keys: ")

        for (key in json) {
            console.log(key)
        }

        let name = json.name
        let description = json.description
        let images = json.image

        console.log(images)

        let sku = json.sku
        let gtin12 = json.gtin12
        let price = json.offers.price

        return {
            name,
            description,
            images,
            sku,
            gtin12,
            price
        }
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

module.exports = self;