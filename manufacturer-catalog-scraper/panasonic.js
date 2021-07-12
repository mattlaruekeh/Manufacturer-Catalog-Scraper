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
const PROD_BUCKET = COMMON.PROD_BUCKET
const DEV_PROJECT_ID = COMMON.DEV_PROJECT_ID
const DEV_PROJECT_KEY = COMMON.DEV_PROJECT_KEY
const { ConcurrencyManager } = require("axios-concurrency");
const {
    performance,
    PerformanceObserver
} = require('perf_hooks');
const { Cluster } = require('puppeteer-cluster');
const { pipeline } = require('stream');
const path = require('path');
const { error } = require('console');

/* Log errors to local file */

const log = `./logs`;
if (!fs.existsSync(log)) {
    fs.mkdirSync(log, {
        recursive: true
    });
}

var date = new Date().toISOString()
const  util = require('util');
var log_file = fs.createWriteStream(__dirname + `/logs/${date}_debug.log`, {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};

const self = {
    dataSource: 'Panasonic',
    dateScraped: new Date().toISOString().slice(0, 10),
    timeAtStart: performance.now(),
    timeAtTask: performance.now(),
    timeTakenForProductLinkTask: null,
    timeTakenForScrapingTask: null,
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    baseURLS: [ // note: these are static, no dynamic pagination. If running in the future check to make sure all product links are present
        // cameras
        'https://shop.panasonic.com/cameras-and-camcorders/cameras?srule=newest&sz=48',
        'https://shop.panasonic.com/cameras-and-camcorders/cameras?srule=newest&sz=48#srule=newest&start=48&sz=48&nextIndex=0',
        // camcorders
        'https://shop.panasonic.com/cameras-and-camcorders/camcorders',
        // accessories 
        'https://shop.panasonic.com/cameras-and-camcorders/camera-and-camcorder-accessories?srule=featured&start=288&sz=96#srule=featured&start=0&sz=96&nextIndex=0',
        'https://shop.panasonic.com/cameras-and-camcorders/camera-and-camcorder-accessories?srule=featured&start=288&sz=96#srule=featured&start=96&sz=96&nextIndex=0',
        'https://shop.panasonic.com/cameras-and-camcorders/camera-and-camcorder-accessories?srule=featured&start=288&sz=96#srule=featured&start=192&sz=96&nextIndex=0',
        'https://shop.panasonic.com/cameras-and-camcorders/camera-and-camcorder-accessories?srule=featured&start=288&sz=96#srule=featured&start=288&sz=96&nextIndex=0',
        'https://shop.panasonic.com/cameras-and-camcorders/camera-and-camcorder-accessories?srule=featured&start=288&sz=96#srule=featured&start=384&sz=96&nextIndex=0',
        // lenses
        'https://shop.panasonic.com/cameras-and-camcorders/lumix-camera-lenses?srule=newest&sz=48'
    ],
     
    
    /* 
        Loops through all the base category URLS to get the
        individual product links for later scraping
    */

    getProductLinks: async () => {

        return new Promise(async (resolve, reject) => {
            console.log('⌛ Getting product links ⌛')
            let api = axios.create({
            });
            const MAX_CONCURRENT_REQUESTS = 10;
            const manager = ConcurrencyManager(api, MAX_CONCURRENT_REQUESTS);

            const testURLS = [
                
            ]
            // replace with self.baseURLS
            Promise.all(self.baseURLS.map(url => api.get('https://app.scrapingbee.com/api/v1', {
                params: {
                    'api_key': SCRAPINGBEE,
                    'url': url,
                    'render_js': 'false',
                    'extract_rules': '{ "all_links" : { "selector": "a",  "type": "list", "output": "@href" }}',
                    'wait': 200
                }
            }))).then(responses => {
                let products = []
                for (var i = 0; i < responses.length; i++) {
                    let urls = responses[i].data.all_links
                    products.push(urls)
                }
                products = products.flat()

                let edited = []
                for (var i = 0; i < products.length; i++) {
                    if (products[i] != null && products[i].includes('/cameras-and-camcorders/')) {
                        edited.push(products[i])
                    }
                }
                edited = edited.flat()
                self.productLinks.push(edited)
                self.productLinks = self.productLinks.flat()
                // get rid of variant links
                self.productLinks = self.productLinks.filter(item => !(item.includes('?')))
                // get rid of overview links
                self.productLinks = self.productLinks.filter(item => (item.includes('html')))

                // write links to file
                let path = `${self.dataSource}/${self.dateScraped}/productURLS/${self.dateScraped}_${self.dataSource}_product_links.json`
                let content = self.productLinks

                // console.log(content)
            
                // write to GCP
                /* COMMON.saveToGCP(DEV_BUCKET, path, content) */
                COMMON.saveToGCP(PROD_BUCKET, path, content)

                console.log(chalk.green(`✅ Finished getting product links ✅`))
                self.measurePerfomance(1) // measure task 1

                manager.detach()
                return resolve(self.productLinks)

            }).catch(err => {
                console.log(err)
                manager.detach()
                return reject(err)
            })
        })

    },

    runCluster: async () => {
        let promises = []
        let promise = await self.getProductLinks()
        promises.push(promise)
        Promise.allSettled(promises).then(result => {
            self.cluster(result)
        })
    },

    cluster: async (promise) => {
        console.log(chalk.green('🚀 Running cluster 🚀'))

        let testURLS = [
            'https://shop.panasonic.com/cameras-and-camcorders/camera-and-camcorder-accessories/camera-accessories/DMW-DCC17.html',
            'https://shop.panasonic.com/cameras-and-camcorders/cameras/lumix-interchangeable-lens-ilc-cameras/DC-S1HBODY.html',
            'https://shop.panasonic.com/cameras-and-camcorders/cameras/lumix-point-and-shoot-cameras/DC-TS7.html',
            'https://shop.panasonic.com/cameras-and-camcorders/camcorders/HC-V770K.html',
            'https://shop.panasonic.com/cameras-and-camcorders/lumix-camera-lenses/S-R2060.html'
        ]

        // get array value from promise

        var urls = promise[0].value

        console.log(urls)

        let browserArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--incognito',  
        ]

        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 3,
            // monitor: true,
            timeout: 500000,
            puppeteerOptions: {
                args: browserArgs,
                ignoreHTTPSErrors: true,
            },
        });

        await cluster.task(async ({ page, data: url }) => {
            //turns request interceptor on
            await page.setRequestInterception(true);

            //if the page makes a  request to a resource type of image or stylesheet then abort that request
            page.on('request', request => {
                // to block stylesheets as well add request.resourceType() === 'stylesheet'
                if (request.resourceType() === 'image' || request.resourceType() === 'stylesheet')
                    request.abort();
                else
                    request.continue();
            });

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
            await self.scrape(page)
        });

        
            // Run on dev URLS: 
            for (var i = 0; i < testURLS.length; i++) {
                cluster.queue(testURLS[i]);
            }
       

        /* 
            for (var i = 0; i < 10; i++) {
                cluster.queue(urls[i])
            } 
        */

        
            /* for (var i = 0; i < urls.length; i++) {
                cluster.queue(urls[i])
            } */
       

        // close cluster once all the tasks are finished 
        await cluster.idle();
        await cluster.close();
        await self.measurePerfomance(2) // measure task 2

    },

    scrape: async (page) => {

        var [url, productName, productSKU, productCategory,
            productPrice, compatibility,
            images, overview, features] = ''

        try {
            url = await page.url()

            console.log(chalk.bgMagenta(`Scraping ${url}`))

            let content = await page.content();
            let $ = cheerio.load(content);

            let html = $.html()
            global.document = new JSDOM(html).window.document;

            productName = $('h1.product-name').text()
            productName = productName.split('\n').join('');
            productName = productName.split('/').join('');
            productName = productName.trim();

            productSKU = $('span[itemprop=productID]').text()
                    
            productPrice = $('span.price-sales').attr('warrantyprice')

            let rawImages = await page.$$eval('img', images => { 
                // get the image source 
                images = images.map(el => el.src)
                return images
            })

            // all images on the page including the copy images
            let productImages = rawImages.filter(item => (item.includes('/product/images/')))
            let editedImages = []
            
            // remove extraneous sizing info from end of image
            for (var i = 0; i< productImages.length; i++) {
                var str = productImages[i]
                var ind = str.indexOf('?')
                str = str.replace(str.substring(ind), "");
                editedImages.push(str)
            }
            editedImages = editedImages.filter(item => item != '')

            images = editedImages

            // bullet point overview
            let rawOverview = $('span.feature-content').text().split('\n\t')
            rawOverview = rawOverview.filter(item => item != '')
            overview = []
            
            // remove new lines 
            for (var i = 0; i < rawOverview.length; i++) { 
                const result = rawOverview[i].split('\n').join('');
                overview.push(result)
            }

            // get more features copy
            let rawFeatures = await page.$$eval('.ads-container-1', features => { 
                features = features.map(elm => elm.innerText)
                return features
            })
            
            features = []
            for (var i = 0; i < rawFeatures.length; i++) { 
                const result = rawFeatures[i].split('\n').join('');
                features.push(result)
            }
            

            const metadata = { 
                dateScraped: self.dateScraped,
                dataSource:self.dataSource,
                url: url,
                productName: productName,
                productSKU: productSKU,
                productPrice: productPrice,
                images: images,
                overview: overview,
                features: features
            }

            // console.log(metadata)

            let path = `${self.dataSource}/JSON/${self.dateScraped}/${self.dateScraped}_${productSKU}_${productName}.json`;
            /* COMMON.saveToGCP(DEV_BUCKET, path, metadata) */
            COMMON.saveToGCP(PROD_BUCKET, path, metadata)

            // const element = document.querySelector('a.more-specification-link');
            const specs = await page.$('a.more-specification-link')
            if (specs != null) { 
                // const specs = await page.$('a.more-specification-link')
                await specs.click()
                await page.waitForTimeout(700)

                await page.waitForSelector('.specification-holder-ul')
                let specsContent = $('.specification-holder-ul').html()
                let fileName = `${self.dateScraped}_${productSKU}_${productName}_specs`
    
                if (specsContent != null) {
                    // save specs html to GCP 
                    /* COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent) */
                    COMMON.saveToGCP(PROD_BUCKET, `${self.dataSource}/HTML/${self.dateScraped}/${fileName}.html`, specsContent)
    
                    const dir = `./data/${self.dataSource}/HTML`;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, {
                            recursive: true
                        });
                    }
    
                    fs.writeFileSync(`./data/${self.dataSource}/HTML/${fileName}.html`, specsContent, 
                        function(err, result) {
                            if(err) { 
                                console.log('Error writing file', err);
                            }
                        }   
                    )
    
                    await COMMON.generatePDF(self.dataSource, fileName)
    
                }
            }

            let promises = []
            for (var i = 0; i < editedImages.length; i++) {
                var imageName = editedImages[i].split('/')
                imageName = imageName[imageName.length - 1]
                let imageFilePath = `${self.dataSource}/images/${self.dateScraped}/${productName}/${self.dateScraped}_${productSKU}_${productName}_${imageName}`
                /* let promise = COMMON.processAndSaveImageToGCP(editedImages[i], DEV_BUCKET, imageFilePath)
                    .catch(err => {
                        console.log(`Image error`, err);
                    });
                promises.push(promise) */

                let promise = COMMON.processAndSaveImageToGCP(editedImages[i], PROD_BUCKET, imageFilePath)
                    .catch(err => {
                        console.log(`Image error`, err);
                    });
                promises.push(promise)
            }

            Promise.allSettled(promises).then(
                console.log(`📷  Images have been uploaded for ${productName} 📷`)
            )


            console.log(chalk.green(`😀 Finished scraping ${url} 😀`))

        } catch (error) {
            console.log(error)
        }

    },



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

                    fs.writeFileSync(`./data/Panasonic/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks))

                    // write to GCP
                    let filename = `${self.dataSource}/productURLS/${self.dataSource}.json`
                    COMMON.saveToGCP(DEV_BUCKET, filename, self.productLinks) 

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

                    var productName = $('h1.product-name').text()
                    productName = productName.split('\n').join('');

                    let productSKU = $('span[itemprop=productID]').text()
                    
                    let productPrice = $('span.price-sales').attr('warrantyprice')

                    let images = await self.page.$$eval('img', images => { 
                        // get the image source 
                        images = images.map(el => el.src)
                        return images
                    })

                    // all images on the page including the copy images
                    images = images.filter(item => (item.includes('/product/images/')))

                    // just product images
                    let productImages = []
                    productImages = images.filter(item => (item.includes('ALT')))
                    let editedImages = []
                    
                    // resize the product images from 80 x 80 to 400 x 400 
                    for (var i = 0; i< productImages.length; i++) { 
                        if (productImages[i].includes('80')) { 
                            const result = productImages[i].split('80').join('400');
                            editedImages.push(result)
                        }
                    }

                    // save images to GCP
                    for (var i = 0; i < editedImages.length; i++) {
                        COMMON.processAndSaveImageToGCP(editedImages[i], DEV_BUCKET, `${self.dataSource}/images/${productName}/${productName} ${i}`)
                        .then(res => {
                        console.log(`Image saved`, res);
                        })
                        .catch(err => {
                        console.log(`Image error`, err);
                        });
                    }
                    
                    // bullet point overview
                    let rawOverview = $('span.feature-content').text().split('\n\t')
                    rawOverview = rawOverview.filter(item => item != '')
                    let overview = []
                    
                    // remove new lines 
                    for (var i = 0; i < rawOverview.length; i++) { 
                        const result = rawOverview[i].split('\n').join('');
                        overview.push(result)
                    }

                    // get more features copy
                    let rawFeatures = await self.page.$$eval('.ads-container-1', features => { 
                        features = features.map(elm => elm.innerText)
                        return features
                    })
                    console.log(rawFeatures)
                    let features = []
                    for (var i = 0; i < rawFeatures.length; i++) { 
                        const result = rawFeatures[i].split('\n').join('');
                        features.push(result)
                    }

                    // generate PDF of specs 
                    const specs = await self.page.$('a.more-specification-link')
                    await specs.click()
                    await self.page.waitForTimeout(2000)

                    await self.page.waitForSelector('.specification-holder-ul')
                    let specsContent = $('.specification-holder-ul').html()
                    let fileName = `${self.dataSource} ${productName} Specs`

                    fs.writeFileSync(`./data/Panasonic/TXT/${fileName}.html`, specsContent)

                    // save to GCP 
                    COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)

                    try { 
                        console.log('Printing specs content to pdf')
                        var data = fs.readFileSync(`./data/Panasonic/TXT/${fileName}.html`, "utf-8");
                        // show elements that should be shown but have a css style of no display
                        data = data.split('style="display: none;"').join('');
                        data = data.split('<i>').join('');
                        data = data.split('</i>').join('');
                        /* 
                            Doesn't print bullet points in test environment, but
                            prints the bullet point here? WHY?!
                        */
                        data = data.split('style="display: list-item;"').join('');
                        const browser = await puppeteer.launch();
                        const page = browser.newPage();
                
                        await (await page).setContent(data);
                        await (await page).emulateMediaType('screen');
                        await (await page).addStyleTag({ path: './css/panasonic.css'})
                        
                        const pdfBuffer = await (await page).pdf({ 
                            path: `./data/Panasonic/PDF/${fileName}.pdf`,
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
                    

                    const metadata = { 
                        dateScraped: dateScraped,
                        dataSource:self.dataSource,
                        url: url,
                        productName: productName,
                        productSKU: productSKU,
                        productPrice: productPrice,
                        images: editedImages,
                        overview: overview,
                        features: features
                    }

                    console.log(metadata)

                    // write data to file 
                    fs.writeFileSync(`./data/Panasonic/JSON/${fileName}.json`, JSON.stringify(metadata))

                    // save JSON to GCP 
                    COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/JSON/${fileName}.json`, metadata)

                    await self.browser.close()
                }
            } catch (e){ 
                console.log(e)
                await self.browser.close()
            }
        })
    },

    measurePerfomance: async (taskNumber) => {
        var t1 = performance.now()
        let milliseconds = (t1 - self.timeAtTask)
        let timeTaken = COMMON.msToTime(milliseconds)

        if (taskNumber == 1) { // getting links
            self.timeTakenForProductLinkTask = timeTaken
            console.log(`Time taken for getting links: ${timeTaken}`)
        } else if (taskNumber == 2) { // scraping page
            self.timeTakenForScrapingTask = timeTaken
            console.log(`Time taken for scraping ${self.productLinks.length} links: ${timeTaken}`)
        } else { // total time taken 
            console.log(`Total time taken: ${timeTaken}`)
        }

        // reset timer 
        self.timeAtTask = performance.now()
    },

    /* 
        APP: main wrapper script
    */
    app: async () => {
        try {
            var tasks = [self.runCluster]
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