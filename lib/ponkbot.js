/*!
**|   PonkBot Core
**@
*/

'use strict';

const EventEmitter = require('events');
const CyTubeClient = require('./client.js');
const PonkDatabase = require('./database.js');
const PonkLogger   = require('./logger.js');
const PonkServer   = require('./ponkserv.js');

const chalk = require('chalk');

class PonkBot extends EventEmitter {
    constructor(config){
        super();

        Object.assign(this, {
            name        : null,  // Who are we?
            rank        : -1,    // What rank are we?
            leader      : false, // Are we the leader?
            leaderData  : {},    // Current video position data
            playlist    : [],    // A list of videos
            listlocked  : false, // Is the playlist locked?
            gotPlaylist : false, // Have we ever gotten a playlist?
            currUID     : null,  // What is the current video?
            prevUID     : null,  // What was the last video?
            currMedia   : {},    // The current video data
            userlist    : [],    // A list of users
            emotes      : [],    // A list of emotes
            banlist     : [],    // A list of bans
            chanperms   : {},    // The ACL for the channel
            chanopts    : {},    // The channel configuration
            throttle    : true,  // Is chat throttle on?
            muted       : false, // Are we muted?

            // Config options
            peers       : [],    // A list of other bots in the room
            nodisk      : false, // Are we not writing log files?
            logmedia    : true,  // Should we log played media?
            logchat     : true,  // Should we log chat?
            useflair    : false, // Should we use our mod flair?
            codetag     : '`',   // How to make text coded?
            boldtag     : '*',   // How to make text bold?
            skewtag     : '_',   // How to make text italic?

            // Chat Commands Data
            commands : Object.assign({
                handlers  : {},   // Command functions
                helpdata  : {},   // Help data for web interface
                blacklist : [],   // Blacklisted Users
                hybrid    : {},   // Hybrid permissions store
                // Config options
                disabled  : [],   // Disabled commands
                logging   : true, // Log chat commands
                ignorelog : [],   // List of commands not worth logging
                trigger   : /^\$/ // Command triggers
            }, config.commands),

            // Cooldowns System
            cooldowns : {
                handlers : {},
                data : {
                    [config.sync.user]: {}
                },
            },

            // APIs stored here
            API : {
                keys  : config.api,
                agent : `PonkBot v${this.version}`
            },

            // What time were we born?
            started : Date.now(),
            // Are we on the road or are we on the dyno?
            debug : (process.env.NODE_ENV === 'production' ? false : true), 
        }, config.ponk);

        this.createLoggers();

        this.logger.log(`Contructing PonkBot v${this.version}.`);

        this.once('clientstart', ()=>{
            this.createServer(config.webhost);
            this.balloonCheck();
        });

        this.once('dbready', ()=>{
            this.createClient(config.sync)
                .once('ready', ()=>{
                    this.client.connect();
                    this.emit('clientinit');
                })
                .once('connected', ()=>{
                    this.registerEarlyOnce(this.client);
                    this.registerListeners(this.client);
                    this.client.start();
                    this.emit('clientready');
                })
                .once('started', ()=>{
                    this.setupCoreCommands(this.log);
                    this.registerLateListeners(this.client);
                    process.nextTick(()=>{
                        setTimeout(()=>{
                            if(!this.gotPlaylist && this.meeseeks('seeplaylist')){
                                this.logger.log(`Still haven't recieved playlist. Requesting.`)
                                this.client.socket.emit('requestPlaylist');
                            }
                        }, 500);
                    });
                    this.emit('clientstart');
                });
        });
        this.createDatabase(config.db)
            .once('ready', ()=>{
                this.emit('dbready');
            });
    }

    get version(){
        return require('../package.json').version;
    }

    createLoggers(){
        const logger = this.log = new PonkLogger();

        logger.registerLogger({
            label  : 'Bot Log',
            logid  : 'bot',
            file   : 'ponkbot.log',
            format : this.logFormatBot,
            opts   : { nodisk: this.nodisk }
        });
        if(this.logchat){
            logger.registerLogger({
                label  : 'Chat History',
                logid  : 'chat',
                file   : 'chat.log',
                format : this.logFormatChat,
                opts   : { noshell: true }
            });
        }
        if(this.logmedia){
            logger.registerLogger({
                label  : 'Media History',
                logid  : 'media',
                file   : 'media.log',
                format : this.logFormatMedia,
                opts   : { noshell: true }
            });
        }
        if(this.debug){
            logger.registerLogger({
                logid  : 'debug',
                file   : null,
                format : this.logFormatBot,
                opts   : { nodisk: true }
            });
        }

        this.assignLoggers(logger);
    }

