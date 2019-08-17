/*!
**|   PonkBot Horseshoe
**@
*/

'use strict';

const Dice = require('./dice.js');
const dice = new Dice(200);

module.exports = {
    meta: {
        active: true,
        type: 'gumdrop'
    },
    handlers: {

        dice: function(user, params, { rank }) {
            this.checkCooldown({
                type: 'rng', user, modBypass: rank > 2
            }).then(()=>{
                // Check for 'comments'
                if(params.match(/#|\/\//)){
                    switch(true){
                        case !!params.match(/\/\//): params = params.substring(0, params.indexOf('//'));
                        case !!params.match(/#/):    params = params.substring(0, params.indexOf('#'));
                    }
                }
                let roll;
                try{
                    roll = dice.parse(params);
                }
                catch(e){
                    return this.sendMessage(`[Dice] ${e}`);
                }
                this.sendMessage(`[Dice] ${user}: ${roll.total}`);
            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        '8ball': function(user, params, { rank }) {
            const choices = [
                '● It is certain',
                '● It is decidedly so',
                '● Without a doubt',
                '● Yes definitely',
                '● You may rely on it',
                '● As I see it, yes',
                '● Most likely',
                '● Outlook good',
                '● Yes',
                '● Signs point to yes',
                '● Reply hazy try again',
                '● Ask again later',
                '● Better not tell you now',
                '● Cannot predict now',
                '● Concentrate and ask again',
                '● Don\'t count on it',
                '● My reply is no',
                '● My sources say no',
                '● Outlook not so good',
                '● Very doubtful'
                ];

            this.checkCooldown({
                type: 'rng', user, modBypass: rank > 2
            }).then(()=>{

                const choice = choices[Math.floor(Math.random() * choices.length)];
                this.sendMessage(`[Magic Eightball]\n ${this.codetag}${params}${this.codetag} ${choice}`);

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        randomuser: function(user, params, { rank }) {
            this.checkCooldown({
                type: 'rng', user, modBypass: rank > 2
            }).then(()=>{
                const choices = this.userlist.map(user => user.name);
                let choice = choices[Math.floor(Math.random() * choices.length)];

                if(params.trim()){
                    return this.sendMessage(`[Random User] ${choice} ${params.trim()}`);
                }

                if(user == choice){ choice = 'themself'; };
                this.sendMessage(`[Random User] ${user} chooses ${choice}.`);

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        choose: function(user, params, { rank }) {
            if (!params){ return }

            this.checkCooldown({
                type: 'rng', user, modBypass: rank > 2
            }).then(()=>{

                let choices = params;

                if(choices.match(/,/)){
                    if(choices.match(' and ')){
                        choices = choices.replace(' and ',', ');
                    }
                    choices = choices.replace(/,\s+/g,',').split(',');
                } else {
                    choices = choices.trim().split(/\s+/);
                }

                const choice = choices[Math.floor(Math.random() * choices.length)]
                this.sendMessage(`[Choose] { ${choices.join(' | ')} } ${choice}`);

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

        ask: function(user, params, { rank }) {
            if (!params){ return }

            this.checkCooldown({
                type: 'rng', user, modBypass: rank > 2
            }).then(()=>{

                this.sendMessage(`[Ask] \n{ ${params} } ${['Yes', 'No'][Math.floor(Math.random() * 2)]}`);

            },(message)=>{
                this.sendPrivate(message, user);
            });
        },

    },
    cooldowns: {
        rng: {
            type           : 'rng',
            name           : 'Random Chance',
            personalType   : 'since',
            personalParams : 15000,
            sharedType     : 'since',
            sharedParams   : 2000,
        }
    }
}
