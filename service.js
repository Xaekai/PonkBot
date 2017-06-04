/*!
**|   PonkBot
**|   A chat bot for CyTube
**|
**@author    Xaekai
**@copyright 2017
**@license   MIT
*/

'use strict';

const CyTubeClient = require('./lib/client.js');

class PonkBot {
    constructor(config){
        this.logger = {
            log: function(){
                console.log(`[PonkBot] ${Array.prototype.join.call(arguments, ' ')}`);
            },
            error: function(){
                console.error(`[PonkBot] ${Array.prototype.join.call(arguments, ' ')}`);
            },
        }

        this.logger.log('Contructing Bot');

        this.client = new CyTubeClient();
    }
}

