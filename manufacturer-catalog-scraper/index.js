const CANON = require('./canon');
const NIKON = require('./nikon');
const PANASONIC = require('./panasonic');
const SONY = require('./sony')

const app = async () => { 

    // await CANON.app();
    await NIKON.app();
    // await PANASONIC.app();

}

app();