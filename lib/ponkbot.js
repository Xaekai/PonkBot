/*!
**|   PonkBot Core
**@
*/

'use strict';

const EventEmitter = require('events');
const CyTubeClient = require('./client.js');
const PonkDatabase = require('./database.js');

class PonkBot extends EventEmitter {
    constructor(config){
        super();

        this.logger = {
            log: function(){
                console.log(`[PonkBot] ${Array.prototype.join.call(arguments, ' ')}`);
            },
            error: function(){
                console.error(`[PonkBot] ${Array.prototype.join.call(arguments, ' ')}`);
            },
        }

        this.logger.log('Contructing Bot');

        this.once('dbready', ()=>{
            this.createClient(config.sync);
        })
        this.createDatabase(config.db);
    }

    createDatabase(config){
        this.db = new PonkDatabase(config, {}, this)
            .once('ready', ()=>{
                this.emit('dbready');
            });
    }

    createClient(config){
        this.name = config.user;
        this.client = new CyTubeClient(config);
        this.emit('clientinit');
    }
}

module.exports = PonkBot;
