require('dotenv').config()

const { Storage } = require('@google-cloud/storage'); 
const axios =  require('axios');
const chalk = require('chalk');
const fs = require('fs');
const puppeteer = require('puppeteer');

const self =  {
    cheerio: require('cheerio'),
    axios: require('axios'),
    puppeteer: require('puppeteer'),
    chalk: require('chalk'),
    fs: require('fs'),
    rp: require('promise-request-retry'),
    jsdom: require('jsdom'),
    sharp: require('sharp'),
    autoscroll: require('puppeteer-autoscroll-down'),
    SCRAPINGBEE: process.env.SCRAPINGBEE,
    DEV_PROJECT_ID: process.env.DEV_PROJECT_ID,
    DEV_PROJECT_KEY: process.env.DEV_PROJECT_KEY,
    PROD_PROJECT_ID: process.env.PROD_PROJECT_ID,
    PROD_PROJECT_KEY: process.env.PROD_PROJECT_KEY,
    DEV_BUCKET: 'manufacturer-scraper-dev-bucket',
    PROD_BUCKET: 'keh_sandbox',

    saveToGCP: async(bucketName, fileName, data, format) => { 

        // create GCP storage client
        /* 
            const storage = new Storage({
                projectId: self.DEV_PROJECT_ID,
                keyFilename: self.DEV_PROJECT_KEY,
            })
        */
        const storage = new Storage({
            projectId: self.PROD_PROJECT_ID,
            keyFilename: self.PROD_PROJECT_KEY,
        })

        let fullPath = `rawLanding/${fileName}`

        const bucket = storage.bucket(bucketName);    
        const file = bucket.file(fullPath)

        if (format == 'pdf') { 
            await file.save(data).then(() => 
                console.log(`⬆️  Uploaded file ${fileName} to ${bucketName} ⬆️`))
        } else { 
            await file.save(JSON.stringify(data)).then(() => 
                console.log(`⬆️  Uploaded file ${fileName} to ${bucketName} ⬆️`))
        }
        
    },
    
    processAndSaveImageToGCP: async function(imageURL, bucketName, fileName) { 
        return new Promise((resolve, reject) => {
            
            // console.log(`Processing image ${imageURL}`)
            // create GCP storage client
            /* 
                const storage = new Storage({
                    projectId: self.DEV_PROJECT_ID,
                    keyFilename: self.DEV_PROJECT_KEY,
                })
            */
            const storage = new Storage({
                projectId: self.PROD_PROJECT_ID,
                keyFilename: self.PROD_PROJECT_KEY,
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
                let fullPath = `rawLanding/${fileName}`
                gcFile = storage.bucket(bucketName).file(fullPath)

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
                    resolve(imageURL)
                });
            })
            .catch(err => {
                reject("Image transfer error. ", err);
            });
        })
    },

    msToTime: function (duration) {
        var milliseconds = Math.floor((duration % 1000) / 100),
            seconds = Math.floor((duration / 1000) % 60),
            minutes = Math.floor((duration / (1000 * 60)) % 60),
            hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        hours = (hours < 10) ? "0" + hours : hours;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        seconds = (seconds < 10) ? "0" + seconds : seconds;

        return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
    },

    generatePDF: async function(dataSource, fileName) { 
        try { 
            var data = fs.readFileSync(`./data/${dataSource}/HTML/${fileName}.html`, 'utf-8')
            // var data = fs.readFileSync(path, 'utf-8')
            data = data.split('style="display: none;"').join('');
            data = data.split('<i>').join('');
            data = data.split('</i>').join('');
            data = data.split('style="display: list-item;"').join('');
    
            const browser = await puppeteer.launch();
            const page = browser.newPage();
    
            await (await page).setContent(data);
            await (await page).emulateMediaType('print');
            await (await page).addStyleTag({ path: `./css/${dataSource}.css`})
            const pdfBuffer = await (await page).pdf({ 
                // path: `./data/${dataSource}/PDF/${fileName}.pdf`,
                format: 'A4',
                printBackground: true,
                margin: {top: '35px', left: '35px', right: '35px'}
            })

            // save PDF to GCP 
            /* 
                self.saveToGCP(self.DEV_BUCKET, `${dataSource}/PDF/${fileName}.pdf`, pdfBuffer, 'pdf') 
            */
            self.saveToGCP(self.PROD_BUCKET, `${dataSource}/PDF/${fileName}.pdf`, pdfBuffer, 'pdf')

            await browser.close() 
    
        } catch (e) { 
            console.log(e)
        }
    },

    createDir: function(dirPath) { 
        fs.mkdirSync(process.cwd() + dirPath, { recursive: true }, (error) => { 
            if (error) { 
                console.error('Error creating directory: ', error)
            } else { 
                console.log(`${dirPath} successfully created`)
            }
        })
    },

    createFile: function(filePath, fileContent) { 
        fs.writeFile(filePath, fileContent, (error) => { 
            if (error) { 
                console.error('Error creating file: ', error)
            } else { 
                console.log(`Successfully created file ${filePath}`)
            }
        })
    }

    

}

module.exports = self;