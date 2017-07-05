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
                    label     : 'Errors Log',
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

    registerLogger({ label, logid, file, format, opts }){
        if(logid in this.loggers){
            this.emit('err', 'PonkLogger', 'Specified log already exists:', logid);
            this.emit('error', new Error('Log already registered'));
            return this;
        }

        if(typeof file === 'undefined' || file === null){ file = logid }
        if(typeof label === 'undefined'){ label = logid }
        if(typeof format === 'function'){
            format = format.bind(this);
        } else {
            format = function(type, ...args){
                args.unshift(`[${this.timestamp()}]`);
                return args;
            }.bind(this);
        }
        const options = Object.assign({ nodisk: false, noshell: false }, opts)
        // Creates the logger. If the filename has a dot in it, it's presumed to be a full name. Otherwise .log is appended.
        this.loggers[logid] = new Logger({
            label     : label,
            file      : path.join(path.resolve(process.cwd()), /\./.test(file) ? file : `${file}.log`),
            err       : false,
            format    : format,
            nodisk    : options.nodisk,
            noshell   : options.noshell,
        });

        this.on(logid, (...args)=>{
            this.loggers[logid].write(...args);
        });

        return this;
    }

    streamLog(logid, limit) {
        const maxlen = limit || 1<<20; // 1MiB

        return new Promise((resolve, reject)=>{
            if(!(logid in this.loggers)){
                reject('Unregistered Log Id');
            }

            const file = this.loggers[logid]['filename'];
            fs.stat(file, (err, data)=>{
                if (err){ reject(JSON.stringify(err)) }

                const alpha = Math.max(0, data.size - maxlen);
                const omega = Math.max(0, data.size - 1);
                if (isNaN(alpha)){ reject('Invalid file slice') }
                if (isNaN(omega)){ reject('Invalid file slice') }

                resolve(fs.createReadStream(file, { alpha, omega }));
            });
        });
    }

    getLoggers(){
        const response = {};

        for(const logid in this.loggers){
            if (!this.loggers[logid]['nodisk'] ||
                !this.loggers[logid]['active']){
                response[logid] = this.loggers[logid]['label'];
            }
        }
        return response;
    }

}

class Logger {
    constructor({ label, file, err, format, nodisk, noshell }){
        Object.assign(this, {
            label   : label,
            active  : true,
            shell   : err ? process.stderr : process.stdout,
            format  : format,
            nodisk  : nodisk,
            noshell : noshell,
        });
        if(!this.nodisk){
            Object.assign(this, {
                filename : file,
                disk     : fs.createWriteStream(file, { flags : 'a' }),
            });
        }
    }

    write(){
        if(!this.active){return}
        if(!this.noshell){
            this.shell.write(util.format.apply(null, this.format('shell', ...arguments)) + '\n');
        }
        if(!this.nodisk){
            this.disk.write(util.format.apply(null, this.format('disk', ...arguments)) + '\n');
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
