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
                logger.emit('bot', '[PonkServer]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[PonkServer]', ...line);
            },
            debug: (...line)=>{
                if(this.debug){
                    logger.emit('debug', '[PonkServer]', ...line);
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
            db.getUserById(id, function (err, user) {
                if(err){ throw new Error(err) }
                return done(null, user);
            });
        });

        passport.use(new Strategy({
            usernameField : 'username', // This refers to the field on the page, not the db structure
            passwordField : 'authkey',
            passReqToCallback : true // allows us to pass back the entire request to the callback
        },(req, username, password, done)=>{ // callback with email and password from our form

            this.logger.log('Attempted moderator login', username);
            db.getUserAuth(username, (err, user)=>{
                // if there are any errors, return the error before anything else
                if (err){ return done(err); }

                // if no user is found, return the message
                if (!user.user){
                    return done(null, false, req.flash('loginMessage', 'User not found.'));
                }

                // if the user is found but the password is wrong
                if (!(password === user.authkey)){
                    return done(null, false, req.flash('loginMessage', 'Invalid auth code.'));
                }

                this.logger.log('Moderator authenticated', user);
                // all is well, return successful user
                return done(null, user, req.flash('loginMessage', null));
            });

        }));
    }

    setupExpress(app, mw, config){
        this.session = mw.session({
            secret: config.secret,
            resave: false,
            saveUninitialized: false,
            store: new (mw.store(mw.session))({
                knex         : this.bot.db.knex,
                tablename    : 'sessionstore',
                sidfieldname : 'sessid',
                createtable  : false
            })
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
                });
            });
        });

        /*
            Authenication stuff
        */
        app.get('/auth', (req, res)=>{
            this.sendPug(res, 'auth', {
                loginMessage: req.flash('loginMessage'),
                user: req.user,
                bot: { channel: this.bot.chan, name: this.bot.name },
                serverIO: this.socketlink
            });
        });

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

    }

}



class PonkSocket {
    constructor({ port, session, logger, bot }){
        Object.assign(this, {
            bot, session, debug: (process.env.NODE_ENV === 'production' ? false : true)
        });
        this.setupLogger(logger);
        this.setupSocket(require('socket.io'), port);
    }

    setupLogger(logger){
        if(!logger){ throw new Error('Logger not provided') }
        this.logger = {
            log: (...line)=>{
                logger.emit('bot', '[PonkSocket]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[PonkSocket]', ...line);
            },
            debug: (...line)=>{
                if(this.debug){
                    logger.emit('bot', '[PonkSocket]', ...line);
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

    setupListeners(io){
        this.logger.log('Registering listeners.');

        io.sockets.on('connection', (socket)=>{
            this.logger.log('Socket connection established.');

            const moderator = this.isModerator(socket.request.session);
            this.logger.debug('Socket is moderator:', moderator);

            socket.on('getEmotes',    ()=>{ this.getEmotes(socket) });
            socket.on('getPlaylist',  ()=>{ this.getPlaylist(socket) });
            socket.on('getUserlist',  ()=>{ this.getUserlist(socket, moderator) });
            socket.on('getInternals', ()=>{ this.getInternals(socket, moderator) });
        })

        return io;
    }

    isModerator(session){
        // We have to be a moderator ourselves for this to matter
        if(this.bot.rank < 2){ return false }
        if(!session.passport){ return false }
        return session.passport.user.rank > 1;
    }

    getEmotes(socket){
        socket.emit('emotes', this.bot.emotes);
    }

    getPlaylist(socket){
        socket.emit('playlist', this.bot.playlist);
    }

    getUserlist(socket, moderator){
        this.logger.debug('Request for', moderator ? 'userlist by a moderator.' : 'userlist.');
        const userlist = this.bot.userlist;
        this.logger.debug('Current userlist', userlist);
        
        if(!moderator){
            for (var i = userlist.length - 1; i >= 0; i--) {
                delete userlist[i]['meta']['ip'];
                delete userlist[i]['meta']['aliases'];
                delete userlist[i]['meta']['smuted'];
            }
        }
        socket.emit('userlist', userlist, moderator);
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
