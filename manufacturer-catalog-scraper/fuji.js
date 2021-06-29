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

    dataSource: 'Fuji',
    productLinks: [],
    browser: null,
    page: null,
    content: null,
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

                        if (    urls.all_links[i].includes('fujifilm-x.com/global/products/') || 
                                urls.all_links[i].includes('https://fujifilm-x.com/global/products/lenses/') || 
                                urls.all_links[i].includes('https://fujifilm-x.com/global/products/accessories/') ) 
                        { 
                            if (!self.productLinks.includes(urls.all_links[i])) { 
                                if (urls.all_links[i]!= 'https://fujifilm-x.com/global/products/accessories/') { 
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
         APP: main wrapper script
    */
    app: async () => {
        try {
            var tasks = [self.loopThroughURLS]
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