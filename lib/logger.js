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
            process.stderr.write(err);
            process.stderr.write('\n');
        });
        this.on('err', (component, ...args)=>{
            this.errorLogger.write(`[${this.timestamp()}] [${component}]`, ...args);
        });
    }

    // TODO: allow custom line formatting function
    registerLogger(log, file, formatter){
        if(log in this.loggers){
            this.emit('err', 'PonkLogger', 'Specified log already exists');
            this.emit('error', new Error('Log already registered'));
            return this;
        }

        if(typeof file === 'undefined'){ file = log }
        if(typeof formatter === 'function'){
            formatter = formatter.bind(this);
        } else {
            formatter = function(type, ...args){
                args.unshift(`[${this.timestamp()}]`);
                return args;
            }.bind(this);
        }
        this.loggers[log] = new Logger(path.join(path.resolve(process.cwd()), /\./.test(file) ? file : `${file}.log`), false, formatter);


        this.on(log, (...args)=>{
            this.loggers[log].write(...args);
        });

        return this;
    }

}

class Logger {
    constructor(file, err, formatter){
        Object.assign(this, {
            active    : true,
            filename  : file,
            disk      : fs.createWriteStream(file, { flags : 'a' }),
            shell     : err ? process.stderr : process.stdout,
            formatter : formatter,
        });
    }

    write(){
        if(!this.active){return}
        this.shell.write(util.format.apply(null, this.formatter('shell', ...arguments)) + '\n');
        this.disk.write(util.format.apply(null, this.formatter('disk', ...arguments)) + '\n');
    }

    close(){
        this.active = false;
        process.nextTick(()=>{
            this.disk.end();
        });
    }
}

module.exports = PonkLogger;
