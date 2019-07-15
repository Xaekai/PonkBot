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


function unbanHandler(user, params, meta) {
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
                this.client.unban({ name, id });
            })
        }

        this.client.once('banlist', (banlist)=>{
            handleBanlist(banlist);
        })

        this.client.bans();

    },(message)=>{
        this.sendPrivate(message, user);
    });

}


function flagHandler(user, params, { command }) {
    this.checkPermission({
        user, rank: 3, hybrid: 'flags'
    }).then(()=>{
        this.mediaFlagByUID({
            uid: this.currUID,
            flag: command.replace('list','')
        });
    },(message)=>{
        this.sendPrivate(message, user);
    })
}


function barHandler(user, params, { command }){
    if(!params){
        return this.sendPrivate(`You must specify a target.`, user);
    }

    this.checkPermission({
        user, rank: 2, hybrid: 'mute'
    }).then(()=>{

        const [,target] = params.match(/([a-z0-9_\-]{1,20})/i);

        const checkPermission = (user) => {
            return new Promise((resolve)=>{
                this.checkPermission({ user, rank: 2, hybrid: 'mute' }).then(
                    ()=>{ resolve(true) },
                    ()=>{ resolve(false) }
                );
            });
        }

        Promise.all([
            this.userGet(user),
            this.userGet(target),
            checkPermission(target)
        ]).then((result)=>{
            const [caster, victim, peer] = result;
            const ranked = caster.rank <= victim.rank;
            const equals = `You may not ${command === 'disallow' ? 'bar' : 'unbar'} this user`;

            switch(true){
                case ranked && !peer: return this.userSetBarred(target, command === 'disallow');
                case ranked && peer: return this.sendPrivate(equals, user);
                default: this.userSetBarred(target, command === 'disallow');
            }

        },(error)=>{
            if(error.message === 'User not found'){
                return this.sendPrivate(error.message, user);
            }
            this.logger.error('Unexpected error', '\n', error);
        });

    },(message)=>{
        this.sendPrivate(message, user);
    });
}


function blockTrashHandler(user, params, { command }){
    if(!params){
        return this.sendPrivate(`You must specify a target.`, user);
    }

    this.checkPermission({
        user, rank: 3
    }).then(()=>{
        const parser = /([a-z0-9_\-]{1,20})(?:\s+(0|1|yes|no|y|n|true|false|t|f|active|inactive))?$/i;
        const positive = /1|yes|y|true|t|active/i;

        let target, active;
        try{
            [,target, active] = params.match(parser);
        }
        catch(error){
            return this.sendMessage('Invalid command syntax.');
        }

        if([this.name, ...this.peers].includes(target)){
            return this.sendMessage('You may not target a bot with this command.');
        }

        active = typeof active === 'undefined' || positive.test(active);
        if(command === 'blocklist'){
            this.userSetBlocked(target, active);
        }
        else{
            this.userSetTrashed(target, active);
        }

    },(message)=>{
        this.sendPrivate(message, user);
    });
}


function listFlaggedHandler(user, params, { command }){
    const message = (users) => {
        const status = users.length ? users.join(' ') : `There are no ${list.toLowerCase()} users`;

        this.sendMessage(`${list} users: ${status}.`);
    }

    let list;
    switch(command){
        case 'barredusers':  list = 'Barred'; this.usersGetBarred().then(message); break;
        case 'blockedusers': list = 'Blocked'; this.usersGetBlocked().then(message); break;
        case 'trashedusers': list = 'Trashed'; this.usersGetTrashed().then(message); break;
    }
}