    assignLoggers(logger){
        this.logger = {
            log: (...line)=>{
                logger.emit('bot', '[PonkCore]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[PonkCore]', ...line);
            },
            debug: (...line)=>{
                if(!this.debug){ return }
                logger.emit('debug', '[PonkCore]', ...line);
            },
            media: (video)=>{
                logger.emit('media', video);
            },
            command: (...line)=>{
                logger.emit('commands', ...line);
            },
            chat: (...line)=>{
                logger.emit('chat', ...line);
            },
        }
    }

    // formatters are bound to the logger so timestamp method is available
    logFormatBot(logType, ...args){
        args.unshift(`[${this.timestamp()}]`);
        if(logType === 'disk' || !Boolean(process.stdout.isTTY)){
            return args;
        }
        // TODO Color each module differently
        args[0] = chalk.rgb(190,  30, 121)(args[0]); // Timestamp
        args[1] = chalk.rgb(239,  78, 145)(args[1]); // Module
        args[2] = chalk.rgb(248, 185, 206)(args[2]); // Message
        return args;
    }

    logFormatChat(logType, { time, user, message, meta }){
        return [JSON.stringify({ time, user, message, meta })];
    }

    logFormatMedia(logType, { type, id, title, queueby }){
        return [JSON.stringify({ time: Date.now(), type, id, title, queueby })];
    }

    createDatabase(config){
        this.logger.log('Creating database.');
        this.db = new PonkDatabase(config, this.log, this);
        return this.db;
    }

    createClient(config){
        this.name = config.user;
        this.logger.log('Creating CyTube client.');
        this.client = new CyTubeClient(config, this.log);
        return this.client;
    }

    createServer(config){
        this.server = new PonkServer(config, this.log, this);
        return this.server;
    }

    registerEarlyOnce(socket){
        // So we don't request the playlist if it was already sent
        socket.once('playlist', ()=>{ this.gotPlaylist = true });

        // Set the channels throttle state at bot startup for trackThrottle
        socket.once('channelOpts', (opts)=>{ this.throttle = opts.chat_antiflood });
    }

    registerListeners(socket){
        this.logger.log('Registering client listeners.');
        /*
            ~~  Frames that don't need to be handled  ~~

        'costanza' -- Only sent when a user tries to ban themself
        'login'    -- Clients job

            // Frames left to TODO

        'announcement'
        'cancelNeedPassword'
        'channelNotRegistered'
        'channelRankFail'
        'channelRanks'
        'clearFlag'
        'clearVoteskipVote'
        'cooldown'
        'empty'
        'errorMsg'
        'kick'
        'loadFail'
        'needPassword'
        'noflood'
        'pm'
        'searchResults'
        'setFlag'
        'setMotd'
        'spamFiltered'
        'validationError'
        'validationPassed'
        'voteskip'
        'warnLargeChandump'

        'newPoll'
        'updatePoll'
        'closePoll'

        'addFilterSuccess'
        'channelCSSJS'
        'chatFilters'
        'deleteChatFilter'
        'readChanLog'
        'updateChatFilter'
        */

        socket.on('disconnect', ()=>{ this.handleDisconnection() });

        socket.on('rank',      (rank)=>{ this.handleRank(rank) }); // This is self rank
        socket.on('usercount', (count)=>{ this.handleUserCount(count) });

        socket.on('userlist',       (list)=>{ this.handleUserList(list) });
        socket.on('addUser',        (user)=>{ this.handleUserAdd(user) });
        socket.on('setAFK',         (user)=>{ this.handleUserAFK(user) });
        socket.on('setLeader',      (user)=>{ this.handleUserLeader(user) });
        socket.on('setUserMeta',    (user)=>{ this.handleUserMeta(user) });
        socket.on('setUserProfile', (user)=>{ this.handleUserProfile(user) });
        socket.on('setUserRank',    (user)=>{ this.handleUserRank(user) });
        socket.on('userLeave',      (user)=>{ this.handleUserRemove(user) });

        socket.on('emoteList',   (list)=>{ this.handleEmoteList(list) });
        socket.on('updateEmote', (emote)=>{ this.handleEmoteUpdate(emote) });
        socket.on('removeEmote', (emote)=>{ this.handleEmoteRemove(emote) });
        socket.on('renameEmote', (emote)=>{ this.handleEmoteRename(emote) });

        socket.on('playlist',          (list)=>{ this.handlePlaylist(list) });
        socket.on('setPlaylistLocked', (data)=>{ this.handlePlaylistLocked(data) });
        socket.on('setPlaylistMeta',   (data)=>{ this.handlePlaylistMeta(data) });
        socket.on('listPlaylists',     (data)=>{ this.handleListPlaylists(data) });
        socket.on('delete',            (data)=>{ this.handleVideoDelete(data) });
        socket.on('changeMedia',       (data)=>{ this.handleVideoChange(data) });
        socket.on('mediaUpdate',       (data)=>{ this.handleVideoUpdate(data) });
        socket.on('moveVideo',         (data)=>{ this.handleVideoMove(data) });
        socket.on('queue',             (data)=>{ this.handleVideoQueue(data) });
        socket.on('queueFail',         (data)=>{ this.handleVideoQueueFail(data) });
        socket.on('queueWarn',         (data)=>{ this.handleVideoQueueWarn(data) });
        socket.on('setCurrent',        (data)=>{ this.handleVideoCurrent(data) });
        socket.on('setTemp',           (data)=>{ this.handleVideoTemp(data) });

        socket.on('banlist', (list)=>{ this.handleBanList(list) });
        socket.on('banlistRemove', (ban)=>{ this.handleBanRemove(ban) });
        socket.on('setPermissions', (chanperms)=>{ this.handleChanPerms(chanperms) });
        socket.on('channelOpts', (chanopts)=>{ this.handleChanOpts(chanopts) });
        socket.on('clearchat', (who)=>{ this.handleClearChat(who) });
        socket.on('drinkCount', (count)=>{ this.handleDrinkCount(count) });
    }

