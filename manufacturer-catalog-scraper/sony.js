/* 
    Load in common functions and variables
*/
const { dataSource } = require('./canon');
const COMMON = require('./common');
const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const jspdf = COMMON.jspdf
const fs = COMMON.fs
const html2canvas = COMMON.html2canvas
const jsdom = COMMON.jsdom
const { JSDOM } = jsdom;
const axios = COMMON.axios
const SCRAPINGBEE = COMMON.SCRAPINGBEE

const self = {
    dataSource: 'Sony',
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    url: 'https://electronics.sony.com/imaging/interchangeable-lens-cameras/c/all-interchangeable-lens-cameras',

    /* 
        Get product links for later scraping
    */
    getLinks: async () => {
        return new Promise(async (resolve, resject) => {
            try {
                console.log("Getting product links")

                let res = axios.get('https://app.scrapingbee.com/api/v1', {
                    params: {
                        'api_key': SCRAPINGBEE,
                        'url': self.url,
                        'render_js': 'true',
                        'extract_rules': '{ "all_links" : { "selector": "a",  "type": "list", "output": "@href" }}',
                    }
                }).then(function (response) {
                    // handle success
                    // Store links in productLinks array for later use
                    let urls = response.data
                    console.log("Got product links")


                    for (var i = 0; i < urls.all_links.length; i++) {
                        if (
                            urls.all_links[i] 
                            && 
                            ( 
                                urls.all_links[i].includes('/imaging/interchangeable-lens-cameras/full-frame/')
                            || 
                                urls.all_links[i].includes('/imaging/interchangeable-lens-cameras/all-interchangeable-lens-cameras/') )
                            ) 
                        {
                            if (!self.productLinks.includes(urls.all_links[i])) { 
                                self.productLinks.push(urls.all_links[i])
                            }
                            
                        }
                    }

                   

                    console.log(self.productLinks)
                    console.log(self.productLinks.length)

                    // write links to file
                    let dir = `./data/${self.dataSource}/productURLS`
                    // if (!fs.existsSync(dir)) { 
                    //     fs.mkdirSync(dir)
                    // }

                    fs.mkdir(dir, { recursive: true }, (err) => {
                        if (err) throw err;
                    });
                    fs.writeFileSync(`${dir}/${self.dataSource}.json`, JSON.stringify(urls))
                    return resolve(urls)
                })

            } catch (e) {
                console.log(e)
            }
        })
    },


    /* 
         APP: main wrapper script
    */
    app: async () => {
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