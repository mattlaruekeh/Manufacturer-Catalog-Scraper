const CANON = require('./canon');
const NIKON = require('./nikon');

const app = async () => { 

    // await CANON.app();
    await NIKON.app();

}

app();