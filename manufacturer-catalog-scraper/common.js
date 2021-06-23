require('dotenv').config()

const self =  {
    cheerio: require('cheerio'),
    axios: require('axios'),
    puppeteer: require('puppeteer'),
    chalk: require('chalk'),
    fs: require('fs'),
    rp: require('promise-request-retry'),
    html2canvas: require('html2canvas'),
    jspdf: require('jspdf'), 
    jsdom: require('jsdom'),
    SCRAPINGBEE: process.env.SCRAPINGBEE, 
}

module.exports = self;