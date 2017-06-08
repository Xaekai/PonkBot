/*!
**|   PonkBot Logger
**@
*/

'use strict';

const EventEmitter = require('events');
const util = require('util');
const path = require('path');
const fs = require('fs');

class PonkLogger extends EventEmitter {
    constructor(options){
        const defaults = {
            offset  : ((new Date()).getTimezoneOffset() * 60 * 1000),
            loggers : {
                err : new Logger(path.join(path.resolve(process.cwd()), 'error.log'), true)
            },
        }
        super();

        Object.assign(this, defaults, options);
        this.errorLogger = this.loggers.err;
        this.registerListeners();
    }

    timestamp(){
        const now = (new Date(Date.now() - this.offset)).toISOString();
        return `${now.slice(0,10)} ${now.slice(11,19)}`;
    }

    registerListeners(){
        this.errorLogger.disk.on('error', (err)=>{
            console.error(err);
        })
        this.on('err', (component, ...args)=>{
            this.errorLogger.write(`[${this.timestamp()}] [${component}]`, ...args);
        })
    }

    // TODO: allow custom line formatting function
    registerLogger(log, file){
        if(log in this.loggers){
            this.emit('err', 'PonkLogger', 'Specified log already exists')
            this.emit('error', new Error('Log already registered'));
            return;
        }

        if(typeof file === 'undefined'){ file = log }
        this.loggers[log] = new Logger(path.join(path.resolve(process.cwd()), /\./.test(file) ? file : `${file}.log`), false);

        this.on(log, (...args)=>{
            this.loggers[log].write(`[${this.timestamp()}]`, ...args);
        });

        return this;
    }

}

class Logger {
    constructor(file, err){
        Object.assign(this, {
            active   : true,
            filename : file,
            disk     : fs.createWriteStream(file, { flags : 'a' }),
            shell    : err ? process.stderr : process.stdout,
        });
    }

    write(){
        if(!this.active){return}
        this.disk.write(util.format.apply(null, arguments) + '\n');
        this.shell.write(util.format.apply(null, arguments) + '\n');
    }

    close(){
        this.active = false;
        process.nextTick(()=>{
            this.disk.end();
        });
    }
}

module.exports = PonkLogger;