    /*
    *  This prevents the initial burst of chatMsg from being logged
    *    along with other problems like processing chat commands from prev boots
    */
    registerLateListeners(socket){
        this.logger.log('Registering late listeners.');
        socket.on('chatMsg', (data)=>{ this.handleChatMessage(data) });
        socket.on('channelOpts', (opts)=>{ this.trackThrottle(opts) });
    }


    setupCoreCommands(logger){
        if(this.commands.logging){
            this.logger.debug(`Registering commands log.`);
            logger.registerLogger({
                label  : 'Commands Log',
                logid  : 'commands',
                file   : 'commands.log',
                format : null, // TODO
                opts   : {}
            });
        }

        this.logger.log(`Registering core chat command handlers and help entries.`);
        this.registerCommands(require('./corecommands.js'));
    }

    registerCommands({ handlers = {}, helpdata = {}, cooldowns = {} }){
        this.logger.debug('', '\n', handlers,'\n', helpdata, '\n', cooldowns);

        for (const handler in handlers) {
            this.logger.log(`Registering command handler ${handler}`);
            if(typeof this.commands.handlers[handler] !== 'undefined'){
                this.logger.log(`Handler ${handler} already exists! Overwriting`);
            }
            this.commands.handlers[handler] = handlers[handler].bind(this);
        }

        if(Object.keys(cooldowns).length){
            for (const cooldown in cooldowns){
                this.registerCooldown(cooldowns[cooldown]);
            }
        }

        // TODO: decide a helpdata structure

        return this;
    }

    commandDispatcher(user, message){
        let split = message.split(' ');
        const command = split.shift().slice(1);
        const params = split.join(' ').trim();
        const rank = this.getUserRank(user);

        if([this.name, ...this.peers].includes(user)){
            this.logger.debug(`Command ${command} invoked by self or peer.`);
            return;
        }

        if(this.commands.blacklist.includes(user)){
            this.logger.debug(`Command ${command} invoked by blacklisted user ${user}.`);
            return;
        }

        if(this.commands.disabled.includes(command)){
            this.logger.debug(`Disabled command ${command} invoked.`);
            return;
        }

        this.logger.log('Received command dispatch', command);
        if (command in this.commands.handlers){
            this.logger.command(`${user} invoked ${command} with ${params ? params : 'no params.'}`);
            this.commands.handlers[command](user, params, { command, message, rank });
        }
    }


