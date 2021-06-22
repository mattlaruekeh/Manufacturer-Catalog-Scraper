const CANON = require('./canon')

const app = async () => { 

    await CANON.getLinks();

}

app();