/*!
**|   PonkBot Derpibooru API
**@
*/

'use strict';

const request = require('request');

class Derpibooru {
    constructor(ponk){
        Object.assign(this, {
            key     : ponk.API.keys.derpibooru,
            agent   : ponk.API.agent,
            pool    : new require('https').Agent({ maxSockets: 2 }),
            timeout : 15 * 1000,

            errorcode  : ' ',
            embed      : '.pic',
            embedLarge : '.picl',
            spoiler    : '.spl',

            useSpoiler  : true,
            useSmall    : true,
            commandLock : false,

            pendingExclusions : { 'favorites': [], 'topscoring': [] },
            pendingInclusions : { 'favorites': [], 'topscoring': [] },
            cachedStaging     : { 'favorites': [], 'topscoring': [] },
            cachedReStaging   : { 'favorites': [], 'topscoring': [] },
            favesData         : { 'user': {} },
            searchCache       : []
        });
    }

    get requestOpts(){
        return {
            pool    : this.pool,
            timeout : this.timeout,
            headers : { 'User-Agent': this.agent }
        }
    }

    getImageDataByID(imageID){
        return new Promise((resolve, reject)=>{
            const url = `https://derpibooru.org/${imageID}.json?key=${this.key}`
            request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                if(error || response.statusCode !== 200){
                    return reject(error || response.statusCode === 400 ? 'Bad Request' : 'Unknown');
                } else {
                    let result = JSON.parse(body);

                    // TODO: recurse on `duplicate_of`

                    // { "status":"500", "error":"Internal Server Error" }
                    if(result["error"]){
                        return reject(result["error"]);
                    }

                    return resolve(result);
                }
            });
        });
    }



    /*
        Command handlers are called in the context of the bot, not the class
        Use "this.API.derpibooru" to get to the class
    */
    handleBooru(user, params, meta){
        if (this.muted || !this.API.derpibooru || !params){
            return
        }

        const imageID = params.trim().match(/^\d+/)
        if(!imageID){
            return this.sendPrivate('[Derpibooru] { Error: Invalid Command Syntax }', username);
        }

        this.checkCooldown({
            type: 'derpibooru', user
        }).then(()=>{

            const postAPI = (imageData)=>{
                this.sendMessage(`[Derpibooru]\n https://${imageData.representations.small}${this.API.derpibooru.embed}`);
            };

            const handleError = (err)=>{
                this.sendMessage(`[Derpibooru] Something went wrong. ${err}`);
            }

            this.API.derpibooru.getImageDataByID(imageID).then(postAPI, handleError);
        },(message)=>{
            this.sendPrivate(message, user);
        });

    }

}


module.exports = {
    meta: {
        active: true,
        type: 'giggle'
    },
    giggle: function(ponk){
        // TODO: Handle absence of keys in config file
        return new Promise((resolve, reject)=>{
            ponk.API.derpibooru = new Derpibooru(ponk);
            ponk.logger.log('Registering Derpibooru API');
            resolve();
        });
    },
    handlers: {
        'booru': function(user, params, meta){
            this.API.derpibooru.handleBooru.call(this, user, params, meta);
        },
    },
    cooldowns: {
        derpibooru: {
            type           : 'derpibooru',
            name           : 'Derpibooru Images',
            personalType   : 'since',
            personalParams : 60 * 1000,
            sharedType     : 'since',
            sharedParams   : 5000,
        }
    },
}

