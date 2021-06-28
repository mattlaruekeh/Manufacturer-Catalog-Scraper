require('dotenv').config()

const self =  {
    cheerio: require('cheerio'),
    axios: require('axios'),
    puppeteer: require('puppeteer'),
    chalk: require('chalk'),
    fs: require('fs'),
    rp: require('promise-request-retry'),
    jsdom: require('jsdom'),
    Storage: require('@google-cloud/storage'),
    sharp: require('sharp'),
    SCRAPINGBEE: process.env.SCRAPINGBEE,
    DEV_PROJECT_ID: process.env.DEV_PROJECT_ID,
    DEV_PROJECT_KEY: process.env.DEV_PROJECT_KEY,
    DEV_BUCKET: 'manufacturer-scraper-dev-bucket',
    
   

    

    processAndSaveImageToGCP: async function(imageURL, bucketName, fileName) { 
        return new Promise((resolve, reject) => { 
            // create GCP storage client
            const storage = new self.Storage({
                projectId: self.DEV_PROJECT_ID,
                keyFilename: self.DEV_PROJECT_KEY,
            })

            // Configure axios to receive a response type of stream, and get a readableStream of the image from the specified URL
            self.axios({
                method:'get',
                url: imageURL,
                responseType:'stream'
            })
            .then((response) => {

                // Create the image manipulation function
                var transformer = self.sharp()
                .resize(300)
                .jpeg();

                gcFile = self.storage.bucket(bucketName).file(fileName)

                // Pipe the axios response data through the image transformer and to Google Cloud
                response.data
                .pipe(transformer)
                .pipe(gcFile.createWriteStream({
                    resumable  : false,
                    validation : false,
                    contentType: "auto",
                    metadata   : {
                        'Cache-Control': 'public, max-age=31536000'}
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
    }

}

module.exports = self;