function permissionHandler(user, params, { command }){
    this.checkPermission({
        user, rank: 3
    }).then(() => {
        const addpermission = (permissions) => {
            if(permissions.includes(permission)){
                this.sendMessage('User already has that permission.');
            }
            const newpermissions = [...new Set([permission, ...permissions])].sort();
            message(newpermissions);
        }

        const droppermission = (permissions) => {
            if(!permissions.includes(permission)){
                this.sendMessage(`User didn't have that permission.`);
            }
            const newpermissions = [...new Set(permissions.filter(perm => { return perm !== permission }))].sort();
            message(newpermissions);
        }

        const message = (newpermissions) => {
            this.userSetHybridPermissions(target, newpermissions);
            this.sendMessage(`Current perms of ${target} are: ${newpermissions.length ? newpermissions : 'None.'}`);
        }

        const parser = /([a-z0-9_\-]{1,20})\s+(\w+)$/i;
        let target, permission;
        try{
            [,target, permission] = params.match(parser);
        }
        catch(error){
            return this.sendMessage('Invalid command syntax.');
        }

        if([this.name, ...this.peers].includes(target)){
            return this.sendMessage('You may not target a bot with this command.');
        }

        this.userExists(target)
            .catch(problem => {
                this.sendMessage(`That user doesn't exist`);
            })
            .then(({ name, rank }) => { target = name; return { name, rank } })
            .then(({ name }) => this.userGetHybridPermissions(name))
            .then(permissions => {
                switch(command){
                    case 'addpermission': return addpermission(permissions);
                    case 'droppermission': return droppermission(permissions);
                }
            });

    },(message) => {
        this.sendPrivate(message, user);
    });
}


module.exports = {
    handlers: {

        // Formerly called "badidea"
        exec: function(user, params, { rank }){
            this.checkPermission({
                user, rank: 4
            }).then(()=>{
                try { eval(params) }
                catch(error) {
                    this.logger.error(error);
                    this.sendPrivate(`It didn't work`, user);
                }
            },()=>{
                this.sendPrivate(`You're not a founder.`, user);
                this.logger.log('User attempted to use exec.', user);
                if(this.meeseeks('kick') && this.rank > rank){
                    this.sendMessage(`/kick ${user} Attempting to use restricted commands.`)
                }
            });
        },

        clear: function(user, params, meta) {
            if(!this.meeseeks('chatclear')){
                return this.sendPrivate(`I lack this capability due to channel permission settings.`, user);
            }

            this.checkPermission({
                user, rank: 2, hybrid: 'clear'
            }).then(()=>{
                this.sendMessage(`/clear`, { ignoremute: true });
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
                this.db.authSetUserCode(user).then((code)=>{
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
                    this.mediaUpdate(time, false);
                    process.nextTick(()=>{
                        this.assignLeader('');
                    });
                });

                this.assignLeader(this.name);

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        addrandom: function(user, params, meta) {
            params = /\s/.test(params) ? params.split(/\s/).shift() : params;
            params = parseInt(params, 10);
            params = isNaN(params) ? 1 : params;
            params = Math.min(20, params);

            this.checkPermission({
                user, rank: 2, hybrid: 'random'
            }).then(()=>{
                this.mediaQueue(params);
            })
        },

        greylist: function(user, params, meta) {
            flagHandler.call(this, user, params, meta);
        },
        blacklist: function(user, params, meta) {
            flagHandler.call(this, user, params, meta);
        },
        whitelist: function(user, params, meta) {
            flagHandler.call(this, user, params, meta);
        },

        disallow: function(user, params, meta) {
            barHandler.call(this, user, params, meta);
        },
        allow: function(user, params, meta) {
            barHandler.call(this, user, params, meta);
        },

        trashlist: function(user, params, meta) {
            blockTrashHandler.call(this, user, params, meta);
        },
        blocklist: function(user, params, meta) {
            blockTrashHandler.call(this, user, params, meta);
        },

        barredusers: function(user, params, meta) {
            listFlaggedHandler.call(this, user, params, meta);
        },
        blockedusers: function(user, params, meta) {
            listFlaggedHandler.call(this, user, params, meta);
        },
        trashedusers: function(user, params, meta) {
            listFlaggedHandler.call(this, user, params, meta);
        },

        addpermission: function(user, params, meta) {
            permissionHandler.call(this, user, params, meta);
        },

        droppermission: function(user, params, meta) {
            permissionHandler.call(this, user, params, meta);
        },

    },

    // TODO: Settle on a structure for this
    helpdatas: {
        poll: {
            synop: 'Used to make polls.'
        },
    },
}
