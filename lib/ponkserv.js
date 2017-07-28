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
const passport = require('passport');
const Strategy = require('passport-local').Strategy;
const compression = require('compression');


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
        this.socket = new PonkSocket({
            port    : this.sockport,
            logger  : logger,
            bot     : bot,
            session : this.session
        });
    }

    setupLogger(logger){
        if(!logger){ throw new Error('Logger not provided') }
        this.logger = {
            log: (...line)=>{
                logger.emit('bot', '[PonkServ]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[PonkServ]', ...line);
            },
            debug: (...line)=>{
                if(this.debug){
                    logger.emit('debug', '[PonkServ]', ...line);
                }
            },
        }
    }

    get iolink(){
        return `${this.weblink}:${this.sockport}`;
    }

    get socketlink(){
        return `${this.iolink}/socket.io/socket.io.js`;
    }

    sendPug(res, page, locals){
        Object.assign(locals, {
            links: this.navLinks,
            bot: { chan: this.bot.client.chan, name: this.bot.name }
        });

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
            store:      require('connect-session-knex'),
        },{
            secret: this.secret
        });

        // Authenication Middleware
        this.setupPassport(this.host, this.bot.db);

        // Available pages
        this.setupRoutes(this.host);

        // TODO: Move this into the templater
        this.host.get('/sioconfig', (req, res) => {
            res.send(`const PONKSOCKET = "${this.iolink}"`);
        })

        this.logger.log('Listening.')
        this.host.listen(this.webport);
    }

    setupPassport(app, db){
        app.use(passport.initialize());
        app.use(passport.session()); // persistent login sessions

        passport.serializeUser(function({ id, rank }, done) {
            done(null, { id, rank });
        });

        passport.deserializeUser(({ id }, done)=>{
            db.authGetUserByID(id).then((user)=>{
                return done(null, user);
            },(error)=>{
                throw new Error(error);
            });
        });

        passport.use(new Strategy({
            usernameField : 'username', // This refers to the field on the page, not the db structure
            passwordField : 'authkey',
            passReqToCallback : true // allows us to pass back the entire request to the callback
        },(req, username, password, done)=>{ // callback with email and password from our form

            this.logger.log('Attempted moderator login', username);
            db.authGetUserByName(username).then((user)=>{
                // wrong password motherfucker
                if (password !== user.authkey){
                    return done(null, false, req.flash('loginMessage', 'Invalid auth code.'));
                }

                this.logger.log('Moderator authenticated', user);
                // all is well, return successful user
                return done(null, user, req.flash('loginMessage', null));
            },(error)=>{
                if(error.message === 'User not found'){
                    return done(null, false, req.flash('loginMessage', 'User not found.'));
                }
                return done(error);
            });

        }));
    }

    setupExpress(app, mw, config){
        this.store = new (mw.store(mw.session))({
            knex         : this.bot.db.knex,
            tablename    : 'sessionstore',
            sidfieldname : 'sessid',
            createtable  : false
        });

        setInterval(() => {
            this.store.length().then( (length) => {
                this.logger.log(`There are ${JSON.stringify(length)} sessions.`);
            })
        }, 1 * 60 * 1000);

        setInterval(() => {
            this.store.clear().then( (length) => {
                this.logger.log(`Cleared ${JSON.stringify(length)} sessions.`);
            })
        }, 5 * 60 * 1000);

        this.session = mw.session({
            secret: config.secret,
            resave: false,
            saveUninitialized: false,
            store: this.store
        });

        app.use(mw.cookie());
        app.use(mw.bodyparser.json());
        app.use(mw.bodyparser.urlencoded({ extended: true, limit: '24kb' }));
        app.use(this.session);
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
        this.navLinks = {
            '/home'      : 'Ponk',
            '/help'      : 'Help',
            '/internals' : 'Internals',
            '/stats'     : 'Statistics',
        }
        // TODO:   stats, scheduler, show system, movie system, emotes, and custom pages (stream help)

        Object.keys(this.navLinks)
            .map(item => item.slice(1))
            .forEach(page => {
                app.get(`/${page}`, (req, res)=>{
                    this.logger.debug(`Sending page: ${page}.`)
                    this.sendPug(res, page, {
                        user: req.user,
                        serverIO: this.socketlink
                    });
                });
            });


        /*
            Logs
        */
        Object.assign(this.navLinks, {
            '/logs' : 'Logs',
        });

        app.get('/logs/:logid', compression({
            threshhold: false,
            filter: ()=>{ return true }
        }), (req, res) => {
            const logid = req.params.logid;

            if(!(logid in this.bot.log.getLoggers())){
                return res.send('Invalid log id').sendStatus(500);
            }

            this.bot.log.streamLog(logid).then((stream)=>{
                stream.pipe(res);
            },(error)=>{
                res.send(JSON.stringify(error)).sendStatus(500);
            })
        });

        app.get('/logs', (req, res)=>{
            this.logger.debug(`Sending page: logs.`)
            this.sendPug(res, 'logs', {
                logs: this.bot.log.getLoggers(),
                user: req.user,
                serverIO: this.socketlink
            });
        });


        /*
            Authenication stuff
        */
        Object.assign(this.navLinks, {
            '/auth' : 'Moderator'
        });
        app.get('/auth', (req, res)=>{
            this.logger.debug(`Sending page: auth.`)
            this.sendPug(res, 'auth', {
                loginMessage: req.flash('loginMessage'),
                user: req.user,
                serverIO: this.socketlink
            });
        });

        app.get('/login', (req, res)=>{ return res.redirect('/auth') });
        app.post('/login', (req, res, next)=>{
            this.logger.log('[POST]', req.headers['x-forwarded-for'] || req.connection.remoteAddress,'requested','auth');
            if(
                !req.body.username || !req.body.username.length || 
                !req.body.authkey  || !req.body.authkey.length
                ){
                req.flash('loginMessage','Blank fields are not allowed.');
                return res.redirect('/auth');
            }
            return next();
        }, passport.authenticate('local', {
            successRedirect : '/auth',
            failureRedirect : '/auth',
            failureFlash : true
        }));


        /*
            Utilities
        */
        app.get('/clientip', (req, res, next)=>{
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        }, (req, res)=>{
            const ip = (req.headers['x-forwarded-for'] || '').split(',')[0]
                       || req.connection.remoteAddress;

            res.json({ clientIP: ip });
        })

    }

}



