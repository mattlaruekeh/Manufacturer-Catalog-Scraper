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

const self = {
    dataSource: 'Nikon',
    dateScraped: new Date().toISOString().slice(0, 10),
    timeAtStart: performance.now(),
    timeAtTask: performance.now(),
    timeTakenForProductLinkTask: null,
    timeTakenForScrapingTask: null,
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    baseURLS: [
        'https://www.nikonusa.com/en/nikon-products/dslr-cameras/index.page',
        'https://www.nikonusa.com/en/nikon-products/mirrorless-cameras/index.page',
        'https://www.nikonusa.com/en/nikon-products/compact-digital-cameras/index.page',
        'https://www.nikonusa.com/en/nikon-products/camera-lenses/dslr-lenses/index.page',
        'https://www.nikonusa.com/en/nikon-products/camera-lenses/mirrorless-lenses/index.page',
        'https://www.nikonusa.com/en/nikon-products/binoculars/index.page',
        'https://www.nikonusa.com/en/nikon-products/rangefinders/index.page',
        'https://www.nikonusa.com/en/nikon-products/fieldscopes/index.page',
        'https://www.nikonusa.com/en/nikon-products/flashes/index.page',
        'https://www.nikonusa.com/en/nikon-products/photography-accessories/mirrorless-lens-accessories.page',
        'https://www.nikonusa.com/en/nikon-products/photography-accessories/dslr-lens-accessories.page',
        'https://www.nikonusa.com/en/nikon-products/sport-optics-accessories/binocular-accessories.page',
        'https://www.nikonusa.com/en/nikon-products/sport-optics-accessories/rangefinder-accessories.page',
        'https://www.nikonusa.com/en/nikon-products/sport-optics-accessories/fieldscope-accessories.page',
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
                'https://www.nikonusa.com/en/nikon-products/dslr-cameras/index.page',
                'https://www.nikonusa.com/en/nikon-products/photography-accessories/mirrorless-lens-accessories.page',
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
                    if (products[i] != null && products[i].includes('/product/')) {
                        edited.push(products[i])
                    }
                }
                edited = edited.flat()
                self.productLinks.push(edited)
                self.productLinks.flat()

                // write links to file
                let path = `${self.dataSource}/productURLS/${self.dateScraped}_${self.dataSource}_product_links.json`
                let content = self.productLinks
            
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

        let prefix = 'https://www.nikonusa.com'

        let testURLS = [
            "/en/nikon-products/product/dslr-cameras/d3500.html",
            "/en/nikon-products/product/dslr-cameras/d850.html",
            "/en/nikon-products/product/dslr-cameras/d7500.html",
            "/en/nikon-products/product/lens-hoods/hb-96-lens-hood.html",
            "/en/nikon-products/product/lens-hoods/hb-94-lens-hood.html",
            "/en/nikon-products/product/lens-caps/lc-52b-snap-on-front-lens-cap.html",
            "/en/nikon-products/product/lens-hoods/hb-98-bayonet-lens-hood.html"
        ]

        /* 
            Add prefix to dev URLS
            for (var i = 0; i < testURLS.length; i++) {
                testURLS[i] = prefix + testURLS[i]
            }
        */

        // get array value from promise
        var arr = promise[0].value[0]

        var urls = []

        for (var i = 0; i < arr.length; i++) {
            const result = prefix + arr[i]
            urls.push(result)
        }

        // console.log(urls)
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

        /* 
            Run on dev URLS: 
            for (var i = 0; i < testURLS.length; i++) {
                cluster.queue(testURLS[i]);
            }
        */

        /* 
            for (var i = 0; i < 10; i++) {
                cluster.queue(urls[i])
            } 
        */

        
            for (var i = 0; i < urls.length; i++) {
                cluster.queue(urls[i])
            }
       

        // close cluster once all the tasks are finished 
        await cluster.idle();
        await cluster.close();
        await self.measurePerfomance(2) // measure task 2

    },

    scrape: async (page) => {

        var [url, productName, productCategory,
            productName, productSKU, productPrice, compatibility,
            images, overview, features] = ''

        try {
            url = await page.url()

            /* 
                Categories: 
                dslr-cameras
                mirrorless-cameras
                camera-lenses
                lens-hoods
                lens-filters
                lens-caps
                lens-cleaner
                flashes 
                compact-digital-cameras
                mirrorless-lenses
                binoculars
                rangefinders
                fieldscopes
                lens-case
                apparel
                flash-adapters
                miscellaneous
                straps
                cases
                tripod-adaptors
                tripods

            */

            // assign product category based on url
            if (url.includes('dslr-cameras')) {
                productCategory = 'DSLR Cameras'
            } else if (url.includes('mirrorless-cameras')) {
                productCategory = 'Mirrorless Cameras'
            } else if (url.includes('camera-lenses')) {
                productCategory = 'Camera Lenses'
            } else if (url.includes('lens-hoods')) {
                productCategory = 'Lens Hoods'
            } else if (url.includes('lens-filters')) {
                productCategory = 'Lens Filters'
            } else if (url.includes('lens-caps')) {
                productCategory = 'Lens Caps'
            } else if (url.includes('lens-cleaner')) {
                productCategory = 'Lens Cleaner'
            } else if (url.includes('flashes')) {
                productCategory = 'Flashes'
            } else if (url.includes('compact-digital-cameras')) {
                productCategory = 'Compact Digital Camera'
            } else if (url.includes('mirrorless-lenses')) {
                productCategory = 'Mirrorless Lens'
            } else if (url.includes('binoculars')) {
                productCategory = 'Binoculars'
            } else if (url.includes('rangefinders')) {
                productCategory = 'Rangefinders'
            } else if (url.includes('fieldscopes')) {
                productCategory = 'Fieldscopes'
            } else if (url.includes('lens-case')) {
                productCategory = 'Lens Case'
            } else if (url.includes('apparel')) {
                productCategory = 'Apparel'
            } else if (url.includes('flash-adapters')) {
                productCategory = 'Flash Adapters'
            } else if (url.includes('miscellaneous')) {
                productCategory = 'Misc'
            } else if (url.includes('straps')) {
                productCategory = 'Straps'
            } else if (url.includes('cases')) {
                productCategory = 'Cases'
            } else if (url.includes('tripod-adaptors')) {
                productCategory = 'Tripod Adaptors'
            } else if (url.includes('tripods')) {
                productCategory = 'Tripods'
            } else { 
                productCategory = 'Unknown'
            }

            let title = await page.title()
            let prodTitle = title.split('|')[0]

            console.log((`Scraping ${prodTitle}`))

            let content = await page.content();
            let $ = cheerio.load(content);

            let html = $.html()
            global.document = new JSDOM(html).window.document;

            // luckily a lot of the information we want is already in a json format on the website

            let arr = document.querySelectorAll('script[type="application/ld+json"]')

            features = await page.$$eval('div.nkn-resp-pdp-description', texts => {
                texts = texts.map(el => el.innerText.trim())
                return texts
            })

            images = await page.$$eval(("#pdp-hero-carousel > ol > li > div > img"), images => {
                // get the image source 
                images = images.map(el => el.src)
                return images
            })

            compatibilitySelector = '#tab-ProductDetail-ProductTabs-CompatibleWith span.product-name'

            compatibility = await page.$$eval(compatibilitySelector, products => {
                products = products.map(el => el.textContent)
                return products
            })

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

            productName = json.name
            productSKU = json.sku
            productPrice = json.price
            overview = json.description

            // remove extraneous chars from product name
            productName = productName.replaceAll('/','')

            const metadata = {
                dateScraped: self.dateScraped,
                dataSource: self.dataSource,
                url: url,
                productName: productName,
                productCategory: productCategory,
                productSKU: productSKU,
                productPrice: productPrice,
                images: images,
                overview: overview,
                features: features,
                compatibility: compatibility,
                gtin12: json.gtin12
            }

            // console.log(metadata)

            let path = `${self.dataSource}/JSON/${self.dateScraped}_${self.dataSource}_${productName}.json`;
            /* COMMON.saveToGCP(DEV_BUCKET, path, metadata) */
            COMMON.saveToGCP(PROD_BUCKET, path, metadata)

            const element = document.querySelector('div.full-specs');
            if (element) { 
                let specsContent = $('div.full-specs').html()
                let fileName = `${self.dateScraped}_${self.dataSource}_${productName}_specs`
    
                if (specsContent != null) {
                    // save specs html to GCP 
                    /* COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent) */
                    COMMON.saveToGCP(PROD_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)
    
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
            for (var i = 0; i < images.length; i++) {
                var imageName = images[i].split('/')
                imageName = imageName[imageName.length - 1]
                let imageFilePath = `${self.dataSource}/images/${productName}/${self.dateScraped}/${productName}_${imageName}`
                /* let promise = COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, imageFilePath)
                    .catch(err => {
                        console.log(`Image error`, err);
                    });
                promises.push(promise) */

                let promise = COMMON.processAndSaveImageToGCP(images[i], PROD_BUCKET, imageFilePath)
                    .catch(err => {
                        console.log(`Image error`, err);
                    });
                promises.push(promise)
            }

            Promise.allSettled(promises).then(
                console.log(`📷  Images have been uploaded for ${productName} 📷`)
            )

            console.log(chalk.green(`😀 Finished scraping ${url} 😀`))

        } catch (e) {
            console.log(e)
        }
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

    readJSON: function (obj) {
        let json = JSON.parse(obj)

        /* 
            console.log("Found the following keys: ")
            for (key in json) {
                console.log(key)
            } 
        */

        let name = json.name
        let description = json.description
        let images = json.image

        let sku = json.sku
        let gtin12 = json.gtin12
        
        // catch price errors
        var price = ''
        if (json.offers) { 
            price = json.offers.price
        }
        

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

module.exports = self;