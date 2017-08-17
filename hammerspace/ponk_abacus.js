/*!
**|   PonkBot Talking Abacus
**@
*/

'use strict';

const request = require('request');
const cheerio = require('cheerio');

class WolframAlpha {
    constructor(ponk){
        Object.assign(this, {
            key     : ponk.API.keys.wolfram,
            agent   : ponk.API.agent,
            pool    : new require('https').Agent({ maxSockets: 1 }),
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

    query(query){
        const url = `https://api.wolframalpha.com/v2/query?input=${encodeURIComponent(query)}&appid=${this.key}`;
        return new Promise((resolve, reject) => {

            const seekAnswer = (xml) => {
                const $ = cheerio.load(xml, { xml: true });

                if($('queryresult').attr('error') === 'true'){
                    reject($('error > msg').text());
                }
                if($('queryresult').attr('success') === 'false'){
                    let rejection = 'Query produced no results.'
                    if($('didyoumeans').length){
                        rejection += ` Did you mean ${$('didyoumean').first().text()}?`;
                    }

                    reject(rejection);
                }

                if($('#Result').length){
                    resolve($('#Result').find('plaintext').text());
                }

                const pods = $('pod');
                for (var i = 1, l = pods.length; i < l; i++) {
                    if($(pods[i]).find('plaintext').length){
                        resolve($(pods[i]).find('plaintext').text());
                    }
                }

                reject(`The parser isn't smart enough yet.`, console.error(xml));
            }

            request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                if(error){
                    reject(error);
                } else {
                    seekAnswer(body);
                }
            });
        })
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
            ponk.API.wolfram = new WolframAlpha(ponk);
            ponk.logger.log('Registering Wolfram API');
            resolve();
        })
    },
    handlers: {

        wolfram: function(user, params, meta){
            const handleResult = (result) => {
                result=result.replace('(open curly double quote)', '\u201C');
                result=result.replace('(close curly double quote)', '\u201D');

                const MAX_CHAT_LENGTH   = 240
                const HEADER_LENGTH     = 42
                const COLOR_CODE_LENGTH = this.talkColor && this.talkColor.length || 0;

                // Can we fit it on one line?
                if( result.length < (MAX_CHAT_LENGTH - (HEADER_LENGTH + COLOR_CODE_LENGTH)) ){
                    return this.sendMessage(`[Wolfram] { ${user}'s Query } ${result}`);
                }
                // How about two ?
                if( result.length < (MAX_CHAT_LENGTH - COLOR_CODE_LENGTH) ){
                    this.sendMessage(`[Wolfram] { ${user}'s Query }`);
                    return this.sendMessage(result);
                }

                // Big answer
                this.sendMessage(`[Wolfram] { ${user}'s Query }`);
                if(result.match(/\n/) && result.match(/\n/g).length > 1){
                    result = result.split('\n')

                    // Limit output to 12 lines
                    if(result.length > 12){
                        result.length = 12; var truncated = true;
                    }
                    while(result.length){
                        this.sendMessage(result.shift());
                    }
                    if(truncated){
                        this.sendMessage('Additional output truncated...')
                    }
                }
                else {
                    // If only one line break is present, its usually a provided source
                    // Split it off and send separately
                    if(result.match(/\n/)){
                        var attribution = result.split('\n');
                        result      = attribution[0];
                        attribution = attribution[1];
                    }
                    result = result.split(' ')

                    const sendLimit = (MAX_CHAT_LENGTH - COLOR_CODE_LENGTH) - 10;
                    var x = 0;
                    var currentString = '';

                    while (x < result.length) {
                        currentString = (currentString + result[x] + ' ');

                        if ( sendLimit < currentString.length ){
                            this.sendMessage(currentString);
                            currentString='';
                        };
                        x++;
                    }
                    // Send any leftovers
                    if(currentString){
                        this.sendMessage(currentString);
                    }
                    if(attribution){
                        this.sendMessage(attribution);
                    }
                }
            }

            if (!this.API.wolfram){
                return this.sendMessage('Wolfram API unavailable!');
            }

            this.checkPermission({
                user, rank: 1
            }).then((modBypass)=>{

                this.checkCooldown({
                    type: 'wolfram', user, modBypass: this.getUserRank(user) > 2
                }).then(()=>{

                    this.API.wolfram.query(params).then(handleResult, (err)=>{
                        this.sendMessage(`[Wolfram] Error. ${err}`);
                    })

                },(message)=>{
                    if(message.match(/shared/i)){
                        this.sendPrivate(`Wolfram allowance used up for the day.`, user);
                        return;
                    }
                    this.sendPrivate(message, user);
                });

            },()=>{
                this.sendPrivate(`Due to abuse only registered users can use this.`, user);
            });
        }

    },
    cooldowns: {
        wolfram: {
            type           : 'wolfram',
            name           : 'WolframAlpha',
            personalType   : 'since',
            personalParams : 15 * 1000,
            sharedType     : 'limiter',
            sharedParams   : [66, 'day'],
        }
    },
}

