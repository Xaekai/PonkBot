/*!
**|   PonkBot Talks
**@
*/

'use strict';

class Cleverbot {
    constructor(ponk){
        const Cleverbot = require('cleverbot');
        const key = ponk.API.keys.cleverbot;
        this.clever = new Cleverbot({ key });
        this.cs = false;
    }

    query(string){
        return new Promise((resolve, reject)=>{
            const cs = this.cs;
            this.clever.query(string, { cs }).then((response)=>{
                this.cs = response.cs;
                resolve(response.output);
            },(err)=>{
                reject(JSON.stringify(err));
            })
        });
    }
}

module.exports = {
    meta: {
        active: true,
        type: 'giggle'
    },
    giggle: function(ponk){
        return new Promise((resolve, reject)=>{
            ponk.API.cleverbot = new Cleverbot(ponk);
            ponk.logger.log('Registering Cleverbot API');
            resolve();
        })
    },
    handlers: {

        talk: function(user, params, { rank }){
            if (this.muted || !this.API.cleverbot || !params){ return }

            this.checkCooldown({
                type: 'cleverbot', user, modBypass: rank > 2
            }).then(()=>{
                const done = (resp) => {
                    this.sendMessage(`. ${resp}`);
                }

                this.API.cleverbot.query(params).then(done, (err)=>{
                    this.sendMessage(`[Cleverbot] Something went wrong. ${err}`);
                })
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

    },
    cooldowns: {
        cleverbot: {
            type           : 'cleverbot',
            name           : 'Cleverbot',
            personalType   : 'since',
            personalParams : 5 * 1000,
            sharedType     : 'since',
            sharedParams   : 2 * 1000,
        }
    }
}

