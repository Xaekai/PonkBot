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

            domain     : 'www.derpibooru.org',
            errorcode  : ' ',
            embed      : '.pic',
            embedLarge : '.picl',
            spoiler    : '.spl',
            maxPages   : 5,

            useSpoiler  : true,
            useSmall    : true,
            commandLock : false,

            pendingExclusions : { 'favorites': [], 'topscoring': [] },
            pendingInclusions : { 'favorites': [], 'topscoring': [] },
            cachedStaging     : { 'favorites': [], 'topscoring': [] },
            cachedReStaging   : { 'favorites': [], 'topscoring': [] },
            favesData         : { 'user': {} },
            searchCache       : [],
            recentlySeen      : [],
        });
    }

    get requestOpts(){
        return {
            pool    : this.pool,
            timeout : this.timeout,
            headers : { 'User-Agent': this.agent }
        }
    }

    get recent(){
        this.expireRecent();
        return this.recentlySeen.map(seenData => seenData.imageID);
    }

    seen(imageID){
        if(this.recent.includes(imageID)){ return }
        this.recentlySeen.push({ imageID, timestamp: Date.now() })
    }

    expireRecent(){
        // TODO Expire recentlySeen older than 30 minutes
    }

    getRequest(url){
        return new Promise((resolve, reject)=>{
            request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                if(error){ 
                    return reject(error);
                }
                if(response.statusCode !== 200){ 
                    return reject(response.statusCode === 400 ? 'Bad Request' : 'Unknown');
                }
                const result = JSON.parse(body);

                if(result["error"]){ // { "status":"500", "error":"Internal Server Error" }
                    return reject(result["error"]);
                }

                return resolve(result);
            });
        });
    }

    getImageDataByID(imageID){
        return new Promise((resolve, reject)=>{
            const url = `https://${this.domain}/${imageID}.json?key=${this.key}`
            this.getRequest(url).then((result)=>{
                if(result.duplicate_of){
                    return resolve(this.getImageDataByID(result.duplicate_of));
                }
                return resolve(result);
            },(error)=>{
                return reject(error);
            });
        });
    }

    // https://derpibooru.org/search.json?q=pinkie+pie
    search(queryText) {
        return new Promise((resolve, reject)=>{
            const query = encodeURIComponent(queryText.split(',').filter((e) => { return e.trim().length}).join(','));
            if(!query.length){
                return reject('Empty search query');
            }

            // first lets get how many results this is gonna get
            const queryTotal = `https://${this.domain}/search.json?key=${this.key}&q=${query}&perpage=1`
            this.getRequest(queryTotal).then((result)=>{
                const results = result.total;
                if(results === 0){
                    return reject('No results');
                }

                const totalPages = Math.ceil(results / 50);
                let pages = Math.min(this.maxPages, totalPages);

                const queries = [];

                while(pages--){
                    const page = pages+1;
                    const url = `https://${this.domain}/search.json?key=${this.key}&q=${query}&sf=score&sd=desc&page=${page}&perpage=50`
                    queries.unshift(this.getRequest(url));
                }
                Promise.all(queries).then((searchResults)=>{
                    return resolve(searchResults.map(page => page.search).flat());
                }, (error)=>{
                    return reject(error);
                });
            },(error)=>{
                return reject(error);
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
            type: 'derpibooru', user, modBypass: this.getUserRank(user) > 2
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

    handleDerpi(user, params, meta){
        if (this.muted || !this.API.derpibooru || !params){
            return
        }

        const query = params.trim();
        if(!query){
            return this.sendPrivate('[Derpibooru] { Error: Invalid Command Syntax }', username);
        }

        this.checkCooldown({
            type: 'derpibooru', user, modBypass: this.getUserRank(user) > 2
        }).then(()=>{

            const postAPI = (resultSet)=>{
                // Remove recently seen
                let filteredSet = resultSet.filter(imageData => {
                    return !this.API.derpibooru.recent.includes(imageData.id);
                });
                // Entire search has been recently seen
                if(!filteredSet.length){
                    filteredSet = resultSet;
                }

                // Select random image
                const imageData = filteredSet[Math.floor(Math.random() * filteredSet.length)];
                // Recently seen now
                this.API.derpibooru.seen(imageData.id);
                // Display it
                this.sendMessage(`[Derpibooru] { Results: ${resultSet.length} }\n https://${imageData.representations.small}${this.API.derpibooru.embed}`);
            };

            const handleError = (err)=>{
                this.sendMessage(`[Derpibooru] Something went wrong. ${err}`);
            }

            this.API.derpibooru.search(query).then(postAPI, handleError);
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
        'derpi': function(user, params, meta){
            this.API.derpibooru.handleDerpi.call(this, user, params, meta);
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
