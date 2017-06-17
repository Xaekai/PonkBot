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
                err : new Logger({
                    file      : path.join(path.resolve(process.cwd()), 'error.log'),
                    err       : true,
                    formatter : function(type, ...args){ return args },
                    nodisk    : false,
                    noshell   : false,
                })
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

    registerLogger(log, file, formatter, opts){
        if(log in this.loggers){
            this.emit('err', 'PonkLogger', 'Specified log already exists:', log);
            this.emit('error', new Error('Log already registered'));
            return this;
        }

        if(typeof file === 'undefined' || file === null){ file = log }
        if(typeof formatter === 'function'){
            formatter = formatter.bind(this);
        } else {
            formatter = function(type, ...args){
                args.unshift(`[${this.timestamp()}]`);
                return args;
            }.bind(this);
        }
        const options = Object.assign({ nodisk: false, noshell: false }, opts)
        // Creates the logger. If the filename has a dot in it, it's presumed to be a full name. Otherwise .log is appended.
        this.loggers[log] = new Logger({
            file      : path.join(path.resolve(process.cwd()), /\./.test(file) ? file : `${file}.log`),
            err       : false,
            formatter : formatter,
            nodisk    : options.nodisk,
            noshell   : options.noshell,
        });

        this.on(log, (...args)=>{
            this.loggers[log].write(...args);
        });

        return this;
    }

}

class Logger {
    constructor({ file, err, formatter, nodisk, noshell }){
        Object.assign(this, {
            active    : true,
            shell     : err ? process.stderr : process.stdout,
            formatter : formatter,
            nodisk    : nodisk,
            noshell   : noshell,
        });
        if(!this.nodisk){
            Object.assign(this, {
                filename  : file,
                disk      : fs.createWriteStream(file, { flags : 'a' }),
            });
        }
    }

    write(){
        if(!this.active){return}
        if(!this.noshell){
            this.shell.write(util.format.apply(null, this.formatter('shell', ...arguments)) + '\n');
        }
        if(!this.nodisk){
            this.disk.write(util.format.apply(null, this.formatter('disk', ...arguments)) + '\n');
        }
    }

    close(){
        this.active = false;
        process.nextTick(()=>{
            this.disk.end();
        });
    }
}

module.exports = PonkLogger;
