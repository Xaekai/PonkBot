/*!
**|   PonkBot Media Handling
**@
*/

'use strict';

const FLAGS = require('./flags.js');

module.exports = {

    mediaBlame: function(media, callback) {
        this.db.mediaBlame(media, [this.name, ...this.peers]).then((rows)=>{
            if(rows.length){
                return callback(rows.shift());
            }
            callback(false);
        },(error)=>{
            this.logger.error(`Media blame error: ${JSON.stringify(error)}`)
            callback(false);
        });
    },

    mediaUpdate: function(time, paused) {
        switch(true){
            case typeof time !== 'number'      : return this.sendMessage('mediaUpdate: time param unset');
            case typeof paused === 'undefined' : return this.sendMessage('mediaUpdate: paused param unset');
            case !this.leader                  : return this.sendMessage('mediaUpdate: not leader');
            case !this.currMedia.id            : return this.sendMessage('mediaUpdate: no currMedia');
        }

        this.logger.log(`Setting media time to ${time} ${paused ? 'paused' : 'unpaused'}.`);

        this.client.socket.emit('mediaUpdate', {
            type        : this.currMedia.type,
            id          : this.currMedia.id,
            currentTime : time,
            paused      : paused,
        });
    },

    mediaSend: function({ type, id, temp = true, pos = 'end' }) {
        const media = {
            'type'     : type,
            'id'       : id,
            'pos'      : pos,
            'temp'     : temp,
            'duration' : 0,
        }

        this.checkCooldown({ type: 'mediaSend', user: this.name, silent: true }).then(() => {
            this.logger.log(`Sending queue request for ${media.type}:${media.id}`);
            this.client.socket.emit('queue', media);
        },(message) => {
            setTimeout(()=>{
                process.nextTick(()=>{
                    this.mediaSend(media);
                });
            }, 500);
        });
    },

    mediaQueue: function(many) {
        const handleRow = (video) => {
            // duration is returned too, but we don't use it here
            const { type, id, title, flags } = video;

            if(type in this.validators){
                return this.validators[type](id).then(({ trash, reason, flag = false })=>{
                    if(!trash){
                        return this.mediaSend({ type, id });
                    }
                    this.mediaQueue(1);
                    this.logger.log('Media found to be invalid:', `${type}:${id}`, title);
                    if(flag){
                        if((flags & FLAGS.MEDIA.WHITE) === FLAGS.MEDIA.WHITE){
                            this.logger.log('Warning! Whitelisted video has been greylisted.');
                        }
                        this.db.mediaSetFlags({ type, id, title, flags: FLAGS.MEDIA.GREY });
                    }
                });
            }
            else {
                this.sendVideo({ type, id });
            }
        }

        // TODO: Whitelist
        this.db.mediaGet({ many, maxvidlen: this.maxvidlen, types: this.vidtypes }).then((rows)=>{
            if(!rows.length){
                this.logger.debug('Zero videos available. The media table may be empty.');
            }

            rows.forEach(video => {handleRow(video)});
        },(error)=>{
            this.logger.error(JSON.stringify(error));
        });
    },

    mediaValidate: function(playlistItem){
        this.logger.debug('Validating playlist item', playlistItem);

        const { type, id, title, seconds } = playlistItem.media;
        const { queueby, uid } = playlistItem;
        const rank = this.getUserRank(queueby);

        // TODO: Redesign how blacklist works

        const handleFlags = (flags) => {
            if(FLAGS.MEDIA.BLACK & flags && rank < 2){
                this.sendPrivate(`Media is blacklisted: ${type}:${id} - ${title}`, queueby);
                this.mediaDelete(uid);
                return;
            }

            this.userCheckBlocked(queueby).then((blocked)=>{
                handleBlock(blocked, flags)
            });
        }

        // Nuke's bot would greylist vids in this case but I don't think that's wise
        //   A particularly malicious malcontent could deliberately queue a bunch of good vids
        const handleBlock = (blocked, flags) => {
            if(blocked){
                this.sendPrivate(`You're playlist banned.`, queueby);
                this.mediaDelete(uid);
                return;
            }

            if(type in this.validators){
                this.validators[type](id).then(({ trash, reason, flag = false })=>{
                    if(!trash){
                        return; // TODO: Blacklist?
                    }

                    this.logger.log('Media found to be invalid:', `${type}:${id}`, title);

                    this.sendPrivate('Media you queued had issues:', queueby);
                    this.sendPrivate(`${type}:${id} - ${title}`, queueby);
                    this.sendPrivate(reason, queueby);

                    if(flag){
                        if((flags & FLAGS.MEDIA.WHITE) === FLAGS.MEDIA.WHITE){
                            this.logger.log('Warning! Whitelisted video has been greylisted.');
                        }
                        this.db.mediaSetFlags({ type, id, title, flags: FLAGS.MEDIA.GREY });
                    }

                    this.mediaDelete(uid);

                    // TODO: Cache validated media
                });
            }
            else {
                return; // TODO: Blacklist?
            }
        }

        if (![this.name, ...this.peers].includes(queueby)){
            this.db.mediaInsert({ type, id, title, duration : seconds });
        }

        // Start validation
        process.nextTick(()=>{
            this.db.mediaGetFlags({ type, id }).then(handleFlags);
        });
    },

    mediaGetByUID: function(uid){
        for(const item in this.playlist){
            if(this.playlist[item].uid === uid){ return this.playlist[item].media }
        }
        return false;
    },

    mediaGetByQueueby: function(user){
        return new Promise((resolve)=>{
            const mediaList = [];
            for(const item in this.playlist){
                if(this.playlist[item].queueby === user){
                    mediaList.push(this.playlist[item]);
                }
            }
            return resolve(mediaList);
        });
    },

    mediaDelete: function(uid){
        this.logger.log(`Deleting media uid ${uid}`);
        this.client.socket.emit('delete', uid);
    },

    mediaAddFlags: function({ type, id, flags, title = '' }){
        this.db.mediaSetFlags({ type, id, flags, title });
    },

    mediaGreylist: function({ type, id, title = '' }){
        this.mediaAddFlags({ type, id, flags: FLAGS.MEDIA.GREY });
    },

    mediaWhitelist: function({ type, id, title = '' }){
        this.mediaAddFlags({ type, id, flags: FLAGS.MEDIA.WHITE });
    },

    mediaBlacklist: function({ type, id, title = '', deletThis = true }){
        this.mediaAddFlags({ type, id, flags: FLAGS.MEDIA.BLACK });
        if(!deletThis){ return }
        for(const item in this.playlist){
            let media = this.playlist[item].media
            if(media.type === type && media.id === id){
                this.mediaDelete(this.playlist[item].uid);
            }
        }
    },

    mediaFlagByUID: function({ flag, uid }){
        const media = this.mediaGetByUID(uid);
        if(!media){ return }

        switch(flag.toLowerCase()){
            case 'grey'  : return this.mediaGreylist(media);
            case 'black' : return this.mediaBlacklist(media);
            case 'white' : return this.mediaWhitelist(media);
            default: throw new Error('Invalid flag type');
        }
    },

}

