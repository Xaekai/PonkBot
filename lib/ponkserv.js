/*!
**|   PonkBot Webhost
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

        this.setupServer();
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
            res.send(`const IO_URL = "${iolink}"`);
        })

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

module.exports = PonkServer;
