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
    url: 'https://fujifilm-x.com/global/products/cameras/',

    
}

module.exports = self