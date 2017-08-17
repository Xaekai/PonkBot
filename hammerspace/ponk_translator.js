/*!
**|   PonkBot Universal Translator
**@
*/

'use strict';

class Translator {
    constructor(ponk){
        this.translate = require('google-translate-api');
    }

    query({ string, route }){
        return this.translate(string, route);
    }
}

module.exports = {
    meta: {
        active: true,
        type: 'giggle'
    },
    giggle: function(ponk){
        return new Promise((resolve, reject)=>{
            ponk.API.translate = new Translator(ponk);
            ponk.logger.log('Registering Translate API');
            resolve();
        })
    },
    handlers: {

        translate: function(user, params, { rank }){
            if (this.muted || !this.API.translate || !params){ return }

            this.checkCooldown({
                type: 'translate', user, modBypass: rank > 2
            }).then(()=>{
                const done = (resp) => {
                    this.sendMessage(`[${resp.from.language.iso}->${to}] ${resp.text}`);
                }

                var groups = params.match(/^(\[(([A-z]{2})|([A-z]{2}) ?-?>? ?([A-z]{2}))\] ?)?(.+)$/)

                var from = groups[4]
                var to = groups[5]
                var text = groups[6]
                if (!from) {
                    from = 'auto'
                    to = 'en'
                }
                const query = {
                    string: text,
                    route: {
                        from: from,
                        to: to
                    }
                }

                this.API.translate.query(query).then(done, (err)=>{
                    this.sendMessage(`[Translate] Something went wrong. ${err}`);
                })
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },


        vodka: function(user, params, { rank }){
            if (this.muted || !this.API.translate || !params){ return }

            this.checkCooldown({
                type: 'translate', user, modBypass: rank > 2
            }).then(()=>{
                const done = (resp) => {
                    this.sendMessage(`[Vodka] ${resp.text}`);
                }

                const query = {
                    string: params,
                    route: {
                        from: 'en',
                        to: 'ru',
                    }
                }

                this.API.translate.query(query).then(done, (err)=>{
                    this.sendMessage(`[Translate] Something went wrong. ${err}`);
                })
            },(message)=>{
                this.sendPrivate(message, user);
            });

        },

        taco: function(user, params, { rank }){
            if (this.muted || !this.API.translate || !params){ return }

            this.checkCooldown({
                type: 'translate', user, modBypass: rank > 2
            }).then(()=>{
                const done = (resp) => {
                    this.sendMessage(`[Taco] ${resp.text}`);
                }

                const query = {
                    string: params,
                    route: {
                        from: 'en',
                        to: 'es',
                    }
                }

                this.API.translate.query(query).then(done, (err)=>{
                    this.sendMessage(`[Translate] Something went wrong. ${err}`);
                })
            },(message)=>{
                this.sendPrivate(message, user);
            });

        },

    },
    cooldowns: {
        translate: {
            type           : 'translate',
            name           : 'Translator',
            personalType   : 'since',
            personalParams : 10 * 1000,
            sharedType     : 'since',
            sharedParams   : 5 * 1000,
        }
    }
}

