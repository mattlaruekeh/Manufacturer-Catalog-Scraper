/* 
    Load in common functions and variables
*/
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const jspdf = COMMON.jspdf
const fs =  COMMON.fs
const html2canvas = COMMON.html2canvas
const jsdom = COMMON.jsdom
const { JSDOM } = jsdom;
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
                    
                    // write links to file 
                    fs.writeFileSync(`./data/Canon/productURLS/${self.dataSource}.json`, JSON.stringify(self.productLinks[0].all_links))
                    
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
    scrapePage: async() => {

        return new Promise(async (resolve, reject) => { 
            try { 
                await self.initPuppeteer() 
                console.log(self.productLinks[0].all_links)
                let goTo = 'https://shop.usa.canon.com' + self.productLinks[0].all_links[0]
                console.log(`Going to individual product page ${goTo}`)
                // make sure browser is initialized 
                if (self.browser) { 
                    // open up the page
                    await self.page.goto(goTo, {waitUntil: 'domcontentloaded', timeout: 0});
                    
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
                    try { 
                        console.log('Printing to pdf')
                        let data = fs.readFileSync(`./data/Canon/TXT/${fileName}.txt`, "utf-8");
                        const browser = await puppeteer.launch();
                        const page = browser.newPage();
                
                        await (await page).setContent(data);
                        await (await page).emulateMediaType('screen');
                        await (await page).addStyleTag({ path: './css/canon.css'})
                        await (await page).pdf({ 
                            path: `./data/Canon/PDF/${fileName}.pdf`,
                            format: 'A4',
                            printBackground: true,
                            margin: {top: '35px', left: '35px', right: '35px'}
                        })
                
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
                        images: images,
                        overview: overview,
                        features: features

                    }

                    console.log(metadata)

                    // write data to file 
                    fs.writeFileSync(`./data/Canon/JSON/${fileName}.json`, JSON.stringify(metadata))

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