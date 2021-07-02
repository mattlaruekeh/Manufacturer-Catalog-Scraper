/* 
    Load in common functions and variables
*/
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const autoscroll = COMMON.autoscroll
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const fs = COMMON.fs
const jsdom = COMMON.jsdom
const { JSDOM } = jsdom
const axios = COMMON.axios
const sharp = COMMON.sharp
const { Storage } = require('@google-cloud/storage');
const SCRAPINGBEE = COMMON.SCRAPINGBEE
const DEV_BUCKET = COMMON.DEV_BUCKET
const DEV_PROJECT_ID = COMMON.DEV_PROJECT_ID
const DEV_PROJECT_KEY = COMMON.DEV_PROJECT_KEY


const self = {
    dataSource: 'Sony',
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    url: 'https://electronics.sony.com/imaging/interchangeable-lens-cameras/c/all-interchangeable-lens-cameras',


    /* 
        Initialize new puppeteer headless browser
        Don't load CSS or images for improved speed
    */
    initPuppeteer: async () => {
        console.log("Initializing Puppeteer")

        return new Promise(async (resolve, reject) => {
            self.browser = await puppeteer.launch({
                headless: false,
                args: [`--window-size=${1920},${1080}`] // new option
            });
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

    /* 
        Gets product links from main page for later scraping
    */
    getLinks: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                await self.initPuppeteer()

                if (self.browser) { //
                    await self.page.goto(self.url, { waitUntil: 'domcontentloaded', timeout: 0 });
                    console.log(chalk.red('Scrolling'))
                    await self.autoScroll(self.page)
                    console.log(chalk.cyan('Finished Scrolling'))

                    // get all product links on page after dynamically scrolling
                    let productLinks = await self.page.$$eval('a.custom-product-grid-item__product-name', links => {
                        links = links.map(el => el.href)
                        return links
                    })

                    self.productLinks.push(productLinks)

                    console.log(chalk.blue("Got product links"))

                    // write links to file
                    fs.writeFileSync(`./data/${self.dataSource}/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks))

                    // write to GCP
                    let filename = `${self.dataSource}/productURLS/${self.dataSource}.json`
                    COMMON.saveToGCP(DEV_BUCKET, filename, self.productLinks) 

                    await self.browser.close()
                    return resolve(self.productLinks)
                }
            } catch (error) {
                return reject(error)
            }
        })
    },

    /* 
        Function to scroll the page so that we can load in the dynamic content
        source: https://stackoverflow.com/questions/51529332/puppeteer-scroll-down-until-you-cant-anymore
    */
    autoScroll: async (page) => {
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = 100;
                var timer = setInterval(() => {
                    var scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    },

    /* 
        SCRAPING FUNCTION: Scrape individual product page for all the info we want to collect
    */
    scrapePage: async () => {

        return new Promise(async (resolve, reject) => {
            try {
                await self.initPuppeteer()
                // goes to the first product link, need to loop through all still
                let url = self.productLinks[0][0]

                console.log(chalk.green(`Going to ${url}`))

                await self.page.goto(url,
                    { 
                        waitUntil: 'domcontentloaded', 
                        timeout: 0 
                    }
                );

                self.content = await self.page.content()
                let $ = cheerio.load(self.content);

                console.log(chalk.yellow("Got individual product page content"))

                let dateScraped = new Date().toISOString().slice(0, 10)
                
                // basic product info
                let sku = await self.page.$eval('#PDPOveriewLink > div > div > div > div.col-sm-5 > cx-page-slot.d-flex.Summary.has-components > app-custom-product-intro > div > h1 > span', el => el.innerText)
                let name = await self.page.$eval('#PDPOveriewLink > div > div > div > div.col-sm-5 > cx-page-slot.d-flex.Summary.has-components > app-custom-product-intro > div > p > p', el => el.innerText)
                let price = await self.page.$eval('div.d-flex.justify-content-between.align-items-center.mb-4 > div', el => el.innerText)
                
                // get all images from the page
                let images = await self.page.$$eval('img', images => { 
                    // get the image source 
                    images = images.map(el => el.src)
                    return images
                })

                // create filter to only look for product images
                let imageLookup = sku.split('/')[0]
                images = images.filter(item => (item.includes(imageLookup)))

                // bullet point list
                let overview = await self.page.$$eval('div.pdp-summary-highlights__content > ul > li', texts => { 
                    texts = texts.map(el => el.innerText.trim())
                    return texts
                })

                // longer, more descriptive copy
                let rawFeatures = await self.page.$$eval('.features-common', texts => { 
                    texts = texts.map(el => el.innerText.trim())
                    return texts
                })
                rawFeatures = rawFeatures.filter(item => item != '')
                rawFeatures = rawFeatures.filter(item => !(item.includes('Learn more')))
                let features = []
                // remove new lines 
                for (var i = 0; i < rawFeatures.length; i++) { 
                    const result = rawFeatures[i].replace(/\n|\r/g, "");
                    if (!features.includes(result)) { 
                        features.push(result)
                    }
                }

                // json object created
                const metadata = {
                    dateScraped: dateScraped,
                    dataSource: self.dataSource,
                    url: url,
                    productName: name, 
                    productSKU: sku,
                    productPrice: price,
                    images: images,
                    overview: overview,
                    features: features
                }

                console.log(metadata)

                // write data to file 
                fs.writeFileSync(`./data/${self.dataSource}/JSON/${name}.json`, JSON.stringify(metadata))

                // save JSON to GCP 
                COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/JSON/${name}.json`, JSON.stringify(metadata))
                
                // specs
                const specsTab = await self.page.$('#PDPSpecificationsLink > cx-page-slot.PDPSpecificationsSlot.has-components > app-product-specification > div > div > div.d-flex.justify-content-center > button')
                await specsTab.click() 
                let specsContent = await self.page.evaluate(() => document.querySelector('div.full-specifications__specifications-list').innerHTML);
                let fileName = `${self.dataSource} ${name} Specs`

                fs.writeFileSync(`./data/${self.dataSource}/TXT/${fileName}.html`, specsContent)

                // save specs html to GCP 
                COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)

                try { 
                    console.log('Printing to pdf')
                    let data = fs.readFileSync(`./data/${self.dataSource}/TXT/${fileName}.html`, "utf-8");
                    const browser = await puppeteer.launch();
                    const page = browser.newPage();
            
                    await (await page).setContent(data);
                    await (await page).emulateMediaType('screen');
                    await (await page).addStyleTag({ path: './css/sony.css'})

                    const pdfBuffer = await (await page).pdf({ 
                        path: `./data/${self.dataSource}/PDF/${fileName}.pdf`,
                        format: 'A4',
                        printBackground: true,
                        margin: {top: '35px', left: '35px', right: '35px'}
                    })

                    // save PDF to GCP 
                    COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/PDF/${fileName}.pdf`, pdfBuffer, 'pdf')
            
                    console.log('Done printing to pdf')

                    // save images to GCP
                    let images = metadata.images
                    for (var i = 0; i < images.length; i++) {
                        COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, `${self.dataSource}/images/${name}/${name} ${i}`)
                        .then(res => {
                        console.log(`Image saved`, res);
                        })
                        .catch(err => {
                        console.log(`Image error`, err);
                        });
                    }

                    await browser.close() 
                   
            
                } catch (e) { 
                    console.log(e)
                }
                
                await self.browser.close()
                return resolve(self.content)    


            } catch (e) {
                await self.browser.close()
                return reject(e)
            }
        })
    },

    /* 
        APP: wrapper function to execute the tasks in order
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