/*!
**|   PonkBot Integral Commands
**@
*/

'use strict';


function banHandler(user, params, { command }) {
    if(!this.meeseeks('ban')){
        return this.sendPrivate(`I lack this capability due to insufficient rank.`, user);
    }
    if(!params){
        return this.sendPrivate(`You must specify a target.`, user);
    }

    this.checkPermission({
        user, rank: 2, hybrid: 'ban'
    }).then(()=>{
        const sendBan = (target, reason) => {
            // So the user can see the ban message
            this.sendMessage(`/kick ${target} ${reason}`, { ignoremute: true });
            this.sendMessage(`/${command} ${target} ${reason}`,  { ignoremute: true });
            // TODO: Consider how to log
            // TODO: Strip range params from kick
            // TODO: Check if user present before kick
        }

        const split = params.trim().split(' ');
        const target = split.shift();
        const reason = split.join(' ');

        sendBan(target, reason);

    },(message)=>{
        this.sendPrivate(message, user);
    });
}

function unbanHandler(user, params, meta){
    if(!params){
        return this.sendPrivate(`You must specify a target.`, user);
    }

    this.checkPermission({
        user, rank: 2, hybrid: 'ban'
    }).then(()=>{
        const target = params.split(' ').shift();

        const handleBanlist = (banlist) => {
            banlist.forEach(ban => {
                if(ban.name.toLowerCase() !== target.toLowerCase()){ return }

                let { name, id } = ban;
                this.client.socket.emit('unban', { name, id });
            })
        }

        this.client.once('banlist', (banlist)=>{
            handleBanlist(banlist);
        })

        this.client.socket.emit('requestBanlist');

    },(message)=>{
        this.sendPrivate(message, user);
    });

}


