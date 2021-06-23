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
    dataSource: 'Nikon',
    productLinks: [],
    browser: null,
    page: null, 
    content: null, 
    url: 'https://www.nikonusa.com/en/nikon-products/dslr-cameras/index.page',

    /* 
        Get products from main page for later scraping
    */
   getLinks: async() => { 
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
                    return resolve(urls) 
                })

           } catch (e) { 
               return reject(e)
           }
       })
   },

   /* 
        APP: main wrapper script
   */
  app: async() => { 
    try { 
        var tasks = [self.getLinks]
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