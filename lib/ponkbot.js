/*!
**|   PonkBot Core
**@
*/

'use strict';

const EventEmitter = require('events');
const CyTubeClient = require('./client.js');
const PonkDatabase = require('./database.js');
const PonkLogger   = require('./logger.js');

class PonkBot extends EventEmitter {
    constructor(config){
        super();

        Object.assign(this, {
            name     : null,
            rank     : -1,
            leader   : false,
            userlist : [],
            playlist : [],
            emotes   : [],
        })

        this.logger = new PonkLogger()
            .registerLogger('bot', 'ponkbot.log')
            ;

        this.logger.emit('bot', '[PonkBot]', 'Contructing PonkBot.');

        this.once('dbready', ()=>{
            this.createClient(config.sync)
                .once('ready', ()=>{
                    this.emit('clientinit')
                    this.client.connect();
                })
                .once('connected', ()=>{
                    this.emit('clientready')
                    this.registerListeners(this.client);
                })
                .once('started', ()=>{
                    this.emit('clientstart')
                    this.registerLateListeners();
                })
        })
        this.createDatabase(config.db)
            .once('ready', ()=>{
                this.emit('dbready');
            });
    }

    createDatabase(config){
        this.logger.emit('bot', '[PonkBot]', 'Creating database.');
        this.db = new PonkDatabase(config, this.logger, this)
        return this.db;
    }

    createClient(config){
        this.name = config.user;
        this.logger.emit('bot', '[PonkBot]', 'Creating CyTube client.');
        this.client = new CyTubeClient(config, this.logger)
        return this.client;
    }

    registerListeners(socket){
        this.logger.emit('bot', '[PonkBot]', 'Registering client listeners.');
        // TODO
        /*
        'addFilterSuccess'
        'announcement'
        'banlist'
        'banlistRemove'
        'cancelNeedPassword'
        'channelCSSJS'
        'channelNotRegistered'
        'channelOpts'
        'channelRankFail'
        'channelRanks'
        'chatFilters'
        'chatMsg'
        'clearchat'
        'clearFlag'
        'clearVoteskipVote'
        'closePoll'
        'cooldown'
        'costanza'
        'delete'
        'deleteChatFilter'
        'disconnect'
        'drinkCount'
        'empty'
        'errorMsg'
        'kick'
        'loadFail'
        'login'
        'needPassword'
        'newPoll'
        'noflood'
        'pm'
        'readChanLog'
        'searchResults'
        'setCurrent'
        'setFlag'
        'setMotd'
        'setPermissions'
        'spamFiltered'
        'updateChatFilter'
        'updatePoll'
        'validationError'
        'validationPassed'
        'voteskip'
        'warnLargeChandump'

        'changeMedia'
        'listPlaylists'
        'mediaUpdate'
        'moveVideo'
        'playlist'
        'queue'
        'queueFail'
        'queueWarn'
        'setPlaylistLocked'
        'setPlaylistMeta'
        'setTemp'

        */

        socket.on('emoteList',   (list)=>{ this.handleEmoteList(list) });
        socket.on('updateEmote', (emote)=>{ this.handleEmoteUpdate(emote) });
        socket.on('removeEmote', (emote)=>{ this.handleEmoteRemove(emote) });
        socket.on('renameEmote', (emote)=>{ this.handleEmoteRename(emote) });

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

        this.client.start();
    }

    // This prevents the initial burst of chatMsg from being logged
    registerLateListeners(){
        // TODO: Add chatMsg handler here
    }

    // TODO
    registerCommand(){}
}


/*
    Frame Handlers
*/

