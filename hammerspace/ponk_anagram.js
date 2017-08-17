/*!
**|   PonkBot Command Anagram
**@
*/

'use strict';

const request = require('request');

class AnagramGenius {
    constructor(ponk){
        Object.assign(this, {
            agent   : ponk.API.agent,
            pool    : new require('http').Agent({ maxSockets: 1 }),
            timeout : 15 * 1000
        });
    }

    get requestOpts(){
        return {
            pool    : this.pool,
            timeout : this.timeout,
            headers : { 'User-Agent': this.agent }
        }
    }

    query(string){
        return new Promise((resolve, reject)=>{

            // I have having to use http but their cert was broken
            const url = `http://anagramgenius.com/server.php?source_text=${encodeURI(string)}&vulgar=1`;
            request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                if(error){
                    reject(error);
                } else {
                    const result = body.match(/.*<span class=\"black-18\">'(.*)'<\/span>/);
                    resolve(result);
                }
            });

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
            ponk.API.anagram = new AnagramGenius(ponk);
            ponk.logger.log('Registering Anagram API');
            resolve();
        })
    },
    handlers: {

        anagram: function(user, params, { rank }){
            if (this.muted || !this.API.anagram || !params){ return }

            this.checkCooldown({
                type: 'anagram', user, modBypass: rank > 2
            }).then(()=>{
                const done = (resp) => {
                    this.sendMessage(`[Anagram] (${params}) -> ${resp[1]}`);
                }

                var query = params;
                if (params.length < 7) {
                    return this.sendMessage('Message too short')
                } else if (params.length > 30) {
                    query = params.replace(/\s/g, '');
                    if(query.length > 30){
                        return this.sendMessage('Message too long')
                    }
                }

                this.API.anagram.query(query).then(done, (err)=>{
                    this.sendMessage(`[Anagram] Something went wrong. ${err}`);
                })
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

    },
    cooldowns: {
        anagram: {
            type           : 'anagram',
            name           : 'Anagram Genius',
            personalType   : 'since',
            personalParams : 10 * 1000,
            sharedType     : 'since',
            sharedParams   : 5 * 1000,
        }
    }
}
