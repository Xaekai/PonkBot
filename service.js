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

const argv = require('minimist')(process.argv.slice(2));
const configfile = typeof argv.config == "String" ? argv.config : "./config";

const config = require(configfile);
const bot = new PonkBot(config);
