const COMMON = require('./common');


const puppeteer = COMMON.puppeteer
const cheerio = COMMON.cheerio
const chalk = COMMON.chalk
const axios = COMMON.axios
const SCRAPINGBEE = COMMON.SCRAPINGBEE

const self = {
    productLinks: [],
    browser: null,
    page: null,
    content: null,
    $: null,
    url: 'https://shop.usa.canon.com/shop/en/catalog/cameras/eos-dslr-and-mirrorless-interchangeable-lens-cameras',
    

    /* 
        Gets product links from main page for later scraping
    */
    getLinks: async() => { 
        
        axios.get('https://app.scrapingbee.com/api/v1', {
            params: {
            'api_key': '0DVEOB0YEL5KEQL6ZCGTT6AB4WK1ZB6DH2RV6E6IIXG0060I0UDE7T85YH201NWAGAJ1GPDJSE4JWR74',
            'url': 'https://shop.usa.canon.com/shop/en/catalog/cameras/eos-dslr-and-mirrorless-interchangeable-lens-cameras', 
            'render_js': 'false',
            'extract_rules': '{    "all_links" : {        "selector": "div.product_name > a",        "type": "list",        "output": "@href"    }}', 
        } 
        }).then(function (response) {
            // handle success
            console.log(response.data);
        })
    }

}

module.exports = self