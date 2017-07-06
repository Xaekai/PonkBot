/*!
**|   PonkBot Frame Handlers
**@
*/

'use strict';

module.exports = {
    // ItBegins.png
    handleChatMessage: function({ username: user, msg: message, time, meta }){
        this.logger.chat({ time, user, message, meta });

        const triggered = this.commands.trigger.test(this.filterChat(message));
        if(triggered){ this.commandDispatcher(user, message) }
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
                this.db.mediaStat({ type, id, queueby });
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


}