Object.assign(PonkBot.prototype, {

    /* ~~ User related frames ~~ */

    // [{ name: <String>, rank: <Int>, profile: { image: <String>, text: <String> }, meta: { afk: <Bool>, muted: <Bool> } }, ... ]
    handleUserList: function(userlist){
        this.logger.emit('bot', '[PonkBot]', 'Received userlist.');
        this.userlist = userlist;

        for (const user of this.userlist) {
            /// this.db.userInsert(user.name, user.rank);
        }
    },

    // { name: <String>, rank: <Int>, profile: { image: <String>, text: <String> }, meta: { afk: <Bool>, muted: <Bool> } }
    handleUserAdd: function(userdata) {
        // I'm not sure why this check is necessary, but nukes bot had it
        if(this.userlist.some((user)=>{ return userdata.name === user.name })){
            return
        }

        this.userlist.push(userdata);
        /// this.db.userInsert(userdata.name, userdata.rank);
        this.logger.emit('bot', '[PonkBot]', `User ${this.userlist[this.userlist.length-1]['name']} connected.`);
    },

    // { name: <String> }
    handleUserRemove: function({ name: username }) {
        for(const user of this.userlist){
            if(user.name !== username){ continue }
            this.userlist.splice(this.userlist.indexOf(user), 1);
            this.logger.emit('bot', '[PonkBot]', `User ${username} disconnected.`);
            /// this.db.userLastSeen(username);
            break;
        }
    },

    // <Int>
    handleRank: function(rank){
        this.rank = rank;
        this.logger.emit('bot', '[PonkBot]', `Own rank set to ${rank}`);
    },

    // { name: <String>, rank: <Int> }
    handleUserRank: function({ name, rank }) {
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.rank = rank;
            /// this.db.userRank(name, rank);
            this.logger.emit('bot', '[PonkBot]', `User ${name} rank is now ${rank}.`);
            break;
        }
    },

    // { name: <String>, afk: <Bool> }
    handleUserAFK: function({ name, afk }) {
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.meta.afk = afk;
            this.logger.emit('bot', '[PonkBot]', `User ${name} AFK status is now: ${afk ? 'AFK' : 'Not AFK'}.`);
            break;
        }
    },

    // { name: <String>, meta: { afk: <Bool>, muted: <Bool> } }
    handleUserMeta: function({ name, meta }){
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.meta = meta;
            this.logger.emit('bot', '[PonkBot]', `User ${name} metadata has been updated.`,'AFK:', meta.afk, 'Muted:', meta.muted);
            break;
        }
    },

    // { name: <String>, profile: { image: <String>, text: <String> } }
    handleUserProfile: function({ name, profile }){
        for(const user of this.userlist){
            if(user.name !== name){ continue }
            user.profile = profile;
            this.logger.emit('bot', '[PonkBot]', `User ${name} profile has been updated.`);
            break;
        }
    },

    // <String>
    handleUserLeader: function(name){
        this.leader = name === this.name ? true : false;
        this.logger.emit('bot', '[PonkBot]', `${name.length ? 'User ' + name : 'The server'} is now leader.`);
    },

    // <Int>
    handleUserCount: function(count){
        /// this.db.usercount(count);
        this.logger.emit('bot', '[PonkBot]', `The channel now has ${count} users connected.`);
    },


    /* ~~ Emote related frames ~~ */

    // [ { name: <String>, image: <String>, source: <String> }, ... ]
    handleEmoteList: function(list){
        this.emotes = list;
        this.logger.emit('bot', '[PonkBot]', `Recieved emotelist.`);
    },

    // { name: <String>, image: <String>, source: <String> }
    handleEmoteUpdate: function({ name, image, source }){
        let found = false;
        for(const emote of this.emotes){
            if(emote.name !== name){ continue }
            emote.image = image;
            this.logger.emit('bot', '[PonkBot]', `Emote "${name}" updated to ${image}`);
            found = true;
            break;
        }
        if(!found){
            this.emotes.push({ name: name, image: image, source: source })
            this.logger.emit('bot', '[PonkBot]', `Emote "${name}" added.`);
        }
    },

    // { name: <String>, image: <String>, source: <String>, regex: {} }
    handleEmoteRemove: function({ name }){
        for(const emote of this.emotes){
            if(emote.name !== name){ continue }
            this.emotes.splice(this.emotes.indexOf(emote), 1);
            this.logger.emit('bot', '[PonkBot]', `Emote "${name}" removed.`);
            break;
        }
    },

    // { old: <String>, image: <String>, name: <String>, source: <String> }
    handleEmoteRename: function({ name, old, source }){
        for(const emote of this.emotes){
            if(emote.name !== old){ continue }
            emote.name = name, emote.source = source;
            this.logger.emit('bot', '[PonkBot]', `Emote "${old}" renamed to "${name}"`);
            break;
        }
    },

})

module.exports = PonkBot;
