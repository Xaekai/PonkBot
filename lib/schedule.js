/*!
**|   PonkBot Scheduling
**@
*/

'use strict';

module.exports = {

    scheduleInit : function(config, logger){
        const defaults = {
            enabled : false,

            host : '127.0.0.1',
            port : '27017',
        }
        const setup = Object.assign({}, defaults, config);
        if(setup.enabled){
            // Defined here instead of top level because opt-depends
            const Scheduler = require('./scheduler.js');

            this.logger.log('Activating Scheduler.');
            this.scheduler = new Scheduler({
                address    : `${setup.host}:${setup.port}/${this.name}`,
                collection : this.channel,
            }, logger, this);
            this.scheduleListen(this.scheduler);
        }
        else {
            this.logger.log('Scheduler is disabled.');
            this.scheduler = setup;
        }
    },

    scheduleListen : function(scheduler){
        // TODO

        scheduler.on('ready', () => {
            this.sendMessage('[Scheduler] Enabled and ready.', { ignoremute: true })
        });

        scheduler.on('queueMedia',   (data) => { this.scheduleHandle('media', data) });
        scheduler.on('queueEpisode', (data) => { this.scheduleHandle('episode', data) });
        scheduler.on('queueMovie',   (data) => { this.scheduleHandle('movie', data) });
    },

    // Gets the task schedule for the backend interface
    scheduleGet : function(callback) {
        return new Promise((resolve, reject) => {
            if(!this.scheduler.enabled){
                return reject(new Error('The Scheduler is not enabled.'));
            }
            if(!this.scheduler.active){
                return reject(new Error('The Scheduler is not active yet.'));
            }
            this.scheduler.getJobs()
                .then(jobs => resolve(jobs)).catch(error => reject(error));
        });
    },

    // Removes a scheduler task
    scheduleRemove : function(query) {
        return new Promise((resolve, reject) => {
            if(!this.scheduler.enabled){
                return reject(new Error('The Scheduler is not enabled.'));
            }
            if(!this.scheduler.active){
                return reject(new Error('The Scheduler is not active yet.'));
            }
            if(!query.jobID){
                return reject(new Error('Invalid request.'));
            }
            this.scheduler.removeJob(query.jobID)
                .then(job => resolve(job)).catch(error => reject(error));
        });
    },

    // Create a scheduler task
    scheduleCreate : function(jobData) {
        return new Promise((resolve, reject) => {
            if(!this.scheduler.enabled){
                return reject(new Error('The Scheduler is not enabled.'));
            }
            if(!this.scheduler.active){
                return reject(new Error('The Scheduler is not active yet.'));
            }
            this.scheduler.createJob(jobData, resolve);
        });
    },

    scheduleHandle : function() {
        this.sendMessage('[Scheduler] Performing Scheduled Playlist Action', { ignoremute: true });
    },
}


//TODO

const scheduleCommand = function(user, params, meta) {
    if(!this.scheduler.enabled){
        return this.sendMessage('The Scheduler is not enabled.');
    }

    this.checkPermission({
        user, rank: 2, hybrid: 'schedule'
    }).then(()=>{
        if(!this.scheduler.active){
            return this.sendMessage('The Scheduler is not active yet.');
        }

        if (!params){
            if (true){ // TODO: Handle disabled webserver
                return this.sendPrivate(`${this.server.weblink}:${this.server.webport}/scheduler`, user);
            }
            else {
                return this.sendPrivate('No params provided and the scheduler web interface is unavailable.');
            }
        }



            if(!params.match(/:/) || !params.match(/;/) || !params.match(/(?:yt|gd|gp|vi|dm|ep):[a-zA-Z0-9_,-]/)){
                return this.sendMessage('[Scheduler] Command Syntax Error.');
            }

        var urlRegex= new RegExp([
            /(?:(?:(https?|ftp):)?\/\/)/      // protocol
            ,/(?:([^:\n\r]+):([^@\n\r]+)@)?/  // user:pass
            ,/(?:(?:www\.)?([^\/\n\r]+))/     // domain
            ,/(\/[^?\n\r]+)?/                 // request
            ,/(\?[^#\n\r]*)?/                 // query
            ,/(#?[^\n\r]*)?/                  // anchor
        ].map(r => r.source).join(''));


            var ISODATE = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/


            params = params.split(';')
            var vid  = params.shift().trim(),
                type = vid.split(':')[0],
                id   = vid.split(':')[1];

            let when = params.shift().trim();
                when = when.match(/\d{10}/) ? new Date(when + '000') : when ;
                when = ISODATE.test(when) ? new Date(when) : when ;

            var recur = typeof when === 'string' && when.match(/every/) ? true : false ; if(recur){ when = when.replace(/every/,'').trim() }

            if(type == 'ep'){
                if(!id.match(/,/)){
                    return this.sendMessage('[Scheduler] Command Syntax Error.');
                }
                id = id.split(',');
                if(id.length !== 2){
                    return this.sendMessage('[Scheduler] Command Syntax Error.');
                }
                var showcode = id.shift(),
                    episode = id.pop();
            }

            function callback(err,job){
                if(err){
                    return this.sendMessage('[Scheduler] An Error Occured:' + JSON.stringify(err));
                } else {
                    return this.sendMessage('[Scheduler] Playlist Action Scheduled.');
                }
            };

            if(type == 'ep'){
                return this.scheduler.createJob({
                    recur: recur, when: when, type: 'queueEpisode', info: { recur: recur, username: username, showcode: showcode, episode: episode }
                }, callback);
            } else {
                return this.scheduler.createJob({
                    recur: recur, when: when, type: 'queueMedia', info: { recur: recur, username: username, type: type, id: id }
                }, callback);
            }

    },(message)=>{
        this.sendPrivate(message, user);
    });

}

