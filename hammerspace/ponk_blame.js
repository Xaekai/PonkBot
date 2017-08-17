/*!
**|   PonkBot Media Responsibility
**@
*/

// TODO:  Account for add command usage
function responsibility(user, params, { rank, command }) {
    if(this.meeseeks('seeplaylist')){
        if(!this.playlist.length){
            return this.sendMessage('The playlist is empty dumbass.', true);
        }
    } else {
        return this.sendMessage(`The playlist viewing permission is too restricted for this command to function.`, true);
    }

    const who = (bypass) => {
        let message;
        let blame = 'unknown';

        for(const video in this.playlist){
            console.log('checking video', video)
            if(this.playlist[video].uid !== this.currUID){ continue }
            blame = this.playlist[video].queueby; break;
        }

        if(![this.name, ...this.peers].includes(blame) && !/og|orig/i.test(params)){
            switch(command){
                case 'blame': message = `This disgusting piece of shit was queued by ${blame}.`;
                    break;
                case 'thank': message = `Based ${blame} queued a spicy one.`;
                    break;
            }

            return this.sendMessage(message, bypass)
        }

        return this.mediaBlame(this.currMedia, (row) => {
            switch(true){
                case ( row && command === 'blame'): 
                    message = `This foul adbomination was first unearthed by ${row.user}.`;
                    break;
                case ( row && command === 'thank'): 
                    message = `Based ${row.user} brought us the dankest memes.`;
                    break;
                case (!row && command === 'blame'): 
                    message = 'I bet the dragons did this.';
                    break;
                case (!row && command === 'thank'): 
                    message = 'A mysterious benevolent entity graciously supplied us with this media.';
                    break;
            }
            return this.sendMessage(message, bypass);
        })
    }

    this.checkCooldown({
        type: 'queueby', user, modBypass: rank > 2
    }).then(()=>{

        // Used solely to bypass mute
        this.checkPermission({
            user, rank: 2, hybrid: 'mute'
        }).then(()=>{
            who(true);
        },()=>{
            who(false);
        });

    },(message)=>{
        this.sendPrivate(message, user);
    });

}

module.exports = {
    meta: {
        active: true,
        type: 'gumdrop'
    },
    handlers: {

        blame: function(user, params, meta) {
            responsibility.call(this, user, params, meta);
        },

        thank: function(user, params, meta) {
            responsibility.call(this, user, params, meta);
        },

    },
    cooldowns: {
        queueby: {
            type           : 'queueby',
            name           : 'Media Responsibility',
            personalType   : 'since',
            personalParams : 15 * 1000,
            sharedType     : 'since',
            sharedParams   : 0,
        }
    },
}