module.exports = {
    handlers: {

        badidea: function(user, params, { rank }){
            this.checkPermission({
                user, rank: 4
            }).then(()=>{
                try { eval(params) } catch(err) { bot.sendChatMsg('It didn\'t work') }
            },()=>{
                this.sendPrivate(`You're not a founder.`, user);
                this.logger.log('User attempted to use exec.', user);
                if(this.meeseeks('kick') && this.rank > rank){
                    this.sendMessage(`/kick ${user} Attempting to use restricted commands.`)
                }
            });
        },

        status: function(user, params, meta){
            this.sendMessage(` Muted: ${ this.muted ? 'yes' : 'no' }, Management: Not Implemented `, { ignoremute: true });
        },

        emotes: function(user, params, meta){
            // TODO: Handle server not active
            this.sendPrivate(`${this.server.weblink}:${this.server.webport}/emotes`, user);
        },

        help: function(user, params, meta){
            // TODO: Handle server not active, link to github
            this.sendPrivate(`${this.server.weblink}:${this.server.webport}/help`, user);
        },

        internals: function(user, params, meta){
            // TODO: Handle server not active
            this.sendPrivate(`${this.server.weblink}:${this.server.webport}/internals`, user);
        },

        authorize: function(user, params, meta){
            this.checkPermission({
                user, rank: 2
            }).then(()=>{
                this.db.setUserAuth(user, (code)=>{
                    this.sendPrivate('Your authorization code', user);
                    this.sendPrivate(`${this.codetag} ${code} ${this.codetag}`, user);
                    this.logger.debug('Auth code', code);
                });
            },()=>{
                this.sendPrivate(`You're not a moderator.`, user);
                this.logger.log('User attempted to gain authorization.', user);
            });
        },

        mute: function(user, params, meta){
            this.checkPermission({
                user, rank: 2, hybrid: 'mute'
            }).then(()=>{
                // TODO: Persistence
                this.muted = true;
                this.logger.log(`Bot muted by ${user}.`);
                if(params.match(/silent|quiet/i)){ return }
                this.sendMessage('I am now muted.', { ignoremute: true });
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        unmute: function(user, params, meta){
            this.checkPermission({
                user, rank: 2, hybrid: 'mute'
            }).then(()=>{
                this.muted = false;
                this.logger.log(`Bot unmuted by ${user}.`);
                if(params.match(/silent|quiet/i)){ return }
                this.sendMessage('I am now unmuted.', { ignoremute: true });
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        poll: function(user, params, meta){
            if(!this.meeseeks('pollctl')){
                return this.sendPrivate(`I lack this capability due to channel permission settings.`, user);
            }
            if(!params.trim().length){
                return this.sendPrivate(`No parameters provided.`, user);
            }
            this.checkPermission({
                user, rank: 2, hybrid: 'poll'
            }).then(()=>{
                let hidden = false;
                const splitParams = params.split(';');

                if (splitParams[splitParams.length - 1].toLowerCase().trim().match(/true|hide|obscure/)) {
                    hidden = true
                    splitParams.pop();
                }

                this.client.createPoll({
                    title: splitParams.shift(),
                    opts: splitParams,
                    obscured: hidden
                })

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        endpoll: function(user, params, meta){
            if(!this.meeseeks('pollctl')){
                return this.sendPrivate(`I lack this capability due to channel permission settings.`, user);
            }
            this.checkPermission({
                user, rank: 2, hybrid: 'poll'
            }).then(()=>{
                this.client.closePoll();
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        kick: function(user, params, meta){
            if(!this.meeseeks('kick')){
                return this.sendPrivate(`I lack this capability due to channel permission settings.`, user);
            }
            if(!params.trim().length){
                return this.sendPrivate(`You must specify a target.`, user);
            }
            this.checkPermission({
                user, rank: 2, hybrid: 'kick'
            }).then(()=>{
                // TODO: Check presence and rank of target
                const target = params.trim().split(' ').shift();
                const reason = params.trim().split(' ').splice(1).join(' ');

                this.sendMessage(`/kick ${target} ${reason}`, { ignoremute: true });
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        ban: function(user, params, meta) {
            banHandler.call(this, user, params, meta);
        },

        ipban: function(user, params, meta) {
            banHandler.call(this, user, params, meta);
        },

        unban: function(user, params, meta) {
            unbanHandler.call(this, user, params, meta);
        },

        skip: function(user, params, meta){
            if(
                this.listlocked && (!this.meeseeks('playlistdelete') && !this.meeseeks('playlistjump'))
                ||
                !this.listlocked && (!this.meeseeks('oplaylistdelete') && !this.meeseeks('oplaylistjump'))
            ){
                return this.sendPrivate(`I lack this capability due to channel permission settings.`, user);
            }
            this.checkPermission({
                user, rank: 2, hybrid: 'skip'
            }).then(()=>{
                const canSee = this.meeseeks('seeplaylist');
                const canJump = this.meeseeks(this.listlocked ? 'playlistjump' : 'oplaylistjump');

                if(canSee && canJump){
                    let index = this.playlist.findIndex(({ uid })=>{ return this.currUID === uid });
                    // Wrap around?
                    if(index === this.playlist.length - 1){ index = 0 }else{ index++ }
                    const uid = this.playlist[index].uid;
                    this.client.jump(uid);
                } else {
                    this.client.deleteVideo(this.currUID);
                }
                this.logger.log(`${user} skipped currently playing media.`);
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        skiplock: function(user, params, meta){
            if(this.rank < 2){
                return this.sendPrivate(`I lack this capability due to insufficient rank.`, user);
            }
            this.checkPermission({
                user, rank: 2, hybrid: 'skip'
            }).then(()=>{
                // TODO accept ON/OFF params

                this.client.sendOptions({ 'allow_voteskip' : !this.chanopts.allow_voteskip });
                this.logger.log(`${user} ${true ? 'enabled' : 'disabled'} voteskip.`);
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        flood: function(user, params, meta){
            if(this.rank < 2){
                return this.sendPrivate(`I lack this capability due to insufficient rank.`, user);
            }
            this.checkPermission({
                user, rank: 2
            }).then(()=>{
                let toggle = !this.throttle;
                if(params.trim().length){
                    if(/off/i.test(params)){ toggle = false }
                    if(/on/i.test(params)){ toggle = true }
                }
                this.client.sendOptions({ 'chat_antiflood' : toggle });
                this.logger.log(`${user} ${toggle ? 'enabled' : 'disabled'} chat throttle.`);
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        shuffle: function(user, params, meta){
            if(!this.meeseeks('playlistshuffle')){
                return this.sendPrivate(`I lack this capability due to channel permission settings.`, user);
            }
            this.checkPermission({
                user, rank: 2, hybrid: 'shuffle'
            }).then(()=>{
                this.client.shuffle();
                this.logger.log(`${user} shuffled the playlist.`);
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        gettime: function(user, params, meta) {
            let time = Math.round(this.leaderData.currentTime);
            let h,m,s;

            h = `00${Math.floor(time / 3600)}`.slice(-2); time %= 3600;
            m = `00${Math.floor(time / 60)}`.slice(-2);
            s = `00${time % 60}`.slice(-2);

            if (h === '00') { h = null }
            if (m === '00') { m = null }

            time = `${h ? h+':' : ''}${m ? m+':' : ''}${s}`;

            this.sendMessage(`Current Time: ${time}`);
        },

        settime: function(user, params, meta) {
            if (!params){ return }

            if(!this.meeseeks('leaderctl')){
                return this.sendMessage('I lack this capability due to channel permission settings.');
            }

            this.checkPermission({
                user, rank: 2, hybrid: 'time'
            }).then(()=>{

                const [, seek, _time] = params.match(/(\+|\-)?(\d?\d:\d\d:\d\d|\d?\d:\d\d|\d*)/);
                var time = ((time)=>{
                    if(!/:/.test(time)){
                        return parseInt(time);
                    }
                    let segments = time.split(':');
                    let total = parseInt(segments.pop(), 10);
                    total += parseInt(segments.pop() * 60, 10);
                    if(segments.length){
                        total += parseInt(segments.pop() * 60 * 60, 10);
                    }
                    return total;
                })(_time);

                if (isNaN(time)){
                    return this.sendPrivate('Time given is not a number', user)
                }

                if (seek) {
                    switch(seek){
                        case '+': time = this.leaderData.currentTime + time; break;
                        case '-': time = this.leaderData.currentTime - time; break;
                    }
                }

                this.client.once('setLeader', ()=>{
                    this.sendMediaUpdate(time, false);
                    this.assignLeader('');
                });

                this.assignLeader(this.name);

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

    },

    // TODO: Settle on a structure for this
    helpdatas: {
        poll: {
            synop: 'Used to make polls.'
        },
    },
}

