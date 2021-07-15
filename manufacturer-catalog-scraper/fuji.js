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
    dataSource: 'Fuji',
    dateScraped: new Date().toISOString().slice(0, 10),
    timeAtStart: performance.now(),
    timeAtTask: performance.now(),
    timeTakenForProductLinkTask: null,
    timeTakenForScrapingTask: null,
    productLinks: [],
    baseURLS: [
        'https://fujifilm-x.com/global/products/cameras/',
        'https://fujifilm-x.com/global/products/lenses/',
        'https://fujifilm-x.com/global/products/accessories/lens-accessories/',
        'https://fujifilm-x.com/global/products/accessories/flash/',
        'https://fujifilm-x.com/global/products/accessories/camera-case/',
        'https://fujifilm-x.com/global/products/accessories/grip/',
        'https://fujifilm-x.com/global/products/accessories/power-supply/',
        'https://fujifilm-x.com/global/products/accessories/body-accessories/',
        'https://fujifilm-x.com/global/products/accessories/finder/'
    ],
    textFilter: [
        'COUNTRY / REGION', '©FUJIFILM Corporation.',
        'brazil', 'canada', 'USA', 'china', 'india', 'indonesia', 'Japan',
        'korea', 'malaysia', 'Philippines', 'singapore', 'thailand', 'Vietnam',
        'austria', 'belgium', 'croatia', 'czechia', 'denmark', 'estonia', 'finland',
        'france', 'germany', 'greece', 'hungary', 'iceland', 'ireland', 'italy', 'latvia',
        'lithuania', 'netherlands', 'norway', 'poland', 'portugal', 'romania', 'russia',
        'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland', 'turkey', 'UK', 'ukraine',
        'australia', 'global', 'cookies', 'For Business and Commercial Applications',
        'FOLLOW US', 'LEARN MORE', 'Be Inspired', 'Velvia', 'PRO Neg. Std', 'PRO Neg. Std',
        '©Philipp Rathmer', 'Tips', 'Product Movie',
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
            const MAX_CONCURRENT_REQUESTS = 5;
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
                    'wait': 400
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

                    if (products[i].includes('fujifilm-x.com/global/products/') ||
                        products[i].includes('https://fujifilm-x.com/global/products/lenses/') ||
                        products[i].includes('https://fujifilm-x.com/global/products/accessories/')) {
                        if (!self.productLinks.includes(products[i])) {
                            if (products[i] != 'https://fujifilm-x.com/global/products/accessories/') {
                                edited.push(products[i])
                            }
                        }
                    }
                }
                edited = edited.flat()
                self.productLinks.push(edited)
                self.productLinks = self.productLinks.flat()

                // write links to file
                let path = `${self.dataSource}/productURLS/${self.dateScraped}/${self.dateScraped}_${self.dataSource}_product_links.json`
                let content = self.productLinks

                // console.log(content)

                const links = `./data/${self.dataSource}/productURLS/${self.dateScraped}`;
                if (!fs.existsSync(links)) {
                    fs.mkdirSync(links, {
                        recursive: true
                    });
                }
                fs.writeFileSync(`./data/${path}`, JSON.stringify(content))

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


    /* 
        CLUSTER: Run cluster of puppeteer scraping tasks concurrently
    */

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

        /* 
        this list just for testing purposes, we can expand to all of the links
        generated in the previous function
        */
        let testURLS = [
            "https://fujifilm-x.com/global/products/cameras/gfx100/",
            "https://fujifilm-x.com/global/products/cameras/gfx100s/",
            "https://fujifilm-x.com/global/products/cameras/gfx-50s/",
            "https://fujifilm-x.com/global/products/cameras/gfx-50r/",
            'https://fujifilm-x.com/global/products/lenses/gf23mmf4-r-lm-wr/',
            "https://fujifilm-x.com/global/products/lenses/xf56mmf12-r/",
            "https://fujifilm-x.com/global/products/lenses/xf56mmf12-r-apd/",
            "https://fujifilm-x.com/global/products/lenses/xf60mmf24-r-macro/",
            "https://fujifilm-x.com/global/products/accessories/wcl-x100ii/",
            "https://fujifilm-x.com/global/products/accessories/lhcp-001/",
            "https://fujifilm-x.com/global/products/accessories/lhcp-002/",
            "https://fujifilm-x.com/global/products/accessories/lhcp-27/",
            "https://fujifilm-x.com/global/products/accessories/rlcp-001/",
        ]

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
            maxConcurrency: 4,
            monitor: false,
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
            // need different scrapers for each type of page
            if (url.includes('/cameras/')) {
                await self.scrapeCameraPage(page)
            } else if (url.includes('/lenses/')) {
                await self.scrapeLensePage(page)
            } else if (url.includes('/accessories/')) { // accessories
                await self.scrapeAccessoryPage(page)
            } else { }

        });

        for (var i = 0; i < urls.length; i++) {
            cluster.queue(urls[i]);
        }

        // close cluster once all the tasks are finished 
        await cluster.idle();
        await cluster.close();

        await self.measurePerfomance(2)
    },

    /* 
        Scraping function for cameras
    */
    scrapeCameraPage: async (page) => {

        var [url, productName, productCategory,
            productName, productSKU, compatibility,
            images, overview, features] = ''
        
        try {
            url = await page.url()

            let title = await page.title()

            console.log(chalk.black.bgWhite(`Scraping ${url}`))
    
            productCategory = 'Camera'
    
            let dateScraped = new Date().toISOString().slice(0, 10)
    
            // let productNameSelector = '.table_border-twotone.elementor-widget.elementor-widget-text-editor > div > div > table > tbody > tr:nth-child(1) > td'
            // productName = await page.$eval(productNameSelector, el => {
            //     return el.innerText
            // })

            // remove disallowed unicode characters from product name
            // productName = COMMON.cleanString(productName)
            productName = title.split('|')
            productName = productName[0]
    
            // get all images from the page
            let rawImages = await page.$$eval('img', images => {
                // get the image source 
                images = images.map(el => el.src)
                return images
            })

            // filter out the images
            var name = url.split('/')
            name = name[name.length - 2]
            productSKU = name

            images = rawImages.filter(img => img.includes(name))
            images = images.filter(img => !img.includes('icon'))
            images = images.filter(img => !img.includes('logo'))

            if (images.length == 0) { 
                images = rawImages.filter(img => img.includes('camera'))
                if (images.length == 0) { 
                    images = [
                        'https://www.keh.com/media/catalog/product/placeholder/default/placeholder-min_5.png'
                    ]
                }
            }
    
            // get the PDF brochure link
            let brochure = await page.$$eval('a', links => {
                links = links.map(el => el.href)
                brochure = links.filter(link => link.includes('catalogue'))
                return brochure
            })
    
            // overview 
            overview = await page.$$eval('p', text => {
                text = text.map(el => el.innerText)
                return text
            })
            // filter it out
            for (var i = 0; i < self.textFilter.length; i++) {
                overview = overview.filter(el => !el.includes(self.textFilter[i]))
            }
            overview = overview.filter(item => item != '')
    
            // json object of all the scraped data
            const metadata = {
                dataSource: 'Fuji',
                dateScraped: dateScraped,
                url: url,
                productCategory: productCategory,
                productName: productName,
                productSKU: name,
                productPrice: 'Unknown',
                images: images,
                overview: overview,
                brochure: brochure
            }

            console.log(metadata)
    
            let path = `${self.dataSource}/JSON/${self.dateScraped}/${self.dateScraped}_${productSKU}_${productName}.json`;

            const jsonPath = `./data/${self.dataSource}/JSON/${self.dateScraped}`;
            if (!fs.existsSync(jsonPath)) {
                fs.mkdirSync(jsonPath, {
                    recursive: true
                });
            }

            /* COMMON.saveToGCP(DEV_BUCKET, path, metadata) */
            COMMON.saveToGCP(PROD_BUCKET, path, metadata)
            fs.writeFileSync(`./data/${path}`, JSON.stringify(metadata))

            // PDF of specs content
            await page.goto(url + 'specifications/')
            let content = await page.content()
    
            let specsContent = await page.evaluate(() => document.querySelector('div.elementor-section-wrap').innerHTML);
            let fileName = `${self.dateScraped}_${productSKU}_${productName}_specs`
    
            // save specs html to GCP 
             // COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)
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
    
            let promises = []
            // save image to GCP 
            for (var i = 0; i < images.length; i++) {
                var imageName = images[i].split('/')
                imageName = imageName[imageName.length - 1]
                let imageFilePath = `${self.dataSource}/images/${self.dateScraped}/${productName}/${self.dateScraped}_${productName}_${imageName}`
                /* 
                    let promise = COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, imageFilePath)
                        .catch(err => {
                            console.log(`Image error`, err);
                        }); 
                */
                let promise = COMMON.processAndSaveImageToGCP(images[i], PROD_BUCKET, imageFilePath)
                .catch(err => {
                    console.log(`Image error for image url ${images[i]}`, err);
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
        Scraper for lense pages
    */
    scrapeLensePage: async (page) => {

        var [url, productName, productCategory,
            productName, productSKU, compatibility,
            images, overview, features, brochure] = ''

        try {
            url = await page.url()
            let title = await page.title()
    
            productCategory = 'Camera'
    
            console.log(chalk.bgCyan(`Scraping ${url}`))
    
            let dateScraped = new Date().toISOString().slice(0, 10)
    
            // https://stackoverflow.com/questions/44301160/how-can-i-access-to-a-variable-in-try-block-in-other-try-block
            try {
                var productNameSelector = '#wrap > nav.products_lnav > strong > a'
                const element = page.$(productNameSelector);
                if (element) { 
                    productName = await page.$eval(productNameSelector, el => {
                        return el.innerText
                    })
                }
            } catch (error) {
                productName = title.split('|')
                productName = productName[0]
                // productName = 'asdjaldkjasdkahsdkjahsfkjahfkjahdkjahs'
                console.log('Error getting product name', error)
            }
    
            // remove disallowed unicode characters from product name
            productName = COMMON.cleanString(productName)
    
            // sku is not found, but I figured I would at least record the ID
            var name = url.split('/')
            name = name[name.length - 2]
            productSKU = name
    
            // get images from fancy scrolling feature
            images = await page.$$eval('img', images => {
                images = images.map(el => el.src)
                return images
            })
    
            images = images.filter(img => !(img.includes('/common/')))
    
            // get the PDF brochure link
            brochure = await page.$$eval('a', links => {
                links = links.map(el => el.href)
                brochure = links.filter(link => link.includes('catalogue'))
                return brochure
            })
    
            // overview 
            overview = await page.$$eval('p', text => {
                text = text.map(el => el.innerText)
                return text
            })
    
            for (var i = 0; i < self.textFilter.length; i++) {
                overview = overview.filter(el => !el.includes(self.textFilter[i]))
            }
            overview = overview.filter(item => item != '')
            overview = overview.filter(item => item.length > 100)
    
            const metadata = {
                dataSource: 'Fuji',
                dateScraped: dateScraped,
                url: url,
                productCategory: productCategory,
                productName: productName,
                productSKU: productSKU,
                productPrice: 'Unknown',
                images: images,
                overview: overview,
                brochure: brochure
            }

            console.log(metadata)
    
            let path = `${self.dataSource}/JSON/${self.dateScraped}/${self.dateScraped}_${productName}.json`;
    
            const jsonPath = `./data/${self.dataSource}/JSON/${self.dateScraped}`;
            if (!fs.existsSync(jsonPath)) {
                fs.mkdirSync(jsonPath, {
                    recursive: true
                });
            }
    
            /* COMMON.saveToGCP(DEV_BUCKET, path, metadata) */
            COMMON.saveToGCP(PROD_BUCKET, path, metadata)
            fs.writeFileSync(`./data/${path}`, JSON.stringify(metadata))
    
            // PDF of specs content
            await page.goto(url + 'specifications/')
            let content = await page.content()
    
            let specsContent = await page.evaluate(() => document.querySelector('div.elementor-section-wrap').innerHTML);
            let fileName = `${self.dateScraped}_${productName}_specs`
            // save specs html to GCP 
            // COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)
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
    
            let promises = []
            // save image to GCP 
            for (var i = 0; i < images.length; i++) {
                var imageName = images[i].split('/')
                imageName = imageName[imageName.length - 1]
                let imageFilePath = `${self.dataSource}/images/${self.dateScraped}/${productName}/${self.dateScraped}_${productName}_${imageName}`
                /* 
                    let promise = COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, imageFilePath)
                        .catch(err => {
                            console.log(`Image error`, err);
                        }); 
                */
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
            
        } catch (error) {
            console.log(error)
        }  

    },

    /* 
        Scraper for accessory pages
    */
    scrapeAccessoryPage: async (page) => {
        var [url, productSKU, dateScraped, productCategory,
            productSubCategory, productName, compatibility,
            images, overview, brochure] = ''

        try {
            url = await page.url()

            // sku is not found, but I figured I would at least record the ID
            productSKU = url.split('/')
            productSKU = productSKU[productSKU.length - 2]

            console.log(chalk.bgMagenta(`Scraping ${url}`))

            productCategory = 'Accessories'
            productSubCategory = await page.$eval('p.ttl_category', el => el.innerText)

            productName = await page.$eval('h1.elementor-heading-title', el => el.innerText)

            image = await page.$eval('.lae-image', el => el.src)
            images = []
            images.push(image)

            overview = await page.$$eval('div.elementor-text-editor', el => {
                overview = el.map(el => el.innerText)
                return overview
            })

            dateScraped = new Date().toISOString().slice(0, 10)

            brochure = await page.$$eval('a', links => {
                links = links.map(el => el.href)
                brochure = links.filter(link => link.includes('.pdf'))
                return brochure
            })

            compatibilityArr = await page.$$eval('div.elementor-widget-container', el => {
                compatibility = el.map(el => el.innerText)
                return compatibility
            })

            let nc = []
            for (var i = 0; i < compatibilityArr.length; i++) {
                if (compatibilityArr[i] != '') {
                    nc.push(compatibilityArr[i])
                }
            }

            var index = nc.findIndex(el => el.includes('Compatibility'));

            var compatibilityStr = nc[index + 1]

            compatibilityArr = compatibilityStr.split('/')
            compatibility = []

            for (var i = 0; i < compatibilityArr.length; i++) {
                var result = compatibilityArr[i].split(' ').join('');
                compatibility.push(result)
            }

            const metadata = {
                dateScraped: dateScraped,
                dataSource: 'Fuji',
                url: url,
                productCategory: productCategory,
                productSubCategory: productSubCategory,
                productName: productName,
                productSKU: productSKU,
                productPrice: 'Unknown',
                compatibility: compatibility,
                images: images,
                overview: overview,
                brochure: brochure
            }

            console.log(metadata)

            let path = `${self.dataSource}/JSON/${self.dateScraped}/${self.dateScraped}_${productSKU}_${productName}.json`;

            const jsonPath = `./data/${self.dataSource}/JSON/${self.dateScraped}`;
            if (!fs.existsSync(jsonPath)) {
                fs.mkdirSync(jsonPath, {
                    recursive: true
                });
            }

            /* COMMON.saveToGCP(DEV_BUCKET, path, metadata) */
            COMMON.saveToGCP(PROD_BUCKET, path, metadata)
            fs.writeFileSync(`./data/${path}`, JSON.stringify(metadata))

            let promises = []
            // save image to GCP 
            for (var i = 0; i < images.length; i++) {
                var imageName = images[i].split('/')
                imageName = imageName[imageName.length - 1]
                let imageFilePath = `${self.dataSource}/images/${self.dateScraped}/${productName}/${self.dateScraped}_${productSKU}_${productName}_${imageName}`
                /* 
                    let promise = COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, imageFilePath)
                        .catch(err => {
                            console.log(`Image error`, err);
                        }); 
                */
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


        } catch (error) {
            console.log(error)
        } 
    },

    /* 
        Measure time taken for tasks
    */
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