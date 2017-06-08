/*!
**|   PonkBot Core
**@
*/

'use strict';

const EventEmitter = require('events');
const CyTubeClient = require('./client.js');
const PonkDatabase = require('./database.js');
const PonkLogger   = require('./logger.js');

class PonkBot extends EventEmitter {
    constructor(config){
        super();

/*
        this.logger = {
            log: function(){
                console.log(`[PonkBot] ${Array.prototype.join.call(arguments, ' ')}`);
            },
            error: function(){
                console.error(`[PonkBot] ${Array.prototype.join.call(arguments, ' ')}`);
            },
        }
*/
        this.logger = new PonkLogger()
            .registerLogger('bot', 'ponkbot.log')
            ;

        this.logger.emit('PonkBot', 'Contructing PonkBot.');

        this.once('dbready', ()=>{
            this.createClient(config.sync)
                .once('ready', ()=>{
                    this.emit('clientinit')
                    this.client.connect();
                })
                .once('connected', ()=>{
                    this.emit('clientready')
                    this.registerListeners();
                })
                .once('started', ()=>{
                    this.emit('clientstart')
                    this.registerLateListeners();
                })
        })
        this.createDatabase(config.db)
            .once('ready', ()=>{
                this.emit('dbready');
            });
    }

    createDatabase(config){
        this.logger.emit('bot', '[PonkBot]', 'Creating database.');
        this.db = new PonkDatabase(config, this.logger, this)
        return this.db;
    }

    createClient(config){
        this.name = config.user;
        this.logger.emit('bot', '[PonkBot]', 'Creating CyTube client.');
        this.client = new CyTubeClient(config, this.logger)
        return this.client;
    }

    registerListeners(){
        this.logger.emit('bot', '[PonkBot]', 'Registering client listeners.');
        // TODO

        this.client.start()
    }

    // This prevents the initial burst of chatMsg from being logged
    registerLateListeners(){
        // TODO: Add chatMsg handler here
    }
}

module.exports = PonkBot;