class PonkSocket {
    constructor({ port, session, logger, bot }){
        Object.assign(this, {
            bot, session, debug: (process.env.NODE_ENV === 'production' ? false : true)
        }, {
            subscriptions: {
                userlist: [], // These arrays contain the sockets that want pushed updates
                playlist: [],
            }
        });
        this.setupLogger(logger);
        this.setupSocket(require('socket.io'), port);
        this.setupSubscriptions();
    }

    setupLogger(logger){
        if(!logger){ throw new Error('Logger not provided') }
        this.logger = {
            log: (...line)=>{
                logger.emit('bot', '[PonkSock]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[PonkSock]', ...line);
            },
            debug: (...line)=>{
                if(this.debug){
                    logger.emit('bot', '[PonkSock]', ...line);
                }
            },
        }
    }

    setupSocket(io, port){
        this.logger.log('Creating socket host.');

        this.setupListeners(io.listen(port)).use((socket, next)=>{
            this.logger.debug('Socket connection sessioned.');
            this.session(socket.request, {}, next);
        });
    }

    setupSubscriptions(){
        this.bot.on('playlistChange', ()=>{
            if(this.subscriptions.playlist.length){
                this.logger.debug(`Sending playlist update to connected web interfaces`);
            }
            this.subscriptions.playlist.forEach((socket)=>{
                this.sendPlaylist(socket);
            });
        });
        this.bot.on('userlistChange', ()=>{
            if(this.subscriptions.userlist.length){
                this.logger.debug(`Sending userlist update to connected web interfaces`);
            }
            this.subscriptions.userlist.forEach((socket)=>{
                this.sendUserlist(socket);
            });
        });
    }

    unsubscribe(socket){
        const playInd = this.subscriptions.playlist.indexOf(socket);
        const userInd = this.subscriptions.userlist.indexOf(socket);
        if(playInd !== -1){
            this.subscriptions.playlist.splice(playInd, 1);
            this.logger.debug(`Socket unsubscribed for playlist changes.`);
        }
        if(userInd !== -1){
            this.subscriptions.userlist.splice(userInd, 1);
            this.logger.debug(`Socket unsubscribed for userlist changes.`);
        }
    }

    setupListeners(io){
        this.logger.log('Registering listeners.');

        io.sockets.on('connection', (socket)=>{
            this.logger.log('Socket connection established.');

            socket.moderator = this.isModerator(socket.request.session);
            this.logger.debug('Socket is moderator:', socket.moderator);

            socket.on('getEmotes',     ()=>{ this.getEmotes(socket) });
            socket.on('getPlaylist',   ()=>{ this.getPlaylist(socket) });
            socket.on('getUserlist',   ()=>{ this.getUserlist(socket) });
            socket.on('getInternals',  ()=>{ this.getInternals(socket) });
            socket.on('getStatistics', ()=>{ this.getStatistics(socket) });

            socket.once('getUserlist', ()=>{
                this.logger.debug(`Subscribing for userlist updates.`);
                this.subscriptions.userlist.push(socket);
            });

            socket.once('getPlaylist', ()=>{
                this.logger.debug(`Subscribing for playlist updates.`);
                this.subscriptions.playlist.push(socket);
            });

            socket.once('disconnect', ()=>{
                this.unsubscribe(socket);
                this.logger.debug(`Socket connection terminated.`);
            });

        });

        return io;
    }

    isModerator(session){
        // We have to be a moderator ourselves for this to matter
        if(this.bot.rank < 2){ return false }
        if(!session.passport){ return false }
        return session.passport.user.rank > 1;
    }

    getStatistics(socket){
        this.bot.statistics().then(stats => {
            socket.emit('statistics', stats);
        });
    }

    getEmotes(socket){
        socket.emit('emotes', this.bot.emotes);
    }

    getPlaylist(socket){
        this.logger.debug('Request for playlist.');
        this.sendPlaylist(socket);
    }

    getUserlist(socket){
        this.logger.debug(socket.moderator ? 'Request for userlist by a moderator.' : 'Request for userlist.');
        this.sendUserlist(socket);
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

    sendPlaylist(socket){
        socket.emit('playlist', this.bot.playlist);
    }

    sendUserlist(socket){
        /*
            Deep clone so we don't destroy the data on the original below.
            This isn't necessarily the best way, but userlist has no special objects
        */
        const userlist = JSON.parse(JSON.stringify(this.bot.userlist));

        if(!socket.moderator){
            for (var i = userlist.length - 1; i >= 0; i--) {
                delete userlist[i]['meta']['ip'];
                delete userlist[i]['meta']['aliases'];
                delete userlist[i]['meta']['smuted'];
            }
        }
        socket.emit('userlist', userlist, socket.moderator);
    }

}


module.exports = PonkServer;
