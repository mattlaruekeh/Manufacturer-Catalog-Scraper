/* 
    Load in common functions and variables
*/
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
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
const { ConcurrencyManager } = require("axios-concurrency");
const {
    performance,
    PerformanceObserver
} = require('perf_hooks');
const { Cluster } = require('puppeteer-cluster');
const { pipeline } = require('stream');


const self = {
    dataSource: 'Canon',
    dateScraped: new Date().toISOString().slice(0, 10),
    timeAtStart: performance.now(),
    timeAtTask: performance.now(),
    timeTakenForProductLinkTask: null,
    timeTakenForScrapingTask: null,
    task2: null,
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    baseURLS: [
        // all cameras (not video)
        'https://shop.usa.canon.com/shop/en/catalog/cameras/eos-dslr-and-mirrorless-interchangeable-lens-cameras#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        // lenses
        'https://shop.usa.canon.com/shop/en/catalog/lenses-flashes/all-lenses#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/lenses-flashes/all-lenses#facet:&productBeginIndex:72&orderBy:&pageView:grid&pageSize:72&',
        // video camera
        'https://shop.usa.canon.com/shop/en/catalog/consumer-camcorders-video-cameras',
        'https://shop.usa.canon.com/shop/en/catalog/professional-camcorders-video-cameras',
        // eos accessories
        'https://shop.usa.canon.com/shop/en/catalog/eos-batteries-chargers-grips#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/eos-adapters-cables#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/eos-remote-controllers',
        'https://shop.usa.canon.com/shop/en/catalog/eos-cases-straps#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/eos-flash-accessories',
        'https://shop.usa.canon.com/shop/en/catalog/eos-viewing-accessories#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/eos-tripods-other-accessories#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/eos-dioptric-lenses',
        // powershot accessories
        'https://shop.usa.canon.com/shop/en/catalog/powershot-cases-straps#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/powershot-batteries-chargers#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/powershot-lens-accessories#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/powershot-adapters-cables#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/powershot-waterproof-cases#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/tripods-other-powershot-accessories#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        // ef and rf accessories 
        'https://shop.usa.canon.com/shop/en/catalog/lens-filters#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/lens-caps#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/lens-hoods#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/lens-hoods#facet:&productBeginIndex:72&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/gelatin-filter-holders#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/lens-cases-straps#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/extenders#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/other-lens-accessories#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        // camcorder accessories
        'https://shop.usa.canon.com/shop/en/catalog/camcorder-adapters-chargers#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/camcorder-batteries-cables#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/camcorder-cases-straps#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
        'https://shop.usa.canon.com/shop/en/catalog/camcorder-lens-attachments',
        'https://shop.usa.canon.com/shop/en/catalog/camcorder-lights',
        'https://shop.usa.canon.com/shop/en/catalog/camcorder-microphones',
        'https://shop.usa.canon.com/shop/en/catalog/other-camcorder-accessories'
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
                // all cameras (not video)
                'https://shop.usa.canon.com/shop/en/catalog/cameras/eos-dslr-and-mirrorless-interchangeable-lens-cameras#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
                // lenses
                'https://shop.usa.canon.com/shop/en/catalog/lenses-flashes/all-lenses#facet:&productBeginIndex:0&orderBy:&pageView:grid&pageSize:72&',
                'https://shop.usa.canon.com/shop/en/catalog/lenses-flashes/all-lenses#facet:&productBeginIndex:72&orderBy:&pageView:grid&pageSize:72&',
                // video camera
                'https://shop.usa.canon.com/shop/en/catalog/consumer-camcorders-video-cameras',
                'https://shop.usa.canon.com/shop/en/catalog/professional-camcorders-video-cameras',
            ]
            // replace with self.baseURLS
            Promise.all(testURLS.map(url => api.get('https://app.scrapingbee.com/api/v1', {
                params: {
                    'api_key': SCRAPINGBEE,
                    'url': url,
                    'render_js': 'false',
                    'extract_rules': '{ "all_links" : { "selector": "div.product_name > a",  "type": "list", "output": "@href" }}',
                    'wait': 200
                }
            }))).then(responses => {
                let products = []
                for (var i = 0; i < responses.length; i++) {
                    let urls = responses[i].data.all_links
                    products.push(urls)
                }
                products = products.flat()
                self.productLinks.push(products)
                self.productLinks.flat()

                // write links to file 
                let filename = `${self.dataSource}/productURLS/${self.dateScraped}_${self.dataSource}_product_links.json`
                fs.writeFileSync(`./data/${filename}`, JSON.stringify(self.productLinks))

                // write to GCP
                self.saveToGCP(DEV_BUCKET, filename, self.productLinks)

                console.log(chalk.green(`✅ Finished getting product links ✅`))
                self.measurePerfomance(1) // measure task 1
            }).catch(err => {
                console.log(err)
                return reject(err)
            })
            manager.detach()

            return resolve('Finished')
        })

    },

    /* 
        CLUSTER: Run cluster of puppeteer scraping tasks concurrently
    */

    cluster: async () => {
        console.log(chalk.green('🚀 Running cluster 🚀'))

        let prefix = 'https://shop.usa.canon.com'

        let testURLS = [
            "https://shop.usa.canon.com/shop/en/catalog/eos-1d-x-mark-iii-body",
            "https://shop.usa.canon.com/shop/en/catalog/eos-5d-mark-iv-body",
            "https://shop.usa.canon.com/shop/en/catalog/eos-5d-mark-iv-body-with-canon-log",
            "https://shop.usa.canon.com/shop/en/catalog/rf-600mm-f-4-l-is-usm",
            "https://shop.usa.canon.com/shop/en/catalog/rf-100mm-f-28-l-macro-is-usm",
            "https://shop.usa.canon.com/shop/en/catalog/rf-400mm-f-28-l-is-usm",
            "https://shop.usa.canon.com/shop/en/catalog/wifi-adapter-w-e1",
            "https://shop.usa.canon.com/shop/en/catalog/ac-adapter-ac-e6n-kit",
            "https://shop.usa.canon.com/shop/en/catalog/dc-coupler-dr-e19",
            "https://shop.usa.canon.com/shop/en/catalog/mini-hdmi-cable-htc-100",
            "https://shop.usa.canon.com/shop/en/catalog/stereo-video-cable-stv-250n",
            "https://shop.usa.canon.com/shop/en/catalog/shoulder-strap-ss-650",
        ]

        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 4,
            monitor: true,
            timeout: 500000
        });

        await cluster.task(async ({ page, data: url }) => {
            //turns request interceptor on
            await page.setRequestInterception(true);

            //if the page makes a  request to a resource type of image or stylesheet then abort that request
            page.on('request', request => {
                // to block stylesheets as well add request.resourceType() === 'stylesheet'
                if (request.resourceType() === 'image')
                    request.abort();
                else
                    request.continue();
            });

            // let fullPath = prefix + url
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
            await self.scrape(page)
        });

        for (var i = 0; i < testURLS.length; i++) {
            cluster.queue(testURLS[i]);
        }

        // close cluster once all the tasks are finished 
        await cluster.idle();
        await cluster.close();
    },

    scrape: async (page) => {

        var [url, productName, productCategory,
            productName, compatibility,
            images, overview, features] = ''

        try {
            url = await page.url()

            console.log(chalk.bgMagenta(`Scraping ${url}`))

            let content = await page.content();
            let $ = cheerio.load(content);

            productName = $('span[itemprop=name]').text()

            productCategory = $('#widget_breadcrumb > ul').text().trim().split('\\\n')[1]

            productSKU = $('span.sku').text().split(' ')[1]

            productPrice = $('span.final_price').text().trim().replace('$', '').replace(',', '')

            images = await page.$$eval('div.pdpImageCarosel > a > img', images => {
                // get the image source 
                images = images.map(el => el.src)
                return images
            })


            let overview = await page.$$eval('#tab1Widget > div.content p', texts => {
                texts = texts.map(el => el.innerText.trim())
                return texts
            })

            // filter out null items and disclaimer text
            overview = overview.filter(item => !(item.includes('Disclaimer')))
            overview = overview.filter(item => item != '')


            let tabs = await page.$$eval('.tab_container', tabs => {
                tabs = tabs.map(el => el.innerText)
                return tabs
            })

            if (tabs[1].includes('Features')) {
                // features in tab 2
                const tab2 = await page.$('div#tab2')
                await tab2.click()
                await page.waitForSelector('div[aria-labelledby=tab2]')

                features = await page.$$eval('#tab2Widget > div.content p', texts => {
                    texts = texts.map(el => el.innerText.trim())
                    return texts
                })

                features = features.filter(item => !(item.includes('Disclaimer')))

                // if (features == null) { 

                // }
                // for (var i = 0; i < rawFeatures[0].length; i++) {
                //     if (rawFeatures[0][i] != '') {
                //         features.push(rawFeatures[0][i].replace('\n', ''))
                //     }
                // }

                // specs in tab 3
                /* 
                    Save specs in formatted PDF file specs.pdf,
                    TODO: figure out how this will be stored on the server
                    and how to send the PDF to be stored and retrieved
                */

                const tab3 = await page.$('div#tab3')
                await tab3.click()
                let content = await page.content()

                let specsContent = $('div[aria-labelledby=tab3]').html()
                let fileName = `${self.dateScraped}_${self.dataSource}_${productName}_specs`

                // save specs html to GCP 
                COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)

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

                await self.generatePDF(fileName)

            } else { // accessory product
                const tab4 = await page.$('div#tab4')
                await tab4.click()
                let content = await page.content()

                let compatibilityArr = await page.$$eval('div[aria-labelledby=tab4]', texts => {
                    texts = texts.map(el => el.innerText.split('\n--'))
                    return texts
                })

                compatibility = []
                for (var i = 0; i < compatibilityArr[0].length; i++) {
                    if (compatibilityArr[0][i] != '') {
                        compatibility.push(compatibilityArr[0][i].replace('\n', ''))
                    }
                }
                compatibility = compatibility.filter(item => !(item.includes('Disclaimer')))
            }


            const metadata = {
                dateScraped: self.dateScraped,
                dataSource: self.dataSource,
                url: url,
                productCategory: productCategory,
                productName: productName,
                productSKU: productSKU,
                productPrice: productPrice,
                images: images,
                overview: overview,
                features: features,
                compatibility: compatibility
            }

            console.log(metadata)


            let jsonFile = `${self.dataSource}/JSON/${productName}/${self.dateScraped}_${productName}_scraped_data.json`

            // write data to file 
            // fs.writeFileSync(`./data/${jsonFile}`, JSON.stringify(metadata))

            // save JSON to GCP 
            self.saveToGCP(DEV_BUCKET, jsonFile, metadata)

            let promises = []
            // save image to GCP 
            for (var i = 0; i < images.length; i++) {
                var imageName = images[i].split('/')
                imageName = imageName[imageName.length - 1]
                let imageFilePath = `${self.dataSource}/images/${productName}/${self.dateScraped}/${productName}_${imageName}`
                let promise = COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, imageFilePath)
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
        SCRAPING FUNCTION: Scrape individual product page for all the info we want to collect
    */
    scrapePage: async () => {

        return new Promise(async (resolve, reject) => {
            try {
                await self.initPuppeteer()
                console.log(self.productLinks[0].all_links)
                let goTo = 'https://shop.usa.canon.com' + self.productLinks[0].all_links[0]
                console.log(`Going to individual product page ${goTo}`)
                // make sure browser is initialized 
                if (self.browser) {
                    // open up the page
                    await self.page.goto(goTo, { waitUntil: 'domcontentloaded', timeout: 0 });

                    // grab the html source
                    self.content = await self.page.content();
                    let $ = cheerio.load(self.content);
                    let html = $.html()
                    global.document = new JSDOM(html).window.document;
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

                    // save image to GCP 
                    for (var i = 0; i < images.length; i++) {
                        self.processAndSaveImageToGCP(images[i], `Canon/images/${productName}/${productName} ${i}`)
                            .then(res => {
                                console.log(`Image saved`, res);
                            })
                            .catch(err => {
                                console.log(`Image error`, err);
                            });
                    }

                    let overview = await self.page.$$eval('div[aria-labelledby=tab1] > div.content p', texts => {
                        texts = texts.map(el => el.innerText.trim())
                        return texts
                    })

                    // filter out null items and disclaimer text
                    overview = overview.filter(item => !(item.includes('Disclaimer')))
                    overview = overview.filter(item => item != '')

                    /* 
                        TODO: Potentially get information from the features and specs tab, 
                        have to check with Ken about what he wants
                    */

                    // features in tab 2
                    const tab2 = await self.page.$('div#tab2')
                    await tab2.click()
                    await self.page.waitForSelector('div[aria-labelledby=tab2]')

                    let rawFeatures = await self.page.$$eval('div[aria-labelledby=tab2]', texts => {
                        texts = texts.map(el => el.innerText.split('\n\n'))
                        return texts
                    })

                    let features = []
                    for (var i = 0; i < rawFeatures[0].length; i++) {
                        if (rawFeatures[0][i] != '') {
                            features.push(rawFeatures[0][i].replace('\n', ''))
                        }
                    }

                    // specs in tab 3
                    /* 
                        Save specs in formatted PDF file specs.pdf,
                        TODO: figure out how this will be stored on the server
                        and how to send the PDF to be stored and retrieved
                    */

                    const tab3 = await self.page.$('div#tab3')
                    await tab3.click()
                    await self.page.waitForTimeout(2000)

                    let specsContent = $('div[aria-labelledby=tab3]').html()
                    let fileName = `${self.dataSource} ${productName} Specs`

                    fs.writeFileSync(`./data/Canon/TXT/${fileName}.txt`, specsContent)

                    // save to GCP 
                    self.saveToGCP(DEV_BUCKET, `Canon/HTML/${fileName}.html`, specsContent)

                    try {
                        console.log('Printing to pdf')
                        let data = fs.readFileSync(`./data/Canon/TXT/${fileName}.txt`, "utf-8");
                        const browser = await puppeteer.launch();
                        const page = browser.newPage();

                        await (await page).setContent(data);
                        await (await page).emulateMediaType('screen');
                        await (await page).addStyleTag({ path: './css/canon.css' })

                        const pdfBuffer = await (await page).pdf({
                            // path: `./data/Canon/PDF/${fileName}.pdf`,
                            format: 'A4',
                            printBackground: true,
                            margin: { top: '35px', left: '35px', right: '35px' }
                        })

                        // save PDF to GCP 
                        self.saveToGCP(DEV_BUCKET, `Canon/PDF/${fileName}.pdf`, pdfBuffer, 'pdf')

                        console.log('Done printing to pdf')
                        await browser.close()


                    } catch (e) {
                        console.log(e)
                    }

                    const metadata = {
                        dateScraped: dateScraped,
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

                    // write data to file 
                    fs.writeFileSync(`./data/Canon/JSON/${fileName}.json`, JSON.stringify(metadata))

                    // save JSON to GCP 
                    self.saveToGCP(DEV_BUCKET, `Canon/JSON/${fileName}.json`, metadata)

                    console.log('Done')

                    // close browser and resolve the promise once finished
                    self.browser.close()
                    return resolve(html)
                }

            } catch (e) {
                return reject(e)
            }
        })


    },

    generatePDF: async function(fileName) { 
        try { 
            var data = fs.readFileSync(`./data/${self.dataSource}/HTML/${fileName}.html`, 'utf-8')
            data = data.split('style="display: none;"').join('');
            data = data.split('<i>').join('');
            data = data.split('</i>').join('');
            data = data.split('style="display: list-item;"').join('');
    
            const browser = await puppeteer.launch();
            const page = browser.newPage();
    
            await (await page).setContent(data);
            await (await page).emulateMediaType('print');
            await (await page).addStyleTag({ path: './css/canon.css'})
            const pdfBuffer = await (await page).pdf({ 
                path: `./data/${self.dataSource}/PDF/${fileName}.pdf`,
                format: 'A4',
                printBackground: true,
                margin: {top: '35px', left: '35px', right: '35px'}
            })

            // save PDF to GCP 
            COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/PDF/${fileName}.pdf`, pdfBuffer, 'pdf')

            await browser.close() 
    
        } catch (e) { 
            console.log(e)
        }
    },

    saveToGCP: async (bucketName, fileName, data, format) => {

        // create GCP storage client
        const storage = new Storage({
            projectId: DEV_PROJECT_ID,
            keyFilename: DEV_PROJECT_KEY,
        })

        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName)

        if (format == 'pdf') {
            await file.save(data).then(() =>
                console.log(`Uploaded file ${fileName} to ${bucketName}`))
        } else {
            await file.save(JSON.stringify(data)).then(() =>
                console.log(`Uploaded file ${fileName} to ${bucketName}`))
        }

    },

    processAndSaveImageToGCP: async (imageURL, fileName) => {
        return new Promise((resolve, reject) => {
            // create GCP storage client
            const storage = new Storage({
                projectId: DEV_PROJECT_ID,
                keyFilename: DEV_PROJECT_KEY,
            })

            // Configure axios to receive a response type of stream, and get a readableStream of the image from the specified URL
            axios({
                method: 'get',
                url: imageURL,
                responseType: 'stream'
            })
                .then((response) => {

                    // Create the image manipulation function
                    var transformer = sharp()
                        .resize(300)
                        .jpeg();

                    gcFile = storage.bucket(DEV_BUCKET).file(fileName)

                    // Pipe the axios response data through the image transformer and to Google Cloud
                    response.data
                        // .pipe(transformer)
                        .pipe(gcFile.createWriteStream({
                            resumable: false,
                            validation: false,
                            contentType: "auto",
                            metadata: {
                                'Cache-Control': 'public, max-age=31536000'
                            }
                        }))
                        .on('error', (error) => {
                            reject(error)
                        })
                        .on('finish', () => {
                            resolve(true)
                        });
                })
                .catch(err => {
                    reject("Image transfer error. ", err);
                });
        })
    },

    msToTime: function (duration) {
        var milliseconds = Math.floor((duration % 1000) / 100),
            seconds = Math.floor((duration / 1000) % 60),
            minutes = Math.floor((duration / (1000 * 60)) % 60),
            hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        hours = (hours < 10) ? "0" + hours : hours;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        seconds = (seconds < 10) ? "0" + seconds : seconds;

        return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
    },

    measurePerfomance: async (taskNumber) => {
        var t1 = performance.now()
        let milliseconds = (t1 - self.timeAtTask)
        let timeTaken = self.msToTime(milliseconds)

        if (taskNumber == 1) { // getting links
            self.timeTakenForProductLinkTask = timeTaken
            console.log(`Time taken for getting links: ${timeTaken}`)
        } else if (taskNumber == 2) { // scraping page
            self.timeTakenForScrapingTask = timeTaken
            console.log(`Time taken for scraping: ${timeTaken}`)
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

            var tasks = [self.cluster]
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