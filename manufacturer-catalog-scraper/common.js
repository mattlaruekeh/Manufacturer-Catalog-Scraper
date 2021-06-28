require('dotenv').config()

const { Storage } = require('@google-cloud/storage'); 
const axios =  require('axios');

const self =  {
    cheerio: require('cheerio'),
    axios: require('axios'),
    puppeteer: require('puppeteer'),
    chalk: require('chalk'),
    fs: require('fs'),
    rp: require('promise-request-retry'),
    jsdom: require('jsdom'),
    sharp: require('sharp'),
    SCRAPINGBEE: process.env.SCRAPINGBEE,
    DEV_PROJECT_ID: process.env.DEV_PROJECT_ID,
    DEV_PROJECT_KEY: process.env.DEV_PROJECT_KEY,
    DEV_BUCKET: 'manufacturer-scraper-dev-bucket',

    saveToGCP: async(bucketName, fileName, data, format) => { 

        // create GCP storage client
        const storage = new Storage({
            projectId: self.DEV_PROJECT_ID,
            keyFilename: self.DEV_PROJECT_KEY,
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
    
    processAndSaveImageToGCP: async function(imageURL, bucketName, fileName) { 
        return new Promise((resolve, reject) => {
            
            console.log(`Processing image ${imageURL}`)
            // create GCP storage client
            const storage = new Storage({
                projectId: self.DEV_PROJECT_ID,
                keyFilename: self.DEV_PROJECT_KEY,
            })

            // Configure axios to receive a response type of stream, and get a readableStream of the image from the specified URL
            axios({
                method:'get',
                url: imageURL,
                responseType:'stream'
            })
            .then((response) => {

                // Create the image manipulation function
                // var transformer = self.sharp()
                // .resize(300)
                // .jpeg();

                gcFile = storage.bucket(bucketName).file(fileName)

                // Pipe the axios response data through the image transformer and to Google Cloud
                response.data
                // .pipe(transformer)
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