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
        super();
        Object.assign(this, {
            offset  : ((new Date()).getTimezoneOffset() * 60 * 1000),
            logpath : '.',
            loggers : {},
        }, {
            // How do we color console output? RGB values.
            colors   : {
                time : [ 190,  30, 121 ],
                comp : [ 239,  78, 145 ],
                mess : [ 248, 185, 206 ],
            },
            // How do we color debug console output?
            dcolors  : {
                time : [  31, 100, 103 ],
                comp : [  53, 136, 124 ],
                mess : [  89, 188, 100 ],
            },
        }, options);

        this.resolveLogPath();

        this.errorLogger = this.loggers.err = new Logger({
            label   : 'Errors Log',
            file    : path.join(this.logpath, 'error.log'),
            err     : true,
            format  : function(type, ...args){ return args },
            nodisk  : false,
            noshell : false,
        });

        this.registerListeners();
    }

    resolveLogPath(){
        const issue = (message)=>{
            process.stderr.write(message);
            process.stderr.write('\n');
            process.exit(78);
        }

        const invalid = /[‘“!#$%&+^<=>`]/;
        if(!typeof this.logpath === 'string' || invalid.test(this.logpath)){
            return issue('Invalid log path configuration. Terminating.');
        }

        if(this.logpath !== '.'){
            let stats;
            try {
                stats = fs.statSync(path.resolve(!path.isAbsolute(this.logpath) ? process.cwd() : '', this.logpath));
            }
            catch (err) {
                return issue('Error accessing requested log path. Terminating.');
            }

            if(!stats.isDirectory()){
                return issue('Requested log path is not a directory. Terminating.');
            }

            this.logpath = path.resolve(!path.isAbsolute(this.logpath) ? process.cwd() : '', this.logpath);

            try{
                let access = path.join(this.logpath, `${Date.now()}.tmp`);
                fs.writeFileSync(access, '');
                fs.unlinkSync(access);
            } catch (err) {
                return issue('Requested log path is not writable. Terminating.');
            }
        } else {
            this.logpath = path.resolve(process.cwd());
        }
    }

    timestamp(){
        const now = (new Date(Date.now() - this.offset)).toISOString();
        return `${now.slice(0,10)} ${now.slice(11,19)}`;
    }

    registerListeners(){
        this.errorLogger.disk.on('error', (err)=>{
            process.stderr.write(JSON.stringify(err));
            process.stderr.write('\n');
        });
        this.on('err', (component, ...args)=>{
            this.errorLogger.write(`[${this.timestamp()}] ${component}`, ...args);
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
            file      : path.join(this.logpath, /\./.test(file) ? file : `${file}.log`),
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
            switch(true){
                case logid === 'err':
                case this.loggers[logid]['nodisk']:
                case !this.loggers[logid]['active']:
                    continue;
            }
            response[logid] = this.loggers[logid]['label'];
        }
        // Make the errors log always last
        response.err = this.loggers.err.label;
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
