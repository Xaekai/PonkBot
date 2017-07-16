/*!
**|   PonkBot Helium Tank
**@
*/

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {

    balloonCheck: function(){
        this.logger.log('Checking for balloons.');
        const balloons = path.join(__dirname, '..', 'balloons');

        fs.stat(balloons, (err, stats)=>{
            if(err){
                this.logger.debug(err);
                return this.logger.log('No balloon bag found.');
            }
            if(!stats.isDirectory()){
                return this.logger.error('WARNING! "balloons" exists in path but is not a directory.');
            }
            this.logger.debug('Balloon bag found. Searching.');
            this.balloonWalk(balloons);
        });
    },

    balloonWalk: function(bag){
        fs.readdir(bag, (err, files) => {
            const balloons = [];
            files.filter((balloon)=>{
                if(/^_/.test(balloon)){ return false }     // Disabled balloon
                if(!/ponk/i.test(balloon)){ return false } // Not one of Ponk's balloons
                return true;
            }).forEach(balloon => {
                this.logger.debug(`Found balloon: ${balloon}`);
                balloons.push(balloon);
            });
            if(balloons.length){
                this.inflate(bag, balloons.sort());
            }
        });
    },

    inflate: function(bag, stash){

        while(stash.length){
            let balloon = stash.pop();
            ((balloon, cutiemark)=>{
                if(typeof cutiemark.meta === 'undefined'){
                    return this.logger.error(`This balloon is bad: ${balloon}`);
                }
                if(!cutiemark.meta.active){
                    return this.logger.log(`Skipping inactive balloon: ${balloon}`);
                }
                if(cutiemark.meta.type === 'gumdrop'){
                    this.logger.log(`Inflating chat command balloon! ${balloon}`);
                    this.registerCommands(cutiemark);
                }
                if(cutiemark.meta.type === 'giggle'){
                    this.logger.log(`Inflating API balloon! ${balloon}`);
                    cutiemark.giggle(this).then(()=>{
                        this.registerCommands(cutiemark);
                    });
                }
                // Core balloon
                if(cutiemark.meta.type === 'laughter'){
                    this.logger.log(`Inflating cutiemark balloons!`);
                    cutiemark.giggle(this).then((result)=>{
                        cutiemark.laughter(this, result);
                    });
                }
            })(balloon, require(path.join(bag, balloon)));
        }
    },

}

