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
        this.on('err', (component, line)=>{
            this.errorLogger.write(`[${component}] ${line}`);
        })
    }

    registerLogger(log, file){
        if(log in this.loggers){
            this.emit('err', 'PonkLogger', 'Specified log already exists')
            this.emit('error', new Error('Log already registered'));
            return;
        }
        this.loggers[log] = new Logger(path.join(path.resolve(process.cwd()), `${file}.log`), false);
        this.on(log, (line)=>{
            this.loggers[log].write(line);
        });
    }

    // TODO: line formatting
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

    write(line){
        if(!this.active){return}
        this.disk.write(util.format(line) + '\n');
        this.shell.write(util.format(line) + '\n');
    }

    close(){
        this.active = false;
        process.nextTick(()=>{
            this.disk.end();
        });
    }
}

module.exports = PonkLogger;
