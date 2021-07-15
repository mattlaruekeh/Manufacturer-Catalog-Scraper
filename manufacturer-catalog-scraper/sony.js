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
    dataSource: 'Sony',
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
        'https://electronics.sony.com/imaging/interchangeable-lens-cameras/c/all-interchangeable-lens-cameras',
        'https://electronics.sony.com/imaging/c/lenses',
        'https://electronics.sony.com/imaging/compact-cameras/c/all-compact-cameras',
        'https://electronics.sony.com/imaging/camcorders/c/all-camcorders',
        'https://electronics.sony.com/imaging/imaging-accessories/c/media',
        'https://electronics.sony.com/imaging/imaging-accessories/c/imaging-lens-accessories',
        'https://electronics.sony.com/imaging/imaging-accessories/c/interchangeable-lens-camera-accessories',
        'https://electronics.sony.com/imaging/imaging-accessories/c/imaging-compact-camera-accessories',
        'https://electronics.sony.com/imaging/imaging-accessories/c/imaging-compact-camera-accessories'
    ],


    getProductLinks: async () => {

        return new Promise(async (resolve, reject) => {
            console.log('⌛ Getting product links ⌛')
            let api = axios.create({
            });
            const MAX_CONCURRENT_REQUESTS = 10;
            const manager = ConcurrencyManager(api, MAX_CONCURRENT_REQUESTS);

            const testURLS = [
                'https://electronics.sony.com/imaging/interchangeable-lens-cameras/c/all-interchangeable-lens-cameras',
            ]
            // replace with self.baseURLS
            Promise.all(self.baseURLS.map(url => api.get('https://app.scrapingbee.com/api/v1', {
                params: {
                    'api_key': SCRAPINGBEE,
                    'url': url,
                    'render_js': 'true',
                    'js_scroll': 'true',
                    'js_scroll_count': 15,
                    'js_scroll_wait': 800,
                    'extract_rules': '{ "all_links" : { "selector": "a.custom-product-grid-item__product-name",  "type": "list", "output": "@href" }}',
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
                    if (products[i] != null) {
                        edited.push(products[i])
                    }
                }
                edited = edited.flat()
                self.productLinks.push(edited)
                self.productLinks = self.productLinks.flat()

                // write links to file
                let path = `${self.dataSource}/productURLS/${self.dateScraped}_${self.dataSource}_product_links.json`
                let content = self.productLinks

                console.log(content)
                console.log(content.length)

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

        let prefix = 'https://electronics.sony.com/'

        let testURLS = [
            '/imaging/lenses/all-e-mount/p/sel35f28z',
            '/imaging/lenses/aps-c-e-mount/p/selp18200',
            '/imaging/lenses/a-mount-lens/p/sal1650',
            '/imaging/lenses/a-mount-lens/p/sal1118',
            'imaging/interchangeable-lens-cameras/full-frame/p/ilce9-b',
            '/imaging/interchangeable-lens-cameras/all-interchangeable-lens-cameras/p/ilce7sm3-b',
            '/imaging/imaging-accessories/imaging-lens-accessories/p/vclecf2',
            '/imaging/compact-cameras/all-compact-cameras/p/dscw800-b',
            '/imaging/camcorders/all-camcorders/p/hdrcx405-b',
            '/imaging/imaging-accessories/imaging-compact-camera-accessories/p/hvlf28rm'
        ]


        // Add prefix to dev URLS
        for (var i = 0; i < testURLS.length; i++) {
            testURLS[i] = prefix + testURLS[i]
        }


        // get array value from promise
        var arr = promise[0].value

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


        // Run on dev URLS: 
        /* for (var i = 0; i < testURLS.length; i++) {
            cluster.queue(testURLS[i]);
        } */

        // Queue only some urls
        /* for (var i = 0; i < 10; i++) {
            cluster.queue(urls[i])
        } */

        // Queue all URLS
        for (var i = 0; i < urls.length; i++) {
            cluster.queue(urls[i])
        }

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

            // basic product info
            // productSKU = await page.$eval('#PDPOveriewLink > div > div > div > div.col-sm-5 > cx-page-slot.d-flex.Summary.has-components > app-custom-product-intro > div > h1 > span', el => el.innerText)
            let arr = url.split('/')
            productSKU = arr[arr.length - 1]

            let productNameSelector = '#PDPOveriewLink > div > div > div > div.col-sm-5 > cx-page-slot.d-flex.Summary.has-components > app-custom-product-intro > div > p > p'
            try {
                productName = await page.$eval(productNameSelector, el => el.innerText)
            } catch (e) {
                productName = productSKU
            }

            try {
                productPrice = await page.$eval('div.d-flex.justify-content-between.align-items-center.mb-4 > div', el => el.innerText)
            } catch (e) {
                productPrice = 'Unknown'
            }


            // get all images from the page

            var imageSelector = '#PDPOveriewLink > div > div > div > div.col-sm-7 > cx-page-slot > app-custom-product-image > div > div > div.custom-pdp-image__thumbs > ngx-slick-carousel > div > div > div > div > cx-media > img'
            images = await page.$$eval(imageSelector, images => {
                // get the image source 
                images = images.map(el => el.src)
                return images
            })

            if (images.length == 0) {
                try {
                    imageSelector = "#PDPOveriewLink > div > div > div > div.col-sm-7 > cx-page-slot > app-custom-product-image > div > div > div.custom-pdp-image__main-img > cx-media > img"
                    let image = await page.$eval(imageSelector, el => el.src)
                    images.push(image)
                } catch (e) {
                }
            }

            // create filter to only look for product images
            // let imageLookup = productSKU.split('/')[0]
            // images = images.filter(item => (item.includes(imageLookup)))

            // bullet point list
            overview = await page.$$eval('div.pdp-summary-highlights__content > ul > li', texts => {
                texts = texts.map(el => el.innerText.trim())
                return texts
            })

            // longer, more descriptive copy
            let rawFeatures = await page.$$eval('.features-common', texts => {
                texts = texts.map(el => el.innerText.trim())
                return texts
            })
            rawFeatures = rawFeatures.filter(item => item != '')
            rawFeatures = rawFeatures.filter(item => !(item.includes('Learn more')))
            features = []
            // remove new lines 
            for (var i = 0; i < rawFeatures.length; i++) {
                const result = rawFeatures[i].replace(/\n|\r/g, "");
                if (!features.includes(result)) {
                    features.push(result)
                }
            }

            // json object created
            const metadata = {
                dateScraped: self.dateScraped,
                dataSource: self.dataSource,
                url: url,
                productName: productName,
                productSKU: productSKU,
                productPrice: productPrice,
                images: images,
                overview: overview,
                features: features
            }

            console.log(metadata)

            let path = `${self.dataSource}/JSON/${self.dateScraped}/${self.dateScraped}_${productSKU}_${productName}.json`;
            /* COMMON.saveToGCP(DEV_BUCKET, path, metadata) */
            COMMON.saveToGCP(PROD_BUCKET, path, metadata)

            // specs
            const specsTab = await page.$('#PDPSpecificationsLink > cx-page-slot.PDPSpecificationsSlot.has-components > app-product-specification > div > div > div.d-flex.justify-content-center > button')

            if (specsTab != null) {
                await specsTab.click()
                let specsContent = await page.evaluate(() => document.querySelector('div.full-specifications__specifications-list').innerHTML);
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
                        function (err, result) {
                            if (err) {
                                console.log('Error writing file', err);
                            }
                        }
                    )

                    await COMMON.generatePDF(self.dataSource, fileName)

                }
            }

            let promises = []
            for (var i = 0; i < images.length; i++) {
                // var imageName = images[i].split('/')
                // imageName = imageName[imageName.length - 1]
                var imageName = i
                let imageFilePath = `${self.dataSource}/images/${self.dateScraped}/${productName}/${self.dateScraped}_${productSKU}_${productName}_${imageName}`
                /* let promise = COMMON.processAndSaveImageToGCP(editedImages[i], DEV_BUCKET, imageFilePath)
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



        } catch (error) {
            console.log(error)
        }
    },

    getProductLinksWithCluster: async () => {
        console.log(chalk.green('🚀 Running cluster for product links 🚀'))

        let urls = []
        urls.push(self.url)

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
            monitor: true,
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

            console.log(chalk.cyan('Starting Scrolling'))
            await self.autoScroll(page)
            console.log(chalk.cyan('Finished Scrolling'))

            // get all product links on page after dynamically scrolling
            let productLinks = await page.$$eval('a.custom-product-grid-item__product-name', links => {
                links = links.map(el => el.href)
                return links
            })

            self.productLinks.push(productLinks)

            console.log(chalk.blue("Got product links"))

            console.log(self.productLinks)
        });

        cluster.queue(self.url)
        // for (var i = 0; i < urls.length; i++) {
        //     cluster.queue(urls[i])
        // }


        // close cluster once all the tasks are finished 
        await cluster.idle();
        await cluster.close();


        self.measurePerfomance(1) // measure task 1

    },

    /* 
        Initialize new puppeteer headless browser
        Don't load CSS or images for improved speed
    */
    initPuppeteer: async () => {
        console.log("Initializing Puppeteer")

        return new Promise(async (resolve, reject) => {
            self.browser = await puppeteer.launch({
                headless: true,
                args: [`--window-size=${1920},${1080}`] // new option
            });
            self.page = await self.browser.newPage();

            // change size of window
            await self.page.setViewport({
                width: 1920,
                height: 1080
            })

            // set user agent to avoid looking like a bot
            await self.page.setUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            );

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

                    self.measurePerfomance(1) // measure task 1

                    // write links to file
                    fs.writeFileSync(`./data/${self.dataSource}/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks))

                    // write to GCP
                    // let filename = `${self.dataSource}/productURLS/${self.dataSource}.json`
                    // COMMON.saveToGCP(DEV_BUCKET, filename, self.productLinks) 

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
                    await (await page).addStyleTag({ path: './css/sony.css' })

                    const pdfBuffer = await (await page).pdf({
                        path: `./data/${self.dataSource}/PDF/${fileName}.pdf`,
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '35px', left: '35px', right: '35px' }
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
        APP: wrapper function to execute the tasks in order
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