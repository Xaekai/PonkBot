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
            started     : Date.now(), // What time were we born?
            name        : null,       // Who are we?
            rank        : -1,         // What rank are we?
            leader      : false,      // Are we the leader?
            leaderData  : {},         // Current video position data
            playlist    : [],         // A list of videos
            listlocked  : false,      // Is the playlist locked?
            gotPlaylist : false,      // Have we ever gotten a playlist?
            currUID     : null,       // What is the current video?
            prevUID     : null,       // What was the last video?
            currMedia   : {},         // The current video data
            userlist    : [],         // A list of users
            emotes      : [],         // A list of emotes
            banlist     : [],         // A list of bans
            chanperms   : {},         // The ACL for the channel
            chanopts    : {},         // The channel configuration
            throttle    : true,       // Is chat throttle on?
            nodisk      : false,      // Are we not writing log files?
            nomedia     : false,      // Even the play history?
            muted       : false,      // Are we muted?
            useflair    : false,      // Should we use our mod flair?
            codetag     : '`',        // What are the code tags?

            // Chat Commands Data
            commands : {
                handlers  : {}, // Command functions
                helpdata  : {}, // Help data for web interface
                blacklist : [], // Blacklisted Users
                hybrid    : {}, // Hybrid permissions store
            },

            // Cooldowns System
            cooldowns : {
                handlers: {},
                data: {
                    [config.sync.user]: {}
                },
            },

            // APIs stored here
            API: {
                keys: config.api,
                agent: `PonkBot v${this.version}`
            },

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
                    this.setupCoreCommands();
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
        this.log = new PonkLogger().registerLogger('bot', 'ponkbot.log', this.logFormatter, { nodisk: this.nodisk });
        if(!this.nomedia){
            this.log.registerLogger('media', 'media.log', this.logFormatterMedia, { noshell: true });
        }
        if(this.debug){
            this.log.registerLogger('debug', null, this.logFormatter, { nodisk: true });
        }
        this.assignLoggers(this.log);
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
                if(this.debug){
                    logger.emit('debug', '[PonkCore]', ...line);
                }
            },
            media: (video)=>{
                logger.emit('media', video);
            },
        }
    }

    // function is bound to the logger so timestamp is available
    logFormatter(logType, ...args){
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

    logFormatterMedia(logType, { type, id, title, queueby }){
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

    // TODO: decide a helpdata structure
    registerCommands({ handlers = {}, helpdata = {}, cooldowns = {} }){
        this.logger.log(`Registering chat command handlers and help entries.`);
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

        return this;
    }

    setupCoreCommands(){
        this.registerCommands(require('./corecommands.js'));
    }

    commandDispatcher(user, message){
        let split = message.split(' ');
        const command = split.shift().slice(1);
        const params = split.join(' ');
        this.logger.log('Received command dispatch', command);
        if (command in this.commands.handlers){
            this.commands.handlers[command](user, params, { command, message });
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
                if(isNaN(parseInt(sharedParams)) || parseInt(sharedParams) < 50){
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

    userAllowed(user){
        return !this.commands.blacklist.includes(user);
    }

    trackThrottle(opts) {
        const previous = this.throttle;
        const current = opts.chat_antiflood;
        if(current !== previous){
            this.sendMessage(`[Status] Chat Throttle ${current ? 'Active' : 'Inactive'}.`)
        }
        this.throttle = current;
    }

}



/*
    Frame Handlers
*/

Object.assign(PonkBot.prototype, {
    // ItBegins.png
    handleChatMessage: function({ username: user, msg: message, time, meta }){
        // TODO: Logging

        this.commandCheck = /^\./;
        const isCommand = (()=>{
            return true &&
            // Test message begins with $ or ! or . etc
            this.commandCheck.test(this.filterChat(message)) &&
            // No cheeky tricks
            user !== this.name &&
            // Final Test
            this.userAllowed(user);
        })();

        if(isCommand){ this.commandDispatcher(user, this.filterChat(message)) }
    },



    handleDisconnection: function(reason){
        this.logger.error('Disconnected from server.', reason);
        this.emit('shutdown');
        process.nextTick(()=>{
            process.exit(110); // C Standard errno for "Connection Timed Out"
        });
    },


    /* ~~ User related frames ~~ */

    // [{ name: <String>, rank: <Int>, profile: { image: <String>, text: <String> }, meta: { afk: <Bool>, muted: <Bool> } }, ... ]
    handleUserList: function(userlist){
        this.logger.log('Received userlist.');
        this.userlist = userlist;

        for (const user of this.userlist) {
            this.db.userInsert(user.name, user.rank);
        }
        this.emit('userlistChange');
    },

    // { name: <String>, rank: <Int>, profile: { image: <String>, text: <String> }, meta: { afk: <Bool>, muted: <Bool> } }
    handleUserAdd: function(userdata) {
        // I'm not sure why this check is necessary, but nukes bot had it
        if(this.userlist.some((user)=>{ return userdata.name === user.name })){
            return
        }

        this.userlist.push(userdata);
        this.db.userInsert(userdata.name, userdata.rank);
        this.logger.log(`User ${this.userlist[this.userlist.length-1]['name']} connected.`);
        this.emit('userlistChange');
    },

    // { name: <String> }
    handleUserRemove: function({ name: username }) {
        for(const user of this.userlist){
            if(user.name !== username){ continue }
            this.userlist.splice(this.userlist.indexOf(user), 1);
            this.logger.log(`User ${username} disconnected.`);
            /// this.db.userLastSeen(username);
            break;
        }
        this.emit('userlistChange');
    },

    // <Int>
    handleRank: function(rank){
        this.rank = rank;
        this.logger.log(`Own rank set to ${rank}`);
    },

    // { name: <String>, rank: <Int> }
    handleUserRank: function({ name, rank }) {
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.rank = rank;
            /// this.db.userRank(name, rank);
            this.logger.log(`User ${name} rank is now ${rank}.`);
            break;
        }
        this.emit('userlistChange');
    },

    // { name: <String>, afk: <Bool> }
    handleUserAFK: function({ name, afk }) {
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.meta.afk = afk;
            this.logger.log(`User ${name} AFK status is now: ${afk ? 'AFK' : 'Not AFK'}.`);
            break;
        }
        this.emit('userlistChange');
    },

    // { name: <String>, meta: { afk: <Bool>, muted: <Bool> } }
    handleUserMeta: function({ name, meta }){
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.meta = meta;
            this.logger.log(`User ${name} metadata has been updated.`,'AFK:', meta.afk, 'Muted:', meta.muted);
            break;
        }
        this.emit('userlistChange');
    },

    // { name: <String>, profile: { image: <String>, text: <String> } }
    handleUserProfile: function({ name, profile }){
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.profile = profile;
            this.logger.log(`User ${name} profile has been updated.`);
            break;
        }
        this.emit('userlistChange');
    },

    // <String>
    handleUserLeader: function(name){
        this.leader = name === this.name ? true : false;
        this.logger.log(`${name.length ? 'User ' + name : 'The server'} is now leader.`);
    },

    // <Int>
    handleUserCount: function(count){
        /// this.db.usercount(count);
        this.logger.log(`The channel now has ${count} users connected.`);
    },



    /* ~~ Emote related frames ~~ */

    // [ { name: <String>, image: <String>, source: <String> }, ... ]
    handleEmoteList: function(list){
        this.emotes = list;
        this.logger.log(`Recieved emotelist.`);
    },

    // { name: <String>, image: <String>, source: <String> }
    handleEmoteUpdate: function({ name, image, source }){
        let found = false;
        for(const emote of this.emotes){
            if(emote.name !== name){ continue }
            emote.image = image;
            this.logger.log(`Emote "${name}" updated to ${image}`);
            found = true;
            break;
        }
        if(!found){
            this.emotes.push({ name: name, image: image, source: source })
            this.logger.log(`Emote "${name}" added.`);
        }
    },

    // { name: <String>, image: <String>, source: <String>, regex: {} }
    handleEmoteRemove: function({ name }){
        for(const emote of this.emotes){
            if(emote.name !== name){ continue }
            this.emotes.splice(this.emotes.indexOf(emote), 1);
            this.logger.log(`Emote "${name}" removed.`);
            break;
        }
    },

    // { old: <String>, image: <String>, name: <String>, source: <String> }
    handleEmoteRename: function({ name, old, source }){
        for(const emote of this.emotes){
            if(emote.name !== old){ continue }
            emote.name = name, emote.source = source;
            this.logger.log(`Emote "${old}" renamed to "${name}"`);
            break;
        }
    },



    /* ~~ Playlist/Video related frames ~~ */

    /*
        [ { media:
            { id: <String>, title: <String>, seconds: <Int>, duration: <String>, type: <String>, meta: {} },
            uid: <Int>, temp: <Bool>, queueby: <String>
        }, ... ]
    */
    handlePlaylist: function(list){
        this.playlist = list;
        this.logger.log(`Recieved playlist.`);
        this.emit('playlistChange');
    },

    // <Bool>
    handlePlaylistLocked: function(locked){
        this.listlocked = locked;
        this.logger.log(`The playlist is now ${locked ? 'locked' : 'unlocked'}.`);
    },

    // { count: <Int>, rawTime: <Int>, time: <String> }
    handlePlaylistMeta: function({ count, time}){
        this.logger.log(`The playlist now has ${count} items and is ${time} in runtime.`);
    },

    handleListPlaylists: function(lists){
        // TODO Later
    },

    // { uid: <Int> }
    handleVideoDelete: function({ uid }){
        const index = this.playlist.findIndex(({ uid: vid })=>{ return uid === vid });
        if(index > -1){
            const { type, id, title } = this.playlist.splice(index, 1).pop().media;
            this.logger.log(`Playlist item "${title}" at index ${index} removed.`);
        }
        this.emit('playlistChange');
    },

    /*
        { id: <String>, title: <String>, seconds: <Int>, duration: <String>,
            type: <String>, meta: {}, currentTime: <Int>, paused: <Bool> }
    */
    handleVideoChange: function(video){
        this.currMedia = video
        this.logger.log(`Playlist item "${video.title}" is now playing.`);
        // TODO: Management

        /*
        *  If we can't see the playlist, we take care of it here,
        *    otherwise, we let handleVideoCurrent handle it
        */
        if(!this.meeseeks('seeplaylist')){
            this.logger.media(video);
        }
    },

    // <Int>
    handleVideoCurrent: function(uid){
        if(this.currUID === null){
            this.currUID = uid, this.prevUID = uid;
        } else {
            this.prevUID = this.currUID, this.currUID = uid;
        }

        if(this.meeseeks('seeplaylist')){
            const index = this.playlist.findIndex(({ uid: vid })=>{ return vid === uid });
            if(index > -1){
                const { type, id, title } = this.playlist[index]['media'],
                                  queueby = this.playlist[index]['queueby'];
                this.logger.log(`Playlist item "${title}" insterted into video stats.`);
                this.logger.media({ type, id, title, queueby });
                /// this.db.insertVideoStat(type, id, queueby)
            }
        }
    },

    // { currentTime: <Float>, paused: <Bool> }
    handleVideoUpdate: function({ currentTime, paused }){
        Object.assign(this.leaderData, { currentTime, paused });
        Object.assign(this.currMedia, { currentTime, paused });
        // TODO: Management
    },

    // { from: <Int>, after: <Int> }
    handleVideoMove: function({ from, after }){
        const index = this.playlist.findIndex(({ uid })=>{ return uid === from });
        const { title } = this.playlist[index]['media'];
        const displaced = this.playlist.splice(index, 1).pop();
        const newIndex = this.playlist.findIndex(({ uid })=>{ return uid === after });
        this.playlist.splice(newIndex + 1, 0, displaced);
        this.logger.log(`Playlist item "${title}" at index ${index} moved to index ${newIndex}.`);
        this.emit('playlistChange');
    },

    /*
        { item: {
                media: {
                    id: <String>, title: <String>, seconds: <Int>, duration: <String>, type: <String>, meta: {},
                },
                uid: <Int>, temp: <Bool>, queueby: <String>
            }, after: <Int> }
    */
    handleVideoQueue: function({ item, after }){
        if(!this.playlist.length){
            this.playlist.push(item);
            this.logger.log(`Playlist item "${item.media.title}" added at index 0.`);
        } else {
            const index = this.playlist.findIndex(({ uid })=>{ return uid === after });
            if(index === -1){ throw new Error('Invalid Playlist State') }
            this.playlist.splice(index + 1, 0, item);
            this.logger.log(`Playlist item "${item.media.title}" added at index ${index + 1}.`);
        }
        this.emit('playlistChange');
    },

    // { msg: <String>, link: <String>, id: <String> }
    handleVideoQueueFail: function(data){
        // TODO Later
    },

    // It doesn't matter what this frame looks like
    handleVideoQueueWarn: function(data){
        this.logger.log(`It's 2017 and Calvin still hasn't removed that stupid fucking warning about codecs.`);
    },

    // { uid: <Int>, temp: <Bool> }
    handleVideoTemp: function({ uid, temp }){
        const index = this.playlist.findIndex(({ uid: vid })=>{ return vid === uid });
        if(index > -1){
            this.playlist[index].temp = temp;
            const { type, id, title } = this.playlist[index]['media'];
            this.logger.log(`Playlist item "${title}" at index ${index} is now ${temp ? 'temporary' : 'permanent'}.`);
        }
        this.emit('playlistChange');
    },



    /* ~~ Misc frames ~~ */

    // { clearedBy: <String> }
    handleClearChat: function({ clearedBy: who }){
        this.logger.log(`User ${who} cleared the messagebuffer.`);
    },

    // <Object> too large to enumerate in a one line comment
    handleChanPerms: function(permissions){
        this.chanperms = permissions;
        this.logger.log(`Recieved channel permissions.`);
    },

    // <Object> too large to enumerate in a one line comment
    handleChanOpts: function(options){
        this.chanopts = options;
        this.logger.log(`Recieved channel options.`);
    },

    // [ { id: <Int>, ip: <String>, name: <String>, reason: <String>, bannedby: <String> }, ... ]
    handleBanList: function(banlist){
        this.banlist = banlist;
        this.logger.log(`Recieved ban list.`);
    },

    // { id: <Int>, name: <String> }
    handleBanRemove: function(ban){
        const index = this.banlist.findIndex(({ id })=>{ return ban.id === id });
        if(index > -1){
            this.banlist.splice(index, 1);
            this.logger.log(`Ban list item removed.`);
        }
    },

    // <Int>
    handleDrinkCount: function(count){
        this.logger.log(`The drink counter now reads ${count}.`);
    },


})

// Utilities
Object.assign(PonkBot.prototype, {
    filterChat: function(msg) {
        return msg
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#40;/g, "\(")
            .replace(/&#41;/g, "\)")
            .replace(/(<([^>]+)>)/ig, "")
            .replace(/^[ \t]+/g, "")
            .trim()
    },
})

// Helium Tank
Object.assign(PonkBot.prototype, require('./helium.js'));

module.exports = PonkBot;
