/*!
**|   PonkBot Web Interface
**@
*/

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const pug = require('pug');
const md = require('marked');
const express = require('express');


class PonkServer extends EventEmitter {
    constructor(config, logger, bot){
        const defaults = {
            cache     : {},
            secret    : '',
            weblink   : '',
            webport   : 1488,
            sockport  : 1337,

            templates : path.join(__dirname, '..', 'templates'),
            debug     : (process.env.NODE_ENV === 'production' ? false : true),
        }
        super();
        Object.assign(this, defaults, config, { bot: bot });

        this.setupLogger(logger);
        this.setupServer();
        this.socket = new PonkSocket(this.sockport, logger, bot);
    }

    setupLogger(logger){
        if(!logger){
            this.logger = { log: console.log, error: console.error }
        } else {
            this.logger = {
                log: (...line)=>{
                    logger.emit('bot', '[PonkServer]', ...line)
                },
                error: (...line)=>{
                    logger.emit('err', '[PonkServer]', ...line)
                },
            }
        }
    }

    get iolink(){
        return `${this.weblink}:${this.sockport}`;
    }

    get socketlink(){
        return `${this.iolink}/socket.io/socket.io.js`;
    }

    sendPug(res, page, locals){
        if(page in this.cache){
            return res.send(this.cache[page](locals));
        }
        const file = path.join(this.templates, page + '.pug');
        const template = pug.compile(fs.readFileSync(file), { filename: file });
        if(!this.debug){
            this.cache[page] = template;
        }
        res.send(template(locals));
    }

    setupServer(){
        if(!this.weblink.length){ throw new Error(`Web interface link empty`)}
        if(!this.secret === 'CHANGEME'){ throw new Error(`Insecure session secret`)}

        this.logger.log('Creating webhost.')

        // Middleware
        this.host = this.setupExpress(express(), {
            cookie:     require('cookie-parser'),
            bodyparser: require('body-parser'),
            session:    require('express-session'),
            flash:      require('connect-flash'),
        },{
            secret: this.secret
        });

        // TODO
        // setupPassport(this.host, this.bot.db);
        this.setupRoutes(this.host);

        // TODO: Move this into the templater
        this.host.get('/sioconfig', (req, res) => {
            res.send(`const PONKSOCKET = "${this.iolink}"`);
        })

        this.logger.log('Listening.')
        this.host.listen(this.webport);
    }

    setupExpress(app, mw, config){
        app.use(mw.cookie());
        app.use(mw.bodyparser.json());
        app.use(mw.bodyparser.urlencoded({ extended: true, limit: '24kb' }));
        app.use(mw.session({ secret: config.secret, resave: false, saveUninitialized: false }));
        app.use(mw.flash());

        return app;
    }

    setupRoutes(app){
        this.logger.log('Registering routes.')

        // Static routes
        app.use(express.static(path.join(__dirname, '..', 'www')));

        // Redirect home
        app.get('/', function(req, res) { res.redirect('/home') });

        // Web interface pages
        [
            'home',
            'help',
            'internals',
        ].forEach((page)=>{
            app.get(`/${page}`, (req, res)=>{
                this.sendPug(res, page, {
                    user: req.user,
                    bot: { channel: this.bot.chan, name: this.bot.name },
                    serverIO: this.socketlink
                })
            })
        });
    }

}


class PonkSocket {
    constructor(config, logger, bot){
        this.bot = bot;
        this.setupLogger(logger);
        this.setupListeners(require('socket.io').listen(config));
    }

    setupLogger(logger){
        if(!logger){
            this.logger = { log: console.log, error: console.error }
        } else {
            this.logger = {
                log: (...line)=>{
                    logger.emit('bot', '[PonkSocket]', ...line)
                },
                error: (...line)=>{
                    logger.emit('err', '[PonkSocket]', ...line)
                },
            }
        }
    }

    setupListeners(io){
        this.logger.log('Creating socket');

        io.sockets.on('connection', (socket)=>{
            socket.on('getEmotes',    ()=>{ this.getEmotes(socket) });
            socket.on('getPlaylist',  ()=>{ this.getPlaylist(socket) });
            socket.on('getUserlist',  ()=>{ this.getUserlist(socket) });
            socket.on('getInternals', ()=>{ this.getInternals(socket) });
        })
    }

    getEmotes(socket){
        socket.emit('emotes', this.bot.emotes);
    }

    getPlaylist(socket){
        socket.emit('playlist', this.bot.playlist);
    }

    getUserlist(socket){
        const userlist = this.bot.userlist;
        // TODO: Don't need to hide this from mods
        for (var i = userlist.length - 1; i >= 0; i--) {
            delete userlist[i]['meta']['ip']
            delete userlist[i]['meta']['aliases']
            delete userlist[i]['meta']['smuted']
        }
        socket.emit('userlist', userlist);
    }

    getInternals(socket){
        // TODO: Bot status like management/hybrid perms
        const processInfo = process.memoryUsage();
        const coreData = {
            host:       this.bot.client.host,
            chan:       this.bot.client.chan,
            user:       this.bot.client.user,

            weblink:    this.bot.server.weblink,
            webport:    this.bot.server.webport,
            sockport:   this.bot.server.sockport,

            prevUID:    this.bot.prevUID,
            currUID:    this.bot.currUID,
            currMedia:  this.bot.currMedia,
            leader:     this.bot.leader,

            started:    this.bot.started,
            heapTotal:  processInfo['heapTotal'],
            heapUsed:   processInfo['heapUsed'],
        }
        socket.emit('coreData', coreData);
    }
}


module.exports = PonkServer;