    /**
     *  Cool downs system
     *
     */
    registerCooldown({ type, name, personalType, personalParams, sharedType, sharedParams }){
        this.logger.log(`Registering cooldown ${type}`);
        if(type in this.cooldowns.handlers){
            throw new Error('Cooldown type already defined')
        }

        function PersonalSince(since, type, justCheck, now, user){
            if(!this.cooldowns.data[user]){
                this.cooldowns.data[user] = {};
            }
            if(!this.cooldowns.data[user][type]){
                this.cooldowns.data[user][type] = now - since;
            }
            if(justCheck){
                return now - this.cooldowns.data[user][type] < since
            }
            this.cooldowns.data[user][type] = now;
        }

        function SharedSince(since, type, justCheck, now){
            if(justCheck){
                return ((now - this.cooldowns.data[this.name][type]) < since);
            }
            this.cooldowns.data[this.name][type] = now;
        }

        function SharedBucket(bucket, justCheck){
            if(justCheck){
                return (bucket.getTokensRemaining() < 1);
            }
            bucket.removeTokens(1, ()=>{});
        }

        function SharedLimiter(limiter, justCheck){
            if(justCheck){
                return (limiter.getTokensRemaining() < 1);
            }
            limiter.removeTokens(1, ()=>{});
        }

        let personal;
        switch(personalType){
            case 'since':
                if(isNaN(parseInt(personalParams)) || parseInt(personalParams) < 50){
                    throw new Error('Invalid personal cooldown since param');
                }
                personal = PersonalSince.bind(this, parseInt(personalParams), type);
                break;
            default:
                throw new Error('Invalid personal cooldown type');
        }

        let shared;
        switch(sharedType){
            case 'since':
                if(isNaN(parseInt(sharedParams)) || parseInt(sharedParams) < 0){
                    throw new Error('Invalid shared cooldown since param');
                }
                this.cooldowns.data[this.name][type] = Date.now() - parseInt(sharedParams);
                shared = SharedSince.bind(this, parseInt(sharedParams), type)
                break;
            case 'bucket':
                const bucket = new (require("limiter").TokenBucket)(...sharedParams);
                shared = SharedBucket.bind(this, bucket)
                this.cooldowns.data[this.name][type] = bucket;
                break;
            case 'limiter':
                const limiter = new (require("limiter").RateLimiter)(...sharedParams);
                shared = SharedLimiter.bind(this, limiter)
                this.cooldowns.data[this.name][type] = limiter;
                break;
            default:
                throw new Error('Invalid shared cooldown type');
        }

        this.cooldowns.handlers[type] = this.cooldown.bind(this, { type, name, personal, shared });
        return this;
    }

    // This is what bot chat command functions will call.
    checkCooldown(data){
        if(!data.user){
            this.logger.error(`Cooldown called with no user`);
            throw new Error('Cooldown called with no user');
        }
        if(!this.cooldowns.handlers[data.type]){
            this.logger.error(`Cooldown type ${data.type} is not registered.`);
            throw new Error('Cooldown called against unregistered type');
        }
        this.logger.debug(`Checking cooldown for ${data.type}`);
        return this.cooldowns.handlers[data.type](data);
    }

    // Bound versions of this to be invoked by the wrapper checkCooldown
    cooldown(cooldown, { user, modBypass = false }) {
        return new Promise((resolve, reject)=>{
            const now = Date.now();

            // First we check if both cooldowns will pass
            if( !modBypass && cooldown.shared(true, now) ){
                return reject(`${cooldown.name} Command Cooldown: Shared`);
            }
            if( !modBypass && cooldown.personal(true, now, user) ){
                return reject(`${cooldown.name} Command Cooldown: Personal`);
            }

            // Only if both pass do we actually touch them
            cooldown.shared(false, now);
            cooldown.personal(false, now, user);

            this.logger.debug(`Cooldown passed! Resolving.`);
            return resolve();
        });
    }

    checkPermission({ user, rank = 1<<16, hybrid = [] }){
        if(!user){
            throw new Error('Permission called with no user');
        }

        this.logger.log('Checking permissions.', user, rank, hybrid);
        return new Promise((resolve, reject) => {
            const ranked = rank <= this.getUserRank(user);
            if(ranked){
                return resolve('ranked');
            }
            if(hybrid.length && user in this.commands.hybrid){
                if(typeof hybrid === 'string'){
                    if(this.commands.hybrid[user].includes(hybrid)){
                        return resolve('hybrid');
                    }
                }
                if(Array.isArray(hybrid)){
                    let success = false;
                    const results = {};
                    while(hybrid.length){
                        let perm = hybrid.pop();
                        if(this.commands.hybrid[user].includes(perm)){
                            success = true;
                            results[perm] = true;
                        } else {
                            results[perm] = false;
                        }
                    }
                    if(success){
                        return resolve(results);
                    }
                }
            }
            return reject();
        });
    }

