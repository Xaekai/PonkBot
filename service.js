/*!
**|   PonkBot
**|   A chat bot for CyTube
**|
**@author    Xaekai
**@copyright 2017
**@license   MIT
*/

'use strict';

const PonkBot = require('./lib/ponkbot.js');

function getConfig(args){
    let config = './config.js';
    config = typeof args.config == "string" ? args.config : config;

    // Check for relative path without leading "./"
    if(!config.match(/^\//) && config.match(/\//)){
        config = `./${config}`;
    }

    try {
        require.resolve(config);
    }
    catch(err) {
        console.error('Could not locate configuration file');
        process.exit(78);
    }

    return config;
}

const argv = require('minimist')(process.argv.slice(2));
const configfile = getConfig(argv);
const config = require(configfile);
const bot = new PonkBot(config);
