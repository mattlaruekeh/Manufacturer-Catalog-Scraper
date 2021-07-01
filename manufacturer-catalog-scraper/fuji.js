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
const { Cluster } = require('puppeteer-cluster');
const {pipeline} = require('stream');

const self = {

    dataSource: 'Fuji',
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
        'COUNTRY / REGION','©FUJIFILM Corporation.',
        'brazil','canada','USA','china','india','indonesia','Japan',
        'korea','malaysia','Philippines','singapore','thailand','Vietnam',
        'austria','belgium','croatia','czechia','denmark','estonia','finland',
        'france','germany','greece','hungary','iceland','ireland','italy','latvia',
        'lithuania','netherlands','norway','poland','portugal','romania','russia',
        'slovakia','slovenia','spain','sweden','switzerland','turkey','UK','ukraine',
        'australia','global','cookies','For Business and Commercial Applications',
        'FOLLOW US', 'LEARN MORE', 'Be Inspired', 'Velvia', 'PRO Neg. Std', 'PRO Neg. Std', 
        '©Philipp Rathmer','Tips','Product Movie',
    ],

    /* 
        Gets all the product links from a high level 
        category page
    */
    getLinks: async (url) => {

        return new Promise(async (resolve, reject) => {
            try {
                console.log('Getting product links from ' + url)
                let res = axios.get('https://app.scrapingbee.com/api/v1', {
                    params: {
                        'api_key': SCRAPINGBEE,
                        'url': url,
                        'render_js': 'false',
                        'extract_rules': '{ "all_links" : { "selector": "a",  "type": "list", "output": "@href" }}',
                        'wait': 200
                    }
                }).then(function (response) {
                    // handle success
                    // Store links in productLinks array for later use
                    let urls = response.data

                    // filter out links to only include the product links
                    for (var i = 0; i < urls.all_links.length; i++) {

                        if (urls.all_links[i].includes('fujifilm-x.com/global/products/') ||
                            urls.all_links[i].includes('https://fujifilm-x.com/global/products/lenses/') ||
                            urls.all_links[i].includes('https://fujifilm-x.com/global/products/accessories/')) {
                            if (!self.productLinks.includes(urls.all_links[i])) {
                                if (urls.all_links[i] != 'https://fujifilm-x.com/global/products/accessories/') {
                                    self.productLinks.push(urls.all_links[i])
                                }
                            }
                        }
                    }

                    console.log("Got product links")
                    console.log(self.productLinks)

                    return resolve(urls)
                })

            } catch (e) {
                // still want to save whatever we got if it errors
                let filename = `${self.dataSource}/productURLS/${self.dataSource}.json`
                fs.writeFileSync(filename, JSON.stringify(self.productLinks))

                // write to GCP
                COMMON.saveToGCP(DEV_BUCKET, filename, self.productLinks)
                return reject(e)
            }
        })

    },
    
    /* 
        Loops through all the base category URLS to get the
        individual product links for later scraping
    */
    loopThroughURLS: async () => {
        let promises = []
        for (var i = 0; i < self.baseURLS.length; i++) {
            let promise = await self.getLinks(self.baseURLS[i])
            promises.push(promise)
        }

        Promise.allSettled(promises).then(() => {
            // write links to file
            fs.writeFileSync(`./data/${self.dataSource}/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks))

            // write to GCP
            let filename = `${self.dataSource}/productURLS/${self.dataSource}.json`
            COMMON.saveToGCP(DEV_BUCKET, filename, self.productLinks)
        })
    },

    /* 
        Scraping function for cameras
    */
    scrapeCameraPage: async (page) => {
        let url = await page.url()

        console.log(chalk.black.bgWhite(`Scraping ${url}`))

        let productCategory = 'Camera'

        let dateScraped = new Date().toISOString().slice(0, 10)

        let productNameSelector = '.table_border-twotone.elementor-widget.elementor-widget-text-editor > div > div > table > tbody > tr:nth-child(1) > td'
        let productName = await page.$eval(productNameSelector, el => {
            return el.innerText
        })

        // get all images from the page
        let images = await page.$$eval('img', images => {
            // get the image source 
            images = images.map(el => el.src)
            return images
        })

        // get the PDF brochure link
        let brochure = await page.$$eval('a', links => {
            links = links.map(el => el.href)
            brochure = links.filter(link => link.includes('catalogue'))
            return brochure
        })

        // filter out the images
        var name = url.split('/')
        name = name[name.length - 2]
        images = images.filter(img => img.includes(name))
        images = images.filter(img => !img.includes('icon'))
        images = images.filter(img => !img.includes('logo'))

        // overview 
        let overview = await page.$$eval('p', text => {
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

        // write data to file 
        fs.writeFileSync(`./data/${self.dataSource}/JSON/${name}.json`, JSON.stringify(metadata))

        // save JSON to GCP 
        COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/JSON/${name}.json`, JSON.stringify(metadata))

        // save images to GCP
        for (var i = 0; i < images.length; i++) {
            COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, `${self.dataSource}/images/${name}/${name} ${i}`)
            .then(res => {
            console.log(`📸 `, res);
            })
            .catch(err => {
            console.log(`Image error`, err);
            });
        }

        // PDF of specs content
        await page.goto(url + 'specifications/')
        let content = await page.content()

        let specsContent = await page.evaluate(() => document.querySelector('div.elementor-section-wrap').innerHTML);
        let fileName = productName

        // save specs html to GCP 
        COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)

        pipeline(
            fs.writeFileSync(`./data/${self.dataSource}/HTML/${fileName}.html`, specsContent),
            await self.generatePDF(fileName),
            console.log(chalk.green(`😀 Finished scraping ${url} 😀`))
        )
    },

    /* 
        Scraper for lense pages
    */
    scrapeLensePage: async (page) => { 
        let url = await page.url()
        let title = await page.title() 

        let productCategory = 'Camera'
    
        var productName = ''
    
        console.log(chalk.bgCyan(`Scraping ${url}`))
    
        let dateScraped = new Date().toISOString().slice(0, 10)

        // https://stackoverflow.com/questions/44301160/how-can-i-access-to-a-variable-in-try-block-in-other-try-block
        try {
            var productNameSelector = 'h1.elementor-headline'
            productName = await page.$eval(productNameSelector, el => { 
                return el.innerText
            })
        } catch (error) {
            productName = title.split('|')
            productName = productName[0]
            // productName = 'asdjaldkjasdkahsdkjahsfkjahfkjahdkjahs'
            console.log(error)
        }
    
        // sku is not found, but I figured I would at least record the ID
        var name = url.split('/')
        name = name[name.length - 2]
    
        // get images from fancy scrolling feature
        let images = await page.$$eval('img', images => { 
            images = images.map(el => el.src)
            return images
        })
    
        images = images.filter(img => !(img.includes('/common/')))
    
        // get the PDF brochure link
        let brochure = await page.$$eval('a', links => {
            links = links.map(el => el.href)
            brochure = links.filter(link => link.includes('catalogue'))
            return brochure
        })
    
        // overview 
        let overview = await page.$$eval('p', text => {
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
            productSKU: name,
            productPrice: 'Unknown',
            images: images,
            overview: overview,
            brochure: brochure
        }

        // write data to file 
        fs.writeFileSync(`./data/${self.dataSource}/JSON/${name}.json`, JSON.stringify(metadata))

        // save JSON to GCP 
        COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/JSON/${name}.json`, JSON.stringify(metadata))

        // save images to GCP
        for (var i = 0; i < images.length; i++) {
            COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, `${self.dataSource}/images/${name}/${name} ${i}`)
            .then(res => {
            console.log(`📸 `, res);
            })
            .catch(err => {
            console.log(`Image error`, err);
            });
        }

        // PDF of specs content
        await page.goto(url + 'specifications/')
        let content = await page.content()

        let specsContent = await page.evaluate(() => document.querySelector('div.elementor-section-wrap').innerHTML);
        let fileName = productName

        // save specs html to GCP 
        COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/HTML/${fileName}.html`, specsContent)

        pipeline(
            fs.writeFileSync(`./data/${self.dataSource}/HTML/${fileName}.html`, specsContent),
            await self.generatePDF(fileName),
            console.log(chalk.green(`😀 Finished scraping ${url} 😀`))
        )

    },

    scrapeAccessoryPage: async (page) => { 
        var [ url, sku, dateScraped, productCategory, 
            productSubCategory, productName, compatibility, 
            images, overview, brochure ] = ''
        
        try {
            url = await page.url()
            
             // sku is not found, but I figured I would at least record the ID
            sku = url.split('/')
            sku = sku[sku.length - 2]
    
            var productName = ''
    
            console.log(chalk.bgMagenta(`Scraping ${url}`))
            
            productCategory = 'Accessories'
            productSubCategory = await page.$eval('p.ttl_category', el => el.innerText) 
    
            productName = await page.$eval('h1.elementor-heading-title', el=> el.innerText)
    
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

            
        } catch (error) {
            console.log(error)
        } finally { 
            const metadata = { 
                dataSource: 'Fuji',
                dateScraped: dateScraped,
                url: url,
                productCategory: productCategory,
                productSubCategory: productSubCategory,
                productName: productName,
                productSKU: sku,
                productPrice: 'Unknown',
                compatibility: compatibility,
                images: images,
                overview: overview,
                brochure: brochure
            }

            // console.log(metadata)

            // write data to file 
            fs.writeFileSync(`./data/${self.dataSource}/JSON/${productName}.json`, JSON.stringify(metadata))

            // save JSON to GCP 
            COMMON.saveToGCP(DEV_BUCKET, `${self.dataSource}/JSON/${productName}.json`, JSON.stringify(metadata))

            // save images to GCP
            for (var i = 0; i < images.length; i++) {
                COMMON.processAndSaveImageToGCP(images[i], DEV_BUCKET, `${self.dataSource}/images/${productName}/${productName} ${i}`)
                .then(res => {
                console.log(`📸 `, res);
                })
                .catch(err => {
                console.log(`Image error`, err);
                });
            }

            console.log(chalk.green(`😀 Finished scraping ${url} 😀`))
        }
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
            await (await page).addStyleTag({ path: './css/fuji.css'})
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

    /* 
        CLUSTER: Run cluster of puppeteer scraping tasks concurrently
    */
    cluster: async () => {

        console.log(chalk.green('🚀 Running cluster 🚀'))

        /* 
        this list just for testing purposes, we can expand to all of the links
        generated in the previous function
        */
        // const urls = [
        //     "https://fujifilm-x.com/global/products/cameras/gfx100/",
        //     "https://fujifilm-x.com/global/products/cameras/gfx100s/",
        //     "https://fujifilm-x.com/global/products/cameras/gfx-50s/",
        //     "https://fujifilm-x.com/global/products/cameras/gfx-50r/",
        //     'https://fujifilm-x.com/global/products/lenses/gf23mmf4-r-lm-wr/',
        //     "https://fujifilm-x.com/global/products/lenses/xf56mmf12-r/",
        //     "https://fujifilm-x.com/global/products/lenses/xf56mmf12-r-apd/",
        //     "https://fujifilm-x.com/global/products/lenses/xf60mmf24-r-macro/",
        //     "https://fujifilm-x.com/global/products/accessories/wcl-x100ii/",
        //     "https://fujifilm-x.com/global/products/accessories/lhcp-001/",
        //     "https://fujifilm-x.com/global/products/accessories/lhcp-002/",
        //     "https://fujifilm-x.com/global/products/accessories/lhcp-27/",
        //     "https://fujifilm-x.com/global/products/accessories/rlcp-001/",
        // ]

        let urls = self.productLinks

        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 4,
        });

        await cluster.task(async ({ page, data: url }) => {
            await page.goto(url);
            // need different scrapers for each type of page
            if (url.includes('/cameras/')) { 
                await self.scrapeCameraPage(page)
            } else if (url.includes('/lenses/')) { 
                await self.scrapeLensePage(page)
            } else if (url.includes('/accessories/')) { // accessories
                await self.scrapeAccessoryPage(page)
            } else {}
            
        });

        for (var i = 0; i < urls.length; i++) {
            cluster.queue(urls[i]);
        }
        
        // close cluster once all the tasks are finished 
        await cluster.idle();
        await cluster.close();
    },

    /* 
         APP: main wrapper script
    */
    app: async () => {
        try {
            var tasks = [self.loopThroughURLS, self.cluster]
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