    getUserRank(name){
        let rank = 0;
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            rank = user.rank;
            break;
        }
        this.logger.debug('Checked user rank.', name, rank);
        return rank;
    }

    sendMessage(message, meta = {}){
        if(!this.meeseeks('chat')){
            this.logger.error('Unable to send chat messages due to restrictive channel permissions');
            return;
        }
        // Future home of other stuff like modflair and color overrides
        const { ignoremute } = meta;

        if(this.muted && !ignoremute){ return }

        this.client.chat({
            msg: message,
            meta: Object.assign({}, this.useflair && this.rank <= 2 ? {
                modflair: this.rank
            } : {})
        });
    }

    sendPrivate(message, user){
        if(!user){ throw new Error('Missing user parameter') }
        this.client.socket.emit('pm', {
            to: user, msg: message, meta: {}
        });
    }

    // Listen *UUUUrrp* listen Morty, we gotta have references... REFERENCES in the code Morty!
    meeseeks(permission){ // LOOK AT ME! CAN DO!
        const perms = [
            'seeplaylist',
            'playlistadd', 'playlistnext', 'playlistmove', 'playlistdelete', 'playlistjump', 'playlistaddlist',
            'oplaylistadd', 'oplaylistnext', 'oplaylistmove', 'oplaylistdelete', 'oplaylistjump', 'oplaylistaddlist',
            'playlistaddcustom', 'playlistaddrawfile', 'playlistaddlive', 'exceedmaxlength', 'addnontemp', 'settemp',
            'playlistshuffle', 'playlistclear', 'pollctl', 'pollvote', 'viewhiddenpoll', 'voteskip', 'viewvoteskip',
            'mute', 'kick', 'ban', 'motdedit', 'filteredit', 'filterimport', 'emoteedit', 'emoteimport', 'playlistlock',
            'leaderctl', 'drink', 'chat', 'chatclear', 'exceedmaxitems', 'deletefromchannellib', 'exceedmaxdurationperuser',
        ];
        if(!perms.includes(permission)){ throw new Error('Invalid permission') }

        return this.chanperms[permission] <= this.rank;
    }

    trackThrottle(opts) {
        const previous = this.throttle;
        const current = opts.chat_antiflood;
        if(current !== previous){
            this.sendMessage(`[Status] Chat Throttle ${current ? 'Active' : 'Inactive'}.`)
        }
        this.throttle = current;
    }

    mediaBlame(media, callback) {
        this.db.mediaBlame(media, [this.name, ...this.peers]).then((rows)=>{
            if(rows.length){
                return callback(rows.shift());
            }
            callback(false);
        },(error)=>{
            this.logger.error(`Media blame error: ${JSON.stringify(error)}`)
            callback(false);
        });
    }

    assignLeader(user) {
        if(!this.meeseeks('leaderctl')){
            return false;
        }

        this.logger.log(`Set ${user.length ? 'user ' + user : 'server'} as leader.`);
        this.client.socket.emit('assignLeader', { name: user });
    }

    sendMediaUpdate(time, paused) {
        switch(true){
            case typeof time !== 'number'      : return this.sendMessage('sendMediaUpdate: time param unset');
            case typeof paused === 'undefined' : return this.sendMessage('sendMediaUpdate: paused param unset');
            case !this.leader                  : return this.sendMessage('sendMediaUpdate: not leader');
            case !this.currMedia.id            : return this.sendMessage('sendMediaUpdate: no currMedia');
        }

        this.logger.log(`Setting media time to ${time} ${paused ? 'paused' : 'unpaused'}.`);

        this.client.socket.emit('mediaUpdate', {
            type        : this.currMedia.type,
            id          : this.currMedia.id,
            currentTime : time,
            paused      : paused,
        })
    }

}

// Frame Handlers
Object.assign(PonkBot.prototype, require('./handlers.js'))

// Helium Tank
Object.assign(PonkBot.prototype, require('./helium.js'));

// Utilities
Object.assign(PonkBot.prototype, {
    filterChat: function(msg) {
        return msg
            .replace(/&#39;/g,  `'`)
            .replace(/&amp;/g,  '&')
            .replace(/&lt;/g,   '<')
            .replace(/&gt;/g,   '>')
            .replace(/&quot;/g, '"')
            .replace(/&#40;/g,  '(')
            .replace(/&#41;/g,  ')')
            .replace(/(<([^>]+)>)/ig, '')
            .replace(/^[ \t]+/g, '')
            .trim()
    },
})

module.exports = PonkBot;
